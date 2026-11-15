// Rate a bus stop: pick a stop (nearest to the phone, search by stop or area, or add a missing one), answer the
// topic screens, optional photo, improvement and nickname, check and send. Talks to contribute-api.
import { createPlaceSearch } from '../assets/place-search.js';
import { SURVEY, TOPICS, QUESTIONS, MIN_ANSWERS, optLabel, shown, answered, POINTS, loadStops, loadRatings, addedStops,
  byStop, metres, stopLabel, esc, nick } from './questions.js';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const inHmda = (lng, lat) => lng >= C.HMDA[0] && lng <= C.HMDA[2] && lat >= C.HMDA[1] && lat <= C.HMDA[3];

// ── topic screens, drawn from the question list ──
$('topics').innerHTML = TOPICS.map(t => `<section class="step" data-step="t-${t.id}">
  <h2 class="qt">${esc(t.title)}</h2>
  <p class="hint">Tap the answers that fit. Skip any you don't know.</p>
  ${t.qs.map(q => `<div class="qblock" data-q="${q.id}">
    <h3 id="h-${q.id}">${esc(q.q)}</h3>${q.hint ? `<p class="qh">${esc(q.hint)}</p>` : ''}
    <div class="opts" role="${q.multi ? 'group' : 'radiogroup'}" aria-labelledby="h-${q.id}">
      ${q.opts.map(([v, l]) => `<button type="button" class="opt${q.multi ? ' check' : ''}" role="${q.multi ? 'checkbox' : 'radio'}" aria-checked="false" data-v="${v}">${esc(l)}</button>`).join('')}
    </div></div>`).join('')}
  <p class="msg" data-few hidden>Answer at least ${MIN_ANSWERS} questions in all before sending. You can go back and add more.</p>
</section>`).join('');

const S = { here: null, stop: null, missing: null, a: {}, photo: null, how: null };
let STOPS = [], BY_ID = new Map(), RATED = new Map(), cur = 'start';
const PRESET = new URLSearchParams(location.search).get('stop');

