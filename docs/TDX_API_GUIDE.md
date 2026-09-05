# TDX 運輸資料流通服務 API 申請與介接指南（基礎會員）

本指南詳細說明如何註冊交通部「**TDX 運輸資料流通服務**」、申請免費「**基礎會員**」金鑰，並於本專案（台北捷運時刻表與即時到站系統）中完成授權與資料介接。

---

## 📌 目錄
1. [方案比較：訪客模式 vs 基礎會員](#1-方案比較訪客模式-vs-基礎會員)
2. [訪客模式免費額度實測驗證](#2-訪客模式免費額度實測驗證)
3. [基礎會員申請步驟（詳細圖文流程）](#3-基礎會員申請步驟詳細圖文流程)
4. [OAuth 2.0 授權與 API 呼叫測試](#4-oauth-20-授權與-api-呼叫測試)
5. [於本專案中設定與啟用](#5-於本專案中設定與啟用)
6. [常見問題與錯誤排查](#6-常見問題與錯誤排查)

---

## 1. 方案比較：訪客模式 vs 基礎會員

| 項目 | 訪客模式 (Guest) | 基礎會員 (Basic Member) - 推薦 |
| :--- | :--- | :--- |
| **費用** | TWD 0 元 | **TWD 0 元 / 月**（完全免費） |
| **月虛擬點數** | 無（計次呼叫） | **3 點 / 月** |
| **存取頻率限制** | 每日至多 20 次 / IP | **5 次 / 分鐘 / 金鑰** |
| **存取方式** | **限瀏覽器存取**（需帶標準 User-Agent） | 支援程式端（curl、Python、Node.js、前端 Fetch） |
| **驗證機制** | 無需金鑰（依 Client IP 計次） | **OAuth 2.0 Client Credentials** |
| **適用範圍** | 僅限【基礎服務】特定開放端點 | 完整【基礎服務】及平台標準 API |
| **專案實務** | 僅能作為緊急備援或單次測試 | **適合個人專案、開源展示與定時同步腳本** |

---

## 2. 訪客模式免費額度實測驗證

若未登入平臺，TDX 提供訪客模式測試。**需特別注意**：TDX 閘道器針對非瀏覽器客戶端（如預設 `curl`）會返回 `401 Valid API Key Required`，發送請求時必須帶上 `User-Agent` 標頭模擬瀏覽器呼叫。

### 驗證指令 (Terminal / Bash)
```bash
curl -X 'GET' \
  'https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/StationTimeTable/TRTC?$top=1&$format=JSON' \
  -H 'accept: application/json' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
```

### 回傳資料結構分析（以頂埔站 BL01 為例）
```json
[
  {
    "RouteID": "BL",
    "LineID": "BL",
    "StationID": "BL01",
    "StationName": {
      "Zh_tw": "頂埔",
      "En": "Dingpu"
    },
    "Direction": 0,
    "DestinationStaionID": "BL23",
    "DestinationStationName": {
      "Zh_tw": "南港展覽館",
      "En": "Taipei Nangang Exhibition Center"
    },
    "Timetables": [
      { "Sequence": 1, "DepartureTime": "06:00", "TrainType": 0 },
      { "Sequence": 2, "DepartureTime": "06:07", "TrainType": 0 },
      { "Sequence": 3, "DepartureTime": "06:15", "TrainType": 0 },
      { "Sequence": 4, "DepartureTime": "06:20", "TrainType": 0 }
    ],
    "ServiceDay": {
      "ServiceTag": "平日",
      "Monday": true,
      "Tuesday": true,
      "Wednesday": true,
      "Thursday": true,
      "Friday": true,
      "Saturday": false,
      "Sunday": false,
      "NationalHolidays": false
    },
    "SrcUpdateTime": "2026-09-06T00:00:00+08:00",
    "UpdateTime": "2026-09-01T22:39:03+08:00",
    "VersionID": 38
  }
]
```
> **資料比對結論**：TDX 的 `VersionID: 38`（生效日 2026-08-30）與本專案從台北捷運官方 115.8.30 PDF 萃取的時刻表班次數量、發車時間 100% 吻合。

---

## 3. 基礎會員申請步驟（詳細圖文流程）

### 步驟 1：前往 TDX 平台並註冊會員
1. 開啟瀏覽器進入 [TDX 運輸資料流通服務官網](https://tdx.transportdata.tw/)。
2. 點擊右上角「**登入 / 註冊**」，切換至「**註冊新會員**」。
3. 輸入基本資料（電子信箱、姓名、設定密碼），送出後至信箱收信並完成驗證。

### 步驟 2：確認服務方案（基礎會員）
1. 註冊登入後，系統預設賦予「**基礎會員**」資格。
2. 方案內容包含：
   - **月租費用**：TWD 0 元/月
   - **虛擬點數**：3 點/月（每月初自動重置補充）
   - **呼叫速率**：5 次/分/金鑰
   - **無需綁定信用卡或繳費帳號**

### 步驟 3：進入會員專區取得服務金鑰 (API Keys)
1. 點擊右上角個人帳號，進入【**會員專區**】。
2. 在功能選單中點選【**資料服務**】➔【**服務金鑰**】。
3. 頁面中會顯示「**預設金鑰**」（亦可點選「**新增金鑰**」指定名稱如 `Taipei-Metro-App`）。
4. 妥善複製兩組憑據：
   - `Client ID`（客戶端 ID）
   - `Client Secret`（客戶端密鑰）

---

## 4. OAuth 2.0 授權與 API 呼叫測試

TDX 全面採用 **OAuth 2.0 Client Credentials Flow** 機制發行 Bearer Access Token。

### 步驟 4-1：以金鑰換取 Access Token

#### Terminal / cURL 指令：
```bash
curl -X POST 'https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=client_credentials&client_id=你的CLIENT_ID&client_secret=你的CLIENT_SECRET'
```

#### 成功回傳範例：
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "expires_in": 86400,
  "token_type": "Bearer"
}
```
*註：Access Token 有效期通常為 1 天（86400 秒），本專案前端會自動快取並於過期前重刷。*

### 步驟 4-2：攜帶 Token 查詢台北捷運時刻表
```bash
curl -X 'GET' \
  'https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/StationTimeTable/TRTC?$top=10&$format=JSON' \
  -H 'accept: application/json' \
  -H 'authorization: Bearer 剛剛取得的ACCESS_TOKEN'
```

### 步驟 4-3：於 TDX Swagger UI 介面授權測試
1. 開啟 [TDX 軌道基礎服務 Swagger 介面](https://tdx.transportdata.tw/api-service/swagger/basic/268fc230-2e04-471b-a728-a726167c1cfc#/)。
2. 點擊頁面右上方綠色的 **Authorize 🔓** 按鈕。
3. 在彈出的 `TDX (OAuth2, clientCredentials)` 視窗中：
   - **client_id**: 貼上你的 Client ID
   - **client_secret**: 貼上你的 Client Secret
4. 點擊 **Authorize**，狀態將變更為 Authorized。
5. 找到 `/v2/Rail/Metro/StationTimeTable/{RailSystem}`，點選 **Try it out**，填入 `RailSystem: TRTC`，點擊 **Execute** 即可直接取得資料。

---

## 5. 於本專案中設定與啟用

本專案的前端介面與更新腳本皆已內建 TDX 支援：

### 途徑 A：前端網頁設定（啟用即時到站看板）
1. 開啟本專案網頁（本地開發 `http://localhost:5173` 或 GitHub Pages）。
2. 點擊右上角的 **⚙️ 設定圖示** 開啟設定面板。
3. 勾選「**啟用 TDX 即時看板**」。
4. 依序填入你的：
   - **TDX Client ID**
   - **TDX Client Secret**
5. 點擊「**測試連線**」，系統會呼叫 OAuth 換證確認。顯示「✅ 連線成功」後點擊儲存。
6. 設定儲存於瀏覽器本地 `localStorage`，不會上傳至伺服器或存入 Git。

### 途徑 B：本機批次抓取腳本 (`scripts/fetch_tdx.py`)
若要使用 TDX 資料批次更新本地站點 JSON：
```bash
python3 scripts/fetch_tdx.py --client-id "你的CLIENT_ID" --client-secret "你的CLIENT_SECRET"
```

---

## 6. 常見問題與錯誤排查

### Q1: 出現 `401 Valid API Key Required`
- **原因**：使用未帶 Token 的訪客模式呼叫，且未攜帶瀏覽器 `User-Agent`，被 TDX 防火牆攔截。
- **解法**：在 cURL 加上 `-H 'User-Agent: Mozilla/5.0'`，或依步驟換取 OAuth Bearer Token 呼叫。

### Q2: 出現 `429 Too Many Requests`
- **原因**：基礎會員每分鐘存取頻率上限為 5 次。短時間內大量平行發送會觸發限流。
- **解法**：
  1. 前端已內建 15 秒節流防抖與 Token 本地快取。
  2. 離線批量腳本請設定 `time.sleep(0.5)` 間隔呼叫。

### Q3: 點數消耗完了怎麼辦？
- **說明**：基礎會員每月贈送 3 點，通常一般個人到站查詢或定時更新極為足夠；若每月點數用罄，每月 1 號系統會自動重新補滿 3 點。若需商用高頻率輪詢，可於平台升級至銅級或銀級會員。
