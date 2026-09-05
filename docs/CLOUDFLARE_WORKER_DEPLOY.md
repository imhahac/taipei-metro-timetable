# Cloudflare Workers & TDX 邊緣代理部署指南

本指南詳述如何將 TDX 即時到站代理（`worker/`）部署至 Cloudflare Workers，並透過 GitHub Actions 實現完全自動化部署。此架構確保 **TDX Client ID 與 Client Secret 永遠保留在雲端環境變數中，前端完全不暴露任何金鑰**。

---

## 一、架構運作原理

```
[使用者瀏覽器] 
       │ 
       │ GET /api/live?stationId=G18 (零金鑰、無憑證)
       ▼
[Cloudflare Worker: metro-tdx-proxy]
       │ 
       ├─ 1. 記憶體快取 TDX Token (過期前自動續約)
       ├─ 2. 注入 Worker Secrets: TDX_CLIENT_ID / TDX_CLIENT_SECRET
       ├─ 3. 設定 CORS (Access-Control-Allow-Origin: *)
       ├─ 4. 設定 Edge Cache: max-age=15 (防高頻率請求打穿)
       ▼
[交通部 TDX 平台 TRTC LiveBoard API]
```

---

## 二、步驟一：準備 Cloudflare 帳號與憑證

1. 登入 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 取得 **Account ID**：
   - 在右側側邊欄或網址列中可查看您的 `Account ID`（例如 `32位字元十六進位碼`）。
3. 建立 **Cloudflare API Token**：
   - 點擊右上角個人頭像 -> **My Profile** -> **API Tokens**。
   - 點擊 **Create Token** -> 選擇 **Edit Cloudflare Workers** 範本。
   - 確認權限包含：
     - `Account` - `Workers Scripts: Edit`
     - `Account` - `Account Settings: Read`
   - 點擊 **Continue to summary** -> **Create Token**。
   - **複製並妥善保存該 API Token**（此 Token 只會顯示一次）。

---

## 三、步驟二：在 GitHub 倉庫設定 Secrets 與 Variables

進入您的 GitHub Repository 頁面：`Settings` -> `Secrets and variables` -> `Actions`。

### 1. Repository Secrets (敏感金鑰)
點擊 **New repository secret**，新增下列 4 個 Secrets：

| Secret 名稱 | 說明 | 範例值 |
| :--- | :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | 步驟一所取得之 Cloudflare API Token | `v1.0-xxxx-xxxx...` |
| `CLOUDFLARE_ACCOUNT_ID` | 您的 Cloudflare Account ID | `9a8b7c6d5e...` |
| `TDX_CLIENT_ID` | 交通部 TDX 平台核發之 Client ID (選填，未填時僅部署 Worker 骨架) | `your-tdx-client-id` |
| `TDX_CLIENT_SECRET` | 交通部 TDX 平台核發之 Client Secret (選填) | `your-tdx-client-secret` |

> 💡 **自動容錯機制**：工作流已實作條件判斷，若尚未在 GitHub Secrets 設定 `TDX_CLIENT_ID`，Worker 依然會成功發布並提供 `/health` 健康檢查，不會中斷 Pipeline。

### 2. Repository Variables (非敏感環境變數 - 前端注入)
切換至 **Variables** 標籤，點擊 **New repository variable**：

| Variable 名稱 | 說明 | 範例值 |
| :--- | :--- | :--- |
| `VITE_TDX_WORKER_URL` | Worker 部署完成後之網址 | `https://metro-tdx-proxy.<your-subdomain>.workers.dev` |

> 註：若首次部署尚未知道 Worker 網址，可先完成步驟三 Worker 部署後再填入此 Variable。

---

## 四、步驟三：執行自動化部署

### 途徑 A：透過 GitHub Actions 自動部署 (推薦)
1. 當您推播變更至 `main` 分支中的 `worker/**` 目錄時，GitHub Actions 會自動觸發 `.github/workflows/deploy-worker.yml`。
2. 您亦可在 GitHub 倉庫的 **Actions** 頁籤中，手動點選 **Deploy TDX Proxy Worker to Cloudflare** -> **Run workflow**。
3. 部署成功後，Wrangler 會在 Log 中印出 Worker URL，例如：
   ```
   Published metro-tdx-proxy (https://metro-tdx-proxy.your-name.workers.dev)
   ```

### 途徑 B：本機透過 Wrangler CLI 快速手動部署
若您習慣本機命令列，亦可直接執行：
```bash
cd worker
npm install

# 登入 Cloudflare
npx wrangler login

# 設定 TDX 金鑰至 Cloudflare Worker 遠端環境
npx wrangler secret put TDX_CLIENT_ID
npx wrangler secret put TDX_CLIENT_SECRET

# 發布部署
npm run deploy
```

---

## 五、步驟四：前端連線與驗證

1. **驗證 Worker 服務健康狀態**：
   開啟瀏覽器訪問：
   ```
   https://metro-tdx-proxy.your-name.workers.dev/health
   ```
   預期回傳：
   ```json
   {
     "status": "online",
     "service": "metro-tdx-proxy",
     "hasCredentials": true
   }
   ```

2. **驗證即時到站查詢**：
   - **全網列車查詢**：訪問 `https://metro-tdx-proxy.your-name.workers.dev/api/live`，預期回傳全路網當前所有進站/停靠月台之列車清單（約 20~40 筆）。
   - **單站查詢 (如 G18 南京三民)**：訪問 `https://metro-tdx-proxy.your-name.workers.dev/api/live?stationId=G18`。
     > ⚠️ **北捷開放資料特性說明**：臺北捷運公司提供的 `LiveBoard` 資料定義為「列車進站停靠通知（`EstimateTime: 0`）」，並無區間行駛預估秒數。當月台當下無列車停靠時，回傳 `[]`（空陣列）為正常物理現象；系統會自動無縫切換以官方時刻表精準推算發車時間。

3. **前端自動注入**：
   當 GitHub Actions 執行前端網站部署時，會自動帶入 `VITE_TDX_WORKER_URL`，網站打開即可看見「⚡ Worker 即時動態」。使用者亦可在網頁右上方「系統設定」彈窗中自由檢視或自訂 Worker 網址。
