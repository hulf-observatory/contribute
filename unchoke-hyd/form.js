// Mission Un-choke: My City, My Sujhaav (Teja, 19 Nov 2026). A small survey for the citizens' group Let's Un-choke
// Hyderabad, from their Google Form: five things to tell us about, one a time, with our location step (phone, area
// search, a pasted Google Maps link, or a point on the map), up to 6 photos, and "Add another" after sending.
// Its entries are a survey of their own on the server (`unchoke-hyd`), apart from the streets and bus stop data, with
// their own map (map/) and download. No profile here. Answer codes are the data's, footpaths as in the streets data.
import { mapMark } from '../assets/map-mark.js?v=20261124a';

const C = window.CONTRIBUTE, SURVEY = 'unchoke-hyd';
const $ = (id) => document.getElementById(id);
const esc = Contribute.esc;
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// the hourly files on the data site (GitHub Pages): downloads never touch our server
const DATA = (LOCAL && new URLSearchParams(location.search).get('data')) || 'https://hyderabad.urbanobservatory.in/data/contribute/unchoke-hyd';
const DK = ['dk', "Don't know"];
const YND = [['yes', 'Yes'], ['no', 'No'], DK];
const LEVEL = [['no', 'No'], ['places', 'In places'], ['mostly', 'Mostly'], DK];
const hasFootpath = (a) => a.footpath === 'yes' || a.footpath === 'parts';

// what each choice asks, in order; `when` leaves a question out. Answer codes are the ones the data uses.
const CHOICES = {
  zebra: { about: 'zebra', name: 'A bus stop with no zebra crossing', blurb: 'No safe way to cross near the stop', place: 'stop', note: 'Anything to add?', real: true,
    qs: [{ k: 'crossing', q: 'Is there a crossing near this bus stop?', hint: 'A zebra crossing, signal, foot overbridge or subway within about 100 metres.', opts: YND },
         { k: 'crossing_marked', q: 'Is the crossing marked?', when: a => a.crossing === 'yes', opts: [['zebra', 'Zebra stripes'], ['faded', 'Faded'], ['none', 'Not marked'], DK] },
         { k: 'crossing_can', q: 'Can you cross the road here?', opts: [['yes', 'Yes'], ['hard', 'With difficulty'], ['no', 'No'], DK] }] },
  cycle: { about: 'cycle', name: 'A bus stop that needs cycle parking', blurb: 'Where a cycle stand can be put', place: 'stop', note: 'Anything to add?', real: true,
    qs: [{ k: 'cycle_stand', q: 'Is there a cycle stand at this bus stop now?', opts: YND },
         { k: 'cycle_space', q: 'Is there space for a cycle stand?', hint: 'Without blocking the footpath.', opts: [['yes', 'Yes'], ['little', 'A little'], ['no', 'No'], DK] },
         { k: 'cycle_room', q: 'How many cycles could be parked?', when: a => a.cycle_space !== 'no', opts: [['upto5', 'Up to 5'], ['6to10', '6 to 10'], ['over10', 'More than 10'], DK] }] },
  foot: { about: 'footpath', name: 'A footpath', blurb: 'Missing, broken or blocked', place: 'mark', markH: 'Where is the footpath?', note: 'Anything to add?', real: true,
    qs: [{ k: 'footpath', q: 'Is there a footpath here?', opts: [['yes', 'Yes, most of the way'], ['parts', 'Only in parts'], ['no', 'No'], DK] },
         { k: 'broken', q: 'Is the footpath broken?', when: hasFootpath, opts: LEVEL },
         { k: 'blocked', q: 'Is the footpath blocked?', when: hasFootpath, opts: LEVEL },
         { k: 'blocked_by', q: 'What blocks it?', hint: 'Choose all that apply.', multi: true, when: a => hasFootpath(a) && (a.blocked === 'places' || a.blocked === 'mostly'),
           opts: [['parked', 'Parked vehicles'], ['vendors', 'Vendors or shops'], ['works', 'Construction or debris'], ['poles', 'Poles, trees or transformers'], ['garbage', 'Garbage']] }] },
  light: { about: 'lights', name: 'Street lights', blurb: "Not working, or none where it's dark", place: 'mark', markH: 'Where are the street lights needed?', note: 'Anything to add?',
    qs: [{ k: 'street_lights', q: 'What about the street lights here?', opts: [['not_working', "A street light isn't working"], ['dark', "It's dark here, no street lights"], ['asked', 'Ask for street lights here']] }] },
  vfree: { about: 'vehicle_free', name: 'A street to make vehicle-free', blurb: 'A market or busy street for walking only', place: 'mark', markH: 'Where is the street or market?', note: 'Describe the area', noteHint: 'Landmarks, how busy it gets',
    qs: [{ k: 'vf_name', q: 'Name of the street or market', text: 'Sultan Bazar', hint: 'As people call it.' },
         { k: 'vf_hours', q: 'When should it be vehicle-free?', opts: [['all_day', 'All day'], ['hours', 'Certain hours'], ['market_days', 'Market days only'], DK] }] },
};
const ORDER = ['zebra', 'cycle', 'foot', 'light', 'vfree'];
const MAX = 6;                                   // photos for one entry
const NEAR_M = 100, STOP_M = 500;                // further than this from the phone's location: saved as "from memory"

