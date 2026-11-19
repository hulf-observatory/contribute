// Walking and bus stops (Teja, 18 Nov 2026): one entry for everything about walking at one place. Where are you →
// around you (what's here already, what's missing, report or ask) → a bus stop, footpath or crossing: its core
// questions, then "Add more here?". Footpaths on main roads are a side of the road, junction to junction: the side
// from the phone's compass, or the traffic, or a tap on the map. Problems and requests are pins; checks of what's
// already there ("still the same", "still there", "gone", "me too") go with the entry. All sent at once, one spam
// check. Phones only; a laptop sees a QR code. Talks to contribute-api (/walking/around, /walking/reports).
import { mapMark } from '../assets/map-mark.js?v=20261119a';
import { SURVEY, SETS, ITEM, MIN, allQs, shown, real, nAnswered, optLabel, PROBLEMS, BLOCKED_BY, NEEDS, problemName, needName, REQUEST_COLOR,
  POINTS, VIEW_COLORS, footColor, crossColor, metres, angle, compass8, outward, sideName, bearingNear, inHmda, esc, player, checkPlayer,
  PLAYER_SAYS, currentOf, profileLines } from './questions.js?v=20261119a';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
Contribute.phoneOnly({ what: 'Walking and bus stops', mapHref: 'map/', mapLabel: 'See the map' });
// desk tests on this Mac only: ?demo offers pretend places and compass readings
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEMO = LOCAL && new URLSearchParams(location.search).has('demo');
if (DEMO) document.querySelectorAll('[data-demo]').forEach(x => { x.hidden = false; });
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const GREY = '#B8BDC6', MAX_MOVE = 100, NEAR_JUNCTION_M = 150;
const cap = (w) => w ? w[0].toUpperCase() + w.slice(1) : '';
const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
const day = (d) => d ? new Date(d.length > 10 ? d : d + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
const mkEl = (cls, html = '') => { const d = document.createElement('div'); d.className = cls; d.innerHTML = html; return d; };
const compact = (m) => m.on('load', () => m.getContainer().querySelectorAll('.maplibregl-compact-show').forEach(x => x.classList.remove('maplibregl-compact-show')));
const answerBtn = (attr, label, extra = '', cls = '') => `<button type="button" class="answer${cls}" ${attr}><span>${label}</span>${extra}</button>`;

// ── one screen per question: q-<thing>-<question> ──
$('topics').innerHTML = Object.entries(SETS).flatMap(([k, set]) => [...set.core, ...set.more].map(q => `<section class="step" data-step="q-${k}-${q.id}">
  <p class="qtopic" data-qn></p>
  <h2 class="qt" id="h-${k}-${q.id}">${esc(q.q)}</h2>${q.multi ? `<p class="hint">${esc(q.hint || 'Tick all that fit')}</p>` : q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ''}
  <div class="answers" data-q="${k}|${q.id}" role="${q.multi ? 'group' : 'radiogroup'}" aria-labelledby="h-${k}-${q.id}">
    ${q.opts.map(([v, l]) => `<button type="button" class="answer${q.multi ? ' check' : ''}" role="${q.multi ? 'checkbox' : 'radio'}" aria-checked="false" data-v="${v}"><span>${esc(l)}</span><i class="tick"></i></button>`).join('')}
  </div>
</section>`)).join('');
const sw = (c) => `<i class="sw" style="background:${c}"></i>`;
$('problist').innerHTML = PROBLEMS.map(([v, l, c]) => answerBtn(`data-prob="${v}"`, esc(l), sw(c))).join('');
$('mainlist').innerHTML = [['stop', 'A bus stop'], ['foot', 'A footpath'], ['cross', 'A crossing'], ['ask', 'Ask for something']].map(([v, l]) => answerBtn(`data-main="${v}"`, l, '', ' go')).join('');
$('asklist').innerHTML = NEEDS.map(([v, l]) => answerBtn(`data-need="${v}"`, l, '<i class="tick"></i>')).join('');
$('blist').innerHTML = BLOCKED_BY.map(([v, l]) => `<button type="button" class="answer check" role="checkbox" aria-checked="false" data-v="${v}"><span>${esc(l)}</span><i class="tick"></i></button>`).join('');

// ── state: the place, what's around it, the things added in this entry and the checks ──
const S = { place: null, near: null, items: [], checks: [], cur: null, lastMain: null };
let cur = 'start', stack = [], moving = false, sending = false;
var DONE = false;                                  // sent: Back can't offer Send again
const isQ = (s) => s.startsWith('q-');
const qParts = (s) => { const [, k, id] = s.split('-'); const part = SETS[k].core.some(q => q.id === id) ? 'core' : 'more'; return { k, id, part }; };
const qList = (k, part, a) => SETS[k][part].filter(q => shown(q, a));
const KIND_NAME = { stop: 'Bus stop', foot: 'Footpath', cross: 'Crossing', problem: 'Problem', request: 'Request' };
const TAP_ON = ['loc', 'near', 'check', 'stoppick', 'sidewhich', 'crosspick', 'report', 'ask'];

function show(s, push = true) {
  if (DONE && s !== 'thanks') s = 'thanks';
  if (push && cur !== s) stack.push(cur);
  cur = s;
  document.querySelectorAll('.step').forEach(x => x.classList.toggle('on', x.dataset.step === s));
  const inQ = !['start', 'thanks', 'player'].includes(s);
  document.body.classList.toggle('q-mode', inQ);
  $('progress').hidden = !inQ; $('nav').hidden = !inQ;
  const n = S.items.length + S.checks.length;
  if (isQ(s)) {
    const { k, id, part } = qParts(s), list = qList(k, part, S.cur.a), i = list.findIndex(q => q.id === id);
    // follow-ups appear only after the answer that asks for them, so the count is "question n", not "n of m"
    document.querySelector(`.step[data-step="${s}"] [data-qn]`).textContent = `${SETS[k].name}${part === 'more' ? ', more' : ''} · question ${i + 1}` + (i === 0 && S.cur.base ? ' · "Current answer" is what most people said' : '');
    $('bar').style.width = `${(SETS[k][part].findIndex(q => q.id === id) + 1) / SETS[k][part].length * 100}%`;
    $('count').textContent = S.cur.title || '';
    S.cur.seen.add(id);
    drawAnswers();
  } else {
    $('bar').style.width = ['more', 'review'].includes(s) ? '100%' : '8%';
    $('count').textContent = n ? `${n} added` : '';
  }
  ({ near: drawNear, mark: () => marker.open(), sidepick: drawSide, sidewhich: drawWhich, crosspick: drawCross, stoppick: drawStops, pin: openPin,
    photo: drawPhoto, more: drawMore, review: drawReview, start: drawPlay, blockedby: drawBlocked, stopname: () => {},
    thanks: () => { const p = S.noNick ? null : player.get(); $('thanks-prof').hidden = !p; if (p) $('thanks-prof-a').href = profileUrl(p.nick); },
    player: () => { S.noNick = false; const p = player.get(); $('p-nick').value = p ? p.nick : $('p-nick').value; $('p-pin').value = ''; $('p-msg').hidden = true; playerReady(); } }[s] || (() => {}))();
  if (s !== 'sidepick') stopCompass();
  updateNext();
  window.scrollTo({ top: 0 });
  const st = document.querySelector(`.step[data-step="${s}"]`); st.scrollTop = 0;
  const h = st.querySelector('.qt, h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function ready() {
  if (cur === 'mark') return !!(S.mark && S.mark.ok);
  if (cur === 'stopname') return $('stop-name').value.trim().length >= 2;
  if (cur === 'pin') return !!S.pinOk;
  if (cur === 'sidepick') return SP.pick != null;
  if (cur === 'photo') return !few();
  if (cur === 'more') return S.items.length + S.checks.length > 0;
  if (cur === 'review') return !sending && S.items.length + S.checks.length > 0;
  return true;
}
const few = () => !!S.cur && !!MIN[S.cur.k] && nAnswered(S.cur.k, Object.fromEntries(Object.entries(S.cur.a).filter(([k]) => S.cur.seen.has(k)))) < MIN[S.cur.k];
function updateNext() {
  const b = $('next');
  b.hidden = TAP_ON.includes(cur) || (isQ(cur) && !allQs(qParts(cur).k).find(q => q.id === qParts(cur).id).multi);
  b.disabled = !ready();
  if (cur === 'review' && sending) return;
  const optional = { photo: !(S.cur && (S.cur.photo || S.cur.note)), blockedby: !(S.cur && S.cur.blocked_by && S.cur.blocked_by.length) };
  b.textContent = cur === 'review' ? 'Send' : cur === 'more' ? `Send now (${S.items.length + S.checks.length})` : cur === 'mark' ? 'Use this place'
    : cur === 'sidepick' ? 'This side' : cur === 'pin' ? 'Here' : optional[cur] ? 'Skip' : 'Next';
  if (cur === 'photo') {
    const f = few(); $('photo-few').hidden = !f;
    if (f) $('photo-few').textContent = `Answer at least ${MIN[S.cur.k]} question${MIN[S.cur.k] > 1 ? 's' : ''} about the ${SETS[S.cur.k].name.toLowerCase()} ("Don't know" doesn't count). Press Back to change an answer.`;
  }
}
function next() {
  if (isQ(cur)) {
    const { k, id, part } = qParts(cur), list = qList(k, part, S.cur.a), i = list.findIndex(q => q.id === id);
    if (list[i + 1]) return show(`q-${k}-${list[i + 1].id}`);
    if (part === 'more') { S.cur.more = true; return show('more'); }
    return show('photo');
  }
  if (cur === 'mark') { S.place = { lat: S.mark.lat, lng: S.mark.lng, acc: null, memory: true }; return goNear(); }
  if (cur === 'stopname') { Object.assign(S.cur, { name: $('stop-name').value.trim(), towards: $('stop-towards').value.trim() }); S.cur.title = S.cur.name + (S.cur.towards ? `, towards ${S.cur.towards}` : ''); return pinThen(() => firstQ()); }
  if (cur === 'pin') { const c = pinMap.getCenter(); Object.assign(S.cur, { lat: c.lat, lng: c.lng }); return S.pinNext(); }
  if (cur === 'sidepick') return sideChosen();
  if (cur === 'blockedby') return pinThen(() => show('photo'));
  if (cur === 'photo') return finishThing();
  if (cur === 'more') return show('review');
  if (cur === 'review') return send();
}
$('next').onclick = next;
$('back').onclick = () => {
  let p; do p = stack.pop(); while (p && isQ(p) && !(S.cur && qList(qParts(p).k, qParts(p).part, S.cur.a).some(q => 'q-' + qParts(p).k + '-' + q.id === p)));
  if (p) show(p, false); else leave();
};
// ✕: back to the first screen; anything added and not sent is lost, so ask first
function leave() {
  if ((S.items.length || S.checks.length) && !DONE && !confirm("Leave? What you added here hasn't been sent.")) return;
  Object.assign(S, { items: [], checks: [], cur: null, lastMain: null }); stack = []; show('start', false);
}
$('exit').onclick = leave;
$('start-go').onclick = () => show('loc');

// ── where are you ──
$('gps-go').onclick = () => {
  if (!('geolocation' in navigator)) return gpsFailed('This browser cannot share a location. Pick the place on the map instead.');
  $('gps-go').disabled = true; $('gps-go').textContent = 'Finding you…'; $('gps-msg').hidden = true;
  navigator.geolocation.getCurrentPosition((p) => {
    $('gps-go').disabled = false; $('gps-go').textContent = 'Use my location';
    const { latitude: lat, longitude: lng, accuracy } = p.coords;
    if (!inHmda(lng, lat)) return gpsFailed('Your phone places you outside the Hyderabad area (HMDA). This survey is for Hyderabad.');
    S.place = { lat, lng, acc: Math.round(accuracy), memory: false };
    goNear();
  }, (err) => gpsFailed(err.code === 1
      ? "Location is off for this site. Turn it on in your browser's settings for this page, then press Use my location again. Or pick the place on the map: what you add is then marked “from memory”."
      : "We couldn't get your location. Try again in a moment, ideally in the open, or pick the place on the map."),
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
};
function gpsFailed(t) { $('gps-go').disabled = false; $('gps-go').textContent = 'Try again'; $('gps-msg').textContent = t; $('gps-msg').hidden = false; }
$('to-mark').onclick = () => { S.mark = null; show('mark'); };
document.querySelectorAll('[data-fakeplace]').forEach(a => a.onclick = (e) => { e.preventDefault(); const [lat, lng] = a.dataset.fakeplace.split(',').map(Number); S.place = { lat, lng, acc: 8, memory: false }; goNear(); });
const marker = mapMark($('markbox'), { onChange: ({ lat, lng, ok }) => { S.mark = { lat, lng, ok }; updateNext(); } });

// ── around you ──
async function goNear() {
  S.near = null; show('near');
  try {
    const r = await fetch(`${C.API}/${SURVEY}/around?lat=${S.place.lat.toFixed(5)}&lng=${S.place.lng.toFixed(5)}`, { credentials: 'omit', cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    S.near = await r.json();
  } catch { S.near = { stretches: [], junctions: [], stops: [], rows: [], profiles: {}, stop_profiles: {}, failed: true }; }
  if (cur === 'near') drawNear();
}
const N = () => S.near || { stretches: [], junctions: [], stops: [], rows: [], profiles: {}, stop_profiles: {} };
const checked = (id) => S.checks.some(c => c.id === id);
function nearItems() {
  const n = N(), out = [];
  for (const s of n.stretches.slice(0, 2)) for (const side of s.sides) {
    const key = `${s.id}:${side}`, p = n.profiles[key], brg = bearingNear(s.c, S.place), nm = s.name || 'Main road';
    const v = p ? footColor(currentOf(p)) : null;
    out.push({ kind: 'side', d: s.d, ord: 0, key, stretch: s.id, side, p, ic: 'F', col: p ? (v ? VIEW_COLORS[v] : '#8C8C8C') : GREY,
      t: `Footpath, ${nm}`, m: `${sideName(brg, side)} · ${p ? people(p.n) : 'no one yet'}`, act: p ? 'Check' : 'Describe', title: `${nm}, ${sideName(brg, side).toLowerCase()}` });
  }
  for (const st of n.stops.filter(x => x.d <= 300).slice(0, 3)) {
    const p = n.stop_profiles[st.id];
    out.push({ kind: 'stop', d: st.d, ord: 1, stop: st, p, ic: 'B', col: p ? '#2166AC' : GREY, t: `Bus stop: ${st.name}`,
      m: [st.towards && `towards ${st.towards}`, `${st.d} m`, p ? people(p.n) : 'no one yet'].filter(Boolean).join(' · '), act: p ? 'Check' : 'Describe', title: stopTitle(st) });
  }
  for (const j of n.junctions.filter(x => x.d <= NEAR_JUNCTION_M)) {
    const p = n.profiles[j.id], v = p ? crossColor(currentOf(p)) : null;
    out.push({ kind: 'junction', d: j.d, ord: 1, j, p, ic: 'X', round: true, col: p ? (v ? VIEW_COLORS[v] : '#111827') : GREY, t: `Crossing: ${j.name}`,
      m: `${j.d} m · ${p ? people(p.n) : 'no one yet'}`, act: p ? 'Check' : 'Describe', title: j.name });
  }
  for (const r of n.rows) {
    const base = { kind: r.item, d: r.d, ord: 1, row: r };
    if (r.item === 'crossing') out.push({ ...base, ic: 'X', round: true, col: '#111827', t: 'Crossing between junctions', m: `${r.d} m · seen ${day(r.seen)}`, act: 'Check', title: 'A crossing between junctions' });
    if (r.item === 'spot') out.push({ ...base, ic: 'F', col: VIEW_COLORS[footColor(r.answers)] || GREY, t: 'Footpath here', m: `${r.d} m · seen ${day(r.seen)}`, act: 'Check', title: 'The footpath here' });
    if (r.item === 'problem') out.push({ ...base, ic: '!', col: (PROBLEMS.find(p => p[0] === r.problem) || [, , '#6B7280'])[2], t: problemName(r.problem),
      m: [`${r.d} m`, `seen ${day(r.seen)}`, r.still && `${r.still} said still there`].filter(Boolean).join(' · '), act: 'Still there?', title: problemName(r.problem) });
    if (r.item === 'request') out.push({ ...base, ic: '+', round: true, col: REQUEST_COLOR, t: `Needed: ${needName(r.need).toLowerCase()}`, m: `${r.d} m · ${people(1 + r.metoo)} asked`, act: 'Me too', title: `Needed: ${needName(r.need).toLowerCase()}` });
  }
  return out.sort((a, b) => a.ord - b.ord || a.d - b.d);
}
let NEAR = [];
function drawNear() {
  $('h-near').textContent = S.place && S.place.memory ? 'Around this place' : 'Around you';
  $('near-msg').hidden = !(S.near && S.near.failed);
  $('near-msg').textContent = "We couldn't load what's already here just now. You can still add something new.";
  NEAR = nearItems();
  $('nearlist').innerHTML = !S.near ? '<li class="none">Looking…</li>' : NEAR.map((x, i) => {
    const done = x.row && checked(x.row.id) || x.p && checked(x.p.latest);
    return `<li><span class="ic${x.round ? ' r' : ''}" style="background:${x.col}">${x.ic}</span><span class="t">${esc(x.t)}<small>${esc(x.m)}</small></span>`
      + `<button type="button" data-near="${i}"${done ? ' disabled' : ''}>${done ? 'Added' : esc(x.act)}</button></li>`;
  }).join('') || '<li class="none">Nothing described near here yet. Be the first: add something below.</li>';
  drawMini();
}
$('nearlist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-near]'); if (!b || b.disabled) return;
  const x = NEAR[+b.dataset.near];
  if (x.kind === 'request') { addCheck({ survey: SURVEY, id: x.row.id, kind: 'metoo', title: x.title }); return show('more'); }
  if (x.act === 'Describe') {
    if (x.kind === 'side') return startThing('foot', { stretch: x.stretch, side: x.side, side_how: 'list', title: x.title });
    if (x.kind === 'stop') return startStop(x.stop);
    if (x.kind === 'junction') return startThing('cross', { junction: x.j.id, title: x.title });
  }
  showCheck(x);
});
document.querySelectorAll('[data-new]').forEach(b => b.onclick = () => {
  const k = b.dataset.new;
  if (k === 'stop') { $('stop-name').value = ''; $('stop-towards').value = ''; S.cur = newThing('stop', { missing: true }); return show('stopname'); }
  if (k === 'cross') { S.cur = newThing('cross', { between: true, title: 'A crossing between junctions' }); return pinThen(() => firstQ()); }
  show(k === 'problem' ? 'report' : 'ask');
});
// the little map: you, the road sides near you and what's around
let mini = null;
function miniGeo() {
  const n = N(), f = [];
  for (const s of n.stretches) for (const side of s.sides) {
    const p = n.profiles[`${s.id}:${side}`], v = p ? footColor(currentOf(p)) : null;
    f.push({ type: 'Feature', properties: { side, col: p ? (v ? VIEW_COLORS[v] : '#8C8C8C') : GREY }, geometry: { type: 'LineString', coordinates: s.c } });
  }
  const pt = (lng, lat, col, sq) => f.push({ type: 'Feature', properties: { col, sq: sq ? 1 : 0 }, geometry: { type: 'Point', coordinates: [lng, lat] } });
  for (const st of n.stops) pt(st.lng, st.lat, n.stop_profiles[st.id] ? '#2166AC' : GREY, true);
  for (const j of n.junctions) pt(j.c[0], j.c[1], n.profiles[j.id] ? '#111827' : '#fff');
  for (const r of n.rows) pt(r.lng, r.lat, r.item === 'problem' ? '#EF8A62' : r.item === 'request' ? REQUEST_COLOR : '#111827', r.item === 'problem');
  return { type: 'FeatureCollection', features: f };
}
let miniMe = null;
function drawMini() {
  if (!S.place) return;
  const at = [S.place.lng, S.place.lat];
  if (!mini) {
    mini = new maplibregl.Map({ container: 'minimap', style: STYLE, center: at, zoom: 16.3, interactive: false, attributionControl: { compact: true } });
    compact(mini);
    mini.on('load', () => {
      mini.addSource('m', { type: 'geojson', data: miniGeo() });
      const off = (s) => ['interpolate', ['exponential', 2], ['zoom'], 12, s * 0.6, 19, s * 9];
      for (const s of ['l', 'r']) mini.addLayer({ id: 'm-' + s, type: 'line', source: 'm', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'side'], s]],
        paint: { 'line-color': ['get', 'col'], 'line-width': 3.5, 'line-offset': off(s === 'l' ? -1 : 1) } });
      mini.addLayer({ id: 'm-p', type: 'circle', source: 'm', filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 5.5, 'circle-color': ['get', 'col'], 'circle-stroke-color': '#111827', 'circle-stroke-width': 1 } });
    });
  } else { mini.resize(); mini.jumpTo({ center: at, zoom: 16.3 }); mini.getSource('m')?.setData(miniGeo()); }
  if (!miniMe) miniMe = new maplibregl.Marker({ element: mkEl('me') }).setLngLat(at).addTo(mini); else miniMe.setLngLat(at);
}

