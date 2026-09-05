# -*- coding: utf-8 -*-
"""
批次解析 public/ 下四條主線 (淡水信義線、板南線、松山新店線、中和新蘆線) 官方 115.8.30 PDF
並更新 public/data/stations/*.json 與 public/data/lines/*.json
"""

import os
import glob
import json
import re
from bisect import bisect_left
from collections import namedtuple
import sys
WORKSPACE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if WORKSPACE_DIR not in sys.path:
    sys.path.insert(0, WORKSPACE_DIR)
from scripts.TimeTableParser import TimeTableParser
PUBLIC_DIR = os.path.join(WORKSPACE_DIR, "public")
DATA_DIR = os.path.join(PUBLIC_DIR, "data")
STATIONS_DIR = os.path.join(DATA_DIR, "stations")
LINES_DIR = os.path.join(DATA_DIR, "lines")

# 1. 讀取內部 TimeTableId 映射表
STATION_LIST_FILE = os.path.join(WORKSPACE_DIR, "scripts", "StationList.json")

with open(STATION_LIST_FILE, "r", encoding="utf-8") as f:
    st_list = json.load(f)

tid_map = {}
for item in st_list:
    code = item["Code"]
    tid = str(item["TimeTableId"])
    if tid != "0":
        if tid not in tid_map:
            tid_map[tid] = {}
        line = "BL" if code.startswith("BL") else code[0]
        tid_map[tid][line] = item

# 加入 104 -> R01 廣慈/奉天宮
tid_map["104"] = {
    "R": {"Code": "R01", "Name": "廣慈/奉天宮", "TimeTableId": "104"}
}

PDF_LINES = ["淡水信義線", "板南線", "松山新店線", "中和新蘆線"]
FOLDERS = [
    os.path.join(PUBLIC_DIR, "pdfs", line)
    if os.path.exists(os.path.join(PUBLIC_DIR, "pdfs", line))
    else os.path.join(PUBLIC_DIR, line)
    for line in PDF_LINES
]

def to_minutes(time_str):
    h, m = time_str.split(":")
    h_int = int(h)
    if h_int < 4:
        h_int += 24
    return h_int * 60 + int(m)

