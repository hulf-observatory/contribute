// Walking survey: footpaths and crossings, at the place itself (Teja, 16 Nov 2026). One spot, one crossing, or a walk
// (the phone follows the route; only the spots and crossings are sent, not the route). Side of the road by pointing
// the phone at the road. Phones only; a laptop sees a QR code. Talks to contribute-api (/walking/reports).
import { mapMark } from '../assets/map-mark.js?v=20261116';
import { SURVEY, TOPICS, CROSS_TOPICS, QUESTIONS, DIRS, nearestDir, roadSide, sideFromRoad, sideWord, shown, optLabel, POINTS, inHmda, esc,
  metres, bearing, loadReports, contributions, player, checkPlayer, PLAYER_SAYS } from './questions.js';

const $ = (id) => document.getElementById(id);
Contribute.phoneOnly({ what: 'Walking', mapHref: 'map/', mapLabel: 'See the walking map' });
// desk tests on this Mac only: ?demo shows "pretend to walk" and "pretend the phone points…"
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEMO = LOCAL && new URLSearchParams(location.search).has('demo');
if (DEMO) { $('demo-line').hidden = false; document.querySelectorAll('[data-demo]').forEach(x => { x.hidden = false; }); }
const DIR_NAME = Object.fromEntries(DIRS), DIR_DEG = { n: 0, e: 90, s: 180, w: 270 };

// ── topic screens from the question list ──
$('topics').innerHTML = [...TOPICS, ...CROSS_TOPICS].map(t => `<section class="step" data-step="t-${t.id}">
  <h2 class="qt">${esc(t.title)}</h2>
  <p class="hint" data-hint>Tap the answers that fit. Skip any you don't know.</p>
  ${t.qs.map(q => `<div class="qblock" data-q="${q.id}">
    <h3 id="h-${q.id}">${esc(q.q)}</h3>${q.hint ? `<p class="qh">${esc(q.hint)}</p>` : ''}
    <div class="opts" role="${q.multi ? 'group' : 'radiogroup'}" aria-labelledby="h-${q.id}">
      ${q.opts.map(([v, l]) => `<button type="button" class="opt${q.multi ? ' check' : ''}" role="${q.multi ? 'checkbox' : 'radio'}" aria-checked="false" data-v="${v}">${esc(l)}</button>`).join('')}
    </div></div>`).join('')}
</section>`).join('');

// S.spot is the spot being described; S.spots are the finished ones (a walk has many)
const S = { mode: null, spots: [], spot: null, gps: false, track: [], walking: false };
const newSpot = (lat, lng, kind = 'spot') => ({ kind, at: new Date().toISOString(), lat, lng, accuracy_m: S.acc ?? null, moved_m: 0, facing: null, lr: null, how: null, roadAt: null, roadDeg: null, answers: {}, photo: null, note: '', same: false });
let cur = 'start', stack = [];

