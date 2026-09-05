/**
 * 零金鑰純靜態架構與 Cloudflare Workers 邊緣代理即時車況服務
 *
 * 1. 預設模式：零金鑰純靜態（Zero-Key Static）。所有時刻表與到站預估由本機 JSON 計算。
 * 2. 邊緣代理模式：若注入環境變數 VITE_TDX_WORKER_URL 或於設定中配置 Worker URL，
 *    系統將以 3 秒超時背景向 Cloudflare Worker 查詢實體列車即時到站 (LiveBoard)。
 *    TDX Client ID 與 Secret 均保存在 Cloudflare 端，前端絕對零憑證。
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

/**
 * 取得當前有效的 Worker 網址
 * 優先序：本機覆寫 > 建置環境變數 VITE_TDX_WORKER_URL
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
 * 向 Cloudflare Worker 查詢即時列車到站動態
 * @param stationId 車站編號 (如 G18, R01, BL12)
 * @returns TDXLiveItem[] 或 null (失敗/逾時/未配置時平滑降級)
 */
export async function fetchLiveBoard(stationId: string): Promise<TDXLiveItem[] | null> {
  const workerBase = getEffectiveWorkerUrl();
  if (!workerBase) return null;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 嚴格 3 秒超時保護

  try {
    // 清理網址斜線
    const base = workerBase.endsWith('/') ? workerBase.slice(0, -1) : workerBase;
    const url = `${base}/api/live?stationId=${encodeURIComponent(stationId.toUpperCase())}`;

    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = (await res.json()) as TDXLiveItem[];
    if (Array.isArray(data) && data.length > 0) {
      return data;
    }
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    // 網路斷線或超時皆靜默降級為靜態班表
    return null;
  }
}