def to_time_str(mins):
    h = (mins // 60) % 24
    m = mins % 60
    return f"{h:02d}:{m:02d}"

def parse_all_pdfs():
    all_pdfs = {}
    for folder in FOLDERS:
        for p in glob.glob(os.path.join(folder, "*.pdf")):
            fname = os.path.basename(p)
            all_pdfs[fname] = p

    print(f"Total PDF files collected: {len(all_pdfs)}")
    station_timetables = {}  # st_code -> { dir_code: timetable_obj }
    station_names = {}

    for fname, p in sorted(all_pdfs.items()):
        # 跳過海報/支線特別宣導單頁檔
        if fname in ["064.pdf", "032.pdf", "035.pdf"]:
            continue

        tid = fname[:3]
        try:
            parser = TimeTableParser(p)
            eff, sched = parser.Parse()
        except Exception as e:
            print(f"Error parsing {fname}: {e}")
            continue

        dt = parser.directionText or ""

        # 判定路線
        line = None
        if any(k in dt for k in ["淡水", "北投", "廣慈", "大安", "象山"]):
            line = "R"
        elif any(k in dt for k in ["南港展覽館", "頂埔", "亞東醫院", "昆陽"]):
            line = "BL"
        elif any(k in dt for k in ["松山", "新店", "台電大樓"]):
            line = "G"
        elif any(k in dt for k in ["蘆洲", "迴龍", "南勢角"]):
            line = "O"
        else:
            print(f"Cannot identify line for {fname} (dir: {dt})")
            continue

        st_info = tid_map.get(tid, {}).get(line)
        if not st_info:
            print(f"Cannot match station info for tid={tid} line={line} ({fname})")
            continue

        st_code = st_info["Code"]
        st_name = st_info["Name"]
        station_names[st_code] = st_name

        dir_code = 0
        dir_title = ""
        notice = None

        if line == "R":
            if any(k in dt for k in ["淡水", "北投"]):
                dir_code = 0
                dir_title = "往R22北投站、R28淡水站" if st_code <= "R22" else "往R28淡水站"
                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = (dep["Dst"] == "北投")
                notice = "加註底線為往北投站區間車" if any(
                    any(dep["IsShuttle"] for dep in s["Departures"]) for s in sched
                ) else None
            else:
                dir_code = 1
                if st_code > "R05":
                    dir_title = "往R05大安站、R01廣慈/奉天宮站"
                else:
                    dir_title = "往R01廣慈/奉天宮站"
                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = (dep["Dst"] == "大安")
                notice = "加註底線為往大安站區間車" if any(
                    any(dep["IsShuttle"] for dep in s["Departures"]) for s in sched
                ) else None

        elif line == "BL":
            if any(k in dt for k in ["南港展覽館", "昆陽"]):
                dir_code = 0
                dir_title = "往BL23南港展覽館站"
                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = (dep["Dst"] == "昆陽")
                notice = "加註底線為往昆陽站列車" if any(
                    any(dep["IsShuttle"] for dep in s["Departures"]) for s in sched
                ) else None
            else:
                dir_code = 1
                dir_title = "往BL05亞東醫院站、BL01頂埔站" if st_code >= "BL05" else "往BL01頂埔站"
                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = (dep["Dst"] == "亞東醫院")
                notice = "加註底線為往亞東醫院站區間車" if any(
                    any(dep["IsShuttle"] for dep in s["Departures"]) for s in sched
                ) else None

        elif line == "G":
            if "松山" in dt:
                dir_code = 0
                dir_title = "往G19松山站"
                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = False
                notice = None
            else:
                dir_code = 1
                dir_title = "往G08台電大樓站、G01新店站" if st_code >= "G08" else "往G01新店站"
                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = (dep["Dst"] == "台電大樓")
                notice = "加註底線為往台電大樓站區間車" if any(
                    any(dep["IsShuttle"] for dep in s["Departures"]) for s in sched
                ) else None

        elif line == "O":
            if any(k in dt for k in ["蘆洲", "迴龍"]):
                dir_code = 0
                if st_code <= "O12":
                    dir_title = "往O54蘆洲站、O21迴龍站"
                elif st_code.startswith("O5"):
                    dir_title = "往O54蘆洲站"
                else:
                    dir_title = "往O21迴龍站"

                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = (dep["Dst"] == "蘆洲")
                notice = "加註底線為往蘆洲站列車" if st_code <= "O12" else None
            else:
                dir_code = 1
                dir_title = "往O01南勢角站"
                for s in sched:
                    for dep in s["Departures"]:
                        dep["IsShuttle"] = False
                notice = None

        if st_code not in station_timetables:
            station_timetables[st_code] = {}

        station_timetables[st_code][dir_code] = {
            "Direction": dir_title,
            "DirectionCode": dir_code,
            "DestinationNotice": notice,
            "EffectiveFrom": eff or "2026-08-30",
            "Schedule": sched
        }

    # 輸出所有車站 JSON
    os.makedirs(STATIONS_DIR, exist_ok=True)
    for st_code, dirs in station_timetables.items():
        sorted_dirs = [dirs[k] for k in sorted(dirs.keys())]
        st_obj = {
            "StationName": station_names[st_code],
            "StationCode": st_code,
            "Timetables": sorted_dirs
        }
        out_path = os.path.join(STATIONS_DIR, f"{st_code}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(st_obj, f, ensure_ascii=False, indent=2)

    print(f"Successfully generated {len(station_timetables)} station JSON files in public/data/stations/")
    return station_timetables

# 2. 串接列車 (Lines Chaining)
SingleTrain = namedtuple("SingleTrain", ["Dst", "Schedule"])

last_append_dict = {
    "R27": ("R28", 3),   # 淡水
    "R02": ("R01", 3),   # 廣慈/奉天宮 (象山至廣慈/奉天宮)
    "R21": ("R22", 2),   # 北投
    "R06": ("R05", 2),   # 大安
    "BL22": ("BL23", 2), # 南港展覽館
    "BL02": ("BL01", 3), # 頂埔
    "BL20": ("BL21", 2), # 昆陽
    "BL06": ("BL05", 3), # 亞東醫院
    "G18": ("G19", 3),   # 松山
    "G02": ("G01", 2),   # 新店
    "G09": ("G08", 2),   # 台電大樓
    "O02": ("O01", 2),   # 南勢角
    "O53": ("O54", 2),   # 蘆洲
    "O20": ("O21", 3),   # 迴龍
}

def trace_corridor(corridor, deps_by_station, dst, terminal_append=None, initial_trains=None, is_final=True, max_dwell=4):
    """
    沿著路線走廊 (corridor) 進行一對一相鄰車站發車時間串接，禁止跳站。
    遵循軌道交通 FIFO (First-In, First-Out) 物理特性。
    """
    active_trains = [dict(tr) for tr in (initial_trains or [])]
    for tr in active_trains:
        tr["Schedule"] = list(tr["Schedule"])
    finished_trains = []

    for sc in corridor:
        next_deps = list(deps_by_station.get(sc, []))
        new_active = []
        for tr in active_trains:
            last_stop = tr["Schedule"][-1]
            t_last = to_minutes(last_stop["DepTime"])
            matched_idx = None
            for i, d in enumerate(next_deps):
                if t_last + 1 <= d <= t_last + max_dwell:
                    matched_idx = i
                    break
            if matched_idx is not None:
                cand = next_deps.pop(matched_idx)
                tr["Schedule"].append({"StationCode": sc, "DepTime": to_time_str(cand)})
                new_active.append(tr)
            else:
                finished_trains.append(tr)

        for d in next_deps:
            new_active.append({
                "Dst": dst,
                "Schedule": [{"StationCode": sc, "DepTime": to_time_str(d)}]
            })
        new_active.sort(key=lambda tr: to_minutes(tr["Schedule"][-1]["DepTime"]))
        active_trains = new_active

    if is_final:
        for tr in active_trains:
            if terminal_append:
                term_sc, diff = terminal_append
                t_last = to_minutes(tr["Schedule"][-1]["DepTime"])
                tr["Schedule"].append({"StationCode": term_sc, "DepTime": to_time_str(t_last + diff)})
            finished_trains.append(tr)
        active_trains = []

    return finished_trains, active_trains


def get_station_deps_for_dst(station_dict, dst):
    res = {}
    for sc, deps in station_dict.items():
        res[sc] = sorted([to_minutes(d["Time"]) for d in deps if (d["Dst"] == dst if dst else True)])
    return res


def chain_line_trains(line_code, station_timetables):
    st_codes = sorted([c for c in station_timetables if (c.startswith(line_code) if line_code != "BL" else c.startswith("BL"))])
    if not st_codes:
        return

    # 依方向與星期分組
    dir_day_st = {}  # (dir_code, day) -> { st_code: departures }
    for st_code in st_codes:
        for dir_code, tt in station_timetables[st_code].items():
            for sched in tt["Schedule"]:
                day = sched["Days"]
                key = (dir_code, day)
                if key not in dir_day_st:
                    dir_day_st[key] = {}
                dir_day_st[key][st_code] = sched["Departures"]

    line_result = []
    dir_names = {
        "R": {0: "往北投/淡水", 1: "往大安/廣慈/奉天宮"},
        "BL": {0: "往南港展覽館", 1: "往亞東醫院/頂埔"},
        "G": {0: "往松山", 1: "往新店/台電大樓"},
        "O": {0: "往蘆洲/迴龍", 1: "往南勢角"},
    }

    for dir_code in [0, 1]:
        dir_schedule_list = []
        for day in ["1,2,3,4,5", "6", "7"]:
            key = (dir_code, day)
            if key not in dir_day_st:
                continue

            station_dict = dir_day_st[key]
            trains = []

            if line_code == "G":
                if dir_code == 0:
                    trains, _ = trace_corridor(
                        [f"G{i:02d}" for i in range(1, 19)],
                        get_station_deps_for_dst(station_dict, "松山"),
                        "松山",
                        terminal_append=("G19", 3)
                    )
                else:
                    t_xd, _ = trace_corridor(
                        [f"G{i:02d}" for i in range(19, 1, -1)],
                        get_station_deps_for_dst(station_dict, "新店"),
                        "新店",
                        terminal_append=("G01", 2)
                    )
                    t_td, _ = trace_corridor(
                        [f"G{i:02d}" for i in range(19, 8, -1)],
                        get_station_deps_for_dst(station_dict, "台電大樓"),
                        "台電大樓",
                        terminal_append=("G08", 2)
                    )
                    trains = t_xd + t_td

            elif line_code == "BL":
                if dir_code == 0:
                    t_ng, _ = trace_corridor(
                        [f"BL{i:02d}" for i in range(1, 23)],
                        get_station_deps_for_dst(station_dict, "南港展覽館"),
                        "南港展覽館",
                        terminal_append=("BL23", 2)
                    )
                    t_ky, _ = trace_corridor(
                        [f"BL{i:02d}" for i in range(1, 21)],
                        get_station_deps_for_dst(station_dict, "昆陽"),
                        "昆陽",
                        terminal_append=("BL21", 2)
                    )
                    trains = t_ng + t_ky
                else:
                    t_dp, _ = trace_corridor(
                        [f"BL{i:02d}" for i in range(23, 1, -1)],
                        get_station_deps_for_dst(station_dict, "頂埔"),
                        "頂埔",
                        terminal_append=("BL01", 3)
                    )
                    t_yd, _ = trace_corridor(
                        [f"BL{i:02d}" for i in range(23, 5, -1)],
                        get_station_deps_for_dst(station_dict, "亞東醫院"),
                        "亞東醫院",
                        terminal_append=("BL05", 3)
                    )
                    trains = t_dp + t_yd

            elif line_code == "R":
                if dir_code == 0:
                    t_ts, _ = trace_corridor(
                        [f"R{i:02d}" for i in range(1, 28)],
                        get_station_deps_for_dst(station_dict, "淡水"),
                        "淡水",
                        terminal_append=("R28", 3)
                    )
                    t_bt, _ = trace_corridor(
                        [f"R{i:02d}" for i in range(1, 22)],
                        get_station_deps_for_dst(station_dict, "北投"),
                        "北投",
                        terminal_append=("R22", 2)
                    )
                    trains = t_ts + t_bt
                else:
                    t_gc, _ = trace_corridor(
                        [f"R{i:02d}" for i in range(28, 1, -1)],
                        get_station_deps_for_dst(station_dict, "廣慈/奉天宮"),
                        "廣慈/奉天宮",
                        terminal_append=("R01", 3)
                    )
                    t_da, _ = trace_corridor(
                        [f"R{i:02d}" for i in range(28, 5, -1)],
                        get_station_deps_for_dst(station_dict, "大安"),
                        "大安",
                        terminal_append=("R05", 2)
                    )
                    trains = t_gc + t_da

            elif line_code == "O":
                if dir_code == 0:
                    c_lz = [f"O{i:02d}" for i in range(1, 13)] + [f"O{i:02d}" for i in range(50, 54)]
                    t_lz, _ = trace_corridor(
                        c_lz,
                        get_station_deps_for_dst(station_dict, "蘆洲"),
                        "蘆洲",
                        terminal_append=("O54", 2)
                    )
                    c_hl = [f"O{i:02d}" for i in range(1, 13)] + [f"O{i:02d}" for i in range(13, 21)]
                    t_hl, _ = trace_corridor(
                        c_hl,
                        get_station_deps_for_dst(station_dict, "迴龍"),
                        "迴龍",
                        terminal_append=("O21", 3)
                    )
                    trains = t_lz + t_hl
                else:
                    deps_o1 = get_station_deps_for_dst(station_dict, None)
                    fin_lz, act_lz = trace_corridor(
                        [f"O{i:02d}" for i in range(54, 49, -1)],
                        deps_o1,
                        "南勢角",
                        is_final=False
                    )
                    fin_hl, act_hl = trace_corridor(
                        [f"O{i:02d}" for i in range(21, 12, -1)],
                        deps_o1,
                        "南勢角",
                        is_final=False
                    )
                    merged = act_lz + act_hl
                    merged.sort(key=lambda tr: to_minutes(tr["Schedule"][-1]["DepTime"]))
                    fin_trunk, _ = trace_corridor(
                        [f"O{i:02d}" for i in range(12, 1, -1)],
                        deps_o1,
                        "南勢角",
                        terminal_append=("O01", 2),
                        initial_trains=merged,
                        is_final=True
                    )
                    trains = fin_lz + fin_hl + fin_trunk

            # 依照首站發車時間進行排序
            trains.sort(key=lambda t: to_minutes(t["Schedule"][0]["DepTime"]))

            dir_schedule_list.append({
                "Days": day,
                "Trains": trains
            })

        line_result.append({
            "Direction": dir_names[line_code][dir_code],
            "DirectionCode": dir_code,
            "EffectiveFrom": "2026-08-30",
            "Timetables": dir_schedule_list
        })

    os.makedirs(LINES_DIR, exist_ok=True)
    out_line_path = os.path.join(LINES_DIR, f"{line_code}.json")
    with open(out_line_path, "w", encoding="utf-8") as f:
        json.dump(line_result, f, ensure_ascii=False, indent=2)
    print(f"Generated line chained timetable: {out_line_path} ({len(line_result)} directions)")

if __name__ == "__main__":
    st_tts = parse_all_pdfs()
    for l in ["R", "BL", "G", "O"]:
        chain_line_trains(l, st_tts)
    print("All four lines updated successfully to 115.8.30 version!")