// S.here: the phone's location (when given). S.place: the place the entry is about. S.memory: not there now.
const S = { choice: null, here: null, place: null, memory: false, stop: null, a: {}, qi: 0, photos: [] };
// this visit: the sender's name, email and phone once given, kept in the boxes for "Add another"
const V = { contact: null };
let cur = 'start', stack = [];
const metres = (a, b) => Math.hypot((a.lng - b.lng) * Math.cos(a.lat * Math.PI / 180) * 111320, (a.lat - b.lat) * 110540);
const inside = (p) => p.lng >= C.HMDA[0] && p.lng <= C.HMDA[2] && p.lat >= C.HMDA[1] && p.lat <= C.HMDA[3];
const live = () => CHOICES[S.choice].qs.filter(q => !q.when || q.when(S.a));
const label = (q, v) => (q.opts.find(o => o[0] === v) || [, v])[1];

function progress(s) {
  if (s === 'q') return 40 + 35 * (S.qi / live().length);
  return { choose: 5, where: 12, mark: 25, stop: 28, newstop: 34, photo: 80, who: 92, thanks: 100 }[s] || 0;
}
function show(s, push = true) {
  if (push) stack.push(cur === 'q' ? 'q:' + S.qi : cur);
  cur = s;
  document.querySelectorAll('.step').forEach(e => e.classList.toggle('on', e.dataset.step === s));
  document.body.classList.toggle('in', s !== 'start');
  $('back').hidden = s === 'thanks'; $('prog').hidden = s === 'dl' || s === 'qs';
  $('bar').style.width = progress(s) + '%';
  ({ mark: openMark, stop: openStop, q: drawQ, photo: drawPhoto, who: () => whoCheck(), thanks: drawThanks, dl: drawDl, qs: drawQs, newstop: drawNew }[s] || (() => {}))();
  const h = document.querySelector('.step.on h2'); if (h && s !== 'mark') h.focus({ preventScroll: true });
}
$('back').onclick = () => {
  const s = stack.pop(); if (!s) return show('start', false);
  if (s.startsWith('q:')) { S.qi = +s.slice(2); show('q', false); } else show(s, false);
};

