// Tell us about a water tanker: where (phone, area search or map), how exactly to show it (exact / ~500 m / area /
// ward only), then the order. Only as much place as the person chose is sent; the server checks it again.
// For a home, an office or a whole building/colony (an RWA ordering); filled in from anywhere, but on a phone.
// One question per screen (Teja, 17 Nov 2026, as in the bus-stops survey): a tap on a one-answer question moves on;
// "Don't know" instead of Skip.
import { createPlaceSearch } from '../assets/place-search.js';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const esc = Contribute.esc;
const inHmda = (lng, lat) => lng >= C.HMDA[0] && lng <= C.HMDA[2] && lat >= C.HMDA[1] && lat <= C.HMDA[3];
Contribute.phoneOnly({ what: 'Water tankers', mapHref: 'orders/', mapLabel: 'See the tanker orders', atSpot: false });

// ── tanker sizes, as text (Teja, 15 Nov 2026: no pictures) ──
const SIZES = [
  { v: '5000', label: '5,000 litres', small: "HMWSSB's usual tanker" },
  { v: '10000', label: '10,000 litres' },
  { v: '20000', label: '20,000 litres or more' },
  { v: 'dk', label: "Don't know" },
];
$('sizes').innerHTML = SIZES.map(s => `<button type="button" class="answer" role="radio" aria-checked="false" data-val="${s.v}"><span>${s.label}${s.small ? `<small>${s.small}</small>` : ''}</span><i class="tick"></i></button>`).join('');

// ── wards from coordinates (worked out on the phone; with "ward only" nothing finer leaves it) ──
let AREAS = null; const LOCAL = [];
function inRing(x, y, r) { let i2 = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) i2 = !i2; } return i2; }
function wardAt(x, y) {
  if (!AREAS) return null;
  for (const w of AREAS.wards) { const b = w.bounds; if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
    if ((w.poly || []).reduce((a, r) => a !== inRing(x, y, r), false)) return { name: w.name, no: w.no, zone: (AREAS.zones[w.zone] || {}).name }; }
  return null;
}
const search = createPlaceSearch({ input: $('ps-input'), results: $('ps-results'), local: () => LOCAL, getMap: () => null,
  onSelect: (p) => { S.pick = p; S.loc = { lat: p.center[1], lng: p.center[0] };
    const w = p.kind.startsWith('Ward') && AREAS ? AREAS.wards.find(x => x.name === p.name) : null;
    S.ward = w ? { name: w.name, no: w.no, zone: (AREAS.zones[w.zone] || {}).name } : wardAt(p.center[0], p.center[1]);
    $('picked').hidden = false; $('picked-name').textContent = p.name; $('picked-ctx').textContent = [p.kind, p.context].filter(Boolean).join(' · '); updateNext(); } });
fetch(C.AREAS_URL).then(r => r.json()).then(a => {
  AREAS = a; const zones = a.zones || [];
  for (const w of a.wards || []) { const z = zones[w.zone]; LOCAL.push({ name: w.name, kind: 'Ward' + (w.no != null ? ' ' + w.no : ''), context: z ? z.name + ' zone' : '', bbox: w.bounds }); }
  search.refresh?.();
}).catch(() => {});
const wardText = (w) => w ? `${w.name} ward${w.zone ? ', ' + w.zone + ' zone' : ''}` : 'outside the corporation wards';
const round500 = (lat, lng) => ({ lat: +(Math.round(lat / .0045) * .0045).toFixed(4), lng: +(Math.round(lng / .0047) * .0047).toFixed(4) });

// ── state and steps ──
// paid: null (a price typed in) / 'free' / 'dk'; nw: tankers in a usual week, null = don't know
const S = { mode: null, loc: null, acc: null, ward: null, pick: null, prec: null, for: null, building: null, households: null,
  source: null, size: null, paid: null, came: null, season: null, why: [], nw: 1, g: {} };
