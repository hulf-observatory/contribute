// Contribute to safer streets & bus stops (Teja, 19 Nov 2026): one entry for walking and public transport, built from
// the mock agreed that day (observatory-work/notes/surveys-plan.md, "One entry"). It replaces the separate bus stop and
// walking forms; the questions, the data and the server calls are the walking survey's (bus stops go into the bus stop
// data). Start asks for the phone's location (or a place on a map: "from memory") → what to tell us about: a bus stop,
// a footpath or crossing, a problem, an improvement → what's nearby for that → questions → optional photo → "Anything
// else here?", which is also where everything is sent, once. The side of the road is asked only for a footpath, with
// no north or south: face the road, we work out the side (compass, else the nearest side) and say it with a landmark;
// the person says yes or no. One thing leads to the next (a broken-footpath report → the footpath's questions, filled
// in). A laptop sees the code for a phone and can add a place it knows on the map.
import { mapMark } from '../assets/map-mark.js?v=20261120c';
import { SURVEY, SETS, ITEM, MIN, allQs, shown, real, nAnswered, optLabel, PROBLEMS, BLOCKED_BY, NEEDS, problemName, needName, REQUEST_COLOR,
  POINTS, VIEW_COLORS, footColor, crossColor, metres, angle, outward, bearingNear, inHmda, esc, player, checkPlayer,
  PLAYER_SAYS, currentOf, profileLines } from '../walking/questions.js?v=20261119a';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const QS = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const DEMO = LOCAL && QS.has('demo');                       // desk tests on this Mac: pretend places and compass readings
// a phone fills it in at the place; anything else can add a place it knows on the map (Teja, 19 Nov 2026)
const PHONE = matchMedia('(hover: none) and (pointer: coarse)').matches || (LOCAL && QS.has('desk'));
if (DEMO) document.querySelectorAll('[data-demo]').forEach(x => { x.hidden = false; });
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const GREY = '#B8BDC6', MAX_MOVE = 100, NEAR_JUNCTION_M = 150, SIDE_M = 70;
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
$('blist').innerHTML = BLOCKED_BY.map(([v, l]) => `<button type="button" class="answer check" role="checkbox" aria-checked="false" data-v="${v}"><span>${esc(l)}</span><i class="tick"></i></button>`).join('');

// ── the four things to tell us about ──
const GLYPH = {
  stop: '<svg viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="1.8" stroke-linecap="round"><rect x="5" y="3" width="14" height="13" rx="2"/><path d="M5 10h14M8 19v2M16 19v2M7 16v3h10v-3"/></svg>',
  walk: '<svg viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="1.8" stroke-linecap="round"><path d="M4 20 9 4M20 20 15 4M12 6v2M12 11v2M12 16v2"/></svg>',
  problem: '<svg viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18L12 4z"/><path d="M12 10v4M12 17v.5"/></svg>',
  improve: '<svg viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="1.8" stroke-linecap="round"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1.2 1.5 1.3 2.5h5.4c.1-1 .5-1.7 1.3-2.5A6 6 0 0 0 12 3z"/></svg>',
};
const CHOICES = {
  stop: { name: 'A bus stop', again: 'Another bus stop', blurb: 'Shelter, seating, how buses stop, lighting' },
  walk: { name: 'A footpath or crossing', again: 'Another footpath or crossing', blurb: 'Is there a footpath? Is it broken or blocked? Can people cross?' },
  problem: { name: 'Report a problem', again: 'Report another problem', blurb: 'Garbage, an open drain, waterlogging, a dark spot, a broken footpath' },
  improve: { name: 'Suggest an improvement', again: 'Suggest another improvement', blurb: 'A crossing, a footpath, a bus stop, street lights' },
};
const KIND_NAME = { stop: 'Bus stop', foot: 'Footpath', cross: 'Crossing', problem: 'Problem', request: 'Suggestion' };

// ── state: the place, what's around it, the side of the road, the things added in this entry and the checks ──
const S = { place: null, near: null, side: null, sideSkipped: false, afterFace: null, choice: null, items: [], checks: [], cur: null, last: null };
let cur = 'start', stack = [], moving = false, sending = false;
var DONE = false;                                  // sent: Back can't offer Send again
const isQ = (s) => s.startsWith('q-');
const qParts = (s) => { const [, k, id] = s.split('-'); const part = SETS[k].core.some(q => q.id === id) ? 'core' : 'more'; return { k, id, part }; };
const qList = (k, part, a) => SETS[k][part].filter(q => shown(q, a));
const TAP_ON = ['start', 'look', 'choose', 'near', 'face', 'check', 'player', 'thanks'];   // 'more' keeps the bottom button: it is Send
const BAR = { look: 0, mark: 8, choose: 15, near: 30, face: 30, check: 55, stopname: 40, pin: 60, blockedby: 60, other: 60, photo: 85, more: 100 };

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
    document.querySelector(`.step[data-step="${s}"] [data-qn]`).textContent = `${SETS[k].name}${part === 'more' ? ', more' : ''} · question ${i + 1}`
      + (i === 0 && S.cur.base ? ' · "Current answer" is what most people said' : '');
    $('bar').style.width = `${50 + (SETS[k][part].findIndex(q => q.id === id) + 1) / SETS[k][part].length * 30}%`;
    $('count').textContent = S.cur.title || '';
    S.cur.seen.add(id);
    drawAnswers();
  } else {
    $('bar').style.width = `${BAR[s] ?? 8}%`;
    $('count').textContent = n ? `${n} added` : '';
  }
  ({ start: drawPlay, mark: () => marker.open(), choose: drawChoose, near: drawNear, face: () => { $('face-ask').hidden = false; $('face-confirm').hidden = true; },
    pin: openPin, photo: drawPhoto, more: drawMore, blockedby: drawBlocked,
    thanks: () => { const p = S.noNick ? null : player.get(); $('thanks-prof').hidden = !p; if (p) $('thanks-prof-a').href = profileUrl(p.nick); },
    player: () => { S.noNick = false; const p = player.get(); $('p-nick').value = p ? p.nick : $('p-nick').value; $('p-pin').value = ''; $('p-msg').hidden = true; playerReady(); } }[s] || (() => {}))();
  updateNext();
  window.scrollTo({ top: 0 });
  const st = document.querySelector(`.step[data-step="${s}"]`); st.scrollTop = 0;
  const h = st.querySelector('.qt, h1'); if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
}
function ready() {
  if (cur === 'mark') return !!(S.mark && S.mark.ok);
  if (cur === 'stopname') return $('stop-name').value.trim().length >= 2;
  if (cur === 'pin') return !!S.pinOk;
  if (cur === 'other') return $('ot-text').value.trim().length >= 3;
  if (cur === 'photo') return !few();
  if (cur === 'more') return !sending && S.items.length + S.checks.length > 0;
  return true;
}
const few = () => !!S.cur && !!MIN[S.cur.k] && nAnswered(S.cur.k, Object.fromEntries(Object.entries(S.cur.a).filter(([k]) => S.cur.seen.has(k)))) < MIN[S.cur.k];
function updateNext() {
  const b = $('next');
  b.hidden = TAP_ON.includes(cur) || (isQ(cur) && !allQs(qParts(cur).k).find(q => q.id === qParts(cur).id).multi);
  b.disabled = !ready();
  if (cur === 'more') { if (!sending) { const n = S.items.length + S.checks.length; b.textContent = n > 1 ? `Send all ${n}` : 'Send'; } return; }
  const optional = { photo: !(S.cur && (S.cur.photo || S.cur.note)), blockedby: !(S.cur && S.cur.blocked_by && S.cur.blocked_by.length) };
  b.textContent = cur === 'mark' ? 'Use this place' : cur === 'pin' ? 'Here' : cur === 'photo' && optional.photo ? 'Skip photo' : optional[cur] ? 'Skip' : 'Next';
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
  if (cur === 'mark') { S.place = { lat: S.mark.lat, lng: S.mark.lng, acc: null, memory: true }; return loadPlace(); }
  if (cur === 'stopname') { Object.assign(S.cur, { name: $('stop-name').value.trim(), towards: $('stop-towards').value.trim() }); S.cur.title = S.cur.name + (S.cur.towards ? `, towards ${S.cur.towards}` : ''); return pinThen(() => firstQ()); }
  if (cur === 'pin') { const c = pinMap.getCenter(); Object.assign(S.cur, { lat: c.lat, lng: c.lng }); return S.pinNext(); }
  if (cur === 'blockedby') return show('photo');
  if (cur === 'other') { S.cur.said = $('ot-text').value.trim(); S.cur.title = S.cur.said; return show('photo'); }
  if (cur === 'photo') return finishThing();
  if (cur === 'more') return send();
}
$('next').onclick = next;
$('back').onclick = () => {
  let p; do p = stack.pop(); while (p && isQ(p) && !(S.cur && qList(qParts(p).k, qParts(p).part, S.cur.a).some(q => 'q-' + qParts(p).k + '-' + q.id === p)));
  if (p) show(p, false); else leave();
};
// ✕: back to the first screen; anything added and not sent is lost, so ask first
function leave() {
  if ((S.items.length || S.checks.length) && !DONE && !confirm("Leave? What you added here hasn't been sent.")) return;
  Object.assign(S, { items: [], checks: [], cur: null, last: null }); stack = []; show('start', false);
}
$('exit').onclick = leave;