// ── steps ──
function steps() {
  const l = ['start'];
  if (!S.preset) {
    if (S.here === 'yes' && S.how !== 'search' && S.how !== 'missing') l.push('locate', 'nearest');
    else if (S.how !== 'missing') l.push('find');
    if (S.how === 'missing') l.push('missing');
  }
  for (const t of TOPICS) l.push('t-' + t.id);
  l.push('photo', 'improve', 'nick', 'review', 'thanks');
  return l;
}
const filled = (id) => $(id).value.trim().length >= 2;
function ready(s) {
  if (s === 'nearest' || s === 'find') return !!S.stop;
  if (s === 'missing') return !!(S.missing && filled('m-name'));
  if (s === 'nick') return !checkingNick;
  if (s === 'review') return !sending && answered(S.a) >= MIN_ANSWERS;
  return true;
}
const TOPIC_STEPS = TOPICS.map(t => 't-' + t.id);
function show(s, push = true) {
  cur = s;
  document.querySelectorAll('.step').forEach(x => x.classList.toggle('on', x.dataset.step === s));
  const qs = steps().filter(x => x !== 'start' && x !== 'thanks'), i = qs.indexOf(s);
  $('progress').hidden = i < 0;
  if (i >= 0) { $('bar').style.width = `${(i + 1) / qs.length * 100}%`; $('count').textContent = s === 'review' ? 'Last step' : `${i + 1} of ${qs.length - 1}`; }
  $('nav').hidden = s === 'start' || s === 'thanks';
  $('next').hidden = s === 'locate';
  const showCard = (TOPIC_STEPS.includes(s) || ['photo', 'improve', 'nick', 'review'].includes(s)) && (S.stop || S.missing);
  $('stopcard').hidden = !showCard;
  if (showCard) drawCard();
  if (s === 'photo') $('photo-hint').textContent = S.here === 'yes' ? 'Optional. One photo of the stop helps others see it.' : 'Optional. A photo you took of this stop.';
  if (s === 'review') drawReview();
  if (s === 'missing') openMap();
  if (s === 'nick') {
    const n = nick.get(); if (n && !$('nick').value) $('nick').value = n;
    $('nick-msg').hidden = true;
    $('nick-hint').textContent = n ? `You are on the leaderboard as ${n}. Keep it, change it, or clear it to stay off the board.`
      : "Optional. Make up a nickname to collect points for your ratings. Don't use your real name. It is kept on this phone only: clearing the browser or changing phones starts you again.";
  }
  if (s === 't-facilities') document.querySelector('[data-step="t-facilities"] [data-few]').hidden = answered(S.a) >= MIN_ANSWERS;
  updateNext();
  if (push) history.pushState({ s }, '', location.search + '#' + s);
  window.scrollTo({ top: 0 });
  const h = document.querySelector(`.step[data-step="${s}"] .qt, .step[data-step="${s}"] h1`); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function updateNext() {
  const n = $('next'); n.disabled = !ready(cur);
  if ((cur === 'review' && sending) || (cur === 'nick' && checkingNick)) return;
  const optional = { photo: !S.photo, improve: !$('improve').value.trim(), nick: !$('nick').value.trim() };
  const topicEmpty = TOPIC_STEPS.includes(cur) && !TOPICS.find(t => 't-' + t.id === cur).qs.some(q => S.a[q.id] != null);
  n.textContent = cur === 'review' ? 'Send rating' : (optional[cur] || topicEmpty) ? 'Skip' : 'Next';
}
const go = (d) => { const l = steps(); show(l[Math.max(0, l.indexOf(cur) + d)]); };
$('next').onclick = async () => {
  if (cur === 'review') return send();
  if (cur === 'nick' && !(await nickOk())) return;
  go(1);
};
$('back').onclick = () => history.back();
window.addEventListener('popstate', (e) => show(e.state?.s || 'start', false));

// first question
document.querySelector('[data-field="here"]').addEventListener('click', (e) => {
  const b = e.target.closest('[role=radio]'); if (!b) return;
  b.parentElement.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
  S.here = b.dataset.val;
  if (!S.preset) { S.how = S.here === 'yes' ? 'gps' : 'search'; S.stop = null; S.missing = null; }
  setTimeout(() => go(1), 220);
});

// topic answers: tap to choose, tap again to clear; ticks toggle, "None of these" clears the others
$('topics').addEventListener('click', (e) => {
  const b = e.target.closest('.opt'); if (!b) return;
  const id = b.closest('.qblock').dataset.q, q = QUESTIONS.find(x => x.id === id), v = b.dataset.v;
  if (q.multi) {
    let t = new Set(S.a[id] || []);
    if (t.has(v)) t.delete(v); else { if (v === 'none') t = new Set(); else t.delete('none'); t.add(v); }
    S.a[id] = t.size ? [...t] : undefined;
  } else S.a[id] = S.a[id] === v ? undefined : v;
  if (S.a[id] === undefined) delete S.a[id];
  drawAnswers();
});
function drawAnswers() {
  for (const q of QUESTIONS) {
    const blk = document.querySelector(`.qblock[data-q="${q.id}"]`);
    blk.hidden = !shown(q, S.a);
    if (blk.hidden) delete S.a[q.id];
    const v = S.a[q.id];
    blk.querySelectorAll('.opt').forEach(o => o.setAttribute('aria-checked', q.multi ? !!(v || []).includes(o.dataset.v) : o.dataset.v === v));
  }
  updateNext();
}

// ── the chosen stop ──
function drawCard() {
  if (S.missing) { $('sc-name').textContent = $('m-name').value.trim() || 'New stop'; $('sc-ctx').textContent = ($('m-towards').value.trim() ? `towards ${$('m-towards').value.trim()} · ` : '') + 'A stop you are adding'; return; }
  const s = S.stop, n = (RATED.get(s.id) || []).length;
  $('sc-name').textContent = s.name;
  $('sc-ctx').textContent = [s.towards && `towards ${s.towards}`, n ? `rated ${n} time${n > 1 ? 's' : ''} before` : 'not rated yet: the first rating earns extra points'].filter(Boolean).join(' · ');
}
function routeText(s) {
  if (!s.nRoutes) return 'A stop someone added';
  return `Buses ${s.routes.slice(0, 3).join(', ')}${s.nRoutes > 3 ? ` and ${s.nRoutes - 3} more` : ''}`;
}
const stopButton = (s, d) => `<button type="button" class="answer" role="radio" aria-checked="${!!(S.stop && S.stop.id === s.id)}" data-id="${esc(s.id)}"><span>${esc(s.name)}<small>${s.towards ? 'towards ' + esc(s.towards) + ' · ' : ''}${esc(routeText(s))}</small></span>${d != null ? `<span class="dist">${d < 1000 ? Math.round(d / 10) * 10 + ' m' : (d / 1000).toFixed(1) + ' km'}</span>` : '<i class="tick"></i>'}</button>`;
function pickFrom(listEl) {
  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    listEl.querySelectorAll('[role=radio]').forEach(x => x.setAttribute('aria-checked', x === b));
    S.stop = BY_ID.get(b.dataset.id); S.missing = null; updateNext();
    setTimeout(() => go(1), 220);
  });
}
pickFrom($('near-list')); pickFrom($('inarea-list'));