// ── checking something already described ──
function showCheck(x) {
  const prob = x.kind === 'problem';
  let lines = [], latest = null, surveyId = SURVEY, k = null, prefill = null;
  if (x.kind === 'side') { k = 'foot'; lines = profileLines('foot', x.p, 6); latest = x.p.latest; prefill = currentOf(x.p); }
  if (x.kind === 'stop') { k = 'stop'; lines = profileLines('stop', x.p, 6); latest = x.p.latest; surveyId = 'bus-stops'; prefill = currentOf(x.p); }
  if (x.kind === 'junction') { k = 'cross'; lines = profileLines('cross', x.p, 6); latest = x.p.latest; prefill = currentOf(x.p); }
  if (x.kind === 'crossing' || x.kind === 'spot') {
    k = x.kind === 'crossing' ? 'cross' : 'foot'; latest = x.row.id; prefill = x.row.answers || {};
    lines = allQs(k).filter(q => shown(q, prefill) && real(prefill[q.id])).slice(0, 6).map(q => [q.s, q.multi ? prefill[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, prefill[q.id]), '']);
  }
  $('check-k').textContent = prob ? 'Problem' : KIND_NAME[k];
  $('check-h').textContent = x.title;
  $('check-m').textContent = prob ? [`Marked ${day(x.row.seen)}`, x.row.still && `${people(x.row.still)} said it's still there`, x.row.gone && `${x.row.gone} said it's gone`].filter(Boolean).join(' · ')
    : x.p ? `${people(x.p.n)} · last seen ${day(x.p.seen)}` : `Seen ${day(x.row.seen)}`;
  $('check-a').innerHTML = lines.map(([a, b, c]) => `<li><span>${esc(a)}</span><b>${esc(b)}</b>${c ? `<small>${esc(c)}</small>` : ''}</li>`).join('');
  $('check-a').hidden = !lines.length;
  $('check-q').textContent = prob ? 'Is it still there?' : 'Is this still what you see?';
  $('check-same').textContent = prob ? 'Still there' : 'Still the same';
  $('check-change').textContent = prob ? "It's gone" : 'Something changed';
  $('check-same').onclick = () => { addCheck({ survey: surveyId, id: latest, kind: 'confirm', title: x.title }); S.lastMain = null; show('more'); };
  $('check-change').onclick = prob ? () => { addCheck({ survey: SURVEY, id: x.row.id, kind: 'gone', title: x.title }); show('more'); }
    : () => {
      const ctx = { title: x.title, prefill, check: { survey: surveyId, id: latest } };
      if (x.kind === 'side') return startThing('foot', { ...ctx, stretch: x.stretch, side: x.side, side_how: 'list' });
      if (x.kind === 'stop') return startThing('stop', { ...ctx, ...stopCtx(x.stop) });
      if (x.kind === 'junction') return startThing('cross', { ...ctx, junction: x.j.id });
      startThing(k, { ...ctx, check: null, lat: x.row.lat, lng: x.row.lng, between: x.kind === 'crossing' });   // a new point where that one is
    };
  show('check');
}
function addCheck(c) { if (!S.checks.some(x => x.id === c.id && x.kind === c.kind)) S.checks.push(c); }

