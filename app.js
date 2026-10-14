/* =====================================================================
   Coinly — app.js
   Plataforma simulada de compra y venta de criptomonedas.

   APIs usadas (públicas y gratuitas, sin API key):
   - DolarAPI  → https://dolarapi.com/v1/dolares  (tipos de dólar en Argentina)
   - CoinGecko → https://api.coingecko.com/api/v3  (precios, stats y gráficos)

   Índice:
   1. Configuración          7. Render: Mercados / Conversor
   2. Utilidades y formato   8. Render: Dashboard / Portfolio / Historial
   3. Estado y localStorage  9. Compra y venta
   4. Carga de datos (APIs)  10. Estadísticas y gráfico
   5. Navegación             11. Eventos
   6. Avisos y estado        12. Inicio
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   1. CONFIGURACIÓN
   --------------------------------------------------------------------- */
const CONFIG = {
  DOLAR_URL: 'https://dolarapi.com/v1/dolares',
  CG_URL: 'https://api.coingecko.com/api/v3',
  REFRESH_MS: 60000,          // actualización automática cada 60 s
  CHART_CACHE_MS: 120000,     // los gráficos se cachean 2 min (evita límites de la API)
  STORE_KEY: 'coinly_state_v1',
  CACHE_KEY: 'coinly_cache_v1',
  INITIAL_CASH_USD: 10000,    // saldo inicial de la cuenta demo
  SPLASH_MS: 2600,
  MAX_HISTORY: 500
};

// Criptomonedas disponibles (id = identificador de CoinGecko)
const COINS = [
  { id: 'bitcoin',     symbol: 'BTC',  name: 'Bitcoin',  color: '#f7931a' },
  { id: 'ethereum',    symbol: 'ETH',  name: 'Ethereum', color: '#627eea' },
  { id: 'tether',      symbol: 'USDT', name: 'Tether',   color: '#26a17b' },
  { id: 'binancecoin', symbol: 'BNB',  name: 'BNB',      color: '#f3ba2f' },
  { id: 'solana',      symbol: 'SOL',  name: 'Solana',   color: '#9945ff' },
  { id: 'ripple',      symbol: 'XRP',  name: 'XRP',      color: '#9aa4b8' },
  { id: 'cardano',     symbol: 'ADA',  name: 'Cardano',  color: '#3b82f6' },
  { id: 'dogecoin',    symbol: 'DOGE', name: 'Dogecoin', color: '#c2a633' }
];

// Orden de preferencia para mostrar los tipos de dólar
const DOLAR_ORDER = ['oficial', 'blue', 'bolsa', 'contadoconliqui', 'cripto', 'tarjeta', 'mayorista'];

