export interface Env {
  TDX_CLIENT_ID?: string;
  TDX_CLIENT_SECRET?: string;
}

// In-memory token cache across worker warm executions
let cachedToken: string | null = null;
let tokenExpireAt: number = 0;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 取得 TDX 存取權杖 (附帶本機記憶體快取與逾期續約機制)
 */
async function getTDXToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedToken && tokenExpireAt > now + 60000) {
    return cachedToken;
  }

  const clientId = env.TDX_CLIENT_ID;
  const clientSecret = env.TDX_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('TDX credentials not configured on Cloudflare Worker');
  }

  const authUrl = 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token';
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', clientId);
  params.append('client_secret', clientSecret);

  const res = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Failed to fetch TDX token: ${res.status} ${errorText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = data.access_token;
  tokenExpireAt = now + (data.expires_in || 3600) * 1000;

  return cachedToken;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 處理 CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: CORS_HEADERS,
      });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Health check endpoint
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'online',
          service: 'metro-tdx-proxy',
          timestamp: new Date().toISOString(),
          hasCredentials: Boolean(env.TDX_CLIENT_ID && env.TDX_CLIENT_SECRET),
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // 即時到站查詢端點: /api/live?stationId=G18 或 /live?stationId=G18
    if (url.pathname === '/api/live' || url.pathname === '/live') {
      const stationId = url.searchParams.get('stationId');

      if (!stationId) {
        return new Response(JSON.stringify({ error: 'Missing required parameter: stationId' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // 輸入格式防禦 (如: R01, BL12, G18, Y14)
      if (!/^[A-Za-z0-9_]{2,10}$/.test(stationId)) {
        return new Response(JSON.stringify({ error: 'Invalid stationId format' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // 【策略 B：全域快取聚合 Worker】檢查 Cloudflare caches.default
      const cache = (caches as any).default;
      const normalizedUrl = new URL(request.url);
      normalizedUrl.searchParams.set('stationId', stationId.toUpperCase());
      const cacheKey = new Request(normalizedUrl.toString(), request);

      try {
        const cachedRes = await cache.match(cacheKey);
        if (cachedRes) {
          const headers = new Headers(cachedRes.headers);
          headers.set('CF-Cache-Status', 'HIT');
          for (const [k, v] of Object.entries(CORS_HEADERS)) {
            headers.set(k, v);
          }
          return new Response(cachedRes.body, {
            status: cachedRes.status,
            headers,
          });
        }
      } catch (e) {
        // 快取查詢若異常則靜默 fallback 繼續發起請求
      }

      try {
        const token = await getTDXToken(env);
        const tdxEndpoint = `https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/LiveBoard/TRTC?$filter=StationID eq '${encodeURIComponent(
          stationId.toUpperCase()
        )}'&$format=JSON`;

        const tdxRes = await fetch(tdxEndpoint, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (!tdxRes.ok) {
          const errorMsg = await tdxRes.text();
          return new Response(
            JSON.stringify({ error: `TDX API returned status ${tdxRes.status}`, details: errorMsg }),
            {
              status: tdxRes.status,
              headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
            }
          );
        }

        const data = await tdxRes.json();

        // 嚴格遵守 TDX 基礎會員 5次/分/金鑰 上限：設定 60 秒邊緣快取 TTL
        const responseToCache = new Response(JSON.stringify(data), {
          status: 200,
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'public, max-age=60, s-maxage=60',
            'CF-Cache-Status': 'MISS',
          },
        });

        try {
          await cache.put(cacheKey, responseToCache.clone());
        } catch (e) {
          // 寫入快取錯誤不影響即時回傳
        }

        return responseToCache;
      } catch (err: any) {
        return new Response(
          JSON.stringify({ error: 'Internal edge proxy error', message: err?.message || String(err) }),
          {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};