// ── things: a bus stop, footpath or crossing (core questions, photo, then more), a problem or a request ──
function newThing(k, ctx = {}) { return { k, a: {}, seen: new Set(), more: false, at: new Date().toISOString(), photo: null, note: '', ...ctx }; }
// answers to compare with the place's current ones: only questions the person saw; "Don't know" adds nothing
const snap = (a, seen) => JSON.stringify(Object.keys(a).filter(k => a[k] != null && a[k] !== 'dk' && (!seen || seen.has(k))).sort().map(k => [k, a[k]]));
function startThing(k, ctx = {}) {
  const { prefill, ...rest } = ctx;
  S.cur = newThing(k, rest);
  if (prefill && Object.keys(prefill).length) {
    const ids = new Set(allQs(k).map(q => q.id));
    S.cur.a = structuredClone(Object.fromEntries(Object.entries(prefill).filter(([q]) => ids.has(q))));
    S.cur.base = snap(S.cur.a); S.cur.baseA = structuredClone(S.cur.a);
  }
  firstQ();
}
function firstQ() { const q = qList(S.cur.k, 'core', S.cur.a)[0]; show(`q-${S.cur.k}-${q.id}`); }
// the photo screen's Next: the thing is added (a footpath, crossing or stop with nothing changed is a "still the same")
function finishThing() {
  const t = S.cur;
  t.note = $('note').value.trim();
  if (t.base && t.check && snap(t.a, t.seen) === snap(t.baseA, t.seen) && !t.photo && !t.note) {
    addCheck({ ...t.check, kind: 'confirm', title: t.title }); S.lastMain = null; S.items = S.items.filter(x => x !== t);
  } else {
    if (!S.items.includes(t)) S.items.push(t);
    S.lastMain = SETS[t.k] ? t : S.lastMain;
  }
  show('more');
}
// answers: one tap chooses and moves on; ticks toggle
$('topics').addEventListener('click', (e) => {
  const b = e.target.closest('.answer'); if (!b || !S.cur) return;
  const [k, id] = b.closest('[data-q]').dataset.q.split('|'), q = allQs(k).find(x => x.id === id), a = S.cur.a, v = b.dataset.v;
  if (q.multi) {
    const t = new Set(a[id] || []); t.has(v) ? t.delete(v) : t.add(v);
    if (v === 'none' && t.has('none')) t.forEach(x => x !== 'none' && t.delete(x)); else if (v !== 'none') t.delete('none');
    if (t.size) a[id] = [...t]; else delete a[id];
    return drawAnswers();
  }
  if (moving) return;
  a[id] = v; drawAnswers(); moving = true;
  setTimeout(() => { moving = false; next(); }, 200);
});
function drawAnswers() {
  const t = S.cur; if (!t || !SETS[t.k]) return;
  for (const q of allQs(t.k)) {
    if (!shown(q, t.a)) delete t.a[q.id];          // a follow-up whose first answer changed
    const v = t.a[q.id], was = t.baseA && t.baseA[q.id];
    document.querySelectorAll(`[data-q="${t.k}|${q.id}"] .answer`).forEach(o => {
      const k = o.dataset.v;
      o.setAttribute('aria-checked', q.multi ? !!(v || []).includes(k) : k === v);
      const last = was != null && (q.multi ? was.includes(k) : was === k);
      let tag = o.querySelector('.last');
      if (last && !tag) { tag = document.createElement('span'); tag.className = 'last'; tag.textContent = 'Current answer'; o.querySelector('.tick').before(tag); }
      if (!last && tag) tag.remove();
    });
  }
  updateNext();
}

