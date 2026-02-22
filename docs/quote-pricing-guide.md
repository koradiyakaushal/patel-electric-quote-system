# Quote Pricing Guide — `quote.xlsx`

This document explains how every price calculation works in `quote.xlsx`.

---

## Pylon Integration — How Component Pricing Maps

### What Goes Into Pylon (customer-visible)

The file `pylon-component-prices.csv` contains all **156 components** (14 panels, 97 inverters, 45 batteries) imported at **actual cost (inc GST)** from `quote.xlsx`. These are the items customers see on the proposal:

| Pylon Component | Source in quote.xlsx | Customer Sees |
|----------------|---------------------|---------------|
| Panel | Panels sheet, column G (inc GST) | Name + quantity |
| Inverter | Inverter sheet, column G (inc GST) | Name + quantity |
| Battery | Battery sheet, column F (inc GST) | Name + quantity |

### What Stays Hidden (NOT in Pylon components)

These costs are **not imported as Pylon components** — they're baked into the total system price you set when creating each quote. The customer never sees them as separate line items:

| Hidden Cost | Rate | How to Account for It |
|------------|------|----------------------|
| **Mounting** | $60/kW | Add to system price based on system size |
| **Electrical kit** | $150 (1PH) / $400 (3PH) | Add based on inverter phase |
| **Installer cost** | $300/kW | Add to system price based on system size |
| **Fix expenses & margin (solar)** | $900 | Always included in solar quotes |
| **Fix expenses & margin (battery)** | $3,500 | Always included when battery is added |
| **Smart meter** | $150 (most inverters) | Add if inverter requires it |
| **Battery kit** | Varies by battery brand | Add from Battery sheet column G |
| **Double storey** | $800 | Add if applicable (note on proposal) |
| **Tilt mounting** | $130 | Add if applicable |
| **Old panel removal** | $300 | Add if applicable |
| **Garage install** | $300 | Add if applicable (battery) |

### How It Works in Practice

Looking at the sample proposal (page 7), Pylon shows:

```
13.3kW Solar system with 51.2kWh battery storage    $31,694.00
  Inverter: GoodWe ET G2 GW9900-ET-20 (9.9kW)  ×1    (incl.)
  Battery:  GoodWe LX F25.6-H-20 (25.6kWh)     ×2    (incl.)
  Panel:    Jinko Solar Tiger Neo (475W)         ×28   (incl.)
  Balance of system                                     (incl.)
  Installation & labour                                 (incl.)
                                              ──────────────────
  Subtotal inc GST                               $31,694.00
  78 STCs × $38.00                               −$2,964.00
  420 Battery STCs × $37.00                     −$15,540.00
                                              ──────────────────
  Total inc GST                                  $13,190.00
```

**The workflow is:**
1. Select components in Pylon (panel, inverter, battery) — prices auto-fill from the CSV
2. Calculate the **total system price** using the `CALCULATRE PRICE HERE` sheet in `quote.xlsx`
3. Set that total as the system price in Pylon — hidden costs are absorbed into the spread
4. Pylon auto-calculates STCs and deducts them
5. Customer sees: system total − STCs = final price

### Profit Tracking

Your actual profit per job = **System price** − (component costs + hidden costs + STCs)

The CSV has margins set to $0/0% because the real margin is managed at the quote level. If you want Pylon to track internal profitability per component, you can update the margin columns later.

---

## Workbook Overview

The workbook has **10 sheets**:

| Sheet | Purpose |
|-------|---------|
| **CALCULATRE PRICE HERE** | Main automated price calculator (primary tool) |
| **Panels** | Panel catalog/lookup table |
| **Inverter** | Inverter catalog/lookup table |
| **Battery** | Battery catalog/lookup table |
| **Gateway** | Gateway catalog/lookup table |
| **STC PRICE** | STC rebate lookup by system size and postcode zone |
| **BATTERY capacity size** | Battery spec reference (kWh, modules, cycles) |
| **solar quote** | Older comprehensive manual quoting sheet |
| **Sheet1** | Legacy manual calculator and brand comparison tables |
| **enphase calculation** | Enphase micro-inverter cost breakdown |

