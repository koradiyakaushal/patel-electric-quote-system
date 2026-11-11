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

| Sheet | Columns used (data from row 2) |
|-------|--------------------------------|
| Panels | B name, C cents/watt, D watts, G price inc GST |
| Inverter | C name, D phase, G price inc GST, H smart meter |
| Battery | B name, C kWh per module, F price inc GST, G kit |

- Adding, removing or editing rows is fine.
- **Don't move or insert columns** in these sheets. If you must, update the column
  letters at the top of `scripts/sync_pricelist.py`.
- Blank rows and rows without a price are skipped.

Not synced (still in the repo): the STC table (`data/stc.json`) and the fixed
rates such as mounting, installer and margins (`js/calculator.js`).

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
