// Walking survey: footpaths and crossings, at the place itself (Teja, 16 Nov 2026). One spot, one crossing, or a walk
// (the phone follows the route; only the spots and crossings are sent, not the route). Side of the road by pointing
// the phone at the road. One question per screen (17 Nov 2026). Phones only; a laptop sees a QR code. Talks to
// contribute-api (/walking/reports).
import { mapMark } from '../assets/map-mark.js?v=20261117g';
import { SURVEY, TOPICS, CROSS_TOPICS, QUESTIONS, DIRS, nearestDir, roadSide, sideFromRoad, sideWord, shown, optLabel, nAnswered, POINTS, inHmda, esc,
  metres, bearing, loadReports, contributions, player, checkPlayer, PLAYER_SAYS } from './questions.js?v=20261117g';

const $ = (id) => document.getElementById(id);
Contribute.phoneOnly({ what: 'Walking', mapHref: 'map/', mapLabel: 'See the walking map' });
// desk tests on this Mac only: ?demo shows "pretend to walk" and "pretend the phone points…"
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEMO = LOCAL && new URLSearchParams(location.search).has('demo');
if (DEMO) { $('demo-line').hidden = false; document.querySelectorAll('[data-demo]').forEach(x => { x.hidden = false; }); }
const DIR_NAME = Object.fromEntries(DIRS), DIR_DEG = { n: 0, e: 90, s: 180, w: 270 };

// ── one screen per question (Teja, 17 Nov 2026): tap an answer and the next question comes; ticks have Next ──
$('topics').innerHTML = QUESTIONS.map(q => `<section class="step" data-step="q-${q.id}">
  <p class="qtopic" data-qn></p>
  <h2 class="qt" id="h-${q.id}">${esc(q.q)}</h2>${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ''}
  <div class="answers" data-q="${q.id}" role="${q.multi ? 'group' : 'radiogroup'}" aria-labelledby="h-${q.id}">
    ${q.opts.map(([v, l]) => `<button type="button" class="answer${q.multi ? ' check' : ''}" role="${q.multi ? 'checkbox' : 'radio'}" aria-checked="false" data-v="${v}"><span>${esc(l)}</span><i class="tick"></i></button>`).join('')}
  </div>
</section>`).join('');

// S.spot is the spot being described; S.spots are the finished ones (a walk has many)
const S = { mode: null, spots: [], spot: null, gps: false, track: [], walking: false };
const newSpot = (lat, lng, kind = 'spot') => ({ kind, at: new Date().toISOString(), lat, lng, accuracy_m: S.acc ?? null, moved_m: 0, facing: null, lr: null, how: null, roadAt: null, roadDeg: null, answers: {}, photo: null, note: '', same: false });
let cur = 'start', stack = [];
var DONE = false;                                // sent: Back can't offer Send again

