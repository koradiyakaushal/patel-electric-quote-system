// ============================================================
// Patel Electrical — Price Calculator
// Replicates "CALCULATRE PRICE HERE" sheet from quote.xlsx
// ============================================================

let DATA = { panels: [], inverters: [], batteries: [], stc: {} };
let currentQuoteId = null;

const STORAGE_KEY = 'patel_quotes';

// --- Data Loading ---
async function loadData() {
  const [panels, inverters, batteries, stc] = await Promise.all([
    fetch('data/panels.json').then(r => r.json()),
    fetch('data/inverters.json').then(r => r.json()),
    fetch('data/batteries.json').then(r => r.json()),
    fetch('data/stc.json').then(r => r.json()),
  ]);
  DATA = { panels, inverters, batteries, stc };
  populateDropdowns();
  setDefaults();
  newQuote();
  renderHistory();
}

// --- Populate Dropdowns ---
function populateDropdowns() {
  const panelSel = document.getElementById('panel');
  DATA.panels.forEach((p, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${p.name} (${p.watts}W)`;
    panelSel.appendChild(opt);
  });

  const invSel = document.getElementById('inverter');
  const batInvSel = document.getElementById('batteryInverter');
  DATA.inverters.forEach((inv, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${inv.name} (${inv.phase})`;
    invSel.appendChild(opt);
    batInvSel.appendChild(opt.cloneNode(true));
  });

  const batSel = document.getElementById('battery');
  DATA.batteries.forEach((b, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `${b.name} (${b.kwPerModule} kWh/mod)`;
    batSel.appendChild(opt);
  });
}

// --- Defaults matching Excel ---
function setDefaults() {
  const pi = DATA.panels.findIndex(p => p.name === 'Jinko 475 n tiger');
  if (pi >= 0) document.getElementById('panel').value = pi;

  const ii = DATA.inverters.findIndex(inv => inv.name === 'GOODWE 9.9 KW 3 ET G2 PH HYBRID');
  if (ii >= 0) document.getElementById('inverter').value = ii;

  const bi = DATA.batteries.findIndex(b => b.name === 'GOODWE 3.2');
  if (bi >= 0) document.getElementById('battery').value = bi;

  const bii = DATA.inverters.findIndex(inv => inv.name === 'NO INVERTER');
  if (bii >= 0) document.getElementById('batteryInverter').value = bii;
}

// --- Quote ID Generator (4-digit number) ---
function generateQuoteId() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// --- STC Lookup ---
function lookupSTC(systemKw, postcode) {
  const zone = (postcode >= DATA.stc.zone1.postcodeMin && postcode <= DATA.stc.zone1.postcodeMax)
    ? DATA.stc.zone1 : DATA.stc.zone2;
  const zoneLabel = zone === DATA.stc.zone1 ? 'Zone 1 (3350-3750)' : 'Zone 2';

  const rounded = Math.round(systemKw * 1000) / 1000;
  const exact = zone.rates.find(r => Math.abs(r.kw - rounded) < 0.01);
  if (exact) return { amount: exact.amount, zone: zoneLabel, matched: true, matchedKw: exact.kw };

  let closest = zone.rates[0], minDiff = Math.abs(zone.rates[0].kw - rounded);
  for (const r of zone.rates) {
    const diff = Math.abs(r.kw - rounded);
    if (diff < minDiff) { minDiff = diff; closest = r; }
  }
  return { amount: closest.amount, zone: zoneLabel, matched: false, matchedKw: closest.kw };
}