// ── first screens
$('go').onclick = () => show('choose');
$('qs-go').onclick = () => { stack = ['start']; show('choose', false); };
$('to-dl').onclick = () => show('dl');
$('choices').innerHTML = ORDER.map(k => `<button type="button" class="choice go" data-k="${k}"><span><b>${esc(CHOICES[k].name)}</b><small>${esc(CHOICES[k].blurb)}</small></span><i class="tick"></i></button>`).join('');
$('choices').onclick = (e) => {
  const b = e.target.closest('.choice'); if (!b) return;
  Object.assign(S, { choice: b.dataset.k, here: null, place: null, stop: null, a: {}, qi: 0, photos: [], memory: false });
  $('note').value = ''; $('send-msg').hidden = true; $('who-msg').hidden = true;
  $('where-for').textContent = CHOICES[S.choice].name; $('loc-msg').hidden = true;
  show('where');
};
const locMsg = (t) => { $('loc-msg').textContent = t; $('loc-msg').hidden = false; };
$('use-loc').onclick = () => {
  if (!navigator.geolocation) return locMsg("We couldn't use your phone's location. Search for the area or pick the place on a map instead.");
  const b = $('use-loc'), was = b.innerHTML;
  b.disabled = true; b.textContent = 'Finding your location…'; $('loc-msg').hidden = true;
  const done = () => { b.disabled = false; b.innerHTML = was; };
  navigator.geolocation.getCurrentPosition((p) => {
    done();
    const here = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) };
    if (!inside(here)) return locMsg('Your location is outside the Hyderabad area. Search for the area or pick the place on a map instead.');
    S.here = here; S.memory = false; S.place = { lat: here.lat, lng: here.lng };
    show(CHOICES[S.choice].place);
  }, () => { done(); locMsg("We couldn't use your phone's location. Search for the area or pick the place on a map instead."); },
  { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
};
let markFocus = false;
$('to-search').onclick = () => { S.memory = true; S.here = null; S.place = null; markFocus = true; show('mark'); };
$('to-mark').onclick = () => { S.memory = true; S.here = null; S.place = null; markFocus = false; show('mark'); };

// ── the exact place; for a bus stop from memory, the area to look for the stop in
let mm = null, markAt = null;
async function openMark() {
  const stopArea = CHOICES[S.choice].place === 'stop';
  $('mark-h').textContent = stopArea ? 'Find the area of the bus stop' : CHOICES[S.choice].markH;
  $('mark-ok').textContent = stopArea ? 'Show bus stops here' : 'This is the place';
  if (!mm) mm = mapMark($('mark-host'), { mark: 'dot', areas: false, found: true,
    onChange: (p) => { markAt = p; $('mark-ok').disabled = !p.ok; },
    onPick: (p) => { if (p.name && S.place == null) S.picked = p.name; } });
  S.picked = null; $('mark-ok').disabled = true;
  await mm.open();
  if (S.place) mm.jump(S.place.lng, S.place.lat, 17);
  if (markFocus) { markFocus = false; mm.focus(); }
}
$('mark-ok').onclick = () => {
  if (!markAt || !markAt.ok) return;
  const p = { lat: markAt.lat, lng: markAt.lng, name: S.picked || null };
  if (CHOICES[S.choice].place === 'stop') { S.place = p; return show('stop'); }
  if (S.here && metres(S.here, p) > NEAR_M) S.memory = true;      // moved away from where they stand: from memory
  S.place = p; S.qi = 0; show('q');
};