// ── moving between screens ──
const isQ = (s) => s.startsWith('q-');
const qOf = (s) => QUESTIONS.find(q => 'q-' + q.id === s);
const kind = () => S.spot ? S.spot.kind : S.mode === 'crossing' ? 'crossing' : 'spot';
const isX = () => kind() === 'crossing';
const lastFoot = () => [...S.spots].reverse().find(s => s.kind !== 'crossing');
const qSteps = () => (isX() ? CROSS_TOPICS : TOPICS).flatMap(t => t.qs).filter(q => shown(q, S.spot ? S.spot.answers : {})).map(q => 'q-' + q.id);
const first = () => S.byMap ? 'mark' : 'where';  // marked on the map when the phone's location failed, or from memory
// one spot or crossing, from its place to its note; on a walk the place comes from the route
function flow() {
  const x = isX(), walk = S.mode === 'walk';
  return [...(walk ? [] : S.memory ? ['mark'] : S.byMap ? ['locate', 'mark'] : ['locate', 'where']), ...(x ? [] : ['dir']),
    ...(walk && !x && lastFoot() ? ['same'] : []), ...qSteps(), 'photo', 'note', ...(walk ? [] : ['review'])];
}
function show(s, push = true) {
  if (DONE && s !== 'thanks') s = 'thanks';
  if (push && cur !== s) stack.push(cur);
  cur = s;
  document.querySelectorAll('.step').forEach(x => x.classList.toggle('on', x.dataset.step === s));
  const inQ = !['start', 'thanks', 'player'].includes(s);
  document.body.classList.toggle('q-mode', inQ);
  $('progress').hidden = !inQ;
  $('nav').hidden = !inQ || (s === 'walk' && S.walking);   // Back from the walk screen until it starts
  const F = flow(), i = F.indexOf(s);
  $('bar').style.width = `${i < 0 ? 0 : (i + 1) / F.length * 100}%`;
  const n = S.spots.length + 1, item = S.mode === 'walk' && S.spot ? `${isX() ? 'Crossing' : 'Spot'} ${n}` : '';
  $('count').textContent = item || (isQ(s) ? qOf(s).topicShort : '');
  if (isQ(s)) { profileHere(); drawAnswers(); drawQn(); }
  if (s === 'where') openWhereMap();
  if (s === 'mark') { marker.open(); $('mark-hint').textContent = S.memory ? 'Put the pin exactly on the place.' : 'Move the map so the pin sits on the place. You still need to be there.'; }
  if (s === 'walk') openWalkMap();
  if (s === 'dir') drawDir();
  if (s === 'same') drawSame();
  if (s === 'photo') drawPhoto();
  if (s === 'note') $('note').value = S.spot ? S.spot.note || '' : '';
  if (s === 'review') drawReview();
  if (s === 'start') drawPlay();
  if (s === 'player') { S.noNick = false; const p = player.get(); $('p-nick').value = p ? p.nick : $('p-nick').value; $('p-pin').value = ''; $('p-msg').hidden = true; playerReady(); }
  updateNext();
  window.scrollTo({ top: 0 });
  const st = document.querySelector(`.step[data-step="${s}"]`); st.scrollTop = 0;
  const h = st.querySelector('.qt, h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function ready() {
  const sp = S.spot;
  if (cur === 'where') return !!sp;
  if (cur === 'mark') return !!(sp && S.markOk);
  if (cur === 'dir') return sp.how === 'phone' ? !!sp.roadAt : sp.how === 'buttons' && (sp.lr === 'dk' || !!(sp.facing && sp.lr));
  if (cur === 'note') return !!sp && nAnswered(sp.kind, sp.answers) > 0;
  if (cur === 'review') return !sending && (S.mode === 'walk' ? S.spots.length > 0 : !!sp && nAnswered(sp.kind, sp.answers) > 0);
  return true;
}
// screens where a tap moves on have no Next button: one-answer questions, and the choices that start something
const TAP_ON = ['mode', 'away', 'locate', 'walk', 'same'];
function updateNext() {
  const n = $('next'); n.disabled = !ready();
  n.hidden = TAP_ON.includes(cur) || (isQ(cur) && !qOf(cur).multi);
  const few = cur === 'note' && !!S.spot && !nAnswered(S.spot.kind, S.spot.answers);
  $('note-few').hidden = !few;
  if (few) $('note-few').textContent = `Answer at least one question about this ${isX() ? 'crossing' : 'spot'} ("Don't know" doesn't count). Press Back to change an answer.`;
  if (cur === 'review' && sending) return;
  const optional = { photo: !(S.spot && S.spot.photo), note: !$('note').value.trim() };
  n.textContent = cur === 'review' ? (unchanged() ? "Confirm it's still like this" : 'Send')
    : cur === 'note' && S.mode === 'walk' ? (isX() ? 'Add this crossing' : 'Add this spot') : optional[cur] ? 'Skip' : 'Next';
}
function next() {
  if (cur === 'review') return send();
  if (cur === 'note' && S.mode === 'walk') return finishSpot();
  if (S.fromReview && isQ(cur)) { S.fromReview = false; return show('review'); }   // came from the check screen to change one
  const F = flow(); show(F[F.indexOf(cur) + 1]);
}
$('next').onclick = next;
$('back').onclick = () => {
  let p; do p = stack.pop(); while (p && isQ(p) && !qSteps().includes(p));   // a follow-up that no longer applies
  if (p) show(p, false); else leave();
};
// ✕: back to the first screen; a walk with spots asks first, since they haven't been sent
function leave() {
  if (S.mode === 'walk' && (S.spots.length || S.walking) && !DONE && !confirm("Leave this walk? Its spots haven't been sent.")) return;
  if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
  S.walking = false; stack = []; show('start', false);
}
$('exit').onclick = leave;
$('start-go').onclick = () => show('mode');

// ── what to tell us about ──
let moving = false;                              // a second tap while the next screen is coming
$('mode').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b || moving) return;
  $('mode').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  const v = b.dataset.val; moving = true;
  setTimeout(() => {
    moving = false;
    if (v === 'away') return show('away');
    Object.assign(S, { mode: v, spot: null, spots: [], track: [], byMap: false, memory: false, gps: false });
    show(v === 'walk' ? 'walk' : 'locate');
  }, 220);
});
// not there now, but knows the place well: one spot or crossing from memory, on the map (Teja, 16 Nov 2026)
for (const k of ['spot', 'crossing']) $('mem-' + k).onclick = () => {
  Object.assign(S, { mode: k, spot: null, spots: [], byMap: true, memory: true, gps: false, markOk: false }); show('mark');
};

// ── maps ──
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const mkEl = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
const compact = (m) => m.on('load', () => m.getContainer().querySelectorAll('.maplibregl-compact-show').forEach(x => x.classList.remove('maplibregl-compact-show')));