// --- Format ---
function fmt(val) {
  return '$' + Math.abs(val).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// --- Get current form state ---
function getFormState() {
  return {
    panel: document.getElementById('panel').value,
    numPanels: document.getElementById('numPanels').value,
    inverter: document.getElementById('inverter').value,
    doubleStorey: document.getElementById('doubleStorey').checked,
    tiltMounting: document.getElementById('tiltMounting').checked,
    panelRemoval: document.getElementById('panelRemoval').checked,
    installerDiscount: document.getElementById('installerDiscount').value,
    marginDiscount: document.getElementById('marginDiscount').value,
    postcode: document.getElementById('postcode').value,
    solarVic: document.getElementById('solarVic').checked,
    solarVicLoan: document.getElementById('solarVicLoan').checked,
    batteryRequired: document.getElementById('batteryRequired').checked,
    battery: document.getElementById('battery').value,
    numModules: document.getElementById('numModules').value,
    batteryInverter: document.getElementById('batteryInverter').value,
    garageInstall: document.getElementById('garageInstall').checked,
    batteryMarginDiscount: document.getElementById('batteryMarginDiscount').value,
  };
}

// --- Load form state ---
function loadFormState(s) {
  document.getElementById('panel').value = s.panel;
  document.getElementById('numPanels').value = s.numPanels;
  document.getElementById('inverter').value = s.inverter;
  document.getElementById('doubleStorey').checked = s.doubleStorey;
  document.getElementById('tiltMounting').checked = s.tiltMounting;
  document.getElementById('panelRemoval').checked = s.panelRemoval;
  document.getElementById('installerDiscount').value = s.installerDiscount;
  document.getElementById('marginDiscount').value = s.marginDiscount;
  document.getElementById('postcode').value = s.postcode;
  document.getElementById('solarVic').checked = s.solarVic;
  document.getElementById('solarVicLoan').checked = s.solarVicLoan;
  document.getElementById('batteryRequired').checked = s.batteryRequired;
  document.getElementById('battery').value = s.battery;
  document.getElementById('numModules').value = s.numModules;
  document.getElementById('batteryInverter').value = s.batteryInverter;
  document.getElementById('garageInstall').checked = s.garageInstall;
  document.getElementById('batteryMarginDiscount').value = s.batteryMarginDiscount;
  calculate();
}

// --- Main Calculation ---
function calculate() {
  const panel = DATA.panels[document.getElementById('panel').value];
  const numPanels = parseInt(document.getElementById('numPanels').value) || 0;
  const inverter = DATA.inverters[document.getElementById('inverter').value];
  const doubleStorey = document.getElementById('doubleStorey').checked;
  const tiltMounting = document.getElementById('tiltMounting').checked;
  const panelRemoval = document.getElementById('panelRemoval').checked;
  const installerDiscount = (parseFloat(document.getElementById('installerDiscount').value) || 0) / 100;
  const marginDiscount = (parseFloat(document.getElementById('marginDiscount').value) || 0) / 100;

  const postcode = parseInt(document.getElementById('postcode').value) || 0;
  const solarVic = document.getElementById('solarVic').checked;
  const solarVicLoan = document.getElementById('solarVicLoan').checked;

  const batteryRequired = document.getElementById('batteryRequired').checked;
  const battery = DATA.batteries[document.getElementById('battery').value];
  const numModules = parseInt(document.getElementById('numModules').value) || 0;
  const batteryInverter = DATA.inverters[document.getElementById('batteryInverter').value];
  const garageInstall = document.getElementById('garageInstall').checked;
  const batteryMarginDiscount = (parseFloat(document.getElementById('batteryMarginDiscount').value) || 0) / 100;

  if (!panel || !inverter) return;

  // ---- SOLAR (matching Excel exactly) ----
  const panelUnitPrice = panel.priceIncGst;
  const panelTotal = panelUnitPrice * numPanels;
  const systemKw = (panel.watts / 1000) * numPanels;
  const mountingCost = 60 * systemKw;
  const inverterCost = inverter.priceIncGst;
  const phase = inverter.phase;
  const is3Phase = phase.includes('3');
  const electricalKit = is3Phase ? 400 : 150;
  const doubleStoreyAmt = doubleStorey ? 800 : 0;
  const smartMeter = inverter.smartMeter;
  const tiltAmt = tiltMounting ? 130 : 0;
  const panelRemovalAmt = panelRemoval ? 300 : 0;
  const installerCost = (1 - installerDiscount) * 300 * systemKw;
  const fixExpenses = (1 - marginDiscount) * 900;
  const solarTotal = panelTotal + mountingCost + inverterCost + electricalKit
    + doubleStoreyAmt + smartMeter + tiltAmt + panelRemovalAmt
    + installerCost + fixExpenses;

  // ---- REBATES ----
  const stcResult = lookupSTC(systemKw, postcode);
  const stcDiscount = stcResult.amount;
  const solarVicAmt = solarVic ? 1400 : 0;
  const solarVicLoanAmt = solarVicLoan ? 1400 : 0;
  const totalRebates = stcDiscount + solarVicAmt + solarVicLoanAmt;
  const solarAfterRebates = solarTotal - totalRebates;

  // ---- BATTERY ----
  let battCapacity = 0, moduleTotal = 0, battKit = 0, battInvCost = 0;
  let battGarage = 0, battMargin = 0, battTotal = 0, battSTC = 0, battUpfront = 0;

  if (batteryRequired && battery) {
    battCapacity = battery.kwPerModule * numModules;
    moduleTotal = battery.priceIncGst * numModules;
    battKit = battery.kit;
    battInvCost = batteryInverter ? batteryInverter.priceIncGst : 0;
    battGarage = garageInstall ? 300 : 0;
    battMargin = 3500 + (batteryMarginDiscount * 3500);
    battTotal = moduleTotal + battKit + battInvCost + battGarage + battMargin;
    battSTC = Math.floor(battCapacity * 8.4) * 38;
    battUpfront = battTotal - battSTC;
  }

  const grandTotal = solarAfterRebates + battUpfront;

  // ---- UPDATE INLINE DISPLAYS (Excel-like per-row feedback) ----
  const $ = id => document.getElementById(id);

  $('panelPriceInfo').textContent = `${fmt(panelUnitPrice)}/panel = ${fmt(panelTotal)}`;
  $('systemSizeInfo').textContent = `${systemKw.toFixed(2)} kW`;
  $('mountingCostDisplay').textContent = `${systemKw.toFixed(2)} kW x $60 = ${fmt(mountingCost)}`;
  $('phaseInfo').textContent = is3Phase ? '3 Phase' : '1 Phase';
  $('elecKitDisplay').textContent = fmt(electricalKit);
  $('dblVal').textContent = doubleStorey ? fmt(800) : '$0';
  $('smartMeterDisplay').textContent = fmt(smartMeter);
  $('tiltVal').textContent = tiltMounting ? fmt(130) : '$0';
  $('removeVal').textContent = panelRemoval ? fmt(300) : '$0';
  $('installerCostDisplay').textContent = `${systemKw.toFixed(2)} kW x $300 = ${fmt(installerCost)}`;
  $('fixExpDisplay').textContent = fmt(fixExpenses);

  $('zoneInfo').textContent = stcResult.zone + (stcResult.matched ? '' : ` (nearest: ${stcResult.matchedKw} kW)`);
  $('vicVal').textContent = solarVic ? fmt(1400) : '$0';
  $('vicLoanVal').textContent = solarVicLoan ? fmt(1400) : '$0';

  // Battery section
  const batFields = $('batteryFields');
  batFields.classList.toggle('off', !batteryRequired);

  if (batteryRequired && battery) {
    $('battCapInfo').textContent = `${battCapacity.toFixed(1)} kWh total`;
    $('modCostInfo').textContent = `${fmt(battery.priceIncGst)}/module`;
    $('modTotalDisplay').textContent = `x ${numModules} = ${fmt(moduleTotal)}`;
    $('battKitDisplay').textContent = fmt(battKit);
    $('garageVal').textContent = garageInstall ? fmt(300) : '$0';
    $('battMarginDisplay').textContent = fmt(battMargin);
  }

  // ---- SUMMARY STRIP ----
  $('summaryStrip').innerHTML = `
    <div class="chip"><div class="chip-label">System</div><div class="chip-val">${systemKw.toFixed(1)} kW</div></div>
    <div class="chip"><div class="chip-label">Solar</div><div class="chip-val">${fmt(solarTotal)}</div></div>
    <div class="chip"><div class="chip-label">Rebates</div><div class="chip-val" style="color:#16a34a">-${fmt(totalRebates)}</div></div>
    ${batteryRequired ? `<div class="chip"><div class="chip-label">Battery ${battCapacity.toFixed(0)} kWh</div><div class="chip-val">${fmt(battUpfront)}</div></div>` : ''}
    <div class="chip total"><div class="chip-label">${batteryRequired ? 'Solar + Battery' : 'Customer'} Total</div><div class="chip-val">${fmt(grandTotal)}</div></div>
  `;

  // ---- QUOTE TABLE ----
  const rows = [];
  const sec = (title, cls) => rows.push(`<tr class="sec ${cls}"><td colspan="3">${title}</td></tr>`);
  const item = (lbl, dtl, amt, cls = 'item') => rows.push(`<tr class="${cls}"><td class="lbl">${lbl}</td><td class="dtl">${dtl}</td><td class="amt">${amt}</td></tr>`);
  const sub = (lbl, amt) => rows.push(`<tr class="sub"><td colspan="2">${lbl}</td><td class="amt">${amt}</td></tr>`);

  sec('Solar System', 'solar');
  item('Panel', `${panel.name} (${panel.watts}W) &times; ${numPanels}`, fmt(panelTotal));
  item('Mounting', `${systemKw.toFixed(2)} kW &times; $60/kW`, fmt(mountingCost));
  item('Inverter', inverter.name, fmt(inverterCost));
  item('Electrical Kit', is3Phase ? '3 Phase' : '1 Phase', fmt(electricalKit));
  if (doubleStoreyAmt) item('Double Storey', 'Surcharge', fmt(doubleStoreyAmt));
  if (smartMeter) item('Smart Meter', '', fmt(smartMeter));
  if (tiltAmt) item('Tilt Mounting', 'Surcharge', fmt(tiltAmt));
  if (panelRemovalAmt) item('Old Panel Removal', '', fmt(panelRemovalAmt));
  item('Installer Cost', `${systemKw.toFixed(2)} kW &times; $300` + (installerDiscount > 0 ? ` (${(installerDiscount*100).toFixed(0)}% disc.)` : ''), fmt(installerCost));
  item('Fix Expenses & Margin', (marginDiscount > 0 ? `$900 (${(marginDiscount*100).toFixed(0)}% disc.)` : '$900'), fmt(fixExpenses));
  sub('Solar Subtotal', fmt(solarTotal));

  sec('Rebates & Discounts', 'rebates');
  item('STC Discount', `${stcResult.zone}` + (!stcResult.matched ? ` &mdash; nearest ${stcResult.matchedKw} kW` : ` &mdash; ${stcResult.matchedKw} kW`), '-' + fmt(stcDiscount), 'item rebate');
  if (solarVicAmt) item('Solar VIC Rebate', 'Eligible', '-' + fmt(solarVicAmt), 'item rebate');
  if (solarVicLoanAmt) item('Solar VIC 0% Int Loan', 'Eligible', '-' + fmt(solarVicLoanAmt), 'item rebate');
  sub('Total Rebates', '-' + fmt(totalRebates));

  rows.push(`<tr class="highlight"><td colspan="2">Total Inc. GST (Solar)</td><td class="amt">${fmt(solarAfterRebates)}</td></tr>`);

  if (batteryRequired && battery) {
    sec('Battery System', 'battery');
    item('Battery Modules', `${battery.name} &times; ${numModules} (${battCapacity.toFixed(1)} kWh)`, fmt(moduleTotal));
    item('Battery Kit', '', fmt(battKit));
    if (battInvCost) item('Battery Inverter', batteryInverter.name, fmt(battInvCost));
    if (battGarage) item('Garage Install', '', fmt(battGarage));
    item('Fix Expenses & Margin', (batteryMarginDiscount !== 0 ? `$3,500 (${(batteryMarginDiscount*100).toFixed(0)}% adj.)` : '$3,500'), fmt(battMargin));
    sub('Battery Installation Cost', fmt(battTotal));
    item('Battery STC', `${Math.floor(battCapacity * 8.4)} STCs &times; $38`, '-' + fmt(battSTC), 'item rebate');
    sub('Upfront Battery Price', fmt(battUpfront));
  }

  rows.push(`<tr class="grand"><td colspan="2">${batteryRequired ? 'Battery Plus Solar Total' : 'Customer Total'}</td><td class="amt">${fmt(grandTotal)}</td></tr>`);

  $('quoteBody').innerHTML = rows.join('');
}

// ================================================================
// QUOTE HISTORY — localStorage
// ================================================================

function getQuotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveQuotes(quotes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes));
}

