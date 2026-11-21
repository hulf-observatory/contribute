// Walking and bus stops, the map (Teja, 18 Nov 2026): main-road footpaths a side at a time (junction to junction),
// crossings (junctions have profiles; crossings between junctions are single points), footpaths on other streets,
// problem pins (until 6 months after they were last seen), requests with their "me too" count, and the bus stops people
// described. One section at a time, the same five as the form (Teja, 19 Nov 2026: no "All" view); tap for what people
// found, and check it ("still like this", "still there", "gone", "me too"). Map or list; ?show=<section> opens on one
// (stop / walk / light / problem / request); ?p=<profile> or ?r=<row id> opens one thing, in its section.
// Data: ../roads.json, /walking/profiles.json, /walking/reports.json, /bus-stops/reports.json and profiles.json.
import { SURVEY, SETS, allQs, shown, optLabel, real, esc, loadReports, currentOf, profileLines, PROBLEMS, BLOCKED_BY, problemName, needName,
  REQUEST_COLOR, VIEW_COLORS, footColor, crossColor, compass8, outward } from '../questions.js?v=20261120c';
import { loadRatings, loadProfiles as loadStopProfiles } from '../../bus-stops/questions.js?v=20261119a';
const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const NONE = '#CBD0D7', MIXED = '#8C8C8C', STOP = '#2166AC';     // NONE: sides no one has described yet, thin and faint
const day = (d) => d ? new Date(d.length > 10 ? d : d + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const people = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;
const fmt = (n) => n.toLocaleString('en-IN');
// the form to add to: the new single entry when the person came from it (until it replaces the walking form for everyone)
const FORM = '../../streets/';
document.querySelectorAll('[data-form]').forEach(a => { a.href = FORM; });

const [roads, prof, rows, srows, sprof] = await Promise.all([
  fetch('../roads.json').then(r => r.json()).catch(() => null),
  fetch(`${C.API}/${SURVEY}/profiles.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).catch(() => null),
  loadReports().catch(() => null), loadRatings().catch(() => null), loadStopProfiles().catch(() => null)]);
if (!roads || !prof || !rows) { $('loadmsg').hidden = false; $('loadmsg').textContent = "Some of the map's data couldn't load just now. Please try again later."; }
const STRETCH = new Map((roads?.stretches || []).map(s => [s.id, s]));
const JUNCTION = new Map((roads?.junctions || []).map(j => [j.id, j]));
const PROFILES = prof?.profiles || {};
const ROWS = (rows || []).filter(r => r.item);
const loose = ROWS.filter(r => (r.item === 'spot' && !r.stretch) || (r.item === 'crossing' && !r.junction));     // single points
const problems = ROWS.filter(r => r.item === 'problem' && r.active !== false);
const requests = ROWS.filter(r => r.item === 'request');
// bus stops people described: the latest place of each stop, its profile
const STOPS = new Map();
for (const r of srows || []) if (r.stop_id && !STOPS.has(r.stop_id)) STOPS.set(r.stop_id, { id: r.stop_id, name: r.stop_name, towards: r.towards, lng: r.lng, lat: r.lat });
const SPROF = sprof || {};

// ── what to show: one section at a time, the form's five. Street lights are the problems and suggestions about them ──
const FILTERS = [['stop', 'Bus stops'], ['walk', 'Footpaths and crossings'], ['light', 'Street lights'], ['problem', 'Problems'], ['request', 'Suggestions']];
const asked = new URLSearchParams(location.search).get('show');
let filt = FILTERS.some(f => f[0] === asked) ? asked : 'stop';
const on = (f) => f === 'foot' || f === 'cross' ? filt === 'walk' : filt === f;
const isLight = (r) => (r.item === 'problem' && ['light', 'dim', 'dark'].includes(r.problem)) || (r.item === 'request' && r.need === 'lights');
const sectionOf = (r) => isLight(r) ? 'light' : r.item === 'problem' ? 'problem' : r.item === 'request' ? 'request' : 'walk';
const probs = () => filt === 'light' ? problems.filter(isLight) : filt === 'problem' ? problems.filter(r => !isLight(r)) : [];
const reqs = () => filt === 'light' ? requests.filter(isLight) : filt === 'request' ? requests.filter(r => !isLight(r)) : [];
const NOTES = { walk: 'Each side of a main road is described on its own, junction to junction, and so is crossing at each junction, from what people said there. Thin light lines: no one has described that side yet. Grey: mixed answers, no clear one yet.',
  light: 'Street lights reported as not working or dim, places with no street light, and (before 20 Nov 2026) places where people asked for lights. Reports stay until 6 months after they were last seen.',
  problem: 'Problems stay until 6 months after they were last seen.' };
const colour = (v) => v ? VIEW_COLORS[v] : MIXED;
function sidesGeo() {
  const f = [];
  for (const s of STRETCH.values()) for (const side of s.sides) {
    const p = PROFILES[`${s.id}:${side}`];
    f.push({ type: 'Feature', properties: { id: `${s.id}:${side}`, side, has: p ? 1 : 0, col: !p ? NONE : colour(footColor(currentOf(p))), old: p && p.old ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: s.c } });
  }
  return { type: 'FeatureCollection', features: on('foot') ? f : [] };
}
const pt = (lng, lat, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lng, lat] } });
function pointsGeo() {
  const f = [];
  if (on('cross')) {
    for (const j of JUNCTION.values()) { const p = PROFILES[j.id]; if (p) f.push(pt(j.c[0], j.c[1], { t: 'junction', id: j.id, col: colour(crossColor(currentOf(p))) })); }
    for (const r of loose.filter(r => r.item === 'crossing')) f.push(pt(r.lng, r.lat, { t: 'row', id: r.id, col: colour(crossColor(r)) }));
  }
  if (on('foot')) for (const r of loose.filter(r => r.item === 'spot')) f.push(pt(r.lng, r.lat, { t: 'spot', id: r.id, col: colour(footColor(r)) }));
  if (on('stop')) for (const s of STOPS.values()) f.push(pt(s.lng, s.lat, { t: 'stop', id: s.id, col: STOP }));
  for (const r of probs()) f.push(pt(r.lng, r.lat, { t: 'problem', id: r.id, pv: r.problem }));
  for (const r of reqs()) f.push(pt(r.lng, r.lat, { t: 'request', id: r.id, col: REQUEST_COLOR, n: 1 + (r.metoo || 0) }));
  return { type: 'FeatureCollection', features: f };
}
function drawControls() {
  $('chips').innerHTML = FILTERS.map(([v, l]) => `<button type="button" class="chip" aria-pressed="${v === filt}" data-v="${v}">${l}</button>`).join('');
  const L = [];
  if (on('foot')) L.push(['line', VIEW_COLORS.good, 'Footpath'], ['line', VIEW_COLORS.mid, 'Only in parts'], ['line', VIEW_COLORS.bad, 'No footpath'], ['line', MIXED, 'No clear answer yet'], ['line', NONE, 'Not described yet']);
  if (on('cross')) L.push(['dot', '#111827', 'Crossing (colour: can people cross)']);
  if (on('stop')) L.push(['sq', STOP, 'Bus stop']);
  if (filt === 'problem') L.push(['sqo', '#EF8A62', 'Problem']);
  if (filt === 'request') L.push(['dot', REQUEST_COLOR, 'Suggestion']);
  if (filt === 'light') L.push(['sqo', '#EF8A62', 'Not working, dim, or none'], ['dot', REQUEST_COLOR, 'Street lights asked for']);
  $('legend').innerHTML = L.map(([k, c, l]) => `<span><i class="k-${k}" style="${k === 'sqo' ? `border-color:${c}` : `background:${c}`}"></i>${esc(l)}</span>`).join('');
  $('note').textContent = NOTES[filt] || ''; $('note').hidden = !NOTES[filt];
}
// a section chosen: it shows in the address too, so the page can be linked or reloaded on it
function setFilt(v) {
  if (v === filt) return;
  filt = v;
  const P = new URLSearchParams(location.search); P.set('show', v);
  history.replaceState(null, '', location.pathname + '?' + P + location.hash);
  drawControls(); refresh(); drawList();
}
function refresh() { map.getSource('sides')?.setData(sidesGeo()); map.getSource('pts')?.setData(pointsGeo()); }
$('chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) setFilt(b.dataset.v); });
drawControls();

// ── map ──
const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.47, 17.41], zoom: 11.6, minZoom: 9, maxZoom: 19,
  maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true }, cooperativeGestures: matchMedia('(max-width: 767px)').matches });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
let selId = '';
map.on('load', () => {
  document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
  map.addSource('sides', { type: 'geojson', data: sidesGeo() });
  const off = (s) => ['interpolate', ['exponential', 2], ['zoom'], 12, s * 0.6, 19, s * 9];   // each side drawn beside the road line
  for (const s of ['l', 'r']) map.addLayer({ id: 'side-' + s, type: 'line', source: 'sides', filter: ['==', ['get', 'side'], s],
    layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-offset': off(s === 'l' ? -1 : 1),
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['==', ['get', 'has'], 1], 2.5, 0.4], 14, ['case', ['==', ['get', 'has'], 1], 4, 0.9], 17, ['case', ['==', ['get', 'has'], 1], 6, 2.5]],
      'line-opacity': ['case', ['==', ['get', 'old'], 1], 0.5, 1] } });
  map.addLayer({ id: 'sel', type: 'line', source: 'sides', filter: ['==', ['get', 'id'], selId], paint: { 'line-color': '#111827', 'line-width': 10, 'line-opacity': .22,
    'line-offset': ['case', ['==', ['get', 'side'], 'l'], -6, 6] } }, 'side-l');
  map.addSource('pts', { type: 'geojson', data: pointsGeo() });
  const r = (a, b) => ['interpolate', ['linear'], ['zoom'], 10, a, 17, b];
  map.addLayer({ id: 'pts', type: 'circle', source: 'pts', filter: ['in', ['get', 't'], ['literal', ['junction', 'row', 'spot', 'request']]],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 't'], 'junction', 4, 'request', 4, 3], 17, ['match', ['get', 't'], 'junction', 10, 'request', 9, 6.5]], 'circle-color': ['match', ['get', 't'], 'request', '#fff', ['get', 'col']],
      'circle-stroke-color': ['match', ['get', 't'], 'request', REQUEST_COLOR, 'spot', '#fff', '#111827'], 'circle-stroke-width': ['match', ['get', 't'], 'request', 2.5, 'junction', 2, 1.2] } });
  map.addLayer({ id: 'req-n', type: 'symbol', source: 'pts', filter: ['==', ['get', 't'], 'request'], minzoom: 13,
    layout: { 'text-field': ['to-string', ['get', 'n']], 'text-size': 10, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true }, paint: { 'text-color': REQUEST_COLOR } });
  // bus stops and problems are squares (problems white with their colour's border), drawn once as icons
  map.addImage('sq', square(STOP, STOP), { pixelRatio: 2 });
  for (const [v, , c] of PROBLEMS) map.addImage('p-' + v, square('#fff', c), { pixelRatio: 2 });
  map.addLayer({ id: 'sq', type: 'symbol', source: 'pts', filter: ['in', ['get', 't'], ['literal', ['stop', 'problem']]],
    layout: { 'icon-image': ['case', ['==', ['get', 't'], 'stop'], 'sq', ['concat', 'p-', ['get', 'pv']]], 'icon-allow-overlap': true, 'icon-size': r(0.55, 1) } });
  for (const l of ['side-l', 'side-r', 'pts', 'sq']) { map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; }); }
  map.on('click', (e) => {
    const box = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
    const p = map.queryRenderedFeatures(box, { layers: ['sq', 'pts'] })[0]; if (p) return openPoint(p.properties.t, p.properties.id);
    const s = map.queryRenderedFeatures(box, { layers: ['side-l', 'side-r'] })[0]; if (s) return showSide(s.properties.id);
  });
});
function square(fill, stroke) {
  const n = 28, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d');
  g.fillStyle = fill; g.strokeStyle = stroke; g.lineWidth = 5; g.beginPath(); g.roundRect(4, 4, n - 8, n - 8, 4); g.fill(); g.stroke();
  if (fill === '#fff') { g.beginPath(); g.moveTo(9, n / 2); g.lineTo(n - 9, n / 2); g.stroke(); }
  return g.getImageData(0, 0, n, n);
}

// ── the panel ──
const ARR = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const facts = (k, p) => profileLines(k, p).map(([s, txt, note, has]) => `<li${has ? '' : ' class="none"'}><span>${esc(s)}</span><b>${esc(txt)}<small>${esc(note)}</small></b></li>`).join('');
function histList(p) {
  return `<p class="sec">${p.n} contribution${p.n > 1 ? 's' : ''}${p.checks ? `, ${p.checks} "still like this" check${p.checks > 1 ? 's' : ''}` : ''}</p>
    <ul class="hist">${p.items.map((h, i) => `<li><b>${h.nick ? esc(h.nick) : 'Someone'}</b> <em>${day(h.at)}</em>${i === p.items.length - 1 && p.n <= 20 ? '<span class="tag">Started it</span>' : h.prefilled ? '<span class="tag">Updated it</span>' : ''}${h.located === 'memory' ? '<span class="tag">From memory</span>' : ''}</li>`).join('')}</ul>`;
}
const addYours = (label = 'Not right? Add what you see') => `<a class="btn btn-secondary btn-lg" href="${FORM}">${label} ${ARR}</a>`;
const buttons = (id, sv = SURVEY) => `<div class="pbtns"><button type="button" class="btn btn-primary btn-lg fbb" data-id="${esc(id)}" data-s="${sv}" data-k="confirm">Still like this</button>
  ${addYours()}<button type="button" class="linkbtn fbb" data-id="${esc(id)}" data-s="${sv}" data-k="spam">Report spam</button></div>`;
function sideLabel(id) {
  const [sid, side] = id.split(':'), s = STRETCH.get(sid), c = s.c, a = c[0], b = c[c.length - 1];
  const brg = (Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI + 360) % 360;
  return { name: s.name || 'Main road', dir: compass8(outward(brg, side)), m: Math.round(s.m / 10) * 10, divided: s.sides.length === 1 };
}
function open(html) { $('panel').innerHTML = html; if (matchMedia('(max-width: 959px)').matches) $('panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
const sel = (id) => { selId = id; if (map.getLayer('sel')) map.setFilter('sel', ['==', ['get', 'id'], id]); };
const oldNote = (p) => p.old ? '<p class="oldnote">Not seen recently: the latest answers are more than six months old.</p>' : '';
function showSide(id) {
  sel(id);
  const n = sideLabel(id), p = PROFILES[id];
  const head = `<p class="eyebrow">Footpath</p><h2>${esc(n.name)}</h2><p class="ctx">${n.dir[0].toUpperCase() + n.dir.slice(1)} side${n.divided ? ' of a divided road' : ''} · about ${n.m} m, junction to junction</p>`;
  if (!p) return open(head + `<p class="empty">No one has described this side yet. Walking here? Your answers start it.</p><div class="pbtns">${addYours('Describe it')}</div>`);
  open(head + oldNote(p) + `<ul class="facts">${facts('foot', p)}</ul>${buttons(p.latest)}${histList(p)}`);
}
function showJunction(id) {
  sel('');
  const p = PROFILES[id], head = `<p class="eyebrow">Crossing at a junction</p><h2>${esc(junctionName(id))}</h2><p class="ctx">Where main roads meet: one set of answers for crossing here</p>`;
  if (!p) return open(head + `<p class="empty">No one has described crossing here yet.</p><div class="pbtns">${addYours('Describe it')}</div>`);
  open(head + oldNote(p) + `<ul class="facts">${facts('cross', p)}</ul>${buttons(p.latest)}${histList(p)}`);
}
const who = (r) => [day(r.observed_at), r.nick && esc(r.nick), r.located === 'memory' && 'from memory'].filter(Boolean).join(' · ');
const photo = (r) => r.photo ? `<a href="${esc(r.photo)}" target="_blank" rel="noopener"><img class="pphoto" src="${esc(r.photo)}" alt="Photo"></a>` : '';
const noteOf = (r) => r.note ? `<p>“${esc(r.note)}”</p>` : '';
function showRow(rid) {
  sel('');
  const r = ROWS.find(x => x.id === rid); if (!r) return;
  if (r.item === 'problem') {
    const by = r.p_blocked_by && r.p_blocked_by.length ? `<p class="ctx">Blocked by ${r.p_blocked_by.map(v => (BLOCKED_BY.find(o => o[0] === v) || [, v])[1].toLowerCase()).join(', ')}</p>` : '';
    return open(`<p class="eyebrow">Problem</p><h2>${esc(problemName(r.problem))}</h2><p class="ctx">${who(r)}${r.confirmed ? ` · ${people(r.confirmed)} said it's still there` : ''}${r.gone ? ` · ${r.gone} said it's gone` : ''}</p>${by}${photo(r)}${noteOf(r)}
      <p class="empty">Shown until 6 months after it was last seen, unless people say it's gone.</p>
      <div class="pbtns"><button type="button" class="btn btn-primary btn-lg fbb" data-id="${r.id}" data-k="confirm">Still there</button><button type="button" class="btn btn-secondary btn-lg fbb" data-id="${r.id}" data-k="gone">It's gone</button>
      <button type="button" class="linkbtn fbb" data-id="${r.id}" data-k="spam">Report spam</button></div>`);
  }
  if (r.item === 'request') {
    return open(`<p class="eyebrow">Suggestion</p><h2>Needed: ${esc(needName(r.need).toLowerCase())}</h2><p class="ctx">Asked by ${people(1 + (r.metoo || 0))} · first asked ${day(r.observed_at)}${r.nick ? ' by ' + esc(r.nick) : ''}</p>${photo(r)}${noteOf(r)}
      <div class="pbtns"><button type="button" class="btn btn-primary btn-lg fbb" data-id="${r.id}" data-k="metoo">I need this too</button><button type="button" class="linkbtn fbb" data-id="${r.id}" data-k="spam">Report spam</button></div>`);
  }
  const k = r.item === 'crossing' ? 'cross' : 'foot';
  const items = allQs(k).filter(q => shown(q, r) && real(r[q.id])).map(q => `<li><span>${esc(q.s)}</span><b>${esc(q.multi ? r[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, r[q.id]))}</b></li>`).join('');
  open(`<p class="eyebrow">${k === 'cross' ? 'Crossing between junctions' : 'Footpath on a smaller street'}</p><h2>${k === 'cross' ? 'Crossing' : 'Footpath'}</h2>
    <p class="ctx">${who(r)}${r.confirmed ? ` · ${r.confirmed} said it's still like this` : ''}</p>${photo(r)}<ul class="facts">${items}</ul>${noteOf(r)}${buttons(r.id)}`);
}
function showStop(id) {
  sel('');
  const s = STOPS.get(id), p = SPROF[id]; if (!s) return;
  open(`<p class="eyebrow">Bus stop</p><h2>${esc(s.name || 'Bus stop')}</h2><p class="ctx">${s.towards ? 'towards ' + esc(s.towards) + ' · ' : ''}${p ? people(p.n) : ''}</p>
    ${p ? `<ul class="facts">${facts('stop', p)}</ul>` : ''}<div class="pbtns"><a class="btn btn-primary btn-lg" href="../../bus-stops/stop/?id=${encodeURIComponent(id)}">Open the stop ${ARR}</a>${addYours()}</div>`);
}
function openPoint(t, id) {
  if (t === 'junction') return showJunction(id);
  if (t === 'stop') return showStop(id);
  showRow(id);
}
function junctionName(id) {
  const j = JUNCTION.get(id); if (!j) return 'Junction';
  const near = (c) => Math.abs(c[0] - j.c[0]) < 0.0008 && Math.abs(c[1] - j.c[1]) < 0.0008;
  const names = [...new Set([...STRETCH.values()].filter(s => s.name && (near(s.c[0]) || near(s.c[s.c.length - 1]))).map(s => s.name))];
  return names.length > 1 ? `${names.slice(0, 2).join(' and ')} junction` : names.length ? `Junction on ${names[0]}` : 'Junction';
}

// ── numbers, in one line ──
const keys = Object.keys(PROFILES), sideKeys = keys.filter(k => k.includes(':'));
const km = sideKeys.reduce((a, k) => a + (STRETCH.get(k.split(':')[0])?.m || 0), 0) / 1000;
const nw = (n, w) => `${fmt(n)} ${w}${n === 1 ? '' : 's'}`;
$('counts').innerHTML = [nw(STOPS.size, 'bus stop'), `${nw(sideKeys.length, 'road side')} (${km.toFixed(1)} km)`, nw(keys.length - sideKeys.length + loose.filter(r => r.item === 'crossing').length, 'crossing'),
  nw(problems.length, 'problem'), nw(requests.length, 'suggestion'), '<a href="../../bus-stops/leaderboard/">Leaderboard</a>', '<a href="../download/">Download</a>', '<a href="../../streets/#questions">The questions</a>'].join(' · ');

// ── map or list ──
const many = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
function listItems() {
  const out = [];
  if (on('foot') || on('cross')) for (const [key, p] of Object.entries(PROFILES)) {
    const a = currentOf(p);
    if (key.includes(':')) {
      if (!on('foot') || !STRETCH.has(key.split(':')[0])) continue;
      const n = sideLabel(key), v = footColor(a);
      out.push({ href: '?p=' + encodeURIComponent(key), at: p.seen, name: n.name, col: colour(v), facts: profileLines('foot', p, 3).map(l => `${l[0]}: ${l[1]}`).join(' · '),
        meta: [`Footpath, ${n.dir} side`, day(p.seen), many(p.n, 'contribution'), p.old ? 'not seen recently' : null] });
    } else if (on('cross')) {
      out.push({ href: '?p=' + encodeURIComponent(key), at: p.seen, name: junctionName(key), col: colour(crossColor(a)), facts: profileLines('cross', p, 3).map(l => `${l[0]}: ${l[1]}`).join(' · '),
        meta: ['Crossing at a junction', day(p.seen), many(p.n, 'contribution'), p.old ? 'not seen recently' : null] });
    }
  }
  for (const r of loose) {
    const x = r.item === 'crossing'; if (!on(x ? 'cross' : 'foot')) continue;
    out.push({ href: '?r=' + encodeURIComponent(r.id), at: r.observed_at, name: x ? 'Crossing between junctions' : 'Footpath on a smaller street', col: colour(x ? crossColor(r) : footColor(r)), facts: '',
      meta: [day(r.observed_at), r.nick ? esc(r.nick) : null, r.located === 'memory' ? 'from memory' : null, r.confirmed ? 'checked' : null] });
  }
  for (const r of probs()) out.push({ href: '?r=' + encodeURIComponent(r.id), at: r.seen || r.observed_at, name: problemName(r.problem), col: '#EF8A62', facts: r.note || '',
    meta: ['Problem', day(r.seen || r.observed_at), r.confirmed ? `${r.confirmed} said still there` : null] });
  for (const r of reqs()) out.push({ href: '?r=' + encodeURIComponent(r.id), at: r.observed_at, name: `Needed: ${needName(r.need).toLowerCase()}`, col: REQUEST_COLOR, facts: r.note || '',
    meta: ['Suggestion', day(r.observed_at), `${people(1 + (r.metoo || 0))} asked`] });
  if (on('stop')) for (const s of STOPS.values()) { const p = SPROF[s.id]; out.push({ href: '../../bus-stops/stop/?id=' + encodeURIComponent(s.id), at: p ? p.seen : '', name: s.name || 'Bus stop', col: STOP, facts: '',
    meta: ['Bus stop', s.towards ? 'towards ' + esc(s.towards) : null, p ? many(p.n, 'contribution') : null], stop: true }); }
  return out.sort((a, b) => String(b.at).slice(0, 16).localeCompare(String(a.at).slice(0, 16)));
}
let mode = 'map', shownN = 60;
function drawList() {
  if (mode !== 'list') return;
  const items = listItems();
  $('rows').innerHTML = items.slice(0, shownN).map(it => `<li><a href="${it.href}"${it.stop ? '' : ` data-open="${it.href}"`}><i class="dot" style="background:${it.col}"></i><span class="t"><b>${esc(it.name)}</b>
    <span class="m">${it.meta.filter(Boolean).join(' · ')}</span>${it.facts ? `<span class="f">${esc(it.facts)}</span>` : ''}</span>${ARR}</a></li>`).join('')
    || '<li class="empty">Nothing described yet.</li>';
  $('more').hidden = items.length <= shownN;
}
$('more').onclick = () => { shownN += 60; drawList(); };
function setMode(m) {
  mode = m;
  $('seg').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === m));
  $('v-map').hidden = m !== 'map'; $('v-list').hidden = m !== 'list';
  if (m === 'map') map.resize(); else drawList();
  history.replaceState(null, '', location.pathname + location.search + (m === 'list' ? '#list' : ''));
}
$('seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
function openItem(q) {
  const P = new URLSearchParams(q), r = P.get('r') ? ROWS.find(x => x.id === P.get('r')) : null;
  const key = P.get('p') || (r && r.item === 'spot' && r.stretch && r.stretch_side ? `${r.stretch}:${r.stretch_side}` : r && r.item === 'crossing' && r.junction) || null;
  let at = null, go = null;
  if (key && key.includes(':') && STRETCH.has(key.split(':')[0])) { const c = STRETCH.get(key.split(':')[0]).c; at = c[Math.floor(c.length / 2)]; go = () => showSide(key); }
  else if (key && JUNCTION.has(key)) { at = JUNCTION.get(key).c; go = () => showJunction(key); }
  else if (r) { at = [r.lng, r.lat]; go = () => showRow(r.id); }
  if (!go) return;
  setFilt(key ? 'walk' : sectionOf(r));              // the thing opened is shown: its section is chosen
  map.jumpTo({ center: at, zoom: 16.5 }); go();
}
$('rows').addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); setMode('map');
  const P = new URLSearchParams(location.search); P.delete('p'); P.delete('r');
  for (const [k, v] of new URLSearchParams(a.dataset.open)) P.set(k, v);
  history.replaceState(null, '', location.pathname + '?' + P);
  openItem(a.dataset.open); window.scrollTo({ top: 0 });
});
if (location.hash === '#list') setMode('list');
if (location.search) openItem(location.search);

// ── checks and flags: the dialog shows only what fits the entry ──
let kind = null, target = null, targetSurvey = SURVEY;
const dlg = $('dlg'), check = Contribute.spamCheck($('ts-fb'));
const OPTS = { confirm: ["It's still like this", ''], gone: ["It's gone", ''], metoo: ['I need this too', 'Your voice counts with the others'], photo: ['A problem with the photo', 'A face, a number plate, or not of this place'], spam: ['Spam or fake', ''] };
document.addEventListener('click', (e) => {
  const b = e.target.closest('.fbb'); if (!b) return;
  target = b.dataset.id; kind = b.dataset.k || null; targetSurvey = b.dataset.s || SURVEY;
  const r = ROWS.find(x => x.id === target), ks = r && r.item === 'problem' ? ['confirm', 'gone'] : r && r.item === 'request' ? ['metoo'] : ['confirm'];
  if (r && r.photo) ks.push('photo'); ks.push('spam');
  $('fbopts').innerHTML = ks.map(k => `<button type="button" data-k="${k}" aria-pressed="${k === kind}">${k === 'confirm' && r && r.item === 'problem' ? "It's still there" : OPTS[k][0]}${OPTS[k][1] ? `<small>${OPTS[k][1]}</small>` : ''}</button>`).join('');
  $('fb-note').value = ''; $('fb-msg').hidden = true; $('fb-send').disabled = !kind; $('fb-send').textContent = 'Send'; dlg.showModal();
});
$('fbopts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k; $('fbopts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('fb-send').disabled = false; });
$('fb-cancel').onclick = () => dlg.close();
$('fb-send').onclick = async () => {
  $('fb-send').disabled = true; $('fb-send').textContent = 'Sending…'; $('fb-msg').hidden = true;
  try {
    const token = await check.token();
    if (token === null) throw Object.assign(new Error('The spam check did not finish. Please try again.'), { server: true });
    const r = await Contribute.post(`/${targetSurvey}/reports/${target}/feedback`, { kind, note: $('fb-note').value.trim() || null, device: Contribute.device(), token, website: $('fb-trap').value }, check);
    $('fb-msg').textContent = !r.accepted ? 'You already sent this from this phone. Thank you.' : ['confirm', 'gone', 'metoo'].includes(kind) ? 'Thanks, it’s added.' : 'Thank you. We look at every flag; three spam or photo flags hide it until we check.';
    $('fb-msg').hidden = false; $('fb-send').textContent = 'Sent'; setTimeout(() => dlg.close(), 1800);
  } catch (err) {
    $('fb-msg').textContent = err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.' : err.server ? err.message : "That didn't go through; please try again.";
    $('fb-msg').hidden = false; $('fb-send').disabled = false; $('fb-send').textContent = 'Send';
  } finally { check.reset(); }
};
