#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
解析 public/新店 目錄下所有 115.8.30 官方最新 PDF 時刻表，
並更新至 public/data/stations/ 對應的 JSON 檔案中。
"""

import os
import sys
import io
import json
import re
from os.path import join
from typing import Dict, List, Tuple

sys.path.append(os.path.dirname(__file__))
from TimeTableParser import TimeTableParser

PDF_DIR = "public/新店"
STATIONS_DIR = "public/data/stations"

# 綠線車站代碼與名稱對照
G_STATIONS = {
    "G01": "新店", "G02": "新店區公所", "G03": "七張", "G03A": "小碧潭",
    "G04": "大坪林", "G05": "景美", "G06": "萬隆", "G07": "公館",
    "G08": "台電大樓", "G09": "古亭", "G10": "中正紀念堂", "G11": "小南門",
    "G12": "西門", "G13": "北門", "G14": "中山", "G15": "松江南京",
    "G16": "南京復興", "G17": "台北小巨蛋", "G18": "南京三民", "G19": "松山"
}

# 車站代碼對應的 PDF 檔案與方向設定
# 方向 0: 往松山方向；方向 1: 往新店方向
G_PDF_MAPPING = {
    "G01": [("033a.pdf", "往G19松山站", 0)],
    "G02": [("034a.pdf", "往G19松山站", 0), ("034b.pdf", "往G01新店站", 1)],
    "G03": [("035a.pdf", "往G19松山站", 0), ("035b.pdf", "往G01新店站", 1)],
    "G03A": [("032.pdf", "往G03七張站", 0)],
    "G04": [("036a.pdf", "往G19松山站", 0), ("036b.pdf", "往G01新店站", 1)],
    "G05": [("037a.pdf", "往G19松山站", 0), ("037b.pdf", "往G01新店站", 1)],
    "G06": [("038a.pdf", "往G19松山站", 0), ("038b.pdf", "往G01新店站", 1)],
    "G07": [("039a.pdf", "往G19松山站", 0), ("039b.pdf", "往G01新店站", 1)],
    "G08": [("040a.pdf", "往G19松山站", 0), ("040b.pdf", "往G01新店站", 1)],
    "G09": [("041a.pdf", "往G19松山站", 0), ("041b.pdf", "往G01新店站", 1)],
    "G10": [("042c.pdf", "往G19松山站", 0), ("042d.pdf", "往G01新店站", 1)],
    "G11": [("043a.pdf", "往G19松山站", 0), ("043b.pdf", "往G01新店站", 1)],
    "G12": [("086a.pdf", "往G19松山站", 0), ("086b.pdf", "往G01新店站", 1)],
    "G13": [("105a.pdf", "往G19松山站", 0), ("105b.pdf", "往G01新店站", 1)],
    "G14": [("053c.pdf", "往G19松山站", 0), ("053d.pdf", "往G01新店站", 1)],
    "G15": [("132a.pdf", "往G19松山站", 0), ("132b.pdf", "往G01新店站", 1)],
    "G16": [("009c.pdf", "往G19松山站", 0), ("009d.pdf", "往G01新店站", 1)],
    "G17": [("109a.pdf", "往G19松山站", 0), ("109b.pdf", "往G01新店站", 1)],
    "G18": [("110a.pdf", "往G19松山站", 0), ("110b.pdf", "往G01新店站", 1)],
    "G19": [("111b.pdf", "往G01新店站", 1)],
}

def parse_station_pdfs():
    print("Parsing 115.8.30 PDFs from public/新店...")
    os.makedirs(STATIONS_DIR, exist_ok=True)
    
    updated_count = 0
    for st_code, pdf_configs in G_PDF_MAPPING.items():
        st_name = G_STATIONS[st_code]
        timetables = []
        
        for pdf_name, dir_title, dir_code in pdf_configs:
            pdf_path = join(PDF_DIR, pdf_name)
            if not os.path.exists(pdf_path):
                print(f"Warning: {pdf_path} not found for {st_code}")
                continue
            
            try:
                parser = TimeTableParser(pdf_path)
                effective_from, schedules = parser.Parse()
                
                # 規範化 Departures 格式，標註 IsShuttle
                for s in schedules:
                    for d in s["Departures"]:
                        d["IsShuttle"] = (d["Dst"] == "台電大樓")
                
                notice = "加註底線為往台電大樓站區間車" if any(
                    any(dep["IsShuttle"] for dep in s["Departures"]) for s in schedules
                ) else None

                timetables.append({
                    "Direction": dir_title,
                    "DirectionCode": dir_code,
                    "DestinationNotice": notice,
                    "EffectiveFrom": effective_from or "2026-08-30",
                    "Schedule": schedules
                })
            except Exception as e:
                print(f"Error parsing {pdf_name} for {st_code}: {e}")

        if timetables:
            out_obj = {
                "StationCode": st_code,
                "StationName": st_name,
                "LineID": "G",
                "Timetables": timetables
            }
            out_file = join(STATIONS_DIR, f"{st_code}.json")
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(out_obj, f, ensure_ascii=False, indent=2)
            updated_count += 1
            print(f"Updated {st_code} ({st_name}) with {len(timetables)} directions.")

    print(f"Successfully updated {updated_count} Green Line stations with 115.8.30 data.")

if __name__ == "__main__":
    parse_station_pdfs()
