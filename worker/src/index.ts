export interface Env {
  TDX_CLIENT_ID?: string;
  TDX_CLIENT_SECRET?: string;
}

// In-memory token cache across worker warm executions
let cachedToken: string | null = null;
let tokenExpireAt: number = 0;

// In-memory network-wide live board cache across worker warm executions
let networkLiveCache: { timestamp: number; data: any[] } | null = null;

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

/**
 * 全路網即時到離站快取聚合 (Global LiveBoard Cache)
 * 25 秒全網快取：1 分鐘至多發起 2~3 次 TDX 請求，永久免疫 429 速率限制 (基礎會員 5次/分 上限)
 */
async function getNetworkLiveBoard(env: Env): Promise<{ data: any[]; cached: boolean }> {
  const now = Date.now();
  if (networkLiveCache && now - networkLiveCache.timestamp < 25000) {
    return { data: networkLiveCache.data, cached: true };
  }

  const token = await getTDXToken(env);
  const tdxEndpoint = 'https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/LiveBoard/TRTC?$format=JSON';

  const res = await fetch(tdxEndpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    if (networkLiveCache) {
      return { data: networkLiveCache.data, cached: true };
    }
    const errorMsg = await res.text();
    throw new Error(`TDX API returned status ${res.status}: ${errorMsg}`);
  }

  const json = await res.json();
  const list = Array.isArray(json) ? json : [];
  networkLiveCache = { timestamp: now, data: list };
  return { data: list, cached: false };
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

    // 1. Health check endpoint: /health 或 /
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(
        JSON.stringify({
          status: 'online',
          service: 'metro-tdx-proxy',
          timestamp: new Date().toISOString(),
          hasCredentials: Boolean(env.TDX_CLIENT_ID && env.TDX_CLIENT_SECRET),
          cacheInfo: networkLiveCache
            ? {
                cachedAgeSeconds: Math.round((Date.now() - networkLiveCache.timestamp) / 1000),
                totalActiveTrains: networkLiveCache.data.length,
              }
            : null,
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // 2. 即時到站查詢端點: /api/live 或 /live (支援 ?stationId=G18 或無參數回傳全路網)
    if (url.pathname === '/api/live' || url.pathname === '/live') {
      const stationId = url.searchParams.get('stationId');

      try {
        const { data: allTrains, cached } = await getNetworkLiveBoard(env);

        let result = allTrains;
        if (stationId) {
          const code = stationId.toUpperCase();
          result = allTrains.filter(
            (item: any) => item.StationID?.toUpperCase() === code
          );
        }

        const headers = new Headers({
          ...CORS_HEADERS,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=20',
          'X-Cache-Status': cached ? 'HIT' : 'MISS',
          'X-Network-Active-Trains': String(allTrains.length),
        });

        return new Response(JSON.stringify(result), {
          status: 200,
          headers,
        });
      } catch (err: any) {
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch TDX live data',
            message: err?.message || String(err),
          }),
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