// ── put the pin on it (within 100 m of you; from memory anywhere near the place) ──
let pinMap = null, pinMe = null;
function pinThen(after) {
  S.pinNext = after;
  const k = S.cur.k;
  $('pin-h').textContent = k === 'problem' ? 'Where exactly is it?' : k === 'request' ? 'Where is it needed?' : k === 'stop' ? 'Where is the stop?' : 'Where is the crossing?';
  show('pin');
}
function openPin() {
  const at = [S.cur.lng ?? S.place.lng, S.cur.lat ?? S.place.lat];
  if (!pinMap) {
    pinMap = new maplibregl.Map({ container: 'pinmap', style: STYLE, center: at, zoom: 18, minZoom: 14, maxZoom: 19.5, attributionControl: { compact: true } });
    pinMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right'); compact(pinMap);
    pinMap.on('move', pinInfo);
  } else { pinMap.resize(); pinMap.jumpTo({ center: at, zoom: 18 }); }
  if (!S.place.memory) { if (!pinMe) pinMe = new maplibregl.Marker({ element: mkEl('me') }).setLngLat([S.place.lng, S.place.lat]).addTo(pinMap); else pinMe.setLngLat([S.place.lng, S.place.lat]); }
  else if (pinMe) { pinMe.remove(); pinMe = null; }
  pinInfo();
}
function pinInfo() {
  const c = pinMap.getCenter(), d = metres(S.place, { lat: c.lat, lng: c.lng });
  S.pinOk = (S.place.memory ? d <= 500 : d <= MAX_MOVE) && inHmda(c.lng, c.lat);
  $('pin-info').textContent = !S.pinOk ? (S.place.memory ? 'Keep the pin near the place you picked.' : `The pin can be up to ${MAX_MOVE} m from where you are. Walk closer, if it's safe.`)
    : S.place.memory ? 'Move the map so the pin sits on it.' : d < 3 ? 'Blue is you. Move the map so the pin sits on it.' : `${Math.round(d)} m from you.`;
  if (cur === 'pin') updateNext();
}

