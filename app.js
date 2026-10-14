/* =====================================================================
   Coinly — app.js (versión compacta)
   Simulador de compra y venta de criptomonedas.
   APIs gratuitas, sin key: DolarAPI (dólar en Argentina) y CoinGecko (cripto).
   Mismo index.html y style.css que la versión larga.
   ===================================================================== */
'use strict';

/* ---------- 1. CONFIGURACIÓN ---------- */
const CFG = { DOLAR: 'https://dolarapi.com/v1/dolares', CG: 'https://api.coingecko.com/api/v3', REFRESH: 60000, KEY: 'coinly_state_v1', CACHE: 'coinly_cache_v1', CASH: 10000 };
const COINS = [
  ['bitcoin', 'BTC', 'Bitcoin', '#f7931a'], ['ethereum', 'ETH', 'Ethereum', '#627eea'], ['tether', 'USDT', 'Tether', '#26a17b'], ['binancecoin', 'BNB', 'BNB', '#f3ba2f'],
  ['solana', 'SOL', 'Solana', '#9945ff'], ['ripple', 'XRP', 'XRP', '#9aa4b8'], ['cardano', 'ADA', 'Cardano', '#3b82f6'], ['dogecoin', 'DOGE', 'Dogecoin', '#c2a633']
].map(([id, symbol, name, color]) => ({ id, symbol, name, color }));
const ASSETS = ['ARS', 'USD', ...COINS.map(c => c.symbol)];
const DOLAR_ORDER = ['oficial', 'blue', 'bolsa', 'contadoconliqui', 'cripto', 'tarjeta', 'mayorista'];
const NAV = [
  ['dashboard', 'Dashboard', 'Inicio', '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'],
  ['markets', 'Mercados', 'Mercados', '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'],
  ['trade', 'Comprar / Vender', 'Operar', '<path d="M7 7h13l-3-3"/><path d="M17 17H4l3 3"/>'],
  ['portfolio', 'Portfolio', 'Portfolio', '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>'],
  ['history', 'Historial', 'Historial', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  ['stats', 'Estadísticas', 'Stats', '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/>']
].map(([id, label, short, icon]) => ({ id, label, short, icon }));
const LOGO = 'C<span class="logo-o">o</span>inly<span class="logo-dot" aria-hidden="true"></span>';

/* ---------- 2. UTILIDADES Y FORMATO ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ok = v => typeof v === 'number' && Number.isFinite(v);
const num = v => (ok(v) ? v : NaN);
const round8 = n => Math.round(n * 1e8) / 1e8;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const loc = (n, min, max) => n.toLocaleString('es-AR', { minimumFractionDigits: min, maximumFractionDigits: max });
const parseQty = s => parseFloat(String(s).trim().replace(',', '.'));
const trend = n => (ok(n) ? (n >= 0 ? 'up' : 'down') : 'flat');

function money(n, cur = 'USD') {                       // US$ 1.234,56 · $ 1.234.567
  if (!ok(n)) return '—';
  const a = Math.abs(n);
  const [min, max] = a > 0 && a < 1 ? [2, a < 0.01 ? 6 : 4] : cur === 'ARS' && a >= 1000 ? [0, 0] : [2, 2];
  return (n < 0 ? '-' : '') + (cur === 'USD' ? 'US$ ' : '$ ') + loc(a, min, max);
}
function compact(n) {                                  // US$ 1,25 B
  if (!ok(n)) return '—';
  const u = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']].find(([v]) => Math.abs(n) >= v);
  return u ? `US$ ${loc(n / u[0], 0, 2)} ${u[1]}` : money(n);
}
const pct = n => (ok(n) ? (n > 0 ? '+' : '') + loc(n, 2, 2) + '%' : '—');
const qty = n => (ok(n) ? loc(n, 0, 8) : '—');
const fmtDate = v => { const d = new Date(v); return v && !isNaN(d) ? d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
function ago(ts) {
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return 'hace instantes';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `hace ${h} h` : `hace ${Math.round(h / 24)} d`;
}

// Piezas de HTML que se repiten
const badge = p => (ok(p) ? `<span class="badge ${trend(p)}">${p >= 0 ? '▲' : '▼'} ${pct(p)}</span>` : '<span class="badge flat">—</span>');
const coinLogo = (c, size = '') => `<span class="coin-logo ${size}" data-letter="${esc(c.symbol[0])}">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy" onerror="this.style.display='none'">` : ''}</span>`;
const icon = p => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const retry = '<button class="btn small" data-action="refresh">Reintentar</button>';
const empty = (msg, btn = '') => `<div class="empty"><span>${msg}</span>${btn}</div>`;
const loading = empty('Cargando…');
const goBtn = (sec, txt) => `<button class="btn small primary" data-action="goto" data-section="${sec}">${txt}</button>`;
const row = o => `<div class="row${o.act ? ' clickable' : ''}"${o.act || ''}>${o.logo || ''}<div class="row-main"><b class="${o.cls || ''}">${o.title}</b><small>${o.sub}</small></div><div class="row-end"><b>${o.end}</b>${o.endSub || ''}</div></div>`;
const sum = (l, v, c = '', t = '') => `<div class="sum-row ${t}"><span>${l}</span><b class="${c}">${v}</b></div>`;
const table = (heads, rows) => `<table><thead><tr>${heads.map(([h, n]) => `<th${n ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

function spark(arr) {                                  // mini gráfico SVG de 7 días
  if (!Array.isArray(arr) || arr.length < 2) return '<div style="height:38px"></div>';
  const step = Math.max(1, Math.floor(arr.length / 40)), p = arr.filter((_, i) => i % step === 0);
  const min = Math.min(...p), rng = Math.max(...p) - min || 1;
  const d = p.map((v, i) => `${((i / (p.length - 1)) * 100).toFixed(1)},${(30 - ((v - min) / rng) * 28).toFixed(1)}`).join(' ');
  return `<svg class="spark ${p.at(-1) >= p[0] ? 'up' : 'down'}" viewBox="0 0 100 32" preserveAspectRatio="none"><polyline points="${d}" fill="none" vector-effect="non-scaling-stroke"/></svg>`;
}
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = 'toast ' + type; el.textContent = msg;
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3200);
}

/* ---------- 3. ESTADO Y LOCALSTORAGE ---------- */
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin espacio */ } };
const defStore = () => ({ cash: CFG.CASH, holdings: {}, history: [], dolarCasa: 'oficial' });

