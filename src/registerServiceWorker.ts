/**
 * 註冊 Service Worker 並管理離線快取生命週期
 */
export function registerServiceWorker(): void {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      const swUrl = `${import.meta.env.BASE_URL}sw.js`;
      navigator.serviceWorker
        .register(swUrl)
        .then((reg) => {
          console.log('[PWA] Service Worker registered with scope:', reg.scope);

          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('[PWA] New content available; please refresh.');
                  } else {
                    console.log('[PWA] Content cached for offline use.');
                  }
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[PWA] Service Worker registration failed:', err);
        });
    });
  }
}

/**
 * 檢查當前本機 CacheStorage 的快取項目數量
 */
export async function getCacheItemCount(): Promise<number> {
  if (!('caches' in window)) return 0;
  try {
    const keys = await caches.keys();
    let total = 0;
    for (const key of keys) {
      if (key.startsWith('taipei-metro')) {
        const cache = await caches.open(key);
        const reqs = await cache.keys();
        total += reqs.length;
      }
    }
    return total;
  } catch {
    return 0;
  }
}
