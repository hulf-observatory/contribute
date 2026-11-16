// Tell us about a water tanker: where (phone, area search or map), how exactly to show it (exact / ~500 m / area /
// ward only), then the order. Only as much place as the person chose is sent; the server checks it again.
// For a home, an office or a whole building/colony (an RWA ordering); filled in from anywhere, but on a phone.
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
  AREAS = a; const corps = a.corporations || [], zones = a.zones || [];
  for (const w of a.wards || []) { const z = zones[w.zone]; LOCAL.push({ name: w.name, kind: 'Ward' + (w.no != null ? ' ' + w.no : ''), context: z ? z.name + ' zone' : '', bbox: w.bounds }); }
  search.refresh?.();
}).catch(() => {});
const wardText = (w) => w ? `${w.name} ward${w.zone ? ', ' + w.zone + ' zone' : ''}` : 'outside the corporation wards';
const round500 = (lat, lng) => ({ lat: +(Math.round(lat / .0045) * .0045).toFixed(4), lng: +(Math.round(lng / .0047) * .0047).toFixed(4) });

// ── state and steps ──
const S = { mode: null, loc: null, acc: null, ward: null, pick: null, prec: null, g: {}, source: null, size: null, came: null, season: null, why: [], nw: 1 };
let cur = 'start';
function steps() {
  const l = ['start'];
  if (S.mode === 'gps') l.push('locate'); else if (S.mode === 'search') l.push('place'); else if (S.mode === 'map') l.push('map');
  l.push('precision', 'who', 'source', 'size', 'paid', 'ordered', 'came', 'often', 'season', 'why', 'note', 'review', 'thanks');
  return l;
}
const num = (id) => { const v = $(id).value.replace(/[^0-9]/g, ''); return v ? +v : null; };
const today = () => { const n = new Date(), p = (x) => String(x).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; };
const future = () => $('odate').value > today();
const tooOld = () => !!$('odate').value && $('odate').value < $('odate').min;
const tooMuch = () => (num('price') || 0) > 100000 || (num('extra') || 0) > 20000;
function ready(s) {
  return ({ place: !!S.pick, map: !!S.loc, precision: !!S.prec, who: !!S.g.for && !!S.g.building, source: !!S.source, size: S.size != null,
    paid: ($('free').checked || $('pdk').checked || num('price') > 0) && !tooMuch(), ordered: !!$('odate').value && !future() && !tooOld() && !!S.g.tod, came: !!S.came, review: !sending })[s] ?? true;
}
var DONE = false, lastList = [];                 // DONE: sent, so Back can't offer Send again
function show(s, push = true) {
  if (DONE && s !== 'thanks') s = 'thanks';
  cur = s; lastList = steps();
  document.querySelectorAll('.step').forEach(x => x.classList.toggle('on', x.dataset.step === s));
  const qs = steps().filter(x => x !== 'start' && x !== 'thanks'), i = qs.indexOf(s);
  $('progress').hidden = i < 0;
  if (i >= 0) { $('bar').style.width = `${(i + 1) / qs.length * 100}%`; $('count').textContent = s === 'review' ? 'Last step' : `${i + 1} of ${qs.length - 1}`; }
  $('nav').hidden = s === 'start' || s === 'thanks';
  $('next').hidden = s === 'locate';
  if (s === 'precision') drawPrecision();
  if (s === 'map') openMap();
  if (s === 'review') drawReview();
  updateNext();
  if (push) history.pushState({ s }, '', '#' + s);
  window.scrollTo({ top: 0 });
  const h = document.querySelector(`.step[data-step="${s}"] .qt, .step[data-step="${s}"] h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function updateNext() {
  const n = $('next'); n.disabled = !ready(cur);
  if (cur === 'review' && sending) return;
  n.textContent = cur === 'review' ? 'Send' : (cur === 'why' && !S.why.length) || (cur === 'season' && !S.season) || (cur === 'note' && !$('note').value.trim()) ? 'Skip' : 'Next';
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
$('next').onclick = () => { if (cur === 'review') return send(); go(1); };
$('back').onclick = () => history.back();
window.addEventListener('popstate', (e) => show(e.state?.s || 'start', false));
history.replaceState({ s: 'start' }, '', location.pathname + location.search);

// single-choice answers move on by themselves
document.querySelectorAll('[data-field]').forEach(g => g.addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b || b.disabled) return;
  g.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  const f = g.dataset.field, v = b.dataset.val;
  if (f === 'mode') { S.mode = v; resetPlace(); }
  else S[f] = v;
  updateNext(); setTimeout(() => go(1), 220);
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
    ? "Your phone didn't share its location. You can allow it in your browser's settings, or search for the area instead."
    : "We couldn't get your location. Try again, or search for the area instead."), { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
};
function gpsFailed(t) { $('gps-go').textContent = 'Try again'; $('gps-go').disabled = false; $('gps-msg').textContent = t; $('gps-msg').hidden = false; }
function onFix(p) {
  const { latitude: lat, longitude: lng, accuracy } = p.coords;
  $('gps-go').textContent = 'Share my location'; $('gps-go').disabled = false;
  if (!inHmda(lng, lat)) return gpsFailed('Your phone places you outside the Hyderabad area (HMDA). Search for the area instead.');
  S.loc = { lat, lng }; S.acc = accuracy; S.ward = wardAt(lng, lat); go(1);
}
// a new way of giving the place: nothing of the old one stays on screen
function resetPlace() {
  S.loc = null; S.pick = null; S.prec = null; S.ward = null; S.acc = null;
  if (pin) { pin.remove(); pin = null; }
  $('picked').hidden = true; $('pin-info').hidden = true; $('pin-msg').hidden = true; $('map-hint').classList.remove('off');
  try { search.clear(); } catch { /* ignore */ }
}
$('gps-search').onclick = () => { S.mode = 'search'; resetPlace(); go(1); };
$('to-map').onclick = (e) => { e.preventDefault(); S.mode = 'map'; resetPlace(); show('map'); };

let map = null, pin = null;
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((ok, fail) => { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; js.onload = ok; js.onerror = fail; document.head.append(js); });
}
async function openMap() {
  try { await loadMapLib(); } catch { $('pin-msg').textContent = "The map couldn't load. Search for the area instead."; $('pin-msg').hidden = false; return; }
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
    else opts.push(['500m', 'Nearby, about 500 m', `Around ${S.pick ? S.pick.name : 'the place'}, moved to the nearest half-kilometre grid`]);
  }
  else { opts.push(['exact', 'The exact spot', S.mode === 'gps' ? `From your phone, accurate to about ${Math.round(S.acc || 0)} m` : 'Where you put the pin']);
    opts.push(['500m', 'Nearby, about 500 m', 'The point is moved to the nearest half-kilometre grid']); }
  opts.push(['ward', 'Only the ward', w ? wardText(w) : 'Not possible here: this place is outside the corporation wards', !w]);
  if (S.prec && !opts.some(o => o[0] === S.prec && !o[3])) S.prec = null;
  $('prec').innerHTML = opts.map(([v, l, s, dis]) => `<button type="button" class="answer" role="radio" aria-checked="${S.prec === v}" data-val="${v}"${dis ? ' disabled' : ''}><span>${esc(l)}<small>${esc(s)}</small></span><i class="tick"></i></button>`).join('');
}
$('prec').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b || b.disabled) return;
  $('prec').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  S.prec = b.dataset.val; updateNext(); setTimeout(() => go(1), 220);
});

// ── paid, ordered, often ──
['price', 'extra'].forEach(id => $(id).addEventListener('input', () => { $(id).value = $(id).value.replace(/[^0-9]/g, ''); $('paid-msg').hidden = !tooMuch(); updateNext(); }));
// "free" and "don't know" exclude each other and the price
['free', 'pdk'].forEach(id => $(id).addEventListener('change', () => {
  if ($(id).checked) $(id === 'free' ? 'pdk' : 'free').checked = false;
  const off = $('free').checked || $('pdk').checked;
  $('price').disabled = off; if (off) $('price').value = '';
  updateNext();
}));
const paidKind = () => $('free').checked ? 'free' : $('pdk').checked ? 'dk' : 'paid';
$('odate').value = $('odate').max = today();
$('odate').min = (() => { const d = new Date(); d.setDate(d.getDate() - 365); return d.toISOString().slice(0, 10); })();
$('odate').addEventListener('input', () => {
  $('odate-msg').textContent = future() ? "That date is in the future." : 'Please pick a date within the last year.';
  $('odate-msg').hidden = !future() && !tooOld(); updateNext();
});
const setN = (n) => { S.nw = Math.max(0, Math.min(30, n)); $('countw').textContent = S.nw >= 30 ? '30+' : S.nw; };
$('minus').onclick = () => setN(S.nw - 1); $('plus').onclick = () => setN(S.nw + 1);
$('note').addEventListener('input', updateNext);

// ── review ──
const lab = (sel, v) => document.querySelector(`${sel} [data-v="${v}"], ${sel} [data-val="${v}"]`)?.textContent.trim().replace(/\s+/g, ' ') || '';
function placeText() {
  const w = S.ward ? wardText(S.ward) : 'Outside the corporation wards';
  return S.prec === 'ward' ? `${esc(w)}<small>Shown as the ward only</small>` : S.prec === '500m' ? `${esc(w)}<small>Shown about 500 m from the spot</small>`
    : S.prec === 'area' ? `${esc(S.pick.name)}<small>${esc(w)} · shown as the area you searched</small>` : `${esc(w)}<small>Shown at the exact spot</small>`;
}
let lastRows = [];
function drawReview() {
  const sz = SIZES.find(x => x.v === S.size);
  const price = paidKind() === 'free' ? "Didn't pay (free)" : paidKind() === 'dk' ? "Don't know the price" : `₹${(num('price') || 0).toLocaleString('en-IN')}` + (num('extra') ? ` + ₹${num('extra').toLocaleString('en-IN')} to the driver` : '');
  const d = new Date($('odate').value + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  const rows = [['Where', placeText(), S.mode === 'gps' ? 'precision' : S.mode],
    ['For', esc(`${lab('[data-g=for]', S.g.for).replace(/RWA.*/, '')} · ${lab('[data-g=building]', S.g.building)}${S.g.households ? ' · ' + (S.g.households === '1' ? 'Not shared' : S.g.households === 'dk' ? 'Sharing not known' : 'Shared by ' + lab('[data-g=households]', S.g.households)) : ''}`), 'who'],
    ['From', esc(lab('[data-field=source]', S.source).split(/Booked/)[0]), 'source'], ['Size', esc(sz ? sz.label : ''), 'size'],
    ['Paid', esc(price), 'paid'], ['Ordered', esc(`${d}, ${S.g.tod}`), 'ordered'], ['Came', esc(lab('[data-field=came]', S.came)), 'came'],
    ['Usual week', esc(S.nw === 0 ? 'Less than one tanker' : `${S.nw >= 30 ? '30+' : S.nw} tanker${S.nw > 1 ? 's' : ''}`), 'often'],
    ['Usually', esc(S.season ? lab('[data-field=season]', S.season) : 'Skipped'), 'season'],
    ['Why', esc(S.why.map(v => lab('#why', v)).join(', ') || 'Skipped'), 'why'], ['Note', esc($('note').value.trim() || 'None'), 'note']];
  lastRows = rows.map(([k, v]) => [k, v.replace(/<small>/g, ' · ').replace(/<[^>]+>/g, '')]);
  $('review').innerHTML = rows.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd><button type="button" data-go="${s}">Change</button></div>`).join('');
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
}

// ── send: only as much place as the person chose; answers kept on the phone until the server accepts them ──
function payload() {
  const b = { place_type: S.mode, place_detail: S.prec, for: S.g.for, building: S.g.building, households: S.g.households || null, supplier: S.source,
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
let sending = false;
async function send() {
  const body = payload(), kept = store.set({ body, rows: lastRows, at: Date.now() });
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
    try { const r = await post(d.body, draftSpam); store.drop(d.id); $('draft').hidden = true; DONE = true; show('thanks'); }
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
  const n = d.features.length; if (n) $('meta').textContent = `${n.toLocaleString('en-IN')} order${n > 1 ? 's' : ''} so far`;
}).catch(() => {});