const store = { ...defStore(), ...read(CFG.KEY, {}) };  // lo que se guarda: saldo, posiciones, historial, dólar elegido
if (!ok(store.cash)) store.cash = CFG.CASH;
if (!store.holdings || typeof store.holdings !== 'object') store.holdings = {};
if (!Array.isArray(store.history)) store.history = [];
const save = () => write(CFG.KEY, store);
const cacheSet = patch => write(CFG.CACHE, { ...read(CFG.CACHE, {}), ...patch });

const S = {                                            // estado de la interfaz (no se guarda)
  market: {}, dolares: [], status: { dolar: 'loading', market: 'loading' },   // loading | ok | stale | cache | error
  section: 'dashboard', coin: 'BTC', trade: { side: 'buy', sym: 'BTC' }, filter: 'all',
  conv: { from: 'BTC', to: 'ARS' }, period: '24H', cur: 'USD', stamp: 0, last: 0, shown: false
};
const mk = sym => S.market[sym];
const price = sym => mk(sym)?.price;
const ready = () => Object.keys(S.market).length > 0;
const dolar = () => S.dolares.find(d => d.casa === store.dolarCasa) || S.dolares[0];
const rate = () => num(dolar()?.venta);
const toARS = usd => (ok(usd) && ok(rate()) ? usd * rate() : NaN);
const coinOf = s => mk(s) || COINS.find(c => c.symbol === s) || { symbol: s, name: s };

/* ---------- 4. CARGA DE DATOS ---------- */
async function getJSON(url, ms = 12000) {              // fetch con timeout
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
/** Si la API falla: conserva lo que había (stale), usa el caché guardado (cache) o marca error. */
function fallback(name, key, apply) {
  const st = S.status[name];
  if (st === 'ok' || st === 'stale') { S.status[name] = 'stale'; return; }
  if (st === 'cache') return;
  const c = read(CFG.CACHE, {})[key];
  if (c && Object.keys(c).length) { apply(c); S.status[name] = 'cache'; } else S.status[name] = 'error';
}
async function loadDolares() {
  try {
    const list = (await getJSON(CFG.DOLAR)).filter(d => d && d.casa);
    if (!list.length) throw new Error('vacío');
    const rank = c => { const i = DOLAR_ORDER.indexOf(c); return i < 0 ? 99 : i; };
    S.dolares = list.map(d => ({ ...d, compra: num(d.compra), venta: num(d.venta) })).sort((a, b) => rank(a.casa) - rank(b.casa));
    S.status.dolar = 'ok';
    cacheSet({ dolares: S.dolares });
  } catch (e) { console.warn('DolarAPI falló:', e.message); fallback('dolar', 'dolares', l => { S.dolares = l; }); }
  if (S.dolares.length && !S.dolares.some(d => d.casa === store.dolarCasa)) { store.dolarCasa = S.dolares[0].casa; save(); }
}
async function loadMarket() {
  try {
    const ids = COINS.map(c => c.id).join(',');
    const data = await getJSON(`${CFG.CG}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`);
    const m = {};
    data.forEach(d => {
      const c = COINS.find(x => x.id === d.id);
      if (c) m[c.symbol] = { ...c, image: d.image, price: num(d.current_price), prev: S.market[c.symbol]?.price ?? NaN, change24h: num(d.price_change_percentage_24h), changeAbs: num(d.price_change_24h), high: num(d.high_24h), low: num(d.low_24h), volume: num(d.total_volume), mcap: num(d.market_cap), spark: d.sparkline_in_7d?.price || [] };
    });
    if (!Object.keys(m).length) throw new Error('sin monedas');
    S.market = m; S.stamp = Date.now(); S.status.market = 'ok';
    cacheSet({ market: m, marketT: S.stamp });
  } catch (e) { console.warn('CoinGecko falló:', e.message); fallback('market', 'market', m => { S.market = m; S.stamp = read(CFG.CACHE, {}).marketT || 0; }); }
}
let busy = false;
async function refreshAll(manual = false) {            // pide las dos APIs en paralelo y redibuja
  if (busy) return;
  busy = true;
  const b = $('#refresh-btn');
  b.classList.add('spinning');
  await Promise.allSettled([loadDolares(), loadMarket()]);
  S.last = Date.now();
  renderAll();
  b.classList.remove('spinning'); busy = false;
  if (manual) { const good = S.status.market === 'ok' && S.status.dolar === 'ok'; toast(good ? 'Datos actualizados' : 'Actualización con problemas', good ? 'success' : 'error'); }
}

/* ---------- 5. NAVEGACIÓN ---------- */
function renderNav() {
  const btns = key => NAV.map(n => `<button class="nav-btn" data-nav="${n.id}" data-action="goto" data-section="${n.id}" title="${n.label}">${icon(n.icon)}<span>${n[key]}</span></button>`).join('');
  $('#nav-side').innerHTML = btns('label');
  $('#nav-bottom').innerHTML = btns('short');
}
function go(name) {
  if (!NAV.some(n => n.id === name)) name = 'dashboard';
  S.section = name;
  $$('.section').forEach(s => s.classList.toggle('active', s.id === 'sec-' + name));
  $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === name));
  $('#page-title').textContent = NAV.find(n => n.id === name).label;
  try { history.replaceState(null, '', '#' + name); } catch { /* file:// */ }
  scrollTo({ top: 0 });
  if (name === 'stats') { renderStats(); loadChart(); }
  if (name === 'trade') updateTrade();
  if (name === 'portfolio') renderPortfolio();
}