// ── bus stops ──
const stopTitle = (st) => st.name + (st.towards ? `, towards ${st.towards}` : '');
const stopCtx = (st) => ({ stop_id: st.id, name: st.name, towards: st.towards, slat: st.lat, slng: st.lng, d: st.d, title: stopTitle(st) });
function startStop(st) {
  const p = N().stop_profiles[st.id];
  if (p) return showCheck({ kind: 'stop', stop: st, p, title: stopTitle(st) });
  startThing('stop', stopCtx(st));
}
function drawStops() {
  const n = N();
  $('stoplist').innerHTML = n.stops.map((st, i) => answerBtn(`data-stop="${i}"`, `${esc(st.name)}<small>${esc([st.towards && 'towards ' + st.towards, `${st.d} m`, n.stop_profiles[st.id] ? people(n.stop_profiles[st.id].n) : null].filter(Boolean).join(' · '))}</small>`, '', ' go')).join('')
    + answerBtn('data-stop="new"', "My stop isn't on this list", '', ' add');
}
$('stoplist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-stop]'); if (!b) return;
  if (b.dataset.stop === 'new') { $('stop-name').value = ''; $('stop-towards').value = ''; S.cur = newThing('stop', { missing: true }); return show('stopname'); }
  startStop(N().stops[+b.dataset.stop]);
});
$('stop-name').addEventListener('input', updateNext);

// ── crossings ──
function drawCross() {
  const n = N(), js = n.junctions.filter(j => j.d <= NEAR_JUNCTION_M);
  $('crosslist').innerHTML = js.map((j, i) => answerBtn(`data-j="${i}"`, `${esc(j.name)}<small>${j.d} m · ${n.profiles[j.id] ? people(n.profiles[j.id].n) + ' described it' : 'no one yet'}</small>`, '', ' go')).join('')
    + answerBtn('data-j="new"', "A crossing here, not at a junction<small>You'll put the pin on it</small>", '', ' add');
}
$('crosslist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]'); if (!b) return;
  if (b.dataset.j === 'new') { S.cur = newThing('cross', { between: true, title: 'A crossing between junctions' }); return pinThen(() => firstQ()); }
  const j = N().junctions.filter(x => x.d <= NEAR_JUNCTION_M)[+b.dataset.j], p = N().profiles[j.id];
  if (p) return showCheck({ kind: 'junction', j, p, title: j.name });
  startThing('cross', { junction: j.id, title: j.name });
});

// ── problems and requests ──
$('problist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-prob]'); if (!b) return;
  S.cur = newThing('problem', { problem: b.dataset.prob, title: problemName(b.dataset.prob) });
  if (b.dataset.prob === 'blocked') return show('blockedby');
  pinThen(() => show('photo'));
});
$('mainlist').addEventListener('click', (e) => { const b = e.target.closest('[data-main]'); if (b) addMain(b.dataset.main); });
$('asklist').addEventListener('click', (e) => {
  const b = e.target.closest('[data-need]'); if (!b) return;
  S.cur = newThing('request', { need: b.dataset.need, title: `Needed: ${needName(b.dataset.need).toLowerCase()}` });
  pinThen(() => show('photo'));
});
function drawBlocked() { $('blist').querySelectorAll('.answer').forEach(o => o.setAttribute('aria-checked', (S.cur.blocked_by || []).includes(o.dataset.v))); }
$('blist').addEventListener('click', (e) => {
  const b = e.target.closest('.answer'); if (!b) return;
  const t = new Set(S.cur.blocked_by || []); t.has(b.dataset.v) ? t.delete(b.dataset.v) : t.add(b.dataset.v); S.cur.blocked_by = [...t];
  drawBlocked(); updateNext();
});