// Secciones y menú (los íconos son paths SVG de 24x24)
const NAV = [
  { id: 'dashboard', label: 'Dashboard',       short: 'Inicio',    icon: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>' },
  { id: 'markets',   label: 'Mercados',        short: 'Mercados',  icon: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>' },
  { id: 'trade',     label: 'Comprar / Vender', short: 'Operar',   icon: '<path d="M7 7h13l-3-3"/><path d="M17 17H4l3 3"/>' },
  { id: 'portfolio', label: 'Portfolio',       short: 'Portfolio', icon: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>' },
  { id: 'history',   label: 'Historial',       short: 'Historial', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' },
  { id: 'stats',     label: 'Estadísticas',    short: 'Stats',     icon: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>' }
];
const SECTIONS = NAV.map(n => n.id);

// Logo tipográfico: se escribe siempre "Coinly". La "o" lleva el degradado
// y el puntito verde recuerda un tick de precio.
const LOGO_HTML = 'C<span class="logo-o">o</span>inly<span class="logo-dot" aria-hidden="true"></span>';

/* ---------------------------------------------------------------------
   2. UTILIDADES Y FORMATO
   --------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const num = v => (isNum(v) ? v : NaN);            // convierte datos dudosos en NaN
const round8 = n => Math.round(n * 1e8) / 1e8;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Formatea dinero. USD → "US$ 1.234,56" · ARS → "$ 1.234.567" */
function fmtMoney(n, cur = 'USD') {
  if (!isNum(n)) return '—';
  const a = Math.abs(n);
  let min = 2, max = 2;
  if (a > 0 && a < 1) max = a < 0.01 ? 6 : 4;       // precios chicos: más decimales
  else if (cur === 'ARS' && a >= 1000) { min = 0; max = 0; }
  const s = a.toLocaleString('es-AR', { minimumFractionDigits: min, maximumFractionDigits: max });
  return (n < 0 ? '-' : '') + (cur === 'USD' ? 'US$ ' : '$ ') + s;
}
/** Formatea números grandes: US$ 1,25 B */
function fmtCompact(n) {
  if (!isNum(n)) return '—';
  const a = Math.abs(n);
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (const [v, s] of units) {
    if (a >= v) return 'US$ ' + (n / v).toLocaleString('es-AR', { maximumFractionDigits: 2 }) + ' ' + s;
  }
  return fmtMoney(n, 'USD');
}
function fmtPct(n) {
  if (!isNum(n)) return '—';
  return (n > 0 ? '+' : '') + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
}
const fmtQty = n => (isNum(n) ? n.toLocaleString('es-AR', { maximumFractionDigits: 8 }) : '—');
function fmtDate(v) {
  const d = new Date(v);
  if (!v || isNaN(d)) return '—';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'hace instantes';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}
const parseQty = s => parseFloat(String(s).trim().replace(',', '.'));
const trend = n => (isNum(n) ? (n >= 0 ? 'up' : 'down') : 'flat');

/** Indicador de variación: ▲ +3,42% / ▼ -1,24% */
function badge(pct) {
  if (!isNum(pct)) return '<span class="badge flat">—</span>';
  return `<span class="badge ${trend(pct)}">${pct >= 0 ? '▲' : '▼'} ${fmtPct(pct)}</span>`;
}
/** Logo de moneda con fallback a la inicial si la imagen no carga */
function coinLogo(c, size = '') {
  const img = c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : '';
  return `<span class="coin-logo ${size}" data-letter="${esc(c.symbol[0])}">${img}</span>`;
}
/** Mini gráfico SVG de 7 días (viene de la API) */
function sparkline(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return '<div style="height:38px"></div>';
  const step = Math.max(1, Math.floor(arr.length / 40));
  const pts = arr.filter((_, i) => i % step === 0);
  const min = Math.min(...pts), max = Math.max(...pts), rng = max - min || 1;
  const d = pts.map((v, i) => `${((i / (pts.length - 1)) * 100).toFixed(1)},${(30 - ((v - min) / rng) * 28).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return `<svg class="spark ${up ? 'up' : 'down'}" viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${d}" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}
const skelRows = (n = 4) => `<div class="sk-stack">${'<span class="sk" style="height:44px"></span>'.repeat(n)}</div>`;

/** Notificaciones tipo toast */
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3200);
}

/* ---------------------------------------------------------------------
   3. ESTADO Y LOCALSTORAGE
   --------------------------------------------------------------------- */
// Datos de la cuenta simulada (se guardan en localStorage)
const defaultStore = () => ({ cash: CONFIG.INITIAL_CASH_USD, holdings: {}, history: [], dolarCasa: 'oficial' });

function loadStore() {
  try {
    const raw = localStorage.getItem(CONFIG.STORE_KEY);
    if (!raw) return defaultStore();
    const p = JSON.parse(raw);
    const s = { ...defaultStore(), ...p };
    if (!isNum(s.cash)) s.cash = CONFIG.INITIAL_CASH_USD;
    if (!s.holdings || typeof s.holdings !== 'object') s.holdings = {};
    if (!Array.isArray(s.history)) s.history = [];
    return s;
  } catch (e) {
    console.warn('No se pudo leer el estado guardado', e);
    return defaultStore();
  }
}
function saveStore() {
  try { localStorage.setItem(CONFIG.STORE_KEY, JSON.stringify(store)); }
  catch (e) { console.warn('No se pudo guardar el estado', e); }
}
function cacheGet() {
  try { return JSON.parse(localStorage.getItem(CONFIG.CACHE_KEY)) || {}; } catch { return {}; }
}
function cacheSet(patch) {
  try { localStorage.setItem(CONFIG.CACHE_KEY, JSON.stringify({ ...cacheGet(), ...patch })); } catch { /* sin espacio: se ignora */ }
}

const store = loadStore();

// Estado de la interfaz (no se guarda)
const S = {
  market: {},            // { BTC: {price, change24h, ...} }
  marketReady: false,
  marketStamp: null,
  dolares: [],
  dolarReady: false,
  status: { dolar: 'loading', market: 'loading' },   // loading | ok | stale | cache | error
  section: 'dashboard',
  statsCoin: 'BTC',
  trade: { side: 'buy', sym: 'BTC' },
  histFilter: 'all',
  conv: { from: 'BTC', to: 'ARS' },
  rendered: {},
  lastRefresh: 0
};
const chartState = { period: '24H', cur: 'USD' };

/** Cotización del dólar elegido (precio de venta). NaN si no hay datos. */
function selectedDolar() {
  return S.dolares.find(d => d.casa === store.dolarCasa) || S.dolares[0] || null;
}
function getRate() {
  const d = selectedDolar();
  return d ? num(d.venta) : NaN;
}
const toARS = usd => { const r = getRate(); return isNum(usd) && isNum(r) ? usd * r : NaN; };

/* ---------------------------------------------------------------------
   4. CARGA DE DATOS (APIs)
   --------------------------------------------------------------------- */
/** fetch con límite de tiempo y control de errores HTTP */
async function fetchJSON(url, timeout = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** DolarAPI: devuelve un array con todos los tipos de dólar */
async function loadDolares() {
  try {
    const data = await fetchJSON(CONFIG.DOLAR_URL);
    if (!Array.isArray(data) || !data.length) throw new Error('Respuesta vacía');
    const list = data.filter(d => d && d.casa);
    if (!list.length) throw new Error('Sin datos válidos');
    const rank = c => { const i = DOLAR_ORDER.indexOf(c); return i < 0 ? 99 : i; };
    S.dolares = list
      .map(d => ({ ...d, compra: num(d.compra), venta: num(d.venta) }))
      .sort((a, b) => rank(a.casa) - rank(b.casa));
    S.dolarReady = true;
    S.status.dolar = 'ok';
    if (!S.dolares.some(d => d.casa === store.dolarCasa)) { store.dolarCasa = S.dolares[0].casa; saveStore(); }
    cacheSet({ dolares: S.dolares, dolaresT: Date.now() });
  } catch (e) {
    console.warn('DolarAPI falló:', e.message);
    if (S.dolarReady) S.status.dolar = 'stale';
    else {
      const c = cacheGet();
      if (Array.isArray(c.dolares) && c.dolares.length) { S.dolares = c.dolares; S.dolarReady = true; S.status.dolar = 'cache'; }
      else S.status.dolar = 'error';
    }
  }
}

/** CoinGecko: precios, variación 24h, máx/mín, volumen, market cap y sparkline 7d */
async function loadMarket() {
  try {
    const ids = COINS.map(c => c.id).join(',');
    const url = `${CONFIG.CG_URL}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`;
    const data = await fetchJSON(url);
    if (!Array.isArray(data) || !data.length) throw new Error('Respuesta vacía');
    let got = 0;
    data.forEach(d => {
      const c = COINS.find(x => x.id === d.id);
      if (!c) return;
      const old = S.market[c.symbol];
      S.market[c.symbol] = {
        ...c,
        image: d.image,
        price: num(d.current_price),
        prev: old ? old.price : NaN,                  // para el destello de cambio de precio
        change24h: num(d.price_change_percentage_24h),
        changeAbs: num(d.price_change_24h),
        high: num(d.high_24h),
        low: num(d.low_24h),
        volume: num(d.total_volume),
        mcap: num(d.market_cap),
        spark: d.sparkline_in_7d && Array.isArray(d.sparkline_in_7d.price) ? d.sparkline_in_7d.price : []
      };
      got++;
    });
    if (!got) throw new Error('Sin monedas válidas');
    S.marketReady = true;
    S.marketStamp = Date.now();
    S.status.market = 'ok';
    cacheSet({ market: S.market, marketT: S.marketStamp });
  } catch (e) {
    console.warn('CoinGecko falló:', e.message);
    if (S.marketReady) S.status.market = S.status.market === 'cache' ? 'cache' : 'stale';
    else {
      const c = cacheGet();
      if (c.market && Object.keys(c.market).length) {
        S.market = c.market; S.marketStamp = c.marketT || null;
        S.marketReady = true; S.status.market = 'cache';
      } else S.status.market = 'error';
    }
  }
}

/** Actualiza todo y vuelve a dibujar */
let refreshing = false;
async function refreshAll(manual = false) {
  if (refreshing) return;
  refreshing = true;
  const btn = $('#refresh-btn');
  btn.classList.add('spinning');
  await Promise.allSettled([loadDolares(), loadMarket()]);
  S.lastRefresh = Date.now();
  renderAll();
  updateBanner();
  updateStatus();
  btn.classList.remove('spinning');
  refreshing = false;
  if (manual) toast(S.status.market === 'ok' && S.status.dolar === 'ok' ? 'Datos actualizados' : 'Actualización con problemas', S.status.market === 'ok' ? 'success' : 'error');
}

/* ---------------------------------------------------------------------
   5. NAVEGACIÓN
   --------------------------------------------------------------------- */
function renderNav() {
  const icon = p => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
  $('#nav-side').innerHTML = NAV.map(n =>
    `<button class="nav-btn" data-nav="${n.id}" data-action="goto" data-section="${n.id}" title="${n.label}">${icon(n.icon)}<span>${n.label}</span></button>`).join('');
  $('#nav-bottom').innerHTML = NAV.map(n =>
    `<button class="nav-btn" data-nav="${n.id}" data-action="goto" data-section="${n.id}" aria-label="${n.label}">${icon(n.icon)}<span>${n.short}</span></button>`).join('');
}

/** Cambia de sección con transición */
function go(name) {
  if (!SECTIONS.includes(name)) name = 'dashboard';
  S.section = name;
  $$('.section').forEach(s => s.classList.toggle('active', s.id === 'sec-' + name));
  $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  const item = NAV.find(n => n.id === name);
  $('#page-title').textContent = item.label;
  try { history.replaceState(null, '', '#' + name); } catch { /* file:// en algunos navegadores */ }
  window.scrollTo({ top: 0 });
  if (name === 'stats') { renderStats(); loadChart(); }
  if (name === 'trade') { syncTradeUI(); updateTrade(); }
  if (name === 'portfolio') renderPortfolio();
}

/* ---------------------------------------------------------------------
   6. AVISOS Y ESTADO DE CONEXIÓN
   --------------------------------------------------------------------- */
function updateStatus() {
  const { dolar, market } = S.status;
  const pill = $('#status-pill');
  let cls = 'ok', txt = 'En vivo';
  if (dolar === 'loading' || market === 'loading') { cls = 'loading'; txt = 'Cargando…'; }
  else if (dolar === 'error' && market === 'error') { cls = 'error'; txt = 'Sin conexión'; }
  else if ([dolar, market].some(s => s !== 'ok')) { cls = 'warn'; txt = 'Datos parciales'; }
  pill.className = 'status-pill ' + cls;
  pill.innerHTML = `<i></i><span>${txt}</span>`;
}

function updateBanner() {
  const msgs = [];
  let level = 'warn';
  const m = S.status.market, d = S.status.dolar;
  if (m === 'error') { msgs.push('No pudimos conectar con CoinGecko. Los precios no están disponibles por ahora.'); level = 'error'; }
  else if (m === 'cache') msgs.push(`CoinGecko no responde. Mostrando los últimos precios guardados (${S.marketStamp ? ago(S.marketStamp) : 'fecha desconocida'}).`);
  else if (m === 'stale') msgs.push('No se pudo actualizar el mercado. Se muestran los últimos precios obtenidos.');
  if (d === 'error') { msgs.push('No se pudo cargar DolarAPI. Las conversiones a pesos no están disponibles.'); level = 'error'; }
  else if (d === 'cache') msgs.push('DolarAPI no responde. Usando la última cotización guardada.');
  else if (d === 'stale') msgs.push('No se pudo actualizar el dólar. Se muestra la última cotización obtenida.');

  const el = $('#banner');
  if (!msgs.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.className = 'banner ' + (level === 'error' ? 'error' : '');
  el.innerHTML = `<span>${esc(msgs.join(' '))}</span><button class="btn small" data-action="refresh">Reintentar</button>`;
}

/* ---------------------------------------------------------------------
   7. RENDER: ENCABEZADO, DÓLAR, MERCADOS, CONVERSOR
   --------------------------------------------------------------------- */
function renderTopbar() {
  const d = selectedDolar();
  const chip = $('#dolar-chip');
  if (!S.dolarReady) {
    chip.innerHTML = S.status.dolar === 'error' ? 'Dólar no disponible' : '<span class="skeleton-line" style="width:90px"></span>';
    return;
  }
  chip.innerHTML = `Dólar ${esc(d.nombre || d.casa)}: <b>${fmtMoney(d.venta, 'ARS')}</b>`;
}

/** Tarjetas de dólar (sección Mercados) y lista compacta (Dashboard) */
function renderDolar() {
  const grid = $('#dolar-grid');
  const compact = $('#dash-dolar');
  if (!S.dolarReady) {
    const failed = S.status.dolar === 'error';
    const msg = '<div class="empty"><span>No se pudo cargar la cotización del dólar.</span><button class="btn small" data-action="refresh">Reintentar</button></div>';
    grid.innerHTML = failed ? msg : Array.from({ length: 4 }, () => '<div class="dolar-card"><span class="sk" style="height:18px"></span><span class="sk" style="height:34px"></span></div>').join('');
    compact.innerHTML = failed ? msg : skelRows(4);
    return;
  }
  grid.innerHTML = S.dolares.map((d, i) => {
    const sel = d.casa === store.dolarCasa;
    return `<button class="dolar-card ${sel ? 'selected' : ''}" style="--d:${i * 50}ms" data-action="dolar-select" data-casa="${esc(d.casa)}">
      <div class="dc-top"><span>${esc(d.nombre || d.casa)}</span>${sel ? '<span class="tag">En uso</span>' : ''}</div>
      <div class="dc-grid"><div><small>Compra</small><b>${fmtMoney(d.compra, 'ARS')}</b></div><div><small>Venta</small><b>${fmtMoney(d.venta, 'ARS')}</b></div></div>
      <div class="dc-date">Actualizado: ${fmtDate(d.fechaActualizacion)}</div>
    </button>`;
  }).join('');
  compact.innerHTML = '<div class="list">' + S.dolares.slice(0, 5).map(d => `
    <div class="row clickable" data-action="dolar-select" data-casa="${esc(d.casa)}">
      <div class="row-main"><b>${esc(d.nombre || d.casa)}</b><small>${d.casa === store.dolarCasa ? 'En uso' : 'Tocá para usar'}</small></div>
      <div class="row-end"><b>${fmtMoney(d.venta, 'ARS')}</b><small>Compra ${fmtMoney(d.compra, 'ARS')}</small></div>
    </div>`).join('') + '</div>';
}

/** Tarjeta de una criptomoneda */
function coinCard(c, i, first) {
  const m = S.market[c.symbol];
  if (!m || !isNum(m.price)) {
    return `<article class="coin-card ${first ? 'reveal' : ''}" style="--d:${i * 50}ms"><div class="coin-head">${coinLogo(c)}<div><div class="coin-name">${esc(c.name)}</div><div class="coin-sym">${esc(c.symbol)}</div></div><span class="badge flat">Sin datos</span></div><div class="coin-price">—</div></article>`;
  }
  let flash = '';
  if (isNum(m.prev) && m.prev !== m.price) flash = m.price > m.prev ? 'flash-up' : 'flash-down';
  return `<article class="coin-card ${first ? 'reveal' : ''}" style="--d:${i * 50}ms" data-action="stats-coin" data-sym="${m.symbol}">
    <div class="coin-head">${coinLogo(m)}<div><div class="coin-name">${esc(m.name)}</div><div class="coin-sym">${esc(m.symbol)}</div></div>${badge(m.change24h)}</div>
    <div><div class="coin-price ${flash}">${fmtMoney(m.price, 'USD')}</div><div class="coin-price-ars">${fmtMoney(toARS(m.price), 'ARS')}</div></div>
    ${sparkline(m.spark)}
    <div class="coin-actions">
      <button class="btn small buy" data-action="trade-coin" data-sym="${m.symbol}" data-side="buy">Comprar</button>
      <button class="btn small" data-action="trade-coin" data-sym="${m.symbol}" data-side="sell">Vender</button>
    </div>
  </article>`;
}

function renderMarkets() {
  const el = $('#market-grid');
  if (!S.marketReady) {
    el.innerHTML = S.status.market === 'error'
      ? '<div class="panel empty" style="grid-column:1/-1"><span>No hay datos de mercado disponibles.</span><button class="btn small" data-action="refresh">Reintentar</button></div>'
      : COINS.map(() => '<div class="coin-card skeleton-card"><div class="coin-head"><span class="sk sk-circle"></span><span class="sk" style="width:90px;height:16px"></span></div><span class="sk" style="height:28px;width:70%"></span><span class="sk" style="height:38px"></span></div>').join('');
    return;
  }
  const first = !S.rendered.markets;
  S.rendered.markets = true;
  el.innerHTML = COINS.map((c, i) => coinCard(c, i, first)).join('');
}

/** Conversor ARS / USD / criptomonedas */
function initConverter() {
  const opts = ['ARS', 'USD', ...COINS.map(c => c.symbol)].map(s => `<option value="${s}">${s}</option>`).join('');
  $('#conv-from').innerHTML = opts;
  $('#conv-to').innerHTML = opts;
  $('#conv-from').value = S.conv.from;
  $('#conv-to').value = S.conv.to;
}
/** Pasa cualquier activo a USD */
function assetToUSD(asset, amount) {
  if (asset === 'USD') return amount;
  if (asset === 'ARS') { const r = getRate(); return isNum(r) && r > 0 ? amount / r : NaN; }
  const m = S.market[asset];
  return m && isNum(m.price) ? amount * m.price : NaN;
}
function usdToAsset(asset, usd) {
  if (asset === 'USD') return usd;
  if (asset === 'ARS') { const r = getRate(); return isNum(r) ? usd * r : NaN; }
  const m = S.market[asset];
  return m && isNum(m.price) && m.price > 0 ? usd / m.price : NaN;
}
function fmtAsset(v, asset) {
  if (!isNum(v)) return '—';
  if (asset === 'ARS') return fmtMoney(v, 'ARS');
  if (asset === 'USD') return fmtMoney(v, 'USD');
  return `${fmtQty(v)} ${asset}`;
}
function updateConverter() {
  const amount = parseQty($('#conv-amount').value);
  const { from, to } = S.conv;
  const out = $('#conv-result'), note = $('#conv-note');
  if (!isNum(amount) || amount < 0) { out.textContent = '—'; note.textContent = 'Ingresá un monto válido.'; return; }
  const usd = assetToUSD(from, amount);
  const res = usdToAsset(to, usd);
  out.textContent = isNum(res) ? `${fmtAsset(amount, from)} = ${fmtAsset(res, to)}` : '—';
  const d = selectedDolar();
  if (!isNum(res)) {
    note.textContent = (from === 'ARS' || to === 'ARS') && !isNum(getRate()) ? 'Cotización del dólar no disponible.' : 'Precio no disponible por el momento.';
  } else {
    note.textContent = d ? `Dólar usado: ${d.nombre || d.casa} (venta ${fmtMoney(d.venta, 'ARS')}). Valor de referencia, sin comisiones.` : 'Valor de referencia, sin comisiones.';
  }
}

/* ---------------------------------------------------------------------
   8. RENDER: DASHBOARD, PORTFOLIO, HISTORIAL
   --------------------------------------------------------------------- */
/** Calcula el valor del portfolio con los precios actuales */
function portfolio() {
  let cryptoValue = 0, cost = 0, missing = false;
  const rows = [];
  for (const [sym, h] of Object.entries(store.holdings)) {
    if (!h || !(h.qty > 0)) continue;
    const m = S.market[sym];
    const price = m ? m.price : NaN;
    const value = isNum(price) ? h.qty * price : NaN;
    if (isNum(value)) cryptoValue += value; else missing = true;
    cost += h.cost;
    rows.push({ sym, qty: h.qty, cost: h.cost, price, value, pnl: value - h.cost, pnlPct: h.cost > 0 ? ((value - h.cost) / h.cost) * 100 : NaN });
  }
  const total = store.cash + cryptoValue;
  return {
    rows, cryptoValue, cost, total, missing,
    pnl: cryptoValue - cost,
    pnlPct: cost > 0 ? ((cryptoValue - cost) / cost) * 100 : 0,
    returnPct: ((total - CONFIG.INITIAL_CASH_USD) / CONFIG.INITIAL_CASH_USD) * 100
  };
}
const coinOf = sym => S.market[sym] || COINS.find(c => c.symbol === sym) || { symbol: sym, name: sym };

function renderDashboard() {
  // --- Hero: saldo total
  const p = portfolio();
  const hero = $('#dash-hero');
  if (p.missing && !S.marketReady) {
    hero.innerHTML = '<div class="sk-stack"><span class="sk" style="height:16px;width:120px"></span><span class="sk" style="height:46px;width:70%"></span></div><div class="sk-stack"><span class="sk" style="height:70px"></span></div>';
  } else {
    const ars = toARS(p.total);
    const main = isNum(ars) ? fmtMoney(ars, 'ARS') : fmtMoney(p.total, 'USD');
    const sub = isNum(ars) ? fmtMoney(p.total, 'USD') : 'Dólar no disponible';
    const pnlCls = trend(p.pnl);
    hero.innerHTML = `
      <div>
        <div class="eyebrow">PORTFOLIO · SALDO TOTAL</div>
        <div class="hero-amount">${main}</div>
        <div class="hero-sub"><span>${sub}</span>${badge(p.returnPct)}<span class="tiny">vs. saldo inicial</span></div>
        ${p.missing ? '<div class="tiny muted" style="margin-top:6px">Algunos precios no están disponibles.</div>' : ''}
      </div>
      <div class="hero-stats">
        <div class="mini-stat"><small>Saldo disponible</small><b>${fmtMoney(store.cash, 'USD')}</b><em>${fmtMoney(toARS(store.cash), 'ARS')}</em></div>
        <div class="mini-stat"><small>Valor en cripto</small><b>${fmtMoney(p.cryptoValue, 'USD')}</b><em>${fmtMoney(toARS(p.cryptoValue), 'ARS')}</em></div>
        <div class="mini-stat"><small>Ganancia / pérdida</small><b class="${pnlCls}">${p.pnl > 0 ? '+' : ''}${fmtMoney(p.pnl, 'USD')}</b><em class="${pnlCls}">${p.cost > 0 ? fmtPct(p.pnlPct) : 'Sin posiciones'}</em></div>
      </div>`;
  }

  // --- Mercado (lista compacta)
  const dm = $('#dash-market');
  if (!S.marketReady) {
    dm.innerHTML = S.status.market === 'error'
      ? '<div class="empty"><span>Sin datos de mercado.</span><button class="btn small" data-action="refresh">Reintentar</button></div>'
      : skelRows(6);
  } else {
    dm.innerHTML = '<div class="list">' + COINS.map(c => {
      const m = S.market[c.symbol];
      if (!m || !isNum(m.price)) return `<div class="row">${coinLogo(c, 'sm')}<div class="row-main"><b>${esc(c.name)}</b><small>${c.symbol}</small></div><div class="row-end"><b>—</b></div></div>`;
      return `<div class="row clickable" data-action="stats-coin" data-sym="${m.symbol}">
        ${coinLogo(m, 'sm')}
        <div class="row-main"><b>${esc(m.name)}</b><small>${m.symbol}</small></div>
        <div class="row-end"><b>${fmtMoney(m.price, 'USD')}</b>${badge(m.change24h)}</div>
      </div>`;
    }).join('') + '</div>';
  }

  // --- Mis criptomonedas
  const dh = $('#dash-holdings');
  if (!p.rows.length) {
    dh.innerHTML = '<div class="empty"><span>Todavía no tenés criptomonedas.</span><button class="btn small primary" data-action="goto" data-section="trade">Hacé tu primera compra</button></div>';
  } else {
    dh.innerHTML = '<div class="list">' + p.rows.map(r => {
      const c = coinOf(r.sym);
      return `<div class="row clickable" data-action="stats-coin" data-sym="${r.sym}">
        ${coinLogo(c, 'sm')}
        <div class="row-main"><b>${esc(c.name)}</b><small>${fmtQty(r.qty)} ${r.sym}</small></div>
        <div class="row-end"><b>${fmtMoney(r.value, 'USD')}</b><small>${fmtMoney(toARS(r.value), 'ARS')}</small></div>
      </div>`;
    }).join('') + '</div>';
  }

  // --- Últimas operaciones
  const ops = store.history.slice(0, 5);
  $('#dash-ops').innerHTML = !ops.length
    ? '<div class="empty"><span>Todavía no hiciste operaciones.</span></div>'
    : '<div class="list">' + ops.map(o => `
      <div class="row">
        ${coinLogo(coinOf(o.sym), 'sm')}
        <div class="row-main"><b class="${o.type === 'buy' ? 'up' : 'down'}">${o.type === 'buy' ? 'Compra' : 'Venta'} ${esc(o.sym)}</b><small>${fmtDate(o.ts)}</small></div>
        <div class="row-end"><b>${fmtMoney(o.total, 'USD')}</b><small>${fmtQty(o.qty)} ${esc(o.sym)}</small></div>
      </div>`).join('') + '</div>';
}

function renderPortfolio() {
  const p = portfolio();
  const palette = { CASH: '#5b6b8c' };
  // --- Distribución (dona hecha con conic-gradient)
  const parts = [{ key: 'CASH', label: 'Saldo disponible', value: store.cash, color: palette.CASH }];
  p.rows.forEach(r => { if (isNum(r.value)) parts.push({ key: r.sym, label: coinOf(r.sym).name, value: r.value, color: coinOf(r.sym).color || '#7c6cff' }); });
  const total = parts.reduce((a, x) => a + x.value, 0) || 1;
  let acc = 0;
  const stops = parts.map(x => { const from = acc; acc += (x.value / total) * 100; return `${x.color} ${from.toFixed(2)}% ${acc.toFixed(2)}%`; }).join(', ');
  $('#pf-alloc').innerHTML = `
    <div class="panel-head"><h2>Distribución</h2></div>
    <div class="alloc">
      <div class="donut" style="background:conic-gradient(${stops})"><div class="donut-center"><small>Total</small><b>${fmtMoney(p.total, 'USD')}</b></div></div>
      <div class="legend">${parts.map(x => `<div class="legend-row"><i style="background:${x.color}"></i>${esc(x.label)}<span>${((x.value / total) * 100).toFixed(1)}%</span></div>`).join('')}</div>
    </div>`;

  // --- Resumen
  const cls = trend(p.pnl);
  $('#pf-summary').innerHTML = `
    <div class="panel-head"><h2>Resumen</h2></div>
    <div class="summary">
      <div class="sum-row"><span>Saldo total</span><b>${fmtMoney(p.total, 'USD')}</b></div>
      <div class="sum-row"><span>Saldo total (ARS)</span><b>${fmtMoney(toARS(p.total), 'ARS')}</b></div>
      <div class="sum-row"><span>Saldo disponible</span><b>${fmtMoney(store.cash, 'USD')}</b></div>
      <div class="sum-row"><span>Valor en cripto</span><b>${fmtMoney(p.cryptoValue, 'USD')}</b></div>
      <div class="sum-row"><span>Invertido (costo)</span><b>${fmtMoney(p.cost, 'USD')}</b></div>
      <div class="sum-row total"><span>Ganancia / pérdida</span><b class="${cls}">${p.pnl > 0 ? '+' : ''}${fmtMoney(p.pnl, 'USD')} (${p.cost > 0 ? fmtPct(p.pnlPct) : '—'})</b></div>
    </div>`;

  // --- Tabla de posiciones
  $('#pf-table').innerHTML = !p.rows.length
    ? '<div class="empty"><span>No tenés posiciones abiertas.</span><button class="btn small primary" data-action="goto" data-section="trade">Comprar criptomonedas</button></div>'
    : `<table><thead><tr><th>Moneda</th><th class="num">Cantidad</th><th class="num">Precio actual</th><th class="num">Valor (USD)</th><th class="num">Valor (ARS)</th><th class="num">Costo</th><th class="num">Ganancia / pérdida</th></tr></thead><tbody>` +
      p.rows.map(r => {
        const c = coinOf(r.sym);
        return `<tr><td><div class="coin-cell">${coinLogo(c, 'sm')}<div>${esc(c.name)}<span class="sub">${r.sym}</span></div></div></td>
          <td class="num">${fmtQty(r.qty)}</td><td class="num">${fmtMoney(r.price, 'USD')}</td>
          <td class="num">${fmtMoney(r.value, 'USD')}</td><td class="num">${fmtMoney(toARS(r.value), 'ARS')}</td>
          <td class="num">${fmtMoney(r.cost, 'USD')}</td>
          <td class="num ${trend(r.pnl)}">${isNum(r.pnl) ? (r.pnl > 0 ? '+' : '') + fmtMoney(r.pnl, 'USD') : '—'}<span class="sub">${fmtPct(r.pnlPct)}</span></td></tr>`;
      }).join('') + '</tbody></table>';
}

function renderHistory() {
  const list = store.history.filter(o => S.histFilter === 'all' || o.type === S.histFilter);
  $$('#hist-filters .chip').forEach(b => b.classList.toggle('active', b.dataset.filter === S.histFilter));
  $('#hist-body').innerHTML = !list.length
    ? '<div class="empty"><span>No hay operaciones para mostrar.</span><button class="btn small primary" data-action="goto" data-section="trade">Hacer una operación</button></div>'
    : `<table><thead><tr><th>Fecha</th><th>Tipo</th><th>Cripto</th><th class="num">Cantidad</th><th class="num">Precio</th><th class="num">Total</th><th>Estado</th></tr></thead><tbody>` +
      list.map(o => `<tr>
        <td>${fmtDate(o.ts)}</td>
        <td><span class="badge ${o.type === 'buy' ? 'up' : 'down'}">${o.type === 'buy' ? 'Compra' : 'Venta'}</span></td>
        <td><div class="coin-cell">${coinLogo(coinOf(o.sym), 'sm')}${esc(o.sym)}</div></td>
        <td class="num">${fmtQty(o.qty)}</td>
        <td class="num">${fmtMoney(o.price, 'USD')}</td>
        <td class="num">${fmtMoney(o.total, 'USD')}${isNum(o.rate) ? `<span class="sub">${fmtMoney(o.total * o.rate, 'ARS')}</span>` : ''}</td>
        <td><span class="badge up">${esc(o.status || 'Completada')}</span></td></tr>`).join('') + '</tbody></table>';
}

/* ---------------------------------------------------------------------
   9. COMPRA Y VENTA (SIMULADA)
   --------------------------------------------------------------------- */
function syncTradeUI() {
  $('#trade-coin').value = S.trade.sym;
}
function initTradeSelect() {
  $('#trade-coin').innerHTML = COINS.map(c => `<option value="${c.symbol}">${c.name} (${c.symbol})</option>`).join('');
}

/** Actualiza resumen, botón y panel lateral sin tocar el input */
function updateTrade() {
  const { side, sym } = S.trade;
  const m = S.market[sym];
  const price = m ? m.price : NaN;
  const qty = parseQty($('#trade-qty').value);
  const hasQty = isNum(qty) && qty > 0;
  const total = hasQty && isNum(price) ? qty * price : NaN;
  const held = store.holdings[sym] ? store.holdings[sym].qty : 0;

  $('#sec-trade').dataset.side = side;
  $$('#sec-trade .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.side === side));
  $('#trade-qty-unit').textContent = sym;

  // Validaciones
  let hint = '';
  if (!isNum(price)) hint = S.marketReady ? 'Precio no disponible para esta moneda.' : 'Esperando precios del mercado…';
  else if ($('#trade-qty').value.trim() && !hasQty) hint = 'Ingresá una cantidad válida mayor a 0.';
  else if (hasQty && side === 'buy' && total > store.cash + 1e-9) hint = 'Saldo insuficiente para esta compra.';
  else if (hasQty && side === 'sell' && qty > held + 1e-9) hint = `No tenés suficiente ${sym}. Disponible: ${fmtQty(held)}.`;
  $('#trade-hint').textContent = hint;

  $('#trade-summary').innerHTML = `
    <div class="sum-row"><span>Precio</span><b>${fmtMoney(price, 'USD')}</b></div>
    <div class="sum-row"><span>Precio en ARS</span><b>${fmtMoney(toARS(price), 'ARS')}</b></div>
    <div class="sum-row"><span>${side === 'buy' ? 'Saldo disponible' : 'Tenés'}</span><b>${side === 'buy' ? fmtMoney(store.cash, 'USD') : fmtQty(held) + ' ' + sym}</b></div>
    <div class="sum-row total"><span>Total</span><b>${fmtMoney(total, 'USD')}${isNum(total) && isNum(toARS(total)) ? ` <span class="muted small">≈ ${fmtMoney(toARS(total), 'ARS')}</span>` : ''}</b></div>`;

  const btn = $('#trade-submit');
  if (!btn.classList.contains('loading')) {
    btn.textContent = `${side === 'buy' ? 'Comprar' : 'Vender'} ${sym}`;
    btn.className = 'btn block ' + (side === 'buy' ? 'buy' : 'sell');
    btn.disabled = !(hasQty && isNum(price) && !hint);
  }

  // Panel lateral con info de la moneda
  const c = coinOf(sym);
  $('#trade-info').innerHTML = `
    <div class="trade-info-head">${coinLogo(c, 'lg')}<div><h2>${side === 'buy' ? 'Comprar' : 'Vender'} ${esc(c.name)}</h2><span class="muted small">${esc(sym)}</span></div>${m ? `<span style="margin-left:auto">${badge(m.change24h)}</span>` : ''}</div>
    <div class="trade-info-price">${fmtMoney(price, 'USD')}</div>
    <div class="muted">${fmtMoney(toARS(price), 'ARS')}</div>
    ${m ? sparkline(m.spark) : ''}
    <div class="summary kv">
      <div class="sum-row"><span>Máximo 24h</span><b>${fmtMoney(m && m.high, 'USD')}</b></div>
      <div class="sum-row"><span>Mínimo 24h</span><b>${fmtMoney(m && m.low, 'USD')}</b></div>
      <div class="sum-row"><span>Saldo disponible</span><b>${fmtMoney(store.cash, 'USD')}</b></div>
      <div class="sum-row"><span>Tenés de ${esc(sym)}</span><b>${fmtQty(held)}</b></div>
    </div>`;
}

/** Botones 25% / 50% / 75% / Máx */
function applyTradePct(pct) {
  const { side, sym } = S.trade;
  const m = S.market[sym];
  let qty = 0;
  if (side === 'buy') {
    if (!m || !isNum(m.price) || m.price <= 0) return toast('Precio no disponible', 'error');
    qty = Math.floor(((store.cash * pct) / 100 / m.price) * 1e8) / 1e8;
  } else {
    const h = store.holdings[sym];
    qty = h ? Math.floor(h.qty * (pct / 100) * 1e8) / 1e8 : 0;
  }
  $('#trade-qty').value = qty > 0 ? String(qty) : '';
  updateTrade();
}

/** Ejecuta la operación (con un pequeño efecto de carga) */
function submitTrade() {
  const btn = $('#trade-submit');
  if (btn.disabled || btn.classList.contains('loading')) return;
  btn.classList.add('loading');
  btn.textContent = 'Procesando…';
  setTimeout(() => {
    btn.classList.remove('loading');
    executeTrade();
    updateTrade();
  }, 700);
}

function executeTrade() {
  const { side, sym } = S.trade;
  const m = S.market[sym];
  if (!m || !isNum(m.price)) return toast('Precio no disponible. Probá de nuevo en unos segundos.', 'error');
  let qty = round8(parseQty($('#trade-qty').value));
  if (!(qty > 0)) return toast('Ingresá una cantidad válida.', 'error');
  const price = m.price;

  if (side === 'buy') {
    const total = qty * price;
    if (total > store.cash + 1e-9) return toast('Saldo insuficiente.', 'error');
    store.cash = Math.max(0, store.cash - total);
    const h = store.holdings[sym] || { qty: 0, cost: 0 };
    h.qty = round8(h.qty + qty);
    h.cost += total;
    store.holdings[sym] = h;
    pushHistory({ type: 'buy', sym, qty, price, total });
    toast(`Compraste ${fmtQty(qty)} ${sym}`, 'success');
  } else {
    const h = store.holdings[sym];
    if (!h || qty > h.qty + 1e-9) return toast(`No tenés suficiente ${sym}.`, 'error');
    qty = Math.min(qty, h.qty);
    const total = qty * price;
    const avg = h.qty > 0 ? h.cost / h.qty : 0;      // costo promedio
    h.cost = Math.max(0, h.cost - avg * qty);
    h.qty = round8(h.qty - qty);
    if (h.qty <= 0) delete store.holdings[sym];
    store.cash += total;
    pushHistory({ type: 'sell', sym, qty, price, total });
    toast(`Vendiste ${fmtQty(qty)} ${sym}`, 'success');
  }
  $('#trade-qty').value = '';
  saveStore();
  renderAll();
}

function pushHistory(op) {
  const r = getRate();
  store.history.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    ts: Date.now(), status: 'Completada', rate: isNum(r) ? r : null, ...op
  });
  if (store.history.length > CONFIG.MAX_HISTORY) store.history.length = CONFIG.MAX_HISTORY;
}

/* ---------------------------------------------------------------------
   10. ESTADÍSTICAS Y GRÁFICO
   --------------------------------------------------------------------- */
function renderStats() {
  // Selector de monedas
  $('#stats-tabs').innerHTML = COINS.map(c => {
    const m = S.market[c.symbol] || c;
    return `<button class="coin-tab ${c.symbol === S.statsCoin ? 'active' : ''}" data-action="stats-pick" data-sym="${c.symbol}">${coinLogo(m, 'sm')}${c.symbol}</button>`;
  }).join('');

  const tiles = $('#stats-tiles'), ov = $('#stats-overview');
  if (!S.marketReady) {
    const failed = S.status.market === 'error';
    tiles.innerHTML = failed ? '<div class="panel empty" style="grid-column:1/-1"><span>No hay estadísticas disponibles.</span><button class="btn small" data-action="refresh">Reintentar</button></div>'
      : Array.from({ length: 7 }, () => '<div class="stat-tile"><span class="sk" style="height:12px;width:60%;margin-bottom:10px"></span><span class="sk" style="height:24px"></span></div>').join('');
    ov.innerHTML = failed ? '' : Array.from({ length: 8 }, () => '<div class="ov-tile"><span class="sk" style="height:48px"></span></div>').join('');
    return;
  }

  const m = S.market[S.statsCoin];
  if (!m || !isNum(m.price)) {
    tiles.innerHTML = '<div class="panel empty" style="grid-column:1/-1"><span>No hay datos para esta moneda.</span></div>';
  } else {
    const t = trend(m.change24h);
    const pos = isNum(m.high) && isNum(m.low) && m.high > m.low ? Math.min(100, Math.max(0, ((m.price - m.low) / (m.high - m.low)) * 100)) : null;
    const tile = (i, label, value, extra = '', cls = '', big = false) =>
      `<div class="stat-tile ${big ? 'big' : ''}" style="--d:${i * 45}ms"><small>${label}</small><b class="${cls}">${value}</b>${extra}</div>`;
    tiles.innerHTML =
      tile(0, 'Precio actual', fmtMoney(m.price, 'USD'), `<em>${fmtMoney(toARS(m.price), 'ARS')}</em>`, '', true) +
      tile(1, 'Variación 24h', (m.changeAbs > 0 ? '+' : '') + fmtMoney(m.changeAbs, 'USD'), '', t) +
      tile(2, '% de subida / bajada', `${m.change24h >= 0 ? '▲' : '▼'} ${fmtPct(m.change24h)}`, '', t, true) +
      tile(3, 'Máximo 24h', fmtMoney(m.high, 'USD'), `<em>${fmtMoney(toARS(m.high), 'ARS')}</em>`, 'up') +
      tile(4, 'Mínimo 24h', fmtMoney(m.low, 'USD'), `<em>${fmtMoney(toARS(m.low), 'ARS')}</em>`, 'down') +
      tile(5, 'Volumen 24h', fmtCompact(m.volume)) +
      tile(6, 'Capitalización de mercado', fmtCompact(m.mcap), pos !== null ? `<div class="range" title="Posición dentro del rango de 24h"><i style="left:${pos}%"></i></div>` : '');
  }

  // Resumen de todas las monedas (ej: BTC $104.520 +3,42%)
  ov.innerHTML = COINS.map((c, i) => {
    const x = S.market[c.symbol];
    return `<div class="ov-tile" style="--d:${i * 40}ms" data-action="stats-pick" data-sym="${c.symbol}">
      <div class="s">${c.symbol}</div>
      <div class="p">${x ? fmtMoney(x.price, 'USD') : '—'}</div>
      <div class="c ${x ? trend(x.change24h) : ''}">${x ? fmtPct(x.change24h) : '—'}</div></div>`;
  }).join('');
}

// --- Gráfico (Chart.js)
const PERIODS = { '1H': { days: 1, ms: 3600e3 }, '24H': { days: 1 }, '7D': { days: 7 }, '30D': { days: 30 }, '1Y': { days: 365 } };
const chartCache = {};
let chart = null, chartReq = 0;

async function loadChart() {
  const coin = COINS.find(c => c.symbol === S.statsCoin);
  const per = PERIODS[chartState.period];
  const stateEl = $('#chart-state');
  $('#chart-title').textContent = `${coin.name} - Evolución del precio`;
  $$('#chart-periods .chip').forEach(b => b.classList.toggle('active', b.dataset.period === chartState.period));
  $$('#chart-cur .chip').forEach(b => b.classList.toggle('active', b.dataset.cur === chartState.cur));

  if (typeof Chart === 'undefined') {
    stateEl.innerHTML = '<span>No se pudo cargar la librería de gráficos (Chart.js). Revisá tu conexión.</span>';
    return;
  }
  const req = ++chartReq;
  stateEl.innerHTML = '<span class="sk" style="width:60%;height:14px"></span><span class="muted small">Cargando gráfico…</span>';

  try {
    const key = `${coin.id}_${per.days}`;
    let data = chartCache[key] && Date.now() - chartCache[key].t < CONFIG.CHART_CACHE_MS ? chartCache[key].d : null;
    if (!data) {
      data = await fetchJSON(`${CONFIG.CG_URL}/coins/${coin.id}/market_chart?vs_currency=usd&days=${per.days}`, 15000);
      chartCache[key] = { t: Date.now(), d: data };
    }
    if (req !== chartReq) return;                      // llegó una respuesta vieja: se descarta
    let pts = (data.prices || []).filter(p => Array.isArray(p) && isNum(p[1]));
    if (per.ms && pts.length) {                        // 1H: último tramo de la serie de 24h
      const last = pts[pts.length - 1][0];
      const cut = pts.filter(p => p[0] >= last - per.ms);
      pts = cut.length >= 2 ? cut : pts.slice(-12);
    }
    if (pts.length < 2) throw new Error('Sin datos suficientes');

    let rate = 1, cur = chartState.cur;
    if (cur === 'ARS') {
      rate = getRate();
      if (!isNum(rate)) { cur = 'USD'; rate = 1; chartState.cur = 'USD'; toast('Dólar no disponible: se muestra en USD.', 'error'); $$('#chart-cur .chip').forEach(b => b.classList.toggle('active', b.dataset.cur === 'USD')); }
    }
    const values = pts.map(p => p[1] * rate);
    const labels = pts.map(p => {
      const d = new Date(p[0]);
      if (chartState.period === '1H' || chartState.period === '24H') return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      if (chartState.period === '1Y') return d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
      return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    });
    const full = pts.map(p => new Date(p[0]).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }));
    const up = values[values.length - 1] >= values[0];
    drawChart(labels, values, full, up ? '#16c784' : '#ea3943', cur);
    stateEl.innerHTML = '';
  } catch (e) {
    if (req !== chartReq) return;
    console.warn('Gráfico falló:', e.message);
    stateEl.innerHTML = '<span>No se pudo cargar el gráfico.</span><button class="btn small" data-action="chart-retry">Reintentar</button>';
  }
}

function drawChart(labels, values, full, color, cur) {
  const ctx = $('#price-chart').getContext('2d');
  const fill = c => {
    const { chart: ch } = c;
    const a = ch.chartArea;
    if (!a) return color + '33';
    const g = ch.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
    return g;
  };
  const tickFmt = v => (cur === 'USD' ? '$' : '$') + Number(v).toLocaleString('es-AR', { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 });
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = values;
    chart.data.datasets[0].borderColor = color;
    chart.data.datasets[0].backgroundColor = fill;
    chart.options.scales.y.ticks.callback = tickFmt;
    chart.options.plugins.tooltip.callbacks = tipCallbacks(full, cur);
    chart.update();
    return;
  }
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ data: values, borderColor: color, backgroundColor: fill, borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#fff' }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 600 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: '#151c30', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#8b95ad', bodyColor: '#fff', padding: 12, displayColors: false, callbacks: tipCallbacks(full, cur) }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#8b95ad', maxTicksLimit: 7, maxRotation: 0 }, border: { display: false } },
        y: { position: 'right', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b95ad', callback: tickFmt }, border: { display: false } }
      }
    }
  });
}
const tipCallbacks = (full, cur) => ({
  title: items => full[items[0].dataIndex],
  label: item => fmtMoney(item.parsed.y, cur)
});

