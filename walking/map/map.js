// Walking map, road by road (Teja, 17 Nov 2026): main roads (highways, arterials, sub-arterials) are cut into stretches
// of up to ~500 m; each side of a stretch and each junction where main roads meet has a profile built from the spots
// and crossings linked to it. Spots on other streets are single dots. One topic at a time; tap for the profile.
// Data: ../roads.json (stretches, built by contribute-api/tools/build_roads.py), /walking/profiles.json, reports.json.
import { SURVEY, TOPICS, CROSS_TOPICS, VIEWS, CROSS_VIEWS, VIEW_COLORS, shown, optLabel, esc, loadReports } from '../questions.js?v=20261117c';
const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const NONE = '#A9AFB8', FAINT = '#E5E7EB';     // grey: main roads with no profile yet
const day = (d) => d ? new Date(d.length > 10 ? d : d + 'T12:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const [roads, prof, rows] = await Promise.all([
  fetch('../roads.json').then(r => r.json()).catch(() => null),
  fetch(`${C.API}/${SURVEY}/profiles.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).catch(() => null),
  loadReports().catch(() => null)]);
if (!roads || !prof || !rows) { $('loadmsg').hidden = false; $('loadmsg').textContent = "Some of the map's data couldn't load just now. Please try again later."; }
const STRETCH = new Map((roads?.stretches || []).map(s => [s.id, s]));
const JUNCTION = new Map((roads?.junctions || []).map(j => [j.id, j]));
const PROFILES = prof?.profiles || {};
const ROWS = rows || [];
const flat = (p) => p ? Object.fromEntries(Object.entries(p.answers).map(([k, x]) => [k, x.v])) : null;
const loose = ROWS.filter(r => !r.stretch && !r.junction);          // spots and crossings away from main roads

// ── one topic at a time: a footpath topic (junctions faint) or a crossing topic (roads faint) ──
const ALLV = [...VIEWS.map(v => ({ ...v, g: 'foot' })), ...CROSS_VIEWS.map(v => ({ ...v, g: 'x' }))];
let view = ALLV[0];
function sidesGeo() {
  const f = [];
  for (const s of STRETCH.values()) for (const side of s.sides) {
    const p = PROFILES[`${s.id}:${side}`], v = p && view.g === 'foot' ? view.of(flat(p)) : null;
    f.push({ type: 'Feature', properties: { id: `${s.id}:${side}`, side, has: p ? 1 : 0, col: !p ? NONE : view.g !== 'foot' ? FAINT : v ? VIEW_COLORS[v] : NONE, old: p && p.old ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: s.c } });
  }
  return { type: 'FeatureCollection', features: f };
}
function junctionsGeo() {
  return { type: 'FeatureCollection', features: [...JUNCTION.values()].map(j => {
    const p = PROFILES[j.id], v = p && view.g === 'x' ? view.of(flat(p)) : null;
    return { type: 'Feature', properties: { id: j.id, has: p ? 1 : 0, col: !p ? '#fff' : view.g !== 'x' ? '#fff' : v ? VIEW_COLORS[v] : NONE }, geometry: { type: 'Point', coordinates: j.c } };
  }) };
}
function dotsGeo() {
  return { type: 'FeatureCollection', features: loose.map(r => {
    const mine = (r.item === 'crossing') === (view.g === 'x'), v = mine ? view.of(r) : null;
    return { type: 'Feature', properties: { id: r.id, col: !mine ? FAINT : v ? VIEW_COLORS[v] : NONE, x: r.item === 'crossing' ? 1 : 0 }, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } };
  }) };
}
function drawControls() {
  const chips = (g) => ALLV.filter(v => v.g === g).map(v => `<button type="button" class="chip" aria-pressed="${v === view}" data-v="${v.g}:${v.id}">${esc(v.label)}</button>`).join('');
  $('chips').innerHTML = `<span class="grp">Footpaths</span>${chips('foot')}<span class="grp">Crossings</span>${chips('x')}`;
  $('legend').innerHTML = Object.entries(view.labels).map(([k, l]) => `<span><i style="background:${VIEW_COLORS[k]}"></i>${esc(l)}</span>`).join('')
    + `<span><i style="background:${NONE}"></i>No profile yet</span><span><b class="key-x"></b>Junction where main roads meet</span><span><b class="key-f"></b>Spot on another street</span>`;
}
function refresh() { map.getSource('sides')?.setData(sidesGeo()); map.getSource('jn')?.setData(junctionsGeo()); map.getSource('dots')?.setData(dotsGeo()); }
$('chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; view = ALLV.find(v => `${v.g}:${v.id}` === b.dataset.v); drawControls(); refresh(); });
drawControls();

// ── map ──
const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.47, 17.41], zoom: 11.6, minZoom: 9, maxZoom: 19,
  maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true }, cooperativeGestures: matchMedia('(max-width: 767px)').matches });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.on('load', () => {
  document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
  map.addSource('sides', { type: 'geojson', data: sidesGeo() });
  const off = (s) => ['interpolate', ['exponential', 2], ['zoom'], 12, s * 0.6, 19, s * 9];   // each side drawn beside the road line
  for (const s of ['l', 'r']) map.addLayer({ id: 'side-' + s, type: 'line', source: 'sides', filter: ['==', ['get', 'side'], s],
    layout: { 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-offset': off(s === 'l' ? -1 : 1),
      'line-width': ['interpolate', ['linear'], ['zoom'], 10, ['case', ['==', ['get', 'has'], 1], 2, 1], 16, ['case', ['==', ['get', 'has'], 1], 5, 2.5]],
      'line-opacity': ['case', ['==', ['get', 'old'], 1], 0.5, 1] } });
  map.addLayer({ id: 'sel', type: 'line', source: 'sides', filter: ['==', ['get', 'id'], ''], paint: { 'line-color': '#111827', 'line-width': 10, 'line-opacity': .22,
    'line-offset': ['case', ['==', ['get', 'side'], 'l'], -6, 6] } }, 'side-l');
  map.addSource('dots', { type: 'geojson', data: dotsGeo() });
  map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 5.5], 'circle-color': ['get', 'col'],
    'circle-stroke-color': ['case', ['==', ['get', 'x'], 1], '#111827', '#fff'], 'circle-stroke-width': 1.2 } });
  map.addSource('jn', { type: 'geojson', data: junctionsGeo() });
  map.addLayer({ id: 'jn', type: 'circle', source: 'jn', filter: ['any', ['==', ['get', 'has'], 1], ['>=', ['zoom'], 14]],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, ['case', ['==', ['get', 'has'], 1], 4, 2], 17, ['case', ['==', ['get', 'has'], 1], 10, 5]],
      'circle-color': ['get', 'col'], 'circle-stroke-color': ['case', ['==', ['get', 'has'], 1], '#111827', '#9CA3AF'], 'circle-stroke-width': 2 } });
  for (const l of ['side-l', 'side-r', 'jn', 'dots']) { map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; }); }
  map.on('click', (e) => {
    const box = [[e.point.x - 10, e.point.y - 10], [e.point.x + 10, e.point.y + 10]];
    const j = map.queryRenderedFeatures(box, { layers: ['jn'] })[0]; if (j) return showJunction(j.properties.id);
    const d = map.queryRenderedFeatures(box, { layers: ['dots'] })[0]; if (d) return showSpot(d.properties.id);
    const s = map.queryRenderedFeatures(box, { layers: ['side-l', 'side-r'] })[0]; if (s) return showSide(s.properties.id);
  });
});

// ── the profile panel ──
const QS = (kind) => (kind === 'crossing' ? CROSS_TOPICS : TOPICS).flatMap(t => t.qs);
function facts(kind, p) {
  const a = flat(p);
  return QS(kind).filter(q => shown(q, a) && p.answers[q.id]).map(q => {
    const x = p.answers[q.id], txt = q.multi ? x.v.map(v => optLabel(q, v)).join(', ') : optLabel(q, x.v);
    const note = x.of > 1 ? `${x.agree} of the last ${x.of} said this · ${day(x.seen)}` : `One person · ${day(x.seen)}`;
    return `<li><span>${esc(q.s)}</span><b>${esc(txt)}<small>${note}</small></b></li>`;
  }).join('');
}
function history(p) {
  return `<p class="sec">${p.n} contribution${p.n > 1 ? 's' : ''}${p.checks ? `, ${p.checks} "still like this" check${p.checks > 1 ? 's' : ''}` : ''}</p>
    <ul class="hist">${p.items.map((h, i) => `<li><b>${h.nick ? esc(h.nick) : 'Someone'}</b> <em>${day(h.at)}</em>${i === p.items.length - 1 && p.n <= 20 ? '<span class="tag">Started the profile</span>' : h.prefilled ? '<span class="tag">Updated it</span>' : ''}${h.located === 'memory' ? '<span class="tag">From memory</span>' : ''}</li>`).join('')}</ul>`;
}
const buttons = (p) => `<div class="pbtns"><button type="button" class="btn btn-primary btn-lg fbb" data-id="${esc(p.latest)}" data-k="confirm">Still like this</button>
  <a class="btn btn-secondary btn-lg" href="../">Something changed? Update it when you're there</a>
  <button type="button" class="linkbtn fbb" data-id="${esc(p.latest)}">Something looks wrong</button></div>`;
function sideLabel(id) {
  const [sid, side] = id.split(':'), s = STRETCH.get(sid), c = s.c, a = c[0], b = c[c.length - 1];
  const brg = (Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI + 360) % 360;
  const out = (brg + (side === 'l' ? -90 : 90) + 360) % 360;
  const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(out / 45) % 8];
  return { name: s.name || 'Main road', dir, m: Math.round(s.m / 10) * 10, divided: s.sides.length === 1 };
}
function open(html) { $('panel').innerHTML = html; if (matchMedia('(max-width: 959px)').matches) $('panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
function showSide(id) {
  map.setFilter('sel', ['==', ['get', 'id'], id]);
  const n = sideLabel(id), p = PROFILES[id];
  const head = `<p class="eyebrow">Footpath profile</p><h2>${esc(n.name)}</h2><p class="ctx">${n.dir[0].toUpperCase() + n.dir.slice(1)} side${n.divided ? ' of a divided road' : ''} · about ${n.m} m, junction to junction</p>`;
  if (!p) return open(head + `<p class="empty">No one has described this side yet. Walking here? Be the first: your answers start its profile.</p><div class="pbtns"><a class="btn btn-primary btn-lg" href="../">Describe it</a></div>`);
  open(head + (p.old ? '<p class="oldnote">Not seen recently: the latest answers are more than six months old.</p>' : '') + `<ul class="facts">${facts('spot', p)}</ul>${buttons(p)}${history(p)}`);
}
function showJunction(id) {
  map.setFilter('sel', ['==', ['get', 'id'], '']);
  const p = PROFILES[id], head = `<p class="eyebrow">Crossing profile</p><h2>Junction</h2><p class="ctx">Where main roads meet: one profile for crossing here</p>`;
  if (!p) return open(head + `<p class="empty">No one has described crossing here yet.</p><div class="pbtns"><a class="btn btn-primary btn-lg" href="../">Describe it</a></div>`);
  open(head + (p.old ? '<p class="oldnote">Not seen recently: the latest answers are more than six months old.</p>' : '') + `<ul class="facts">${facts('crossing', p)}</ul>${buttons(p)}${history(p)}`);
}
function showSpot(rid) {
  map.setFilter('sel', ['==', ['get', 'id'], '']);
  const r = ROWS.find(x => x.id === rid); if (!r) return;
  const kind = r.item === 'crossing' ? 'crossing' : 'spot';
  const items = QS(kind).filter(q => shown(q, r) && r[q.id] != null).map(q => `<li><span>${esc(q.s)}</span><b>${esc(q.multi ? r[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, r[q.id]))}</b></li>`).join('');
  open(`<p class="eyebrow">A single ${kind === 'crossing' ? 'crossing' : 'spot'}</p><h2>${kind === 'crossing' ? 'Crossing' : 'Footpath spot'} on another street</h2>
    <p class="ctx">${day(r.observed_at)}${r.nick ? ' · ' + esc(r.nick) : ''}${r.located === 'memory' ? ' · from memory' : ''}${r.confirmed ? ` · ${r.confirmed} said it's still like this` : ''}</p>
    ${r.photo ? `<a href="${esc(r.photo)}" target="_blank" rel="noopener"><img class="pphoto" src="${esc(r.photo)}" alt="Photo"></a>` : ''}<ul class="facts">${items}</ul>${r.note ? `<p>“${esc(r.note)}”</p>` : ''}
    <p class="empty">Only main roads have profiles for now. This is kept in the data and the download.</p>
    <div class="pbtns"><button type="button" class="btn btn-secondary btn-lg fbb" data-id="${esc(r.id)}" data-photo="${r.photo ? 1 : ''}">Give feedback</button></div>`);
}

// ── numbers ──
const keys = Object.keys(PROFILES), sideKeys = keys.filter(k => k.includes(':'));
const km = sideKeys.reduce((a, k) => a + (STRETCH.get(k.split(':')[0])?.m || 0), 0) / 1000;
const checked = ROWS.filter(r => r.confirmed > 0).length;
$('stats').innerHTML = `<div><b>${sideKeys.length.toLocaleString('en-IN')}</b>road sides with a profile</div><div><b>${km.toFixed(1)} km</b>of main road described</div>`
  + `<div><b>${(keys.length - sideKeys.length).toLocaleString('en-IN')}</b>junctions with a crossing profile</div><div><b>${loose.length.toLocaleString('en-IN')}</b>spots on other streets</div>`
  + `<div><b>${checked} of ${ROWS.length}</b>checked by someone else</div>`;

// ── feedback (the same for profiles and single spots): "still like this" goes straight to the dialog's send ──
let kind = null, target = null;
const dlg = $('dlg'), check = Contribute.spamCheck($('ts-fb'));
document.addEventListener('click', (e) => {
  const b = e.target.closest('.fbb'); if (!b) return;
  target = b.dataset.id; kind = b.dataset.k || null; $('fb-note').value = ''; $('fb-msg').hidden = true; $('fb-photo').hidden = !b.dataset.photo;
  $('fbopts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.k === kind));
  $('fb-send').disabled = !kind; $('fb-send').textContent = 'Send'; dlg.showModal();
});
$('fbopts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k; $('fbopts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('fb-send').disabled = false; });
$('fb-cancel').onclick = () => dlg.close();
$('fb-send').onclick = async () => {
  $('fb-send').disabled = true; $('fb-send').textContent = 'Sending…'; $('fb-msg').hidden = true;
  try {
    const token = await check.token();
    if (token === null) throw Object.assign(new Error('The spam check did not finish. Please try again.'), { server: true });
    const r = await Contribute.post(`/${SURVEY}/reports/${target}/feedback`, { kind, note: $('fb-note').value.trim() || null, device: Contribute.device(), token, website: $('fb-trap').value });
    $('fb-msg').textContent = !r.accepted ? 'You already sent this from this phone. Thank you.' : kind === 'confirm' ? 'Thanks, your check is added.' : 'Thank you. We look at every flag; three spam or photo flags hide it until we check.';
    $('fb-msg').hidden = false; $('fb-send').textContent = 'Sent'; setTimeout(() => dlg.close(), 1800);
  } catch (err) {
    $('fb-msg').textContent = err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.' : err.server ? err.message : "That didn't go through; please try again.";
    $('fb-msg').hidden = false; $('fb-send').disabled = false; $('fb-send').textContent = 'Send';
  } finally { check.reset(); }
};
