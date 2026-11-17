// Tell us about a bus stop, at the stop (Teja, 16 Nov 2026): the phone's location lists the nearest stops (or a
// missing one is added within 100 m of it), then the topic screens, optional photo and improvement, check and send.
// Phones only; a laptop sees a QR code. Talks to contribute-api.
import { mapMark } from '../assets/map-mark.js?v=20261117h';
import { SURVEY, TOPICS, QUESTIONS, MIN_ANSWERS, optLabel, shown, answered, POINTS, loadStops, loadRatings, addedStops,
  byStop, latest, ANSWER_KEYS, metres, stopLabel, esc, player, checkPlayer, PLAYER_SAYS } from './questions.js?v=20261117h';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const inHmda = (lng, lat) => lng >= C.HMDA[0] && lng <= C.HMDA[2] && lat >= C.HMDA[1] && lat <= C.HMDA[3];
const NEAR_M = 500, MAX_MOVE = 100;   // the chosen stop within 500 m of the phone; a new stop's pin within 100 m of it
const far = (d) => d < 1000 ? `${Math.round(d / 10) * 10} m` : `${(d / 1000).toFixed(1)} km`;
Contribute.phoneOnly({ what: 'Bus stops', mapHref: 'map/', mapLabel: 'See the stops map' });

// ── one screen per question (Teja, 17 Nov 2026): tap an answer and the next question comes; ticks have Next ──
$('topics').innerHTML = QUESTIONS.map(q => `<section class="step" data-step="q-${q.id}">
  <p class="qtopic" data-qn></p>
  <h2 class="qt" id="h-${q.id}">${esc(q.q)}</h2>${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ''}
  <div class="answers" data-q="${q.id}" role="${q.multi ? 'group' : 'radiogroup'}" aria-labelledby="h-${q.id}">
    ${q.opts.map(([v, l]) => `<button type="button" class="answer${q.multi ? ' check' : ''}" role="${q.multi ? 'checkbox' : 'radio'}" aria-checked="false" data-v="${v}"><span>${esc(l)}</span><i class="tick"></i></button>`).join('')}
  </div>
  ${q.multi ? '' : ''}<p class="msg" data-few hidden></p>
</section>`).join('');

const S = { here: null, stop: null, missing: null, a: {}, photo: null, how: null };
let STOPS = [], BY_ID = new Map(), RATED = new Map(), cur = 'start';
const PRESET = new URLSearchParams(location.search).get('stop');