/* ---------------------------------------------------------------------
   11. EVENTOS (delegación: todo se maneja con data-action)
   --------------------------------------------------------------------- */
function renderAll() {
  renderTopbar();
  renderDolar();
  renderMarkets();
  renderDashboard();
  renderPortfolio();
  renderHistory();
  renderStats();
  updateTrade();
  updateConverter();
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const a = t.dataset.action;
  // Los botones dentro de tarjetas clickeables no deben disparar la acción de la tarjeta
  if (['trade-coin'].includes(a)) e.stopPropagation();

  switch (a) {
    case 'goto': go(t.dataset.section); break;
    case 'refresh': refreshAll(true); break;
    case 'stats-coin':
    case 'stats-pick':
      S.statsCoin = t.dataset.sym;
      if (S.section === 'stats') { renderStats(); loadChart(); } else go('stats');
      break;
    case 'trade-coin':
      S.trade.sym = t.dataset.sym; S.trade.side = t.dataset.side || 'buy';
      $('#trade-qty').value = '';
      go('trade');
      break;
    case 'trade-side':
      S.trade.side = t.dataset.side; $('#trade-qty').value = ''; updateTrade(); break;
    case 'trade-pct': applyTradePct(Number(t.dataset.pct)); break;
    case 'trade-submit': submitTrade(); break;
    case 'dolar-select':
      store.dolarCasa = t.dataset.casa; saveStore(); renderAll();
      if (S.section === 'stats' && chartState.cur === 'ARS') loadChart();
      break;
    case 'hist-filter': S.histFilter = t.dataset.filter; renderHistory(); break;
    case 'period': chartState.period = t.dataset.period; loadChart(); break;
    case 'chart-cur':
      if (t.dataset.cur === 'ARS' && !isNum(getRate())) return toast('Cotización del dólar no disponible.', 'error');
      chartState.cur = t.dataset.cur; loadChart(); break;
    case 'chart-retry': loadChart(); break;
    case 'reset':
      if (confirm('¿Reiniciar la cuenta demo? Se borrarán tu saldo, portfolio e historial.')) {
        const casa = store.dolarCasa;
        Object.assign(store, defaultStore(), { dolarCasa: casa });
        saveStore(); renderAll(); toast('Cuenta demo reiniciada', 'info');
      }
      break;
  }
});