function newQuote() {
  currentQuoteId = generateQuoteId();
  document.getElementById('quoteId').textContent = '#' + currentQuoteId;
  setDefaults();
  // Reset toggles
  ['doubleStorey','tiltMounting','panelRemoval','solarVic','solarVicLoan','garageInstall'].forEach(id => {
    document.getElementById(id).checked = false;
  });
  document.getElementById('batteryRequired').checked = true;
  document.getElementById('numPanels').value = 28;
  document.getElementById('numModules').value = 16;
  document.getElementById('installerDiscount').value = 0;
  document.getElementById('marginDiscount').value = 0;
  document.getElementById('batteryMarginDiscount').value = 0;
  document.getElementById('postcode').value = 3978;
  calculate();
}

function saveQuote() {
  const state = getFormState();
  const panel = DATA.panels[state.panel];
  const inverter = DATA.inverters[state.inverter];
  const battery = state.batteryRequired ? DATA.batteries[state.battery] : null;
  const systemKw = panel ? ((panel.watts / 1000) * parseInt(state.numPanels)).toFixed(1) : '?';

  // Build description
  let desc = `${systemKw}kW ${panel ? panel.name : ''}`;
  if (battery && state.batteryRequired) {
    const cap = (battery.kwPerModule * parseInt(state.numModules)).toFixed(0);
    desc += ` + ${cap}kWh ${battery.name}`;
  }

  // Calculate grand total for display
  const grandTotalEl = document.querySelector('.grand .amt');
  const grandTotal = grandTotalEl ? grandTotalEl.textContent : '$0';

  const quotes = getQuotes();
  const existingIdx = quotes.findIndex(q => q.id === currentQuoteId);
  const entry = {
    id: currentQuoteId,
    desc,
    total: grandTotal,
    state,
    date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }),
  };

  if (existingIdx >= 0) {
    quotes[existingIdx] = entry;
    toast('Quote #' + currentQuoteId + ' updated');
  } else {
    quotes.unshift(entry);
    toast('Quote #' + currentQuoteId + ' saved');
  }

  saveQuotes(quotes);
  renderHistory();
}