// ── which bus stop: the stops around the place, from our server
let stopMap = null, stops = new Map(), fetched = null, meMark = null;
async function loadStops(c) {
  if (fetched && metres(fetched, c) < 1200) return;
  fetched = { lat: c.lat, lng: c.lng };
  try {
    const r = await fetch(`${C.API}/walking/view?lat=${c.lat.toFixed(4)}&lng=${c.lng.toFixed(4)}&wide=1`, { credentials: 'omit', cache: 'no-store' });
    for (const s of (await r.json()).stops || []) stops.set(s.id, { id: s.id, name: s.name, towards: s.towards || '', lat: s.lat, lng: s.lng });
  } catch { fetched = null; }
  if (stopMap && stopMap.getSource('stops')) stopMap.getSource('stops').setData(stopsGeo());
  drawCards();
}
const stopsGeo = () => ({ type: 'FeatureCollection', features: [...stops.values()].map(s => ({ type: 'Feature', properties: { id: s.id }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } })) });
function drawCards() {
  if (!stopMap) return;
  const c = stopMap.getCenter(), b = stopMap.getBounds();
  const near = [...stops.values()].filter(s => b.contains([s.lng, s.lat])).map(s => ({ ...s, d: metres(s, c) })).sort((x, y) => x.d - y.d).slice(0, 8);
  if (S.stop && !S.stop.missing && !near.some(s => s.id === S.stop.id)) near.unshift(S.stop);
  $('cards').innerHTML = near.map(s => `<button type="button" class="card" data-id="${esc(s.id)}" aria-checked="${!!S.stop && S.stop.id === s.id}"><b>${esc(s.name)}</b><small>${s.towards ? 'Towards ' + esc(s.towards) : 'Bus stop'}</small></button>`).join('')
    || `<div class="card none">${fetched ? 'No bus stops here. Move the map, or add your bus stop below.' : 'Loading bus stops…'}</div>`;
  if (stopMap.getLayer('sel')) stopMap.setFilter('sel', ['==', ['get', 'id'], S.stop && !S.stop.missing ? S.stop.id : '']);
  $('stop-ok').disabled = !S.stop || !!S.stop.missing;
}
function pickStop(id, fly) {
  const s = stops.get(id); if (!s) return;
  S.stop = s;
  if (fly) stopMap.easeTo({ center: [s.lng, s.lat], zoom: Math.max(stopMap.getZoom(), 16.5), duration: 300 });
  drawCards();
  const el = $('cards').querySelector(`[data-id="${CSS.escape(id)}"]`); if (el) el.scrollIntoView({ inline: 'start', block: 'nearest' });
}
function openStop() {
  const at = [S.place.lng, S.place.lat];
  if (!stopMap) {
    stopMap = new maplibregl.Map({ container: 'stop-map', style: STYLE, center: at, zoom: 15.2, minZoom: 11, maxZoom: 19, maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true } });
    stopMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    stopMap.on('load', () => {
      stopMap.getContainer().querySelectorAll('.maplibregl-compact-show').forEach(x => x.classList.remove('maplibregl-compact-show'));
      stopMap.addSource('stops', { type: 'geojson', data: stopsGeo() });
      stopMap.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 2, 15, 5, 18, 8], 'circle-color': '#6B7280', 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
      stopMap.addLayer({ id: 'sel', type: 'circle', source: 'stops', filter: ['==', ['get', 'id'], ''], paint: { 'circle-radius': 10, 'circle-color': '#111827', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } });
      stopMap.on('click', (e) => { const p = e.point, f = stopMap.queryRenderedFeatures([[p.x - 16, p.y - 16], [p.x + 16, p.y + 16]], { layers: ['stops'] })[0]; if (f) pickStop(f.properties.id, false); });
      drawCards();
    });
    stopMap.on('moveend', () => { const c = stopMap.getCenter(); loadStops({ lat: c.lat, lng: c.lng }); drawCards(); });
    if (LOCAL) window.__stopMap = stopMap;                              // local checks only
  } else { stopMap.resize(); stopMap.jumpTo({ center: at, zoom: 15.2 }); }
  if (meMark) { meMark.remove(); meMark = null; }
  if (S.here) meMark = new maplibregl.Marker({ element: Object.assign(document.createElement('div'), { className: 'me' }) }).setLngLat([S.here.lng, S.here.lat]).addTo(stopMap);
  S.stop = null; loadStops(S.place); drawCards();
}
$('cards').onclick = (e) => { const c = e.target.closest('.card[data-id]'); if (c) pickStop(c.dataset.id, true); };
$('stop-ok').onclick = () => { S.qi = 0; show('q'); };
$('no-stop').onclick = () => show('newstop');
function drawNew() {
  $('new-hint').textContent = S.here ? "We'll mark it where you are now. Add it only if you are at the stop." : "We'll mark it where you put the dot on the map.";
  $('new-ok').disabled = !$('new-name').value.trim();
}
$('new-name').oninput = () => { $('new-ok').disabled = $('new-name').value.trim().length < 2; };
$('new-ok').onclick = () => {
  S.stop = { missing: true, name: $('new-name').value.trim(), towards: $('new-towards').value.trim(), lat: S.place.lat, lng: S.place.lng };
  S.qi = 0; show('q');
};