// ── the first screen: Start asks for the phone's location; "not there" and laptops use the map ──
function begin(place) {
  Object.assign(S, { place, near: null, side: null, sideSkipped: false, afterFace: null, choice: null, items: [], checks: [], cur: null, last: null });
  DONE = false; stack = ['start']; cur = 'start';
  loadPlace();
}
// the phone's location didn't come: say why, and make the map the main button (Teja, 20 Nov 2026)
function gpsFailed(t) {
  S.gpsFailed = true; $('start-go').disabled = false; drawPlay();
  $('gps-msg').textContent = t; $('gps-msg').hidden = false;
}
$('start-go').onclick = () => {
  if (!PHONE) { S.mark = null; return show('mark'); }
  if (!('geolocation' in navigator)) return gpsFailed('This browser cannot share a location. Pick the place on a map instead.');
  S.gpsFailed = false; drawPlay();
  $('start-go').disabled = true; $('start-go').textContent = 'Finding where you are…'; $('gps-msg').hidden = true;
  navigator.geolocation.getCurrentPosition((p) => {
    $('start-go').disabled = false; drawPlay();
    const { latitude: lat, longitude: lng, accuracy } = p.coords;
    if (!inHmda(lng, lat)) return gpsFailed('Your phone places you outside the Hyderabad area (HMDA). This survey is for Hyderabad.');
    begin({ lat, lng, acc: Math.round(accuracy), memory: false });
  }, (err) => gpsFailed(err.code === 1
      ? "Location is off for this site. Pick the place on a map instead (what you add is then marked “from memory”), or turn location on in your browser's settings for this page and try again."
      : "We couldn't get your location. Pick the place on a map instead, or try again in a moment, ideally in the open."),
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 });
};
$('to-mark').onclick = (e) => { e.preventDefault(); S.mark = null; show('mark'); };
// just looking: every question the form asks, in one list; nothing to answer, nothing sent (Teja, 19 Nov 2026)
$('to-look').onclick = (e) => {
  e.preventDefault();
  const qs = (list) => list.map(q => `<li>${esc(q.q)}<small>${q.opts.filter(o => o[0] !== 'dk').map(o => esc(o[1])).join(' · ')}${q.multi ? ' (tick all that fit)' : ''}</small></li>`).join('');
  const thing = (k, name) => `<h3>${name}</h3><h4>First</h4><ol>${qs(SETS[k].core)}</ol><h4>More, if you have a minute</h4><ol>${qs(SETS[k].more)}</ol>`;
  $('lookbox').className = 'look';
  $('lookbox').innerHTML = `<h4>How it goes</h4><ol><li>Where you are<small>Your phone's location, or a place you pick on a map ("from memory")</small></li>
      <li>What you want to tell us about<small>A bus stop · a footpath or crossing · a problem · an improvement</small></li>
      <li>What's already nearby<small>Check something others described, or describe something new</small></li>
      <li>A few questions, then a photo if you like</li><li>Anything else here? Then send everything at once</li></ol>`
    + thing('stop', 'A bus stop') + thing('foot', 'A footpath') + '<p style="margin-top:8px">On a main road we first ask which side you are on: face the road, and say yes or no to the side we show.</p>' + thing('cross', 'A crossing')
    + `<h3>Report a problem</h3><ul>${PROBLEMS.map(p => `<li>${esc(p[0] === 'other' ? 'Something else, in your own words' : p[1])}</li>`).join('')}<li>Flooding<small>Opens the separate flood report</small></li></ul>`
    + `<h3>Suggest an improvement</h3><ul>${NEEDS.map(p => `<li>${esc(p[0] === 'other' ? 'Something else, in your own words' : p[1])}</li>`).join('')}</ul>`;
  show('look');
};
document.querySelectorAll('[data-fakeplace]').forEach(a => a.onclick = (e) => { e.preventDefault(); const [lat, lng] = a.dataset.fakeplace.split(',').map(Number); begin({ lat, lng, acc: 8, memory: false }); });
const marker = mapMark($('markbox'), { mark: 'dot', onChange: ({ lat, lng, ok }) => { S.mark = { lat, lng, ok }; updateNext(); } });
// a laptop: the code that opens this page on a phone, and "add a place you know" on the map
if (!PHONE) {
  const url = location.origin + location.pathname;
  $('desk').hidden = false; $('start-fine').hidden = true; $('to-mark').hidden = true; $('desk-url').textContent = url.replace(/^https?:\/\//, '');
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  s.onload = () => { try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); $('desk-qr').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch { /* the address is shown too */ } };
  document.head.append(s);
}

