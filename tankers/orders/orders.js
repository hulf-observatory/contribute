// Water tanker orders: a map (wards shaded by orders, dots for orders whose senders allowed a spot, summary cards and
// the ward table) or a list, newest first (Teja, 17 Nov 2026, as in the bus-stops results; #list opens the list).
// "Don't know" answers are not answers: left out of medians and shares. Data: contribute-api /tankers/reports.json.
const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const esc = Contribute.esc;
const fmt = (n) => n.toLocaleString('en-IN');
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const WAIT = { same_day: 0, next_day: 1, '2_days': 2, '3_days': 3 };
const WAIT_TXT = ['same day', 'next day', '2 days', '3+ days'];
const CAME_TXT = { same_day: 'came the same day', next_day: 'came the next day', '2_days': 'came after 2 days', '3_days': 'came after 3+ days',
  not_yet: 'not come yet', never: 'never came', dk: 'arrival not known' };
const MIN_PRICES = 3;                 // a ward shows a typical price only from 3 orders
const ARR = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const DOT = '#111827', WARD_DOT = '#7FA6CE';

const [areas, data] = await Promise.all([fetch(C.AREAS_URL).then(r => r.json()).catch(() => ({ wards: [] })),
  fetch(`${C.API}/tankers/reports.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).catch(() => null)]);
if (!data) { $('loadmsg').hidden = false; $('loadmsg').textContent = "The orders couldn't load just now. Please try again later."; }
const wards = areas.wards || [];
const orders = (data ? data.features : []).map(f => {
  const p = f.properties;
  return { id: p.id, ward: p.ward, point: f.geometry ? f.geometry.coordinates : null, detail: p.place_detail, place: p.place, src: p.supplier,
    size: p.size_l === 'dk' ? null : +p.size_l, price: p.price, paid: p.paid, extra: p.extra, came: p.came, at: Date.parse(p.observed_at) };
}).sort((a, b) => b.at - a.at);
const now = Date.now();

let period = 30, src = 'all';
const PERIODS = [[30, 'Last 30 days'], [90, 'Last 3 months'], [0, 'All']];
const SRCS = [['all', 'All suppliers'], ['private', 'Private'], ['hmwssb', 'HMWSSB'], ['society', 'Society']];
const chips = (el, list, curv, set) => { el.innerHTML = list.map(([v, l]) => `<button type="button" class="chip" aria-pressed="${v === curv}" data-v="${v}">${l}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; set(isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v); }; };
const inPeriod = (o) => !period || o.at >= now - period * 86400000;
const sel = () => orders.filter(o => inPeriod(o) && (src === 'all' || o.src === src));
const srcName = (s) => ({ hmwssb: 'HMWSSB', private: 'private', society: 'society', other: 'other' })[s] || 'supplier not known';
const priceTxt = (o) => o.paid === 'free' || o.price === 0 ? 'free' : o.price ? inr(o.price) : 'price not known';
const placeName = (o) => o.detail === 'area' && o.place && o.place !== o.ward ? o.place : o.ward || 'Outside the corporation wards';
const day = (t) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

let os = [], per = new Map();
function draw() {
  chips($('period'), PERIODS, period, (v) => { period = v; shownN = 30; draw(); });
  chips($('src'), SRCS, src, (v) => { src = v; shownN = 30; draw(); });
  os = sel();
  const priv = orders.filter(o => inPeriod(o) && o.src === 'private' && o.price > 0);
  const bySize = (s) => { const p = priv.filter(o => o.size === s).map(o => o.price); return p.length >= MIN_PRICES ? median(p) : null; };
  const hm = os.filter(o => o.src === 'hmwssb' && o.came !== 'dk'), hmWait = median(hm.filter(o => o.came in WAIT).map(o => WAIT[o.came]));
  const never = hm.length ? hm.filter(o => o.came === 'never').length / hm.length : null;
  per = new Map();
  for (const o of os) { if (!o.ward) continue; if (!per.has(o.ward)) per.set(o.ward, []); per.get(o.ward).push(o); }
  $('counts').innerHTML = [`${fmt(os.length)} order${os.length === 1 ? '' : 's'} in ${fmt(per.size)} ward${per.size === 1 ? '' : 's'}`,
    '<a href="../">Tell us about yours</a>', '<a href="../download/">Download</a>'].join(' · ');
  $('cards').innerHTML = `
    <div class="card"><p class="eyebrow">Typical private price</p><ul class="rows-s"><li>5,000 L <b>${bySize(5000) ? inr(bySize(5000)) : '–'}</b></li><li>10,000 L <b>${bySize(10000) ? inr(bySize(10000)) : '–'}</b></li><li>20,000 L+ <b>${bySize(20000) ? inr(bySize(20000)) : '–'}</b></li></ul><span>shown from ${MIN_PRICES} orders of a size</span></div>
    <div class="card"><p class="eyebrow">HMWSSB tankers came</p><b>${hmWait == null ? '–' : WAIT_TXT[Math.round(hmWait)]}</b><span>${hm.length ? `typical wait · ${Math.round(never * 100)}% never came` : 'no HMWSSB orders in this period'}</span></div>`;
  const rows = [...per].map(([w, l]) => { const p5 = l.filter(o => o.src === 'private' && o.size === 5000 && o.price > 0).map(o => o.price);
    return { w, n: l.length, p5: p5.length >= MIN_PRICES ? median(p5) : null, wt: median(l.filter(o => o.came in WAIT).map(o => WAIT[o.came])) }; }).sort((a, b) => b.n - a.n);
  $('wards').innerHTML = rows.slice(0, 30).map(r => `<tr data-w="${esc(r.w)}"><td>${esc(r.w)}</td><td class="n">${r.n}</td><td class="n">${r.p5 ? inr(r.p5) : '–'}</td><td class="n">${r.wt == null ? '–' : WAIT_TXT[Math.round(r.wt)]}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No orders in this period yet.</td></tr>';
  drawList(); drawMap();
}

// ── the list: newest first; a tap shows the order on the map ──
let mode = 'map', shownN = 30;
function drawList() {
  if (mode !== 'list') return;
  $('rows').innerHTML = os.slice(0, shownN).map(o => `<li><button type="button" class="row" data-id="${esc(o.id)}"><i class="dot" style="background:${o.point ? DOT : WARD_DOT}"></i><span class="t">
    <b>${esc(placeName(o))}</b>
    <span class="m">${[`ordered ${day(o.at)}`, srcName(o.src).replace(/^./, c => c.toUpperCase()), o.point ? null : 'ward only'].filter(Boolean).join(' · ')}</span>
    <span class="f">${[o.size ? fmt(o.size) + ' L' : 'size not known', priceTxt(o), CAME_TXT[o.came]].filter(Boolean).join(' · ')}</span></span>${ARR}</button>
    <button type="button" class="fb" data-id="${esc(o.id)}">Give feedback</button></li>`).join('')
    || '<li class="empty">No orders in this period yet. <a href="../">Be the first to tell us about a tanker</a>.</li>';
  $('more').hidden = os.length <= shownN;
}
$('more').onclick = () => { shownN += 30; drawList(); };
$('rows').addEventListener('click', (e) => {
  const b = e.target.closest('.row'); if (!b) return;
  const o = orders.find(x => x.id === b.dataset.id); if (!o) return;
  setMode('map');
  if (o.point) { map.jumpTo({ center: o.point, zoom: 14 }); orderPopup(o); }
  else { const w = wards.find(x => x.name === o.ward); if (w) { map.fitBounds(w.bounds, { padding: 40, duration: 0 }); wardPopup(w.name, [(w.bounds[0] + w.bounds[2]) / 2, (w.bounds[1] + w.bounds[3]) / 2]); } }
  $('map').scrollIntoView({ block: 'center' });
});
function setMode(m) {
  mode = m;
  $('seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === m));
  $('v-map').hidden = m !== 'map'; $('v-list').hidden = m !== 'list';
  $('side').hidden = m !== 'map'; $('layout').classList.toggle('list', m === 'list');
  if (m === 'map') map.resize(); else drawList();
  history.replaceState(null, '', location.pathname + location.search + (m === 'list' ? '#list' : ''));
}
$('seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });

// ── map ──
const STEPS = [['#E4EDF6', 1], ['#B7CDE4', 3], ['#7FA6CE', 6], ['#3F76B0', 10], ['#123F70', 15]];
$('legend').innerHTML = 'Orders per ward: ' + STEPS.map(([c, n], i) => `<span><i style="background:${c}"></i>${n}${i === STEPS.length - 1 ? '+' : (STEPS[i + 1][1] - 1 > n ? '–' + (STEPS[i + 1][1] - 1) : '')}</span>`).join('') + ` <span><i class="dot" style="background:${DOT}"></i>an order</span>`;
const ringsToGeo = (poly) => ({ type: 'Polygon', coordinates: poly.map(r => { const c = []; for (let i = 0; i < r.length; i += 2) c.push([r[i], r[i + 1]]); return c; }) });
const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.44, 17.41], zoom: 10.3, minZoom: 9, maxZoom: 17,
  maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true }, cooperativeGestures: matchMedia('(max-width: 767px)').matches });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
let ready = false;
map.on('load', () => {
  map.addSource('wards', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'wards', type: 'fill', source: 'wards', paint: { 'fill-color': ['step', ['get', 'n'], 'rgba(0,0,0,0)', 1, STEPS[0][0], 3, STEPS[1][0], 6, STEPS[2][0], 10, STEPS[3][0], 15, STEPS[4][0]], 'fill-opacity': .7 } });
  map.addLayer({ id: 'ward-lines', type: 'line', source: 'wards', paint: { 'line-color': '#9CA3AF', 'line-width': .4 } });
  map.addSource('orders', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'orders', type: 'circle', source: 'orders', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 6], 'circle-color': DOT, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  map.on('click', 'wards', (e) => { if (map.queryRenderedFeatures(e.point, { layers: ['orders'] }).length) return; wardPopup(e.features[0].properties.name, e.lngLat); });
  map.on('click', 'orders', (e) => { const o = orders.find(x => x.id === e.features[0].properties.id); if (o) orderPopup(o); });
  for (const l of ['wards', 'orders']) {
    map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
  }
  document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
  ready = true; drawMap();
});
function drawMap() {
  if (!ready) return;
  map.getSource('wards').setData({ type: 'FeatureCollection', features: wards.map(w => ({ type: 'Feature', properties: { name: w.name, n: (per.get(w.name) || []).length }, geometry: ringsToGeo(w.poly || []) })) });
  map.getSource('orders').setData({ type: 'FeatureCollection', features: os.filter(o => o.point).map(o => ({ type: 'Feature', properties: { id: o.id }, geometry: { type: 'Point', coordinates: o.point } })) });
}
let pop = null;
function wardPopup(name, at) {
  const l = per.get(name) || [];
  const row = (s) => { const p = l.filter(o => o.src === 'private' && o.size === s && o.price > 0).map(o => o.price); return p.length >= MIN_PRICES ? inr(median(p)) : p.length ? `${p.length} order${p.length > 1 ? 's' : ''}` : '–'; };
  if (pop) pop.remove();
  pop = new maplibregl.Popup({ offset: 6 }).setLngLat(at).setHTML(`<div class="pop"><b>${esc(name)}</b><span class="ctx">${l.length} order${l.length === 1 ? '' : 's'} in this period</span>
    <table><tr><td>Private 5,000 L</td><td>${row(5000)}</td></tr><tr><td>Private 10,000 L</td><td>${row(10000)}</td></tr><tr><td>HMWSSB orders</td><td>${l.filter(o => o.src === 'hmwssb').length}</td></tr></table></div>`).addTo(map);
}
function orderPopup(o) {
  if (pop) pop.remove();
  pop = new maplibregl.Popup({ offset: 8 }).setLngLat(o.point).setHTML(`<div class="pop"><b>${o.size ? fmt(o.size) + ' L' : 'Size not known'} · ${esc(priceTxt(o))}</b>
    <span class="ctx">${esc(placeName(o))} · ordered ${day(o.at)}</span>
    <table><tr><td>Supplier</td><td>${esc(srcName(o.src))}</td></tr><tr><td>Came</td><td>${({ same_day: 'same day', next_day: 'next day', '2_days': 'after 2 days', '3_days': 'after 3+ days', not_yet: 'not yet', never: 'never', dk: 'not known' })[o.came] || '–'}</td></tr>${o.extra ? `<tr><td>Extra to the driver</td><td>${inr(o.extra)}</td></tr>` : ''}</table></div>`).addTo(map);
}
$('wards').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-w]'); if (!tr) return; const w = wards.find(x => x.name === tr.dataset.w); if (!w) return;
  map.fitBounds(w.bounds, { padding: 40 }); wardPopup(w.name, [(w.bounds[0] + w.bounds[2]) / 2, (w.bounds[1] + w.bounds[3]) / 2]); $('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

// ── feedback on an order (wrong / spam), counted once per phone ──
let kind = null, target = null;
const dlg = $('dlg'), check = Contribute.spamCheck($('ts-fb'));
$('rows').addEventListener('click', (e) => {
  const b = e.target.closest('.fb'); if (!b) return;
  target = b.dataset.id; kind = null; $('fb-note').value = ''; $('fb-msg').hidden = true;
  $('fbopts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', false));
  $('fb-send').disabled = true; $('fb-send').textContent = 'Send'; dlg.showModal();
});
$('fbopts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k; $('fbopts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('fb-send').disabled = false; });
$('fb-cancel').onclick = () => dlg.close();
$('fb-send').onclick = async () => {
  $('fb-send').disabled = true; $('fb-send').textContent = 'Sending…'; $('fb-msg').hidden = true;
  try {
    const token = await check.token();
    if (token === null) throw Object.assign(new Error('The spam check did not finish. Please try again.'), { server: true });
    const r = await Contribute.post(`/tankers/reports/${target}/feedback`, { kind, note: $('fb-note').value.trim() || null, device: Contribute.device(), token, website: $('fb-trap').value });
    $('fb-msg').textContent = r.accepted ? 'Thank you. We look at every flag; three spam flags hide an order until we check.' : 'You already sent this from this phone. Thank you.';
    $('fb-msg').hidden = false; $('fb-send').textContent = 'Sent'; setTimeout(() => dlg.close(), 1800);
  } catch (err) {
    $('fb-msg').textContent = err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.' : err.server ? err.message : "That didn't go through; please try again.";
    $('fb-msg').hidden = false; $('fb-send').disabled = false; $('fb-send').textContent = 'Send';
  } finally { check.reset(); }
};

draw();
if (location.hash === '#list') setMode('list');