// ── the questions, one a screen
function placeTag() {
  if (S.stop) return S.stop.name + (S.stop.towards ? ' · towards ' + S.stop.towards : '');
  return (S.memory ? 'From memory · ' : '') + (S.place.name || `${S.place.lat.toFixed(4)}, ${S.place.lng.toFixed(4)}`);
}
function drawQ() {
  const q = live()[S.qi];
  $('q-tag').textContent = placeTag(); $('q-h').textContent = q.q; $('q-hint').textContent = q.hint || ''; $('q-hint').hidden = !q.hint; $('q-msg').hidden = true;
  const text = q.text != null;
  $('q-text').hidden = !text; $('q-opts').hidden = text; $('q-foot').hidden = !(text || q.multi);
  if (text) { $('q-text').placeholder = q.text; $('q-text').value = S.a[q.k] || S.place.name || ''; $('q-next').disabled = $('q-text').value.trim().length < 2; return; }
  const on = (v) => q.multi ? (S.a[q.k] || []).includes(v) : S.a[q.k] === v;
  $('q-opts').innerHTML = q.opts.map(([v, t]) => `<button type="button" class="choice${q.multi ? ' multi' : ''}" role="${q.multi ? 'checkbox' : 'radio'}" aria-checked="${on(v)}" data-v="${esc(v)}"><span><b>${esc(t)}</b></span><i class="tick"></i></button>`).join('');
  if (q.multi) $('q-next').disabled = !(S.a[q.k] || []).length;
}
const hasReal = () => live().some(q => { const v = S.a[q.k]; return v != null && v !== 'dk' && v.length !== 0; });
function nextQ() {
  if (S.qi + 1 < live().length) { stack.push('q:' + S.qi); S.qi++; return show('q', false); }
  if (CHOICES[S.choice].real && !hasReal()) { $('q-msg').hidden = false; return; }   // only "Don't know": nothing to send
  stack.push('q:' + S.qi); show('photo', false);
}
$('q-opts').onclick = (e) => {
  const b = e.target.closest('.choice'); if (!b) return;
  const q = live()[S.qi], v = b.dataset.v;
  if (q.multi) { const set = new Set(S.a[q.k] || []); set.has(v) ? set.delete(v) : set.add(v); S.a[q.k] = [...set]; return drawQ(); }
  S.a[q.k] = v;
  CHOICES[S.choice].qs.forEach(x => { if (x.when && !x.when(S.a)) delete S.a[x.k]; });   // an answer that no longer applies goes
  drawQ(); setTimeout(nextQ, 160);
};
$('q-text').oninput = () => { $('q-next').disabled = $('q-text').value.trim().length < 2; };
$('q-next').onclick = () => { const q = live()[S.qi]; if (q.text != null) S.a[q.k] = $('q-text').value.trim(); nextQ(); };

// ── photos: shrunk on the phone (which also drops the location stored in them), up to 6
function shrink(file) {
  return new Promise((ok) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', .8); ok({ data, kb: Math.round(data.length * .75 / 1024) });
    };
    img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
    img.src = url;
  });
}
function drawPhoto() {
  const c = CHOICES[S.choice];
  $('p-tag').textContent = placeTag(); $('note-l').textContent = c.note; $('note').placeholder = c.noteHint || '';
  $('thumbs').innerHTML = Array.from({ length: MAX }, (_, i) => S.photos[i]
    ? `<div class="thumb has"><img src="${S.photos[i].data}" alt="Photo ${i + 1}"><button type="button" data-x="${i}" aria-label="Remove photo ${i + 1}">×</button></div>` : '<div class="thumb"></div>').join('');
  const n = S.photos.length, kb = S.photos.reduce((t, p) => t + p.kb, 0);
  $('photo-btn').textContent = n >= MAX ? '6 photos added' : n ? 'Add more photos' : 'Take or choose photos';
  $('photo-btn').classList.toggle('off', n >= MAX); $('photo-in').disabled = n >= MAX;
  $('p-info').textContent = (n ? `${n} of ${MAX} photos · ${kb > 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB'} to send. ` : '') + 'The location stored in a photo is removed.';
}
$('photo-in').onchange = async (e) => {
  const files = [...e.target.files].slice(0, MAX - S.photos.length); e.target.value = '';
  let bad = 0;
  for (const f of files) { const p = await shrink(f); if (p) S.photos.push(p); else bad++; }
  drawPhoto();
  $('send-msg').hidden = !bad; if (bad) $('send-msg').textContent = bad === 1 ? "One photo couldn't be read and was left out." : `${bad} photos couldn't be read and were left out.`;
};
$('thumbs').onclick = (e) => { const b = e.target.closest('[data-x]'); if (b) { S.photos.splice(+b.dataset.x, 1); drawPhoto(); } };