function loadQuote(id) {
  const quotes = getQuotes();
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  currentQuoteId = q.id;
  document.getElementById('quoteId').textContent = '#' + currentQuoteId;
  loadFormState(q.state);
  toast('Loaded quote #' + id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cloneQuote(id) {
  const quotes = getQuotes();
  const q = quotes.find(q => q.id === id);
  if (!q) return;
  currentQuoteId = generateQuoteId();
  document.getElementById('quoteId').textContent = '#' + currentQuoteId;
  loadFormState(q.state);
  toast('Cloned as #' + currentQuoteId);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteQuote(id) {
  let quotes = getQuotes();
  quotes = quotes.filter(q => q.id !== id);
  saveQuotes(quotes);
  renderHistory();
  toast('Quote #' + id + ' deleted');
}

function renderHistory() {
  const quotes = getQuotes();
  const list = document.getElementById('historyList');

  if (quotes.length === 0) {
    list.innerHTML = '<li class="history-empty">No saved quotes yet. Click "Save Quote" to save the current quote.</li>';
    return;
  }

  list.innerHTML = quotes.map(q => `
    <li class="history-item">
      <span class="history-id">#${q.id}</span>
      <span class="history-desc">${q.desc}</span>
      <span class="history-price">${q.total}</span>
      <span class="history-date">${q.date}</span>
      <span class="history-actions">
        <button class="btn-sm btn-edit" onclick="loadQuote('${q.id}')">Edit</button>
        <button class="btn-sm btn-clone" onclick="cloneQuote('${q.id}')">Clone</button>
        <button class="btn-sm btn-del" onclick="deleteQuote('${q.id}')">Del</button>
      </span>
    </li>
  `).join('');
}

// --- Toast notification ---
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2000);
}

// --- Wire up events ---
function wireEvents() {
  const ids = [
    'panel', 'numPanels', 'inverter', 'doubleStorey', 'tiltMounting', 'panelRemoval',
    'installerDiscount', 'marginDiscount', 'postcode', 'solarVic', 'solarVicLoan',
    'batteryRequired', 'battery', 'numModules', 'batteryInverter', 'garageInstall',
    'batteryMarginDiscount'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('change', calculate);
    el.addEventListener('input', calculate);
  });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadData().then(() => wireEvents());
});