// ── location: only to list the nearest stops; never sent ──
$('gps-go').onclick = () => {
  if (!('geolocation' in navigator)) return gpsFailed('This browser cannot share a location.');
  $('gps-go').textContent = 'Waiting for your phone…'; $('gps-go').disabled = true; $('gps-msg').hidden = true;
  navigator.geolocation.getCurrentPosition(onFix, (err) => gpsFailed(err.code === 1
      ? "Your phone didn't share its location. You can allow it in your browser's settings, or search for the stop instead."
      : "We couldn't get a location from your phone. Try again, or search for the stop instead."),
    { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 });
};
function onFix(p) {
  const { latitude: lat, longitude: lng, accuracy: acc } = p.coords;
  $('gps-go').textContent = 'Share my location'; $('gps-go').disabled = false;
  if (!inHmda(lng, lat)) return gpsFailed('Your phone places you outside the Hyderabad area (HMDA). This survey is for bus stops in Hyderabad. Search for the stop instead.');
  if (!STOPS.length) return gpsFailed('The list of bus stops has not loaded yet. Check your connection and try again.');
  const near = STOPS.map(s => [s, metres({ lat, lng }, s)]).sort((a, b) => a[1] - b[1]).slice(0, 4);
  $('near-list').innerHTML = near.map(([s, d]) => stopButton(s, d)).join('');
  $('near-msg').hidden = near[0][1] < 400;
  $('near-msg').textContent = `The nearest stop we know is ${Math.round(near[0][1])} m away${acc > 100 ? ", and your phone's location is rough" : ''}. If you are at a stop, it may be missing from the bus data: add it.`;
  S.stop = null; go(1);
}
function gpsFailed(t) { $('gps-go').textContent = 'Try again'; $('gps-go').disabled = false; $('gps-msg').textContent = t; $('gps-msg').hidden = false; }
$('gps-search').onclick = () => { S.how = 'search'; go(1); };
$('near-search').onclick = (e) => { e.preventDefault(); S.how = 'search'; S.stop = null; show('find'); };
document.querySelectorAll('.to-missing').forEach(a => a.onclick = (e) => { e.preventDefault(); S.how = 'missing'; S.stop = null; show('missing'); });

// ── search: stop names and areas in one box ──
let AREAS = null;
const LOCAL = [], STOP_AT = new Map();
const KEY = (c) => c[0].toFixed(6) + ',' + c[1].toFixed(6);
function inRing(x, y, r) { let i2 = false; for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) { const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) i2 = !i2; } return i2; }
const search = createPlaceSearch({
  input: $('ps-input'), results: $('ps-results'), local: () => LOCAL, getMap: () => null,
  onSelect: (p) => {
    $('find-msg').hidden = true;
    if (p.kind === 'Bus stop') {
      S.stop = STOP_AT.get(KEY(p.center)); $('inarea').hidden = false;
      const twins = STOPS.filter(s => s.name === S.stop.name && metres(s, S.stop) < 400).sort((a, b) => (a.id === S.stop.id ? -1 : b.id === S.stop.id ? 1 : 0));
      $('inarea-h').textContent = twins.length > 1 ? 'Which side of the road?' : 'Is this the one?';
      $('inarea-list').innerHTML = twins.map(s => stopButton(s)).join('');
      updateNext(); return;
    }
    // an area: list its stops, nearest the middle first
    S.stop = null;
    const ward = p.kind.startsWith('Ward') && AREAS ? AREAS.wards.find(w => w.name === p.name) : null;
    const box = p.bbox || [p.center[0] - .006, p.center[1] - .006, p.center[0] + .006, p.center[1] + .006];
    let list = STOPS.filter(s => s.lng >= box[0] && s.lng <= box[2] && s.lat >= box[1] && s.lat <= box[3]);
    if (ward) list = list.filter(s => (ward.poly || []).reduce((acc, r) => acc !== inRing(s.lng, s.lat, r), false));
    const c = { lng: p.center[0], lat: p.center[1] };
    list = list.map(s => [s, metres(c, s)]).sort((a, b) => a[1] - b[1]).slice(0, 40).map(x => x[0]);
    $('inarea').hidden = !list.length;
    $('inarea-h').textContent = `Bus stops in ${p.name}${list.length === 40 ? ' (nearest 40)' : ''}`;
    $('inarea-list').innerHTML = list.map(s => stopButton(s)).join('');
    if (!list.length) { $('find-msg').textContent = `We don't know any bus stops in ${p.name}. Search nearby, or add the stop on a map.`; $('find-msg').hidden = false; }
    updateNext();
  },
});
$('ps-input').addEventListener('input', () => { if (!$('ps-input').value) { $('inarea').hidden = true; S.stop = null; updateNext(); } });