// one spot: the phone's location; the dot can be dragged up to 100 m from it (standing somewhere safe nearby)
const MAX_MOVE = 100;
let fix = null, wmap = null, wpin = null, wme = null;
$('gps-go').onclick = () => {
  if (!('geolocation' in navigator)) return gpsFailed('This browser cannot share a location.');
  $('gps-go').disabled = true; $('gps-go').textContent = 'Waiting for your phone…'; $('gps-msg').hidden = true;
  navigator.geolocation.getCurrentPosition((p) => {
    $('gps-go').disabled = false; $('gps-go').textContent = 'Share my location';
    const { latitude: lat, longitude: lng, accuracy } = p.coords;
    if (!inHmda(lng, lat)) return gpsFailed('Your phone places you outside the Hyderabad area (HMDA). This survey is for Hyderabad.');
    fix = { lat, lng, acc: Math.round(accuracy) };
    const sp = S.spot && !S.spot.byMap ? S.spot : newSpot(lat, lng, S.mode === 'crossing' ? 'crossing' : 'spot');
    if (!Object.keys(sp.answers).length) sp.asked = false;   // a new place: look for its profile again
    S.spot = Object.assign(sp, { lat, lng, moved_m: 0, accuracy_m: fix.acc, byMap: false });
    S.byMap = false; S.memory = false; S.gps = true;
    show('where');
  }, (err) => gpsFailed(err.code === 1
      ? "Your phone didn't share its location. Allow location for this page in your browser's settings and try again, or use the map."
      : "We couldn't get your location. Try again in a moment, ideally in the open, or use the map."),
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
};
function gpsFailed(t) { $('gps-go').disabled = false; $('gps-go').textContent = 'Try again'; $('gps-msg').textContent = t; $('gps-msg').hidden = false; }
function openWhereMap() {
  const sp = S.spot; if (!sp || !fix) return;
  if (!wmap) {
    wmap = new maplibregl.Map({ container: 'wheremap', style: STYLE, center: [sp.lng, sp.lat], zoom: 18, minZoom: 9, maxZoom: 19, maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true } });
    wmap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right'); compact(wmap);
    wme = new maplibregl.Marker({ element: mkEl('me') }).setLngLat([fix.lng, fix.lat]).addTo(wmap);
    wpin = new maplibregl.Marker({ element: mkEl('mpin'), draggable: true }).setLngLat([sp.lng, sp.lat]).addTo(wmap);
    wpin.on('dragend', () => { const q = wpin.getLngLat(); placeSpot(q.lng, q.lat); });
  } else { wmap.resize(); wme.setLngLat([fix.lng, fix.lat]); wpin.setLngLat([sp.lng, sp.lat]); wmap.jumpTo({ center: [sp.lng, sp.lat], zoom: 18 }); }
  whereInfo();
}
function placeSpot(lng, lat) {
  const moved = metres(fix, { lat, lng });
  if (moved > MAX_MOVE) { wpin.setLngLat([S.spot.lng, S.spot.lat]); $('where-msg').textContent = `The dot can be up to ${MAX_MOVE} m from where you are. Walk closer, if it's safe, and share your location again.`; $('where-msg').hidden = false; return; }
  $('where-msg').hidden = true;
  Object.assign(S.spot, { lat, lng, moved_m: Math.round(moved) });
  whereInfo(); updateNext();
}
const whereInfo = () => { const m = S.spot.moved_m; $('where-info').hidden = false; $('where-info').textContent = m < 3 ? 'Blue is you. Black is the place.' : `The place is ${m} m from you.`; };
// the phone's location failed, or from memory: the pin in the middle of a map (Teja, 16 Nov 2026)
const marker = mapMark($('markbox'), { onChange: ({ lat, lng, ok }) => {
  S.markOk = ok;
  S.spot = Object.assign(S.spot && S.spot.byMap ? S.spot : newSpot(lat, lng, S.mode === 'crossing' ? 'crossing' : 'spot'), { lat, lng, accuracy_m: null, moved_m: null, byMap: true });
  updateNext();
} });
$('to-mark').onclick = (e) => { e.preventDefault(); S.byMap = true; S.memory = false; S.gps = false; S.spot = null; S.markOk = false; show('mark'); };