// ── steps ──
function steps() {
  const l = ['start', 'here'];
  if (S.here === 'no' || S.here === 'known') l.push('nothere');
  if (S.here === 'no') return l;
  if (S.here === 'yes' || S.here === 'known') {    // at the stop: the phone's location first, or the map if it fails;
    const mem = S.here === 'known';                 // from memory: the map only (a stop's own page: that stop)
    const loc = mem ? (S.preset ? [] : ['mark']) : S.viaMap ? ['locate', 'mark'] : ['locate'], chk = S.viaMap ? [] : ['where'];
    if (S.preset) l.push(...loc, ...chk);
    else if (S.how === 'missing') l.push(...loc, 'missing');
    else l.push(...loc, 'nearest', ...chk);
  }
  for (const q of QUESTIONS) if (shown(q, S.a)) l.push('q-' + q.id);
  l.push('photo', 'improve', 'review', 'thanks');   // contributors log in on the first screen only (Teja, 15 Nov 2026)
  return l;
}
const filled = (id) => $(id).value.trim().length >= 2;
function ready(s) {
  if (s === 'nearest') return !!S.stop;
  if (s === 'mark') return !!S.markAt;
  if (s === 'missing') return !!(S.missing && filled('m-name'));
  if (s === 'where') return !!S.where && (S.where !== 'marked' || !!S.whereAt);   // marking needs the map
  if (s === 'player') return true;
  if (s === 'review') return !sending && answered(S.a) >= MIN_ANSWERS;
  return true;
}
const isQ = (s) => s.startsWith('q-');
const qOf = (s) => QUESTIONS.find(q => 'q-' + q.id === s);
// a stop that already has a profile (Teja, 17 Nov 2026): its latest answer to each question starts the form, so the
// first person builds the profile and later ones change only what's different. Nothing changed = "still the same".
const snap = (a) => JSON.stringify(ANSWER_KEYS.filter(k => a[k] != null).map(k => [k, a[k]]));
function prefill() {
  if (S.missing || !S.stop || S.prefillFor === S.stop.id) return;
  S.prefillFor = S.stop.id;
  const list = RATED.get(S.stop.id) || [];
  if (!list.length) { S.base = null; S.baseA = null; return; }
  const a = latest(list).answers;
  S.a = Object.fromEntries(QUESTIONS.filter(q => a[q.id] != null).map(q => [q.id, structuredClone(a[q.id])]));
  S.baseA = structuredClone(S.a);                // shown as "Last answer" on each question
  S.base = snap(S.a); S.baseId = list[0].id; S.baseN = list.length;
  drawAnswers();
}
const unchanged = () => !!S.base && !S.missing && snap(S.a) === S.base && !S.photo && !$('improve').value.trim();
var DONE = false, lastList = [];                 // DONE: sent, so Back can't offer Send again
function show(s, push = true) {
  if (DONE && s !== 'thanks') s = 'thanks';
  cur = s; lastList = steps();
  document.querySelectorAll('.step').forEach(x => x.classList.toggle('on', x.dataset.step === s));
  const inQ = !['start', 'thanks', 'player'].includes(s);
  document.body.classList.toggle('q-mode', inQ);
  const l = steps().filter(x => !['start', 'here', 'nothere', 'thanks'].includes(x)), i = l.indexOf(s);
  $('progress').hidden = !inQ;
  $('bar').style.width = `${i < 0 ? 0 : (i + 1) / l.length * 100}%`;
  $('nav').hidden = !inQ;
  if (isQ(s)) {
    prefill();
    const q = qOf(s), qs = QUESTIONS.filter(x => shown(x, S.a)), n = qs.indexOf(q);
    $('count').textContent = q.topicTitle.replace(' and seating', '').replace('Comfort and ', '');
    document.querySelector(`.step[data-step="${s}"] [data-qn]`).textContent = `Question ${n + 1} of ${qs.length}` + (n === 0 && S.base ? ` · "Last answer" is this stop's latest` : '');
    drawAnswers();
  } else $('count').textContent = '';
  if (s === 'review') drawReview();
  if (s === 'missing') openMap();
  if (s === 'where') openWhereMap();
  if (s === 'mark') { marker.open(); $('mark-hint').textContent = S.here === 'known' ? 'Put the pin exactly on the stop. Dots are bus stops: tap one.' : 'Move the map so the pin is on your stop. Dots are bus stops: tap one.'; }
  if (s === 'start') drawPlay();
  if (s === 'player') { S.noNick = false; const p = player.get(); $('p-nick').value = p ? p.nick : $('p-nick').value; $('p-pin').value = ''; $('p-msg').hidden = true; playerReady(); }
  updateNext();
  if (push) history.pushState({ s }, '', location.search + '#' + s);
  window.scrollTo({ top: 0 });
  const h = document.querySelector(`.step[data-step="${s}"] .qt, .step[data-step="${s}"] h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
// screens where a tap moves on have no Next button: one-answer questions, and picking a stop
const TAP_ON = ['here', 'nothere', 'locate', 'nearest'];
function updateNext() {
  const n = $('next'); n.disabled = !ready(cur);
  n.hidden = TAP_ON.includes(cur) || (isQ(cur) && !qOf(cur).multi) || (cur === 'where' && S.where !== 'marked');
  if (cur === 'review' && sending) return;
  const optional = { photo: !S.photo, improve: !$('improve').value.trim() };
  n.textContent = cur === 'review' ? (unchanged() ? 'Confirm nothing has changed' : 'Send') : optional[cur] ? 'Skip' : 'Next';
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
$('next').onclick = async () => {
  if (cur === 'review') return send();
  if (cur === 'mark') return fromPlace(S.markAt.lat, S.markAt.lng, null);
  next();
};
// after a question: the next one, or back to the check screen when the person came from there to change one
function next() { if (S.fromReview && isQ(cur)) { S.fromReview = false; return show('review'); } go(1); }
$('start-go').onclick = () => show('here');
$('exit').onclick = () => show('start');
$('back').onclick = () => history.back();
window.addEventListener('popstate', (e) => show(e.state?.s || 'start', false));

// first question
document.querySelector('[data-field="here"]').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b) return;
  b.parentElement.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  S.here = b.dataset.val;                         // "no": from memory, if they know a stop well
  if (S.here === 'yes') { S.viaMap = false; if (!S.preset) { S.how = 'gps'; S.stop = null; S.missing = null; } }
  setTimeout(() => go(1), 220);
});

// answers: one tap chooses and moves on (tapping the chosen one again also moves on); ticks toggle, "None of these"
// clears the others
let moving = false;
$('topics').addEventListener('click', (e) => {
  const b = e.target.closest('.answer'); if (!b) return;
  const id = b.closest('[data-q]').dataset.q, q = QUESTIONS.find(x => x.id === id), v = b.dataset.v;
  if (q.multi) {
    let t = new Set(S.a[id] || []);
    if (t.has(v)) t.delete(v); else { if (v === 'none') t = new Set(); else t.delete('none'); t.add(v); }
    S.a[id] = t.size ? [...t] : undefined;
    if (S.a[id] === undefined) delete S.a[id];
    return drawAnswers();
  }
  if (moving) return;                             // a second tap while the next question is coming
  S.a[id] = v; drawAnswers(); moving = true;
  setTimeout(() => { moving = false; next(); }, 220);
});
function drawAnswers() {
  for (const q of QUESTIONS) {
    if (!shown(q, S.a)) delete S.a[q.id];        // a follow-up whose first answer changed
    const v = S.a[q.id], was = S.baseA && S.baseA[q.id];
    document.querySelectorAll(`[data-q="${q.id}"] .answer`).forEach(o => {
      const k = o.dataset.v;
      o.setAttribute('aria-checked', q.multi ? !!(v || []).includes(k) : k === v);
      const last = was != null && (q.multi ? was.includes(k) : was === k);
      let tag = o.querySelector('.last');
      if (last && !tag) { tag = document.createElement('span'); tag.className = 'last'; tag.textContent = 'Last answer'; o.querySelector('.tick').before(tag); }
      if (!last && tag) tag.remove();
    });
  }
  updateNext();
}

function routeText(s) {
  if (!s.nRoutes) return 'A stop someone added';
  return `Buses ${s.routes.slice(0, 3).join(', ')}${s.nRoutes > 3 ? ` and ${s.nRoutes - 3} more` : ''}`;
}
const stopButton = (s, d) => `<button type="button" class="answer" role="radio" aria-checked="${!!(S.stop && S.stop.id === s.id)}" data-id="${esc(s.id)}"><span>${esc(s.name)}<small>${s.towards ? 'towards ' + esc(s.towards) : esc(routeText(s))}${RATED.has(s.id) ? ' · has details' : ''}</small></span>${d != null ? `<span class="dist">${d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km'}</span>` : '<i class="tick"></i>'}</button>`;
function pickFrom(listEl) {
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    S.how = 'gps';                                 // back from "my stop isn't listed": a listed stop again
    const st = BY_ID.get(b.dataset.id), d = metres(S.phone, st);
    if (d > NEAR_M) { $('near-msg').textContent = `${st.name} is about ${far(d)} from ${S.viaMap ? 'the pin' : 'you'}. ${S.here === 'known' || S.viaMap ? 'Pick the stop under the pin' : 'Pick the stop you are standing at'}, or add it if it isn't listed.`; $('near-msg').hidden = false; return; }
    listEl.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
    if (S.stop !== st) { S.where = null; S.whereAt = null; }
    S.stop = st; S.missing = null; updateNext();
    setTimeout(() => go(1), 220);
  });
}
pickFrom($('near-list'));