// ── what's around the place (one call), then: what do you want to tell us about? ──
const N = () => S.near || { stretches: [], junctions: [], stops: [], rows: [], profiles: {}, stop_profiles: {} };
async function loadPlace() {
  S.near = null; S.side = null; S.sideSkipped = false;
  show(cur === 'mark' ? 'choose' : 'choose', cur !== 'start' ? true : false);
  try {
    const r = await fetch(`${C.API}/${SURVEY}/around?lat=${S.place.lat.toFixed(5)}&lng=${S.place.lng.toFixed(5)}`, { credentials: 'omit', cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    S.near = await r.json();
  } catch { S.near = { stretches: [], junctions: [], stops: [], rows: [], profiles: {}, stop_profiles: {}, failed: true }; }
  if (S.place.memory) {                             // not there: the dot itself says which side of the road
    const c = cands().filter(x => x.d < 45 && nearestOn(x.c, S.place).side === x.side)[0];
    if (c) S.side = { mine: c, other: opposite(c), how: 'map', deg: null };
  }
  if (cur === 'choose') drawChoose();
  if (cur === 'near') drawNear();
}
const rowsOf = (item) => N().rows.filter(r => r.item === item);
const junctions = () => N().junctions.filter(j => j.d <= NEAR_JUNCTION_M);
function drawChoose() {
  const n = N(), mem = S.place && S.place.memory;
  $('h-choose').textContent = mem ? 'What do you want to tell us about this place?' : 'What do you want to tell us about?';
  $('ch-hint').textContent = !S.near ? 'Looking at what is around…' : mem ? 'From memory: what you add is marked so.' : '';
  $('near-msg').hidden = !(S.near && S.near.failed);
  $('near-msg').textContent = "We couldn't load what's already here just now. You can still add something new.";
  const stops = n.stops.filter(x => x.d <= 300).length, js = junctions().length;
  const hint = !S.near ? {} : {
    stop: stops ? `${stops} stop${stops === 1 ? '' : 's'} near here` : '',
    walk: [n.stretches.length ? 'Your side or the opposite side' : '', js ? `${js} crossing${js === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · '),
    problem: rowsOf('problem').length ? `${rowsOf('problem').length} already reported near here` : '',
    improve: rowsOf('request').length ? `${rowsOf('request').length} asked for near here` : '' };
  $('choices').innerHTML = Object.entries(CHOICES).map(([k, c]) =>
    `<button type="button" class="choice" data-choice="${k}"><span class="gl">${GLYPH[k]}</span><span><b>${c.name}</b><small>${c.blurb}</small>${hint[k] ? `<small class="n">${esc(hint[k])}</small>` : ''}</span></button>`).join('');
}
$('choices').addEventListener('click', (e) => { const b = e.target.closest('[data-choice]'); if (b) openChoice(b.dataset.choice); });
function openChoice(k) { S.choice = k; if (k === 'walk') askSide(() => show('near')); else show('near'); }

// ── geometry: the road sides near the place ──
const K = Math.PI / 180;
function nearestOn(c, p) {                          // distance (m), and which side of the line p is on
  const cos = Math.cos(p.lat * K), M = 111320;
  let best = null;
  for (let i = 0; i < c.length - 1; i++) {
    const ax = c[i][0] * cos * M, ay = c[i][1] * 110540, bx = c[i + 1][0] * cos * M, by = c[i + 1][1] * 110540, px = p.lng * cos * M, py = p.lat * 110540;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (!best || d < best.d) best = { d, side: dx * (py - ay) - dy * (px - ax) > 0 ? 'l' : 'r' };
  }
  return best || { d: 1e9, side: 'l' };
}
function cands() {
  return N().stretches.flatMap(s => s.sides.map(side => {
    const brg = bearingNear(s.c, S.place);
    return { stretch: s.id, side, brg, n: outward(brg, side), d: s.d, c: s.c, name: s.name || 'Main road', at: s.at };
  })).sort((a, b) => a.d - b.d);
}
const opposite = (m) => cands().filter(c => c.name === m.name && !(c.stretch === m.stretch && c.side === m.side) && angle(c.n, m.n) > 120)[0] || null;
const guessSide = (road) => { const cs = cands().filter(c => !road || c.name === road); return cs.find(c => c.side === (c.at || nearestOn(c.c, S.place).side)) || cs[0] || null; };
// facing the road: the phone points across it, away from the side you stand on
const byHeading = (h) => cands().sort((a, b) => angle(a.n, (h + 180) % 360) - angle(b.n, (h + 180) % 360) || a.d - b.d)[0] || null;
// something people recognise on a side: the nearest bus stop that stands on it
function landmark(c) {
  return N().stops.map(st => ({ st, n: nearestOn(c.c, st) })).filter(v => v.n.side === c.side && v.n.d < SIDE_M).sort((a, b) => a.st.d - b.st.d).map(v => v.st)[0] || null;
}
function stopSide(st) {
  if (!S.side) return '';
  const n = nearestOn(S.side.mine.c, st);
  return n.d > SIDE_M ? '' : n.side === S.side.mine.side ? 'On your side' : 'Opposite side';
}
const SIDE_HOW = { compass: 'compass', guess: 'guess', switched: 'switched', map: 'map' };   // as the server names them
const sideWords = () => S.place.memory ? ['The side you marked', 'The opposite side'] : ['Your side', 'The opposite side'];

// ── which side of the road: asked only when a footpath needs it, once ──
const needFace = () => !!S.near && !S.place.memory && N().stretches.length > 0 && !S.side && !S.sideSkipped;
function askSide(then) { if (!needFace()) return then(); S.afterFace = then; show('face'); }
function doneFace() { const f = S.afterFace; S.afterFace = null; cur = stack.pop() || 'choose'; f(); }
async function readCompass() {                      // the phone's compass for about a second; null when there is none
  try {
    if (typeof DeviceOrientationEvent === 'undefined') return null;
    if (DeviceOrientationEvent.requestPermission && await DeviceOrientationEvent.requestPermission() !== 'granted') return null;   // iPhones ask
  } catch { return null; }
  const got = [];
  const on = (ev) => { const d = ev.webkitCompassHeading != null ? ev.webkitCompassHeading : ev.absolute && ev.alpha != null ? 360 - ev.alpha : null; if (d != null) got.push(d); };
  window.addEventListener('deviceorientationabsolute', on); window.addEventListener('deviceorientation', on);
  await new Promise(r => setTimeout(r, 1200));
  window.removeEventListener('deviceorientationabsolute', on); window.removeEventListener('deviceorientation', on);
  if (!got.length) return null;
  const x = got.reduce((a, d) => a + Math.cos(d * K), 0), y = got.reduce((a, d) => a + Math.sin(d * K), 0);
  return (Math.atan2(y, x) / K + 360) % 360;
}
function setSide(mine, how, deg = null) { S.side = mine ? { mine, other: opposite(mine), how, deg } : null; }
$('facing').onclick = async () => {
  $('facing').disabled = true; $('facing').textContent = 'Reading…';
  const h = await readCompass();
  $('facing').disabled = false; $('facing').textContent = "I'm facing the road";
  if (h != null) setSide(byHeading(h), 'compass', Math.round(h) % 360); else setSide(guessSide(), 'guess');
  drawConfirm();
};
document.querySelectorAll('[data-sim]').forEach(a => a.onclick = (e) => {
  e.preventDefault();
  const g = guessSide(), far = opposite(g) || g, v = a.dataset.sim;
  setSide(v === 'far' ? far : g, v === 'none' ? 'guess' : 'compass', v === 'none' ? null : Math.round(((v === 'far' ? far : g).n + 180) % 360));
  drawConfirm();
});
$('face-skip').onclick = (e) => { e.preventDefault(); S.side = null; S.sideSkipped = true; doneFace(); };
$('cf-yes').onclick = () => doneFace();
$('cf-no').onclick = () => { setSide(S.side.other, 'switched', S.side.deg); doneFace(); };
$('roadchips').addEventListener('click', (e) => { const b = e.target.closest('[data-road]'); if (!b) return; setSide(guessSide(b.dataset.road), 'guess'); drawConfirm(); });
let smap = null, sMe = null;
function sideGeo() {
  const f = [S.side.mine, S.side.other].filter(Boolean).map((c, i) => ({ type: 'Feature', properties: { side: c.side, on: i === 0 ? 1 : 0 }, geometry: { type: 'LineString', coordinates: c.c } }));
  const lm = landmark(S.side.mine);
  if (lm) f.push({ type: 'Feature', properties: { name: lm.name }, geometry: { type: 'Point', coordinates: [lm.lng, lm.lat] } });
  return { type: 'FeatureCollection', features: f };
}
function drawConfirm() {
  if (!S.side) { S.sideSkipped = true; return doneFace(); }          // no main road found after all
  $('face-ask').hidden = true; $('face-confirm').hidden = false;
  const m = S.side.mine, lm = landmark(m);
  $('cf-t').innerHTML = (S.side.how === 'compass' ? '' : "We couldn't read your phone's direction, so this is our best guess. ")
    + (lm ? `You're on the side of <b>${esc(m.name)}</b> with the <b>${esc(lm.name)}</b> bus stop${lm.towards ? ` (buses towards ${esc(lm.towards)})` : ''}.`
      : `You're on the side of <b>${esc(m.name)}</b> drawn as the dark line.`);
  $('cf-no').hidden = !S.side.other;
  const names = [...new Set(cands().map(c => c.name))].filter(nm => nm !== m.name);
  $('roadpick').hidden = !names.length;
  $('roadchips').innerHTML = names.map(nm => `<button type="button" aria-pressed="false" data-road="${esc(nm)}">${esc(nm)}</button>`).join('');
  const at = [S.place.lng, S.place.lat];
  if (!smap) {
    smap = new maplibregl.Map({ container: 'sidemap', style: STYLE, center: at, zoom: 17.4, minZoom: 15, maxZoom: 19.5, attributionControl: { compact: true } });
    compact(smap);
    smap.on('load', () => {
      smap.addSource('c', { type: 'geojson', data: sideGeo() });
      for (const s of ['l', 'r']) smap.addLayer({ id: 'c-' + s, type: 'line', source: 'c', filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'side'], s]], layout: { 'line-cap': 'round' },
        paint: { 'line-color': ['case', ['==', ['get', 'on'], 1], '#111827', '#B8BDC6'], 'line-width': ['case', ['==', ['get', 'on'], 1], 8, 5],
          'line-offset': ['interpolate', ['exponential', 2], ['zoom'], 15, s === 'l' ? -3 : 3, 19, s === 'l' ? -22 : 22] } });
      smap.addLayer({ id: 'c-lm', type: 'circle', source: 'c', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#fff', 'circle-radius': 7, 'circle-stroke-color': '#111827', 'circle-stroke-width': 3 } });
      smap.addLayer({ id: 'c-lmt', type: 'symbol', source: 'c', filter: ['==', ['geometry-type'], 'Point'],
        layout: { 'text-field': ['get', 'name'], 'text-size': 12, 'text-offset': [0, 1.3], 'text-anchor': 'top', 'text-font': ['Noto Sans Bold'] }, paint: { 'text-halo-color': '#fff', 'text-halo-width': 2 } });
    });
  } else { smap.resize(); smap.jumpTo({ center: at, zoom: 17.4 }); smap.getSource('c')?.setData(sideGeo()); }
  if (!sMe) sMe = new maplibregl.Marker({ element: mkEl('me') }).setLngLat(at).addTo(smap); else sMe.setLngLat(at);
  window.scrollTo({ top: 0 });
}

// ── what's nearby, for the choice ──
const checked = (id) => S.checks.some(c => c.id === id);
let ACTS = [];
function row({ col, shape = '', t, tag = '', sub = [], btns, done = false }) {
  const b = done ? '<button type="button" disabled>Added</button>' : btns.map(([label, fn]) => { ACTS.push(fn); return `<button type="button" data-act="${ACTS.length - 1}">${esc(label)}</button>`; }).join('');
  return `<li><i class="ic ${shape}" style="background:${col}"></i><span class="t">${esc(t)}${tag ? `<em>${tag}</em>` : ''}<small>${sub.filter(Boolean).map(esc).join('<br>')}</small></span><span class="btns">${b}</span></li>`;
}
const stopTitle = (st) => st.name + (st.towards ? `, towards ${st.towards}` : '');
const stopCtx = (st) => ({ stop_id: st.id, name: st.name, towards: st.towards, slat: st.lat, slng: st.lng, d: st.d, title: stopTitle(st) });
function startStop(st) {
  const p = N().stop_profiles[st.id];
  if (p) return showCheck({ kind: 'stop', stop: st, p, title: stopTitle(st) });
  startThing('stop', stopCtx(st));
}
function sideCtx(c, which, word) {
  return { stretch: c.stretch, side: c.side, side_how: SIDE_HOW[S.side.how] || 'map', road_deg: S.side.deg, which, title: `${c.name}, ${word.toLowerCase()}` };
}
function listStops() {
  const n = N(), stops = n.stops.filter(x => x.d <= 300).slice(0, 6).map(st => ({ st, side: stopSide(st) }));
  stops.sort((a, b) => (a.side === 'On your side' ? 0 : 1) - (b.side === 'On your side' ? 0 : 1) || a.st.d - b.st.d);
  return stops.map(({ st, side }) => { const p = n.stop_profiles[st.id]; return row({ col: p ? '#2166AC' : GREY, shape: 'r', t: st.name, tag: side,
    sub: [`${st.d} m away${st.towards ? ' · buses towards ' + st.towards : ''}`, p ? `${people(p.n)} · ${day(p.seen)}` : 'No details yet'], btns: [[p ? 'Check' : 'Describe', () => startStop(st)]] }); }).join('')
    || '<li class="none">No bus stop on our map within 300 m.</li>';
}
function listSides() {
  const n = N(), out = [];
  if (S.side) {
    const [w1, w2] = sideWords();
    for (const [c, word, which] of [[S.side.mine, w1, 'mine'], [S.side.other, w2, 'other']]) {
      if (!c) continue;
      const p = n.profiles[`${c.stretch}:${c.side}`], v = p ? footColor(currentOf(p)) : null, lm = landmark(c), ctx = sideCtx(c, which, word);
      out.push(row({ col: p ? (v ? VIEW_COLORS[v] : '#8C8C8C') : GREY, shape: 'ln', t: word, sub: [`${c.name}${lm ? ` · the ${lm.name} bus stop side` : ''}`, p ? `${people(p.n)} · ${day(p.seen)}` : 'No details yet'],
        btns: [[p ? 'Check' : 'Describe', () => p ? showCheck({ kind: 'side', p, ctx, title: ctx.title }) : startThing('foot', ctx)]] }));
    }
  } else out.push(row({ col: GREY, shape: 'ln', t: 'The footpath here', sub: [n.stretches.length ? 'Side of the road not set' : 'Not on a main road: kept as a single point'], btns: [['Describe', () => startThing('foot', { title: 'The footpath here' })]] }));
  for (const r of rowsOf('spot')) out.push(row({ col: VIEW_COLORS[footColor(r.answers)] || GREY, shape: 'ln', t: 'A footpath spot someone described', sub: [`${r.d} m away · seen ${day(r.seen)}`], done: checked(r.id),
    btns: [['Check', () => showCheck({ kind: 'spot', row: r, title: 'The footpath here' })]] }));
  return out.join('');
}
function listCrossings() {
  const n = N(), out = [];
  for (const j of junctions()) { const p = n.profiles[j.id], v = p ? crossColor(currentOf(p)) : null;
    out.push(row({ col: p ? (v ? VIEW_COLORS[v] : '#111827') : GREY, t: j.name, sub: [`${j.d} m away`, p ? `${people(p.n)} · ${day(p.seen)}` : 'No details yet'],
      btns: [[p ? 'Check' : 'Describe', () => p ? showCheck({ kind: 'junction', j, p, title: j.name }) : startThing('cross', { junction: j.id, title: j.name })]] })); }
  for (const r of rowsOf('crossing')) out.push(row({ col: '#111827', t: 'A crossing between junctions', sub: [`${r.d} m away · seen ${day(r.seen)}`], done: checked(r.id),
    btns: [['Check', () => showCheck({ kind: 'crossing', row: r, title: 'A crossing between junctions' })]] }));
  return out.join('') || '<li class="none">No junction of main roads within 150 m.</li>';
}
const typeBtns = (kind, list) => list.map(p => answerBtn(`data-type="${kind}:${p[0]}"`, `${esc(p[1])}${p[0] === 'other' ? '<small>Say it in your own words</small>' : ''}`, '', ' go')).join('');
function drawNear() {
  const c = S.choice, L = [], mem = S.place.memory;
  ACTS = [];
  $('minibox').hidden = true; $('minimap-toggle').textContent = 'Show map'; $('flood-msg').hidden = true;
  if (!S.near) { $('h-near').textContent = 'Looking…'; $('near-hint').textContent = ''; $('nearlists').innerHTML = ''; return; }
  if (c === 'stop') {
    $('h-near').textContent = 'Which bus stop?';
    $('near-hint').textContent = mem ? 'Stops near the place. Check one that has details, or describe one that has none.' : 'Stops near you. Check one that has details, or describe one that has none.';
    L.push(`<ul class="near">${listStops()}</ul><div class="grid2" style="margin-top:10px"><button type="button" class="btn btn-secondary" data-new="stop">My stop isn't listed</button></div>`);
  } else if (c === 'walk') {
    $('h-near').textContent = 'Which footpath or crossing?';
    $('near-hint').textContent = S.side ? `On ${S.side.mine.name}.` : '';
    L.push(`<p class="what-h" style="margin-top:0">Footpath</p><ul class="near">${listSides()}</ul><p class="what-h">Crossing</p><ul class="near">${listCrossings()}</ul>
      <div class="grid2" style="margin-top:10px"><button type="button" class="btn btn-secondary" data-new="cross">A crossing between junctions</button></div>`);
  } else if (c === 'problem') {
    $('h-near').textContent = "What's the problem?";
    $('near-hint').textContent = 'Pick one. If someone has already reported it here, tell us whether it is still there.';
    const pr = rowsOf('problem');
    if (pr.length) L.push(`<p class="what-h" style="margin-top:0">Already reported near here</p><ul class="near">${pr.map(r => row({ col: (PROBLEMS.find(p => p[0] === r.problem) || [, , '#6B7280'])[2], shape: 'r', t: problemName(r.problem), done: checked(r.id),
      sub: [[`${r.d} m away`, `seen ${day(r.seen)}`, r.still && `${r.still} said still there`].filter(Boolean).join(' · ')],
      btns: [['Still there', () => quickCheck(r, 'confirm', `Still there: ${problemName(r.problem)}`)], ['Gone', () => quickCheck(r, 'gone', `Gone: ${problemName(r.problem)}`)]] })).join('')}</ul><p class="what-h">Report a new one</p>`);
    // flooding has its own report (depth, flow, photo): the option hands over to it
    const flood = `<a class="answer go" href="../flood/" id="to-flood" style="text-decoration:none"><span>Flooding<small>Deep or moving water: opens the flood report</small></span></a>`;
    L.push(`<div class="answers" style="gap:8px">${typeBtns('problem', PROBLEMS.filter(p => p[0] !== 'other'))}${flood}${typeBtns('problem', PROBLEMS.filter(p => p[0] === 'other'))}</div>`);
  } else {
    $('h-near').textContent = 'What would make this place better?';
    $('near-hint').textContent = 'Pick one. If someone has already asked for it here, add your voice.';
    const rq = rowsOf('request');
    if (rq.length) L.push(`<p class="what-h" style="margin-top:0">Others have asked for, near here</p><ul class="near">${rq.map(r => row({ col: REQUEST_COLOR, shape: 'r', t: needName(r.need), done: checked(r.id),
      sub: [`${r.d} m away · ${people(1 + r.metoo)} asked`], btns: [['Me too', () => quickCheck(r, 'metoo', `Me too: ${needName(r.need).toLowerCase()}`)]] })).join('')}</ul><p class="what-h">Suggest something</p>`);
    L.push(`<div class="answers" style="gap:8px">${typeBtns('request', NEEDS)}</div>`);
  }
  $('nearlists').innerHTML = L.join('');
}
function quickCheck(r, kind, title) { addCheck({ survey: SURVEY, id: r.id, kind, title }); S.last = null; show('more'); }
$('nearlists').addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]'); if (a && !a.disabled) return ACTS[+a.dataset.act]();
  const nw = e.target.closest('[data-new]');
  if (nw && nw.dataset.new === 'stop') { $('stop-name').value = ''; $('stop-towards').value = ''; S.cur = newThing('stop', { missing: true }); return show('stopname'); }
  if (nw && nw.dataset.new === 'cross') { S.cur = newThing('cross', { between: true, title: 'A crossing between junctions' }); return pinThen(() => firstQ()); }
  const t = e.target.closest('[data-type]');
  if (t) { const [kind, v] = t.dataset.type.split(':'); return kind === 'problem' ? pickProblem(v) : pickNeed(v); }
  const fl = e.target.closest('#to-flood');
  if (fl && (S.items.length || S.checks.length)) { e.preventDefault(); $('flood-msg').textContent = 'Send what you have added first (Back, then Send). Then report the flooding.'; $('flood-msg').hidden = false; }
});
function pickProblem(v, extra = {}) {
  S.cur = newThing('problem', { problem: v, title: problemName(v), ...extra });
  if (v === 'other') return openOther('Report a problem', 'What is the problem?', 'For example: a cable hanging low over the footpath');
  show(v === 'blocked' ? 'blockedby' : 'photo');
}
function pickNeed(v) {
  S.cur = newThing('request', { need: v, title: `Needed: ${needName(v).toLowerCase()}` });
  if (v === 'other') return openOther('Suggest an improvement', 'What would help here?', 'For example: a bench and some shade at the bus stop');
  show('photo');
}
function openOther(k, h, ph) { $('ot-k').textContent = k; $('ot-h').textContent = h; $('ot-text').value = ''; $('ot-text').placeholder = ph; show('other'); }
$('ot-text').addEventListener('input', updateNext);
function drawBlocked() { $('blist').querySelectorAll('.answer').forEach(o => o.setAttribute('aria-checked', (S.cur.blocked_by || []).includes(o.dataset.v))); }
$('blist').addEventListener('click', (e) => {
  const b = e.target.closest('.answer'); if (!b) return;
  const t = new Set(S.cur.blocked_by || []); t.has(b.dataset.v) ? t.delete(b.dataset.v) : t.add(b.dataset.v); S.cur.blocked_by = [...t];
  drawBlocked(); updateNext();
});
$('stop-name').addEventListener('input', updateNext);