/* ---------- 6. ESTADO DE CONEXIÓN Y AVISOS ---------- */
const MSG = {
  market: { error: 'No pudimos conectar con CoinGecko. Los precios no están disponibles.', cache: () => `CoinGecko no responde. Mostrando los últimos precios guardados${S.stamp ? ` (${ago(S.stamp)})` : ''}.`, stale: 'No se pudo actualizar el mercado. Se muestran los últimos precios obtenidos.' },
  dolar: { error: 'No se pudo cargar DolarAPI. Las conversiones a pesos no están disponibles.', cache: 'DolarAPI no responde. Usando la última cotización guardada.', stale: 'No se pudo actualizar el dólar. Se muestra la última cotización obtenida.' }
};
function renderStatus() {
  const { dolar: d, market: m } = S.status;
  const [cls, txt] = d === 'loading' || m === 'loading' ? ['loading', 'Cargando…'] : d === 'error' && m === 'error' ? ['error', 'Sin conexión'] : [d, m].some(s => s !== 'ok') ? ['warn', 'Datos parciales'] : ['ok', 'En vivo'];
  $('#status-pill').className = 'status-pill ' + cls;
  $('#status-pill').innerHTML = `<i></i><span>${txt}</span>`;
  const msgs = [MSG.market[m], MSG.dolar[d]].filter(Boolean).map(x => (typeof x === 'function' ? x() : x));
  const el = $('#banner');
  el.className = 'banner' + (m === 'error' || d === 'error' ? ' error' : '') + (msgs.length ? '' : ' hidden');
  el.innerHTML = msgs.length ? `<span>${esc(msgs.join(' '))}</span>${retry}` : '';
}

/* ---------- 7. RENDER: ENCABEZADO, DÓLAR, MERCADOS, CONVERSOR ---------- */
function renderTopbar() {
  const d = dolar();
  $('#dolar-chip').innerHTML = d ? `Dólar ${esc(d.nombre || d.casa)}: <b>${money(d.venta, 'ARS')}</b>` : S.status.dolar === 'error' ? 'Dólar no disponible' : 'Cargando…';
}
function renderDolar() {
  const grid = $('#dolar-grid'), compactEl = $('#dash-dolar');
  if (!S.dolares.length) { grid.innerHTML = compactEl.innerHTML = S.status.dolar === 'error' ? empty('No se pudo cargar la cotización del dólar.', retry) : loading; return; }
  grid.innerHTML = S.dolares.map((d, i) => {
    const sel = d.casa === store.dolarCasa;
    return `<button class="dolar-card ${sel ? 'selected' : ''}" style="--d:${i * 50}ms" data-action="dolar-select" data-casa="${esc(d.casa)}">
      <div class="dc-top"><span>${esc(d.nombre || d.casa)}</span>${sel ? '<span class="tag">En uso</span>' : ''}</div>
      <div class="dc-grid"><div><small>Compra</small><b>${money(d.compra, 'ARS')}</b></div><div><small>Venta</small><b>${money(d.venta, 'ARS')}</b></div></div>
      <div class="dc-date">Actualizado: ${fmtDate(d.fechaActualizacion)}</div></button>`;
  }).join('');
  compactEl.innerHTML = '<div class="list">' + S.dolares.slice(0, 5).map(d => row({ act: ` data-action="dolar-select" data-casa="${esc(d.casa)}"`, title: esc(d.nombre || d.casa), sub: d.casa === store.dolarCasa ? 'En uso' : 'Tocá para usar', end: money(d.venta, 'ARS'), endSub: `<small>Compra ${money(d.compra, 'ARS')}</small>` })).join('') + '</div>';
}
function coinCard(c, i, first) {
  const m = mk(c.symbol), cls = `coin-card${first ? ' reveal' : ''}`, st = `style="--d:${i * 50}ms"`;
  if (!ok(m?.price)) return `<article class="${cls}" ${st}><div class="coin-head">${coinLogo(c)}<div><div class="coin-name">${esc(c.name)}</div><div class="coin-sym">${c.symbol}</div></div><span class="badge flat">Sin datos</span></div><div class="coin-price">—</div></article>`;
  const flash = ok(m.prev) && m.prev !== m.price ? (m.price > m.prev ? 'flash-up' : 'flash-down') : '';
  const btn = (side, txt, x = '') => `<button class="btn small ${x}" data-action="trade-coin" data-sym="${m.symbol}" data-side="${side}">${txt}</button>`;
  return `<article class="${cls}" ${st} data-action="stats-coin" data-sym="${m.symbol}">
    <div class="coin-head">${coinLogo(m)}<div><div class="coin-name">${esc(m.name)}</div><div class="coin-sym">${m.symbol}</div></div>${badge(m.change24h)}</div>
    <div><div class="coin-price ${flash}">${money(m.price)}</div><div class="coin-price-ars">${money(toARS(m.price), 'ARS')}</div></div>
    ${spark(m.spark)}<div class="coin-actions">${btn('buy', 'Comprar', 'buy')}${btn('sell', 'Vender')}</div></article>`;
}
function renderMarkets() {
  const el = $('#market-grid');
  if (!ready()) { el.innerHTML = `<div class="panel empty" style="grid-column:1/-1"><span>${S.status.market === 'error' ? 'No hay datos de mercado disponibles.' : 'Cargando…'}</span>${S.status.market === 'error' ? retry : ''}</div>`; return; }
  const first = !S.shown;
  S.shown = true;
  el.innerHTML = COINS.map((c, i) => coinCard(c, i, first)).join('');
}