// ── location: lists the nearest stops and checks you are at the stop; the location itself is never sent ──
$('gps-go').onclick = () => {
  if (!('geolocation' in navigator)) return gpsFailed('This browser cannot share a location.');
  $('gps-go').textContent = 'Waiting for your phone…'; $('gps-go').disabled = true; $('gps-msg').hidden = true;
  navigator.geolocation.getCurrentPosition(onFix, (err) => gpsFailed(err.code === 1
      ? "Your phone didn't share its location. Allow location for this page in your browser's settings and try again, or find the stop on the map."
      : "We couldn't get a location from your phone. Try again in a moment, ideally in the open, or find the stop on the map."),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
};
function onFix(p) {
  const { latitude: lat, longitude: lng, accuracy: acc } = p.coords;
  $('gps-go').textContent = 'Share my location'; $('gps-go').disabled = false;
  S.viaMap = false; fromPlace(lat, lng, acc);
}
// the stops near the phone's location, or near the pin in the middle of the map when the location failed
function fromPlace(lat, lng, acc) {
  const fail = (t) => { if (!S.viaMap) return gpsFailed(t); $('mark-msg').textContent = t; $('mark-msg').hidden = false; };
  if (!inHmda(lng, lat)) return fail('Your phone places you outside the Hyderabad area (HMDA). This survey is for bus stops in Hyderabad.');
  if (!STOPS.length) { loadAll().then(() => STOPS.length ? fromPlace(lat, lng, acc) : fail('The list of bus stops could not load. Check your connection and try again.')); return; }
  S.phone = { lat, lng, acc };
  if (S.preset) {                                  // from a stop's page: only at that stop
    const d = metres(S.phone, S.stop);
    if (d > NEAR_M) return fail(S.viaMap ? `The pin is about ${far(d)} from ${S.stop.name}. Move the map to the stop.` : `You are about ${far(d)} from ${S.stop.name}. Details are added at the stop itself: come back when you are there.`);
    return go(1);
  }
  const near = STOPS.map(s => [s, metres({ lat, lng }, s)]).sort((a, b) => a[1] - b[1]).slice(0, 4);
  $('near-list').innerHTML = near.map(([s, d]) => stopButton(s, d)).join('');
  $('near-msg').hidden = near[0][1] < 400;
  $('near-msg').textContent = `The nearest stop we know is ${Math.round(near[0][1])} m away${acc > 100 ? ", and your phone's location is rough" : ''}. It may be missing: add it.`;
  $('near-q').textContent = S.here === 'known' ? 'Which stop is it?' : 'Which stop are you at?';
  $('near-hint').textContent = 'Each side of the road is a separate stop.';
  $('miss-dot').textContent = S.viaMap ? 'The dot is where you put the pin. Drag it to where buses stop.' : 'The dot is you. Drag it to where buses stop.';
  S.stop = null; go(1);
}
function gpsFailed(t) { $('gps-go').textContent = 'Try again'; $('gps-go').disabled = false; $('gps-msg').textContent = t; $('gps-msg').hidden = false; }
// the phone's location failed: find the stop with the pin in the middle of a map (Teja, 16 Nov 2026)
const marker = mapMark($('markbox'), { onChange: ({ lat, lng, ok }) => { S.markAt = ok ? { lat, lng } : null; $('mark-msg').hidden = true; updateNext(); },
  points: () => ({ type: 'FeatureCollection', features: STOPS.map(s => ({ type: 'Feature', properties: { has: RATED.has(s.id) ? 1 : 0 },
    geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) }) });
$('to-mark').onclick = (e) => { e.preventDefault(); S.viaMap = true; S.markAt = null; show('mark'); };
// not there now, but knows the stop well: from memory, on the map (Teja, 16 Nov 2026); marked "memory" in the data
$('from-memory').onclick = () => {
  S.here = 'known'; S.viaMap = true; S.markAt = null;
  document.querySelectorAll('[data-field="here"] [role=radio]').forEach(x => x.setAttribute('aria-checked', x.dataset.val === 'no'));
  if (S.preset) S.phone = { lat: S.stop.lat, lng: S.stop.lng, acc: null };   // a stop's own page: that stop
  else { S.how = 'gps'; S.stop = null; S.missing = null; }
  go(1);
};
document.querySelectorAll('.to-missing').forEach(a => a.onclick = (e) => { e.preventDefault(); S.how = 'missing'; S.stop = null; show('missing'); });

// ── at the stop: is it where the bus data puts it? (only the phone's location if they say "where I am") ──
let whereMap = null, stopDot = null, meDot = null;
async function openWhereMap() {
  const s = S.stop, me = S.phone; if (!s || !me) return;
  const d = Math.round(metres(me, s));
  const distTxt = d < 15 ? 'The map puts the stop right where you are.' : `The map puts it about ${d < 1000 ? Math.round(d / 5) * 5 + ' m' : (d / 1000).toFixed(1) + ' km'} from you.`;
  $('where-hint').textContent = S.where === 'marked' ? 'Drag the black dot to where the stop really is, then press Next.' : `Black: the stop. Blue: you. ${distTxt}`;
  try { await loadMapLib(); } catch { $('where-hint').textContent += " (The map couldn't load.)"; return; }
  const fit = () => { const b = new maplibregl.LngLatBounds([s.lng, s.lat], [s.lng, s.lat]).extend([me.lng, me.lat]); whereMap.fitBounds(b, { padding: 60, maxZoom: 18, duration: 0 }); };
  if (!whereMap) {
    whereMap = new maplibregl.Map({ container: 'wheremap', style: 'https://tiles.openfreemap.org/styles/positron', center: [s.lng, s.lat], zoom: 17, minZoom: 12, maxZoom: 19, attributionControl: { compact: true } });
    whereMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const a = document.createElement('div'); a.className = 'stop-dot'; stopDot = new maplibregl.Marker({ element: a, draggable: false }).setLngLat([s.lng, s.lat]).addTo(whereMap);
    stopDot.on('dragend', () => { const q = stopDot.getLngLat(); S.whereAt = { lat: q.lat, lng: q.lng }; });
    const m = document.createElement('div'); m.className = 'me-dot'; meDot = new maplibregl.Marker({ element: m }).setLngLat([me.lng, me.lat]).addTo(whereMap);
    whereMap.on('load', () => document.querySelectorAll('#wheremap .maplibregl-compact-show').forEach(x => x.classList.remove('maplibregl-compact-show')));
  } else { whereMap.resize(); meDot.setLngLat([me.lng, me.lat]); if (S.where !== 'marked') stopDot.setLngLat([s.lng, s.lat]); }
  fit(); setDraggable(S.where === 'marked');
  $('where-opts').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x.dataset.val === S.where));
}
function setDraggable(on) { if (!stopDot) return; stopDot.setDraggable(on); stopDot.getElement().classList.toggle('drag', on); }
$('where-opts').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b) return;
  $('where-opts').querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  S.where = b.dataset.val;
  const marking = S.where === 'marked';
  setDraggable(marking);
  if (!marking && stopDot) { stopDot.setLngLat([S.stop.lng, S.stop.lat]); S.whereAt = null; }
  if (marking && stopDot && !S.whereAt) { const q = stopDot.getLngLat(); S.whereAt = { lat: q.lat, lng: q.lng }; }
  if (marking) $('where-hint').textContent = 'Drag the black dot to where the stop really is, then press Next.';
  updateNext();
  if (!marking) setTimeout(() => go(1), 220);
});

