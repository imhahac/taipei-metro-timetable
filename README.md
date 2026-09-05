# 台北捷運時刻表 (Taipei Metro Timetable)

[![Deploy to GitHub Pages](https://github.com/imhahac/taipei-metro-timetable/actions/workflows/deploy.yml/badge.svg)](https://github.com/imhahac/taipei-metro-timetable/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Open Data](https://img.shields.io/badge/Data-Open%20Data%20(OGDL)-blue.svg)](https://data.gov.tw/license)

現代化、專業鐵道看板排版且具備即時到站查詢的「**台北捷運時刻表開放資料與查詢系統**」。  
全站採用純靜態架構，支援 100% 離線秒查、全路網 115.8.30 最新時刻表、底線區間車精確標記、日本東京地下鐵風格「點選車次查詢沿線各站到站時間」、全向量互動捷運路網圖及完整開源資料集。

---

## 🌐 線上展示與特性

- **GitHub Pages 部署網址**：`https://imhahac.github.io/taipei-metro-timetable/`
- **車站看板視覺設計 (Station Board UI)**：
  - 參照實體車站時刻看板之方格網格設計，提供高對比淺色（紙質風格）與深色（控制盤風格）雙主題。
  - 時間數字採用等寬字體對齊（`tabular-nums`），確保多欄排版垂直齊平。
- **車次停靠站時間軸 (Train Stop Timeline)**：
  - 參考日本東京地下鐵（Tokyo Metro）站點查詢介面，點選任意車次即可展開沿線軌道時間軸。
  - 完整顯示該車次沿途停靠各站之預估到站時刻、始發站、終點站與轉乘路線代碼。
- **區間車底線識別 (Shuttle Train Detection)**：
  - 解析 PDF 向量圖元（高 < 1pt 之 `LTRect` 底線物件），識別官方時刻表標記之區間車（如往台電大樓、大安、北投、亞東醫院、蘆洲支線）。
- **靜態離線架構 (Static Architecture)**：
  - 全站由結構化 JSON 資料驅動，無後端伺服器依賴，支援 GitHub Pages 高速存取與離線查詢。

---

## 📊 開放資料說明 (Open Data Specifications)

本專案致力於促進公共運輸資訊之透明化與結構化應用，整理並釋出台北捷運全路網乾淨、規格化之 JSON 資料集，歡迎各界開發者自由引用。

### 1. 資料來源聲明 (Data Sources & Attribution)

本系統所使用之原始時刻資料，採集自以下公開管道，依據相關開放授權規範進行標示：

| 資料類型 | 提供單位 / 來源平台 | 資料版本 / 格式 |
| :--- | :--- | :--- |
| **官方月台時刻表** | [臺北大眾捷運股份有限公司 (TRTC)](https://www.metro.taipei/) | **民國 115 年 8 月 30 日（2026-08-30）** 最新改點版 PDF（高運量 R、BL、G、O 線） |
| **文湖線動態營運說明** | [臺北大眾捷運股份有限公司 (TRTC)](https://www.metro.taipei/) | 全自動無人駕駛中運量系統（官方無固定分秒時刻表），本系統依官方公告班距（尖峰 2~4 分、離峰 4~7 分）推估，到站倒數優先以 TDX 實體動態為準 |
| **新北捷運環狀線時刻表** | [新北捷運股份有限公司 (NTMetro)](https://www.ntmetro.com.tw/) | **民國 114 年 1 月 20 日** 環狀線全日時刻表（大坪林 ⇋ 新北產業園區） |
| **路網與即時動態** | [交通部 TDX 運輸資料流通服務平臺](https://tdx.transportdata.tw/) | `MetroApi_StationTimeTable_2104` 結構化 OpenAPI（詳見 [TDX 基礎會員申請指南](docs/TDX_API_GUIDE.md)） |
| **站別時刻資料服務** | [臺北市政府資料大平臺 (Data.Taipei)](https://data.taipei/) | 台北捷運站別發車時刻資料集 |
| **架構啟發與致敬** | [Eric Yu 台北捷運時刻表專案](https://ericyu.org/TaipeiMetroTime/) | [TaipeiMetroTimeTableParser](https://github.com/ericyu/TaipeiMetroTimeTableParser) 底線偵測演算法設計 |

### 2. 開放資料集目錄結構 (`public/data/`)

所有開放資料集均放置於靜態公開目錄，前端或第三方爬蟲可直接透過 HTTP GET 獲取：

```text
public/data/
├── stations/                   # 單站 24 小時出發時刻表 (96+ 站)
│   ├── G18.json                # 松山新店線 - 南京三民站
│   ├── BL12.json               # 板南線 - 台北車站
│   ├── R10.json                # 淡水信義線 - 台北車站
│   └── ...
├── lines/                      # 全線實體車次串接時刻表 (支援沿線到站時間查詢)
│   ├── R.json                  # 淡水信義線 (淡水 ⇋ 廣慈/奉天宮/大安)
│   ├── BL.json                 # 板南線 (南港展覽館 ⇋ 頂埔/亞東醫院)
│   ├── G.json                  # 松山新店線 (松山 ⇋ 新店/台電大樓)
│   └── O.json                  # 中和新蘆線 (蘆洲/迴龍 ⇋ 南勢角)
└── network_meta.json           # 全路網中繼資料 (路線代碼、色彩代碼、車站對照、轉乘資訊)
```

### 3. 資料欄位規格範例

#### 車站時刻資料 (`public/data/stations/G18.json`)
```json
{
  "StationName": "南京三民",
  "StationCode": "G18",
  "Timetables": [
    {
      "Direction": "往G01新店站",
      "DirectionCode": 1,
      "DestinationNotice": "加註底線為往台電大樓站區間車",
      "EffectiveFrom": "2026-08-30",
      "Schedule": [
        {
          "Days": "1,2,3,4,5",
          "Departures": [
            { "Time": "06:03", "Dst": "新店", "IsShuttle": false },
            { "Time": "07:28", "Dst": "台電大樓", "IsShuttle": true }
          ]
        }
      ]
    }
  ]
}
```

#### 路線車次串接資料 (`public/data/lines/G.json`)
```json
{
  "Direction": "往新店/台電大樓",
  "DirectionCode": 1,
  "EffectiveFrom": "2026-08-30",
  "Timetables": [
    {
      "Days": "1,2,3,4,5",
      "Trains": [
        {
          "Dst": "新店",
          "Schedule": [
            { "StationCode": "G19", "DepTime": "06:00" },
            { "StationCode": "G18", "DepTime": "06:03" },
            { "StationCode": "G17", "DepTime": "06:05" },
            { "StationCode": "G01", "DepTime": "06:37" }
          ]
        }
      ]
    }
  ]
}
```

---

## 📁 專案分類歸檔架構

```text
taipei-metro-timetable/
├── .devcontainer/              # Dev Container 開發環境設定 (Node 22 + Python 3.11)
├── .github/workflows/          # GitHub Actions 自動部屬 CI/CD 工作流
├── docs/                       # 技術規格與 API 介接指南
│   └── TDX_API_GUIDE.md        # TDX 基礎會員申請與 OpenAPI 介接手冊
├── public/
│   ├── data/                   # 結構化開放資料集 (stations, lines, network_meta.json)
│   ├── pdfs/                   # 115.8.30 官方原始月台 PDF 歸檔
│   │   ├── 淡水信義線/         # 45 份 PDF
│   │   ├── 板南線/             # 42 份 PDF
│   │   ├── 松山新店線/         # 48 份 PDF
│   │   └── 中和新蘆線/         # 51 份 PDF
│   └── metro.svg               # 全向量互動捷運路網圖
├── scripts/                    # 資料處理與自動化管線
│   ├── update_all_lines_from_pdfs.py # 全網 PDF 解析與車次串接主程式
│   ├── TimeTableParser.py      # PDF 幾何字元座標與底線偵測核心模組
│   ├── StationList.json        # 內部工程 3 碼 ID 與捷運營運代碼對照表
│   ├── fetch_tdx.py            # TDX OpenAPI 下載工具
│   ├── generate_network_data.py # 路網元資料建置工具
│   └── legacy/                 # 原型與單線歷史腳本封存
├── src/
│   ├── components/             # React 視圖組件 (StationBoard, TrainStopModal, MetroMap 等)
│   ├── services/               # 業務引擎 (trainRouteService, timetableEngine)
│   ├── styles/                 # 專業鐵路樣式 (metro-theme.css, index.css)
│   ├── types/                  # TypeScript 型別定義
│   └── App.tsx                 # 主應用程式
└── package.json
```

---

## 🛠 本機開發與 Dev Container (MacOS + OrbStack)

本專案支援 **MacOS + OrbStack** 及 Dev Container 一鍵環境建立：

### 1. 透過 Dev Container（推薦）
1. 在 macOS 背景執行 OrbStack（或 Docker Desktop）。
2. 在 VS Code / Cursor 按下 `Cmd + Shift + P`。
3. 選擇 **`Dev Containers: Reopen in Container`**。
4. 容器啟動後自動安裝 Node 22 與 Python 依賴，零手動配置。

### 2. 測試指令 (Testing Pipeline)
```bash
npm run test:all    # 一鍵全套測試：驗證前端 Build、單元測試與 186 份 PDF 解析管線
npm run test:build  # 驗證 TypeScript 型別與 Vite 生產打包
npm run test:unit   # 執行路網拓撲、廣慈/奉天宮與時刻表單元測試 (Python unittest)
npm run test:parse  # 執行 PDF 解析與路線資料重組
```

### 3. 本地預覽
```bash
npm run dev         # 啟動本地開發伺服器 (http://localhost:5173)
npm run preview     # 預覽生產環境構建成果 (http://localhost:4173)
```

---

## ⚖️ 免責聲明與授權條款 (Disclaimer & License)

1. **非官方聲明**：  
   本網站為民間開源愛好者基於開放資料精神建立之查詢與研究工具，**非臺北大眾捷運股份有限公司官方經營之網站**。
2. **營運調度免責**：  
   捷運列車實際運行時間可能依當日天候、特殊節日、臨時事故或現場運轉調度而有所微調。搭乘時請以車站月台即時電子看板、現場廣播與官方「**台北捷運Go**」App 發布為準。
3. **軟體授權**：  
   本專案原始程式碼以 [MIT License](LICENSE) 條款開源釋出。
4. **資料授權**：  
   本專案整理產出之 JSON 資料集遵循政府資料開放授權精神，供公眾無償、非專屬、自由使用於學術、商業與加值服務。
