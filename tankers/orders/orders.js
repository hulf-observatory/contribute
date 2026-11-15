// Water tanker orders: summary cards, wards shaded by orders, dots for orders whose senders allowed a spot,
// ward table and the latest orders with feedback. Data: contribute-api /tankers/reports.json.
const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const esc = Contribute.esc;
const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const WAIT = { same_day: 0, next_day: 1, '2_days': 2, '3_days': 3 };
const WAIT_TXT = ['same day', 'next day', '2 days', '3+ days'];
const MIN_PRICES = 3;                 // a ward shows a typical price only from 3 orders

const [areas, data] = await Promise.all([fetch(C.AREAS_URL).then(r => r.json()).catch(() => ({ wards: [] })),
  fetch(`${C.API}/tankers/reports.json`, { credentials: 'omit' }).then(r => r.json()).catch(() => null)]);
if (!data) { $('loadmsg').hidden = false; $('loadmsg').textContent = "The orders couldn't load just now. Please try again later."; }
const wards = areas.wards || [];
const orders = (data ? data.features : []).map(f => {
  const p = f.properties;
  return { id: p.id, ward: p.ward, point: f.geometry ? f.geometry.coordinates : null, detail: p.place_detail, place: p.place, src: p.supplier,
    size: p.size_l === 'dk' ? null : +p.size_l, price: p.price, paid: p.paid, came: p.came, at: Date.parse(p.observed_at) };
}).sort((a, b) => b.at - a.at);
const now = Date.now();