// ── missing stop: a pin that starts where you are and moves up to 100 m; known stops as grey dots ──
let map = null, pin = null;
function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((ok, fail) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; js.onload = ok; js.onerror = fail; document.head.append(js);
  });
}
async function openMap() {
  try { await loadMapLib(); } catch { $('pin-msg').textContent = "The map couldn't load. Check your connection and try again."; $('pin-msg').hidden = false; return; }
  const me = S.phone;
  if (map) {                                       // a new place since last time: start the pin there again
    map.resize();
    if (!S.missing || metres(me, S.missing) > MAX_MOVE) { S.missing = null; map.jumpTo({ center: [me.lng, me.lat], zoom: 18 }); placePin(me.lng, me.lat); }
    return;
  }
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [me.lng, me.lat], zoom: 18, minZoom: 12, maxZoom: 19,
    maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
    map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: STOPS.map(s => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) } });
    map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 5], 'circle-color': '#9CA3AF', 'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0, 16, 1] } });
  });
  map.on('click', (e) => placePin(e.lngLat.lng, e.lngLat.lat));
  placePin(me.lng, me.lat);
}
function placePin(lng, lat) {
  const moved = metres(S.phone, { lat, lng });
  if (moved > MAX_MOVE || !inHmda(lng, lat)) {
    if (pin && S.missing) pin.setLngLat([S.missing.lng, S.missing.lat]);
    $('pin-msg').textContent = S.viaMap ? `It can be up to ${MAX_MOVE} m from the place you marked. Go back and move the map closer.` : `It can be up to ${MAX_MOVE} m from where you are. Walk closer, if it's safe, and start again.`; $('pin-msg').hidden = false; return;
  }
  $('pin-msg').hidden = true;
  if (!pin) { const el = document.createElement('div'); el.className = 'pin';
    pin = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(map);
    pin.on('dragend', () => { const q = pin.getLngLat(); placePin(q.lng, q.lat); }); } else pin.setLngLat([lng, lat]);
  S.missing = { lat, lng, moved: Math.round(moved) }; $('map-hint').classList.add('off');
  const [n, d] = STOPS.map(s => [s, metres({ lat, lng }, s)]).sort((a, b) => a[1] - b[1])[0];
  $('pin-info').hidden = d >= 60;
  $('pin-info').textContent = `${stopLabel(n)} is only ${Math.round(d)} m away. If that's the same stop, go back and pick it instead.`;
  updateNext();
}
['m-name', 'm-towards', 'improve'].forEach(id => $(id).addEventListener('input', updateNext));