// Conversor: todo pasa por USD. usdPer(x) = cuántos USD vale 1 unidad de x.
const usdPer = a => (a === 'USD' ? 1 : a === 'ARS' ? (rate() > 0 ? 1 / rate() : NaN) : price(a));
const fmtAsset = (v, a) => (!ok(v) ? '—' : a === 'ARS' || a === 'USD' ? money(v, a) : `${qty(v)} ${a}`);
function updateConverter() {
  const amount = parseQty($('#conv-amount').value), { from, to } = S.conv, out = $('#conv-result'), note = $('#conv-note');
  if (!ok(amount) || amount < 0) { out.textContent = '—'; note.textContent = 'Ingresá un monto válido.'; return; }
  const res = (amount * usdPer(from)) / usdPer(to), d = dolar();
  out.textContent = ok(res) ? `${fmtAsset(amount, from)} = ${fmtAsset(res, to)}` : '—';
  note.textContent = !ok(res) ? ((from === 'ARS' || to === 'ARS') && !ok(rate()) ? 'Cotización del dólar no disponible.' : 'Precio no disponible por el momento.')
    : d ? `Dólar usado: ${d.nombre || d.casa} (venta ${money(d.venta, 'ARS')}). Valor de referencia, sin comisiones.` : 'Valor de referencia, sin comisiones.';
}