// the little map: behind a button, so the list comes first
let mini = null, miniMe = null;
function miniGeo() {
  const n = N(), f = [];
  for (const s of n.stretches) for (const side of s.sides) {
    const p = n.profiles[`${s.id}:${side}`], v = p ? footColor(currentOf(p)) : null;
    f.push({ type: 'Feature', properties: { side, col: p ? (v ? VIEW_COLORS[v] : '#8C8C8C') : GREY }, geometry: { type: 'LineString', coordinates: s.c } });
  }
  const pt = (lng, lat, col) => f.push({ type: 'Feature', properties: { col }, geometry: { type: 'Point', coordinates: [lng, lat] } });
  for (const st of n.stops) pt(st.lng, st.lat, n.stop_profiles[st.id] ? '#2166AC' : GREY);
  for (const j of n.junctions) pt(j.c[0], j.c[1], n.profiles[j.id] ? '#111827' : '#fff');
  for (const r of n.rows) pt(r.lng, r.lat, r.item === 'problem' ? '#EF8A62' : r.item === 'request' ? REQUEST_COLOR : '#111827');
  return { type: 'FeatureCollection', features: f };
}
$('minimap-toggle').onclick = () => {
  const open = $('minibox').hidden;
  $('minibox').hidden = !open; $('minimap-toggle').textContent = open ? 'Hide map' : 'Show map';
  if (!open) return;
  const at = [S.place.lng, S.place.lat];
  if (!mini) {
    mini = new maplibregl.Map({ container: 'minimap', style: STYLE, center: at, zoom: 16.3, attributionControl: { compact: true } });
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
  if (S.place.memory) { if (miniMe) { miniMe.remove(); miniMe = null; } }
  else if (!miniMe) miniMe = new maplibregl.Marker({ element: mkEl('me') }).setLngLat(at).addTo(mini); else miniMe.setLngLat(at);
};

// ── checking something already described ──
function showCheck(x) {
  let lines = [], latest = null, surveyId = SURVEY, k = null, prefill = null;
  if (x.kind === 'side') { k = 'foot'; lines = profileLines('foot', x.p, 6); latest = x.p.latest; prefill = currentOf(x.p); }
  if (x.kind === 'stop') { k = 'stop'; lines = profileLines('stop', x.p, 6); latest = x.p.latest; surveyId = 'bus-stops'; prefill = currentOf(x.p); }
  if (x.kind === 'junction') { k = 'cross'; lines = profileLines('cross', x.p, 6); latest = x.p.latest; prefill = currentOf(x.p); }
  if (x.kind === 'crossing' || x.kind === 'spot') {
    k = x.kind === 'crossing' ? 'cross' : 'foot'; latest = x.row.id; prefill = x.row.answers || {};
    lines = allQs(k).filter(q => shown(q, prefill) && real(prefill[q.id])).slice(0, 6).map(q => [q.s, q.multi ? prefill[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, prefill[q.id]), '']);
  }
  $('check-k').textContent = KIND_NAME[k];
  $('check-h').textContent = x.title;
  $('check-m').textContent = x.p ? `${people(x.p.n)} · last seen ${day(x.p.seen)}` : `Seen ${day(x.row.seen)}`;
  $('check-a').innerHTML = lines.map(([a, b, c]) => `<li><span>${esc(a)}</span><b>${esc(b)}</b>${c ? `<small>${esc(c)}</small>` : ''}</li>`).join('');
  $('check-a').hidden = !lines.length;
  $('check-same').onclick = () => { addCheck({ survey: surveyId, id: latest, kind: 'confirm', title: `Still the same: ${x.title}` }); S.last = x.kind === 'stop' ? { k: 'stop', ...stopCtx(x.stop), more: true } : null; show('more'); };
  $('check-change').onclick = () => {
    const ctx = { title: x.title, prefill, check: { survey: surveyId, id: latest } };
    if (x.kind === 'side') return startThing('foot', { ...ctx, ...x.ctx });
    if (x.kind === 'stop') return startThing('stop', { ...ctx, ...stopCtx(x.stop) });
    if (x.kind === 'junction') return startThing('cross', { ...ctx, junction: x.j.id });
    startThing(k, { ...ctx, check: null, lat: x.row.lat, lng: x.row.lng, between: x.kind === 'crossing' });   // a new point where that one is
  };
  show('check');
}
function addCheck(c) { if (!S.checks.some(x => x.id === c.id && x.kind === c.kind)) S.checks.push(c); }

// ── things: a bus stop, footpath or crossing (core questions, photo, then more), a problem or a suggestion ──
function newThing(k, ctx = {}) { return { k, a: {}, seen: new Set(), more: false, at: new Date().toISOString(), photo: null, note: '', ...ctx }; }
// answers to compare with the place's current ones: only questions the person saw; "Don't know" adds nothing
const snap = (a, seen) => JSON.stringify(Object.keys(a).filter(k => a[k] != null && a[k] !== 'dk' && (!seen || seen.has(k))).sort().map(k => [k, a[k]]));
function startThing(k, ctx = {}) {
  const { prefill, mine, ...rest } = ctx;
  S.cur = newThing(k, rest);
  const ids = new Set(allQs(k).map(q => q.id));
  if (prefill && Object.keys(prefill).length) {     // the place's current answers: "Current answer"
    S.cur.a = structuredClone(Object.fromEntries(Object.entries(prefill).filter(([q]) => ids.has(q))));
    S.cur.base = snap(S.cur.a); S.cur.baseA = structuredClone(S.cur.a);
  }
  if (mine) { S.cur.mineA = Object.fromEntries(Object.entries(mine).filter(([q]) => ids.has(q))); Object.assign(S.cur.a, structuredClone(S.cur.mineA)); }   // from the person's own report just now
  firstQ();
}
function firstQ() { const q = qList(S.cur.k, 'core', S.cur.a)[0]; show(`q-${S.cur.k}-${q.id}`); }
// the photo screen's Next: the thing is added (a footpath, crossing or stop with nothing changed is a "still the same")
function finishThing() {
  const t = S.cur;
  t.note = t.said || $('note').value.trim();
  if (t.base && t.check && snap(t.a, t.seen) === snap(t.baseA, t.seen) && !t.photo && !t.note) {
    addCheck({ ...t.check, kind: 'confirm', title: `Still the same: ${t.title}` }); S.items = S.items.filter(x => x !== t);
  } else if (!S.items.includes(t)) S.items.push(t);
  S.last = t;
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
    const v = t.a[q.id], was = t.baseA && t.baseA[q.id], own = t.mineA && t.mineA[q.id];
    document.querySelectorAll(`[data-q="${t.k}|${q.id}"] .answer`).forEach(o => {
      const k = o.dataset.v;
      o.setAttribute('aria-checked', q.multi ? !!(v || []).includes(k) : k === v);
      const isOwn = own != null && own === k, last = !isOwn && was != null && (q.multi ? was.includes(k) : was === k);
      let tag = o.querySelector('.last');
      if ((last || isOwn) && !tag) { tag = document.createElement('span'); tag.className = 'last'; o.querySelector('.tick').before(tag); }
      if (tag && (last || isOwn)) { tag.textContent = isOwn ? 'From your report' : 'Current answer'; tag.classList.toggle('mine', isOwn); }
      if (!last && !isOwn && tag) tag.remove();
    });
  }
  updateNext();
}