let cur = 'start';
const PLACE = { gps: 'locate', search: 'place', map: 'map' };
function steps() {
  const l = ['start', 'mode'];
  if (PLACE[S.mode]) l.push(PLACE[S.mode]);
  l.push('precision', 'for', 'building', 'households', 'source', 'size', 'paid', 'extra', 'ordered', 'came', 'often', 'season', 'why', 'note', 'review', 'thanks');
  return l;
}
const num = (id) => { const v = $(id).value.replace(/[^0-9]/g, ''); return v ? +v : null; };
const today = () => { const n = new Date(), p = (x) => String(x).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; };
const future = () => $('odate').value > today();
const tooOld = () => !!$('odate').value && $('odate').value < $('odate').min;
const priceTooMuch = () => (num('price') || 0) > 100000, extraTooMuch = () => (num('extra') || 0) > 20000;
const paidKind = () => S.paid || 'paid';
function ready(s) {
  return ({ place: !!S.pick, map: !!S.loc, precision: !!S.prec, for: !!S.for, building: !!S.building, households: !!S.households,
    source: !!S.source, size: !!S.size, came: !!S.came, season: !!S.season,
    paid: !!S.paid || (num('price') > 0 && !priceTooMuch()), extra: !extraTooMuch(),
    ordered: !!$('odate').value && !future() && !tooOld() && !!S.g.tod, review: !sending })[s] ?? true;
}
// screens where a tap moves on have no Next button
const TAP_ON = ['mode', 'locate', 'precision', 'for', 'building', 'households', 'source', 'size', 'came', 'season'];
var DONE = false, lastList = [];                 // DONE: sent, so Back can't offer Send again
function show(s, push = true) {
  if (DONE && s !== 'thanks') s = 'thanks';
  cur = s; lastList = steps();
  document.querySelectorAll('.step').forEach(x => x.classList.toggle('on', x.dataset.step === s));
  const inQ = s !== 'start' && s !== 'thanks';
  document.body.classList.toggle('q-mode', inQ);
  const qs = steps().filter(x => x !== 'start' && x !== 'thanks' && x !== 'review'), i = qs.indexOf(s);
  if (!S.mode) qs.push('place-to-come');         // the count stays the same once the way of giving the place is chosen
  $('progress').hidden = !inQ; $('nav').hidden = !inQ;
  $('bar').style.width = s === 'review' ? '100%' : `${i < 0 ? 0 : (i + 1) / (qs.length + 1) * 100}%`;
  $('count').textContent = s === 'review' ? 'Last step' : i < 0 ? '' : `${i + 1} of ${qs.length}`;
  if (s === 'precision') drawPrecision();
  if (s === 'map') openMap();
  if (s === 'paid') drawPaid();
  if (s === 'often') drawOften();
  if (s === 'review') drawReview();
  updateNext();
  if (push) history.pushState({ s }, '', '#' + s);
  window.scrollTo({ top: 0 });
  const h = document.querySelector(`.step[data-step="${s}"] .qt, .step[data-step="${s}"] h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function updateNext() {
  const n = $('next'); n.disabled = !ready(cur);
  n.hidden = TAP_ON.includes(cur);
  if (cur === 'review' && sending) return;
  n.textContent = cur === 'review' ? 'Send' : (cur === 'extra' && !num('extra')) || (cur === 'note' && !$('note').value.trim()) ? 'Skip' : 'Next';
}
function go(d) {
  const l = steps(), i = l.indexOf(cur);
  if (i < 0) {                                   // this screen dropped out of the route: carry on from where it was
    let j = lastList.indexOf(cur) + d;
    while (j > 0 && j < lastList.length && !l.includes(lastList[j])) j += d;
    return show(l.includes(lastList[j]) ? lastList[j] : l[0]);
  }
  show(l[Math.max(0, i + d)]);
}
// after an answer: the next screen, or back to the check screen when the person came from there to change one
// (a new place goes on to "how exactly" first)
const PLACE_STEPS = ['mode', 'locate', 'place', 'map'];
function next() { if (S.fromReview && !PLACE_STEPS.includes(cur)) { S.fromReview = false; return show('review'); } go(1); }
$('next').onclick = () => { if (cur === 'review') return send(); next(); };
$('start-go').onclick = () => show('mode');
$('exit').onclick = () => { S.fromReview = false; show('start'); };
$('back').onclick = () => history.back();
window.addEventListener('popstate', (e) => show(e.state?.s || 'start', false));
history.replaceState({ s: 'start' }, '', location.pathname + location.search);

// one-answer questions: a tap chooses and moves on (tapping the chosen one again also moves on)
let moving = false;
const after = (fn) => { moving = true; setTimeout(() => { moving = false; fn(); }, 220); };
document.querySelectorAll('[data-field]').forEach(g => g.addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b || b.disabled || moving) return;
  g.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  const f = g.dataset.field, v = b.dataset.val;
  if (f === 'mode') { if (S.mode !== v) { S.mode = v; resetPlace(); } }
  else S[f] = v;
  updateNext(); after(next);
}));
document.querySelectorAll('[data-g]').forEach(g => g.addEventListener('click', (e) => {
  const b = e.target.closest('.opt'); if (!b) return;
  g.querySelectorAll('.opt').forEach(x => x.setAttribute('aria-checked', x === b));
  S.g[g.dataset.g] = b.dataset.v; updateNext();
}));
$('why').addEventListener('click', (e) => {
  const b = e.target.closest('[role=checkbox]'); if (!b) return;
  b.setAttribute('aria-checked', b.getAttribute('aria-checked') !== 'true');
  S.why = [...$('why').querySelectorAll('[aria-checked="true"]')].map(x => x.dataset.val); updateNext();
});

// ── location ──
$('gps-go').onclick = () => {
  if (!('geolocation' in navigator)) return gpsFailed('This browser cannot share a location.');
  $('gps-go').textContent = 'Waiting for your phone…'; $('gps-go').disabled = true; $('gps-msg').hidden = true;
  navigator.geolocation.getCurrentPosition(onFix, (err) => gpsFailed(err.code === 1
    ? "Your phone didn't share its location. Allow it in your browser's settings, or search for the area instead."
    : "We couldn't get your location. Try again, or search for the area instead."), { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
};
function gpsFailed(t) { $('gps-go').textContent = 'Try again'; $('gps-go').disabled = false; $('gps-msg').textContent = t; $('gps-msg').hidden = false; }
function onFix(p) {
  const { latitude: lat, longitude: lng, accuracy } = p.coords;
  $('gps-go').textContent = 'Share my location'; $('gps-go').disabled = false;
  if (!inHmda(lng, lat)) return gpsFailed('Your phone places you outside the Hyderabad area (HMDA). Search for the area instead.');
  S.loc = { lat, lng }; S.acc = accuracy; S.ward = wardAt(lng, lat); next();
}
// a new way of giving the place: nothing of the old one stays on screen
function resetPlace() {
  S.loc = null; S.pick = null; S.prec = null; S.ward = null; S.acc = null;
  if (pin) { pin.remove(); pin = null; }
  $('picked').hidden = true; $('pin-info').hidden = true; $('pin-msg').hidden = true; $('map-hint').classList.remove('off'); $('gps-msg').hidden = true;
  try { search.clear(); } catch { /* ignore */ }
}
const setMode = (m) => { S.mode = m; resetPlace(); document.querySelectorAll('[data-field="mode"] [role=radio]').forEach(x => x.setAttribute('aria-checked', x.dataset.val === m)); show(PLACE[m]); };
$('gps-search').onclick = () => setMode('search');
$('to-map').onclick = (e) => { e.preventDefault(); setMode('map'); };

let map = null, pin = null;
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((ok, fail) => { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; js.onload = ok; js.onerror = fail; document.head.append(js); });
}
async function openMap() {
  try { await loadMapLib(); } catch { $('pin-msg').textContent = "The map couldn't load. Go back and search for the area instead."; $('pin-msg').hidden = false; return; }
  if (map) { map.resize(); return; }
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.475, 17.405], zoom: 11, minZoom: 9, maxZoom: 18, maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show'));
  map.on('click', (e) => placePin(e.lngLat.lng, e.lngLat.lat));
}
function placePin(lng, lat) {
  if (!inHmda(lng, lat)) { $('pin-msg').textContent = 'That spot is outside the Hyderabad area (HMDA).'; $('pin-msg').hidden = false; return; }
  $('pin-msg').hidden = true;
  if (!pin) { const el = document.createElement('div'); el.className = 'pin'; pin = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(map);
    pin.on('dragend', () => { const q = pin.getLngLat(); placePin(q.lng, q.lat); }); } else pin.setLngLat([lng, lat]);
  S.loc = { lat, lng }; S.acc = null; S.ward = wardAt(lng, lat); $('map-hint').classList.add('off');
  $('pin-info').hidden = false; $('pin-info').textContent = 'In ' + wardText(S.ward); updateNext();
}

// ── precision: the person chooses; at least the ward is kept ──
// a building, shop or street address found by search is never shown as "the area" (it would be an exact spot)
const AREA_KINDS = ['Locality', 'Area', 'Village', 'Town', 'City'];
const areaOk = (p) => !!p && (p.source === 'local' || AREA_KINDS.includes(p.kind));
function drawPrecision() {
  const w = S.ward, opts = [];
  if (S.mode === 'search') {
    if (areaOk(S.pick)) opts.push(['area', 'The area I searched', S.pick ? S.pick.name : '']);
    else opts.push(['500m', 'Nearby, about 500 m', `Around ${S.pick ? S.pick.name : 'the place'}`]);
  }
  else { opts.push(['exact', 'The exact spot', S.mode === 'gps' ? `From your phone, to about ${Math.round(S.acc || 0)} m` : 'Where you put the pin']);
    opts.push(['500m', 'Nearby, about 500 m', 'Moved to a point about 500 m away at most']); }
  opts.push(['ward', 'Only the ward', w ? wardText(w) : 'Not possible: this place is outside the corporation wards', !w]);
  if (S.prec && !opts.some(o => o[0] === S.prec && !o[3])) S.prec = null;
  $('prec').innerHTML = opts.map(([v, l, s, dis]) => `<button type="button" class="answer" role="radio" aria-checked="${S.prec === v}" data-val="${v}"${dis ? ' disabled' : ''}><span>${esc(l)}<small>${esc(s)}</small></span><i class="tick"></i></button>`).join('');
}
$('prec').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b || b.disabled || moving) return;
  $('prec').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  S.prec = b.dataset.val; updateNext(); after(next);
});

// ── paid: a price and Next, or "free" / "don't know" (a tap moves on); extra to the driver on its own screen ──
function drawPaid() { $('paid-opts').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x.dataset.val === S.paid)); }
$('price').addEventListener('input', () => {
  $('price').value = $('price').value.replace(/[^0-9]/g, '');
  if ($('price').value) { S.paid = null; drawPaid(); }
  $('paid-msg').hidden = !priceTooMuch(); updateNext();
});
$('paid-opts').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b || moving) return;
  S.paid = b.dataset.val; $('price').value = ''; $('paid-msg').hidden = true; drawPaid(); updateNext(); after(next);
});
$('extra').addEventListener('input', () => { $('extra').value = $('extra').value.replace(/[^0-9]/g, ''); $('extra-msg').hidden = !extraTooMuch(); updateNext(); });

// ── ordered, often ──
$('odate').value = $('odate').max = today();
$('odate').min = (() => { const d = new Date(); d.setDate(d.getDate() - 365); return d.toISOString().slice(0, 10); })();
$('odate').addEventListener('input', () => {
  $('odate-msg').textContent = future() ? 'That date is in the future.' : 'Please pick a date within the last year.';
  $('odate-msg').hidden = !future() && !tooOld(); updateNext();
});
function drawOften() {
  $('countw').textContent = S.nw == null ? '–' : S.nw >= 30 ? '30+' : S.nw;
  $('stepper').classList.toggle('off', S.nw == null);
  $('often-opts').querySelector('[role=radio]').setAttribute('aria-checked', S.nw == null);
}
const setN = (d) => { S.nw = S.nw == null ? 1 : Math.max(0, Math.min(30, S.nw + d)); drawOften(); };
$('minus').onclick = () => setN(-1); $('plus').onclick = () => setN(1);
$('often-opts').addEventListener('click', (e) => { if (!e.target.closest('[role=radio]') || moving) return; S.nw = null; drawOften(); after(next); });
$('note').addEventListener('input', updateNext);

// ── review: a short summary; every answer opens only if asked ──
const DK = "Don't know";
const lab = (sel, v) => v === 'dk' ? DK : document.querySelector(`${sel} [data-v="${v}"] , ${sel} [data-val="${v}"]`)?.querySelector('span')?.firstChild?.textContent.trim() || '';
function placeText() {
  const w = S.ward ? wardText(S.ward) : 'Outside the corporation wards';
  return S.prec === 'ward' ? `${esc(w)}<small>Shown as the ward only</small>` : S.prec === '500m' ? `${esc(w)}<small>Shown about 500 m from the spot</small>`
    : S.prec === 'area' ? `${esc(S.pick.name)}<small>${esc(w)} · shown as the area you searched</small>` : `${esc(w)}<small>Shown at the exact spot</small>`;
}
const priceText = () => paidKind() === 'free' ? 'Free' : paidKind() === 'dk' ? 'Price not known' : `₹${(num('price') || 0).toLocaleString('en-IN')}`;
const sizeText = () => S.size === 'dk' ? 'Size not known' : (SIZES.find(x => x.v === S.size) || {}).label || '';
const weekText = () => S.nw == null ? DK : S.nw === 0 ? 'Less than one' : `${S.nw >= 30 ? '30+' : S.nw} tanker${S.nw > 1 ? 's' : ''}`;
const dateText = () => new Date($('odate').value + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
let lastRows = [];
function drawReview() {
  // every answer, in order; tap one to change it and come back here
  const all = [['For', lab('[data-field=for]', S.for), 'for'], ['Building', lab('[data-field=building]', S.building), 'building'],
    ['Sharing the tank', lab('[data-field=households]', S.households), 'households'], ['Supplier', lab('[data-field=source]', S.source), 'source'],
    ['Size', S.size === 'dk' ? DK : sizeText(), 'size'], ['Paid', paidKind() === 'dk' ? DK : priceText(), 'paid'],
    ['Extra to the driver', num('extra') ? `₹${num('extra').toLocaleString('en-IN')}` : 'None', 'extra'],
    ['Ordered', `${dateText()}, ${S.g.tod || ''}`, 'ordered'], ['Came', lab('[data-field=came]', S.came), 'came'],
    ['Usual week', weekText(), 'often'], ['Usually needed', lab('[data-field=season]', S.season), 'season'],
    ['Why', S.why.map(v => lab('#why', v)).join(', ') || 'None ticked', 'why'], ['Note', $('note').value.trim() || 'None', 'note']];
  lastRows = [['Where', placeText().replace(/<small>/g, ' · ').replace(/<[^>]+>/g, '')], ...all.map(([k, v]) => [k, v])];
  const came = { same_day: 'came the same day', next_day: 'came the next day', '2_days': 'came after 2 days', '3_days': 'came after 3+ days',
    not_yet: 'not come yet', never: 'never came' }[S.came];
  const short = [['Where', placeText(), 'mode'],
    ['Tanker', `${esc(sizeText())} · ${esc(priceText())}<small>${esc(S.source === 'dk' ? 'Supplier not known' : lab('[data-field=source]', S.source))} · ordered ${esc(dateText())}${came ? ' · ' + came : ''}</small>`, 'all'],
    ...($('note').value.trim() ? [['Note', esc($('note').value.trim()), 'note']] : [])];
  $('review').innerHTML = short.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd><button type="button" data-go="${s}">${s === 'all' ? 'See all' : 'Change'}</button></div>`).join('');
  $('review').querySelectorAll('[data-go]').forEach(b => b.onclick = () => {
    if (b.dataset.go === 'all') { $('all-answers').hidden = !$('all-answers').hidden; return; }
    S.fromReview = true; show(b.dataset.go);
  });
  $('all-answers').innerHTML = all.map(([k, v, s]) => `<button type="button" data-s="${s}"><span>${esc(k)}</span><b>${esc(v)}</b></button>`).join('');
  $('all-answers').querySelectorAll('[data-s]').forEach(b => b.onclick = () => { S.fromReview = true; show(b.dataset.s); });
}