/* ---------- 8. RENDER: DASHBOARD, PORTFOLIO, HISTORIAL ---------- */
function portfolio() {                                 // valor del portfolio con los precios actuales
  let crypto = 0, cost = 0, missing = false;
  const rows = Object.entries(store.holdings).filter(([, h]) => h?.qty > 0).map(([sym, h]) => {
    const p = price(sym), value = ok(p) ? h.qty * p : NaN;
    if (ok(value)) crypto += value; else missing = true;
    cost += h.cost;
    return { sym, qty: h.qty, cost: h.cost, price: p, value, pnl: value - h.cost, pnlPct: h.cost > 0 ? ((value - h.cost) / h.cost) * 100 : NaN };
  });
  const total = store.cash + crypto;
  return { rows, crypto, cost, total, missing, pnl: crypto - cost, pnlPct: cost > 0 ? ((crypto - cost) / cost) * 100 : 0, ret: ((total - CFG.CASH) / CFG.CASH) * 100 };
}
function renderDashboard() {
  const p = portfolio(), stat = (l, b, e, c = '') => `<div class="mini-stat"><small>${l}</small><b class="${c}">${b}</b><em class="${c}">${e}</em></div>`;
  const ars = toARS(p.total);
  $('#dash-hero').innerHTML = p.missing && !ready() ? loading : `
    <div><div class="eyebrow">PORTFOLIO · SALDO TOTAL</div>
      <div class="hero-amount">${ok(ars) ? money(ars, 'ARS') : money(p.total)}</div>
      <div class="hero-sub"><span>${ok(ars) ? money(p.total) : 'Dólar no disponible'}</span>${badge(p.ret)}<span class="tiny">vs. saldo inicial</span></div>
      ${p.missing ? '<div class="tiny muted" style="margin-top:6px">Algunos precios no están disponibles.</div>' : ''}</div>
    <div class="hero-stats">${stat('Saldo disponible', money(store.cash), money(toARS(store.cash), 'ARS'))}${stat('Valor en cripto', money(p.crypto), money(toARS(p.crypto), 'ARS'))}${stat('Ganancia / pérdida', (p.pnl > 0 ? '+' : '') + money(p.pnl), p.cost > 0 ? pct(p.pnlPct) : 'Sin posiciones', trend(p.pnl))}</div>`;

  const act = sym => ` data-action="stats-coin" data-sym="${sym}"`;
  $('#dash-market').innerHTML = !ready() ? (S.status.market === 'error' ? empty('Sin datos de mercado.', retry) : loading)
    : '<div class="list">' + COINS.map(c => { const m = mk(c.symbol); return ok(m?.price) ? row({ act: act(c.symbol), logo: coinLogo(m, 'sm'), title: esc(m.name), sub: m.symbol, end: money(m.price), endSub: badge(m.change24h) }) : row({ logo: coinLogo(c, 'sm'), title: esc(c.name), sub: c.symbol, end: '—' }); }).join('') + '</div>';
  $('#dash-holdings').innerHTML = !p.rows.length ? empty('Todavía no tenés criptomonedas.', goBtn('trade', 'Hacé tu primera compra'))
    : '<div class="list">' + p.rows.map(r => { const c = coinOf(r.sym); return row({ act: act(r.sym), logo: coinLogo(c, 'sm'), title: esc(c.name), sub: `${qty(r.qty)} ${r.sym}`, end: money(r.value), endSub: `<small>${money(toARS(r.value), 'ARS')}</small>` }); }).join('') + '</div>';
  $('#dash-ops').innerHTML = !store.history.length ? empty('Todavía no hiciste operaciones.')
    : '<div class="list">' + store.history.slice(0, 5).map(o => row({ logo: coinLogo(coinOf(o.sym), 'sm'), cls: o.type === 'buy' ? 'up' : 'down', title: `${o.type === 'buy' ? 'Compra' : 'Venta'} ${esc(o.sym)}`, sub: fmtDate(o.ts), end: money(o.total), endSub: `<small>${qty(o.qty)} ${esc(o.sym)}</small>` })).join('') + '</div>';
}
function renderPortfolio() {
  const p = portfolio();
  // Dona de distribución con conic-gradient (CSS puro, sin librería)
  const parts = [{ label: 'Saldo disponible', value: store.cash, color: '#5b6b8c' }, ...p.rows.filter(r => ok(r.value)).map(r => ({ label: coinOf(r.sym).name, value: r.value, color: coinOf(r.sym).color || '#7c6cff' }))];
  const total = parts.reduce((a, x) => a + x.value, 0) || 1;
  let acc = 0;
  const stops = parts.map(x => { const from = acc; acc += (x.value / total) * 100; return `${x.color} ${from.toFixed(2)}% ${acc.toFixed(2)}%`; }).join(', ');
  $('#pf-alloc').innerHTML = `<div class="panel-head"><h2>Distribución</h2></div><div class="alloc">
    <div class="donut" style="background:conic-gradient(${stops})"><div class="donut-center"><small>Total</small><b>${money(p.total)}</b></div></div>
    <div class="legend">${parts.map(x => `<div class="legend-row"><i style="background:${x.color}"></i>${esc(x.label)}<span>${((x.value / total) * 100).toFixed(1)}%</span></div>`).join('')}</div></div>`;
  $('#pf-summary').innerHTML = `<div class="panel-head"><h2>Resumen</h2></div><div class="summary">
    ${sum('Saldo total', money(p.total))}${sum('Saldo total (ARS)', money(toARS(p.total), 'ARS'))}${sum('Saldo disponible', money(store.cash))}${sum('Valor en cripto', money(p.crypto))}${sum('Invertido (costo)', money(p.cost))}
    ${sum('Ganancia / pérdida', `${p.pnl > 0 ? '+' : ''}${money(p.pnl)} (${p.cost > 0 ? pct(p.pnlPct) : '—'})`, trend(p.pnl), 'total')}</div>`;
  $('#pf-table').innerHTML = !p.rows.length ? empty('No tenés posiciones abiertas.', goBtn('trade', 'Comprar criptomonedas'))
    : table([['Moneda'], ['Cantidad', 1], ['Precio actual', 1], ['Valor (USD)', 1], ['Valor (ARS)', 1], ['Costo', 1], ['Ganancia / pérdida', 1]], p.rows.map(r => {
      const c = coinOf(r.sym);
      return `<tr><td><div class="coin-cell">${coinLogo(c, 'sm')}<div>${esc(c.name)}<span class="sub">${r.sym}</span></div></div></td>
        <td class="num">${qty(r.qty)}</td><td class="num">${money(r.price)}</td><td class="num">${money(r.value)}</td><td class="num">${money(toARS(r.value), 'ARS')}</td><td class="num">${money(r.cost)}</td>
        <td class="num ${trend(r.pnl)}">${ok(r.pnl) ? (r.pnl > 0 ? '+' : '') + money(r.pnl) : '—'}<span class="sub">${pct(r.pnlPct)}</span></td></tr>`;
    }));
}
function renderHistory() {
  const list = store.history.filter(o => S.filter === 'all' || o.type === S.filter);
  $$('#hist-filters .chip').forEach(b => b.classList.toggle('active', b.dataset.filter === S.filter));
  $('#hist-body').innerHTML = !list.length ? empty('No hay operaciones para mostrar.', goBtn('trade', 'Hacer una operación'))
    : table([['Fecha'], ['Tipo'], ['Cripto'], ['Cantidad', 1], ['Precio', 1], ['Total', 1], ['Estado']], list.map(o => `<tr>
      <td>${fmtDate(o.ts)}</td><td><span class="badge ${o.type === 'buy' ? 'up' : 'down'}">${o.type === 'buy' ? 'Compra' : 'Venta'}</span></td>
      <td><div class="coin-cell">${coinLogo(coinOf(o.sym), 'sm')}${esc(o.sym)}</div></td><td class="num">${qty(o.qty)}</td><td class="num">${money(o.price)}</td>
      <td class="num">${money(o.total)}${ok(o.rate) ? `<span class="sub">${money(o.total * o.rate, 'ARS')}</span>` : ''}</td><td><span class="badge up">${esc(o.status || 'Completada')}</span></td></tr>`));
}

