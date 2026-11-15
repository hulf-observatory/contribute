// Bus stop survey: the questions, how a stop's condition is worked out, and loading stops and ratings.
// The answer values must match contribute-api/surveys/bus-stops.json (the server refuses anything else).

const C = window.CONTRIBUTE;
export const SURVEY = 'bus-stops';
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// grouped by topic, one screen each. Third value: 1 good … 0 poor. Facilities are not scored.
export const TOPICS = [
  { id: 'shelter', title: 'Shelter and seating', qs: [
    { id: 'what', s: 'At the stop', q: 'What is at the stop?', opts: [['shelter', 'A shelter', 1], ['sign', 'A signboard only', .5], ['nothing', 'Nothing', 0]] },
    { id: 'shelter_state', s: 'Shelter', q: 'What state is the shelter in?', if: a => a.what === 'shelter', opts: [['good', 'Good', 1], ['worn', 'Worn', .5], ['broken', 'Dirty or broken', 0]] },
    { id: 'roof', s: 'Roof dry', q: 'Does the roof keep people dry?', if: a => a.what === 'shelter', opts: [['yes', 'Yes', 1], ['partly', 'Partly', .5], ['no', 'No', 0]] },
    { id: 'seats', s: 'Seating', q: 'Seating', opts: [['good', 'Comfortable', 1], ['poor', 'Uncomfortable', .4], ['none', 'None', 0]] },
  ] },
  { id: 'footpath', title: 'Footpath', qs: [
    { id: 'pass', s: 'Walk past', q: 'Can you walk or wheel past the stop without stepping onto the road?', opts: [['yes', 'Yes', 1], ['no', 'No', 0]] },
    { id: 'blocked', s: 'Footpath blocked', q: 'Is the footpath at the stop blocked?', hint: 'By parked vehicles, vendors, debris', opts: [['no', 'No', 1], ['partly', 'Partly', .5], ['badly', 'Badly', 0]] },
    { id: 'access', s: 'Access', q: 'Which of these are there?', hint: 'Tick all you see', multi: true, opts: [['footpath_both', 'Footpath on both sides'], ['ramp', 'A working ramp'], ['tactile', 'Tactile paving'], ['crossing', 'A crossing nearby'], ['none', 'None of these']] },
  ] },
  { id: 'buses', title: 'Buses', qs: [
    { id: 'bus_stops_at', s: 'Buses stop', q: 'Where do buses usually stop?', opts: [['kerb', 'At the kerb', 1], ['step', 'One step out', .6], ['lane', 'In the traffic lane', .2], ['away', 'Away from the stop', 0]] },
    { id: 'view', s: 'View blocked', q: 'Do ads or structures block the view of buses or stop information?', opts: [['yes', 'Yes', 0], ['no', 'No', 1]] },
    { id: 'crowded', s: 'Overcrowded', q: 'Is it overcrowded at busy times?', opts: [['yes', 'Yes', 0], ['no', 'No', 1]] },
  ] },
  { id: 'safety', title: 'Comfort and safety', qs: [
    { id: 'shade', s: 'Shade', q: 'Shade while you wait', hint: 'From the shelter or trees', opts: [['yes', 'Yes', 1], ['partly', 'Partly', .5], ['no', 'No', 0]] },
    { id: 'light', s: 'Night lighting', q: 'Lighting at night', hint: "Skip if you haven't been here after dark", opts: [['good', 'Good', 1], ['poor', 'Poor', .4], ['none', 'None', 0]] },
    { id: 'safe', s: 'Feels', q: 'How safe does it feel?', opts: [['safe', 'Safe', 1], ['somewhat', 'Somewhat', .5], ['unsafe', 'Unsafe', 0]] },
    { id: 'floods', s: 'Floods', q: 'Does it flood or water-log when it rains?', opts: [['yes', 'Yes', 0], ['no', 'No', 1]] },
  ] },
  { id: 'signs', title: 'Signs', qs: [
    { id: 'name_sign', s: 'Name shown', q: 'Is the stop name shown?', opts: [['clear', 'Clearly', 1], ['faded', 'Faded', .5], ['missing', 'Missing', 0]] },
    { id: 'route_info', s: 'Route info', q: 'Route information', opts: [['current', 'Current', 1], ['outdated', 'Outdated', .4], ['none', 'None', 0]] },
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
    else { const o = q.opts.find(x => x[0] === v); if (o) { s += o[2]; n++; } }
  }
  return n >= 3 ? s / n : null;
}
// colours readable with colour blindness (Teja, 15 Nov 2026): blue, light orange, dark red
export const BANDS = [
  { id: 'good', label: 'Good', color: '#2166AC', min: .67 },
  { id: 'fair', label: 'Needs work', color: '#EF8A62', min: .4 },
  { id: 'poor', label: 'Poor', color: '#B2182B', min: 0 },
];
export const UNRATED = { id: 'none', label: 'Not rated yet', color: '#B8BDC6' };
export const band = (sc) => sc == null ? UNRATED : BANDS.find(b => sc >= b.min);

// points, as in the survey file on the server (the leaderboard itself is worked out there)
export const POINTS = { rating: 10, first: 10, photo: 5, missing: 15, confirm: 2, flag: 2 };

// ── stops: TGSRTC's (stops.json, next to this file) plus the ones residents added (from the ratings) ──
export async function loadStops(base = '') {
  const d = await (await fetch(`${base}stops.json`)).json();
  return d.stops.map(([id, name, towards, lat, lng, buses, routes, nRoutes]) => ({ id, name, towards, lat, lng, buses, routes, nRoutes }));
}
export async function loadRatings() {
  const d = await (await fetch(`${C.API}/${SURVEY}/reports.json`, { credentials: 'omit' })).json();
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

// the nickname and the hidden code that keeps it this phone's (first come, first served on the server)
export const nick = {
  get() { try { return localStorage.getItem('obs-bus-nick') || ''; } catch { return ''; } },
  set(v) { try { v ? localStorage.setItem('obs-bus-nick', v) : localStorage.removeItem('obs-bus-nick'); } catch { /* private mode */ } },
  secret() {
    try {
      let s = localStorage.getItem('obs-nick-secret');
      if (!s) { s = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9-]/g, ''); localStorage.setItem('obs-nick-secret', s); }
      return s;
    } catch { return null; }
  },
};
export const day = (iso) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
