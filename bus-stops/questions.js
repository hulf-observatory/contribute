// Bus stop survey: the questions, how a stop's condition is worked out, and loading stops and ratings.
// The answer values must match contribute-api/surveys/bus-stops.json (the server refuses anything else).

const C = window.CONTRIBUTE;
export const SURVEY = 'bus-stops';
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// grouped by topic, one screen each. Third value: 1 good … 0 poor. Facilities are not scored.
// "Is there one?" comes first; its follow-ups (if:) show only for the matching answer (Teja, 15 Nov 2026).
export const TOPICS = [
  { id: 'shelter', title: 'Shelter and seating', qs: [
    { id: 'shelter', s: 'Shelter', q: 'Is there a shelter?', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'shelter_state', s: 'Shelter state', q: 'What state is the shelter in?', if: a => a.shelter === 'yes', opts: [['good', 'Good', 1], ['broken', 'Broken', 0]] },
    { id: 'shelter_protects', s: 'Protects from sun and rain', q: 'Does it protect from sun and rain?', if: a => a.shelter === 'yes', opts: [['yes', 'Yes', 1], ['partly', 'Partly', .5], ['no', 'No', 0]] },
    { id: 'shade', s: 'Shade', q: 'Is there shade from trees or buildings?', if: a => a.shelter === 'no', opts: [['yes', 'Yes', 1], ['partly', 'Partly', .5], ['no', 'No', 0]] },
    { id: 'seats', s: 'Seating', q: 'Is there seating?', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'seats_state', s: 'Seating state', q: 'Is it comfortable?', if: a => a.seats === 'yes', opts: [['good', 'Comfortable', 1], ['poor', 'Uncomfortable', .4], ['broken', 'Broken', 0]] },
  ] },
  { id: 'footpath', title: 'Footpath', qs: [
    { id: 'footpath', s: 'Footpath', q: 'Is there a footpath at the stop?', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'blocked', s: 'Footpath blocked', q: 'Is the footpath blocked?', hint: 'By parked vehicles, vendors, debris', if: a => a.footpath === 'yes', opts: [['no', 'No', 1], ['partly', 'Partly', .5], ['badly', 'Badly', 0]] },
    { id: 'pass', s: 'Walk past', q: 'Can you walk or wheel past the stop without stepping onto the road?', if: a => a.footpath === 'yes', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'access', s: 'Access', q: 'Which of these are there?', hint: 'Tick all you see', multi: true, opts: [['ramp', 'A working ramp'], ['tactile', 'Tactile paving'], ['none', 'None of these']] },
    { id: 'crossing', s: 'Crossing', q: 'Is there a pedestrian crossing near the stop?', hint: 'A zebra, a signal, a foot overbridge or a subway', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'crossing_safe', s: 'Safe to cross', q: 'Does it feel safe to cross?', if: a => a.crossing === 'yes', opts: [['yes', 'Yes', 1], ['somewhat', 'Somewhat', .5], ['no', 'No', 0]] },
  ] },
  { id: 'buses', title: 'Buses', qs: [
    { id: 'bus_stops_at', s: 'Buses stop', q: 'Where do buses usually stop?', opts: [['kerb', 'At the kerb', 1], ['step', 'One step out', .6], ['lane', 'In the traffic lane', .2], ['away', 'Away from the stop', 0]] },
    { id: 'view', s: 'View blocked', q: 'Do ads or structures block the view of buses or stop information?', opts: [['yes', 'Yes', 0], ['no', 'No', 1]] },
    { id: 'room', s: 'Room at busy times', q: 'Is there enough room to wait at busy times?', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
  ] },
  { id: 'safety', title: 'Comfort and safety', qs: [
    { id: 'light', s: 'Lighting at night', q: 'Is there lighting at night?', opts: [['yes', 'Yes', 1], ['no', 'No', 0], ['dk', "Don't know"]] },
    { id: 'light_state', s: 'Lighting', q: 'How is the lighting?', if: a => a.light === 'yes', opts: [['good', 'Good', 1], ['poor', 'Poor', .4]] },
    { id: 'safe_day', s: 'Feels by day', q: 'How safe does it feel to wait here during the day?', opts: [['safe', 'Safe', 1], ['somewhat', 'Somewhat', .5], ['unsafe', 'Unsafe', 0]] },
    { id: 'safe_night', s: 'Feels after dark', q: 'How safe does it feel to wait here after dark?', hint: "Skip if you haven't been here after dark", opts: [['safe', 'Safe', 1], ['somewhat', 'Somewhat', .5], ['unsafe', 'Unsafe', 0]] },
    { id: 'floods', s: 'Floods', q: 'Does it flood or water-log when it rains?', opts: [['yes', 'Yes', 0], ['no', 'No', 1], ['dk', "Don't know"]] },
  ] },
  { id: 'signs', title: 'Signs', qs: [
    { id: 'name_sign', s: 'Name sign', q: 'Is the stop name shown on a sign?', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'name_state', s: 'Name sign', q: 'Is it easy to read?', if: a => a.name_sign === 'yes', opts: [['clear', 'Easy to read', 1], ['faded', 'Faded', .5]] },
    { id: 'route_info', s: 'Route information', q: 'Is there route information?', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'route_state', s: 'Route information state', q: 'Is it up to date?', if: a => a.route_info === 'yes', opts: [['current', 'Current', 1], ['outdated', 'Outdated', .4]] },
  ] },
  { id: 'facilities', title: 'Facilities', qs: [
    { id: 'facilities', s: 'Facilities', q: 'Which of these are at or near the stop?', hint: 'Tick all you see', multi: true, score: false, opts: [['dustbin', 'Dustbin'], ['water', 'Drinking water'], ['toilet', 'Toilet in sight'], ['cctv', 'CCTV camera'], ['board', 'Live arrival board'], ['none', 'None of these']] },
  ] },
];
export const QUESTIONS = TOPICS.flatMap(t => t.qs.map(q => ({ ...q, topic: t.id })));
export const MIN_ANSWERS = 3;
export const optLabel = (q, v) => (q.opts.find(o => o[0] === v) || [, v])[1];
export const shown = (q, a) => !q.if || q.if(a);
export const answered = (a) => QUESTIONS.filter(q => shown(q, a) && a[q.id] != null && !(Array.isArray(a[q.id]) && !a[q.id].length)).length;

// condition: the average of the answered, scored questions (ticks count as the share ticked); needs 3 answers
export function score(a) {
  let s = 0, n = 0;
  for (const q of QUESTIONS) {
    if (q.score === false || !shown(q, a)) continue;
    const v = a[q.id];
    if (v == null || (Array.isArray(v) && !v.length)) continue;
    if (q.multi) { s += v.filter(x => x !== 'none').length / (q.opts.length - 1); n++; }
    else { const o = q.opts.find(x => x[0] === v); if (o && typeof o[2] === 'number') { s += o[2]; n++; } }   // "don't know" has no score
  }
  return n >= 3 ? s / n : null;
}
// colours readable with colour blindness (Teja, 15 Nov 2026): blue, light orange, dark red
export const BANDS = [
  { id: 'good', label: 'Good', color: '#2166AC', min: .67 },
  { id: 'fair', label: 'Needs work', color: '#EF8A62', min: .4 },
  { id: 'poor', label: 'Poor', color: '#B2182B', min: 0 },
];
export const UNRATED = { id: 'none', label: 'No details yet', color: '#B8BDC6' };
export const band = (sc) => sc == null ? UNRATED : BANDS.find(b => sc >= b.min);

// map views (Teja, 16 Nov 2026: no overall score; colour stops by one answer at a time). Each view turns a stop's
// latest answers into good / mid (there, but a problem) / bad (missing or a problem) / null (no answer yet).
export const VIEW_COLORS = { good: '#2166AC', mid: '#EF8A62', bad: '#B2182B', none: '#B8BDC6' };
const has = (yes, bad, a, v) => a[yes] === 'no' ? 'bad' : a[yes] === 'yes' ? (bad.includes(a[v]) ? 'mid' : 'good') : null;
export const VIEWS = [
  { id: 'shelter', label: 'Shelter', of: a => has('shelter', ['broken'], a, 'shelter_state'), labels: { good: 'Has a shelter', mid: 'Shelter is broken', bad: 'No shelter' } },
  { id: 'seats', label: 'Seating', of: a => has('seats', ['poor', 'broken'], a, 'seats_state'), labels: { good: 'Has seating', mid: 'Seating uncomfortable or broken', bad: 'No seating' } },
  { id: 'footpath', label: 'Footpath', of: a => has('footpath', ['partly', 'badly'], a, 'blocked'), labels: { good: 'Clear footpath', mid: 'Footpath blocked', bad: 'No footpath' } },
  { id: 'crossing', label: 'Crossing', of: a => has('crossing', ['somewhat', 'no'], a, 'crossing_safe'), labels: { good: 'Crossing, feels safe', mid: 'Crossing, not safe', bad: 'No crossing' } },
  { id: 'light', label: 'Lighting', of: a => has('light', ['poor'], a, 'light_state'), labels: { good: 'Lit at night', mid: 'Poor lighting', bad: 'No lighting' } },
  { id: 'name_sign', label: 'Name sign', of: a => has('name_sign', ['faded'], a, 'name_state'), labels: { good: 'Name easy to read', mid: 'Name faded', bad: 'No name sign' } },
  { id: 'route_info', label: 'Route info', of: a => has('route_info', ['outdated'], a, 'route_state'), labels: { good: 'Route info up to date', mid: 'Route info outdated', bad: 'No route info' } },
  { id: 'safe_night', label: 'Safe after dark', of: a => ({ safe: 'good', somewhat: 'mid', unsafe: 'bad' })[a.safe_night] || null, labels: { good: 'Feels safe', mid: 'Somewhat safe', bad: 'Feels unsafe' } },
  { id: 'floods', label: 'Floods', of: a => ({ no: 'good', yes: 'bad' })[a.floods] || null, labels: { good: "Doesn't flood", bad: 'Floods when it rains' } },
];

// points, as in the survey file on the server (the leaderboard itself is worked out there)
export const POINTS = { rating: 10, first: 10, photo: 5, missing: 15, confirm: 2, flag: 2 };

// ── stops: TGSRTC's (stops.json, next to this file) plus the ones residents added (from the ratings) ──
export async function loadStops(base = '') {
  const d = await (await fetch(`${base}stops.json`)).json();
  return d.stops.map(([id, name, towards, lat, lng, buses, routes, nRoutes]) => ({ id, name, towards, lat, lng, buses, routes, nRoutes }));
}
// always fresh (no-cache): someone may have just sent theirs
export async function loadRatings() {
  const d = await (await fetch(`${C.API}/${SURVEY}/reports.json`, { credentials: 'omit', cache: 'no-cache' })).json();
  return d.features.map(f => ({ ...f.properties, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}
// a stop someone added: its first rating (place_type "missing") carries the name and the pin
export function addedStops(ratings) {
  return ratings.filter(r => r.place_type === 'missing').map(r => ({ id: r.stop_id, name: r.stop_name, towards: r.towards || '',
    lat: r.lat, lng: r.lng, buses: 0, routes: [], nRoutes: 0, added: true }));
}
export const ANSWER_KEYS = QUESTIONS.map(q => q.id);
export const answersOf = (r) => Object.fromEntries(ANSWER_KEYS.filter(k => r[k] != null).map(k => [k, r[k]]));

export function metres(a, b) {
  const R = 6371000, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dg = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export const stopLabel = (s) => s.towards ? `${s.name}, towards ${s.towards}` : s.name;

// ratings per stop, newest first; a stop's state is each question's newest answer
export function byStop(rs) {
  const m = new Map();
  for (const r of [...rs].sort((x, y) => y.observed_at.localeCompare(x.observed_at))) { if (!m.has(r.stop_id)) m.set(r.stop_id, []); m.get(r.stop_id).push(r); }
  return m;
}
export function latest(list) {
  const a = {}, from = {};
  for (const r of list) for (const k of ANSWER_KEYS) if (r[k] != null && !(k in a)) { a[k] = r[k]; from[k] = r; }
  return { answers: a, from };
}

// the player: a nickname and a 4-digit PIN (first come, first served on the server). The phone remembers both so
// the player stays signed in; on another phone they enter them again. A forgotten PIN means a new nickname.
export const player = {
  get() { try { const p = JSON.parse(localStorage.getItem('obs-bus-player')); return p && p.nick && /^\d{4}$/.test(p.pin) ? p : null; } catch { return null; } },
  set(nick, pin) { try { localStorage.setItem('obs-bus-player', JSON.stringify({ nick, pin })); } catch { /* private mode */ } },
  clear() { try { localStorage.removeItem('obs-bus-player'); } catch { /* ignore */ } },
};
// check a nickname and PIN with the server: free / yours / wrong / locked / banned (a wrong PIN counts towards a lock)
// returns { status, name } — name is the nickname as its player first wrote it
// mode: 'create' (free / taken), 'login' (unknown / yours / wrong / locked), or none (either)
export async function checkPlayer(nick, pin, mode) {
  return Contribute.post(`/${SURVEY}/nickname`, { nick, nick_pin: pin, mode });
}
export const PLAYER_SAYS = {
  taken: 'This nickname is already taken. Choose another, or log in if it is yours.',
  unknown: 'There is no contributor with this nickname. Check the spelling, or join as a contributor.',
  wrong: 'This nickname is already taken, or the PIN is wrong. Check the PIN, or choose another nickname.',
  wrongLogin: 'Wrong PIN for this nickname. After 5 wrong tries it is locked for an hour.',
  locked: 'Too many wrong PINs for this nickname. Try again in an hour.',
  banned: "This nickname can't be used. Please choose another.",
};
export const day = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
