#!/usr/bin/env python3
"""Download the price workbook from Google Drive and write the site's data/*.json files.

Usage:
    PRICELIST_SHEET_URL=<share link> python3 scripts/sync_pricelist.py <output_data_dir>

The share link comes from a GitHub secret. It can point to a Google Sheet or to an
uploaded .xlsx file in Google Drive, shared as "Anyone with the link - Viewer".

What is read:
  - Panels, Inverter, Battery sheets  -> panels/inverters/batteries.json
  - STC PRICE and BAT STC PRICE sheets         -> stc.json
  - the fixed rates (mounting, installer, margins, rebates...) straight out of the
    formulas in the "CALCULATRE PRICE  HERE" sheet -> rates.json

Every formula in the calculator sheet is checked against CALC_FORMULAS below. If
someone changes how the sheet calculates (new line item, new formula), the sync
stops instead of publishing a site that calculates differently from the sheet.

If anything fails, the script exits with an error and writes nothing, so the live
site keeps its last good prices.
"""
import io
import json
import os
import re
import sys
import urllib.request

import openpyxl

# ---------------------------------------------------------------------------
# Product sheets: where each value lives (column letters, data from row 2).
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

# ---------------------------------------------------------------------------
# The calculator sheet. Every formula in it, written as it appears in the sheet
# (spaces are ignored). {name} captures a rate into rates.json, {_} is any number
# we don't need (lookup range ends, which grow as rows are added).
# js/calculator.js implements exactly these formulas.
# ---------------------------------------------------------------------------
CALC_SHEET = "CALCULATRE PRICE  HERE"
CALC_FORMULAS = {
    "D6": "=VLOOKUP(D5,Panels!$B$2:$G${_},6,FALSE)",
    "F7": "=D6*D7",
    "D8": "=(VLOOKUP(D5,Panels!$B$2:$D${_},3,FALSE)/1000)*D7",
    "F8": "={mountingPerKw}*D8",
    "F9": "=VLOOKUP(D9,Inverter!$C$2:$H${_},5,FALSE)",
    "F10": '=IF(D10="3 PH",{elecKit3ph},{elecKit1ph})',
    "F11": '=IF(D11="YES",{doubleStorey},0)',
    "F12": "=VLOOKUP(D9,Inverter!$C$2:$H${_},6,FALSE)",
    "F13": '=IF(D13="YES",{tiltMounting},0)',
    "F14": '=IF(D14="YES",{panelRemoval},0)',
    "F15": "=(100%-D15)*{installerPerKw}*D8",
    "F16": "=(100%-D16)*{solarFixed}",
    "F17": "=SUM(F7:F16)",
    "F19": "=IF(AND(D19>={stcZone1Min},D19<={stcZone1Max}),"
           "VLOOKUP(D8,'STC PRICE'!$A${stcZone1From}:$B${stcZone1To},2,FALSE),"
           "VLOOKUP(D8,'STC PRICE'!$A${stcZone2From}:$B${stcZone2To},2,FALSE))",
    "F20": '=IF(D20="YES",{solarVic},0)',
    "F21": '=IF(D21="YES",{solarVicLoan},0)',
    "F22": "=SUM(F19:F21)",
    "F24": "=F17-F22",
    "D29": "=IFERROR(VLOOKUP(D28,Battery!B2:C{_},2,FALSE)*D30,0)",
    "D31": '=IF(D26="YES", VLOOKUP(D28,Battery!$B$2:$G${_},5,FALSE),0)',
    "F31": "=D31*D30",
    "D32": '=IF(D26="YES", VLOOKUP(D28,Battery!$B$2:$G${_},6,FALSE),0)',
    "F33": '=IF(D26="YES",VLOOKUP(D33,Inverter!C2:H{_},5,FALSE),0)',
    # ponytail: garage charge never applies in the sheet (D34 holds a postcode, not YES)
    "F34": '=IF(D26="YES", IF(D34="YES",{_},0),0)',
    "F35": '=IF(D26="YES", {batteryMargin}+(D35*{_}),0)',
    "F36": "=F31+D32+F33+F34+F35",
    "F39": "=IF(AND(D34>={batZoneMin},D34<={batZoneMax}),"
           "VLOOKUP(D29,'BAT STC PRICE'!$A${batStcFrom}:$B${batStcTo},2,FALSE),"
           "VLOOKUP(D29,'BAT STC PRICE'!$A${_}:$B${_},2,FALSE))",
    "F41": "=F36-F39",
    "F44": "=F24+F41-{bundleDiscount}",
}
NUMBER = r"-?\d+(?:\.\d+)?"


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


def get_sheet(wb, name):
    if name not in wb.sheetnames:
        raise SystemExit(f"Sheet '{name}' not found. Found: {', '.join(wb.sheetnames)}")
    return wb[name]


def read_sheet(wb, spec):
    ws = get_sheet(wb, spec["sheet"])
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