// ── moving between screens ──
const TOPIC_STEPS = TOPICS.map(t => 't-' + t.id), CROSS_STEPS = CROSS_TOPICS.map(t => 't-' + t.id), ALL_STEPS = [...TOPIC_STEPS, ...CROSS_STEPS];
const isX = () => S.spot && S.spot.kind === 'crossing';
const first = () => S.byMap ? 'mark' : 'where';      // marked on the map when the phone's location failed
const flow = () => isX() ? [first(), ...CROSS_STEPS, 'extra', 'review'] : [first(), 'dir', ...TOPIC_STEPS, 'extra', 'review'];
const lastFoot = () => [...S.spots].reverse().find(s => s.kind !== 'crossing');
function show(s, push = true) {
  if (push && cur !== s) stack.push(cur);
  cur = s;
  document.querySelectorAll('.step').forEach(x => x.classList.toggle('on', x.dataset.step === s));
  const F = flow(), i = F.indexOf(s);
  $('progress').hidden = !(S.mode !== 'walk' && i >= 0);
  if (!$('progress').hidden) { $('bar').style.width = `${(i + 1) / F.length * 100}%`; $('count').textContent = s === 'review' ? 'Last step' : `${i + 1} of ${F.length - 1}`; }
  $('nav').hidden = s === 'start' || s === 'thanks' || (s === 'walk' && S.walking);   // Back from the walk screen until it starts
  $('next').hidden = s === 'same' || s === 'walk';
  const card = S.spot && ['dir', 'same', 'extra', ...ALL_STEPS].includes(s);
  $('spotcard').hidden = !card; if (card) drawCard();
  if (s === 'where') openWhereMap();
  if (s === 'mark') { marker.open(); $('mark-hint').textContent = S.memory ? 'Move the map until the pin in the middle sits exactly on the place.' : 'Move the map until the pin in the middle sits on the place. You still need to be there.'; }
  if (s === 'walk') openWalkMap();
  if (s === 'dir') drawDir();
  if (s === 'same') drawSame();
  if (ALL_STEPS.includes(s)) { drawAnswers(); document.querySelector(`[data-step="${s}"] [data-hint]`).textContent = S.spot.same === 'changed'
      ? 'These are your answers from the last spot. Change only what is different.' : "Tap the answers that fit. Skip any you don't know."; }
  if (s === 'extra') drawExtra();
  if (s === 'review') drawReview();
  updateNext();
  window.scrollTo({ top: 0 });
  const h = document.querySelector(`.step[data-step="${s}"] .qt, .step[data-step="${s}"] h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
const nAnswered = (s) => (s.kind === 'crossing' ? CROSS_TOPICS : TOPICS).flatMap(t => t.qs).filter(q => s.answers[q.id] != null).length;
function ready() {
  if (cur === 'extra' || (cur === 'review' && S.mode !== 'walk')) return !!S.spot && nAnswered(S.spot) > 0;
  if (cur === 'where') return !!S.spot;
  if (cur === 'mark') return !!(S.spot && S.markOk);
  if (cur === 'dir') { const sp = S.spot; return sp.how === 'phone' ? !!sp.roadAt : sp.how === 'buttons' && (sp.lr === 'dk' || !!(sp.facing && sp.lr)); }
  return true;
}
function updateNext() {
  const n = $('next'); n.disabled = !ready();
  $('extra-few').hidden = !(cur === 'extra' && S.spot && !nAnswered(S.spot));
  const topicEmpty = ALL_STEPS.includes(cur) && ![...TOPICS, ...CROSS_TOPICS].find(t => 't-' + t.id === cur).qs.some(q => S.spot.answers[q.id] != null);
  n.textContent = cur === 'review' ? 'Send' : cur === 'extra' && S.mode === 'walk' ? (isX() ? 'Add this crossing' : 'Add this spot') : (topicEmpty || (cur === 'extra' && !S.spot.photo && !$('note').value.trim())) ? 'Skip' : 'Next';
}
function next() {
  if (cur === 'review') return send();
  if (cur === 'extra' && S.mode === 'walk') return finishSpot();
  if (cur === 'dir' && S.mode === 'walk' && lastFoot()) return show('same');
  const F = flow(); show(F[F.indexOf(cur) + 1]);
}
$('next').onclick = next;
$('back').onclick = () => { const p = stack.pop(); if (p) show(p, false); };

// ── first screen ──
$('mode').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b) return;
  $('mode').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  S.mode = b.dataset.val; S.spot = null; S.spots = []; S.byMap = false; S.memory = false;
  setTimeout(() => show(S.mode === 'walk' ? 'walk' : 'where'), 220);
});
// contributor line: the same nickname and PIN as bus stops, checked with the server
let joinMode = 'create';
function drawPlayer() { const p = player.get(); $('play-box').hidden = !!p; $('play-in').hidden = !p; $('joinbox').hidden = true; if (p) $('play-name').textContent = p.nick; }
function openJoin(m) {
  joinMode = m; $('joinbox').hidden = false; $('j-msg').hidden = true;
  $('join-say').textContent = m === 'create' ? 'Make up a nickname (not your real name) and a 4-digit PIN. Use them to log in on any phone; the same nickname works for bus stops and walking.'
    : 'Your nickname and 4-digit PIN from bus stops or walking.';
  $('j-go').textContent = m === 'create' ? 'Join' : 'Log in'; $('j-nick').focus();
}
$('play-create').onclick = (e) => { e.preventDefault(); openJoin('create'); };
$('play-login').onclick = (e) => { e.preventDefault(); openJoin('login'); };
$('j-go').onclick = async () => {
  const nick = $('j-nick').value.trim().replace(/\s+/g, ' '), pin = $('j-pin').value.trim();
  const say = (m) => { $('j-msg').textContent = m; $('j-msg').hidden = false; };
  if (nick.length < 3 || !/^\d{4}$/.test(pin)) return say('Use 3 to 24 letters, numbers and spaces, and a 4-digit PIN.');
  $('j-go').disabled = true;
  try {
    const r = await checkPlayer(nick, pin, joinMode);
    const key = joinMode === 'login' && r.status === 'wrong' ? 'wrongLogin' : r.status;
    if (PLAYER_SAYS[key]) say(PLAYER_SAYS[key]); else { player.set(r.name || nick, pin); drawPlayer(); }
  } catch (err) { say(err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.' : "We couldn't check the nickname; the connection may be weak. Please try again."); }
  $('j-go').disabled = false;
};
$('play-out').onclick = (e) => { e.preventDefault(); player.clear(); drawPlayer(); };
drawPlayer();

// ── maps ──
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const mkEl = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };

// one spot: tap or use location
let wmap = null, wpin = null;
function openWhereMap() {
  if (wmap) { wmap.resize(); return; }
  wmap = new maplibregl.Map({ container: 'wheremap', style: STYLE, center: [78.475, 17.405], zoom: 11, minZoom: 9, maxZoom: 19, maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true } });
  wmap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
}
// the phone's location; the dot can be dragged up to 100 m from it (standing somewhere safe nearby)
const MAX_MOVE = 100;
let fix = null;
function placeSpot(lng, lat) {
  const moved = metres(fix, { lat, lng });
  if (moved > MAX_MOVE) { wpin.setLngLat([S.spot.lng, S.spot.lat]); $('where-msg').textContent = `The dot can be up to ${MAX_MOVE} m from where you are. Walk closer to the spot, if it's safe, and share your location again.`; $('where-msg').hidden = false; return; }
  $('where-msg').hidden = true; S.gps = true;
  if (!wpin) { wpin = new maplibregl.Marker({ element: mkEl('mpin'), draggable: true }).setLngLat([lng, lat]).addTo(wmap); wpin.on('dragend', () => { const q = wpin.getLngLat(); placeSpot(q.lng, q.lat); }); }
  else wpin.setLngLat([lng, lat]);
  S.spot = Object.assign(S.spot || newSpot(lat, lng, S.mode === 'crossing' ? 'crossing' : 'spot'), { lat, lng, moved_m: Math.round(moved), accuracy_m: fix.acc });
  $('where-hint').classList.add('off'); $('where-info').hidden = false;
  $('where-info').textContent = moved < 3 ? 'This is where you are. Drag the dot if the spot is a little away.' : `Moved ${Math.round(moved)} m from where you are.`;
  updateNext();
}
$('gps-go').onclick = () => {
  if (S.byMap) { S.byMap = false; S.memory = false; S.spot = null; }   // back from the map: the phone's location again
  openWhereMap(); $('gps-go').disabled = true; $('gps-go').textContent = 'Waiting for your phone…';
  navigator.geolocation.getCurrentPosition((p) => {
    $('gps-go').disabled = false; $('gps-go').textContent = 'Use my location';
    const { latitude: lat, longitude: lng, accuracy } = p.coords;
    if (!inHmda(lng, lat)) { $('where-msg').textContent = 'Your phone places you outside the Hyderabad area (HMDA). This survey is for footpaths in Hyderabad.'; $('where-msg').hidden = false; return; }
    fix = { lat, lng, acc: Math.round(accuracy) };
    placeSpot(lng, lat); wmap.flyTo({ center: [lng, lat], zoom: 18 }); $('gps-go').textContent = 'Share my location again'; $('gps-go').className = 'btn btn-secondary btn-lg';
  }, (err) => { $('gps-go').disabled = false; $('gps-go').textContent = 'Try again'; $('where-msg').textContent = err.code === 1
      ? "Your phone didn't share its location. Allow location for this page in your browser's settings and try again, or mark the place on the map."
      : "We couldn't get your location. Try again in a moment, ideally in the open, or mark the place on the map."; $('where-msg').hidden = false; },
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
};
// ── the phone's location failed: mark the place with the pin in the middle of a map (Teja, 16 Nov 2026) ──
const marker = mapMark($('markbox'), { onChange: ({ lat, lng, ok }) => {
  S.markOk = ok;
  S.spot = Object.assign(S.spot && S.spot.byMap ? S.spot : newSpot(lat, lng, S.mode === 'crossing' ? 'crossing' : 'spot'), { lat, lng, accuracy_m: null, moved_m: null, byMap: true });
  updateNext();
} });
$('to-mark').onclick = (e) => { e.preventDefault(); S.byMap = true; S.memory = false; S.gps = false; S.spot = null; show('mark'); };
// not there now, but knows the place well: one spot or crossing from memory, on the map (Teja, 16 Nov 2026)
for (const k of ['spot', 'crossing']) $('mem-' + k).onclick = () => {
  $('mode').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', 'false'));
  Object.assign(S, { mode: k, spot: null, spots: [], byMap: true, memory: true, gps: false }); show('mark');
};

// a walk: follow the route, mark spots
let kmap = null, me = null;
const lineGeo = () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: S.track.map(p => [p.lng, p.lat]) } });
const spotsGeo = () => ({ type: 'FeatureCollection', features: S.spots.map((s, i) => ({ type: 'Feature', properties: { n: String(i + 1) }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) });
function openWalkMap() {
  drawWalk();
  if (kmap) { kmap.resize(); return; }
  kmap = new maplibregl.Map({ container: 'walkmap', style: STYLE, center: [78.4482, 17.4126], zoom: 16, maxZoom: 19, attributionControl: { compact: true } });
  kmap.on('load', () => {
    kmap.addSource('track', { type: 'geojson', data: lineGeo() });
    kmap.addLayer({ id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#111827', 'line-width': 4, 'line-opacity': .7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    kmap.addSource('spots', { type: 'geojson', data: spotsGeo() });
    kmap.addLayer({ id: 'spots', type: 'circle', source: 'spots', paint: { 'circle-radius': 10, 'circle-color': '#111827', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    kmap.addLayer({ id: 'spot-n', type: 'symbol', source: 'spots', layout: { 'text-field': ['get', 'n'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#fff' } });
  });
}
function refreshWalkMap() {
  if (!kmap || !kmap.getSource('track')) return;
  kmap.getSource('track').setData(lineGeo()); kmap.getSource('spots').setData(spotsGeo());
  const p = S.track[S.track.length - 1];
  if (p) { if (!me) me = new maplibregl.Marker({ element: mkEl('me') }).setLngLat([p.lng, p.lat]).addTo(kmap); else me.setLngLat([p.lng, p.lat]); kmap.easeTo({ center: [p.lng, p.lat] }); }
}
const MAX_ITEMS = 60, MAX_PHOTOS = 10;
const walked = () => S.track.reduce((a, p, i) => i ? a + metres(S.track[i - 1], p) : 0, 0);
function drawWalk() {
  const on = S.walking;
  $('walk-start-box').hidden = on; $('walk-on-box').hidden = !on; $('walkstat').hidden = !on;
  $('walk-h').textContent = on ? (S.spots.length ? `Walking · ${S.spots.length} spot${S.spots.length > 1 ? 's' : ''}` : 'Walking') : 'Record a walk';
  $('walk-hint').textContent = on ? (S.spots.length ? 'Walk on, and add a spot whenever something changes. Finish when you are done.' : 'Add your first spot now, where you are standing.')
    : 'Press Start and walk as usual. Stop somewhere safe whenever something changes (the footpath ends, gets blocked, the shade goes) and add a spot. Keep this page open, but look up while you walk. The spots of a walk are shown publicly, in order, so start a little away from your home.';
  const d = walked(); $('ws-dist').textContent = d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`;
  $('ws-spots').textContent = S.spots.length;
  const full = S.spots.length >= MAX_ITEMS;        // the server takes up to 60 spots and crossings a walk
  $('walk-finish').disabled = !S.spots.length; $('walk-xing').disabled = !S.track.length || full; $('walk-add').disabled = full;
  if (full) { $('walk-msg').textContent = `That's ${MAX_ITEMS} spots and crossings, the most one walk can hold. Finish this walk and start a new one.`; $('walk-msg').hidden = false; }
  $('walk-start').textContent = S.spots.length ? 'Carry on walking' : 'Start the walk';
  $('spotlist').innerHTML = S.spots.map((s, i) => `<li><span class="n${s.kind === 'crossing' ? ' x' : ''}">${i + 1}</span><span><b>${esc(itemTitle(s))}</b>${esc(itemSummary(s))}${s.same === true ? ' · same as before' : ''}${s.photo ? ' · photo' : ''}</span><button type="button" data-del="${i}">Remove</button></li>`).join('');
  refreshWalkMap();
}
$('spotlist').addEventListener('click', (e) => { const b = e.target.closest('[data-del]'); if (!b) return; S.spots.splice(+b.dataset.del, 1); drawWalk(); });
let watch = null;
function addFix(lat, lng, acc) {
  S.acc = acc == null ? null : Math.round(acc);
  const last = S.track[S.track.length - 1];
  if (!last || metres(last, { lat, lng }) > 8) S.track.push({ lat, lng });
  $('ws-gps').textContent = acc == null ? 'demo' : acc < 20 ? 'good' : acc < 50 ? 'rough' : 'poor';
  drawWalk();
}
$('walk-start').onclick = () => {
  S.walking = true; $('nav').hidden = true; drawWalk();
  if ('geolocation' in navigator) watch = navigator.geolocation.watchPosition((p) => addFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
    () => { $('walk-msg').textContent = "Your phone isn't sharing its location, so the walk can't be followed. Allow location for this page in your browser's settings, or go back and send a single spot or crossing: those can be marked on the map."; $('walk-msg').hidden = false; },
    { enableHighAccuracy: true, maximumAge: 5000 });
};
// desk demo: walk 60 m at a time, turning when asked
let demoDir = 75;
$('demo-step').onclick = (e) => { e.preventDefault(); if (!S.walking) $('walk-start').onclick();
  const p = S.track[S.track.length - 1] || { lat: 17.4126, lng: 78.4482 }, k = Math.PI / 180, d = 60 / 111320;
  addFix(p.lat + d * Math.cos(demoDir * k), p.lng + d * Math.sin(demoDir * k) / Math.cos(p.lat * k), null); };
$('demo-turn').onclick = (e) => { e.preventDefault(); demoDir = (demoDir + 90) % 360; $('demo-step').onclick(e); };
$('walk-add').onclick = () => {
  const p = S.track[S.track.length - 1];
  if (!p) { $('walk-msg').textContent = 'Waiting for your location… try again in a moment.'; $('walk-msg').hidden = false; return; }
  $('walk-msg').hidden = true;
  S.spot = newSpot(p.lat, p.lng); S.gps = true;
  // heading from the last 30 m or so of the route
  const back = [...S.track].reverse().find(q => metres(q, p) > 25);
  S.spot.heading = back ? bearing(back, p) : null;
  if (S.spot.heading != null) S.spot.facing = nearestDir(S.spot.heading);
  // same direction as the last spot: probably the same side; point again after crossing
  const prev = lastFoot();
  if (prev && prev.how === 'phone' && prev.facing && prev.facing === S.spot.facing) {
    Object.assign(S.spot, { how: 'phone', roadAt: prev.roadAt, roadDeg: prev.roadDeg, lr: prev.lr });
    S.spot.aimSay = `Still the <b>${sideFromRoad(prev.roadAt)} side</b>, as at spot ${S.spots.indexOf(prev) + 1}. Crossed the road? Point again.`;
  } else if (prev && prev.how === 'buttons' && prev.lr !== 'dk') Object.assign(S.spot, { how: 'buttons', lr: prev.lr, manual: true });
  show('dir');
};
$('walk-xing').onclick = () => {
  const p = S.track[S.track.length - 1]; if (!p) return;
  $('walk-msg').hidden = true; S.spot = newSpot(p.lat, p.lng, 'crossing'); S.gps = true; show(CROSS_STEPS[0]);
};
$('walk-finish').onclick = () => { if (watch != null) navigator.geolocation.clearWatch(watch); S.walking = false; show('review'); };
function finishSpot() { S.spots.push(S.spot); S.spot = null; stack = []; show('walk', false); }

// ── side of the road: point the phone at the road (the road is that way, so you are on the other side) ──
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const lrOf = (facing, w) => !facing || !w ? null : roadSide(facing, 'left') === w ? 'left' : roadSide(facing, 'right') === w ? 'right' : null;
function drawDir() {
  const sp = S.spot, canAim = !S.memory, showManual = sp.manual || !canAim;
  $('side-q').textContent = S.memory ? 'Which side of the road is it on?' : 'Which side of the road are you on?';
  $('h-side').textContent = S.memory ? 'Facing that way, which side of the road is it on?' : 'Facing that way, which side of the road are you on?';
  $('aim').hidden = showManual; $('manual').hidden = !showManual; $('to-aim-p').hidden = !canAim;
  const w = sp.how === 'phone' ? sideFromRoad(sp.roadAt) : null;
  $('aim-msg').hidden = !sp.aimSay; $('aim-msg').innerHTML = sp.aimSay || '';
  $('aim-go').textContent = w ? 'Point again' : "I'm pointing at the road";
  $('dir-hint').textContent = sp.manualNote || (S.mode === 'walk' ? (sp.heading != null ? `From your route you seem to be walking ${DIR_NAME[sp.facing].toLowerCase()}. Change it if that's wrong.` : 'Face the way you are walking.')
    : canAim ? 'Stand on the footpath facing along the road.' : "Imagine standing on the footpath facing along the road. On the map, north is up.");
  $('compass').querySelectorAll('.opt').forEach(o => o.setAttribute('aria-checked', o.dataset.v === sp.facing));
  $('side').querySelectorAll('.opt').forEach(o => o.setAttribute('aria-checked', sp.how === 'buttons' && o.dataset.v === sp.lr));
  $('you-arrow').style.transform = `rotate(${DIR_DEG[sp.facing] || 0}deg)`;
  const rs = sp.how === 'buttons' ? roadSide(sp.facing, sp.lr) : null;
  $('sideline').hidden = sp.how !== 'buttons';
  $('sideline').innerHTML = rs ? `So you are on the <b>${rs} side</b> of the road.` : sp.lr === 'dk' ? "That's fine; we'll keep the spot without a side." : 'Pick the way you are facing too.';
  updateNext();
}
$('compass').addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (!b) return; S.spot.facing = b.dataset.v; drawDir(); });
$('side').addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (!b) return; Object.assign(S.spot, { lr: b.dataset.v, how: 'buttons', roadAt: null, roadDeg: null, aimSay: '' }); drawDir(); });
$('to-manual').onclick = (e) => { e.preventDefault(); S.spot.manual = true; drawDir(); };
$('to-aim').onclick = (e) => { e.preventDefault(); S.spot.manual = false; S.spot.manualNote = ''; drawDir(); };
function setRoad(deg) {
  const sp = S.spot, roadAt = nearestDir(deg), w = sideFromRoad(roadAt), lr = lrOf(sp.facing, w);
  Object.assign(sp, { how: 'phone', roadAt, roadDeg: Math.round(deg), lr });
  sp.aimSay = `Your phone points <b>${DIR_NAME[roadAt].toLowerCase()}</b> (${Math.round(deg)}°), so you are on the <b>${w} side</b> of the road${lr && S.mode === 'walk' ? `, on your ${lr} as you walk` : ''}. Not right? Point again.`;
  drawDir();
}
$('aim-go').onclick = async () => {
  const toManual = (t) => { S.spot.manual = true; S.spot.manualNote = t; drawDir(); };
  try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission && await DeviceOrientationEvent.requestPermission() !== 'granted') return toManual("The compass wasn't allowed, so choose instead."); }
  catch { return toManual("The compass isn't available, so choose instead."); }
  $('aim-go').disabled = true; $('aim-go').textContent = 'Reading the compass…';
  const got = [], on = (ev) => { const d = ev.webkitCompassHeading != null ? ev.webkitCompassHeading : ev.absolute && ev.alpha != null ? 360 - ev.alpha : null; if (d != null) got.push(d); };
  window.addEventListener('deviceorientationabsolute', on); window.addEventListener('deviceorientation', on);
  await new Promise(r => setTimeout(r, 1200));
  window.removeEventListener('deviceorientationabsolute', on); window.removeEventListener('deviceorientation', on);
  $('aim-go').disabled = false;
  if (!got.length) return toManual("This phone or browser doesn't share its compass, so choose instead.");
  // average of the readings (on a circle, so 359° and 1° average to 0°)
  const k = Math.PI / 180, x = got.reduce((a, d) => a + Math.cos(d * k), 0), y = got.reduce((a, d) => a + Math.sin(d * k), 0);
  setRoad((Math.atan2(y, x) / k + 360) % 360);
};
document.querySelectorAll('[data-fake]').forEach(a => a.onclick = (e) => { e.preventDefault(); setRoad(+a.dataset.fake); });

// ── "same as the last spot?" ──
function drawSame() {
  const prev = lastFoot();
  $('same-prev').textContent = S.spots.indexOf(prev) + 1;
  $('same-list').innerHTML = TOPICS.map(t => `<div><dt>${esc(t.title.replace('Shade, access and safety', 'Shade and safety'))}</dt><dd>${topicLines(t, prev.answers)}</dd><span></span></div>`).join('');
  $('same').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', 'false'));
}
$('same').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b) return;
  $('same').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  const prev = lastFoot(), pn = S.spots.indexOf(prev) + 1;
  S.spot.answers = structuredClone(prev.answers);
  setTimeout(() => { if (b.dataset.val === 'yes') { S.spot.same = true; finishSpot(); $('walk-msg').textContent = `Spot ${S.spots.length} added, the same as spot ${pn}.`; $('walk-msg').hidden = false; }
    else { S.spot.same = 'changed'; show(TOPIC_STEPS[0]); } }, 220);
});

// ── answers ──
$('topics').addEventListener('click', (e) => {
  const b = e.target.closest('.opt'); if (!b) return;
  const a = S.spot.answers, id = b.closest('.qblock').dataset.q, q = QUESTIONS.find(x => x.id === id), v = b.dataset.v;
  if (q.multi) { const t = new Set(a[id] || []); t.has(v) ? t.delete(v) : t.add(v); a[id] = t.size ? [...t] : undefined; }
  else a[id] = a[id] === v ? undefined : v;
  if (a[id] === undefined) delete a[id];
  drawAnswers();
});
function drawAnswers() {
  const a = S.spot.answers;
  for (const q of QUESTIONS) {
    const blk = document.querySelector(`.qblock[data-q="${q.id}"]`);
    blk.hidden = !shown(q, a); if (blk.hidden) delete a[q.id];
    const v = a[q.id];
    blk.querySelectorAll('.opt').forEach(o => o.setAttribute('aria-checked', q.multi ? !!(v || []).includes(o.dataset.v) : o.dataset.v === v));
  }
  updateNext();
}

// ── summaries ──
const spotTitle = (s) => { const w = sideWord(s); return [w && `${cap(w)} side of the road`, s.facing && `${S.mode === 'walk' ? 'walking' : 'facing'} ${DIR_NAME[s.facing].toLowerCase()}`].filter(Boolean).join(', ') || 'Spot'; };
function shortSummary(a) {
  if (a.footpath === 'no') return ' · No footpath';
  if (a.footpath !== 'yes') return '';
  const bits = ['Footpath']; if (a.blocked && a.blocked !== 'no') bits.push('blocked'); if (a.damaged && a.damaged !== 'no') bits.push('damaged');
  if (a.shade) bits.push(({ most: 'shaded', some: 'some shade', none: 'no shade' })[a.shade]);
  return ' · ' + bits.join(', ');
}
function crossSummary(a) {
  const bits = [({ junction: 'At a junction', between: 'Between junctions' })[a.x_where], ({ zebra: 'zebra', faded: 'faded stripes', none: 'not marked' })[a.x_marked],
    ({ working: 'signal', broken: 'signal not working', none: 'no signal' })[a.x_signal], a.x_stop && `vehicles ${a.x_stop} stop`].filter(Boolean);
  return bits.join(', ');
}
const itemTitle = (s) => s.kind === 'crossing' ? 'Crossing' : spotTitle(s);
const itemSummary = (s) => (s.kind === 'crossing' ? crossSummary(s.answers) : shortSummary(s.answers).replace(' · ', '')) || 'No answers';
function topicLines(t, a) {
  const parts = t.qs.filter(q => shown(q, a) && a[q.id] != null).map(q => `${q.s}: ${q.multi ? a[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, a[q.id])}`);
  return parts.length ? `<span class="lines">${parts.map(esc).join('<br>')}</span>` : 'Skipped';
}
function drawCard() {
  const s = S.spot;
  $('sc-n').textContent = S.mode === 'walk' ? S.spots.length + 1 : isX() ? '×' : '•';
  if (isX()) { $('sc-name').textContent = S.mode === 'walk' ? `Crossing on your walk (${S.spots.length + 1})` : 'Your crossing'; $('sc-ctx').textContent = s.byMap ? (S.memory ? 'From memory, marked on the map' : 'Marked on the map') : s.moved_m > 2 ? `Moved ${s.moved_m} m from where you are` : 'Where you are standing'; return; }
  $('sc-name').textContent = S.mode === 'walk' ? `Spot ${S.spots.length + 1} of your walk` : 'Your spot';
  $('sc-ctx').textContent = spotTitle(s) === 'Spot' ? (S.gps ? 'Where you are standing' : S.memory ? 'From memory, marked on the map' : 'Marked on the map') : spotTitle(s);
}

// ── photo and note ──
function drawExtra() { const s = S.spot;
  const full = S.mode === 'walk' && !s.photo && S.spots.filter(x => x.photo).length >= MAX_PHOTOS;
  $('photo-btn').style.display = full ? 'none' : ''; $('photo-full').hidden = !full; $('note').value = s.note || ''; $('photo-prev').style.display = s.photo ? 'block' : 'none'; if (s.photo) $('photo-prev').src = s.photo; $('photo-btn').textContent = s.photo ? 'Use a different photo' : 'Take or choose a photo'; }
$('note').addEventListener('input', () => { S.spot.note = $('note').value.trim(); updateNext(); });
$('photo-in').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { const bmp = await createImageBitmap(f), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    S.spot.photo = c.toDataURL('image/jpeg', .82); drawExtra(); } catch { /* unreadable photo */ }
  updateNext();
});