/* ---------- 9. COMPRA Y VENTA (SIMULADA) ---------- */
function updateTrade() {                               // se ejecuta en cada tecla: valida y actualiza resumen y botón
  const { side, sym } = S.trade, m = mk(sym), p = m?.price, raw = $('#trade-qty').value.trim(), q = parseQty(raw);
  const hasQ = ok(q) && q > 0, total = hasQ && ok(p) ? q * p : NaN, held = store.holdings[sym]?.qty || 0, verb = side === 'buy' ? 'Comprar' : 'Vender';
  $('#trade-coin').value = sym;
  $('#sec-trade').dataset.side = side;
  $$('#sec-trade .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.side === side));
  $('#trade-qty-unit').textContent = sym;

  const hint = !ok(p) ? (ready() ? 'Precio no disponible para esta moneda.' : 'Esperando precios del mercado…')
    : raw && !hasQ ? 'Ingresá una cantidad válida mayor a 0.'
    : hasQ && side === 'buy' && total > store.cash + 1e-9 ? 'Saldo insuficiente para esta compra.'
    : hasQ && side === 'sell' && q > held + 1e-9 ? `No tenés suficiente ${sym}. Disponible: ${qty(held)}.` : '';
  $('#trade-hint').textContent = hint;
  $('#trade-summary').innerHTML = sum('Precio', money(p)) + sum('Precio en ARS', money(toARS(p), 'ARS'))
    + (side === 'buy' ? sum('Saldo disponible', money(store.cash)) : sum('Tenés', `${qty(held)} ${sym}`))
    + sum('Total', money(total) + (ok(toARS(total)) ? ` <span class="muted small">≈ ${money(toARS(total), 'ARS')}</span>` : ''), '', 'total');

  const btn = $('#trade-submit');
  if (!btn.classList.contains('loading')) {
    btn.textContent = `${verb} ${sym}`;
    btn.className = 'btn block ' + (side === 'buy' ? 'buy' : 'sell');
    btn.disabled = !(hasQ && ok(p) && !hint);
  }
  const c = coinOf(sym);
  $('#trade-info').innerHTML = `<div class="trade-info-head">${coinLogo(c, 'lg')}<div><h2>${verb} ${esc(c.name)}</h2><span class="muted small">${esc(sym)}</span></div>${m ? `<span style="margin-left:auto">${badge(m.change24h)}</span>` : ''}</div>
    <div class="trade-info-price">${money(p)}</div><div class="muted">${money(toARS(p), 'ARS')}</div>${m ? spark(m.spark) : ''}
    <div class="summary kv">${sum('Máximo 24h', money(m?.high))}${sum('Mínimo 24h', money(m?.low))}${sum('Saldo disponible', money(store.cash))}${sum(`Tenés de ${esc(sym)}`, qty(held))}</div>`;
}
function applyPct(pc) {                                // botones 25% / 50% / 75% / Máx
  const { side, sym } = S.trade, p = price(sym);
  let q;
  if (side === 'buy') { if (!ok(p) || p <= 0) return toast('Precio no disponible', 'error'); q = (store.cash * pc) / 100 / p; }
  else q = ((store.holdings[sym]?.qty || 0) * pc) / 100;
  q = Math.floor(q * 1e8) / 1e8;
  $('#trade-qty').value = q > 0 ? String(q) : '';
  updateTrade();
}
function submitTrade() {                               // pequeño "Procesando…" y se ejecuta
  const b = $('#trade-submit');
  if (b.disabled || b.classList.contains('loading')) return;
  b.classList.add('loading'); b.textContent = 'Procesando…';
  setTimeout(() => { b.classList.remove('loading'); executeTrade(); updateTrade(); }, 700);
}
function executeTrade() {
  const { side, sym } = S.trade, pr = price(sym);
  if (!ok(pr)) return toast('Precio no disponible. Probá de nuevo en unos segundos.', 'error');
  let q = round8(parseQty($('#trade-qty').value));
  if (!(q > 0)) return toast('Ingresá una cantidad válida.', 'error');
  const h = store.holdings[sym] || { qty: 0, cost: 0 };
  if (side === 'buy') {
    if (q * pr > store.cash + 1e-9) return toast('Saldo insuficiente.', 'error');
    store.cash = Math.max(0, store.cash - q * pr);
    h.qty = round8(h.qty + q); h.cost += q * pr;
    store.holdings[sym] = h;
  } else {
    if (q > h.qty + 1e-9) return toast(`No tenés suficiente ${sym}.`, 'error');
    q = Math.min(q, h.qty);
    h.cost = Math.max(0, h.cost - (h.cost / h.qty) * q);      // se descuenta el costo promedio
    h.qty = round8(h.qty - q);
    if (h.qty <= 0) delete store.holdings[sym];
    store.cash += q * pr;
  }
  const r = rate();
  store.history.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), ts: Date.now(), status: 'Completada', rate: ok(r) ? r : null, type: side, sym, qty: q, price: pr, total: q * pr });
  store.history.length = Math.min(store.history.length, 500);
  toast(`${side === 'buy' ? 'Compraste' : 'Vendiste'} ${qty(q)} ${sym}`, 'success');
  $('#trade-qty').value = '';
  save(); renderAll();
}