def template_regex(template):
    """'={rate}*D8' -> regex with a named group per {rate}; spaces ignored."""
    parts = re.split(r"\{(\w+)\}", re.sub(r"\s+", "", template))
    out = ""
    for i, part in enumerate(parts):
        if i % 2 == 0:
            out += re.escape(part)
        elif part == "_":
            out += NUMBER
        else:
            out += f"(?P<{part}>{NUMBER})"
    return re.compile(out + r"\Z")


def read_rates(formulas_wb, values_wb):
    ws = get_sheet(formulas_wb, CALC_SHEET)
    found = {
        c.coordinate: re.sub(r"\s+", "", c.value)
        for row in ws.iter_rows() for c in row
        if isinstance(c.value, str) and c.value.startswith("=")
    }
    problems = [f"{cell}: new formula {found[cell]}" for cell in found.keys() - CALC_FORMULAS.keys()]
    problems += [f"{cell}: formula removed" for cell in CALC_FORMULAS.keys() - found.keys()]
    rates = {}
    for cell, template in CALC_FORMULAS.items():
        if cell not in found:
            continue
        m = template_regex(template).match(found[cell])
        if not m:
            problems.append(f"{cell}: expected {template}, found {found[cell]}")
            continue
        rates.update({k: float(v) for k, v in m.groupdict().items()})
    if problems:
        raise SystemExit(
            f"The '{CALC_SHEET}' sheet calculates differently from the website now:\n  "
            + "\n  ".join(sorted(problems))
            + "\nUpdate CALC_FORMULAS in scripts/sync_pricelist.py and js/calculator.js. Not publishing."
        )

    values = values_wb[CALC_SHEET]
    # The sheet always looks up battery STC in the zone-1 table: D34 ("DONT CHANGE HERE")
    # holds a fixed postcode. If that changes, the site needs the zone-2 table too.
    bat_postcode = to_number(values["D34"].value)
    if bat_postcode is None or not rates["batZoneMin"] <= bat_postcode <= rates["batZoneMax"]:
        raise SystemExit(f"{CALC_SHEET} D34 (battery STC postcode) is {values['D34'].value!r}, "
                         "expected a zone-1 postcode. Not publishing.")
    rates["batteryMarginAdjustDefault"] = to_number(values["D35"].value) or 0
    return rates


def read_table(wb, sheet, first, last, key):
    ws = get_sheet(wb, sheet)
    rows = []
    for r in range(int(first), int(last) + 1):
        size, amount = to_number(ws[f"A{r}"].value), to_number(ws[f"B{r}"].value)
        if size is not None and amount is not None:
            rows.append({key: size, "amount": amount})
    if not rows:
        raise SystemExit(f"{sheet} rows {int(first)}-{int(last)} are empty. Not publishing.")
    return rows


def read_stc(values_wb, rates):
    return {
        "zone1": {
            "postcodeMin": int(rates["stcZone1Min"]),
            "postcodeMax": int(rates["stcZone1Max"]),
            "rates": read_table(values_wb, "STC PRICE", rates["stcZone1From"], rates["stcZone1To"], "kw"),
        },
        "zone2": {
            "rates": read_table(values_wb, "STC PRICE", rates["stcZone2From"], rates["stcZone2To"], "kw"),
        },
        "battery": read_table(values_wb, "BAT STC PRICE", rates["batStcFrom"], rates["batStcTo"], "kwh"),
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    out_dir = sys.argv[1]
    url = os.environ.get("PRICELIST_SHEET_URL", "").strip()
    if not url:
        raise SystemExit("PRICELIST_SHEET_URL is not set.")

    data = download_xlsx(url)
    values_wb = openpyxl.load_workbook(io.BytesIO(data), data_only=True)
    formulas_wb = openpyxl.load_workbook(io.BytesIO(data))

    results = {}
    for key, spec in SHEETS.items():
        items = read_sheet(values_wb, spec)
        # Safety check: refuse to publish if the list shrank a lot vs. the repo copy,
        # which usually means a column was moved or the wrong sheet was shared.
        repo_file = os.path.join(os.path.dirname(__file__), "..", "data", f"{key}.json")
        try:
            with open(repo_file, encoding="utf-8") as f:
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

    rates = read_rates(formulas_wb, values_wb)
    results["stc"] = read_stc(values_wb, rates)
    results["rates"] = rates
    print(f"Rates: {len(rates)} values, STC rows: "
          f"{len(results['stc']['zone1']['rates'])}/{len(results['stc']['zone2']['rates'])}/"
          f"{len(results['stc']['battery'])}")

    os.makedirs(out_dir, exist_ok=True)
    for key, items in results.items():
        with open(os.path.join(out_dir, f"{key}.json"), "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2, ensure_ascii=False)
            f.write("\n")


if __name__ == "__main__":
    main()