// ── missing stop: a pin on a map, known stops as grey dots ──
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
  if (map) { map.resize(); return; }
  map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.475, 17.405], zoom: 11, minZoom: 9, maxZoom: 18,
    maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true } });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('load', () => {
    document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
    map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: STOPS.map(s => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) } });
    map.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 16, 5], 'circle-color': '#9CA3AF', 'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0, 16, 1] } });
  });
  map.on('click', (e) => placePin(e.lngLat.lng, e.lngLat.lat));
}
function placePin(lng, lat) {
  if (!inHmda(lng, lat)) { $('pin-msg').textContent = 'That spot is outside the Hyderabad area (HMDA).'; $('pin-msg').hidden = false; return; }
  $('pin-msg').hidden = true;
  if (!pin) { const el = document.createElement('div'); el.className = 'pin';
    pin = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([lng, lat]).addTo(map);
    pin.on('dragend', () => { const q = pin.getLngLat(); placePin(q.lng, q.lat); }); } else pin.setLngLat([lng, lat]);
  S.missing = { lat, lng }; $('map-hint').classList.add('off');
  const [n, d] = STOPS.map(s => [s, metres({ lat, lng }, s)]).sort((a, b) => a[1] - b[1])[0];
  $('pin-info').hidden = false;
  $('pin-info').textContent = d < 60 ? `${stopLabel(n)} is only ${Math.round(d)} m away. If that's the same stop, go back and pick it instead.` : `Nearest known stop: ${stopLabel(n)}, ${Math.round(d)} m away.`;
  updateNext();
}
['m-name', 'm-towards', 'improve'].forEach(id => $(id).addEventListener('input', updateNext));
$('nick').addEventListener('input', () => { $('nick-msg').hidden = true; updateNext(); });

// ── photo: made smaller on the phone; the server re-encodes it again and drops all hidden data ──
$('photo-in').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  const info = $('photo-info'); info.hidden = false; info.textContent = 'Preparing the photo…';
  try {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' });
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
    S.photo = c.toDataURL('image/jpeg', .82); $('photo-prev').src = S.photo; $('photo-prev').style.display = 'block';
    info.textContent = `Ready to send: ${w} × ${h}`; $('photo-btn').textContent = 'Use a different photo';
  } catch { S.photo = null; info.textContent = "This photo couldn't be read. Try a different one."; }
  updateNext();
});

// ── nickname: first come, first served; checked before moving on (the server checks again when sending) ──
let checkingNick = false;
async function nickOk() {
  const n = $('nick').value.trim().replace(/\s+/g, ' ');
  if (!n) return true;
  const say = (t) => { $('nick-msg').textContent = t; $('nick-msg').hidden = false; };
  if (n.length < 3) { say('A nickname needs at least 3 letters.'); return false; }
  if (!nick.secret()) { say("This browser can't keep a nickname (private mode?). Clear the box to rate without one."); return false; }
  checkingNick = true; updateNext(); $('next').textContent = 'Checking…';
  try {
    const r = await Contribute.post(`/${SURVEY}/nickname`, { nick: n, nick_secret: nick.secret() });
    if (r.status === 'taken') { say(`Someone else already uses "${n}". Please choose another nickname.`); return false; }
    if (r.status === 'banned') { say("This nickname can't be used. Please choose another."); return false; }
    return true;
  } catch (err) {
    if (err.status === 400) { say('Use 3 to 24 letters, numbers and spaces.'); return false; }
    return true;                      // offline: the server checks again when the rating is sent
  } finally { checkingNick = false; updateNext(); }
}