function wireInputs() {
  $('#trade-coin').addEventListener('change', e => { S.trade.sym = e.target.value; $('#trade-qty').value = ''; updateTrade(); });
  $('#trade-qty').addEventListener('input', updateTrade);
  $('#trade-qty').addEventListener('keydown', e => { if (e.key === 'Enter') submitTrade(); });
  $('#conv-amount').addEventListener('input', updateConverter);
  $('#conv-from').addEventListener('change', e => { S.conv.from = e.target.value; updateConverter(); });
  $('#conv-to').addEventListener('change', e => { S.conv.to = e.target.value; updateConverter(); });
  $('#conv-swap').addEventListener('click', () => {
    [S.conv.from, S.conv.to] = [S.conv.to, S.conv.from];
    $('#conv-from').value = S.conv.from; $('#conv-to').value = S.conv.to;
    updateConverter();
  });
  window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (SECTIONS.includes(h) && h !== S.section) go(h); });
  // Al volver a la pestaña, actualiza si pasó más de un minuto
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - S.lastRefresh > CONFIG.REFRESH_MS) refreshAll();
  });
}

/* ---------------------------------------------------------------------
   12. INICIO
   --------------------------------------------------------------------- */
function init() {
  $$('[data-logo]').forEach(el => { el.innerHTML = LOGO_HTML; });
  renderNav();
  initTradeSelect();
  initConverter();
  wireInputs();
  renderAll();                      // primero se dibujan los estados de carga (skeletons)

  const start = location.hash.slice(1);
  go(SECTIONS.includes(start) ? start : 'dashboard');

  // Pantalla de bienvenida
  setTimeout(() => {
    $('#splash').classList.add('hide');
    $('#app').classList.add('ready');
    setTimeout(() => $('#splash').remove(), 800);
  }, CONFIG.SPLASH_MS);

  refreshAll();
  setInterval(() => { if (!document.hidden) refreshAll(); }, CONFIG.REFRESH_MS);
}
document.addEventListener('DOMContentLoaded', init);
