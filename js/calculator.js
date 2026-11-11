// ============================================================
// Patel Electrical — Price Calculator
// Implements the "CALCULATRE PRICE  HERE" sheet from the price workbook.
// All prices, rates and STC tables come from data/*.json, which
// scripts/sync_pricelist.py builds from the workbook every hour.
// ============================================================

let DATA = { panels: [], inverters: [], batteries: [], gateways: [], stc: {}, rates: {} };
let currentQuoteId = null;

const STORAGE_KEY = 'patel_quotes';
const SEARCH_PLACEHOLDER = 'Type to search…';

const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const byName = (list, name) => list.find(x => x.name === String(name).trim());
const is3Phase = phase => String(phase).includes('3');

// Searchable fields: input id -> the list it picks from
const SEARCH_FIELDS = {
  panel: () => DATA.panels,
  inverter: () => DATA.inverters,
  battery: () => DATA.batteries,
  batteryInverter: () => DATA.inverters,
};

// --- Data Loading ---
async function loadData() {
  const names = ['panels', 'inverters', 'batteries', 'gateways', 'stc', 'rates'];
  try {
    const files = await Promise.all(names.map(n =>
      fetch(`data/${n}.json`, { cache: 'no-cache' }).then(r => { // always revalidate: prices change hourly
        if (!r.ok) throw new Error(`data/${n}.json (${r.status})`);
        return r.json();
      })));
    names.forEach((n, i) => { DATA[n] = files[i]; });
  } catch (e) {
    $('totalSolar').closest('.totals').outerHTML = `<div class="card load-error">Could not load price data: ${esc(e.message)}. Refresh the page to try again.</div>`;
    return false;
  }
  populateLists();
  newQuote();
  renderHistory();
  return true;
}

// --- Populate search lists ---
function fillList(listId, items, label) {
  const dl = $(listId);
  const seen = new Set();
  items.forEach(item => {
    if (seen.has(item.name)) return; // the sheet uses the first row with a given name
    seen.add(item.name);
    const opt = document.createElement('option');
    opt.value = item.name;
    opt.label = label(item);
    dl.appendChild(opt);
  });
}