// ── the footpath: at a bus stop the stop's side; on a main road, choose the side; elsewhere a single point ──
function startFoot() {
  const st = S.items.find(i => i.k === 'stop');
  const sp = st && (st.missing ? { lat: st.lat, lng: st.lng } : { lat: st.slat, lng: st.slng });
  if (sp && sp.lat != null && (S.place.memory || metres(S.place, sp) <= MAX_MOVE))
    return startThing('foot', { lat: sp.lat, lng: sp.lng, side_how: 'stop', title: `At the stop: ${st.name}` });
  if (N().stretches.length) { Object.assign(SP, { group: null, pick: null, heading: null, how: 'compass', note: '' }); return show('sidepick'); }
  startThing('foot', { title: 'The footpath here' });
}
// SP: the road (by name), its sides near you, the chosen one, how it was chosen, the compass reading
const SP = { group: null, pick: null, heading: null, live: null, how: 'compass', note: '' };
const groups = () => { const g = []; for (const s of N().stretches) { const nm = s.name || 'Main road'; if (!g.includes(nm)) g.push(nm); } return g; };
function cands() {
  return N().stretches.filter(s => (s.name || 'Main road') === SP.group).flatMap(s => s.sides.map(side => {
    const brg = bearingNear(s.c, S.place);
    return { stretch: s.id, side, brg, n: outward(brg, side), d: s.d, c: s.c, name: s.name || 'Main road' };
  }));
}
function drawSide() {
  const g = groups(); if (!SP.group) SP.group = g[0];
  $('roadpick').hidden = g.length < 2;
  $('roadchips').innerHTML = g.map(nm => `<button type="button" aria-pressed="${nm === SP.group}" data-road="${esc(nm)}">${esc(nm)}</button>`).join('');
  $('compassbox').hidden = SP.how !== 'compass'; $('trafficbox').hidden = SP.how !== 'traffic';
  const cs = cands(), seen = new Set();
  $('trafficopts').innerHTML = cs.map((c, i) => [i, c, `Towards the ${compass8((c.n + 90) % 360)}`]).sort((a, b) => a[1].d - b[1].d)
    .filter(([, , l]) => !seen.has(l) && seen.add(l)).map(([i, , l]) => `<button type="button" class="answer" role="radio" aria-checked="${SP.how === 'traffic' && SP.pick === i}" data-side="${i}"><span>${esc(l)}</span><i class="tick"></i></button>`).join('');
  $('compass-go').textContent = SP.heading != null ? `Facing ${compass8(SP.heading)}. Read again` : 'Read the direction';
  if (SP.heading != null) $('heading-v').textContent = `${compass8(SP.heading)} (${Math.round(SP.heading)}°), read`;
  const c = cs[SP.pick];
  $('sidepicked').innerHTML = SP.note ? esc(SP.note) : c ? `You're on <b>${esc(c.name)}, ${sideName(c.brg, c.side).toLowerCase()}</b>: the thick line. Not right? Tap the other side.` : 'Or tap your side on the map.';
  drawSideMap();
  startCompass();
  updateNext();
}
$('roadchips').addEventListener('click', (e) => { const b = e.target.closest('[data-road]'); if (!b) return; SP.group = b.dataset.road; SP.pick = null; SP.heading = null; drawSide(); });
$('to-traffic').onclick = (e) => { e.preventDefault(); SP.how = 'traffic'; SP.pick = null; SP.note = ''; drawSide(); };
$('to-compass').onclick = (e) => { e.preventDefault(); SP.how = 'compass'; SP.pick = null; SP.note = ''; drawSide(); };
$('trafficopts').addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (!b) return; SP.pick = +b.dataset.side; drawSide(); });
// facing the road and pointing across it: the side you're on faces the other way
function pickByHeading(h) {
  SP.heading = h; SP.note = '';
  const cs = cands(); let best = null;
  cs.forEach((c, i) => { const a = angle(c.n, (h + 180) % 360); if (!best || a < best[0]) best = [a, i]; });
  SP.pick = best ? best[1] : null; drawSide();
}
// the phone's compass: a live reading while this screen is open (where the phone gives one without asking), read on a tap
let compassOn = false;
const onTurn = (ev) => {
  const d = ev.webkitCompassHeading != null ? ev.webkitCompassHeading : ev.absolute && ev.alpha != null ? 360 - ev.alpha : null;
  if (d == null) return;
  SP.live = d; turnings.push(d); if (turnings.length > 30) turnings.shift();
  if (SP.heading == null && cur === 'sidepick') { $('heading-v').textContent = `${compass8(d)} (${Math.round(d)}°)`; aimYou(d); }
};
let turnings = [];
function startCompass() {
  if (compassOn || typeof DeviceOrientationEvent === 'undefined' || DeviceOrientationEvent.requestPermission) return;   // iPhones ask first, on the button
  window.addEventListener('deviceorientationabsolute', onTurn); window.addEventListener('deviceorientation', onTurn); compassOn = true;
}
function stopCompass() {
  if (!compassOn) return;
  window.removeEventListener('deviceorientationabsolute', onTurn); window.removeEventListener('deviceorientation', onTurn); compassOn = false;
}
$('compass-go').onclick = async () => {
  const fallback = (t) => { SP.how = 'traffic'; SP.pick = null; SP.note = t; drawSide(); };
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
      if (await DeviceOrientationEvent.requestPermission() !== 'granted') return fallback("The compass wasn't allowed, so answer this instead.");
      if (!compassOn) { window.addEventListener('deviceorientation', onTurn); compassOn = true; }
    }
  } catch { return fallback("The compass isn't available, so answer this instead."); }
  startCompass();
  $('compass-go').disabled = true; $('compass-go').textContent = 'Reading the compass…';
  turnings = [];
  await new Promise(r => setTimeout(r, 1200));
  $('compass-go').disabled = false;
  if (!turnings.length) return fallback("This phone doesn't share its compass, so answer this instead.");
  const k = Math.PI / 180, x = turnings.reduce((a, d) => a + Math.cos(d * k), 0), y = turnings.reduce((a, d) => a + Math.sin(d * k), 0);
  const h = (Math.atan2(y, x) / k + 360) % 360; aimYou(h); pickByHeading(h);
};
document.querySelectorAll('[data-fakeheading]').forEach(a => a.onclick = (e) => { e.preventDefault(); const h = +a.dataset.fakeheading; aimYou(h); pickByHeading(h); });
// the side map: the road's sides near you (tap one), you as a blue dot with the way the phone points
let smap = null, sMe = null;
const YOU_SVG = '<svg viewBox="-60 -60 120 120"><path d="M0 0 L-22 -54 A58 58 0 0 1 22 -54 Z" fill="#2166AC" fill-opacity=".22"/><path d="M0 -12 L0 -42" stroke="#2166AC" stroke-width="3" stroke-linecap="round"/><path d="M-6 -36 L0 -44 L6 -36" fill="none" stroke="#2166AC" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle r="8" fill="#2166AC" stroke="#fff" stroke-width="3"/></svg>';
function aimYou(d) { const s = sMe && sMe.getElement().querySelector('svg'); if (s) s.style.transform = `rotate(${d}deg)`; }
function sideGeo() {
  return { type: 'FeatureCollection', features: cands().map((c, i) => ({ type: 'Feature', properties: { i, side: c.side, on: i === SP.pick ? 1 : 0 }, geometry: { type: 'LineString', coordinates: c.c } })) };
}
function drawSideMap() {
  const at = [S.place.lng, S.place.lat];
  if (!smap) {
    smap = new maplibregl.Map({ container: 'sidemap', style: STYLE, center: at, zoom: 17.6, minZoom: 15, maxZoom: 19.5, attributionControl: { compact: true } });
    compact(smap);
    smap.on('load', () => {
      smap.addSource('c', { type: 'geojson', data: sideGeo() });
      for (const s of ['l', 'r']) smap.addLayer({ id: 'c-' + s, type: 'line', source: 'c', filter: ['==', ['get', 'side'], s], layout: { 'line-cap': 'round' },
        paint: { 'line-color': ['case', ['==', ['get', 'on'], 1], '#111827', '#9CA3AF'], 'line-width': ['case', ['==', ['get', 'on'], 1], 9, 6],
          'line-offset': ['interpolate', ['exponential', 2], ['zoom'], 15, s === 'l' ? -3 : 3, 19, s === 'l' ? -22 : 22] } });
      smap.on('click', (e) => {
        const f = smap.queryRenderedFeatures([[e.point.x - 14, e.point.y - 14], [e.point.x + 14, e.point.y + 14]], { layers: ['c-l', 'c-r'] })[0];
        if (!f) return; SP.pick = f.properties.i; SP.how = SP.how === 'traffic' ? 'traffic' : 'map'; SP.heading = null; SP.note = ''; drawSide();
      });
    });
  } else { smap.resize(); smap.getSource('c')?.setData(sideGeo()); }
  if (!sMe) sMe = new maplibregl.Marker({ element: mkEl('youdir', YOU_SVG) }).setLngLat(at).addTo(smap);
  sMe.setLngLat(at); if (S.place.memory) sMe.getElement().style.display = 'none'; else sMe.getElement().style.display = '';
  smap.jumpTo({ center: at });
  if (SP.heading != null) aimYou(SP.heading);
}
function sideChosen() {
  const cs = cands(), mine = cs[SP.pick];
  const other = cs.filter(c => angle(c.n, mine.n) > 120).sort((a, b) => a.d - b.d)[0];
  SP.mine = mine; SP.other = other;
  const base = { side_how: SP.how === 'map' ? 'map' : SP.how, road_deg: SP.heading != null ? Math.round(SP.heading) % 360 : null };
  if (!other) return startThing('foot', { ...base, stretch: mine.stretch, side: mine.side, which: 'mine', title: `${mine.name}, ${sideName(mine.brg, mine.side).toLowerCase()}` });
  SP.base = base; show('sidewhich');
}
function drawWhich() {
  const m = SP.mine, o = SP.other, ms = sideName(m.brg, m.side).toLowerCase(), os = sideName(o.brg, o.side).toLowerCase();
  $('sw-hint').textContent = `You're on the ${ms} of ${m.name}.`;
  $('swopts').innerHTML = [['mine', 'My side', cap(ms)], ['other', 'The other side', `${cap(os)} · marked “seen from across the road”`], ['both', 'Both sides, the same', 'One set of answers for both']]
    .map(([v, l, sub]) => `<button type="button" class="answer" role="radio" aria-checked="false" data-which="${v}"><span>${l}<small>${esc(sub)}</small></span><i class="tick"></i></button>`).join('');
}
$('swopts').addEventListener('click', (e) => {
  const b = e.target.closest('[data-which]'); if (!b) return;
  const v = b.dataset.which, m = SP.mine, o = SP.other, t = v === 'other' ? o : m;
  const title = v === 'both' ? `${m.name}, both sides` : `${t.name}, ${sideName(t.brg, t.side).toLowerCase()}${v === 'other' ? ' (seen from across)' : ''}`;
  startThing('foot', { ...SP.base, stretch: t.stretch, side: t.side, which: v, title, ...(v === 'both' ? { also: { stretch: o.stretch, side: o.side } } : {}) });
});

