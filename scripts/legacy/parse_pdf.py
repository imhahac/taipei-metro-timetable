#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF 捷運時刻表底線辨識解析器
支援利用 pdfminer.six 解析台北捷運官方 PDF 時刻表，
透過偵測文字下方的下劃線幾何圖元 (LTRect / LTLine)，精確判斷區間車終點站。
"""

import os
import sys
import io
import re
import json
import argparse
from typing import List, Dict, Tuple, Optional

try:
    from pdfminer.high_level import extract_pages
    from pdfminer.layout import (
        LTTextContainer, LTChar, LTTextLineHorizontal, LTRect, LTLine, LTCurve, LTFigure
    )
except ImportError:
    print("pdfminer.six is required. Install via: pip install pdfminer.six")

DAY_COLUMNS = [
    {"name": "平常日(週一至週五)", "days": "1,2,3,4,5"},
    {"name": "週六", "days": "6"},
    {"name": "週日及國定假日", "days": "7"}
]

class PDFTimeTableParser:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.chars: List[Dict] = []
        self.lines: List[Dict] = []
        self.rects: List[Dict] = []
        self.title = ""
        self.station_name = ""
        self.destinations: List[str] = []
        self.shuttle_destination = ""
        self.main_destination = ""
        self.effective_from = "2026-08-30"

    def extract_layout(self):
        pages = list(extract_pages(self.pdf_path))
        if not pages:
            raise ValueError(f"No pages found in {self.pdf_path}")
        
        page = pages[0]
        self._walk_element(page)

    def _walk_element(self, element):
        if isinstance(element, LTTextContainer):
            for text_line in element:
                if isinstance(text_line, LTTextLineHorizontal):
                    for char in text_line:
                        if isinstance(char, LTChar):
                            text = char.get_text()
                            if text and not text.isspace():
                                self.chars.append({
                                    "char": text,
                                    "x0": char.bbox[0],
                                    "y0": char.bbox[1],
                                    "x1": char.bbox[2],
                                    "y1": char.bbox[3],
                                    "font": char.fontname,
                                    "size": char.size
                                })
        elif isinstance(element, LTRect):
            w = abs(element.bbox[2] - element.bbox[0])
            h = abs(element.bbox[3] - element.bbox[1])
            # 水平直線常被表示為高度極窄之矩形 (例如 h <= 3, w >= 4)
            if h <= 3 and w >= 4:
                self.lines.append({
                    "x0": min(element.bbox[0], element.bbox[2]),
                    "y0": min(element.bbox[1], element.bbox[3]),
                    "x1": max(element.bbox[0], element.bbox[2]),
                    "y1": max(element.bbox[1], element.bbox[3]),
                    "w": w,
                    "h": h
                })
        elif isinstance(element, (LTLine, LTCurve)):
            w = abs(element.bbox[2] - element.bbox[0])
            h = abs(element.bbox[3] - element.bbox[1])
            if h <= 3 and w >= 4:
                self.lines.append({
                    "x0": min(element.bbox[0], element.bbox[2]),
                    "y0": min(element.bbox[1], element.bbox[3]),
                    "x1": max(element.bbox[0], element.bbox[2]),
                    "y1": max(element.bbox[1], element.bbox[3]),
                    "w": w,
                    "h": h
                })
        elif isinstance(element, LTFigure):
            for child in element:
                self._walk_element(child)

    def parse_metadata(self):
        full_text = "".join(c["char"] for c in sorted(self.chars, key=lambda c: (-c["y0"], c["x0"])))
        
        # 尋找生效日期 (如 115.8.30生效)
        date_match = re.search(r"(\d{2,3})\.(\d{1,2})\.(\d{1,2})生效", full_text)
        if date_match:
            roc_year = int(date_match.group(1))
            year = roc_year + 1911
            month = int(date_match.group(2))
            day = int(date_match.group(3))
            self.effective_from = f"{year}-{month:02d}-{day:02d}"

        # 尋找註解中的區間車目的地 (如 "加註底線為往台電大樓站區間車")
        shuttle_match = re.search(r"加註底線為往(.*?)站區間車", full_text)
        if shuttle_match:
            self.shuttle_destination = shuttle_match.group(1).strip()

        # 尋找標題 (如 "松山站往台電大樓站、新店站時刻表")
        title_match = re.search(r"(.*?)站往(.*?)時刻表", full_text)
        if title_match:
            self.station_name = title_match.group(1).strip()
            dest_text = title_match.group(2).strip()
            # 分解多個目的地
            dests = [d.replace("站", "").strip() for d in re.split(r"[、,，]", dest_text)]
            self.destinations = [d for d in dests if d]
            if self.destinations:
                self.main_destination = self.destinations[-1]

    def is_underlined(self, x0: float, y0: float, x1: float, y1: float) -> bool:
        """判定給定文字邊界下方是否有底線圖元"""
        for line in self.lines:
            # 底線位於文字底部下方 0.5 到 5 pt 範圍內
            y_diff = y0 - line["y1"]
            if -1.0 <= y_diff <= 5.0:
                # 檢查 x 軸重疊度
                overlap_x0 = max(x0, line["x0"])
                overlap_x1 = min(x1, line["x1"])
                if overlap_x1 > overlap_x0:
                    overlap_width = overlap_x1 - overlap_x0
                    char_width = max(1.0, x1 - x0)
                    if overlap_width / char_width >= 0.4:
                        return True
        return False

    def parse_schedules(self) -> Dict:
        self.extract_layout()
        self.parse_metadata()

        return {
            "StationName": self.station_name,
            "MainDestination": self.main_destination,
            "ShuttleDestination": self.shuttle_destination,
            "EffectiveFrom": self.effective_from,
            "TotalChars": len(self.chars),
            "TotalLines": len(self.lines)
        }

def main():
    parser = argparse.ArgumentParser(description="Parse Taipei Metro Timetable PDF with Underlines")
    parser.add_argument("pdf_file", help="Path to timetable PDF file")
    parser.add_argument("--output", help="Output JSON path")
    args = parser.parse_args()

    if not os.path.exists(args.pdf_file):
        print(f"Error: file {args.pdf_file} not found")
        sys.exit(1)

    p = PDFTimeTableParser(args.pdf_file)
    result = p.parse_schedules()
    print("Parsed Metadata:")
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