// ── put the dot on it (within 100 m of you; from memory anywhere near the place) ──
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
  $('pin-info').textContent = !S.pinOk ? (S.place.memory ? 'Keep the dot near the place you picked.' : `The dot can be up to ${MAX_MOVE} m from where you are. Walk closer, if it's safe.`)
    : S.place.memory ? 'Move the map so the dot sits on it.' : d < 3 ? 'Blue is you. Move the map so the dark dot sits on it.' : `${Math.round(d)} m from you.`;
  if (cur === 'pin') updateNext();
}

// ── photo (optional) and note ──
function drawPhoto() {
  const t = S.cur, pin = t.k === 'problem' || t.k === 'request';
  $('photo-prev').style.display = t.photo ? 'block' : 'none'; if (t.photo) $('photo-prev').src = t.photo;
  $('photo-btn').textContent = t.photo ? 'Use a different photo' : 'Take or choose a photo';
  $('photo-info').textContent = t.photo ? 'Photo added.' : 'The phone makes it smaller and removes the location stored in it.';
  $('note-box').hidden = !!t.said;                 // "something else" was already said in the person's own words
  $('note').value = t.said ? '' : t.note || '';
  $('note').placeholder = t.k === 'request' ? 'For example: children cross here to the school' : t.k === 'problem' ? 'For example: there every morning' : 'For example: cars parked on the footpath every evening';
  // a problem or suggestion is placed where you are (or at the place you picked); the dot can be moved to the exact spot
  $('movedot').hidden = !pin;
  if (pin) $('movedot').firstChild.textContent = t.lat != null ? 'The dot is on the spot. ' : S.place.memory ? 'Placed where you put the dot. ' : "Placed where you're standing. Not exactly there? ";
  $('movedot-go').textContent = t.lat != null ? 'Move it again' : 'Move the dot to the spot';
}
$('movedot-go').onclick = (e) => { e.preventDefault(); S.cur.note = $('note').value.trim(); pinThen(() => { stack.pop(); stack.pop(); show('photo'); }); };
$('note').addEventListener('input', () => { if (S.cur) S.cur.note = $('note').value.trim(); updateNext(); });
$('photo-in').addEventListener('change', async (e) => {
  const f = e.target.files[0]; if (!f) return;
  $('photo-info').textContent = 'Preparing the photo…';
  try { const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' }), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    S.cur.photo = c.toDataURL('image/jpeg', .82); drawPhoto(); } catch { $('photo-info').textContent = "This photo couldn't be read. Try a different one."; }
  e.target.value = ''; updateNext();
});

// ── anything else here? one thing leads to the next; everything is sent from here ──
const PRE = { broken: { footpath: 'yes', broken: 'places' }, blocked: { footpath: 'yes', blocked: 'places' }, nofoot: { footpath: 'no' } };
const itemLine = (i) => i.k === 'problem' || i.k === 'request' ? i.title : i.title || KIND_NAME[i.k];
const WORN = ['places', 'mostly'];
let LEADS = [];
function drawMore() {
  const has = (k) => S.items.some(i => i.k === k), t = S.last, n = S.items.length + S.checks.length;
  const sub = (i) => {
    if (i.k === 'problem') return [i.blocked_by && i.blocked_by.length && 'Blocked by ' + i.blocked_by.map(v => BLOCKED_BY.find(o => o[0] === v)[1].toLowerCase()).join(', '), i.photo && 'photo', !i.said && i.note && `“${i.note}”`];
    if (i.k === 'request') return [i.photo && 'photo', !i.said && i.note && `“${i.note}”`];
    const c = nAnswered(i.k, answersOf(i));
    return [`${c} answer${c === 1 ? '' : 's'}${i.more ? ', with more' : ''}`, i.missing && 'a new stop', i.photo && 'photo', i.note && `“${i.note}”`];
  };
  $('sum').innerHTML = S.items.map((i, x) => `<li><span>${KIND_NAME[i.k]}</span><b>${esc(itemLine(i))}<small>${esc(sub(i).filter(Boolean).join(' · '))}</small></b><button type="button" data-del="i${x}">Remove</button></li>`).join('')
    + S.checks.map((c, x) => `<li><span>Check</span><b>${esc(c.title)}</b><button type="button" data-del="c${x}">Remove</button></li>`).join('')
    || '<li><span>Nothing added yet</span></li>';
  // what goes with the thing just added
  LEADS = [];
  const lead = (label, s, fn) => { LEADS.push(fn); return answerBtn(`data-lead="${LEADS.length - 1}"`, `${esc(label)}${s ? `<small>${esc(s)}</small>` : ''}`, '', ' go'); };
  const L = [];
  if (t && S.items.includes(t)) {
    if (t.k === 'problem' && PRE[t.problem] && !has('foot'))
      L.push(lead('Tell us more about this footpath', 'Your report is filled in already; a few quick questions', () => { S.choice = 'walk'; askSide(() => footHere({ mine: PRE[t.problem], lead: 'problem' })); }));
    if (t.k === 'foot' && (WORN.includes(t.a.broken) || WORN.includes(t.a.blocked)) && !S.items.some(i => i.k === 'problem' && ['broken', 'blocked'].includes(i.problem))) {
      const blocked = WORN.includes(t.a.blocked);
      L.push(lead(`Mark the exact spot where it's ${blocked ? 'blocked' : 'broken'}`, 'Adds it as a problem others can confirm', () => {
        S.choice = 'problem'; S.cur = newThing('problem', { problem: blocked ? 'blocked' : 'broken', title: problemName(blocked ? 'blocked' : 'broken'), lead: 'footpath', blocked_by: blocked ? t.a.blocked_by || [] : null });
        pinThen(() => show('photo')); }));
    }
    if (SETS[t.k] && !t.more) L.push(lead(`More about this ${SETS[t.k].name.toLowerCase()}`, SETS[t.k].moreSays, () => { S.cur = t; const q = qList(t.k, 'more', t.a)[0]; show(`q-${t.k}-${q.id}`); }));
  }
  if (t && t.k === 'stop') {
    const sp = t.missing ? { lat: t.lat, lng: t.lng } : { lat: t.slat, lng: t.slng }, j = junctions().find(x => !checked((N().profiles[x.id] || {}).latest) && !S.items.some(i => i.junction === x.id));
    if (!has('foot') && sp.lat != null && (S.place.memory || metres(S.place, sp) <= MAX_MOVE))
      L.push(lead('The footpath at this stop', 'Is there one, its height, broken or blocked', () => { S.choice = 'walk'; startThing('foot', { lat: sp.lat, lng: sp.lng, side_how: 'stop', lead: 'stop', title: `At the stop: ${t.name}` }); }));
    if (j && !has('cross')) L.push(lead('The crossing near this stop', `${j.name} · ${j.d} m away`, () => { S.choice = 'walk'; const p = N().profiles[j.id]; p ? showCheck({ kind: 'junction', j, p, title: j.name }) : startThing('cross', { junction: j.id, title: j.name }); }));
  }
  $('lead-h').hidden = !L.length; $('leadlist').innerHTML = L.join('');
  $('more-h').textContent = L.length ? 'Or something else here' : 'Add something else here';
  $('morelist').innerHTML = Object.entries(CHOICES).map(([k, c]) => answerBtn(`data-add="${k}"`, k === S.choice ? c.again : c.name, '', ' go')).join('');
  const p = player.get();
  $('anon').hidden = !!(p && !S.noNick) || !n;
  $('accuracy').textContent = S.place && S.place.memory ? 'By sending, you confirm this is what you know of this place, to the best of your knowledge.'
    : 'By sending, you confirm this is what you saw, to the best of your knowledge.';
  $('notsent').innerHTML = n ? `Not sent yet. <span>${n === 1 ? '1 thing is' : n + ' things are'} waiting: add more below, or press Send.</span>` : 'Nothing added yet. <span>Add something below.</span>';
  if (!sending) $('send-msg').hidden = true;
  updateNext();
}
function footHere(extra) {                          // the footpath where the person is: their side if known, else a single point
  if (S.side) return startThing('foot', { ...sideCtx(S.side.mine, 'mine', sideWords()[0]), ...extra });
  startThing('foot', { title: 'The footpath here', ...extra });
}
$('leadlist').addEventListener('click', (e) => { const b = e.target.closest('[data-lead]'); if (b) LEADS[+b.dataset.lead](); });
$('morelist').addEventListener('click', (e) => { const b = e.target.closest('[data-add]'); if (b) openChoice(b.dataset.add); });
$('sum').addEventListener('click', (e) => {
  const b = e.target.closest('[data-del]'); if (!b) return;
  const [t, x] = [b.dataset.del[0], +b.dataset.del.slice(1)];
  if (t === 'i') { const [it] = S.items.splice(x, 1); if (it === S.last) S.last = null; } else S.checks.splice(x, 1);
  drawMore();
});

// ── the player: nickname + 4-digit PIN, checked with the server ──
const cleanNick = (v) => v.trim().replace(/\s+/g, ' ');
const pinOk = (v) => /^\d{4}$/.test(v);
const profileUrl = (n) => `../profile/?n=${encodeURIComponent(n)}`;
function drawPlay() {
  const p = player.get();
  $('play-box').hidden = !!p; $('play-in').hidden = !p;
  $('start-go').textContent = !PHONE ? 'Add a place you know on the map' : S.gpsFailed ? 'Try my location again' : p ? 'Start' : 'Start anonymously';
  // after the location failed, the map is the way on: it becomes the main button
  const fail = PHONE && !!S.gpsFailed;
  $('to-mark').textContent = fail ? 'Pick the place on a map' : 'Not there? Pick the place on a map';
  $('to-mark').classList.toggle('btn-primary', fail); $('to-mark').classList.toggle('btn-secondary', !fail);
  $('start-go').classList.toggle('btn-primary', !fail); $('start-go').classList.toggle('btn-secondary', fail);
  if (p) { $('play-name').textContent = p.nick; $('play-prof').href = profileUrl(p.nick); }
}
let pmode = 'create';
function setPMode(m) {
  pmode = m; const c = m === 'create';
  $('p-title').textContent = c ? 'Pick a nickname' : 'Log in';
  $('p-hint').textContent = c ? 'And a 4-digit PIN, so you can log in on any phone.' : 'The nickname and 4-digit PIN you made before.';
  $('p-go').textContent = c ? 'Join' : 'Log in';
  $('p-switch-text').textContent = c ? 'Have one already?' : 'New here?';
  $('p-switch').textContent = c ? 'Log in' : 'Pick a nickname';
  $('p-msg').hidden = true;
}
for (const [id, m] of [['play-create', 'create'], ['play-login', 'login'], ['anon-create', 'create'], ['anon-login', 'login']]) $(id).onclick = (e) => { e.preventDefault(); setPMode(m); show('player'); };
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

// ── send: everything at once, with one spam check; if it fails, the answers stay on this phone ──
function itemPoints(i) {
  const mem = S.place && S.place.memory, ph = i.photo ? POINTS.photo : 0;
  if (i.k === 'stop') return (mem ? POINTS.memory : POINTS.stop) + (i.missing ? POINTS.missing : 0) + ph;
  if (i.lead === 'problem' || i.lead === 'footpath') return ph;      // it followed from the person's own report: points once
  if (i.k === 'problem' || i.k === 'request') return POINTS[i.k] + ph;
  return (mem ? POINTS.memory : POINTS[ITEM[i.k]]) + ph;
}
const totalPoints = () => S.items.reduce((a, i) => a + itemPoints(i), 0) + S.checks.length * POINTS.confirm;
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
  if (i.k === 'foot') Object.assign(w, { stretch: i.stretch || null, stretch_side: i.side || null, which: i.stretch ? i.which || null : null,
    side_how: i.side_how || null, road_deg: i.road_deg ?? null, lead: i.lead || null }, answersOf(i));
  if (i.k === 'cross') Object.assign(w, { junction: i.junction || null }, answersOf(i));
  if (i.k === 'problem') Object.assign(w, { problem: i.problem, p_blocked_by: i.problem === 'blocked' && i.blocked_by && i.blocked_by.length ? i.blocked_by : null, lead: i.lead || null });
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
  $('to-map').href = r.ids && r.ids[0] ? '../walking/map/?from=streets&r=' + encodeURIComponent(r.ids[0]) : '../walking/map/?from=streets';
  DONE = true; stack = []; show('thanks', false);
}
async function send() {
  if (sending || !(S.items.length + S.checks.length)) return;
  const body = payload(), saved = { body, at: Date.now(), n: body._sum.n };
  const kept = store.set(saved) || store.set({ ...saved, body: { ...body, items: body.items.map(i => ({ ...i, photo: null })) }, photoDropped: true });
  sending = true; $('send-msg').hidden = true; $('next').disabled = true; $('next').textContent = 'Sending…';
  try { const r = await postIt(body); store.drop(kept); sending = false; thanks(body, r); }
  catch (err) {
    sending = false; $('next').disabled = false; $('next').textContent = 'Try again';
    if (err.server && err.status === 400 && /^nick/.test(err.message)) S.noNick = true;
    const why = err.server && err.status === 400 ? (/^nick/.test(err.message) ? 'The nickname or PIN was not accepted. Press Try again to send it without a nickname, or log in again on the first screen.' : `The server could not accept this (${err.message}).`)
      : err.server && err.status === 403 ? 'The spam check did not finish. Please press Try again.'
      : err.server && err.status === 429 ? 'Too many sends from this connection just now. Please wait a minute.'
      : "We couldn't send this; the signal may be weak.";
    $('send-msg').textContent = `Not sent. ${why} ${kept ? 'Your answers are saved on this phone, so nothing is lost.' : ''}`; $('send-msg').hidden = false;
    document.querySelector('.step[data-step="more"]').scrollTop = 0; window.scrollTo({ top: 0 });   // the message and the spam check sit at the top
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
    try { const r = await postIt(d.body, draftSpam); store.drop(d.id); $('draft').hidden = true; thanks(d.body, r); }
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
// add more after sending: the same place, back to "what do you want to tell us about?"
$('again').onclick = () => {
  DONE = false; Object.assign(S, { items: [], checks: [], cur: null, last: null, choice: null }); stack = ['start'];
  if (S.place) show('choose', false); else show('start', false);
};

// ── first screen: who is logged in, links that open the nickname screen, counts, top contributors ──
drawPlay();
const openPlay = { '#play': 'create', '#create': 'create', '#login': 'login' }[location.hash];
if (openPlay && !player.get()) { setPMode(openPlay); show('player'); }
fetch(`${C.API}/${SURVEY}/reports.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).then(d => {
  const rows = d.features.map(f => f.properties).filter(r => !r.pair), many = (n, w) => `${n.toLocaleString('en-IN')} ${w}${n === 1 ? '' : 's'}`;
  const c = (it) => rows.filter(r => r.item === it).length;
  if (rows.length) $('meta').textContent = 'So far: ' + [many(c('spot'), 'footpath'), many(c('crossing'), 'crossing'), many(c('problem'), 'problem'), many(c('request'), 'suggestion')].join(', ');
}).catch(() => {});
// top contributors: the last 7 days, or all time (Teja, 19 Nov 2026); the server works the board out
fetch(`${C.API}/${SURVEY}/leaderboard.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).then(lb => {
  const me = (player.get()?.nick || '').toLowerCase();
  const draw = (p) => {
    const list = (lb[p] || []).slice(0, 5);
    $('topc-list').innerHTML = list.map(([n, pts], i) => `<li><span>${i + 1}</span><a href="${profileUrl(n)}">${esc(n)}${n.toLowerCase() === me ? ' (you)' : ''}</a><b>${pts.toLocaleString('en-IN')}</b></li>`).join('')
      || `<li class="none">${p === 'week' ? 'No points in the last 7 days yet. Be the first.' : 'No points yet. Be the first.'}</li>`;
    document.querySelectorAll('#topc-seg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.p === p));
  };
  $('topc').hidden = false;
  draw(lb.week ? 'week' : 'all');
  if (!lb.week) document.querySelector('#topc-seg [data-p="week"]').hidden = true;      // an older server: all time only
  $('topc-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) draw(b.dataset.p); });
}).catch(() => {});
if (LOCAL) window.__test = { S, show, next, cands, byHeading, guessSide, landmark, maps: () => ({ mini, smap, pinMap }) };