function populateLists() {
  fillList('panelList', DATA.panels, p => `${p.watts}W · ${fmt(p.priceIncGst)}`);
  fillList('inverterList', DATA.inverters, i => `${i.phase} · ${fmt(i.priceIncGst)}`);
  fillList('batteryList', DATA.batteries, b => `${b.kwPerModule} kWh · ${fmt(b.priceIncGst)}`);

  const gw = $('gateway');
  DATA.gateways.forEach((g, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${g.name} (${fmt(g.priceIncGst)})`;
    gw.appendChild(opt);
  });
}

// --- Defaults ---
function pickDefault(list, preferred) {
  return (byName(list, preferred) || list[0] || { name: '' }).name;
}

function setDefaults() {
  $('panel').value = pickDefault(DATA.panels, '');
  $('inverter').value = pickDefault(DATA.inverters, 'GOODWE 9.9 KW 3 ET G2 PH HYBRID');
  $('battery').value = pickDefault(DATA.batteries, 'GOODWE 3.2');
  $('batteryInverter').value = pickDefault(DATA.inverters, 'NO INVERTER');
  $('phase').value = is3Phase(byName(DATA.inverters, $('inverter').value)?.phase) ? '3 PH' : '1 PH';
  $('gateway').value = '';
}

// --- Quote ID Generator (4-digit number) ---
function generateQuoteId() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

// --- STC lookup ---
// The sheet uses an exact VLOOKUP and shows #N/A for a size that isn't in the table.
// ponytail: no exact row -> use the next smaller size (smaller rebate, so we never under-quote) and flag it.
function lookupTable(rows, size, key) {
  const exact = rows.find(r => Math.abs(r[key] - size) < 0.001);
  if (exact) return { amount: exact.amount, size: exact[key], exact: true };
  const lower = rows.filter(r => r[key] < size).sort((a, b) => b[key] - a[key])[0];
  return lower
    ? { amount: lower.amount, size: lower[key], exact: false }
    : { amount: 0, size: 0, exact: false };
}

function lookupSolarSTC(systemKw, postcode) {
  const z1 = DATA.stc.zone1;
  const inZone1 = postcode >= z1.postcodeMin && postcode <= z1.postcodeMax;
  const zone = inZone1 ? z1 : DATA.stc.zone2;
  const label = inZone1 ? `Zone 1 (${z1.postcodeMin}-${z1.postcodeMax})` : 'Zone 2';
  return { ...lookupTable(zone.rates, systemKw, 'kw'), zone: label };
}

function stcNote(result, size, unit) {
  if (result.exact) return '';
  return result.size
    ? `No STC row for ${size.toFixed(2)} ${unit}, using ${result.size} ${unit}`
    : `No STC row for ${size.toFixed(2)} ${unit} or smaller, STC $0`;
}

// --- Format ---
function fmt(val) {
  return (val < 0 ? '-$' : '$') + Math.abs(val).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
const fmt0 = v => '$' + v.toLocaleString('en-AU');

// --- Form state (saved quotes) ---
const STATE_FIELDS = {
  value: ['panel', 'numPanels', 'inverter', 'phase', 'installerDiscount', 'marginDiscount', 'postcode',
          'battery', 'numModules', 'batteryInverter', 'gateway', 'batteryMarginDiscount'],
  checked: ['doubleStorey', 'tiltMounting', 'panelRemoval', 'solarVic', 'solarVicLoan', 'batteryRequired'],
};

function getFormState() {
  const s = {};
  STATE_FIELDS.value.forEach(id => { s[id] = $(id).value; });
  STATE_FIELDS.checked.forEach(id => { s[id] = $(id).checked; });
  return s;
}

function loadFormState(s) {
  STATE_FIELDS.value.forEach(id => {
    if (s[id] === undefined) return; // quote saved before this field existed: keep default
    // Searchable fields only accept a name that is still in the price list
    if (SEARCH_FIELDS[id] && !byName(SEARCH_FIELDS[id](), s[id])) return;
    if (id === 'gateway' && s[id] !== '' && !DATA.gateways[s[id]]) return;
    $(id).value = s[id];
  });
  STATE_FIELDS.checked.forEach(id => { if (s[id] !== undefined) $(id).checked = s[id]; });
  calculate();
}

// --- Main Calculation ---
function calculate() {
  const R = DATA.rates;
  const num = id => parseFloat($(id).value) || 0;

  const panel = byName(DATA.panels, $('panel').value);
  const inverter = byName(DATA.inverters, $('inverter').value);
  if (!panel || !inverter) return;

  const numPanels = Math.max(0, parseInt($('numPanels').value) || 0);
  const phase3 = $('phase').value === '3 PH';
  const doubleStorey = $('doubleStorey').checked;
  const tiltMounting = $('tiltMounting').checked;
  const panelRemoval = $('panelRemoval').checked;
  const installerDiscount = num('installerDiscount') / 100;
  const marginDiscount = num('marginDiscount') / 100;
  const postcode = parseInt($('postcode').value) || 0;
  const solarVic = $('solarVic').checked;
  const solarVicLoan = $('solarVicLoan').checked;

  // ---- SOLAR (sheet rows 5-17) ----
  const panelTotal = panel.priceIncGst * numPanels;
  const systemKw = (panel.watts / 1000) * numPanels;
  const mountingCost = R.mountingPerKw * systemKw;
  const inverterCost = inverter.priceIncGst;
  const electricalKit = phase3 ? R.elecKit3ph : R.elecKit1ph;
  const doubleStoreyAmt = doubleStorey ? R.doubleStorey : 0;
  const smartMeter = inverter.smartMeter;
  const tiltAmt = tiltMounting ? R.tiltMounting : 0;
  const panelRemovalAmt = panelRemoval ? R.panelRemoval : 0;
  const installerCost = (1 - installerDiscount) * R.installerPerKw * systemKw;
  const fixExpenses = (1 - marginDiscount) * R.solarFixed;
  const solarTotal = panelTotal + mountingCost + inverterCost + electricalKit
    + doubleStoreyAmt + smartMeter + tiltAmt + panelRemovalAmt
    + installerCost + fixExpenses;

  // ---- REBATES (sheet rows 19-24) ----
  const stc = lookupSolarSTC(systemKw, postcode);
  const stcWarn = stcNote(stc, systemKw, 'kW');
  const solarVicAmt = solarVic ? R.solarVic : 0;
  const solarVicLoanAmt = solarVicLoan ? R.solarVicLoan : 0;
  const totalRebates = stc.amount + solarVicAmt + solarVicLoanAmt;
  const solarAfterRebates = solarTotal - totalRebates;

  // ---- BATTERY (sheet rows 26-44) ----
  const batteryRequired = $('batteryRequired').checked;
  const battery = byName(DATA.batteries, $('battery').value);
  const batteryInverter = byName(DATA.inverters, $('batteryInverter').value);
  const gateway = DATA.gateways[$('gateway').value];
  const numModules = Math.max(0, parseInt($('numModules').value) || 0);
  const batteryMarginAdj = num('batteryMarginDiscount') / 100;
  const hasBattery = batteryRequired && !!battery;

  let battCapacity = 0, moduleTotal = 0, battKit = 0, battInvCost = 0, gatewayCost = 0;
  let battMargin = 0, battTotal = 0, battSTC = { amount: 0, exact: true }, battUpfront = 0, battWarn = '';
  if (hasBattery) {
    battCapacity = battery.kwPerModule * numModules;
    moduleTotal = battery.priceIncGst * numModules;
    battKit = battery.kit;
    battInvCost = batteryInverter ? batteryInverter.priceIncGst : 0;
    gatewayCost = gateway ? gateway.priceIncGst : 0;
    battMargin = R.batteryMargin * (1 + batteryMarginAdj);
    battTotal = moduleTotal + battKit + battInvCost + gatewayCost + battMargin;
    battSTC = lookupTable(DATA.stc.battery, battCapacity, 'kwh');
    battWarn = stcNote(battSTC, battCapacity, 'kWh');
    battUpfront = battTotal - battSTC.amount;
  }
  const bundleDiscount = hasBattery ? R.bundleDiscount : 0;
  const grandTotal = solarAfterRebates + battUpfront - bundleDiscount;

  // ---- INLINE DISPLAYS ----
  const setWarn = (id, text) => { $(id).textContent = text; $(id).classList.toggle('warn', !!text); };

  $('panelPriceInfo').textContent = `${fmt(panel.priceIncGst)}/panel = ${fmt(panelTotal)}`;
  $('systemSizeInfo').textContent = `${systemKw.toFixed(2)} kW`;
  $('mountingCostDisplay').textContent = `× ${fmt0(R.mountingPerKw)}/kW = ${fmt(mountingCost)}`;
  $('elecKitDisplay').textContent = fmt(electricalKit);
  $('dblVal').textContent = fmt(R.doubleStorey);
  $('smartMeterDisplay').textContent = fmt(smartMeter);
  $('tiltVal').textContent = fmt(R.tiltMounting);
  $('removeVal').textContent = fmt(R.panelRemoval);
  $('installerCostDisplay').textContent = `${systemKw.toFixed(2)} kW × ${fmt0(R.installerPerKw)} = ${fmt(installerCost)}`;
  $('fixExpDisplay').textContent = `${fmt0(R.solarFixed)} → ${fmt(fixExpenses)}`;

  $('solarSubtotal').textContent = fmt(solarTotal);
  $('zoneInfo').textContent = `${stc.zone} · ${systemKw.toFixed(2)} kW STC`;
  $('stcVal').textContent = fmt(-stc.amount);
  $('totalRebatesVal').textContent = fmt(-totalRebates);
  setWarn('stcWarn', stcWarn);
  $('vicVal').textContent = fmt(R.solarVic);
  $('vicLoanVal').textContent = fmt(R.solarVicLoan);

  $('batteryFields').classList.toggle('off', !batteryRequired);
  if (hasBattery) {
    $('battCapInfo').textContent = `${battCapacity.toFixed(2)} kWh total`;
    $('modCostInfo').textContent = `${fmt(battery.priceIncGst)}/module`;
    $('modTotalDisplay').textContent = `× ${numModules} = ${fmt(moduleTotal)}`;
    $('battKitDisplay').textContent = fmt(battKit);
    $('battMarginDisplay').textContent = `${fmt0(R.batteryMargin)} → ${fmt(battMargin)}`;
    $('battInstallVal').textContent = fmt(battTotal);
    $('battStcInfo').textContent = `${battCapacity.toFixed(2)} kWh`;
    $('battStcVal').textContent = fmt(-battSTC.amount);
    setWarn('battStcWarn', battWarn);
  } else {
    setWarn('battStcWarn', '');
  }

  // ---- THE THREE TOTALS (inc. GST) ----
  $('totalSolar').textContent = fmt(solarAfterRebates);
  $('totalBattery').textContent = hasBattery ? fmt(battUpfront) : '—';
  $('totalCombined').textContent = hasBattery ? fmt(grandTotal) : '—';
  $('bundleNote').textContent = hasBattery && bundleDiscount ? `incl. ${fmt0(bundleDiscount)} bundle discount` : '';

  return grandTotal;
}

// ================================================================
// QUOTE HISTORY — localStorage
// ================================================================

function getQuotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function saveQuotes(quotes) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(quotes)); return true; }
  catch { toast('Could not save: browser storage is full or blocked'); return false; }
}

function newQuote() {
  currentQuoteId = generateQuoteId();
  $('quoteId').textContent = '#' + currentQuoteId;
  setDefaults();
  ['doubleStorey', 'tiltMounting', 'panelRemoval', 'solarVic', 'solarVicLoan'].forEach(id => { $(id).checked = false; });
  $('batteryRequired').checked = true;
  $('numPanels').value = 28;
  $('numModules').value = 16;
  $('installerDiscount').value = 0;
  $('marginDiscount').value = 0;
  $('batteryMarginDiscount').value = Math.round((DATA.rates.batteryMarginAdjustDefault || 0) * 100);
  $('postcode').value = 3978;
  calculate();
}

function saveQuote() {
  const state = getFormState();
  const panel = byName(DATA.panels, state.panel);
  if (!panel) { toast('Pick a panel from the list first'); return; }
  const battery = state.batteryRequired ? byName(DATA.batteries, state.battery) : null;
  const systemKw = ((panel.watts / 1000) * (parseInt(state.numPanels) || 0)).toFixed(1);

  let desc = `${systemKw}kW ${panel.name}`;
  if (battery) desc += ` + ${(battery.kwPerModule * (parseInt(state.numModules) || 0)).toFixed(1)}kWh ${battery.name}`;

  const total = calculate();
  const quotes = getQuotes();
  const existingIdx = quotes.findIndex(q => q.id === currentQuoteId);
  const entry = {
    id: currentQuoteId,
    desc,
    total: fmt(total || 0),
    state,
    date: new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }),
  };
  if (existingIdx >= 0) quotes[existingIdx] = entry; else quotes.unshift(entry);

  if (saveQuotes(quotes)) toast(`Quote #${currentQuoteId} ${existingIdx >= 0 ? 'updated' : 'saved'}`);
  renderHistory();
}

function loadQuote(id, asCopy = false) {
  const q = getQuotes().find(q => q.id === id);
  if (!q) return;
  currentQuoteId = asCopy ? generateQuoteId() : q.id;
  $('quoteId').textContent = '#' + currentQuoteId;
  loadFormState(q.state);
  toast(asCopy ? 'Cloned as #' + currentQuoteId : 'Loaded quote #' + id);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function deleteQuote(id) {
  saveQuotes(getQuotes().filter(q => q.id !== id));
  renderHistory();
  toast('Quote #' + id + ' deleted');
}

function renderHistory() {
  const quotes = getQuotes();
  const list = $('historyList');
  if (quotes.length === 0) {
    list.innerHTML = '<li class="history-empty">No saved quotes yet. Click "Save Quote" to save the current quote.</li>';
    return;
  }
  list.innerHTML = quotes.map(q => `
    <li class="history-item">
      <span class="history-id">#${esc(q.id)}</span>
      <span class="history-desc">${esc(q.desc)}</span>
      <span class="history-price">${esc(q.total)}</span>
      <span class="history-date">${esc(q.date)}</span>
      <span class="history-actions">
        <button class="btn-sm btn-edit" data-action="edit" data-id="${esc(q.id)}">Edit</button>
        <button class="btn-sm btn-clone" data-action="clone" data-id="${esc(q.id)}">Clone</button>
        <button class="btn-sm btn-del" data-action="delete" data-id="${esc(q.id)}">Del</button>
      </span>
    </li>
  `).join('');
}

// --- Toast notification ---
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2000);
}

// --- Searchable inputs (native <datalist>) ---
// On focus the box is cleared so the whole list shows; the current pick stays as the
// placeholder. Leaving without picking a valid item puts the previous pick back.
function wireSearch(id, list, onPick) {
  const el = $(id);
  let prev = '';
  el.addEventListener('focus', () => { prev = el.value; el.placeholder = prev || SEARCH_PLACEHOLDER; el.value = ''; });
  el.addEventListener('input', () => {
    if (!byName(list(), el.value)) return;
    prev = el.value;
    if (onPick) onPick();
    calculate();
  });
  el.addEventListener('blur', () => {
    if (!byName(list(), el.value)) el.value = prev;
    el.placeholder = SEARCH_PLACEHOLDER;
  });
}

// --- Wire up events ---
function wireEvents() {
  Object.entries(SEARCH_FIELDS).forEach(([id, list]) => {
    // Picking a solar inverter sets the electrical kit phase to match (can still be changed)
    const onPick = id === 'inverter' ? () => {
      const inv = byName(DATA.inverters, $('inverter').value);
      if (inv && inv.name !== 'NO INVERTER') $('phase').value = is3Phase(inv.phase) ? '3 PH' : '1 PH';
    } : null;
    wireSearch(id, list, onPick);
  });
  [...STATE_FIELDS.value, ...STATE_FIELDS.checked]
    .filter(id => !SEARCH_FIELDS[id])
    .forEach(id => {
      $(id).addEventListener('change', calculate);
      $(id).addEventListener('input', calculate);
    });
  $('historyList').addEventListener('click', e => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'edit') loadQuote(id);
    else if (action === 'clone') loadQuote(id, true);
    else if (action === 'delete') deleteQuote(id);
  });
}

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadData().then(ok => { if (ok) wireEvents(); });
});
