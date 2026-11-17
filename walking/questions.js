// Walking survey: footpath spots and crossings — the questions, map views and side-of-the-road helpers.
// The answer values must match contribute-api/surveys/walking.json (the server refuses anything else).
const C = window.CONTRIBUTE;
export const SURVEY = 'walking';
export const inHmda = (lng, lat) => lng >= C.HMDA[0] && lng <= C.HMDA[2] && lat >= C.HMDA[1] && lat <= C.HMDA[3];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { player, checkPlayer, PLAYER_SAYS } from '../bus-stops/questions.js';   // one nickname for bus stops and walking

// ── direction: which way you face, then which side of the road you are on ──
export const DIRS = [['n', 'North'], ['e', 'East'], ['s', 'South'], ['w', 'West']];
export const nearestDir = (deg) => DIRS[Math.round(((deg % 360) + 360) % 360 / 90) % 4][0];
// facing north, your left is the west side of the road
const LEFT_OF = { n: 'west', e: 'north', s: 'east', w: 'south' }, RIGHT_OF = { n: 'east', e: 'south', s: 'west', w: 'north' };
export const roadSide = (facing, side) => !facing || !side || side === 'dk' ? null : (side === 'left' ? LEFT_OF : RIGHT_OF)[facing];
// pointing the phone at the road: the road is that way, so you are on the opposite side
const OPP_WORD = { n: 'south', e: 'west', s: 'north', w: 'east' };
export const sideFromRoad = (roadAt) => OPP_WORD[roadAt] || null;
// a spot's side: from the phone (roadAt) or from the facing + left/right buttons
export const sideWord = (s) => s.sideWord || (s.how === 'phone' ? sideFromRoad(s.roadAt) : roadSide(s.facing, s.lr || s.side));