let period = 30, src = 'all';
const PERIODS = [[30, 'Last 30 days'], [90, 'Last 3 months'], [0, 'All']];
const SRCS = [['all', 'All suppliers'], ['private', 'Private'], ['hmwssb', 'HMWSSB'], ['society', 'Society']];
const chips = (el, list, curv, set) => { el.innerHTML = list.map(([v, l]) => `<button type="button" class="chip" aria-pressed="${v === curv}" data-v="${v}">${l}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; set(isNaN(+b.dataset.v) ? b.dataset.v : +b.dataset.v); }; };
const inPeriod = (o) => !period || o.at >= now - period * 86400000;
const sel = () => orders.filter(o => inPeriod(o) && (src === 'all' || o.src === src));
const srcName = (s) => ({ hmwssb: 'HMWSSB', private: 'private', society: 'society', other: 'other' })[s] || s;

function draw() {
  chips($('period'), PERIODS, period, (v) => { period = v; draw(); });
  chips($('src'), SRCS, src, (v) => { src = v; draw(); });
  const os = sel(), priv = orders.filter(o => inPeriod(o) && o.src === 'private' && o.price > 0);
  const bySize = (s) => { const p = priv.filter(o => o.size === s).map(o => o.price); return p.length >= MIN_PRICES ? median(p) : null; };
  const hm = os.filter(o => o.src === 'hmwssb'), hmWait = median(hm.filter(o => o.came in WAIT).map(o => WAIT[o.came]));
  const never = hm.length ? hm.filter(o => o.came === 'never').length / hm.length : null;
  $('cards').innerHTML = `
    <div class="card"><p class="eyebrow">Orders</p><b>${os.length.toLocaleString('en-IN')}</b><span>in ${new Set(os.map(o => o.ward).filter(Boolean)).size} wards</span></div>
    <div class="card"><p class="eyebrow">Typical private price</p><ul class="rows"><li>5,000 L <b>${bySize(5000) ? inr(bySize(5000)) : '–'}</b></li><li>10,000 L <b>${bySize(10000) ? inr(bySize(10000)) : '–'}</b></li><li>20,000 L+ <b>${bySize(20000) ? inr(bySize(20000)) : '–'}</b></li></ul><span>shown from ${MIN_PRICES} orders of a size</span></div>
    <div class="card"><p class="eyebrow">HMWSSB tankers came</p><b>${hmWait == null ? '–' : WAIT_TXT[Math.round(hmWait)]}</b><span>${hm.length ? `typical wait · ${Math.round(never * 100)}% never came` : 'no HMWSSB orders in this period'}</span></div>`;
  const per = new Map();
  for (const o of os) { if (!o.ward) continue; if (!per.has(o.ward)) per.set(o.ward, []); per.get(o.ward).push(o); }
  const rows = [...per].map(([w, l]) => { const p5 = l.filter(o => o.src === 'private' && o.size === 5000 && o.price > 0).map(o => o.price);
    return { w, n: l.length, p5: p5.length >= MIN_PRICES ? median(p5) : null, wt: median(l.filter(o => o.came in WAIT).map(o => WAIT[o.came])) }; }).sort((a, b) => b.n - a.n);
  $('wards').innerHTML = rows.slice(0, 30).map(r => `<tr data-w="${esc(r.w)}"><td>${esc(r.w)}</td><td class="n">${r.n}</td><td class="n">${r.p5 ? inr(r.p5) : '–'}</td><td class="n">${r.wt == null ? '–' : WAIT_TXT[Math.round(r.wt)]}</td></tr>`).join('')
    || '<tr><td colspan="4" class="empty">No orders in this period yet.</td></tr>';
  $('orders').innerHTML = os.slice(0, 20).map(o => `<div class="order"><b>${o.size ? o.size.toLocaleString('en-IN') + ' L' : 'Size not known'} · ${o.paid === 'free' || o.price === 0 ? 'free' : o.paid === 'dk' ? 'price not known' : o.price ? inr(o.price) : 'price not known'} · ${srcName(o.src)}</b>
    <span>${esc(o.ward || 'outside the corporation wards')}${o.detail === 'area' && o.place && o.place !== o.ward ? ' (' + esc(o.place) + ')' : ''} · ordered ${new Date(o.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · came ${o.came === 'never' ? 'never' : o.came === 'not_yet' ? 'not yet' : WAIT_TXT[WAIT[o.came]]}</span>
    <button type="button" class="fb" data-id="${esc(o.id)}">Give feedback</button></div>`).join('')
    || '<p class="empty">No orders yet. <a href="../">Be the first to tell us about a tanker</a>.</p>';
  drawMap(os, per);
}

// ── map ──
const STEPS = [['#E4EDF6', 1], ['#B7CDE4', 3], ['#7FA6CE', 6], ['#3F76B0', 10], ['#123F70', 15]];
$('legend').innerHTML = 'Orders per ward: ' + STEPS.map(([c, n], i) => `<span><i style="background:${c}"></i>${n}${i === STEPS.length - 1 ? '+' : (STEPS[i + 1][1] - 1 > n ? '–' + (STEPS[i + 1][1] - 1) : '')}</span>`).join('') + ' <span><i class="dot" style="background:#111827"></i>an order</span>';
const ringsToGeo = (poly) => ({ type: 'Polygon', coordinates: poly.map(r => { const c = []; for (let i = 0; i < r.length; i += 2) c.push([r[i], r[i + 1]]); return c; }) });
const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.44, 17.41], zoom: 10.3, minZoom: 9, maxZoom: 17,
  maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true }, cooperativeGestures: matchMedia('(max-width: 767px)').matches });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
let ready = false, lastPer = new Map(), lastOs = [];
map.on('load', () => {
  map.addSource('wards', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'wards', type: 'fill', source: 'wards', paint: { 'fill-color': ['step', ['get', 'n'], 'rgba(0,0,0,0)', 1, STEPS[0][0], 3, STEPS[1][0], 6, STEPS[2][0], 10, STEPS[3][0], 15, STEPS[4][0]], 'fill-opacity': .7 } });
  map.addLayer({ id: 'ward-lines', type: 'line', source: 'wards', paint: { 'line-color': '#9CA3AF', 'line-width': .4 } });
  map.addSource('orders', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({ id: 'orders', type: 'circle', source: 'orders', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2.5, 15, 6], 'circle-color': '#111827', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } });
  map.on('click', 'wards', (e) => wardPopup(e.features[0].properties.name, e.lngLat));
  map.on('mouseenter', 'wards', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'wards', () => { map.getCanvas().style.cursor = ''; });
  document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
  ready = true; drawMap(lastOs, lastPer);
});
function drawMap(os, per) {
  lastPer = per; lastOs = os; if (!ready) return;
  map.getSource('wards').setData({ type: 'FeatureCollection', features: wards.map(w => ({ type: 'Feature', properties: { name: w.name, n: (per.get(w.name) || []).length }, geometry: ringsToGeo(w.poly || []) })) });
  map.getSource('orders').setData({ type: 'FeatureCollection', features: os.filter(o => o.point).map(o => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: o.point } })) });
}
let pop = null;
function wardPopup(name, at) {
  const l = lastPer.get(name) || [];
  const row = (s) => { const p = l.filter(o => o.src === 'private' && o.size === s && o.price > 0).map(o => o.price); return p.length >= MIN_PRICES ? inr(median(p)) : p.length ? `${p.length} order${p.length > 1 ? 's' : ''}` : '–'; };
  if (pop) pop.remove();
  pop = new maplibregl.Popup({ offset: 6 }).setLngLat(at).setHTML(`<div class="pop"><b>${esc(name)}</b><span class="ctx">${l.length} order${l.length === 1 ? '' : 's'} in this period</span>
    <table><tr><td>Private 5,000 L</td><td>${row(5000)}</td></tr><tr><td>Private 10,000 L</td><td>${row(10000)}</td></tr><tr><td>HMWSSB orders</td><td>${l.filter(o => o.src === 'hmwssb').length}</td></tr></table></div>`).addTo(map);
}
$('wards').addEventListener('click', (e) => { const tr = e.target.closest('tr[data-w]'); if (!tr) return; const w = wards.find(x => x.name === tr.dataset.w); if (!w) return;
  map.fitBounds(w.bounds, { padding: 40 }); wardPopup(w.name, [(w.bounds[0] + w.bounds[2]) / 2, (w.bounds[1] + w.bounds[3]) / 2]); $('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); });

// ── feedback on an order (wrong / spam), counted once per phone ──
let kind = null, target = null;
const dlg = $('dlg'), check = Contribute.spamCheck($('ts-fb'));
$('orders').addEventListener('click', (e) => {
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
