#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
台北捷運時刻表與路網資料單元測試 (Unit Tests)
驗證資料集完整性、廣慈/奉天宮 (R01) 拓撲、環狀線 (Y07~Y20) 官方時刻表與全線車次串接、及向量地圖。
"""

import os
import json
import unittest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "public", "data")
STATIONS_DIR = os.path.join(DATA_DIR, "stations")
LINES_DIR = os.path.join(DATA_DIR, "lines")
META_PATH = os.path.join(DATA_DIR, "network_meta.json")
SVG_PATH = os.path.join(BASE_DIR, "public", "metro.svg")
STATION_LIST_PATH = os.path.join(BASE_DIR, "scripts", "StationList.json")


class TestNetworkMetadata(unittest.TestCase):
    def setUp(self):
        self.assertTrue(os.path.exists(META_PATH), f"Missing {META_PATH}")
        with open(META_PATH, "r", encoding="utf-8") as f:
            self.meta = json.load(f)

    def test_total_station_count(self):
        self.assertEqual(self.meta["totalStations"], 134)
        self.assertEqual(len(self.meta["stations"]), 134)

    def test_red_line_topology(self):
        r_line = next((l for l in self.meta["lines"] if l["code"] == "R"), None)
        self.assertIsNotNone(r_line)
        self.assertEqual(r_line["terminal0"], "淡水")
        self.assertEqual(r_line["terminal1"], "廣慈/奉天宮")
        self.assertEqual(len(r_line["stations"]), 28)
        self.assertEqual(r_line["stations"][0]["code"], "R01")
        self.assertEqual(r_line["stations"][0]["name"], "廣慈/奉天宮")
        self.assertEqual(r_line["stations"][1]["code"], "R02")
        self.assertEqual(r_line["stations"][1]["name"], "象山")
        self.assertEqual(r_line["stations"][-1]["code"], "R28")
        self.assertEqual(r_line["stations"][-1]["name"], "淡水")

    def test_r01_metadata_entry(self):
        self.assertIn("R01", self.meta["stations"])
        st = self.meta["stations"]["R01"]
        self.assertEqual(st["name"], "廣慈/奉天宮")
        self.assertEqual(st["line"], "R")
        self.assertEqual(len(st["directions"]), 1)
        self.assertEqual(st["directions"][0]["dirCode"], 0)

    def test_circular_line_topology(self):
        y_line = next((l for l in self.meta["lines"] if l["code"] == "Y"), None)
        self.assertIsNotNone(y_line)
        self.assertEqual(y_line["terminal0"], "新北產業園區")
        self.assertEqual(y_line["terminal1"], "大坪林")
        self.assertEqual(len(y_line["stations"]), 14)
        self.assertEqual(y_line["stations"][0]["code"], "Y07")
        self.assertEqual(y_line["stations"][0]["name"], "大坪林")
        self.assertEqual(y_line["stations"][-1]["code"], "Y20")
        self.assertEqual(y_line["stations"][-1]["name"], "新北產業園區")


class TestStationTimeTables(unittest.TestCase):
    def test_r01_timetable_departures(self):
        r01_path = os.path.join(STATIONS_DIR, "R01.json")
        self.assertTrue(os.path.exists(r01_path))
        with open(r01_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data["StationCode"], "R01")
        self.assertEqual(data["StationName"], "廣慈/奉天宮")
        tt = data["Timetables"][0]
        self.assertEqual(tt["DirectionCode"], 0)
        self.assertIn("淡水", tt["Direction"])

        wk_sched = next((s for s in tt["Schedule"] if s["Days"] == "1,2,3,4,5"), None)
        self.assertIsNotNone(wk_sched)
        self.assertEqual(len(wk_sched["Departures"]), 205)
        self.assertEqual(wk_sched["Departures"][0]["Time"], "06:00")

    def test_r02_xiangshan_direction1(self):
        r02_path = os.path.join(STATIONS_DIR, "R02.json")
        with open(r02_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        dir1 = next((t for t in data["Timetables"] if t["DirectionCode"] == 1), None)
        self.assertIsNotNone(dir1)
        self.assertEqual(dir1["Direction"], "往R01廣慈/奉天宮站")
        for s in dir1["Schedule"]:
            for dep in s["Departures"]:
                self.assertEqual(dep["Dst"], "廣慈/奉天宮")

    def test_circular_line_station_timetables(self):
        # 測試端點站 Y07 (僅 Direction 0)
        y07_path = os.path.join(STATIONS_DIR, "Y07.json")
        self.assertTrue(os.path.exists(y07_path))
        with open(y07_path, "r", encoding="utf-8") as f:
            y07_data = json.load(f)
        self.assertEqual(y07_data["StationCode"], "Y07")
        self.assertEqual(y07_data["StationName"], "大坪林")
        self.assertEqual(len(y07_data["Timetables"]), 1)
        self.assertEqual(y07_data["Timetables"][0]["DirectionCode"], 0)
        self.assertIn("新北產業園區", y07_data["Timetables"][0]["Direction"])
        self.assertGreater(len(y07_data["Timetables"][0]["Schedule"][0]["Departures"]), 100)

        # 測試端點站 Y20 (僅 Direction 1)
        y20_path = os.path.join(STATIONS_DIR, "Y20.json")
        self.assertTrue(os.path.exists(y20_path))
        with open(y20_path, "r", encoding="utf-8") as f:
            y20_data = json.load(f)
        self.assertEqual(y20_data["StationCode"], "Y20")
        self.assertEqual(y20_data["StationName"], "新北產業園區")
        self.assertEqual(len(y20_data["Timetables"]), 1)
        self.assertEqual(y20_data["Timetables"][0]["DirectionCode"], 1)
        self.assertIn("大坪林", y20_data["Timetables"][0]["Direction"])

        # 測試中間站 Y11 景安 (雙向皆有)
        y11_path = os.path.join(STATIONS_DIR, "Y11.json")
        self.assertTrue(os.path.exists(y11_path))
        with open(y11_path, "r", encoding="utf-8") as f:
            y11_data = json.load(f)
        self.assertEqual(len(y11_data["Timetables"]), 2)
        dir_codes = {t["DirectionCode"] for t in y11_data["Timetables"]}
        self.assertEqual(dir_codes, {0, 1})

    def test_all_134_station_files_exist_and_valid(self):
        files = [f for f in os.listdir(STATIONS_DIR) if f.endswith(".json")]
        self.assertEqual(len(files), 134)
        for fname in files:
            fpath = os.path.join(STATIONS_DIR, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            self.assertIn("StationCode", data)
            self.assertIn("StationName", data)
            self.assertIn("Timetables", data)
            self.assertGreater(len(data["Timetables"]), 0)


class TestLineChainedTimetables(unittest.TestCase):
    def test_red_line_chaining_ends_at_r01(self):
        r_line_path = os.path.join(LINES_DIR, "R.json")
        self.assertTrue(os.path.exists(r_line_path))
        with open(r_line_path, "r", encoding="utf-8") as f:
            lines_data = json.load(f)
        self.assertEqual(lines_data[0]["Direction"], "往北投/淡水")
        self.assertEqual(lines_data[1]["Direction"], "往大安/廣慈/奉天宮")

        dir1_trains = lines_data[1]["Timetables"][0]["Trains"]
        guangci_trains = [t for t in dir1_trains if t["Dst"] == "廣慈/奉天宮"]
        self.assertGreater(len(guangci_trains), 100)
        for train in guangci_trains[:20]:
            last_stop = train["Schedule"][-1]
            self.assertEqual(last_stop["StationCode"], "R01", f"Train {train} does not terminate at R01")

    def test_circular_line_chaining(self):
        y_line_path = os.path.join(LINES_DIR, "Y.json")
        self.assertTrue(os.path.exists(y_line_path))
        with open(y_line_path, "r", encoding="utf-8") as f:
            lines_data = json.load(f)
        self.assertEqual(len(lines_data), 2)
        self.assertEqual(lines_data[0]["Direction"], "往新北產業園區")
        self.assertEqual(lines_data[1]["Direction"], "往大坪林")

        # 方向 0 車次起迄測試
        dir0_trains = lines_data[0]["Timetables"][0]["Trains"]
        self.assertGreater(len(dir0_trains), 100)
        first_train0 = dir0_trains[0]
        self.assertEqual(first_train0["Schedule"][0]["StationCode"], "Y07")
        self.assertEqual(first_train0["Schedule"][-1]["StationCode"], "Y20")

        # 方向 1 車次起迄測試
        dir1_trains = lines_data[1]["Timetables"][0]["Trains"]
        self.assertGreater(len(dir1_trains), 100)
        first_train1 = dir1_trains[0]
        self.assertEqual(first_train1["Schedule"][0]["StationCode"], "Y20")
        self.assertEqual(first_train1["Schedule"][-1]["StationCode"], "Y07")

    def test_other_line_files_exist(self):
        for line in ["BL", "G", "O", "Y"]:
            p = os.path.join(LINES_DIR, f"{line}.json")
            self.assertTrue(os.path.exists(p))

    def test_no_station_jumping_in_any_line(self):
        """驗證所有路線車次串接無任何跳站（相鄰站必須連續），且發車時間遞增"""
        corridors = {
            ("G", 0, "松山"): [f"G{i:02d}" for i in range(1, 20)],
            ("G", 1, "新店"): [f"G{i:02d}" for i in range(19, 0, -1)],
            ("G", 1, "台電大樓"): [f"G{i:02d}" for i in range(19, 7, -1)],
            ("BL", 0, "南港展覽館"): [f"BL{i:02d}" for i in range(1, 24)],
            ("BL", 0, "昆陽"): [f"BL{i:02d}" for i in range(1, 22)],
            ("BL", 1, "頂埔"): [f"BL{i:02d}" for i in range(23, 0, -1)],
            ("BL", 1, "亞東醫院"): [f"BL{i:02d}" for i in range(23, 4, -1)],
            ("R", 0, "淡水"): [f"R{i:02d}" for i in range(1, 29)],
            ("R", 0, "北投"): [f"R{i:02d}" for i in range(1, 23)],
            ("R", 1, "廣慈/奉天宮"): [f"R{i:02d}" for i in range(28, 0, -1)],
            ("R", 1, "象山"): [f"R{i:02d}" for i in range(28, 1, -1)],
            ("R", 1, "大安"): [f"R{i:02d}" for i in range(28, 4, -1)],
            ("O", 0, "蘆洲"): [f"O{i:02d}" for i in range(1, 13)] + [f"O{i:02d}" for i in range(50, 55)],
            ("O", 0, "迴龍"): [f"O{i:02d}" for i in range(1, 22)],
            ("Y", 0, "新北產業園區"): [f"Y{i:02d}" for i in range(7, 21)],
            ("Y", 1, "大坪林"): [f"Y{i:02d}" for i in range(20, 6, -1)],
        }

        def to_m(t):
            h, m = map(int, t.split(":"))
            if h < 4:
                h += 24
            return h * 60 + m

        for line_code in ["R", "BL", "G", "O", "Y"]:
            line_path = os.path.join(LINES_DIR, f"{line_code}.json")
            with open(line_path, "r", encoding="utf-8") as f:
                line_data = json.load(f)

            for d in line_data:
                dir_code = d["DirectionCode"]
                for tt in d["Timetables"]:
                    for train in tt["Trains"]:
                        sched = train["Schedule"]
                        self.assertGreaterEqual(len(sched), 2, f"Train too short: {train}")
                        dst = train["Dst"]

                        # 確定 corridor
                        key = (line_code, dir_code, dst)
                        if key in corridors:
                            corridor = corridors[key]
                        elif line_code == "O" and dir_code == 1:
                            if sched[0]["StationCode"].startswith("O5"):
                                corridor = [f"O{i:02d}" for i in range(54, 49, -1)] + [f"O{i:02d}" for i in range(12, 0, -1)]
                            else:
                                corridor = [f"O{i:02d}" for i in range(21, 12, -1)] + [f"O{i:02d}" for i in range(12, 0, -1)]
                        else:
                            continue

                        # 驗證所有相鄰站均嚴格連續，且時間不回退
                        for i in range(len(sched) - 1):
                            s1 = sched[i]["StationCode"]
                            s2 = sched[i+1]["StationCode"]
                            c1 = corridor.index(s1)
                            c2 = corridor.index(s2)
                            self.assertEqual(c2, c1 + 1, f"Jumping detected on {line_code} dir {dir_code}: {s1} -> {s2}")
                            t1 = to_m(sched[i]["DepTime"])
                            t2 = to_m(sched[i+1]["DepTime"])
                            self.assertGreaterEqual(t2, t1, f"Time anomaly: {sched[i]} -> {sched[i+1]}")


class TestStationListAndSVGMap(unittest.TestCase):
    def test_station_list_contains_r01(self):
        with open(STATION_LIST_PATH, "r", encoding="utf-8") as f:
            st_list = json.load(f)
        entry = next((s for s in st_list if s["Code"] == "R01"), None)
        self.assertIsNotNone(entry)
        self.assertEqual(entry["Name"], "廣慈/奉天宮")
        self.assertEqual(entry["TimeTableId"], "104")

    def test_svg_contains_guangci_and_extended_track(self):
        with open(SVG_PATH, "r", encoding="utf-8") as f:
            svg = f.read()
        self.assertIn("廣慈/奉天宮", svg)
        self.assertIn("h625", svg)

    def test_svg_contains_circular_line(self):
        with open(SVG_PATH, "r", encoding="utf-8") as f:
            svg = f.read()
        # 檢查黃色軌道色碼
        self.assertIn("#FEDB00", svg)
        # 檢查環狀線主要站點名稱
        for st_name in ["十四張", "秀朗橋", "景平", "中和", "橋和", "中原", "板新", "新埔民生", "幸福", "新北產業園區"]:
            self.assertIn(st_name, svg, f"Station {st_name} missing from metro.svg")


if __name__ == "__main__":
    unittest.main(verbosity=2)
