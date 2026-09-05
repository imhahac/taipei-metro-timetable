#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TDX 台北捷運時刻表抓取與轉換腳本
支援線上從 TDX API 下載或離線載入 scheduledata.json，
並輸出為相容 Eric Yu 規格的 Station JSON 檔案。
"""

import os
import sys
import io
import json
import argparse
from datetime import datetime
from os.path import join
import requests

SERVICE_DAY_MAPPING = {
    "平日": "1,2,3,4,5",
    "週六": "6",
    "週日": "7",
    "假日": "6,7"
}

DIRECTION_MAPPING = {
    ("R", 0): "往R22北投站、R28淡水站",
    ("R", 1): "往R01廣慈/奉天宮站",
    ("G", 0): "往G19松山站",
    ("G", 1): "往G01新店站",
    ("O", 0): "往O54蘆洲站、O21迴龍站",
    ("O", 1): "往O01南勢角站",
    ("BL", 0): "往BL23南港展覽館站",
    ("BL", 1): "往BL01頂埔站",
    ("BR", 0): "往BR24南港展覽館站",
    ("BR", 1): "往BR01動物園站",
    ("Y", 0): "往Y20新北產業園區站",
    ("Y", 1): "往Y07大坪林站"
}

def convert_to_minute(time_str: str) -> int:
    parts = time_str.split(":")
    hour = int(parts[0])
    minute = int(parts[1])
    if hour < 2:  # 跨夜班次 (00:xx, 01:xx)
        hour += 24
    return hour * 60 + minute

def get_tdx_token(client_id: str, client_secret: str) -> str:
    auth_url = "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "grant_type": "client_credentials",
        "client_id": client_id,
        "client_secret": client_secret
    }
    resp = requests.post(auth_url, headers=headers, data=data, timeout=15)
    resp.raise_for_status()
    return resp.json()["access_token"]

def fetch_tdx_timetable(token: str) -> list:
    api_url = "https://tdx.transportdata.tw/api/basic/v2/Metro/StationTimeTable/TRTC?$format=JSON"
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(api_url, headers=headers, timeout=60)
    resp.raise_for_status()
    return resp.json()

def process_station_data(station_id: str, all_data: list, service_day_patterns: list, output_dir: str):
    station_data = [x for x in all_data if x.get("StationID") == station_id]
    if not station_data:
        return

    effective_dates = {x.get("SrcUpdateTime", "") for x in station_data if x.get("SrcUpdateTime")}
    effective_from = "2026-08-30"
    if effective_dates:
        try:
            effective_from = datetime.fromisoformat(list(effective_dates)[0]).strftime("%Y-%m-%d")
        except Exception:
            pass

    line_id = station_data[0].get("LineID", "")
    station_name = station_data[0].get("StationName", {}).get("Zh_tw", "")
    all_timetables = []

    for direction in [0, 1]:
        schedules = []
        for service_day in service_day_patterns:
            departures = []
            raw_schedules = [
                x for x in station_data
                if x.get("Direction") == direction and x.get("ServiceDay", {}).get("ServiceTag") == service_day
            ]
            if not raw_schedules:
                continue

            for single_schedule in raw_schedules:
                dest_id = single_schedule.get("DestinationStaionID", "")
                if dest_id.endswith("A"):
                    continue
                dest_name = single_schedule.get("DestinationStationName", {}).get("Zh_tw", "")
                
                for record in single_schedule.get("Timetables", []):
                    dep_time = record.get("DepartureTime", "")
                    if dep_time:
                        # 標註是否為區間車 (非全線終點站)
                        is_shuttle = False
                        if line_id == "G" and dest_name == "台電大樓":
                            is_shuttle = True
                        elif line_id == "R" and (dest_name == "北投" or dest_name == "大安"):
                            is_shuttle = True
                        elif line_id == "BL" and (dest_name == "亞東醫院" or dest_name == "昆陽"):
                            is_shuttle = True
                        elif line_id == "O" and dest_name == "蘆洲":
                            is_shuttle = True

                        departures.append({
                            "Time": dep_time,
                            "Dst": dest_name,
                            "IsShuttle": is_shuttle
                        })

            departures.sort(key=lambda k: convert_to_minute(k["Time"]))
            if departures:
                days_key = SERVICE_DAY_MAPPING.get(service_day, service_day)
                schedules.append({
                    "Days": days_key,
                    "Departures": departures
                })

        schedules.sort(key=lambda k: k["Days"])
        if schedules:
            dir_text = DIRECTION_MAPPING.get((line_id, direction), f"往第 {direction} 方向")
            all_timetables.append({
                "Direction": dir_text,
                "DirectionCode": direction,
                "EffectiveFrom": effective_from,
                "Schedule": schedules
            })

    if all_timetables:
        result = {
            "StationCode": station_id,
            "StationName": station_name,
            "LineID": line_id,
            "Timetables": all_timetables
        }
        os.makedirs(output_dir, exist_ok=True)
        file_path = join(output_dir, f"{station_id}.json")
        with io.open(file_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

def main():
    parser = argparse.ArgumentParser(description="Fetch and parse TDX Metro TimeTable")
    parser.add_argument("--client-id", help="TDX API Client ID")
    parser.add_argument("--client-secret", help="TDX API Client Secret")
    parser.add_argument("--input-file", default="scheduledata.json", help="Local JSON file path if offline")
    parser.add_argument("--output-dir", default="public/data/stations", help="Output directory for stations")
    args = parser.parse_args()

    all_data = []
    if args.client_id and args.client_secret:
        print("Authenticating with TDX API...")
        token = get_tdx_token(args.client_id, args.client_secret)
        print("Fetching station timetable from TDX...")
        all_data = fetch_tdx_timetable(token)
    elif os.path.exists(args.input_file):
        print(f"Reading offline data from {args.input_file}...")
        with open(args.input_file, "r", encoding="utf-8") as f:
            all_data = json.load(f)
    else:
        print("Notice: No TDX credentials or input file provided. Run with --help for usage.")
        sys.exit(1)

    # 去重
    seen = set()
    deduped = []
    for item in all_data:
        key = (
            item.get("RouteID"),
            item.get("StationID"),
            item.get("Direction"),
            item.get("DestinationStaionID"),
            tuple(sorted(item.get("ServiceDay", {}).items()))
        )
        if key not in seen:
            seen.add(key)
            deduped.append(item)
    all_data = deduped

    # 取得營運服務日 patterns
    line_ids = {x.get("LineID") for x in all_data if x.get("LineID")}
    service_day_patterns = ["平日", "週六", "週日", "假日"]

    station_ids = {s.get("StationID") for s in all_data if s.get("StationID")}
    print(f"Processing {len(station_ids)} stations into {args.output_dir}...")
    for st_id in station_ids:
        if st_id.endswith("A"):
            continue
        process_station_data(st_id, all_data, service_day_patterns, args.output_dir)

    print(f"Done! Station timetable files saved to {args.output_dir}")

if __name__ == "__main__":
    main()
