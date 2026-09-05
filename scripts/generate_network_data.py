#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
生成路網中繼元資料 (network_meta.json) 並補注文湖線 (BR) 與環狀線 (Y) 之時刻表
"""

import os
import io
import json
from os.path import join
from typing import Dict, List

DATA_DIR = "public/data"
STATIONS_DIR = join(DATA_DIR, "stations")
META_PATH = join(DATA_DIR, "network_meta.json")

LINES_CONFIG = [
    {
        "code": "BR",
        "name": "文湖線",
        "nameEn": "Wenhu Line",
        "color": "#C48C31",
        "textColor": "#FFFFFF",
        "terminal0": "南港展覽館",
        "terminal1": "動物園"
    },
    {
        "code": "R",
        "name": "淡水信義線",
        "nameEn": "Tamsui-Xinyi Line",
        "color": "#E3002C",
        "textColor": "#FFFFFF",
        "terminal0": "淡水",
        "terminal1": "廣慈/奉天宮"
    },
    {
        "code": "G",
        "name": "松山新店線",
        "nameEn": "Songshan-Xindian Line",
        "color": "#008659",
        "textColor": "#FFFFFF",
        "terminal0": "松山",
        "terminal1": "新店"
    },
    {
        "code": "O",
        "name": "中和新蘆線",
        "nameEn": "Zhonghe-Xinlu Line",
        "color": "#F8B61C",
        "textColor": "#000000",
        "terminal0": "迴龍 / 蘆洲",
        "terminal1": "南勢角"
    },
    {
        "code": "BL",
        "name": "板南線",
        "nameEn": "Bannan Line",
        "color": "#0070BD",
        "textColor": "#FFFFFF",
        "terminal0": "南港展覽館",
        "terminal1": "頂埔"
    },
    {
        "code": "Y",
        "name": "環狀線",
        "nameEn": "Circular Line",
        "color": "#E5C200",
        "textColor": "#000000",
        "terminal0": "新北產業園區",
        "terminal1": "大坪林"
    }
]

BR_STATIONS = [
    ("BR01", "動物園"), ("BR02", "木柵"), ("BR03", "萬芳社區"), ("BR04", "萬芳醫院"),
    ("BR05", "辛亥"), ("BR06", "麟光"), ("BR07", "六張犁"), ("BR08", "科技大樓"),
    ("BR09", "大安"), ("BR10", "忠孝復興"), ("BR11", "南京復興"), ("BR12", "中山國中"),
    ("BR13", "松山機場"), ("BR14", "大直"), ("BR15", "劍南路"), ("BR16", "西湖"),
    ("BR17", "港墘"), ("BR18", "文德"), ("BR19", "內湖"), ("BR20", "大湖公園"),
    ("BR21", "葫洲"), ("BR22", "東湖"), ("BR23", "南港軟體園區"), ("BR24", "南港展覽館")
]

Y_STATIONS = [
    ("Y07", "大坪林"), ("Y08", "十四張"), ("Y09", "秀朗橋"), ("Y10", "景平"),
    ("Y11", "景安"), ("Y12", "中和"), ("Y13", "橋和"), ("Y14", "中原"),
    ("Y15", "板新"), ("Y16", "板橋"), ("Y17", "新埔民生"), ("Y18", "頭前庄"),
    ("Y19", "幸福"), ("Y20", "新北產業園區")
]

def generate_line_timetables(stations: List[tuple], line_code: str, terminal0: str, terminal1: str):
    """為高頻中運量路線 (BR/Y) 產生標準出發時刻表"""
    total_stations = len(stations)
    # 平均每站行車時間約 2 分鐘
    for idx, (st_code, st_name) in enumerate(stations):
        json_path = join(STATIONS_DIR, f"{st_code}.json")
        if os.path.exists(json_path):
            continue

        timetables = []
        # 方向 0: 往 terminal0 (代碼由小到大)
        if idx < total_stations - 1:
            departures_wk = []
            departures_sat = []
            departures_sun = []

            # 產生 06:00 ~ 24:00 班次
            # 尖峰 (07~09, 17~19) 班距 2~3 分鐘，離峰 4~5 分鐘，深夜 10~12 分鐘
            for hour in range(6, 25):
                h = hour % 24
                h_str = f"{h:02d}"
                if (7 <= hour <= 9) or (17 <= hour <= 19):
                    intervals = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57]
                elif hour >= 23:
                    intervals = [0, 10, 20, 30, 42, 54]
                else:
                    intervals = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

                # 計算站點偏移時間
                offset = idx * 2
                for m in intervals:
                    actual_m = (m + offset) % 60
                    actual_h = (h + (m + offset) // 60) % 24
                    t_str = f"{actual_h:02d}:{actual_m:02d}"
                    departures_wk.append({"Time": t_str, "Dst": terminal0, "IsShuttle": False})
                    departures_sat.append({"Time": t_str, "Dst": terminal0, "IsShuttle": False})
                    departures_sun.append({"Time": t_str, "Dst": terminal0, "IsShuttle": False})

            departures_wk.sort(key=lambda x: (int(x["Time"][:2]) if int(x["Time"][:2]) >= 5 else int(x["Time"][:2]) + 24) * 60 + int(x["Time"][3:]))
            departures_sat.sort(key=lambda x: (int(x["Time"][:2]) if int(x["Time"][:2]) >= 5 else int(x["Time"][:2]) + 24) * 60 + int(x["Time"][3:]))
            departures_sun.sort(key=lambda x: (int(x["Time"][:2]) if int(x["Time"][:2]) >= 5 else int(x["Time"][:2]) + 24) * 60 + int(x["Time"][3:]))

            timetables.append({
                "Direction": f"往{stations[-1][0]}{terminal0}站",
                "DirectionCode": 0,
                "EffectiveFrom": "2026-08-30",
                "Schedule": [
                    {"Days": "1,2,3,4,5", "Departures": departures_wk},
                    {"Days": "6", "Departures": departures_sat},
                    {"Days": "7", "Departures": departures_sun}
                ]
            })

        # 方向 1: 往 terminal1 (代碼由大到小)
        if idx > 0:
            departures_wk = []
            departures_sat = []
            departures_sun = []

            rev_idx = total_stations - 1 - idx
            for hour in range(6, 25):
                h = hour % 24
                if (7 <= hour <= 9) or (17 <= hour <= 19):
                    intervals = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 51, 54, 57]
                elif hour >= 23:
                    intervals = [0, 10, 20, 30, 42, 54]
                else:
                    intervals = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

                offset = rev_idx * 2
                for m in intervals:
                    actual_m = (m + offset) % 60
                    actual_h = (h + (m + offset) // 60) % 24
                    t_str = f"{actual_h:02d}:{actual_m:02d}"
                    departures_wk.append({"Time": t_str, "Dst": terminal1, "IsShuttle": False})
                    departures_sat.append({"Time": t_str, "Dst": terminal1, "IsShuttle": False})
                    departures_sun.append({"Time": t_str, "Dst": terminal1, "IsShuttle": False})

            departures_wk.sort(key=lambda x: (int(x["Time"][:2]) if int(x["Time"][:2]) >= 5 else int(x["Time"][:2]) + 24) * 60 + int(x["Time"][3:]))
            departures_sat.sort(key=lambda x: (int(x["Time"][:2]) if int(x["Time"][:2]) >= 5 else int(x["Time"][:2]) + 24) * 60 + int(x["Time"][3:]))
            departures_sun.sort(key=lambda x: (int(x["Time"][:2]) if int(x["Time"][:2]) >= 5 else int(x["Time"][:2]) + 24) * 60 + int(x["Time"][3:]))

            timetables.append({
                "Direction": f"往{stations[0][0]}{terminal1}站",
                "DirectionCode": 1,
                "EffectiveFrom": "2026-08-30",
                "Schedule": [
                    {"Days": "1,2,3,4,5", "Departures": departures_wk},
                    {"Days": "6", "Departures": departures_sat},
                    {"Days": "7", "Departures": departures_sun}
                ]
            })

        station_obj = {
            "StationCode": st_code,
            "StationName": st_name,
            "LineID": line_code,
            "Timetables": timetables
        }
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(station_obj, f, ensure_ascii=False, indent=2)

def build_network_meta():
    print("Generating timetables for Wenhu Line (BR) and Circular Line (Y)...")
    generate_line_timetables(BR_STATIONS, "BR", "南港展覽館", "動物園")
    generate_line_timetables(Y_STATIONS, "Y", "新北產業園區", "大坪林")

    all_stations = {}
    lines_map = {l["code"]: {**l, "stations": []} for l in LINES_CONFIG}

    station_files = sorted(os.listdir(STATIONS_DIR))
    for fname in station_files:
        if not fname.endswith(".json"):
            continue
        code = fname.replace(".json", "")
        fpath = join(STATIONS_DIR, fname)
        with open(fpath, "r", encoding="utf-8") as f:
            data = json.load(f)

        name = data.get("StationName", "")
        line_id = data.get("LineID")
        if not line_id:
            # 由代碼判定
            if code.startswith("BL"): line_id = "BL"
            elif code.startswith("BR"): line_id = "BR"
            elif code.startswith("G"): line_id = "G"
            elif code.startswith("O"): line_id = "O"
            elif code.startswith("R"): line_id = "R"
            elif code.startswith("Y"): line_id = "Y"
            else: line_id = "OTHER"

        directions = []
        for tt in data.get("Timetables", []):
            directions.append({
                "dirText": tt.get("Direction", ""),
                "dirCode": tt.get("DirectionCode", 0)
            })

        st_info = {
            "code": code,
            "name": name,
            "line": line_id,
            "directions": directions
        }
        all_stations[code] = st_info

        if line_id in lines_map:
            lines_map[line_id]["stations"].append({
                "code": code,
                "name": name
            })

    # 對每條路線車站排序
    for line_code, line_data in lines_map.items():
        line_data["stations"].sort(key=lambda s: s["code"])

    meta = {
        "lines": list(lines_map.values()),
        "stations": all_stations,
        "totalStations": len(all_stations),
        "updatedAt": "2026-09-04"
    }

    with open(META_PATH, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)

    print(f"Network metadata successfully created at {META_PATH} ({len(all_stations)} stations).")

if __name__ == "__main__":
    build_network_meta()
