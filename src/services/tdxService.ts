/**
 * 零金鑰純靜態架構與 TDX 雙軌即時動態服務 (Dual-Engine TDX LiveBoard)
 *
 * 軌道 A (邊緣代理模式)：若配置 VITE_TDX_WORKER_URL 或於本機設定 Worker URL，
 *         透過 Cloudflare Worker 全域 60 秒快取聚合與金鑰隔離，支援高頻自動輪詢。
 * 軌道 B (訪客直連模式 - 預設)：未配置 Worker 時，自動切換為 TDX OpenAPI 官方訪客免金鑰直連模式。
 *         利用 TDX 官方 Access-Control-Allow-Origin: * 與每個 IP 每日 20 次免密碼額度，
 *         實施 45 秒本機防抖快取與按需手動刷新，100% 零伺服器、零金鑰。
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

const LOCAL_STORAGE_WORKER_KEY = 'metro_worker_proxy_url';

let guestQuotaRemaining: number | null = null;
const memoryCache: Record<string, { timestamp: number; data: TDXLiveItem[] }> = {};

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

/**
 * 當前運作模式：'worker' (邊緣代理) 或 'guest' (官方訪客免密直連)
 */
export function getLiveBoardMode(): 'worker' | 'guest' {
  return getEffectiveWorkerUrl() ? 'worker' : 'guest';
}

function getTodayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 取得 TDX 訪客模式今日剩餘額度 (每日最高 20 次/IP)
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
 * 查詢實體列車即時到站動態
 * 支援雙軌模式：優先走 Worker 代理；未配置時自動平滑切換至 TDX 訪客免金鑰直連
 *
 * @param stationId 車站代碼 (如 G18, R01, BL12, BR02)
 * @param forceRefresh 是否略過 45s 本機記憶體快取強制發起新請求
 */
export async function fetchLiveBoard(
  stationId: string,
  forceRefresh: boolean = false
): Promise<TDXLiveItem[] | null> {
  const code = stationId.toUpperCase();
  const now = Date.now();
  const mode = getLiveBoardMode();

  // 1. 本機防抖快取檢查 (訪客模式 45s / Worker 模式 20s)
  const ttl = mode === 'guest' ? 45000 : 20000;
  if (!forceRefresh && memoryCache[code] && now - memoryCache[code].timestamp < ttl) {
    return memoryCache[code].data.length > 0 ? memoryCache[code].data : null;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5 秒超時保護

  try {
    let url: string;
    let headers: Record<string, string> = { Accept: 'application/json' };

    if (mode === 'worker') {
      // 軌道 A：Cloudflare Worker 代理模式
      const base = getEffectiveWorkerUrl().endsWith('/')
        ? getEffectiveWorkerUrl().slice(0, -1)
        : getEffectiveWorkerUrl();
      url = `${base}/api/live?stationId=${encodeURIComponent(code)}`;
    } else {
      // 軌道 B：TDX 訪客免密碼直連模式 (每個 IP 每日至多 20 次)
      url = `https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/LiveBoard/TRTC?$filter=StationID%20eq%20'${encodeURIComponent(
        code
      )}'&$format=JSON`;
    }

    const res = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    // 解析訪客額度資訊 (如 x-ratelimit-remaining-day)
    if (mode === 'guest') {
      const remainingHeader = res.headers.get('x-ratelimit-remaining-day') || res.headers.get('ratelimit-remaining');
      if (remainingHeader) {
        guestQuotaRemaining = parseInt(remainingHeader, 10);
      } else {
        const current = getGuestRemainingQuota() ?? 20;
        guestQuotaRemaining = Math.max(0, current - 1);
      }
      try {
        localStorage.setItem(`tdx_guest_remaining_${getTodayKey()}`, String(guestQuotaRemaining));
      } catch (e) {
        // 靜默處理
      }
    }

    if (!res.ok) {
      if (res.status === 429) {
        guestQuotaRemaining = 0;
        try {
          localStorage.setItem(`tdx_guest_remaining_${getTodayKey()}`, '0');
        } catch (e) {
          // 靜默處理
        }
      }
      return null;
    }

    const data = (await res.json()) as TDXLiveItem[];
    if (Array.isArray(data)) {
      memoryCache[code] = { timestamp: now, data };
      return data.length > 0 ? data : null;
    }
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}