The **"CALCULATRE PRICE HERE"** sheet is the main tool — everything else feeds into it.

---

## How the Main Calculator Works

The main calculator ("CALCULATRE PRICE HERE") has **three sections**: Solar, Rebates, and Battery. Here's the full flow:

```
┌──────────────────────────────────────────────────────────┐
│                    USER INPUTS                           │
│  Panel brand, # of panels, Inverter, Battery brand,     │
│  # of modules, Postcode, YES/NO options                 │
└──────────┬───────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────┐    ┌──────────────────────┐
│   SOLAR TOTAL (F17)  │    │  BATTERY TOTAL (F36) │
│   SUM of all solar   │    │  SUM of all battery  │
│   component costs    │    │  component costs     │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  - STC Discount      │    │  - Battery STC       │
│  - Solar VIC Rebate  │    │                      │
│  - Solar VIC Loan    │    │                      │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           ▼                           ▼
┌──────────────────────┐    ┌──────────────────────┐
│  SOLAR PRICE (F24)   │    │  UPFRONT BAT (F41)   │
│  = F17 - Rebates     │    │  = F36 - Bat STC     │
└──────────┬───────────┘    └──────────┬───────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
            ┌──────────────────────┐
            │  FINAL PRICE (F44)   │
            │  = F24 + F41         │
            └──────────────────────┘
```

---

## Solar Pricing (Cells F7–F17)

### Inputs

| Cell | Input | Example |
|------|-------|---------|
| D5 | Panel brand (dropdown from Panels sheet) | "Jinko 475 n tiger" |
| D7 | Number of panels | 28 |
| D9 | Inverter (dropdown from Inverter sheet) | "GOODWE 9.9 KW 3 ET G2 PH HYBRID" |
| D11 | Double storey? (YES/NO) | NO |
| D13 | Tilt mounting? (YES/NO) | NO |
| D14 | Old panel removal? (YES/NO) | NO |
| D15 | Installer discount % | 0% |
| D16 | Margin discount % | 0% |

### Calculated Costs

| Cell | Line Item | Formula | How It Works |
|------|-----------|---------|--------------|
| D6 | Panel unit price | `VLOOKUP(D5, Panels!B2:G16, 6, FALSE)` | Looks up the panel's inc-GST price from the Panels sheet |
| F7 | **Panel total** | `D6 × D7` | Unit price × number of panels |
| D8 | System size (kW) | `VLOOKUP(D5, Panels!B2:D16, 3, FALSE) / 1000 × D7` | Looks up wattage per panel, converts to kW, multiplies by panel count |
| F8 | **Mounting cost** | `$60 × D8` | **$60 per kW** of system size |
| F9 | **Inverter cost** | `VLOOKUP(D9, Inverter!C2:H100, 5, FALSE)` | Looks up inverter inc-GST price |
| D10 | Phase (auto) | `VLOOKUP(D9, Inverter!C2:D100, 2, FALSE)` | Auto-detects phase from inverter selection |
| F10 | **Electrical kit** | `IF(D10 = "3 PH", 400, 150)` | **$400 for 3-phase**, **$150 for 1-phase** |
| F11 | **Double storey** | `IF(D11 = "YES", 800, 0)` | **$800** if double storey |
| F12 | **Smart meter** | `VLOOKUP(D9, Inverter!C2:H100, 6, FALSE)` | Looked up from Inverter sheet (usually **$150** or **$0**) |
| F13 | **Tilt mounting** | `IF(D13 = "YES", 130, 0)` | **$130** surcharge |
| F14 | **Panel removal** | `IF(D14 = "YES", 300, 0)` | **$300** for removing old panels |
| F15 | **Installer cost** | `(1 - D15) × $300 × D8` | **$300 per kW**, reduced by installer discount % |
| F16 | **Fix expenses & margin** | `(1 - D16) × $900` | Base **$900**, reduced by margin discount % |
| **F17** | **SOLAR TOTAL** | `SUM(F7:F16)` | Sum of all solar line items |

### Example Calculation

