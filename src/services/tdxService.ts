/**
 * 零金鑰純靜態架構與 TDX 雙軌即時動態服務 (IP 額度優先 + OAuth2 429 自動容錯轉發)
 *
 * 軌道 1 (預設 - TDX 官方來源 IP 免密直連)：
 *         依照 TDX 官方規範（限制每個呼叫來源端 IP 每日存取至多 20 次），
 *         預設直接由使用者瀏覽器端 IP 發起請求，免金鑰、100% 官方直通。
 *
 * 軌道 2 (升級 - OAuth2 clientCredentials 邊緣代理)：
 *         當來源端 IP 每日 20 次額度用罄觸發 HTTP 429 時，系統自動無縫升級，
 *         轉由配置了 TDX client_id / client_secret 之 Cloudflare Worker (OAuth2 模式) 接續請求，
 *         並解鎖全域 25 秒快取與平穩輪詢。
 */

export interface TDXLiveItem {
  StationID: string;
  LineID: string;
  TripHeadSign: string;
  DestinationStationID: string;
  DestinationStationName: { Zh_tw: string };
  EstimateTime: number; // 到站剩餘秒數 (0: 列車進站中, >0: 預估秒數)
  SrcUpdateTime: string;
}

export interface LiveBoardResult {
  items: TDXLiveItem[] | null;
  activeEngine: 'guest' | 'worker';
  guestQuota: number | null;
  isFallback: boolean; // 是否為遇到 429 後自動升級為 Worker
}

const LOCAL_STORAGE_WORKER_KEY = 'metro_worker_proxy_url';

let guestQuotaRemaining: number | null = null;
let currentSessionEngine: 'guest' | 'worker' = 'guest';

const memoryCache: Record<string, { timestamp: number; data: TDXLiveItem[]; engine: 'guest' | 'worker' }> = {};

/**
 * 取得當前有效的 Worker 網址
 */
export function getEffectiveWorkerUrl(): string {
  try {
    const local = localStorage.getItem(LOCAL_STORAGE_WORKER_KEY);
    if (local && local.trim()) return local.trim();
  } catch (e) {
    // 靜默處理
  }
  return (import.meta.env.VITE_TDX_WORKER_URL || '').trim();
}

/**
 * 儲存本機自訂 Worker 網址
 */
export function saveCustomWorkerUrl(url: string): void {
  try {
    if (!url.trim()) {
      localStorage.removeItem(LOCAL_STORAGE_WORKER_KEY);
    } else {
      localStorage.setItem(LOCAL_STORAGE_WORKER_KEY, url.trim());
    }
  } catch (e) {
    console.error(e);
  }
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 取得 TDX 訪客模式今日剩餘額度 (每個呼叫來源端 IP 每日存取至多 20 次)
 */
export function getGuestRemainingQuota(): number | null {
  if (guestQuotaRemaining !== null) return guestQuotaRemaining;
  try {
    const today = getTodayKey();
    const stored = localStorage.getItem(`tdx_guest_remaining_${today}`);
    if (stored !== null) {
      guestQuotaRemaining = parseInt(stored, 10);
      return guestQuotaRemaining;
    }
  } catch (e) {
    // 靜默處理
  }
  return null;
}

/**
 * 當前運作引擎：優先查看當日是否已因 429 切換為 Worker
 */
export function getLiveBoardMode(): 'worker' | 'guest' {
  const quota = getGuestRemainingQuota();
  if (quota === 0 && getEffectiveWorkerUrl()) {
    return 'worker';
  }
  return currentSessionEngine;
}

/**
 * 透過 Cloudflare Worker (OAuth2 clientCredentials) 取得即時動態
 */
async function fetchFromWorker(code: string): Promise<TDXLiveItem[] | null> {
  const workerUrl = getEffectiveWorkerUrl();
  if (!workerUrl) return null;

  const base = workerUrl.endsWith('/') ? workerUrl.slice(0, -1) : workerUrl;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`${base}/api/live?stationId=${encodeURIComponent(code)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = (await res.json()) as TDXLiveItem[];
    return Array.isArray(data) ? data : null;
  } catch (e) {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * 透過 TDX 官方來源端 IP 訪客直連（每日至多 20 次）
 */
async function fetchFromGuest(code: string): Promise<{
  items: TDXLiveItem[] | null;
  is429: boolean;
  remaining: number | null;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  const url = `https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/LiveBoard/TRTC?$filter=StationID%20eq%20'${encodeURIComponent(
    code
  )}'&$format=JSON`;

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);

    const remainingHeader =
      res.headers.get('x-ratelimit-remaining-day') || res.headers.get('ratelimit-remaining');
    let remaining: number | null = null;
    if (remainingHeader) {
      remaining = parseInt(remainingHeader, 10);
    } else if (res.ok) {
      const current = getGuestRemainingQuota() ?? 20;
      remaining = Math.max(0, current - 1);
    }

    if (res.status === 429) {
      return { items: null, is429: true, remaining: 0 };
    }

    if (!res.ok) {
      return { items: null, is429: false, remaining };
    }

    const data = (await res.json()) as TDXLiveItem[];
    return { items: Array.isArray(data) ? data : [], is429: false, remaining };
  } catch (e) {
    clearTimeout(timeoutId);
    return { items: null, is429: false, remaining: null };
  }
}