// ── review ──
function topicSummary(t) {
  const parts = t.qs.filter(q => shown(q, S.a) && S.a[q.id] != null).map(q => `${q.s}: ${q.multi ? S.a[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, S.a[q.id])}`);
  return parts.length ? `<span class="lines">${parts.map(esc).join('<br>')}</span>` : 'Skipped';
}
let lastRows = [];
function drawReview() {
  const stopTxt = S.missing ? `${esc($('m-name').value.trim())}<small>${$('m-towards').value.trim() ? 'towards ' + esc($('m-towards').value.trim()) + ' · ' : ''}A new stop, marked on the map</small>`
    : `${esc(S.stop.name)}<small>${S.stop.towards ? 'towards ' + esc(S.stop.towards) : ''}</small>`;
  const rows = [['Stop', stopTxt, S.preset ? null : S.missing ? 'missing' : S.how === 'gps' ? 'nearest' : 'find'],
    ...TOPICS.map(t => [t.title.replace(' and seating', '').replace('Comfort and safety', 'Safety'), topicSummary(t), 't-' + t.id]),
    ['Photo', S.photo ? 'Added' : 'None', 'photo'], ['Improve', esc($('improve').value.trim() || 'None'), 'improve'],
    ['Nickname', esc($('nick').value.trim() || 'None (off the board)'), 'nick']];
  lastRows = rows.map(([k, v]) => [k, v.replace(/<br>|<small>/g, ' · ').replace(/<[^>]+>/g, '')]);
  $('review').innerHTML = rows.map(([k, v, s]) => `<div><dt>${k}</dt><dd>${v}</dd>${s ? `<button type="button" data-go="${s}">Change</button>` : '<span></span>'}</div>`).join('');
  document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => show(b.dataset.go));
  const few = answered(S.a) < MIN_ANSWERS;
  $('send-msg').hidden = !few;
  if (few) $('send-msg').textContent = `Answer at least ${MIN_ANSWERS} questions before sending (you have answered ${answered(S.a)}). Tap "Change" next to a topic.`;
}

// ── send; if it fails the answers stay on this phone ──
const DRAFT = 'obs-bus-unsent';
const store = { get() { try { return JSON.parse(localStorage.getItem(DRAFT)); } catch { return null; } },
  set(v) { try { localStorage.setItem(DRAFT, JSON.stringify(v)); return true; } catch { return false; } },
  drop() { try { localStorage.removeItem(DRAFT); } catch { /* ignore */ } } };