// ── add more here? ──
function addMain(k) {
  if (k === 'stop') return show('stoppick');
  if (k === 'foot') return startFoot();
  if (k === 'cross') return show('crosspick');
  if (k === 'ask') return show('ask');
  if (k === 'problem') return show('report');
  if (k === 'near') return show('near');
  if (k.startsWith('more:')) { S.cur = S.items[+k.slice(5)]; const q = qList(S.cur.k, 'more', S.cur.a)[0]; return show(`q-${S.cur.k}-${q.id}`); }
}
const itemLine = (i) => i.k === 'problem' || i.k === 'request' ? i.title : `${KIND_NAME[i.k]}: ${i.title || ''}`;
const CHECK_SAYS = { confirm: 'Still the same', gone: 'Gone', metoo: 'Me too' };
const checkLine = (c) => `${c.kind === 'confirm' && /problem/i.test(c.title) ? 'Still there' : CHECK_SAYS[c.kind]}: ${c.title}`;
function drawMore() {
  const has = (k) => S.items.some(i => i.k === k), stop = S.items.find(i => i.k === 'stop');
  $('added').innerHTML = 'Added: ' + [...S.items.map(itemLine), ...S.checks.map(checkLine)].map(x => `<b>${esc(x)}</b>`).join(', ');
  const opts = [];
  // "more" for every bus stop, footpath or crossing added here that hasn't had it yet, the latest first
  S.items.map((i, n) => [i, n]).filter(([i]) => SETS[i.k] && !i.more).reverse()
    .forEach(([i, n]) => opts.push([`more:${n}`, `More about this ${SETS[i.k].name.toLowerCase()}`, SETS[i.k].moreSays]));
  if (!has('foot')) opts.push(['foot', stop ? 'The footpath at this stop' : 'The footpath here', 'Is there one, its height, broken or blocked']);
  if (!has('cross')) opts.push(['cross', 'The crossing near here', 'At the junction, or one between junctions']);
  if (!has('stop')) opts.push(['stop', 'A bus stop here', '']);
  opts.push(['problem', 'A problem here', 'Broken, blocked, open drain, waterlogging, garbage…'], ['ask', 'Ask for something', 'A crossing, footpath, bus stop or lights is needed'],
    ['near', 'Check something else nearby', '']);
  $('morelist').innerHTML = opts.map(([k, l, s]) => answerBtn(`data-add="${k}"`, `${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}`, '', ' go')).join('');
}
$('morelist').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) addMain(b.dataset.add); });

// ── photo and note ──
function drawPhoto() {
  const t = S.cur;
  $('photo-h').textContent = t.k === 'request' ? 'Add a photo of the place?' : 'Add a photo?';
  $('photo-prev').style.display = t.photo ? 'block' : 'none'; if (t.photo) $('photo-prev').src = t.photo;
  $('photo-btn').textContent = t.photo ? 'Use a different photo' : 'Take or choose a photo';
  $('photo-info').textContent = t.photo ? 'Photo added.' : 'The phone makes it smaller and removes the location stored in it.';
  $('note').value = t.note || '';
  $('note').placeholder = t.k === 'request' ? 'For example: children cross here to the school' : t.k === 'problem' ? 'For example: there every morning' : 'For example: cars parked on the footpath every evening';
  $('note-l').textContent = (t.k === 'problem' && t.problem === 'other') || (t.k === 'request' && t.need === 'other') ? 'What is it?' : 'Anything to add? (optional)';
}
$('note').addEventListener('input', () => { if (S.cur) S.cur.note = $('note').value.trim(); updateNext(); });
$('photo-in').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  $('photo-info').textContent = 'Preparing the photo…';
  try { const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    S.cur.photo = c.toDataURL('image/jpeg', .82); drawPhoto(); } catch { $('photo-info').textContent = "This photo couldn't be read. Try a different one."; }
  e.target.value = ''; updateNext();
});

// ── the player: nickname + 4-digit PIN, the same as for bus stops, checked with the server ──
const cleanNick = (v) => v.trim().replace(/\s+/g, ' ');
const pinOk = (v) => /^\d{4}$/.test(v);
const profileUrl = (n) => `../profile/?n=${encodeURIComponent(n)}`;
function drawPlay() {
  const p = player.get();
  $('play-box').hidden = !!p; $('play-in').hidden = !p;
  $('start-go').textContent = p ? 'Start' : 'Start anonymously';
  if (p) { $('play-name').textContent = p.nick; $('play-prof').href = profileUrl(p.nick); }
}
let pmode = 'create';
function setPMode(m) {
  pmode = m; const c = m === 'create';
  $('p-title').textContent = c ? 'Pick a nickname' : 'Log in';
  $('p-hint').textContent = c ? 'And a 4-digit PIN, so you can log in on any phone.' : 'The nickname and 4-digit PIN you use for bus stops or walking.';
  $('p-go').textContent = c ? 'Join' : 'Log in';
  $('p-switch-text').textContent = c ? 'Have one already?' : 'New here?';
  $('p-switch').textContent = c ? 'Log in' : 'Pick a nickname';
  $('p-msg').hidden = true;
}
$('play-create').onclick = (e) => { e.preventDefault(); setPMode('create'); show('player'); };
$('play-login').onclick = (e) => { e.preventDefault(); setPMode('login'); show('player'); };
// before sending: anonymous entries earn no points, so offer a profile once more (Teja, 18 Nov 2026)
$('anon-create').onclick = (e) => { e.preventDefault(); setPMode('create'); show('player'); };
$('anon-login').onclick = (e) => { e.preventDefault(); setPMode('login'); show('player'); };
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
    if (PLAYER_SAYS[key]) say(PLAYER_SAYS[key]); else name = r.name || nick;
  } catch (err) {
    say(err.status === 400 ? 'Use 3 to 24 letters, numbers and spaces, and a 4-digit PIN.'
      : err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.'
      : "We couldn't check the nickname; the connection may be weak. Please try again.");
  }
  $('p-go').textContent = pmode === 'create' ? 'Join' : 'Log in'; playerReady();
  if (!name) return;
  player.set(name, pin);
  $('back').onclick();
};

// ── ready to send ──
function itemPoints(i) {
  const mem = S.place && S.place.memory;
  if (i.k === 'stop') return (mem ? POINTS.memory : POINTS.stop) + (i.missing ? POINTS.missing : 0) + (i.photo ? POINTS.photo : 0);
  if (i.k === 'problem' || i.k === 'request') return POINTS[i.k] + (i.photo ? POINTS.photo : 0);
  return (mem ? POINTS.memory : POINTS[ITEM[i.k]]) + (i.photo ? POINTS.photo : 0);
}
const totalPoints = () => S.items.reduce((a, i) => a + itemPoints(i), 0) + S.checks.length * POINTS.confirm;
function drawReview() {
  const sub = (i) => {
    if (i.k === 'problem') return [i.blocked_by && i.blocked_by.length && 'Blocked by ' + i.blocked_by.map(v => BLOCKED_BY.find(o => o[0] === v)[1].toLowerCase()).join(', '), i.photo && 'photo', i.note && `“${i.note}”`];
    if (i.k === 'request') return [i.photo && 'photo', i.note && `“${i.note}”`];
    const n = nAnswered(i.k, answersOf(i));
    return [`${n} answer${n === 1 ? '' : 's'}${i.more ? ', with more' : ''}`, i.missing && 'a new stop', i.which === 'both' && 'both sides', i.photo && 'photo', i.note && `“${i.note}”`];
  };
  $('sum').innerHTML = S.items.map((i, n) => `<li><span>${KIND_NAME[i.k]}</span><b>${esc(i.k === 'problem' || i.k === 'request' ? i.title : i.title || KIND_NAME[i.k])}<small>${esc(sub(i).filter(Boolean).join(' · '))}</small></b><button type="button" data-del="i${n}">Remove</button></li>`).join('')
    + S.checks.map((c, n) => `<li><span>Check</span><b>${esc(checkLine(c))}</b><button type="button" data-del="c${n}">Remove</button></li>`).join('')
    || '<li><span>Nothing added yet</span></li>';
  const p = player.get();
  $('anon').hidden = !!(p && !S.noNick);
  $('accuracy').textContent = S.place && S.place.memory ? 'By sending, you confirm this is what you know of this place, to the best of your knowledge.'
    : 'By sending, you confirm this is what you saw, to the best of your knowledge.';
  $('send-msg').hidden = true;
}
$('sum').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const [t, n] = [b.dataset.del[0], +b.dataset.del.slice(1)];
  if (t === 'i') { const [it] = S.items.splice(n, 1); if (it === S.lastMain) S.lastMain = null; } else S.checks.splice(n, 1);
  drawReview(); updateNext();
});

