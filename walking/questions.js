// Walking and bus stops (Teja, 18 Nov 2026): one entry for everything about walking at one place. Bus stops, footpaths
// (a side of a road, junction to junction) and crossings each have a few core questions, then "more" after; problems and
// requests are pins. The answer values must match contribute-api/surveys/walking.json and bus-stops.json.
import { QUESTIONS as STOP_QS, currentOf, describe } from '../bus-stops/questions.js?v=20261119a';
const C = window.CONTRIBUTE;
export const SURVEY = 'walking';
export const inHmda = (lng, lat) => lng >= C.HMDA[0] && lng <= C.HMDA[2] && lat >= C.HMDA[1] && lat <= C.HMDA[3];
export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { player, checkPlayer, PLAYER_SAYS, currentOf, describe } from '../bus-stops/questions.js?v=20261119a';

const DK = ['dk', "Don't know"];
const isFoot = a => a.footpath === 'yes' || a.footpath === 'parts';
const FOOT = {
  core: [
    { id: 'footpath', s: 'Footpath', q: 'Is there a footpath on this side?', opts: [['yes', 'Yes, most of the way'], ['parts', 'Only in parts'], ['no', 'No']] },
    { id: 'walk_where', s: 'People walk', q: 'Where do people walk?', multi: true, if: a => a.footpath === 'no',
      opts: [['road', 'On the road'], ['edge', 'At the road edge, beside traffic'], ['dirt', 'On a dirt path']] },
    { id: 'height', s: 'Height', q: 'How high is the footpath from the road?', if: isFoot, opts: [['easy', 'Easy to step up'], ['high', 'Too high to step up easily'], ['level', 'Level with the road']] },
    { id: 'walkable', s: 'Easy to walk', q: 'Is it easy to walk on?', if: isFoot, opts: [['easy', 'Easy'], ['somewhat', 'Somewhat'], ['hard', 'Hard']] },
    { id: 'broken', s: 'Broken', q: 'Is it broken?', if: isFoot, opts: [['no', 'No'], ['places', 'In places'], ['mostly', 'Mostly']] },
    { id: 'blocked', s: 'Blocked', q: 'Is it blocked?', if: isFoot, opts: [['no', 'No'], ['places', 'In places'], ['mostly', 'Mostly']] },
    { id: 'blocked_by', s: 'Blocked by', q: 'Blocked by what?', multi: true, if: a => isFoot(a) && ['places', 'mostly'].includes(a.blocked),
      opts: [['parked', 'Parked vehicles'], ['vendors', 'Vendors or shops'], ['works', 'Construction or debris'], ['poles', 'Poles, trees or transformers'], ['garbage', 'Garbage']] },
    { id: 'wheel', s: 'Wheelchair', q: 'Could someone in a wheelchair use it?', if: isFoot, opts: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']] },
  ],
  more: [
    { id: 'shade', s: 'Shade', q: 'Is there shade?', hint: 'From trees or buildings', opts: [['most', 'Most of the way'], ['some', 'Some'], ['none', 'None']] },
    { id: 'lights', s: 'Street lights', q: 'Are there street lights?', opts: [['working', 'Yes, working'], ['broken', 'Yes, not working'], ['none', 'No lights']] },
    { id: 'safe_day', s: 'Safe by day', q: 'Does it feel safe to walk here by day?', opts: [['safe', 'Safe'], ['somewhat', 'Somewhat'], ['unsafe', 'Unsafe']] },
    { id: 'safe_night', s: 'Safe after dark', q: 'Does it feel safe after dark?', opts: [['safe', 'Safe'], ['somewhat', 'Somewhat'], ['unsafe', 'Unsafe'], ['dk', "Haven't been here after dark"]] },
  ],
};
const CROSS = {
  core: [
    { id: 'x_can', s: 'Can people cross', q: 'Can people cross here?', opts: [['yes', 'Yes'], ['hard', 'With difficulty'], ['no', 'No']] },
    { id: 'x_hard', s: 'What makes it hard', q: 'What makes it hard?', multi: true, if: a => a.x_can === 'hard' || a.x_can === 'no',
      opts: [['barricade', 'Barricades'], ['fence', 'Median fence or railing'], ['parked', 'Parked vehicles'], ['traffic', 'Too much traffic']] },
    { id: 'x_marked', s: 'Marked', q: 'Is the crossing marked?', opts: [['zebra', 'Zebra stripes'], ['faded', 'Faded'], ['none', 'Not marked']] },
    { id: 'x_signal', s: 'Walk signal', q: 'Is there a signal for people walking?', opts: [['working', 'Working'], ['broken', 'Not working'], ['none', 'No']] },
    { id: 'x_safe', s: 'Feels', q: 'Does it feel safe to cross?', opts: [['safe', 'Safe'], ['somewhat', 'Somewhat'], ['unsafe', 'Unsafe']] },
  ],
  more: [
    { id: 'x_divider', s: 'Divider', q: 'Is there a divider in the middle?', opts: [['none', 'No divider'], ['level', 'Yes, with a level gap'], ['climb', 'Yes, you have to climb'], ['nogap', 'Yes, no gap']] },
    { id: 'x_stop', s: 'Vehicles stop', q: 'Do vehicles stop for people crossing?', opts: [['usually', 'Usually'], ['sometimes', 'Sometimes'], ['rarely', 'Rarely']] },
    { id: 'x_lit', s: 'Lit at night', q: 'Is it lit at night?', opts: [['yes', 'Yes'], ['poor', 'Poorly'], ['no', 'No']] },
    { id: 'x_wheel', s: 'Wheelchair', q: 'Could someone in a wheelchair cross here?', opts: [['yes', 'Yes'], ['partly', 'Partly'], ['no', 'No']] },
  ],
};
for (const q of [...FOOT.core, ...FOOT.more, ...CROSS.core, ...CROSS.more]) if (!q.multi && !q.opts.some(o => o[0] === 'dk')) q.opts.push(DK);
// bus stops: the bus stop survey's own questions (same data), the short ones first; its footpath and crossing questions
// are left out here, since the footpath and crossing have their own
const pick = (ids) => ids.map(id => STOP_QS.find(q => q.id === id)).filter(Boolean);
const STOP = {
  core: pick(['shelter', 'shelter_state', 'seats', 'bus_stops_at', 'name_sign', 'light', 'safe_day']),
  more: pick(['shelter_protects', 'shade', 'seats_state', 'name_state', 'light_state', 'route_info', 'route_state', 'room', 'view', 'ramp', 'safe_night', 'floods', 'facilities']),
};
export const SETS = {
  stop: { name: 'Bus stop', ...STOP, moreSays: 'Route information, room at busy times, ramp, dustbin, water' },
  foot: { name: 'Footpath', ...FOOT, moreSays: 'Shade, street lights, feeling safe' },
  cross: { name: 'Crossing', ...CROSS, moreSays: 'Divider, vehicles stopping, lights, wheelchair' },
};
export const ITEM = { stop: 'stop', foot: 'spot', cross: 'crossing' };   // the thing → the row's `item`
export const MIN = { stop: 3, foot: 1, cross: 1 };                       // real answers the server wants ("Don't know" doesn't count)
export const allQs = (k) => [...SETS[k].core, ...SETS[k].more];
export const shown = (q, a) => !q.if || q.if(a);
export const real = (v) => v != null && v !== 'dk' && !(Array.isArray(v) && !v.length);
export const nAnswered = (k, a) => allQs(k).filter(q => shown(q, a) && real(a[q.id])).length;
export const optLabel = (q, v) => (q.opts.find(o => o[0] === v) || [, v])[1];
export const qById = (k, id) => allQs(k).find(q => q.id === id);

// problems and requests: pins (colours as on the map)
export const PROBLEMS = [['broken', 'Broken footpath', '#B2182B'], ['blocked', 'Blocked footpath', '#B2182B'], ['nofoot', 'No footpath here', '#B2182B'],
  ['drain', 'Open drain or manhole', '#B2182B'], ['water', 'Waterlogging', '#EF8A62'], ['waste', 'Garbage or waste', '#EF8A62'],
  ['smell', 'Bad smell', '#EF8A62'], ['dark', 'Dark spot', '#EF8A62'], ['other', 'Something else', '#6B7280']];
export const BLOCKED_BY = FOOT.core.find(q => q.id === 'blocked_by').opts;
export const NEEDS = [['crossing', 'A crossing'], ['footpath', 'A footpath'], ['stop', 'A bus stop'], ['lights', 'Street lights'], ['other', 'Something else']];
export const problemName = (v) => (PROBLEMS.find(p => p[0] === v) || [, 'A problem'])[1];
export const needName = (v) => (NEEDS.find(p => p[0] === v) || [, 'Something'])[1];
export const REQUEST_COLOR = '#7B3294';

// as on the server (19 Nov 2026): footpath or crossing 10 (5 from memory), problem or request 5, photo 5; checks 2.
// A bus stop: 10 (5 from memory), 15 more for adding a missing one
export const POINTS = { spot: 10, crossing: 10, problem: 5, request: 5, memory: 5, photo: 5, confirm: 2, metoo: 2, stop: 10, missing: 15 };

// ── map colours: footpath, crossing ──
export const VIEW_COLORS = { good: '#2166AC', mid: '#EF8A62', bad: '#B2182B' };
export const footColor = (a) => ({ yes: 'good', parts: 'mid', no: 'bad' })[a && a.footpath] || null;
export const crossColor = (a) => ({ yes: 'good', hard: 'mid', no: 'bad' })[a && a.x_can] || null;

// ── places, directions ──
export const metres = (a, b) => { const k = Math.PI / 180, x = (b.lng - a.lng) * Math.cos((a.lat + b.lat) / 2 * k), y = b.lat - a.lat; return Math.hypot(x, y) * k * 6371000; };
export const angle = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
const COMPASS8 = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const compass8 = (deg) => COMPASS8[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
// a road side faces out from the road: the left side of the line's drawing direction faces brg − 90
export const outward = (brg, side) => ((side === 'l' ? brg - 90 : brg + 90) + 360) % 360;
export const sideName = (brg, side) => { const w = compass8(outward(brg, side)); return w[0].toUpperCase() + w.slice(1) + ' side'; };
// the bearing of a stretch near a point (the segment nearest to it)
export function bearingNear(c, p) {
  const k = Math.PI / 180, cos = Math.cos(p.lat * k);
  let best = null;
  for (let i = 0; i < c.length - 1; i++) {
    const ax = c[i][0] * cos, ay = c[i][1], bx = c[i + 1][0] * cos, by = c[i + 1][1], px = p.lng * cos, py = p.lat;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (!best || d < best[0]) best = [d, (Math.atan2(dx, dy) / k + 360) % 360];
  }
  return best ? best[1] : 0;
}

// every visible row of the walking survey, newest first; always fresh
export async function loadReports() {
  const d = await (await fetch(`${C.API}/${SURVEY}/reports.json`, { credentials: 'omit', cache: 'no-cache' })).json();
  return d.features.filter(f => f.geometry).map(f => ({ ...f.properties, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }));
}
// a profile's question lines, for the check screen and the map: [short name, current answer, counts]
export function profileLines(k, p, max = 99) {
  const a = currentOf(p);
  return allQs(k).filter(q => shown(q, a) && p.answers[q.id] && (p.answers[q.id].of || p.answers[q.id].older)).slice(0, max).map(q => {
    const d = describe(q, p.answers[q.id], optLabel);
    return [q.s, d.txt, d.note, d.has];
  });
}