let sending = false;
function payload() {
  const nk = $('nick').value.trim().replace(/\s+/g, ' ') || null;
  const b = { here: S.here, place_type: S.missing ? 'missing' : S.preset ? 'preset' : S.how === 'gps' ? 'gps' : 'search',
    ...Object.fromEntries(QUESTIONS.filter(q => shown(q, S.a) && S.a[q.id] != null).map(q => [q.id, S.a[q.id]])),
    improve: $('improve').value.trim() || null, nick: nk, nick_secret: nk ? nick.secret() : null, photo: S.photo || null };
  if (S.missing) Object.assign(b, { lat: S.missing.lat, lng: S.missing.lng, stop_name: $('m-name').value.trim(), towards: $('m-towards').value.trim() || null });
  else b.stop_id = S.stop.id;               // the server takes the stop's place from TGSRTC's list, not from the phone
  return b;
}
const spam = Contribute.spamCheck($('ts-review'));
async function postRating(body) {
  const token = await spam.token();
  if (token === null) { const e = new Error('spam check'); e.server = true; e.status = 403; throw e; }
  try { return await Contribute.post(`/${SURVEY}/reports`, { ...body, token, website: $('trap').value }); }
  finally { spam.reset(); }
}
function points(body) {
  const got = [['Rating a stop', POINTS.rating]];
  if (body.place_type === 'missing') got.push(['Adding a missing stop', POINTS.missing]);
  else if (!(RATED.get(body.stop_id) || []).length) got.push(['First rating of this stop', POINTS.first]);
  if (body.photo) got.push(['Adding a photo', POINTS.photo]);
  return got;
}
function thanks(body, id) {
  const got = points(body), total = got.reduce((a, b) => a + b[1], 0);
  $('pts').textContent = '+' + total;
  $('pts-list').innerHTML = got.map(([k, v]) => `<li>${k}<b>+${v}</b></li>`).join('');
  $('thanks-text').textContent = body.nick ? `Points go to ${body.nick} on the leaderboard.` : "You didn't pick a nickname, so these points aren't on the leaderboard. Add one next time to collect them.";
  if (body.nick) nick.set(body.nick);
  $('to-stop').href = 'stop/?id=' + encodeURIComponent(body.place_type === 'missing' ? 'new-' + id : body.stop_id);
  show('thanks');
}
async function send() {
  if (answered(S.a) < MIN_ANSWERS) return drawReview();
  const body = payload(), saved = { body, rows: lastRows, at: Date.now(), first: !(RATED.get(body.stop_id) || []).length };
  const kept = store.set(saved) || store.set({ ...saved, body: { ...body, photo: null }, photoDropped: !!body.photo });
  sending = true; $('send-msg').hidden = true; updateNext(); $('next').textContent = 'Sending…';
  try {
    const r = await postRating(body);
    store.drop(); sending = false; thanks(body, r.id);
  } catch (err) {
    sending = false; updateNext(); $('next').textContent = 'Try again';
    const why = err.server && err.status === 400 ? (/^nick:/.test(err.message) ? `${err.message.replace(/^nick: /, '').replace(/^./, c => c.toUpperCase())}. Tap "Change" next to Nickname.` : `The server could not accept this rating (${err.message}).`)
      : err.server && err.status === 403 ? 'The spam check did not finish. Please press Try again.'
      : err.server && err.status === 429 ? 'Too many ratings from this connection just now. Please wait a minute.'
      : "We couldn't send your rating; the signal may be weak.";
    $('send-msg').textContent = `${why} ${kept ? 'Your answers are saved on this phone, so nothing is lost.' : ''}`;
    $('send-msg').hidden = false;
  }
}
// a rating that didn't go through last time: offer it on the start screen
(() => {
  const d = store.get(); if (!d || !d.body) return;
  $('draft').hidden = false;
  const stop = (d.rows || []).find(r => r[0] === 'Stop');
  $('draft-text').textContent = `You have a rating${stop ? ' of ' + stop[1].split(' · ')[0] : ''} from ${new Date(d.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} that didn't send.${d.photoDropped ? ' Its photo was too large to keep.' : ''}`;
  $('draft-send').onclick = async () => {
    $('draft-send').disabled = true; $('draft-send').textContent = 'Sending…'; $('draft-msg').hidden = true;
    try { const r = await postRating(d.body); store.drop(); thanks(d.body, r.id); }
    catch (err) { $('draft-send').disabled = false; $('draft-send').textContent = 'Try again';
      $('draft-msg').textContent = err.status === 400 ? `The server could not accept it (${err.message}). Discard it and rate the stop again.` : "Still couldn't send it. Your answers stay saved on this phone."; $('draft-msg').hidden = false; }
  };
  $('draft-drop').onclick = () => { store.drop(); $('draft').hidden = true; };
})();
$('again').onclick = () => { location.href = location.pathname; };

// ── load stops, ratings (for "rated before" and stops residents added) and areas ──
history.replaceState({ s: 'start' }, '', location.search);
const [stops, ratings, areas] = await Promise.all([
  loadStops().catch(() => []), loadRatings().catch(() => []), fetch(C.AREAS_URL).then(r => r.json()).catch(() => null)]);
STOPS = stops.concat(addedStops(ratings));
BY_ID = new Map(STOPS.map(s => [s.id, s]));
RATED = byStop(ratings);
for (const s of STOPS) { const c = [s.lng, s.lat]; STOP_AT.set(KEY(c), s); LOCAL.push({ name: s.name, kind: 'Bus stop', context: s.towards ? 'towards ' + s.towards : s.added ? 'added by someone' : '', center: c }); }
AREAS = areas;
if (areas) {
  const corps = areas.corporations || [], zones = areas.zones || [];
  for (const z of zones) LOCAL.push({ name: z.name, kind: 'Zone', context: (corps[z.corp] || {}).name, bbox: z.bounds });
  for (const w of areas.wards || []) { const z = zones[w.zone]; LOCAL.push({ name: w.name, kind: 'Ward' + (w.no != null ? ' ' + w.no : ''), context: z ? z.name + ' zone' : '', bbox: w.bounds }); }
}
search.refresh?.();
if (stops.length) $('meta').textContent = `${RATED.size.toLocaleString('en-IN')} of ${STOPS.length.toLocaleString('en-IN')} stops rated so far`;
if (PRESET && BY_ID.get(PRESET)) {
  S.preset = true; S.stop = BY_ID.get(PRESET);
  document.querySelector('[data-step="start"] h1').textContent = 'Rate ' + S.stop.name;
  document.querySelector('[data-step="start"] .hint').textContent = (S.stop.towards ? `The stop towards ${S.stop.towards}. ` : '') + "Tell us what it is like now. It takes about two minutes, and you don't need to sign in.";
}