// ── check and send ──
function drawReview() {
  let rows;
  if (S.mode === 'crossing') {
    const s = S.spot;
    rows = [['Crossing', s.byMap ? (S.memory ? 'From memory, marked on the map' : 'Marked on the map') : s.moved_m > 2 ? `Moved ${s.moved_m} m from where you were` : 'Where you were standing', first()],
      ...CROSS_TOPICS.map(t => [t.title.replace('Waiting, light and safety', 'Waiting and safety'), topicLines(t, s.answers), 't-' + t.id]),
      ['Photo', s.photo ? 'Added' : 'None', 'extra'], ['Note', esc(s.note || 'None'), 'extra']];
    $('review-hint').textContent = 'Tap "Change" to fix anything. Nothing has been saved yet.';
  } else if (S.mode === 'spot') {
    const s = S.spot;
    rows = [['Spot', S.gps ? 'Where you were standing' : S.memory ? 'From memory, marked on the map' : 'Marked on the map', first()],
      ['Side', esc(spotTitle(s)), 'dir'], ...TOPICS.map(t => [t.title.replace('Shade, access and safety', 'Shade and safety'), topicLines(t, s.answers), 't-' + t.id]),
      ['Photo', s.photo ? 'Added' : 'None', 'extra'], ['Note', esc(s.note || 'None'), 'extra']];
    $('review-hint').textContent = 'Tap "Change" to fix anything. Nothing has been saved yet.';
  } else {
    const d = walked();
    const nx = S.spots.filter(s => s.kind === 'crossing').length, ns = S.spots.length - nx;
    rows = [['Walk', `${[ns && `${ns} spot${ns > 1 ? 's' : ''}`, nx && `${nx} crossing${nx > 1 ? 's' : ''}`].filter(Boolean).join(', ')}<small>${d < 1000 ? Math.round(d) + ' m' : (d / 1000).toFixed(2) + ' km'} walked</small>`, null],
      ...S.spots.map((s, i) => [`${i + 1}. ${s.kind === 'crossing' ? 'Crossing' : 'Spot'}`, `${esc(s.kind === 'crossing' ? itemSummary(s) : spotTitle(s))}<small>${s.kind === 'crossing' ? '' : esc(itemSummary(s))}${s.same === true ? ' (same as before)' : ''}${s.photo ? ' · photo' : ''}</small>`, null])];
    $('review-hint').textContent = 'Nothing has been saved yet. Go back to the walk to add or remove spots.';
  }
  $('review').innerHTML = rows.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd>${s ? `<button type="button" data-go="${s}">Change</button>` : '<span></span>'}</div>`).join('');
  $('review').querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
}
// ── send: everything at once, with one spam check; if it fails, the answers stay on this phone ──
const DRAFT = 'obs-walk-unsent';
const store = Contribute.drafts(DRAFT);          // several can wait; each is sent or discarded on its own
const ANSWER_IDS = new Set(QUESTIONS.map(q => q.id));
function payload() {
  const spots = S.mode === 'walk' ? S.spots : [S.spot], p = player.get();
  const nk = p && !S.noNick;
  return { mode: S.mode, nick: nk ? p.nick : null, nick_pin: nk ? p.pin : null,
    items: spots.map(s => ({ item: s.kind, here: S.memory ? 'known' : 'yes', place_type: s.byMap ? 'map' : 'gps', lat: +s.lat.toFixed(6), lng: +s.lng.toFixed(6), accuracy_m: s.accuracy_m, moved_m: s.byMap ? null : (s.moved_m || 0), observed_at: s.at,
      ...(s.kind === 'spot' ? { facing: s.facing, side_how: s.how, road_deg: s.roadDeg, lr: s.lr, same: s.same === true } : {}),
      ...Object.fromEntries(Object.entries(s.answers).filter(([k, v]) => ANSWER_IDS.has(k) && v != null)),
      note: s.note || null, photo: s.photo || null })) };
}
const spam = Contribute.spamCheck($('ts-review'));
async function postIt(body, sc = spam) {
  const token = await sc.token();
  if (token === null) { const e = new Error('spam check'); e.server = true; e.status = 403; throw e; }
  try { return await Contribute.post(`/${SURVEY}/reports`, { ...body, token, website: $('trap').value }); }
  finally { sc.reset(); }
}
function thanks(body) {
  const items = body.items, photos = items.filter(s => s.photo).length, nx = items.filter(s => s.item === 'crossing').length, ns = items.length - nx, got = [];
  if (ns) got.push([ns > 1 ? `${ns} footpath spots × ${POINTS.spot}` : 'A footpath spot', ns * POINTS.spot]);
  if (nx) got.push([nx > 1 ? `${nx} crossings × ${POINTS.crossing}` : 'A crossing', nx * POINTS.crossing]);
  if (photos) got.push([photos > 1 ? `${photos} photos × ${POINTS.photo}` : 'A photo', photos * POINTS.photo]);
  $('pts').textContent = '+' + got.reduce((a, b) => a + b[1], 0);
  $('pts-list').innerHTML = got.map(([k, v]) => `<li>${k}<b>+${v}</b></li>`).join('');
  $('thanks-text').textContent = body.nick ? `Points go to ${body.nick} on the leaderboard, together with any bus stop contributions.` : 'You are not logged in, so these points are not on the leaderboard. Join as a contributor on the first screen next time to collect them.';
  if (watch != null) navigator.geolocation.clearWatch(watch);
  stack = []; show('thanks', false);
}
let sending = false;
async function send() {
  if (sending) return;
  const body = payload(), saved = { body, at: Date.now(), n: body.items.length };
  const kept = store.set(saved) || store.set({ ...saved, body: { ...body, items: body.items.map(i => ({ ...i, photo: null })) }, photoDropped: true });
  sending = true; $('send-msg').hidden = true; $('next').disabled = true; $('next').textContent = 'Sending…';
  try { await postIt(body); store.drop(kept); sending = false; thanks(body); }
  catch (err) {
    sending = false; $('next').disabled = false; $('next').textContent = 'Try again';
    if (err.server && err.status === 400 && /^nick/.test(err.message)) S.noNick = true;
    const why = err.server && err.status === 400 ? (/^nick/.test(err.message) ? 'The nickname or PIN was not accepted. Press Try again to send it without a nickname, or log in again on the first screen.' : `The server could not accept this (${err.message}).`)
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
  $('draft-text').textContent = `You have ${d.n > 1 ? d.n + ' spots and crossings' : 'details'} from ${new Date(d.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} that didn't send.${d.photoDropped ? ' The photos were too large to keep.' : ''}`;
  $('draft-send').hidden = false; $('draft-send').disabled = false; $('draft-send').textContent = 'Send it now'; $('draft-drop').textContent = 'Discard it'; $('draft-msg').hidden = true;
  $('draft-send').onclick = async () => {
    $('draft-send').disabled = true; $('draft-send').textContent = 'Sending…'; $('draft-msg').hidden = true;
    try { const r = await postIt(d.body, draftSpam); store.drop(d.id); $('draft').hidden = true; thanks(d.body); }
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
$('again').onclick = () => { location.href = location.pathname; };

// ── counts for the first screen ──
loadReports().then(rows => {
  const c = contributions(rows), xs = rows.filter(r => r.item === 'crossing').length;
  if (rows.length) $('meta').textContent = `${rows.length - xs} footpath spots, ${xs} crossings and ${c.filter(x => x.kind === 'walk').length} walks so far`;
}).catch(() => {});
if (LOCAL) window.__test = { S, show, placeSpot, setRoad, maps: () => ({ wmap, kmap }) };