// a walk: follow the route, mark spots
let kmap = null, me = null;
const lineGeo = () => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: S.track.map(p => [p.lng, p.lat]) } });
const spotsGeo = () => ({ type: 'FeatureCollection', features: S.spots.map((s, i) => ({ type: 'Feature', properties: { n: String(i + 1) }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) });
function openWalkMap() {
  drawWalk();
  if (kmap) { kmap.resize(); refreshWalkMap(); return; }
  kmap = new maplibregl.Map({ container: 'walkmap', style: STYLE, center: [78.4482, 17.4126], zoom: 16, maxZoom: 19, attributionControl: { compact: true } });
  compact(kmap);
  kmap.on('load', () => {
    kmap.addSource('track', { type: 'geojson', data: lineGeo() });
    kmap.addLayer({ id: 'track', type: 'line', source: 'track', paint: { 'line-color': '#111827', 'line-width': 4, 'line-opacity': .7 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    kmap.addSource('spots', { type: 'geojson', data: spotsGeo() });
    kmap.addLayer({ id: 'spots', type: 'circle', source: 'spots', paint: { 'circle-radius': 10, 'circle-color': '#111827', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
    kmap.addLayer({ id: 'spot-n', type: 'symbol', source: 'spots', layout: { 'text-field': ['get', 'n'], 'text-size': 11, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': '#fff' } });
    refreshWalkMap();
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
const dist = (d) => d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(2)} km`;
function drawWalk() {
  const on = S.walking, n = S.spots.length;
  $('walk-start-box').hidden = on; $('walk-on-box').hidden = !on; $('walkstat').hidden = !on;
  $('walk-h').textContent = on ? (n ? `Walking · ${n} spot${n > 1 ? 's' : ''}` : 'Walking') : 'Record a walk';
  $('walk-hint').textContent = on ? (n ? 'Walk on and add a spot when something changes. Press Finish when you are done.' : 'Add your first spot here, where you are standing.')
    : n ? 'Carry on walking, then press Finish to send.' : 'Walk as usual and add a spot when something changes. Stop somewhere safe first. Spots are shown publicly, so start away from home.';
  $('ws-dist').textContent = dist(walked());
  $('ws-spots').textContent = n;
  const full = n >= MAX_ITEMS;                   // the server takes up to 60 spots and crossings a walk
  $('walk-finish').disabled = !n; $('walk-xing').disabled = !S.track.length || full; $('walk-add').disabled = full;
  if (full) { $('walk-msg').textContent = `That's ${MAX_ITEMS} spots and crossings, the most one walk can hold. Finish this walk and start a new one.`; $('walk-msg').hidden = false; }
  $('walk-start').textContent = n ? 'Carry on walking' : 'Start the walk';
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
  if ('geolocation' in navigator && watch == null) watch = navigator.geolocation.watchPosition((p) => addFix(p.coords.latitude, p.coords.longitude, p.coords.accuracy),
    () => { $('walk-msg').textContent = "Your phone isn't sharing its location, so the walk can't be followed. Allow location for this page in your browser's settings, or send a single spot or crossing instead: those can be marked on the map."; $('walk-msg').hidden = false; },
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
  $('walk-msg').hidden = true; S.spot = newSpot(p.lat, p.lng, 'crossing'); S.gps = true; show(qSteps()[0]);
};
$('walk-finish').onclick = () => { if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; } S.walking = false; show('review'); };
function finishSpot() { S.spots.push(S.spot); S.spot = null; stack = []; show('walk', false); }

// ── side of the road: point the phone at the road (the road is that way, so you are on the other side) ──
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const lrOf = (facing, w) => !facing || !w ? null : roadSide(facing, 'left') === w ? 'left' : roadSide(facing, 'right') === w ? 'right' : null;
function drawDir() {
  const sp = S.spot, canAim = !S.memory, showManual = sp.manual || !canAim;
  $('side-q').textContent = S.memory ? 'Which side of the road is it on?' : 'Which side of the road are you on?';
  $('h-side').textContent = S.memory ? 'Facing that way, which side is it on?' : 'Facing that way, which side are you on?';
  $('aim').hidden = showManual; $('manual').hidden = !showManual; $('to-aim-p').hidden = !canAim;
  const w = sp.how === 'phone' ? sideFromRoad(sp.roadAt) : null;
  $('aim-msg').hidden = !sp.aimSay; $('aim-msg').innerHTML = sp.aimSay || '';
  $('aim-go').textContent = w ? 'Point again' : "I'm pointing at the road";
  $('dir-hint').textContent = sp.manualNote || (S.mode === 'walk' ? (sp.heading != null ? `You seem to be walking ${DIR_NAME[sp.facing].toLowerCase()}. Change it if that's wrong.` : 'Face the way you are walking.')
    : canAim ? 'Stand on the footpath facing along the road.' : 'Imagine facing along the road. On the map, north is up.');
  $('compass').querySelectorAll('.opt').forEach(o => o.setAttribute('aria-checked', o.dataset.v === sp.facing));
  $('side').querySelectorAll('.opt').forEach(o => o.setAttribute('aria-checked', sp.how === 'buttons' && o.dataset.v === sp.lr));
  $('you-arrow').style.transform = `rotate(${DIR_DEG[sp.facing] || 0}deg)`;
  const rs = sp.how === 'buttons' ? roadSide(sp.facing, sp.lr) : null;
  $('sideline').hidden = sp.how !== 'buttons';
  $('sideline').innerHTML = rs ? `So ${S.memory ? 'it is' : 'you are'} on the <b>${rs} side</b> of the road.` : sp.lr === 'dk' ? "That's fine; we'll keep it without a side." : 'Pick the way you are facing too.';
  updateNext();
}
$('compass').addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (!b) return; S.spot.facing = b.dataset.v; drawDir(); });
$('side').addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (!b) return; Object.assign(S.spot, { lr: b.dataset.v, how: 'buttons', roadAt: null, roadDeg: null, aimSay: '' }); drawDir(); });
$('to-manual').onclick = (e) => { e.preventDefault(); S.spot.manual = true; drawDir(); };
$('to-aim').onclick = (e) => { e.preventDefault(); S.spot.manual = false; S.spot.manualNote = ''; drawDir(); };
function setRoad(deg) {
  const sp = S.spot, roadAt = nearestDir(deg), w = sideFromRoad(roadAt), lr = lrOf(sp.facing, w);
  Object.assign(sp, { how: 'phone', roadAt, roadDeg: Math.round(deg), lr });
  sp.aimSay = `The road is to the <b>${DIR_NAME[roadAt].toLowerCase()}</b>, so you are on the <b>${w} side</b>${lr && S.mode === 'walk' ? `, on your ${lr} as you walk` : ''}. Not right? Point again.`;
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
  if (!got.length) return toManual("This phone doesn't share its compass, so choose instead.");
  // average of the readings (on a circle, so 359° and 1° average to 0°)
  const k = Math.PI / 180, x = got.reduce((a, d) => a + Math.cos(d * k), 0), y = got.reduce((a, d) => a + Math.sin(d * k), 0);
  setRoad((Math.atan2(y, x) / k + 360) % 360);
};
document.querySelectorAll('[data-fake]').forEach(a => a.onclick = (e) => { e.preventDefault(); setRoad(+a.dataset.fake); });

// ── "same as the last spot?" ──
function drawSame() {
  const prev = lastFoot(), pn = S.spots.indexOf(prev) + 1;
  $('same-q').textContent = `Same as spot ${pn}?`;
  $('same-prev').textContent = `Spot ${pn}: ${itemSummary(prev)}.`;
  $('same').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', 'false'));
}
$('same').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b || moving) return;
  $('same').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  const prev = lastFoot(), pn = S.spots.indexOf(prev) + 1;
  S.spot.answers = structuredClone(prev.answers); moving = true;
  setTimeout(() => {
    moving = false;
    if (b.dataset.val === 'yes') { S.spot.same = true; finishSpot(); $('walk-msg').textContent = `Spot ${S.spots.length} added, the same as spot ${pn}.`; $('walk-msg').hidden = false; }
    else { Object.assign(S.spot, { same: 'changed', baseA: structuredClone(prev.answers), baseTag: 'Spot ' + pn }); show(qSteps()[0]); }
  }, 220);
});

// ── answers: one tap chooses and moves on (tapping the chosen one again also moves on); ticks toggle ──
$('topics').addEventListener('click', (e) => {
  const b = e.target.closest('.answer'); if (!b || !S.spot) return;
  const a = S.spot.answers, id = b.closest('[data-q]').dataset.q, q = qOf('q-' + id), v = b.dataset.v;
  if (q.multi) { const t = new Set(a[id] || []); t.has(v) ? t.delete(v) : t.add(v); a[id] = t.size ? [...t] : undefined; if (a[id] === undefined) delete a[id]; return drawAnswers(); }
  if (moving) return;
  a[id] = v; drawAnswers(); moving = true;
  setTimeout(() => { moving = false; next(); }, 220);
});
function drawAnswers() {
  const sp = S.spot; if (!sp) return;
  const a = sp.answers, was = sp.baseA;
  for (const q of QUESTIONS) {
    if (!shown(q, a)) delete a[q.id];            // a follow-up whose first answer changed
    const v = a[q.id], w = was && was[q.id];
    document.querySelectorAll(`[data-q="${q.id}"] .answer`).forEach(o => {
      const k = o.dataset.v;
      o.setAttribute('aria-checked', q.multi ? !!(v || []).includes(k) : k === v);
      const last = w != null && (q.multi ? w.includes(k) : w === k);
      let tag = o.querySelector('.last');
      if (last && !tag) { tag = document.createElement('span'); tag.className = 'last'; o.querySelector('.tick').before(tag); }
      if (tag) { if (last) tag.textContent = sp.baseTag || 'Last answer'; else tag.remove(); }
    });
  }
  updateNext();
}
function drawQn() {
  const sp = S.spot, qs = qSteps(), n = qs.indexOf(cur), el = document.querySelector(`.step[data-step="${cur}"] [data-qn]`); if (!el) return;
  const p = sp && sp.profile;
  el.textContent = `Question ${n + 1} of ${qs.length}` + (n === 0 && sp && sp.baseA ? (sp.same === 'changed' ? ` · "${sp.baseTag}" is what you said there`
    : ` · "Last answer" is the latest for ${isX() ? 'crossing here' : `this side of ${p && p.name || 'the road'}`}`) : '');
}
// ── a main road's profile (Teja, 17 Nov 2026): a single spot or crossing on a stretch or junction that already has
// answers starts from them; the person changes only what's different. Nothing changed = "still like this". ──
const snapA = (a) => JSON.stringify(Object.keys(a).filter(k => a[k] != null).sort().map(k => [k, a[k]]));
function profileHere() {
  const sp = S.spot;
  if (S.mode === 'walk' || !sp || sp.asked) return;
  sp.asked = true;
  const side = sp.kind === 'crossing' ? '' : sideWord(sp) || '';
  fetch(`${window.CONTRIBUTE.API}/${SURVEY}/near?item=${sp.kind}&lat=${sp.lat.toFixed(6)}&lng=${sp.lng.toFixed(6)}&side=${side}`, { credentials: 'omit', cache: 'no-store' })
    .then(r => r.json()).then(d => {
      if (!d.profile || S.spot !== sp || Object.keys(sp.answers).length) return;   // nothing there, or they've started answering
      sp.answers = Object.fromEntries(Object.entries(d.profile.answers).map(([k, x]) => [k, structuredClone(x.v)]));
      sp.baseA = structuredClone(sp.answers); sp.baseTag = 'Last answer';
      sp.base = snapA(sp.answers); sp.profile = { latest: d.profile.latest, n: d.profile.n, name: d.name };
      if (isQ(cur)) { drawAnswers(); drawQn(); }
    }).catch(() => {});
}
const unchanged = () => S.mode !== 'walk' && !!S.spot && !!S.spot.base && snapA(S.spot.answers) === S.spot.base && !S.spot.photo && !(S.spot.note || $('note').value.trim());

// ── summaries ──
const spotTitle = (s) => { const w = sideWord(s); return [w && `${cap(w)} side of the road`, s.facing && `${S.mode === 'walk' ? 'walking' : 'facing'} ${DIR_NAME[s.facing].toLowerCase()}`].filter(Boolean).join(', ') || 'Side not given'; };
function shortSummary(a) {
  if (a.footpath === 'no') return 'No footpath';
  if (a.footpath !== 'yes') return '';
  const bits = ['Footpath']; if (['partly', 'fully'].includes(a.blocked)) bits.push('blocked'); if (['some', 'badly'].includes(a.damaged)) bits.push('damaged');
  bits.push(({ most: 'shaded', some: 'some shade', none: 'no shade' })[a.shade]);
  return bits.filter(Boolean).join(', ');
}
function crossSummary(a) {
  return [({ junction: 'At a junction', between: 'Between junctions' })[a.x_where], ({ zebra: 'zebra', faded: 'faded stripes', none: 'not marked' })[a.x_marked],
    ({ working: 'signal', broken: 'signal not working', none: 'no signal' })[a.x_signal], ({ usually: 'vehicles usually stop', sometimes: 'vehicles sometimes stop', rarely: 'vehicles rarely stop' })[a.x_stop]].filter(Boolean).join(', ');
}
const itemTitle = (s) => s.kind === 'crossing' ? 'Crossing' : spotTitle(s);
const itemSummary = (s) => (s.kind === 'crossing' ? crossSummary(s.answers) : shortSummary(s.answers)) || 'No answers';
const answerText = (q, v) => v == null ? '–' : q.multi ? v.map(x => optLabel(q, x)).join(', ') : optLabel(q, v);

// ── photo ──
function drawPhoto() {
  const s = S.spot, full = S.mode === 'walk' && !s.photo && S.spots.filter(x => x.photo).length >= MAX_PHOTOS;
  $('photo-btn').style.display = full ? 'none' : ''; $('photo-full').hidden = !full;
  $('photo-prev').style.display = s.photo ? 'block' : 'none'; if (s.photo) $('photo-prev').src = s.photo;
  $('photo-btn').textContent = s.photo ? 'Use a different photo' : 'Take or choose a photo';
  $('photo-info').textContent = s.photo ? 'Photo added.' : 'The phone makes it smaller and removes the location stored in it.';
}
$('note').addEventListener('input', () => { if (S.spot) S.spot.note = $('note').value.trim(); updateNext(); });
$('photo-in').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  $('photo-info').textContent = 'Preparing the photo…';
  try { const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    S.spot.photo = c.toDataURL('image/jpeg', .82); drawPhoto(); } catch { $('photo-info').textContent = "This photo couldn't be read. Try a different one."; }
  e.target.value = ''; updateNext();
});

// ── the player: nickname + 4-digit PIN, the same as for bus stops, checked with the server ──
const cleanNick = (v) => v.trim().replace(/\s+/g, ' ');
const pinOk = (v) => /^\d{4}$/.test(v);
function drawPlay() { const p = player.get(); $('play-box').hidden = !!p; $('play-in').hidden = !p; if (p) $('play-name').textContent = p.nick; }
let pmode = 'create';
function setPMode(m) {
  pmode = m; const c = m === 'create';
  $('p-title').textContent = c ? 'Pick a nickname' : 'Log in';
  $('p-hint').textContent = c ? 'And a 4-digit PIN, so you can log in on any phone. It works for bus stops too.' : 'The nickname and 4-digit PIN you use for bus stops or walking.';
  $('p-go').textContent = c ? 'Join' : 'Log in';
  $('p-switch-text').textContent = c ? 'Have one already?' : 'New here?';
  $('p-switch').textContent = c ? 'Log in' : 'Pick a nickname';
  $('p-msg').hidden = true;
}
$('play-create').onclick = (e) => { e.preventDefault(); setPMode('create'); show('player'); };
$('play-login').onclick = (e) => { e.preventDefault(); setPMode('login'); show('player'); };
$('p-switch').onclick = (e) => { e.preventDefault(); setPMode(pmode === 'create' ? 'login' : 'create'); };
$('play-out').onclick = (e) => { e.preventDefault(); player.clear(); drawPlay(); };
const playerReady = () => { $('p-go').disabled = cleanNick($('p-nick').value).length < 3 || !pinOk($('p-pin').value); };
['p-nick', 'p-pin'].forEach(id => $(id).addEventListener('input', () => { $('p-msg').hidden = true; playerReady(); }));
$('p-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('p-go').disabled) $('p-go').click(); });
$('p-back').onclick = () => $('back').onclick();
$('p-go').onclick = async () => {
  const nick = cleanNick($('p-nick').value), pin = $('p-pin').value;
  const say = (t) => { $('p-msg').textContent = t; $('p-msg').hidden = false; };
  $('p-go').disabled = true; $('p-go').textContent = 'Checking…';
  let name = null;
  try {
    const r = await checkPlayer(nick, pin, pmode);
    const key = pmode === 'login' && r.status === 'wrong' ? 'wrongLogin' : r.status;
    if (PLAYER_SAYS[key]) say(PLAYER_SAYS[key]); else name = r.name || nick;   // free (theirs with the first send) or yours
  } catch (err) {
    say(err.status === 400 ? 'Use 3 to 24 letters, numbers and spaces, and a 4-digit PIN.'
      : err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.'
      : "We couldn't check the nickname; the connection may be weak. Please try again.");
  }
  $('p-go').textContent = pmode === 'create' ? 'Join' : 'Log in'; playerReady();
  if (!name) return;
  player.set(name, pin);
  $('back').onclick();                             // back to where they came from, now signed in
};

// ── check and send: a short summary; the answers themselves open only if asked (Teja, 17 Nov 2026) ──
function placeText(s) { return s.byMap ? (S.memory ? 'From memory' : 'Marked on the map') : s.moved_m > 2 ? `${s.moved_m} m from where you stood` : 'Where you stood'; }
function drawReview() {
  const all = $('all-answers'); all.hidden = true;
  let rows;
  if (S.mode === 'walk') {
    const nx = S.spots.filter(s => s.kind === 'crossing').length, ns = S.spots.length - nx, ph = S.spots.filter(s => s.photo).length;
    rows = [['Walk', `${[ns && `${ns} spot${ns > 1 ? 's' : ''}`, nx && `${nx} crossing${nx > 1 ? 's' : ''}`].filter(Boolean).join(', ') || 'Nothing added yet'}<small>${dist(walked())} walked</small>`, 'all'],
      ['Photos', ph ? String(ph) : 'None', null]];
    all.innerHTML = S.spots.map((s, i) => `<div class="row"><span>${i + 1}. ${s.kind === 'crossing' ? 'Crossing' : 'Spot'}</span><b>${esc(itemSummary(s))}${s.same === true ? ' (same as before)' : ''}${s.photo ? ' · photo' : ''}</b></div>`).join('');
  } else {
    const s = S.spot, n = nAnswered(s.kind, s.answers);
    rows = [[isX() ? 'Crossing' : 'Spot', esc(placeText(s)), first()], ...(isX() ? [] : [['Side', esc(spotTitle(s)), 'dir']]),
      ['Answers', `${n} answer${n === 1 ? '' : 's'}`, 'all'], ['Photo', s.photo ? 'Added' : 'None', 'photo'], ...(s.note ? [['Note', esc(s.note), 'note']] : [])];
    all.innerHTML = qSteps().map(qOf).map(q => `<button type="button" data-q="${q.id}"><span>${esc(q.s)}</span><b>${esc(answerText(q, s.answers[q.id]))}</b></button>`).join('');
    all.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { S.fromReview = true; show('q-' + b.dataset.q); });
  }
  $('review').innerHTML = rows.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd>${s ? `<button type="button" data-go="${s}">${s === 'all' ? 'See' : 'Change'}</button>` : '<span></span>'}</div>`).join('');
  $('review').querySelectorAll('[data-go]').forEach(b => b.onclick = () => b.dataset.go === 'all' ? (all.hidden = !all.hidden) : show(b.dataset.go));
  $('review-hint').hidden = !unchanged();
  $('review-hint').textContent = 'Your answers match the latest ones here.';
  const few = S.mode !== 'walk' && !nAnswered(S.spot.kind, S.spot.answers);
  $('send-msg').hidden = !few;
  if (few) $('send-msg').textContent = 'Answer at least one question before sending ("Don\'t know" doesn\'t count). Tap "See" to change answers.';
  $('review-fine').lastChild.textContent = '), without photos. No names, no email, no IP addresses.' + (S.mode === 'walk' ? ' We keep the spots, not your route.' : '');
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
      note: s.note || null, photo: s.photo || null, prefilled: !!s.base || null })) };
}
const spam = Contribute.spamCheck($('ts-review'));
async function postIt(body, sc = spam) {
  const token = await sc.token();
  if (token === null) { const e = new Error('spam check'); e.server = true; e.status = 403; throw e; }
  try { return await Contribute.post(`/${SURVEY}/reports`, { ...body, token, website: $('trap').value }); }
  finally { sc.reset(); }
}
function thanks(body, ids) {
  const items = body.items, photos = items.filter(s => s.photo).length, nx = items.filter(s => s.item === 'crossing').length, ns = items.length - nx;
  const total = ns * POINTS.spot + nx * POINTS.crossing + photos * POINTS.photo;
  $('thanks-text').textContent = 'Your answers are now public.' + (body.nick ? ` ${total} points to ${body.nick} on the leaderboard.` : '');
  $('to-map').href = ids && ids[0] ? 'map/?r=' + encodeURIComponent(ids[0]) : 'map/';
  $('again').textContent = body.mode === 'walk' ? 'Another walk' : body.mode === 'crossing' ? 'Another crossing' : 'Another spot';
  if (watch != null) { navigator.geolocation.clearWatch(watch); watch = null; }
  DONE = true; stack = []; show('thanks', false);
}
let sending = false;
// nothing changed from the profile: a "still like this" check on its latest contribution, not a new one
async function confirmSame() {
  sending = true; $('send-msg').hidden = true; updateNext(); $('next').textContent = 'Sending…';
  try {
    const token = await spam.token();
    if (token === null) throw Object.assign(new Error('spam check'), { server: true, status: 403 });
    const p = player.get(), nk = p && !S.noNick;
    let r;
    try { r = await Contribute.post(`/${SURVEY}/reports/${S.spot.profile.latest}/feedback`, { kind: 'confirm', note: null, device: Contribute.device(),
      nick: nk ? p.nick : null, nick_pin: nk ? p.pin : null, token, website: $('trap').value }); } finally { spam.reset(); }
    sending = false;
    $('thanks-text').textContent = !r.accepted ? 'You had already confirmed this from this phone, so nothing new was added.'
      : "You've confirmed nothing has changed." + (nk ? ` ${POINTS.confirm} points to ${p.nick} on the leaderboard.` : '');
    $('to-map').href = 'map/?r=' + encodeURIComponent(S.spot.profile.latest);
    $('again').textContent = isX() ? 'Another crossing' : 'Another spot';
    DONE = true; stack = []; show('thanks', false);
  } catch (err) {
    sending = false; updateNext(); $('next').textContent = 'Try again';
    $('send-msg').textContent = err.status === 403 ? 'The spam check did not finish. Please press Try again.' : err.status === 429 ? 'Too many sends from this connection just now. Please wait a minute.'
      : err.server ? `The server could not accept this (${err.message}).` : "We couldn't send this; the signal may be weak.";
    $('send-msg').hidden = false;
  }
}
async function send() {
  if (sending || !ready()) return;
  if (unchanged()) return confirmSame();
  const body = payload(), saved = { body, at: Date.now(), n: body.items.length };
  const kept = store.set(saved) || store.set({ ...saved, body: { ...body, items: body.items.map(i => ({ ...i, photo: null })) }, photoDropped: true });
  sending = true; $('send-msg').hidden = true; updateNext(); $('next').textContent = 'Sending…';
  try { const r = await postIt(body); store.drop(kept); sending = false; thanks(body, r.ids); }
  catch (err) {
    sending = false; updateNext(); $('next').textContent = 'Try again';
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
    try { const r = await postIt(d.body, draftSpam); store.drop(d.id); $('draft').hidden = true; thanks(d.body, r.ids); }
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

// ── first screen: who is logged in, links that open the nickname screen, counts ──
drawPlay();
const openPlay = { '#play': 'create', '#create': 'create', '#login': 'login' }[location.hash];
if (openPlay && !player.get()) { setPMode(openPlay); show('player'); }
loadReports().then(rows => {
  const c = contributions(rows), xs = rows.filter(r => r.item === 'crossing').length, ws = c.filter(x => x.kind === 'walk').length;
  const many = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
  if (rows.length) $('meta').textContent = 'So far: ' + [many(rows.length - xs, 'spot'), many(xs, 'crossing'), many(ws, 'walk')].join(', ');
}).catch(() => {});
if (LOCAL) window.__test = { S, show, placeSpot, setRoad, flow, maps: () => ({ wmap, kmap }) };