// ── sending: one entry
function item() {
  const at = S.stop || S.place;                   // a bus stop choice is about the stop: the entry sits there
  // standing there: within 100 m of the phone's location (500 m for a bus stop picked from the map); otherwise from memory
  const mem = S.memory || !S.here || metres(S.here, at) > (S.stop ? STOP_M : NEAR_M);
  return { about: CHOICES[S.choice].about, here: mem ? 'known' : 'yes', place_type: mem ? 'map' : 'gps', observed_at: new Date().toISOString(),
    accuracy_m: mem ? null : S.here.acc, moved_m: mem ? null : Math.round(metres(S.here, at)), lat: +at.lat.toFixed(6), lng: +at.lng.toFixed(6),
    ...(S.stop ? S.stop.missing ? { stop_new: true, stop_name: S.stop.name, towards: S.stop.towards || null } : { stop_id: S.stop.id } : {}),
    ...S.a, note: $('note').value.trim() || null, photos: S.photos.map(p => p.data), contact: whoNow() };
}
$('photo-next').onclick = () => show('who');

// ── who is sending it, then Send (Teja, 20 Nov 2026): a name is needed, so no entry goes without one; an email and a
// phone number are optional. Private and internal, kept for a while to ask about the entry. Sent with the entry.
const EMAIL = /^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,}$/;
const PHONE = /^\+?\d{7,15}$/;                 // after spaces, dashes and brackets are taken out
const whoNow = () => ({ name: $('who-name').value.trim() || null, email: $('who-email').value.trim() || null,
  phone: $('who-phone').value.replace(/[\s().-]/g, '') || null });
const whoOk = () => { const c = whoNow(); return !!c.name && (!c.email || EMAIL.test(c.email)) && (!c.phone || PHONE.test(c.phone)); };
const whoCheck = () => { $('send').disabled = !whoOk(); };
$('who-name').oninput = $('who-email').oninput = $('who-phone').oninput = () => { $('who-msg').hidden = true; whoCheck(); };
const spam = Contribute.spamCheck($('ts'));
$('send').onclick = async () => {
  if (!whoOk()) return;
  const b = $('send'), say = (t) => { $('who-msg').textContent = t; $('who-msg').hidden = !t; };
  b.disabled = true; b.textContent = 'Sending…'; say('');
  try {
    const token = await spam.token();
    if (token === null) throw Object.assign(new Error('spam check'), { server: true, status: 403 });
    await Contribute.post(`/${SURVEY}/reports`, { ...item(), token, website: $('trap').value });
    V.contact = whoNow(); stack = []; show('thanks', false);
  } catch (e) {
    say(!e.server ? "It didn't go: check your connection and press Send again. Your answers are still here."
      : e.status === 403 ? "We couldn't check that you are a person. Wait a moment and press Send again."
      : e.status === 429 ? 'Too many entries just now. Wait a minute and press Send again.'
      : `It didn't go (${e.message}). Go back to change it, or try again.`);
  } finally { spam.reset(); b.textContent = 'Send'; whoCheck(); }
};

// ── thank you
function drawThanks() {
  const c = CHOICES[S.choice], rows = [['About', c.name], ['Where', placeTag()]];
  live().forEach(q => { const v = S.a[q.k]; if (v != null && v.length) rows.push([q.q.replace(/\?$/, ''), q.text != null ? v : Array.isArray(v) ? v.map(x => label(q, x)).join(', ') : label(q, v)]); });
  rows.push(['Photos', S.photos.length ? String(S.photos.length) : 'None']);
  $('sum').innerHTML = rows.map(r => `<li><span>${esc(r[0])}</span><span>${esc(r[1])}</span></li>`).join('');
}
$('again').onclick = () => { stack = ['start']; show('choose', false); };
$('done').onclick = () => { stack = []; show('start', false); };

