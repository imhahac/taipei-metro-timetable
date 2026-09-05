const CACHE_NAME = 'taipei-metro-v2';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './metro.svg',
  './data/network_meta.json',
  './data/StationList.json',
  './data/lines/R.json',
  './data/lines/BL.json',
  './data/lines/G.json',
  './data/lines/O.json',
  './data/lines/Y.json',
  './data/lines/BR.json',
];

// Service Worker 安裝階段：預載 App Shell 與全路網 134 站時刻表
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // 1. 預載核心靜態檔案
      try {
        await cache.addAll(CORE_ASSETS);
      } catch (err) {
        console.warn('[SW] Core assets precache partial error:', err);
      }

      // 2. 動態預載全路網 134 站時刻表 JSON
      try {
        const metaRes = await fetch('./data/network_meta.json');
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta && meta.stations) {
            const stationCodes = Object.keys(meta.stations);
            const stationUrls = stationCodes.map((code) => `./data/stations/${code}.json`);
            // 分批寫入快取，避免同時發起 134 個並行請求過度占用頻寬
            const chunkSize = 20;
            for (let i = 0; i < stationUrls.length; i += chunkSize) {
              const chunk = stationUrls.slice(i, i + chunkSize);
              await Promise.allSettled(
                chunk.map(async (url) => {
                  try {
                    const res = await fetch(url);
                    if (res.ok) await cache.put(url, res);
                  } catch (e) {
                    // 靜默容錯
                  }
                })
              );
            }
            console.log(`[SW] Successfully pre-cached ${stationCodes.length} station timetables.`);
          }
        }
      } catch (err) {
        console.warn('[SW] Stations precache error:', err);
      }

      return self.skipWaiting();
    })()
  );
});

// 啟用階段：清除舊快取並立即接管所有頁面
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing legacy cache:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// 請求攔截階段
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 非 GET 請求或即時到站 API (LiveBoard) 不走靜態快取
  if (req.method !== 'GET' || url.pathname.includes('/api/live') || url.pathname.includes('/live')) {
    return;
  }

  // 靜態資產與 JSON 時刻表採 Stale-While-Revalidate
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(req);

      // 背景發起網路請求進行快取更新
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
            cache.put(req, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      // 若快取命中則立即秒速回傳（支援地下無信號秒開），無快取則等待網路
      return cachedResponse || (await fetchPromise) || new Response('Offline', { status: 503 });
    })()
  );
});