// ── send: everything at once, with one spam check; if it fails, the answers stay on this phone ──
const store = Contribute.drafts('obs-walk-unsent');
// only the questions the person saw: a place's current answers they never looked at aren't theirs
function answersOf(i) { return Object.fromEntries(allQs(i.k).filter(q => i.seen.has(q.id) && shown(q, i.a) && i.a[q.id] != null).map(q => [q.id, i.a[q.id]])); }
function itemBody(i) {
  const P = S.place, mem = !!P.memory, where = i.lat != null ? { lat: i.lat, lng: i.lng } : { lat: P.lat, lng: P.lng };
  const moved = Math.round(metres(P, where));
  const base = { here: mem ? 'known' : 'yes', observed_at: i.at, accuracy_m: mem ? null : P.acc, lat: +where.lat.toFixed(6), lng: +where.lng.toFixed(6), photo: i.photo || null, prefilled: i.base ? true : null };
  if (i.k === 'stop') return { ...base, item: 'stop', place_type: i.missing ? 'missing' : mem ? 'map' : 'gps', stop_id: i.missing ? null : i.stop_id,
    dist_m: i.missing ? null : Math.round(metres(P, { lat: i.slat, lng: i.slng })), stop_name: i.missing ? i.name : null, towards: i.missing ? i.towards || null : null,
    moved_m: i.missing ? moved : null, improve: i.note || null, ...answersOf(i) };
  const w = { ...base, item: ITEM[i.k] || i.k, place_type: mem ? 'map' : 'gps', moved_m: mem ? null : moved, note: i.note || null };
  if (i.k === 'foot') Object.assign(w, { stretch: i.stretch || null, stretch_side: i.side || null, also_stretch: i.also ? i.also.stretch : null, also_side: i.also ? i.also.side : null,
    which: i.stretch ? i.which || null : null, side_how: i.side_how || null, road_deg: i.road_deg ?? null }, answersOf(i));
  if (i.k === 'cross') Object.assign(w, { junction: i.junction || null }, answersOf(i));
  if (i.k === 'problem') Object.assign(w, { problem: i.problem, p_blocked_by: i.problem === 'blocked' && i.blocked_by && i.blocked_by.length ? i.blocked_by : null });
  if (i.k === 'request') w.need = i.need;
  return w;
}
function payload() {
  const p = player.get(), nk = p && !S.noNick;
  return { mode: 'visit', nick: nk ? p.nick : null, nick_pin: nk ? p.pin : null, device: Contribute.device(),
    items: S.items.map(itemBody), checks: S.checks.map(({ survey, id, kind }) => ({ survey, id, kind })),
    _sum: { n: S.items.length + S.checks.length, points: totalPoints() } };
}
const spam = Contribute.spamCheck($('ts-review'));
async function postIt(body, sc = spam) {
  const token = await sc.token();
  if (token === null) { const e = new Error('spam check'); e.server = true; e.status = 403; throw e; }
  const { _sum, ...b } = body;
  try { return await Contribute.post(`/${SURVEY}/reports`, { ...b, token, website: $('trap').value }); }
  finally { sc.reset(); }
}
function thanks(body, r) {
  const pts = body._sum ? body._sum.points : 0, got = (r.checks || []).filter(x => x === false).length;
  $('thanks-text').textContent = 'Your answers are now public.' + (body.nick ? ` ${pts} points to ${body.nick} on the leaderboard.` : '')
    + (got ? ` ${got === 1 ? 'One check was' : got + ' checks were'} already sent from this phone, so not counted again.` : '');
  $('to-map').href = r.ids && r.ids[0] ? 'map/?r=' + encodeURIComponent(r.ids[0]) : r.stops && r.stops[0] ? '../bus-stops/map/' : 'map/';
  DONE = true; stack = []; show('thanks', false);
}
async function send() {
  if (sending || !ready()) return;
  const body = payload(), saved = { body, at: Date.now(), n: body._sum.n };
  const kept = store.set(saved) || store.set({ ...saved, body: { ...body, items: body.items.map(i => ({ ...i, photo: null })) }, photoDropped: true });
  sending = true; $('send-msg').hidden = true; updateNext(); $('next').textContent = 'Sending…';
  try { const r = await postIt(body); store.drop(kept); sending = false; thanks(body, r); }
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
// entries that didn't go through: offer the oldest on the start screen, with its own spam check
let draftSpam = null;
function showDraft() {
  const d = store.get(); $('draft').hidden = !d; if (!d) return;
  draftSpam = draftSpam || Contribute.spamCheck($('ts-draft'));
  $('draft-text').textContent = `You have ${d.n > 1 ? d.n + ' things' : 'something'} from ${new Date(d.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} that didn't send.${d.photoDropped ? ' The photos were too large to keep.' : ''}`;
  $('draft-send').hidden = false; $('draft-send').disabled = false; $('draft-send').textContent = 'Send it now'; $('draft-drop').textContent = 'Discard it'; $('draft-msg').hidden = true;
  $('draft-send').onclick = async () => {
    $('draft-send').disabled = true; $('draft-send').textContent = 'Sending…'; $('draft-msg').hidden = true;
    try { const body = d.body.mode ? d.body : d.body; const r = await postIt(body, draftSpam); store.drop(d.id); $('draft').hidden = true; thanks(body, r); }
    catch (err) {
      $('draft-send').disabled = false; $('draft-send').textContent = 'Try again';
      if (err.server && err.status === 400) {
        store.drop(d.id); $('draft-send').hidden = true; $('draft-drop').textContent = 'OK';
        $('draft-msg').textContent = `The server could not accept it (${err.message}), so it has been removed from this phone. Please fill in the form again.`;
      } else $('draft-msg').textContent = err.server && err.status === 403 ? 'The spam check did not finish. Please press Try again.' : "Still couldn't send it. Your answers stay saved on this phone.";
      $('draft-msg').hidden = false;
    }
  };
  $('draft-drop').onclick = () => { store.drop(d.id); showDraft(); };
}
showDraft();
// add more after sending: back to "around you", same place
$('again').onclick = () => {
  DONE = false; Object.assign(S, { items: [], checks: [], cur: null, lastMain: null }); stack = [];
  if (S.place) goNear(); else show('start', false);
};

// ── first screen: who is logged in, links that open the nickname screen, counts ──
drawPlay();
const openPlay = { '#play': 'create', '#create': 'create', '#login': 'login' }[location.hash];
if (openPlay && !player.get()) { setPMode(openPlay); show('player'); }
fetch(`${C.API}/${SURVEY}/reports.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).then(d => {
  const rows = d.features.map(f => f.properties).filter(r => !r.pair), many = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
  const c = (it) => rows.filter(r => r.item === it).length;
  if (rows.length) $('meta').textContent = 'So far: ' + [many(c('spot'), 'footpath'), many(c('crossing'), 'crossing'), many(c('problem'), 'problem'), many(c('request'), 'request')].join(', ');
}).catch(() => {});
if (LOCAL) window.__test = { S, SP, show, next, pickByHeading, cands, maps: () => ({ mini, smap, pinMap }) };