// ── send: only as much place as the person chose; answers kept on the phone until the server accepts them ──
function payload() {
  const b = { place_type: S.mode, place_detail: S.prec, for: S.for, building: S.building, households: S.households || null, supplier: S.source,
    size_l: S.size, paid: paidKind(), price: paidKind() === 'paid' ? num('price') : null, extra: num('extra'), ordered_on: $('odate').value, ordered_tod: S.g.tod,
    came: S.came, tankers_week: S.nw, season: S.season, why: S.why.length ? S.why : null, note: $('note').value.trim() || null };
  if (S.prec === 'exact') Object.assign(b, { lat: +S.loc.lat.toFixed(6), lng: +S.loc.lng.toFixed(6), accuracy_m: S.mode === 'gps' && S.acc != null ? Math.round(S.acc) : null });
  else if (S.prec === '500m') Object.assign(b, round500(S.loc.lat, S.loc.lng));
  else if (S.prec === 'area') Object.assign(b, { lat: +S.loc.lat.toFixed(5), lng: +S.loc.lng.toFixed(5), place: S.pick.name },
    S.ward ? { ward_name: S.ward.name, ward_no: S.ward.no ?? null } : {});   // a chosen ward is filed under that ward
  else Object.assign(b, { ward_name: S.ward.name, ward_no: S.ward.no ?? null });
  return b;
}
const DRAFT = 'obs-tanker-unsent';
const store = Contribute.drafts(DRAFT);          // several can wait; each is sent or discarded on its own
const spam = Contribute.spamCheck($('ts-review'));
async function post(body, sc = spam) {
  const token = await sc.token();
  if (token === null) { const e = new Error('spam check'); e.server = true; e.status = 403; throw e; }
  try { return await Contribute.post('/tankers/reports', { ...body, token, website: $('trap').value }); }
  finally { sc.reset(); }
}
let sending = false, kept = null;
async function send() {
  if (kept) store.drop(kept);                    // a retry replaces the copy kept by the failed try, so it can't be sent twice
  const body = payload(); kept = store.set({ body, rows: lastRows, at: Date.now() });
  sending = true; $('send-msg').hidden = true; updateNext(); $('next').textContent = 'Sending…';
  try { await post(body); store.drop(kept); sending = false; DONE = true; show('thanks'); }
  catch (err) {
    sending = false; updateNext(); $('next').textContent = 'Try again';
    const why = err.server && err.status === 400 ? `The server could not accept this (${err.message}). Please check your answers.`
      : err.server && err.status === 403 ? 'The spam check did not finish. Please press Try again.'
      : err.server && err.status === 429 ? 'Too many sends from this connection just now. Please wait a minute.'
      : "We couldn't send this; the signal may be weak.";
    $('send-msg').textContent = `${why} ${kept ? 'Your answers are saved on this phone, so nothing is lost.' : ''}`; $('send-msg').hidden = false;
  }
}
// entries that didn't go through: offer the oldest on the start screen, with its own spam check (it must be visible)
let draftSpam = null;
function showDraft() {
  const d = store.get(); $('draft').hidden = !d; if (!d) return;
  draftSpam = draftSpam || Contribute.spamCheck($('ts-draft'));
  $('draft-text').textContent = `You have a tanker order from ${new Date(d.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} that didn't send.`;
  $('draft-send').hidden = false; $('draft-send').disabled = false; $('draft-send').textContent = 'Send it now'; $('draft-drop').textContent = 'Discard it'; $('draft-msg').hidden = true;
  $('draft-send').onclick = async () => {
    $('draft-send').disabled = true; $('draft-send').textContent = 'Sending…'; $('draft-msg').hidden = true;
    try { await post(d.body, draftSpam); store.drop(d.id); $('draft').hidden = true; DONE = true; show('thanks'); }
    catch (err) {
      $('draft-send').disabled = false; $('draft-send').textContent = 'Try again';
      if (err.server && err.status === 400) {          // refused for good (too old, or no longer valid): don't offer it again
        store.drop(d.id); $('draft-send').hidden = true; $('draft-drop').textContent = 'OK';
        $('draft-msg').textContent = `The server could not accept it (${err.message}), so it has been removed from this phone. Please fill in the form again.`;
      } else $('draft-msg').textContent = err.server && err.status === 403 ? 'The spam check did not finish. Please press Try again.' : "Still couldn't send it. Your answers stay saved on this phone.";
      $('draft-msg').hidden = false;
    }
  };
  $('draft-drop').onclick = () => { store.drop(d.id); showDraft(); };
}
showDraft();
$('again').onclick = () => { location.href = location.pathname + location.search; };

fetch(`${C.API}/tankers/reports.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).then(d => {
  const n = d.features.length; if (n) $('meta').textContent = `So far: ${n.toLocaleString('en-IN')} order${n > 1 ? 's' : ''}`;
}).catch(() => {});