/**
 * 查詢實體列車即時到站動態 (核心策略：預設使用來源端 IP 額度，出現 429 自動切換 OAuth2 clientCredentials 呼叫)
 *
 * @param stationId 車站代碼 (如 G18, R01, BL12, BR02)
 * @param forceRefresh 是否強制發起新請求
 */
export async function fetchLiveBoardWithEngine(
  stationId: string,
  forceRefresh: boolean = false
): Promise<LiveBoardResult> {
  const code = stationId.toUpperCase();
  const now = Date.now();
  const currentQuota = getGuestRemainingQuota();

  // 1. 本機防抖記憶體快取檢查
  const cached = memoryCache[code];
  const ttl = cached?.engine === 'worker' ? 20000 : 45000;
  if (!forceRefresh && cached && now - cached.timestamp < ttl) {
    return {
      items: cached.data,
      activeEngine: cached.engine,
      guestQuota: currentQuota,
      isFallback: cached.engine === 'worker' && currentQuota === 0,
    };
  }

  // 2. 判斷是否今日 IP 額度已用罄 (429 狀態)
  const isQuotaExhausted = currentQuota === 0;

  if (isQuotaExhausted) {
    // 今日來源端 IP 額度已用盡，嘗試使用第二順位：OAuth2 clientCredentials (Worker 代理)
    const workerItems = await fetchFromWorker(code);
    if (workerItems !== null) {
      currentSessionEngine = 'worker';
      memoryCache[code] = { timestamp: now, data: workerItems, engine: 'worker' };
      return {
        items: workerItems,
        activeEngine: 'worker',
        guestQuota: 0,
        isFallback: true,
      };
    }
    // Worker 亦不可用，降級為離線班表
    return {
      items: null,
      activeEngine: 'guest',
      guestQuota: 0,
      isFallback: false,
    };
  }

  // 3. 第一順位：預設先使用來源端 IP 額度 (訪客免密直連)
  const guestResult = await fetchFromGuest(code);

  if (guestResult.remaining !== null) {
    guestQuotaRemaining = guestResult.remaining;
    try {
      localStorage.setItem(`tdx_guest_remaining_${getTodayKey()}`, String(guestResult.remaining));
    } catch (e) {
      // 靜默處理
    }
  }

  // 4. 若出現 429 (來源端 IP 每日 20 次或每分鐘超額)，嘗試自動切換至 OAuth2 clientCredentials Worker
  if (guestResult.is429) {
    guestQuotaRemaining = 0;
    try {
      localStorage.setItem(`tdx_guest_remaining_${getTodayKey()}`, '0');
    } catch (e) {
      // 靜默處理
    }

    const workerItems = await fetchFromWorker(code);
    if (workerItems !== null) {
      currentSessionEngine = 'worker';
      memoryCache[code] = { timestamp: now, data: workerItems, engine: 'worker' };
      return {
        items: workerItems,
        activeEngine: 'worker',
        guestQuota: 0,
        isFallback: true,
      };
    }

    return {
      items: null,
      activeEngine: 'guest',
      guestQuota: 0,
      isFallback: false,
    };
  }

  // 5. 訪客直連正常回傳
  if (guestResult.items !== null) {
    currentSessionEngine = 'guest';
    memoryCache[code] = { timestamp: now, data: guestResult.items, engine: 'guest' };
    return {
      items: guestResult.items,
      activeEngine: 'guest',
      guestQuota: guestResult.remaining ?? getGuestRemainingQuota(),
      isFallback: false,
    };
  }

  return {
    items: null,
    activeEngine: 'guest',
    guestQuota: guestResult.remaining ?? getGuestRemainingQuota(),
    isFallback: false,
  };
}

/**
 * 相容舊介面
 */
export async function fetchLiveBoard(
  stationId: string,
  forceRefresh: boolean = false
): Promise<TDXLiveItem[] | null> {
  const result = await fetchLiveBoardWithEngine(stationId, forceRefresh);
  return result.items;
}