For 28× Jinko 475W panels + Goodwe 9.9kW 3PH Hybrid inverter:
```
Panel total:     28 × $109.73  =  $3,072.30
Mounting:        13.3kW × $60  =    $798.00
Inverter:                      =  $2,744.50
Electrical kit:  (3-phase)     =    $400.00
Installer:       13.3kW × $300 =  $3,990.00
Margin:                        =    $900.00
Smart meter:                   =    $150.00
                                 ──────────
SOLAR TOTAL:                   = $12,054.80
```

---

## Rebates / Discounts (Cells F19–F24)

### Inputs

| Cell | Input | Example |
|------|-------|---------|
| D19 | Postcode | 3978 |
| D20 | Solar VIC rebate eligible? (YES/NO) | NO |
| D21 | Solar VIC 0% loan eligible? (YES/NO) | NO |

### Calculated Rebates

| Cell | Rebate | Formula | How It Works |
|------|--------|---------|--------------|
| F19 | **STC discount** | `IF(postcode between 3350–3750, zone1 lookup, zone2 lookup)` | Looks up STC count from the "STC PRICE" sheet based on system kW and postcode zone, then multiplies by **$39 per STC** |
| F20 | **Solar VIC rebate** | `IF(D20 = "YES", 1400, 0)` | **$1,400** if eligible |
| F21 | **Solar VIC 0% loan** | `IF(D21 = "YES", 1400, 0)` | **$1,400** if eligible |
| F22 | **Total rebates** | `SUM(F19:F21)` | Sum of all rebates |
| **F24** | **SOLAR PRICE (after rebates)** | `F17 - F22` | Solar total minus all rebates |

### STC Zone Rules

| Zone | Postcodes | STCs are... |
|------|-----------|-------------|
| Zone 1 | 3350 – 3750 | **Higher** (more sun exposure) |
| Zone 2 | All other postcodes | **Lower** |

### STC Lookup Examples (Zone 2)

| System Size | STCs | Discount |
|-------------|------|----------|
| 6.6 kW | 39 | $1,521 |
| 10.12 kW | 59 | $2,301 |
| 13.2 kW | 78 | $3,042 |
| 14.96 kW | 88 | $3,432 |
| 19.36 kW | 114 | $4,446 |

---

## Battery Pricing (Cells F31–F41)

### Inputs

| Cell | Input | Example |
|------|-------|---------|
| D26 | Battery required? (YES/NO) | YES |
| D28 | Battery brand (dropdown from Battery sheet) | "GOODWE 3.2" |
| D30 | Number of modules | 16 |
| D33 | Battery inverter (dropdown) | "NO INVERTER" |
| D34 | Garage install? (YES/NO) | NO |
| D35 | Margin discount % | 0% |

### Calculated Costs

| Cell | Line Item | Formula | How It Works |
|------|-----------|---------|--------------|
| D29 | Total battery capacity | `VLOOKUP(battery, Battery!B2:C48, 2) × D30` | kWh per module × number of modules |
| D31 | Module unit cost | `VLOOKUP(battery, Battery!B2:G48, 5, FALSE)` | Looks up inc-GST price per module |
| F31 | **Module total** | `D31 × D30` | Unit cost × number of modules |
| D32 | **Battery kit** | `VLOOKUP(battery, Battery!B2:G48, 6, FALSE)` | Looks up kit cost (cables, brackets, etc.) |
| F33 | **Battery inverter** | `VLOOKUP(D33, Inverter!C2:H100, 5, FALSE)` | Inverter cost if a separate one is needed; $0 for "NO INVERTER" |
| F34 | **Garage install** | `IF(YES, 300, 0)` | **$300** if installed in garage |
| F35 | **Fix expenses & margin** | `$3,500 × (1 + D35)` | Base **$3,500** adjusted by margin discount |
| **F36** | **BATTERY TOTAL** | `F31 + D32 + F33 + F34 + F35` | Sum of all battery costs |

### Battery STC Rebate

| Cell | Formula | How It Works |
|------|---------|--------------|
| F39 | `ROUNDDOWN(D29 × 8.4, 0) × $38` | Total kWh × 8.4 factor, rounded down, then × **$38 per STC** |
| **F41** | `F36 - F39` | Battery total minus battery STC = **upfront battery cost** |