// ── photo: made smaller on the phone; the server re-encodes it again and drops all hidden data ──
$('photo-in').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const info = $('photo-info'); info.hidden = false; info.textContent = 'Preparing the photo…';
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    S.photo = c.toDataURL('image/jpeg', .82); $('photo-prev').src = S.photo; $('photo-prev').style.display = 'block';
    info.textContent = 'Photo added.'; $('photo-btn').textContent = 'Use a different photo';
  } catch { S.photo = null; info.textContent = "This photo couldn't be read. Try a different one."; }
  updateNext();
});

// ── the player: nickname + 4-digit PIN, checked with the server (a new nickname becomes theirs with the first rating) ──
const cleanNick = (v) => v.trim().replace(/\s+/g, ' ');
const pinOk = (v) => /^\d{4}$/.test(v);
function drawPlay() {
  const p = player.get();
  $('play-box').hidden = !!p; $('play-in').hidden = !p;
  if (p) $('play-name').textContent = p.nick;
}
// one screen for both: Create a player (the nickname must be free) or Log in (an existing player, on any phone)
let mode = 'create';
function setMode(m) {
  mode = m;
  const c = m === 'create';
  $('p-title').textContent = c ? 'Pick a nickname' : 'Log in';
  $('p-hint').textContent = c ? 'And a 4-digit PIN, so you can log in on any phone.' : 'The nickname and 4-digit PIN you picked before.';
  $('p-go').textContent = c ? 'Join' : 'Log in';
  $('p-switch-text').textContent = c ? 'Have one already?' : 'New here?';
  $('p-switch').textContent = c ? 'Log in' : 'Pick a nickname';
  $('p-msg').hidden = true;
}
$('play-create').onclick = (e) => { e.preventDefault(); setMode('create'); show('player'); };
$('play-login').onclick = (e) => { e.preventDefault(); setMode('login'); show('player'); };
$('p-switch').onclick = (e) => { e.preventDefault(); setMode(mode === 'create' ? 'login' : 'create'); };
$('play-out').onclick = (e) => { e.preventDefault(); player.clear(); drawPlay(); };
const playerReady = () => { $('p-go').disabled = cleanNick($('p-nick').value).length < 3 || !pinOk($('p-pin').value); };
['p-nick', 'p-pin'].forEach(id => $(id).addEventListener('input', () => { $('p-msg').hidden = true; playerReady(); }));
$('p-pin').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('p-go').disabled) $('p-go').click(); });
$('p-back').onclick = () => history.back();
async function check(n, pin, say, m) {
  try {
    const r = await checkPlayer(n, pin, m);
    const key = m === 'login' && r.status === 'wrong' ? 'wrongLogin' : r.status;
    if (PLAYER_SAYS[key]) { say(PLAYER_SAYS[key]); return null; }
    return r.name || n;                            // free (theirs with the first rating) or yours, as first written
  } catch (err) {
    say(err.status === 400 ? 'Use 3 to 24 letters, numbers and spaces, and a 4-digit PIN.'
      : err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.'
      : "We couldn't check the nickname; the connection may be weak. Please try again.");
    return null;
  }
}
$('p-go').onclick = async () => {
  const n = cleanNick($('p-nick').value), pin = $('p-pin').value;
  const say = (t) => { $('p-msg').textContent = t; $('p-msg').hidden = false; };
  $('p-go').disabled = true; $('p-go').textContent = 'Checking…';
  const st = await check(n, pin, say, mode);
  $('p-go').textContent = mode === 'create' ? 'Join' : 'Log in'; playerReady();
  if (!st) return;
  player.set(st, pin);
  history.back();                                  // back to where they came from, now signed in
};