/* ---------- 10. ESTADÍSTICAS Y GRÁFICO ---------- */
function renderStats() {
  $('#stats-tabs').innerHTML = COINS.map(c => `<button class="coin-tab ${c.symbol === S.coin ? 'active' : ''}" data-action="stats-pick" data-sym="${c.symbol}">${coinLogo(mk(c.symbol) || c, 'sm')}${c.symbol}</button>`).join('');
  const tiles = $('#stats-tiles'), ov = $('#stats-overview'), m = mk(S.coin);
  if (!ready()) {
    const failed = S.status.market === 'error';
    tiles.innerHTML = `<div class="panel empty" style="grid-column:1/-1"><span>${failed ? 'No hay estadísticas disponibles.' : 'Cargando…'}</span>${failed ? retry : ''}</div>`;
    ov.innerHTML = ''; return;
  }
  if (!ok(m?.price)) tiles.innerHTML = '<div class="panel empty" style="grid-column:1/-1"><span>No hay datos para esta moneda.</span></div>';
  else {
    const t = trend(m.change24h), ars = v => `<em>${money(toARS(v), 'ARS')}</em>`;
    const pos = ok(m.high) && ok(m.low) && m.high > m.low ? Math.min(100, Math.max(0, ((m.price - m.low) / (m.high - m.low)) * 100)) : null;
    const tile = (i, l, v, extra = '', cls = '', big = false) => `<div class="stat-tile ${big ? 'big' : ''}" style="--d:${i * 45}ms"><small>${l}</small><b class="${cls}">${v}</b>${extra}</div>`;
    tiles.innerHTML = [
      tile(0, 'Precio actual', money(m.price), ars(m.price), '', true),
      tile(1, 'Variación 24h', (m.changeAbs > 0 ? '+' : '') + money(m.changeAbs), '', t),
      tile(2, '% de subida / bajada', `${m.change24h >= 0 ? '▲' : '▼'} ${pct(m.change24h)}`, '', t, true),
      tile(3, 'Máximo 24h', money(m.high), ars(m.high), 'up'),
      tile(4, 'Mínimo 24h', money(m.low), ars(m.low), 'down'),
      tile(5, 'Volumen 24h', compact(m.volume)),
      tile(6, 'Capitalización de mercado', compact(m.mcap), pos !== null ? `<div class="range" title="Posición dentro del rango de 24h"><i style="left:${pos}%"></i></div>` : '')
    ].join('');
  }
  ov.innerHTML = COINS.map((c, i) => { const x = mk(c.symbol); return `<div class="ov-tile" style="--d:${i * 40}ms" data-action="stats-pick" data-sym="${c.symbol}"><div class="s">${c.symbol}</div><div class="p">${x ? money(x.price) : '—'}</div><div class="c ${x ? trend(x.change24h) : ''}">${x ? pct(x.change24h) : '—'}</div></div>`; }).join('');
}

// Gráfico con Chart.js. El período 1H sale de recortar los datos de 24H.
const PERIODS = { '1H': 1, '24H': 1, '7D': 7, '30D': 30, '1Y': 365 };
const chartCache = {};
let chart = null, chartReq = 0;

