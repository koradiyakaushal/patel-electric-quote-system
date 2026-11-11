# Price list sync (Google Drive → website)

The website's panel, inverter and battery prices come from the existing price
workbook in Google Drive. A GitHub Action reads it every hour and republishes
the site. Edit prices in the sheet only — no code changes needed.

## One-time setup

1. **Share the sheet**: in Google Drive, Share → General access →
   "Anyone with the link" → **Viewer**. Copy the link.
2. **Add the secret**: GitHub repo → Settings → Secrets and variables → Actions →
   New repository secret. Name: `PRICELIST_SHEET_URL`, value: the link.
3. **Switch Pages to Actions**: Settings → Pages → Build and deployment →
   Source: **GitHub Actions**.
4. Run it once: Actions tab → "Sync price list and deploy site" → **Run workflow**.

The workflow only has read access to the repo; it never commits. Its only extra
permission is publishing the website.

## What it reads

| Sheet | What | Website file |
|-------|------|--------------|
| Panels | B name, C cents/watt, D watts, G price inc GST | `data/panels.json` |
| Inverter | C name, D phase, G price inc GST, H smart meter | `data/inverters.json` |
| Battery | B name, C kWh per module, F price inc GST, G kit | `data/batteries.json` |
| Gateway | B name, E price inc GST | `data/gateways.json` |
| STC PRICE, BAT STC PRICE | A size, B amount (row ranges come from the calculator formulas) | `data/stc.json` |
| CALCULATRE PRICE  HERE | the fixed rates inside its formulas: mounting $/kW, electrical kit, double storey, tilt, panel removal, installer $/kW, fixed margin, Solar VIC amounts, STC zone postcodes, battery margin (and its default % in D35), solar + battery discount | `data/rates.json` |

- Adding, removing or editing product rows is fine. Changing a rate inside a formula
  (e.g. double storey 600 -> 700) is fine too, the site picks it up.
- **Don't move or insert columns** in the product sheets. If you must, update the column
  letters at the top of `scripts/sync_pricelist.py`.
- Blank rows and rows without a price are skipped.
- **If the calculator's formulas change shape** (a new line item, a new formula, a
  different calculation), the sync stops on purpose and the site keeps its last prices,
  because the site would otherwise calculate differently from the sheet. The error lists
  the cells that changed; update `CALC_FORMULAS` in the script and `js/calculator.js`.

Differences from the sheet, on purpose:
- STC sizes not in the table: the sheet shows #N/A; the site uses the next smaller size
  (smaller rebate) and shows a warning.
- The sheet's "garage" line (F34) can never apply, so the site has no garage option.
- Battery STC always uses the zone-1 table, like the sheet (D34 "DONT CHANGE HERE").

## When it fails

If the sheet can't be downloaded or looks wrong (missing sheet, or far fewer rows
than before), the run fails and **the live site keeps its last good prices**.
GitHub emails you about the failed run; the log says what was wrong.

## Notes

- Updates appear within about an hour (GitHub's schedule can run a few minutes
  late). Use "Run workflow" for an immediate update.
- The JSON files in `data/` are only a fallback copy; the live site uses the sheet.
- If the link leaks, turn link sharing off and on to get a new link, then update
  the secret.