// ── review ──
function topicSummary(t) {
  const parts = t.qs.filter(q => shown(q, S.a) && S.a[q.id] != null).map(q => `${q.s}: ${q.multi ? S.a[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, S.a[q.id])}`);
  return parts.length ? `<span class="lines">${parts.map(esc).join('<br>')}</span>` : 'Skipped';
}
let lastRows = [];
function drawReview() {
  const stopTxt = S.missing ? `${esc($('m-name').value.trim())}<small>${$('m-towards').value.trim() ? 'towards ' + esc($('m-towards').value.trim()) + ' · ' : ''}A new stop, marked on the map</small>`
    : `${esc(S.stop.name)}<small>${S.stop.towards ? 'towards ' + esc(S.stop.towards) : ''}</small>`;   // kept for an unsent entry's summary
  const placeTxt = { yes: 'Where the map shows it', here: 'Where I am (your location is saved for the stop)', marked: 'Where I marked it', dk: 'Not sure' }[S.where];
  const rows = [['Stop', stopTxt, S.preset ? null : S.missing ? 'missing' : 'nearest'],
    ...(S.where && !S.missing && !S.viaMap ? [['Stop place', esc(placeTxt), 'where']] : []),
    ...TOPICS.map(t => [t.title.replace(' and seating', '').replace('Comfort and safety', 'Safety'), topicSummary(t), 't-' + t.id]),
    ['Photo', S.photo ? 'Added' : 'None', 'photo'], ['Improve', esc($('improve').value.trim() || 'None'), 'improve'],
    ['Points', esc(who().nick ? 'For ' + who().nick : 'None: you are not logged in'), 'player']];
  lastRows = rows.map(([k, v]) => [k, v.replace(/<br>|<small>/g, ' · ').replace(/<[^>]+>/g, '')]);
  // on screen: a short summary; the answers themselves open only if asked (Teja, 17 Nov 2026)
  const n = answered(S.a), stopName = S.missing ? $('m-name').value.trim() : S.stop.name;
  const short = [['Stop', `${esc(stopName)}<small>${S.missing ? 'A new stop' : S.here === 'known' ? 'From memory' : S.stop.towards ? 'towards ' + esc(S.stop.towards) : ''}</small>`, S.preset ? null : S.missing ? 'missing' : 'nearest'],
    ['Answers', `${n} answer${n === 1 ? '' : 's'}`, 'all'], ['Photo', S.photo ? 'Added' : 'None', 'photo'],
    ...($('improve').value.trim() ? [['Improve', esc($('improve').value.trim()), 'improve']] : [])];
  $('review').innerHTML = short.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd>${s ? `<button type="button" data-go="${s}">${s === 'all' ? 'See' : 'Change'}</button>` : '<span></span>'}</div>`).join('');
  $('review').querySelectorAll('[data-go]').forEach(b => b.onclick = () => b.dataset.go === 'all' ? ($('all-answers').hidden = !$('all-answers').hidden) : show(b.dataset.go));
  $('all-answers').innerHTML = QUESTIONS.filter(q => shown(q, S.a)).map(q => { const v = S.a[q.id];
    return `<button type="button" data-q="${q.id}"><span>${esc(q.s)}</span><b>${v == null ? '–' : esc(q.multi ? v.map(x => optLabel(q, x)).join(', ') : optLabel(q, v))}</b></button>`; }).join('');
  $('all-answers').querySelectorAll('[data-q]').forEach(b => b.onclick = () => { S.fromReview = true; show('q-' + b.dataset.q); });
  $('review-hint').hidden = !unchanged();
  $('review-hint').textContent = "Your answers match what's already there.";
  const few = n < MIN_ANSWERS;
  $('send-msg').hidden = !few;
  if (few) $('send-msg').textContent = `Answer at least ${MIN_ANSWERS} questions before sending ("Don't know" doesn't count). Tap "See" to change answers.`;
}

// ── send; if it fails the answers stay on this phone ──
const DRAFT = 'obs-bus-unsent';
const store = Contribute.drafts(DRAFT);          // several can wait; each is sent or discarded on its own
let sending = false;
// the logged-in player (from the first screen), if any
function who() {
  const p = S.noNick ? null : player.get();
  return p ? { nick: p.nick, pin: p.pin } : { nick: null, pin: null };
}
function payload() {
  const b = { observed_at: S.seenAt || (S.seenAt = new Date().toISOString()), here: S.here, place_type: S.missing ? 'missing' : S.viaMap ? 'map' : 'gps', located: S.viaMap ? 'map' : 'phone',
    ...Object.fromEntries(QUESTIONS.filter(q => shown(q, S.a) && S.a[q.id] != null).map(q => [q.id, S.a[q.id]])),
    improve: $('improve').value.trim() || null, prefilled: !!S.base && !S.missing, nick: who().nick, nick_pin: who().pin, photo: S.photo || null };
  if (S.missing) Object.assign(b, { lat: S.missing.lat, lng: S.missing.lng, moved_m: S.missing.moved, stop_name: $('m-name').value.trim(), towards: $('m-towards').value.trim() || null });
  else Object.assign(b, { stop_id: S.stop.id,    // the server takes the stop's place from TGSRTC's list, not from the phone
    dist_m: Math.round(metres(S.phone, S.stop)) }); // how far the phone was from it: the server checks you were at the stop
  if (!S.missing && S.where && !S.viaMap) {
    b.stop_place = S.where;                  // is the stop where the bus data puts it? a corrected place only if they gave one
    const at = S.where === 'here' ? S.phone : S.where === 'marked' ? S.whereAt : null;
    if (at) Object.assign(b, { stop_lat: +at.lat.toFixed(6), stop_lng: +at.lng.toFixed(6) });
  }
  return b;
}
const spam = Contribute.spamCheck($('ts-review'));
async function postRating(body, sc = spam) {
  const token = await sc.token();
  if (token === null) { const e = new Error('spam check'); e.server = true; e.status = 403; throw e; }
  try { return await Contribute.post(`/${SURVEY}/reports`, { ...body, token, website: $('trap').value }); }
  finally { sc.reset(); }
}
function points(body) {
  const got = [['Telling us about a stop', POINTS.rating]];
  if (body.place_type === 'missing') got.push(['Adding a missing stop', POINTS.missing]);
  else if (!(RATED.get(body.stop_id) || []).length) got.push(['First details for this stop', POINTS.first]);
  if (body.photo) got.push(['Adding a photo', POINTS.photo]);
  return got;
}
function thanks(body, id) {
  const total = points(body).reduce((a, b) => a + b[1], 0);
  $('thanks-text').textContent = 'Your answers are now public.' + (body.nick ? ` ${total} points to ${body.nick} on the leaderboard.` : '');
  if (body.nick) player.set(body.nick, body.nick_pin);   // signed in for next time
  $('to-stop').href = 'stop/?id=' + encodeURIComponent(body.place_type === 'missing' ? 'new-' + id : body.stop_id);
  DONE = true; show('thanks');
}
// nothing changed: a "still the same" check on the latest contribution instead of a new one
async function confirmSame() {
  sending = true; $('send-msg').hidden = true; updateNext(); $('next').textContent = 'Sending…';
  try {
    const token = await spam.token();
    if (token === null) throw Object.assign(new Error('spam check'), { server: true, status: 403 });
    let r;
    try { r = await Contribute.post(`/${SURVEY}/reports/${S.baseId}/feedback`, { kind: 'confirm', note: null, device: Contribute.device(),
      nick: who().nick, nick_pin: who().pin, token, website: $('trap').value }); } finally { spam.reset(); }
    sending = false;
    $('thanks-text').textContent = !r.accepted ? 'You had already confirmed this stop from this phone, so nothing new was added.'
      : "You've confirmed nothing has changed." + (who().nick ? ` ${POINTS.confirm} points to ${who().nick} on the leaderboard.` : '');
    $('to-stop').href = 'stop/?id=' + encodeURIComponent(S.stop.id);
    DONE = true; show('thanks');
  } catch (err) {
    sending = false; updateNext(); $('next').textContent = 'Try again';
    $('send-msg').textContent = err.status === 403 ? 'The spam check did not finish. Please press Try again.' : err.status === 429 ? 'Too many sends from this connection just now. Please wait a minute.'
      : err.server ? `The server could not accept this (${err.message}).` : "We couldn't send this; the signal may be weak.";
    $('send-msg').hidden = false;
  }
}
async function send() {
  if (unchanged()) return confirmSame();
  if (answered(S.a) < MIN_ANSWERS) return drawReview();
  const body = payload(), saved = { body, rows: lastRows, at: Date.now(), first: !(RATED.get(body.stop_id) || []).length };
  const kept = store.set(saved) || store.set({ ...saved, body: { ...body, photo: null }, photoDropped: !!body.photo });
  sending = true; $('send-msg').hidden = true; updateNext(); $('next').textContent = 'Sending…';
  try {
    const r = await postRating(body);
    store.drop(kept); sending = false; thanks(body, r.id);
  } catch (err) {
    sending = false; updateNext(); $('next').textContent = 'Try again';
    if (err.server && err.status === 400 && /^nick:/.test(err.message)) S.noNick = true;
    const why = err.server && err.status === 400 ? (/^nick:/.test(err.message) ? `${err.message.replace(/^nick: /, '').replace(/^./, c => c.toUpperCase())}. Press Try again to send it without a nickname, or tap "Change" next to Points to log in again.` : `The server could not accept this (${err.message}).`)
      : err.server && err.status === 403 ? 'The spam check did not finish. Please press Try again.'
      : err.server && err.status === 429 ? 'Too many sends from this connection just now. Please wait a minute.'
      : "We couldn't send this; the signal may be weak.";
    $('send-msg').textContent = `${why} ${kept ? 'Your answers are saved on this phone, so nothing is lost.' : ''}`;
    $('send-msg').hidden = false;
  }
}
// entries that didn't go through: offer the oldest on the start screen, with its own spam check (it must be visible)
let draftSpam = null;
function showDraft() {
  const d = store.get(); $('draft').hidden = !d; if (!d) return;
  draftSpam = draftSpam || Contribute.spamCheck($('ts-draft'));
  $('draft-text').textContent = `You have details${(() => { const s = (d.rows || []).find(r => r[0] === 'Stop'); return s ? ' for ' + s[1].split(' · ')[0] : ''; })()} from ${new Date(d.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} that didn't send.${d.photoDropped ? ' Its photo was too large to keep.' : ''}`;
  $('draft-send').hidden = false; $('draft-send').disabled = false; $('draft-send').textContent = 'Send it now'; $('draft-drop').textContent = 'Discard it'; $('draft-msg').hidden = true;
  $('draft-send').onclick = async () => {
    $('draft-send').disabled = true; $('draft-send').textContent = 'Sending…'; $('draft-msg').hidden = true;
    try { const r = await postRating(d.body, draftSpam); store.drop(d.id); $('draft').hidden = true; thanks(d.body, r.id); }
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

// ── load stops, ratings (for "rated before" and stops residents added) and areas ──
drawAnswers();                                   // follow-up questions stay hidden until their first question is answered
const openPlay = { '#play': 'create', '#create': 'create', '#login': 'login' }[location.hash];   // links can open these screens
history.replaceState({ s: 'start' }, '', location.search);
drawPlay();
if (openPlay && !player.get()) { setMode(openPlay); show('player'); }
async function loadAll() {
  const [stops, ratings] = await Promise.all([loadStops().catch(() => []), loadRatings().catch(() => [])]);
  if (!stops.length) return;
  STOPS = stops.concat(addedStops(ratings));
  BY_ID = new Map(STOPS.map(s => [s.id, s]));
  RATED = byStop(ratings);
}
await loadAll();
if (STOPS.length) $('meta').textContent = `So far: ${RATED.size.toLocaleString('en-IN')} stops with details`;
if (PRESET && BY_ID.get(PRESET)) {
  S.preset = true; S.stop = BY_ID.get(PRESET);
  $('start-h').textContent = S.stop.name;
  $('start-lede').textContent = (S.stop.towards ? `The stop towards ${S.stop.towards}. ` : '') + 'Tell us what it is like now. It takes two minutes.';
}