async function loadChart() {
  const coin = COINS.find(c => c.symbol === S.coin), days = PERIODS[S.period], el = $('#chart-state');
  const mark = () => {
    $$('#chart-periods .chip').forEach(b => b.classList.toggle('active', b.dataset.period === S.period));
    $$('#chart-cur .chip').forEach(b => b.classList.toggle('active', b.dataset.cur === S.cur));
  };
  $('#chart-title').textContent = `${coin.name} - Evolución del precio`;
  mark();
  if (typeof Chart === 'undefined') { el.innerHTML = '<span>No se pudo cargar la librería de gráficos (Chart.js). Revisá tu conexión.</span>'; return; }
  const my = ++chartReq;                               // si llega una respuesta vieja, se descarta
  el.innerHTML = '<span class="muted small">Cargando gráfico…</span>';
  try {
    const key = `${coin.id}_${days}`, hit = chartCache[key];
    let data = hit && Date.now() - hit.t < 120000 ? hit.d : null;      // caché de 2 min (límites de la API)
    if (!data) { data = await getJSON(`${CFG.CG}/coins/${coin.id}/market_chart?vs_currency=usd&days=${days}`, 15000); chartCache[key] = { t: Date.now(), d: data }; }
    if (my !== chartReq) return;
    let pts = (data.prices || []).filter(p => Array.isArray(p) && ok(p[1]));
    if (S.period === '1H' && pts.length) { const cut = pts.filter(p => p[0] >= pts.at(-1)[0] - 36e5); pts = cut.length >= 2 ? cut : pts.slice(-12); }
    if (pts.length < 2) throw new Error('Sin datos suficientes');
    let rt = 1;
    if (S.cur === 'ARS') { rt = rate(); if (!ok(rt)) { rt = 1; S.cur = 'USD'; mark(); toast('Dólar no disponible: se muestra en USD.', 'error'); } }
    const lab = S.period === '1H' || S.period === '24H' ? d => d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
      : S.period === '1Y' ? d => d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) : d => d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    const values = pts.map(p => p[1] * rt);
    drawChart(pts.map(p => lab(new Date(p[0]))), values, pts.map(p => new Date(p[0]).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })), values.at(-1) >= values[0] ? '#16c784' : '#ea3943', S.cur);
    el.innerHTML = '';
  } catch (e) {
    if (my !== chartReq) return;
    console.warn('Gráfico falló:', e.message);
    el.innerHTML = '<span>No se pudo cargar el gráfico.</span><button class="btn small" data-action="chart-retry">Reintentar</button>';
  }
}
function drawChart(labels, values, full, color, cur) {
  const fill = c => {                                  // relleno degradado bajo la línea
    const a = c.chart.chartArea;
    if (!a) return color + '33';
    const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
    g.addColorStop(0, color + '55'); g.addColorStop(1, color + '00');
    return g;
  };
  if (!chart) {
    chart = new Chart($('#price-chart').getContext('2d'), {
      type: 'line',
      data: { labels: [], datasets: [{ data: [], borderWidth: 2, fill: true, tension: 0.35, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#fff' }] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 600 }, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#151c30', borderColor: 'rgba(255,255,255,0.12)', borderWidth: 1, titleColor: '#8b95ad', bodyColor: '#fff', padding: 12, displayColors: false } },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#8b95ad', maxTicksLimit: 7, maxRotation: 0 }, border: { display: false } },
          y: { position: 'right', grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#8b95ad' }, border: { display: false } }
        }
      }
    });
  }
  chart.data.labels = labels;
  Object.assign(chart.data.datasets[0], { data: values, borderColor: color, backgroundColor: fill });
  chart.options.scales.y.ticks.callback = v => '$' + Number(v).toLocaleString('es-AR', { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 });
  chart.options.plugins.tooltip.callbacks = { title: i => full[i[0].dataIndex], label: i => money(i.parsed.y, cur) };
  chart.update();
}

/* ---------- 11. EVENTOS (delegación: todo se maneja con data-action) ---------- */
function renderAll() {
  renderTopbar(); renderStatus(); renderDolar(); renderMarkets(); renderDashboard();
  renderPortfolio(); renderHistory(); renderStats(); updateTrade(); updateConverter();
}
const pickStats = t => { S.coin = t.dataset.sym; if (S.section === 'stats') { renderStats(); loadChart(); } else go('stats'); };
const ACTIONS = {
  goto: t => go(t.dataset.section),
  refresh: () => refreshAll(true),
  'stats-coin': pickStats,
  'stats-pick': pickStats,
  'trade-coin': t => { S.trade = { sym: t.dataset.sym, side: t.dataset.side || 'buy' }; $('#trade-qty').value = ''; go('trade'); },
  'trade-side': t => { S.trade.side = t.dataset.side; $('#trade-qty').value = ''; updateTrade(); },
  'trade-pct': t => applyPct(Number(t.dataset.pct)),
  'trade-submit': submitTrade,
  'dolar-select': t => { store.dolarCasa = t.dataset.casa; save(); renderAll(); if (S.section === 'stats' && S.cur === 'ARS') loadChart(); },
  'hist-filter': t => { S.filter = t.dataset.filter; renderHistory(); },
  period: t => { S.period = t.dataset.period; loadChart(); },
  'chart-cur': t => { if (t.dataset.cur === 'ARS' && !ok(rate())) return toast('Cotización del dólar no disponible.', 'error'); S.cur = t.dataset.cur; loadChart(); },
  'chart-retry': () => loadChart(),
  reset: () => {
    if (!confirm('¿Reiniciar la cuenta demo? Se borrarán tu saldo, portfolio e historial.')) return;
    Object.assign(store, defStore(), { dolarCasa: store.dolarCasa });
    save(); renderAll(); toast('Cuenta demo reiniciada', 'info');
  }
};
document.addEventListener('click', e => {              // un solo listener para todos los botones
  const t = e.target.closest('[data-action]');
  if (t) ACTIONS[t.dataset.action]?.(t);
});

function wireInputs() {
  $('#trade-coin').addEventListener('change', e => { S.trade.sym = e.target.value; $('#trade-qty').value = ''; updateTrade(); });
  $('#trade-qty').addEventListener('input', updateTrade);
  $('#trade-qty').addEventListener('keydown', e => { if (e.key === 'Enter') submitTrade(); });
  $('#conv-amount').addEventListener('input', updateConverter);
  ['from', 'to'].forEach(k => $('#conv-' + k).addEventListener('change', e => { S.conv[k] = e.target.value; updateConverter(); }));
  $('#conv-swap').addEventListener('click', () => {
    [S.conv.from, S.conv.to] = [S.conv.to, S.conv.from];
    $('#conv-from').value = S.conv.from; $('#conv-to').value = S.conv.to;
    updateConverter();
  });
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (NAV.some(n => n.id === h) && h !== S.section) go(h); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.last > CFG.REFRESH) refreshAll(); });
}

/* ---------- 12. INICIO ---------- */
function init() {
  $$('[data-logo]').forEach(el => { el.innerHTML = LOGO; });
  renderNav();
  $('#trade-coin').innerHTML = COINS.map(c => `<option value="${c.symbol}">${c.name} (${c.symbol})</option>`).join('');
  $('#conv-from').innerHTML = $('#conv-to').innerHTML = ASSETS.map(s => `<option value="${s}">${s}</option>`).join('');
  $('#conv-from').value = S.conv.from; $('#conv-to').value = S.conv.to;
  wireInputs();
  renderAll();                                         // primero los estados de "Cargando…"
  const h = location.hash.slice(1);
  go(NAV.some(n => n.id === h) ? h : 'dashboard');
  setTimeout(() => {                                   // pantalla de bienvenida
    $('#splash').classList.add('hide'); $('#app').classList.add('ready');
    setTimeout(() => $('#splash').remove(), 800);
  }, 2600);
  refreshAll();
  setInterval(() => { if (!document.hidden) refreshAll(); }, CFG.REFRESH);
}
document.addEventListener('DOMContentLoaded', init);
