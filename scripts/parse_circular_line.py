#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
新北捷運環狀線 (Circular Line / Y) 官方時刻表解析器
資料來源：新北大眾捷運股份有限公司 (NTMetro) 官方發布之 14 站 ODT/PDF 時刻表
產出：
1. public/data/stations/Y07.json ~ Y20.json (各站時刻表)
2. public/data/lines/Y.json (全線實體車次串接時刻表)
"""

import os
import re
import json
import glob
import zipfile
import xml.etree.ElementTree as ET
from bisect import bisect
from collections import namedtuple

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ODT_DIR = os.path.join(BASE_DIR, "public", "pdfs", "環狀線")
STATIONS_DIR = os.path.join(BASE_DIR, "public", "data", "stations")
LINES_DIR = os.path.join(BASE_DIR, "public", "data", "lines")

CIRCULAR_STATIONS = [
    ("Y07", "大坪林"),
    ("Y08", "十四張"),
    ("Y09", "秀朗橋"),
    ("Y10", "景平"),
    ("Y11", "景安"),
    ("Y12", "中和"),
    ("Y13", "橋和"),
    ("Y14", "中原"),
    ("Y15", "板新"),
    ("Y16", "板橋"),
    ("Y17", "新埔民生"),
    ("Y18", "頭前庄"),
    ("Y19", "幸福"),
    ("Y20", "新北產業園區"),
]

def to_minutes(time_str: str) -> int:
    h, m = time_str.split(":")
    hour = int(h)
    minute = int(m)
    if hour < 4:  # 跨夜班次 (00:xx, 01:xx 等)
        hour += 24
    return hour * 60 + minute

def to_time_str(mins: int) -> str:
    h = (mins // 60) % 24
    m = mins % 60
    return f"{h:02d}:{m:02d}"

def parse_hour_line(h_str: str):
    m = re.search(r'(\d+)\s*時(.*)', h_str)
    if not m:
        return None
    hour = int(m.group(1)) % 24
    rest = m.group(2)
    mins = [int(x) for x in re.findall(r'\d+', rest)]
    deps = []
    for minute in mins:
        if 0 <= minute < 60:
            deps.append(f"{hour:02d}:{minute:02d}")
    return deps

def parse_odt_file(st_code: str, st_name: str):
    files = glob.glob(os.path.join(ODT_DIR, f"{st_code}_*.odt"))
    if not files:
        print(f"Warning: No ODT file found for {st_code} {st_name}")
        return None

    fpath = files[0]
    with zipfile.ZipFile(fpath) as z:
        root = ET.fromstring(z.read("content.xml"))
        paras = []
        for p in root.iter("{urn:oasis:names:tc:opendocument:xmlns:text:1.0}p"):
            t = "".join(p.itertext()).strip()
            if t:
                paras.append(t)

    # (dir_code, is_weekend) -> list of "HH:MM"
    buckets = {(0, False): [], (0, True): [], (1, False): [], (1, True): []}

    if st_code == "Y07":
        # 大坪林僅有 1 方向：往新北產業園區 (dir_code: 0)
        cur_weekend = False
        for p in paras:
            if "週六" in p or "假日" in p:
                cur_weekend = True
                continue
            deps = parse_hour_line(p)
            if deps:
                buckets[(0, cur_weekend)].extend(deps)
    elif st_code == "Y20":
        # 新北產業園區僅有 1 方向：往大坪林 (dir_code: 1)
        cur_weekend = False
        for p in paras:
            if "假日" in p or "週六" in p:
                cur_weekend = True
                continue
            deps = parse_hour_line(p)
            if deps:
                buckets[(1, cur_weekend)].extend(deps)
    elif st_code == "Y19":
        cur_dir = 0
        cur_weekend = False
        for p in paras:
            if "一月台" in p or "1月台" in p:
                cur_dir = 0
                cur_weekend = ("假日" in p or "週六" in p)
                continue
            elif "二月台" in p or "2月台" in p:
                cur_dir = 1
                cur_weekend = ("假日" in p or "週六" in p)
                continue
            deps = parse_hour_line(p)
            if deps:
                buckets[(cur_dir, cur_weekend)].extend(deps)
    else:
        # 中間各站 Y08 ~ Y18
        cur_dir = 0
        cur_weekend = False
        for p in paras:
            if "1月台" in p or "一月台" in p or "往新北產業園區" in p:
                cur_dir = 0
                cur_weekend = ("週六" in p or "假日" in p)
                continue
            elif "2月台" in p or "二月台" in p or "往大坪林" in p:
                cur_dir = 1
                cur_weekend = ("週六" in p or "假日" in p)
                continue
            deps = parse_hour_line(p)
            if deps:
                buckets[(cur_dir, cur_weekend)].extend(deps)

    # 排序各方向班次
    for key in buckets:
        buckets[key].sort(key=lambda t: to_minutes(t))

    return buckets

def build_station_jsons():
    os.makedirs(STATIONS_DIR, exist_ok=True)
    all_station_data = {}

    for st_code, st_name in CIRCULAR_STATIONS:
        buckets = parse_odt_file(st_code, st_name)
        if not buckets:
            continue

        timetables = []
        # 方向 0：往新北產業園區 (Y07 -> Y19)
        if st_code != "Y20":
            dep_wk = buckets.get((0, False), [])
            dep_hol = buckets.get((0, True), [])
            schedule = [
                {
                    "Days": "1,2,3,4,5",
                    "Departures": [{"Time": t, "Dst": "新北產業園區", "IsShuttle": False} for t in dep_wk]
                },
                {
                    "Days": "6",
                    "Departures": [{"Time": t, "Dst": "新北產業園區", "IsShuttle": False} for t in dep_hol]
                },
                {
                    "Days": "7",
                    "Departures": [{"Time": t, "Dst": "新北產業園區", "IsShuttle": False} for t in dep_hol]
                }
            ]
            timetables.append({
                "Direction": "往Y20新北產業園區站",
                "DirectionCode": 0,
                "DestinationNotice": None,
                "EffectiveFrom": "2026-08-30",
                "Schedule": schedule
            })

        # 方向 1：往大坪林 (Y20 -> Y08)
        if st_code != "Y07":
            dep_wk = buckets.get((1, False), [])
            dep_hol = buckets.get((1, True), [])
            schedule = [
                {
                    "Days": "1,2,3,4,5",
                    "Departures": [{"Time": t, "Dst": "大坪林", "IsShuttle": False} for t in dep_wk]
                },
                {
                    "Days": "6",
                    "Departures": [{"Time": t, "Dst": "大坪林", "IsShuttle": False} for t in dep_hol]
                },
                {
                    "Days": "7",
                    "Departures": [{"Time": t, "Dst": "大坪林", "IsShuttle": False} for t in dep_hol]
                }
            ]
            timetables.append({
                "Direction": "往Y07大坪林站",
                "DirectionCode": 1,
                "DestinationNotice": None,
                "EffectiveFrom": "2026-08-30",
                "Schedule": schedule
            })

        st_obj = {
            "StationName": st_name,
            "StationCode": st_code,
            "LineID": "Y",
            "Timetables": timetables
        }

        out_path = os.path.join(STATIONS_DIR, f"{st_code}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(st_obj, f, ensure_ascii=False, indent=2)

        all_station_data[st_code] = st_obj
        print(f"Generated {st_code}.json ({st_name}): {len(timetables)} directions")

    return all_station_data

def chain_circular_line(all_stations):
    """串接環狀線實體車次 (Y.json)"""
    os.makedirs(LINES_DIR, exist_ok=True)
    st_codes_dir0 = [code for code, _ in CIRCULAR_STATIONS]
    st_codes_dir1 = list(reversed(st_codes_dir0))

    line_result = []
    dir_names = {0: "往新北產業園區", 1: "往大坪林"}

    for dir_code in [0, 1]:
        ordered_stations = st_codes_dir0 if dir_code == 0 else st_codes_dir1
        terminal = "新北產業園區" if dir_code == 0 else "大坪林"
        dir_schedule_list = []

        for day in ["1,2,3,4,5", "6", "7"]:
            # 取得各站時間池
            pool = {}
            for sc in ordered_stations:
                st_data = all_stations.get(sc)
                if not st_data:
                    continue
                tt = next((t for t in st_data["Timetables"] if t["DirectionCode"] == dir_code), None)
                if not tt:
                    continue
                sch = next((s for s in tt["Schedule"] if s["Days"] == day or (day in ["6", "7"] and s["Days"] == "6")), None)
                if sch:
                    times = [to_minutes(d["Time"]) for d in sch["Departures"]]
                    times.sort()
                    pool[sc] = times

            # 開始由起站串接車次
            trains = []
            start_station = ordered_stations[0]
            if start_station in pool:
                while pool[start_station]:
                    dep_min = pool[start_station].pop(0)
                    schedule = [{"StationCode": start_station, "DepTime": to_time_str(dep_min)}]
                    cur_min = dep_min

                    for next_sc in ordered_stations[1:]:
                        if next_sc not in pool or not pool[next_sc]:
                            # 若為終點站或該站池空，估算 +2 分鐘
                            cur_min += 2
                            schedule.append({"StationCode": next_sc, "DepTime": to_time_str(cur_min)})
                            continue

                        # 尋找下一站發車時間 (相差 1 ~ 4 分鐘)
                        target_min = cur_min + 1
                        next_pool = pool[next_sc]
                        idx = bisect(next_pool, target_min)
                        if idx < len(next_pool) and next_pool[idx] <= cur_min + 4:
                            cand_min = next_pool.pop(idx)
                            cur_min = cand_min
                        else:
                            cur_min += 2
                        schedule.append({"StationCode": next_sc, "DepTime": to_time_str(cur_min)})

                    trains.append({
                        "Dst": terminal,
                        "Schedule": schedule
                    })

            dir_schedule_list.append({
                "Days": day,
                "Trains": trains
            })

        line_result.append({
            "Direction": dir_names[dir_code],
            "DirectionCode": dir_code,
            "EffectiveFrom": "2026-08-30",
            "Timetables": dir_schedule_list
        })

    y_line_path = os.path.join(LINES_DIR, "Y.json")
    with open(y_line_path, "w", encoding="utf-8") as f:
        json.dump(line_result, f, ensure_ascii=False, indent=2)

    print(f"Generated Circular Line chained timetable: {y_line_path} (2 directions)")

if __name__ == "__main__":
    stations = build_station_jsons()
    chain_circular_line(stations)
    print("Circular Line timetable processing completed successfully!")
