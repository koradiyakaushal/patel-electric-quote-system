#!/usr/bin/env python3
"""Download the price list from Google Drive and write the site's data/*.json files.

Usage:
    PRICELIST_SHEET_URL=<share link> python3 scripts/sync_pricelist.py <output_data_dir>

The share link comes from a GitHub secret. It can point to a Google Sheet or to an
uploaded .xlsx file in Google Drive, shared as "Anyone with the link - Viewer".

Only the Panels, Inverter and Battery sheets are read. The STC table and the fixed
rates (mounting, installer, margins...) stay in the repo (data/stc.json, js/calculator.js).

If the download fails or the sheet looks wrong, the script exits with an error and
writes nothing, so the live site keeps its last good prices.
"""
import io
import json
import os
import re
import sys
import urllib.request

import openpyxl

# ---------------------------------------------------------------------------
# Where each value lives in the existing workbook (column letters, data from row 2).
# If someone moves a column in the sheet, update the letter here.
# ---------------------------------------------------------------------------
SHEETS = {
    "panels": {
        "sheet": "Panels",
        "columns": {"name": "B", "centsPerWatt": "C", "watts": "D", "priceIncGst": "G"},
    },
    "inverters": {
        "sheet": "Inverter",
        "columns": {"name": "C", "phase": "D", "priceIncGst": "G", "smartMeter": "H"},
    },
    "batteries": {
        "sheet": "Battery",
        "columns": {"name": "B", "kwPerModule": "C", "priceIncGst": "F", "kit": "G"},
    },
}
TEXT_FIELDS = {"name", "phase"}
# Numbers that may be blank in the sheet and should then count as 0.
OPTIONAL_NUMBERS = {"smartMeter", "kit", "centsPerWatt"}
FIRST_DATA_ROW = 2


def file_id_from_url(url):
    for pattern in (r"/d/([A-Za-z0-9_-]{20,})", r"[?&]id=([A-Za-z0-9_-]{20,})"):
        m = re.search(pattern, url)
        if m:
            return m.group(1)
    raise SystemExit("Could not find a Google Drive file ID in PRICELIST_SHEET_URL.")


def download_xlsx(url):
    file_id = file_id_from_url(url)
    candidates = [
        # Native Google Sheet
        f"https://docs.google.com/spreadsheets/d/{file_id}/export?format=xlsx",
        # Uploaded .xlsx file in Drive
        f"https://drive.usercontent.google.com/download?id={file_id}&export=download&confirm=t",
    ]
    for candidate in candidates:
        try:
            req = urllib.request.Request(candidate, headers={"User-Agent": "pricelist-sync"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
        except Exception:
            continue
        if data[:2] == b"PK":  # .xlsx files are zip archives
            return data
    # Don't print the URL: it is a secret.
    raise SystemExit(
        "Could not download the price list. Check that the sheet is shared as "
        "'Anyone with the link - Viewer' and that the PRICELIST_SHEET_URL secret is correct."
    )


def to_number(value):
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(str(value).replace("$", "").replace(",", "").strip())
    except ValueError:
        return None


def read_sheet(wb, key, spec):
    if spec["sheet"] not in wb.sheetnames:
        raise SystemExit(f"Sheet '{spec['sheet']}' not found. Found: {', '.join(wb.sheetnames)}")
    ws = wb[spec["sheet"]]
    items = []
    for row in range(FIRST_DATA_ROW, ws.max_row + 1):
        item = {}
        for field, col in spec["columns"].items():
            raw = ws[f"{col}{row}"].value
            if field in TEXT_FIELDS:
                item[field] = "" if raw is None else str(raw).strip()
            else:
                item[field] = to_number(raw)
        if not item["name"]:
            continue  # blank row
        if item["priceIncGst"] is None:
            print(f"  skipping {spec['sheet']} row {row} ({item['name']!r}): no price")
            continue
        missing = [f for f, v in item.items() if v is None and f not in OPTIONAL_NUMBERS]
        if missing:
            print(f"  skipping {spec['sheet']} row {row} ({item['name']!r}): missing {', '.join(missing)}")
            continue
        for f in OPTIONAL_NUMBERS & item.keys():
            if item[f] is None:
                item[f] = 0
        items.append(item)
    return items


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    out_dir = sys.argv[1]
    url = os.environ.get("PRICELIST_SHEET_URL", "").strip()
    if not url:
        raise SystemExit("PRICELIST_SHEET_URL is not set.")

    wb = openpyxl.load_workbook(io.BytesIO(download_xlsx(url)), data_only=True, read_only=False)

    results = {}
    for key, spec in SHEETS.items():
        items = read_sheet(wb, key, spec)
        # Safety check: refuse to publish if the list shrank a lot vs. the repo copy,
        # which usually means a column was moved or the wrong sheet was shared.
        repo_file = os.path.join(os.path.dirname(__file__), "..", "data", f"{key}.json")
        try:
            with open(repo_file) as f:
                previous = len(json.load(f))
        except FileNotFoundError:
            previous = 0
        if not items or len(items) < previous // 2:
            raise SystemExit(
                f"{spec['sheet']}: only {len(items)} valid rows (repo has {previous}). "
                "Did a column move? Not publishing."
            )
        results[key] = items
        print(f"{spec['sheet']}: {len(items)} items")

    os.makedirs(out_dir, exist_ok=True)
    for key, items in results.items():
        with open(os.path.join(out_dir, f"{key}.json"), "w") as f:
            json.dump(items, f, indent=2)
            f.write("\n")


if __name__ == "__main__":
    main()