// ── download: the hourly files on the data site; the photos are zipped here, in the browser
let photoList = null;
// (Teja, 19 Nov 2026) the server writes the files at 20 minutes past each hour, India time (50 past in UTC), and the
// data site shows them a few minutes later. Shown in the reader's own time.
function updateTimes(now = new Date()) {
  const last = new Date(now); last.setUTCMinutes(50, 0, 0); if (last > now) last.setUTCHours(last.getUTCHours() - 1);
  const next = new Date(last.getTime() + 3600e3), t = (x) => x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return { last, next, text: `Updated every hour: these files have what was sent up to about ${t(last)}. Next update at ${t(next)}.` };
}
async function drawDl() {
  $('dl-when').textContent = updateTimes().text; $('dl-when').hidden = false;
  $('dl-csv').href = `${DATA}/${SURVEY}-reports.csv`; $('dl-geo').href = `${DATA}/${SURVEY}-reports.geojson`; $('dl-readme').href = `${DATA}/README.md`;
  if (photoList) return;
  $('dl-zip').disabled = true;
  try {
    const r = await fetch(`${DATA}/${SURVEY}-reports.geojson`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const f = (await r.json()).features || [];
    photoList = f.flatMap(x => x.properties.photos || []);
    $('dl-hint').textContent = `${f.length} ${f.length === 1 ? 'entry' : 'entries'} sent through this page so far. Free to use.`;
    $('dl-zip-t').textContent = photoList.length ? `${photoList.length} photo${photoList.length === 1 ? '' : 's'} in one zip · each is named in the table` : 'No photos yet';
    $('dl-zip').disabled = !photoList.length;
  } catch { $('dl-hint').textContent = 'Everything sent through this page. Free to use.'; $('dl-zip-t').textContent = 'No photos yet'; }
}
// a plain zip (files stored as they are: JPEGs don't shrink further)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zip(files) {                             // [{ name, data: Uint8Array }]
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(8, 0, true); h.setUint16(10, 0, true); h.setUint16(12, 0x21, true);
    h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, f.data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true);
    c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + f.data.length;
  }
  const size = central.reduce((n, p) => n + p.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
}
$('dl-zip').onclick = async () => {
  const b = $('dl-zip'), files = [];
  b.disabled = true;
  try {
    for (let i = 0; i < photoList.length; i++) {
      b.textContent = `${i + 1} of ${photoList.length}`;
      const r = await fetch(`${DATA}/photos/${photoList[i]}`);
      if (r.ok) files.push({ name: photoList[i], data: new Uint8Array(await r.arrayBuffer()) });
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(zip(files)), download: 'unchoke-hyd-photos.zip' });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    $('dl-zip-t').textContent = `${files.length} photo${files.length === 1 ? '' : 's'} saved as unchoke-hyd-photos.zip`;
  } catch { $('dl-zip-t').textContent = "The photos couldn't be fetched. Check your connection and try again."; }
  b.textContent = 'Download'; b.disabled = false;
};
$('dl-qs').onclick = () => show('qs');
function drawQs() {
  $('qlist').innerHTML = ORDER.map(k => { const c = CHOICES[k]; return `<h3>${esc(c.name)}</h3>` + (c.place === 'stop' ? '<p>Which bus stop? <span>Picked on a map</span></p>' : '<p>Where is it? <span>The phone\'s location, or a place on a map</span></p>')
    + c.qs.map(q => `<p>${esc(q.q)} <span>${q.text != null ? 'In your words' : esc(q.opts.map(o => o[1]).join(' · '))}${q.multi ? ' (all that apply)' : ''}</span></p>`).join('')
    + `<p>${esc(c.note)} <span>Optional, in your words</span></p><p>Photos <span>Optional, up to 6</span></p>`; }).join('')
    + '<h3>For every entry</h3><p>Your name <span>Needed; kept private</span></p><p>Email, phone number <span>Optional; kept private</span></p>';
}
if (location.hash === '#questions') show('qs');
if (location.hash === '#download') show('dl');
if (location.hash === '#start') show('choose');
if (LOCAL) window.__unchoke = { S, V, show, item, zip, updateTimes };      // local checks only