// ── questions, one screen per topic; `if` hides a follow-up until its first question is answered ──
const yesFoot = a => a.footpath === 'yes', noFoot = a => a.footpath === 'no';
export const TOPICS = [
  { id: 'footpath', title: 'The footpath', short: 'Footpath', qs: [
    { id: 'footpath', s: 'Footpath', q: 'Is there a footpath on your side of the road?', opts: [['yes', 'Yes'], ['no', 'No']] },
    { id: 'other_side', s: 'Other side', q: 'Is there one on the other side?', if: noFoot, opts: [['yes', 'Yes'], ['no', 'No']] },
    { id: 'walk_where', s: 'People walk', q: 'Where do people walk?', hint: 'Tick all that fit', multi: true, if: noFoot,
      opts: [['road', 'On the road'], ['edge', 'On a dirt or gravel edge'], ['parked', 'Between parked vehicles'], ['cross', 'They cross to the other side']] },
    { id: 'walkable', s: 'Easy to walk', q: 'Is it easy to walk on?', if: yesFoot, opts: [['easy', 'Easy'], ['somewhat', 'Somewhat'], ['hard', 'Hard']] },
    { id: 'blocked', s: 'Blocked', q: 'Is it blocked?', if: yesFoot, opts: [['no', 'No'], ['partly', 'Partly'], ['fully', 'Fully']] },
    { id: 'blocked_by', s: 'Blocked by', q: 'Blocked by what?', hint: 'Tick all you see', multi: true, if: a => yesFoot(a) && ['partly', 'fully'].includes(a.blocked),
      opts: [['vehicles', 'Parked vehicles'], ['shops', 'Shops or vendors'], ['debris', 'Building material or debris'], ['garbage', 'Garbage'], ['poles', 'Poles, trees or transformers'], ['other', 'Something else']] },
    { id: 'damaged', s: 'Damaged', q: 'Is it damaged?', if: yesFoot, opts: [['no', 'No'], ['some', 'In places'], ['badly', 'Badly']] },
    { id: 'damage', s: 'Damage', q: 'What kind of damage?', hint: 'Tick all you see', multi: true, if: a => yesFoot(a) && ['some', 'badly'].includes(a.damaged),
      opts: [['slabs', 'Broken or loose slabs'], ['drain', 'Open drain or manhole'], ['holes', 'Holes or dug up'], ['uneven', 'Steps or uneven height'], ['other', 'Something else']] },
  ] },
  { id: 'comfort', title: 'Shade, access and safety', short: 'Shade and safety', qs: [
    { id: 'shade', s: 'Shade', q: 'Is there shade?', hint: 'From trees or buildings', opts: [['most', 'Most of it'], ['some', 'Some'], ['none', 'None']] },
    { id: 'access', s: 'Wheelchair or pram', q: 'Could someone use it with a wheelchair or pram?', if: yesFoot, opts: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']] },
    { id: 'lights', s: 'Street lights', q: 'Are there street lights?', opts: [['working', 'Yes, working'], ['broken', 'Yes, not working'], ['none', 'No lights']] },
    { id: 'safe_day', s: 'Safe by day', q: 'Does it feel safe to walk here by day?', opts: [['safe', 'Safe'], ['somewhat', 'Somewhat'], ['unsafe', 'Unsafe']] },
    { id: 'safe_night', s: 'Safe after dark', q: 'Does it feel safe to walk here after dark?', opts: [['safe', 'Safe'], ['somewhat', 'Somewhat'], ['unsafe', 'Unsafe'], ['dk', "Haven't been here after dark"]] },
  ] },
];
// ── crossings (Teja, 16 Nov 2026): a crossing on its own, or added during a walk ──
export const CROSS_TOPICS = [
  { id: 'xing', title: 'The crossing', short: 'Crossing', qs: [
    { id: 'x_where', s: 'Where', q: 'Where is the crossing?', opts: [['junction', 'At a junction'], ['between', 'Between junctions']] },
    { id: 'x_marked', s: 'Marked', q: 'Is the crossing marked?', opts: [['zebra', 'Zebra stripes'], ['faded', 'Faded'], ['none', 'Not marked']] },
    { id: 'x_signal', s: 'Signal', q: 'Is there a signal for people walking?', opts: [['working', 'Working'], ['broken', 'Not working'], ['none', 'No']] },
    { id: 'x_time', s: 'Enough time', q: 'Is there enough time to cross?', if: a => a.x_signal === 'working', opts: [['yes', 'Yes'], ['just', 'Just about'], ['no', 'No']] },
    { id: 'x_stop', s: 'Vehicles stop', q: 'Do vehicles stop for people crossing?', opts: [['usually', 'Usually'], ['sometimes', 'Sometimes'], ['rarely', 'Rarely']] },
    { id: 'x_divider', s: 'Divider', q: 'Is there a divider in the middle of the road?', opts: [['yes', 'Yes'], ['no', 'No']] },
    { id: 'x_gap', s: 'Gap in divider', q: 'Is there a gap in it to walk through?', if: a => a.x_divider === 'yes', opts: [['level', 'Yes, level'], ['climb', 'Yes, but you have to climb'], ['none', 'No gap']] },
  ] },
  { id: 'xwait', title: 'Waiting, light and safety', short: 'Waiting and safety', qs: [
    { id: 'x_wait', s: 'Waiting space', q: 'Is there space to wait safely, at the kerb or in the middle?', opts: [['yes', 'Yes'], ['cramped', 'Cramped'], ['no', 'No']] },
    { id: 'x_lit', s: 'Lit at night', q: 'Is it lit at night?', opts: [['yes', 'Yes'], ['poor', 'Poorly'], ['no', 'No']] },
    { id: 'x_kerb', s: 'Wheelchair or pram', q: 'Is it easy to get on and off the footpath with a wheelchair or pram?', opts: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']] },
    { id: 'x_fob', s: 'Bridge or subway', q: 'Is there a foot over bridge or subway nearby?', opts: [['used', 'Yes, people use it'], ['unused', "Yes, but people don't use it"], ['no', 'No']] },
    { id: 'x_safe', s: 'Feels', q: 'Does it feel safe to cross?', opts: [['safe', 'Safe'], ['somewhat', 'Somewhat'], ['unsafe', 'Unsafe']] },
  ] },
];
// every one-answer question ends with "Don't know" (Teja, 17 Nov 2026: instead of skipping); it never counts as an
// answer: not for the one-answer minimum, not in profiles, not in map colours
for (const t of [...TOPICS, ...CROSS_TOPICS]) for (const q of t.qs) if (!q.multi && !q.opts.some(o => o[0] === 'dk')) q.opts.push(['dk', "Don't know"]);
export const QUESTIONS = [...TOPICS, ...CROSS_TOPICS].flatMap(t => t.qs.map(q => Object.assign(q, { topic: t.id, topicShort: t.short })));
export const topicsFor = (s) => s && s.kind === 'crossing' ? CROSS_TOPICS : TOPICS;
export const shown = (q, a) => !q.if || q.if(a);
export const real = (v) => v != null && v !== 'dk' && !(Array.isArray(v) && !v.length);
// real answers (not "Don't know") among the questions shown for this spot or crossing; the server wants at least one
export const nAnswered = (kind, a) => topicsFor({ kind }).flatMap(t => t.qs).filter(q => shown(q, a) && real(a[q.id])).length;
export const optLabel = (q, v) => (q.opts.find(o => o[0] === v) || [, v])[1];
export const POINTS = { spot: 10, crossing: 10, photo: 5, confirm: 2, flag: 2 };

// ── map: one topic at a time, same colours as the bus stop map ──
export const VIEW_COLORS = { good: '#2166AC', mid: '#EF8A62', bad: '#B2182B' };
export const VIEWS = [
  { id: 'footpath', label: 'Footpath', of: a => a.footpath === 'no' ? 'bad' : a.footpath === 'yes' ? ['partly', 'fully'].includes(a.blocked) || ['some', 'badly'].includes(a.damaged) ? 'mid' : 'good' : null,
    labels: { good: 'Clear footpath', mid: 'Blocked or damaged', bad: 'No footpath' } },
  { id: 'walkable', label: 'Easy to walk', of: a => ({ easy: 'good', somewhat: 'mid', hard: 'bad' })[a.walkable] || (a.footpath === 'no' ? 'bad' : null),
    labels: { good: 'Easy', mid: 'Somewhat', bad: 'Hard or no footpath' } },
  { id: 'shade', label: 'Shade', of: a => ({ most: 'good', some: 'mid', none: 'bad' })[a.shade] || null, labels: { good: 'Mostly shaded', mid: 'Some shade', bad: 'No shade' } },
  { id: 'access', label: 'Wheelchair or pram', of: a => ({ yes: 'good', partly: 'mid', no: 'bad' })[a.access] || (a.footpath === 'no' ? 'bad' : null),
    labels: { good: 'Usable', mid: 'Partly', bad: 'Not usable' } },
  { id: 'lights', label: 'Street lights', of: a => ({ working: 'good', broken: 'mid', none: 'bad' })[a.lights] || null, labels: { good: 'Working lights', mid: 'Lights not working', bad: 'No lights' } },
  { id: 'safe_night', label: 'Safe after dark', of: a => ({ safe: 'good', somewhat: 'mid', unsafe: 'bad' })[a.safe_night] || null, labels: { good: 'Feels safe', mid: 'Somewhat safe', bad: 'Feels unsafe' } },
];

export const CROSS_VIEWS = [
  { id: 'x_marked', label: 'Marked', of: a => ({ zebra: 'good', faded: 'mid', none: 'bad' })[a.x_marked] || null, labels: { good: 'Zebra stripes', mid: 'Faded', bad: 'Not marked' } },
  { id: 'x_signal', label: 'Signal', of: a => a.x_signal === 'working' ? (a.x_time === 'no' ? 'mid' : 'good') : ({ broken: 'mid', none: 'bad' })[a.x_signal] || null,
    labels: { good: 'Working signal', mid: 'Not working, or too little time', bad: 'No signal' } },
  { id: 'x_stop', label: 'Vehicles stop', of: a => ({ usually: 'good', sometimes: 'mid', rarely: 'bad' })[a.x_stop] || null, labels: { good: 'Usually', mid: 'Sometimes', bad: 'Rarely' } },
  { id: 'x_gap', label: 'Gap in divider', of: a => ({ level: 'good', climb: 'mid', none: 'bad' })[a.x_gap] || null, labels: { good: 'Level gap', mid: 'Have to climb', bad: 'No gap' } },
  { id: 'x_safe', label: 'Safe to cross', of: a => ({ safe: 'good', somewhat: 'mid', unsafe: 'bad' })[a.x_safe] || null, labels: { good: 'Feels safe', mid: 'Somewhat safe', bad: 'Feels unsafe' } },
];

export const metres = (a, b) => { const k = Math.PI / 180, x = (b.lng - a.lng) * Math.cos((a.lat + b.lat) / 2 * k), y = b.lat - a.lat; return Math.hypot(x, y) * k * 6371000; };
export const bearing = (a, b) => { const k = Math.PI / 180, y = Math.sin((b.lng - a.lng) * k) * Math.cos(b.lat * k),
  x = Math.cos(a.lat * k) * Math.sin(b.lat * k) - Math.sin(a.lat * k) * Math.cos(b.lat * k) * Math.cos((b.lng - a.lng) * k); return (Math.atan2(y, x) / k + 360) % 360; };

// every visible spot and crossing, newest first; always fresh (someone may have just sent theirs)
export async function loadReports(base = '') {
  const d = await (await fetch(`${C.API}/${SURVEY}/reports.json`, { credentials: 'omit', cache: 'no-cache' })).json();
  return d.features.filter(f => f.geometry).map(f => ({ ...f.properties, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}
// group into contributions: a walk's spots and crossings (by walk_id, in order) or a single one
export function contributions(rows) {
  const walks = new Map(), out = [];
  for (const r of rows) {
    if (r.walk_id) { if (!walks.has(r.walk_id)) { const c = { id: r.walk_id, kind: 'walk', at: r.observed_at, nick: r.nick, spots: [] }; walks.set(r.walk_id, c); out.push(c); } walks.get(r.walk_id).spots.push(r); }
    else out.push({ id: r.id, kind: r.item, at: r.observed_at, nick: r.nick, spots: [r] });
  }
  for (const c of walks.values()) c.spots.sort((a, b) => a.seq - b.seq);
  return out;
}