### Battery STC Calculation Explained

The battery STC formula works like this:
```
Battery STCs = ROUNDDOWN(total_kWh × 8.4)
Battery STC Discount = Battery STCs × $38

Example: 51.2 kWh battery
  STCs = ROUNDDOWN(51.2 × 8.4) = ROUNDDOWN(430.08) = 430
  Discount = 430 × $38 = $16,340
```

The **8.4** factor represents the deemed generation/storage hours used in the STC deeming calculation.

---

## Final Price (Cell F44)

```
FINAL CUSTOMER PRICE = Solar Price (after rebates) + Upfront Battery Cost
                     = F24 + F41
```

If no battery is selected (`D26 = "NO"`), all battery costs and STCs are $0, so the final price equals the solar price.

---

## Key Constants Reference

| Constant | Value | Where Used |
|----------|-------|------------|
| GST rate | **10%** | All lookup sheets (Price / 10) |
| Solar STC price | **$39** per STC | STC PRICE sheet |
| Battery STC price | **$38** per STC | Main calculator F39 |
| Battery STC factor | **8.4** | Main calculator F39 |
| Mounting rate | **$60** per kW | Main calculator F8 |
| Installer rate | **$300** per kW | Main calculator F15 |
| Fix expenses (solar) | **$900** | Main calculator F16 |
| Fix expenses (battery) | **$3,500** | Main calculator F35 |
| Electrical kit (1-phase) | **$150** | Main calculator F10 |
| Electrical kit (3-phase) | **$400** | Main calculator F10 |
| Double storey surcharge | **$800** | Main calculator F11 |
| Tilt mounting surcharge | **$130** | Main calculator F13 |
| Old panel removal | **$300** | Main calculator F14 |
| Garage install | **$300** | Main calculator F34 |
| Solar VIC rebate | **$1,400** | Main calculator F20 |
| Solar VIC 0% loan | **$1,400** | Main calculator F21 |
| Smart meter | **$150** (most inverters) | Inverter sheet col H |
| Higher STC zone postcodes | **3350 – 3750** | Main calculator F19 |

---

## Lookup Sheets Structure

### Panels Sheet

Each panel has: Name → Cents/Watt → Wattage → Price ex-GST → GST → **Total inc GST**

```
Price ex-GST = Cents/Watt × Wattage
GST = Price / 10
Total = Price + GST
```

The main calculator pulls the **Total inc GST** (column G) via VLOOKUP.

### Inverter Sheet

Each inverter has: Name → Phase → Price ex-GST → GST → **Total inc GST** → Smart Meter price

The main calculator pulls:
- **Total inc GST** (column G) for the inverter cost
- **Phase** (column D) to determine electrical kit price
- **Smart Meter** (column H) for smart meter cost

### Battery Sheet

Each battery has: Name → kWh per module → Price ex-GST → GST → **Total inc GST** → Kit cost

The main calculator pulls:
- **kWh per module** (column C) to calculate total capacity
- **Total inc GST** (column F) for module cost
- **Kit cost** (column G) for battery installation kit

---

## Other Sheets (Reference Only)

### solar quote (older manual calculator)

Contains an alternative calculator with slightly different rates:
- Installer rate: **$280 per panel** (vs $300/kW in main calculator)
- Fix expenses (solar): **$800** (vs $900 in main calculator)
- Battery STC: **$38** per STC (same as main)
- Also has pre-computed AC-coupled battery sale prices

### Sheet1 (legacy)

Contains brand comparison tables with pre-computed prices for Growatt, Fronius, Goodwe, Huawei, Sungrow combinations. Uses **$280 per panel** installer rate and different margin values.

### enphase calculation

Simple cost breakdown for Enphase micro-inverter systems (IQ8AC modules, cables, accessories, AC board).

### BATTERY capacity size

Reference table listing max capacity, module count, height, and cycle life for each battery brand.

### STC PRICE

Two lookup tables (Zone 1 and Zone 2) mapping system kW to STC count. The STC dollar amount = STC count × $39.

### Gateway

Pricing for Sigen Gateway SP (single-phase: $705.10 inc GST) and TP (three-phase: $1,730.30 inc GST).
