// Walking map, road by road (Teja, 17 Nov 2026): main roads (highways, arterials, sub-arterials) are cut into stretches
// of up to ~500 m; each side of a stretch and each junction where main roads meet has a profile built from the spots
// and crossings linked to it. Spots on other streets are single dots. One topic at a time; tap for the profile.
// Data: ../roads.json (stretches, built by contribute-api/tools/build_roads.py), /walking/profiles.json, reports.json.
// Map or list (17 Nov 2026): the list shows road sides, junctions and single spots, newest first; ?p=<profile> or
// ?r=<row id> opens one on the map.
import { SURVEY, TOPICS, CROSS_TOPICS, VIEWS, CROSS_VIEWS, VIEW_COLORS, shown, optLabel, real, esc, loadReports } from '../questions.js?v=20261117e';
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
$('chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; view = ALLV.find(v => `${v.g}:${v.id}` === b.dataset.v); drawControls(); refresh(); drawList(); });
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
  map.addLayer({ id: 'sel', type: 'line', source: 'sides', filter: ['==', ['get', 'id'], selId], paint: { 'line-color': '#111827', 'line-width': 10, 'line-opacity': .22,
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
function histList(p) {
  return `<p class="sec">${p.n} contribution${p.n > 1 ? 's' : ''}${p.checks ? `, ${p.checks} "still like this" check${p.checks > 1 ? 's' : ''}` : ''}</p>
    <ul class="hist">${p.items.map((h, i) => `<li><b>${h.nick ? esc(h.nick) : 'Someone'}</b> <em>${day(h.at)}</em>${i === p.items.length - 1 && p.n <= 20 ? '<span class="tag">Started the profile</span>' : h.prefilled ? '<span class="tag">Updated it</span>' : ''}${h.located === 'memory' ? '<span class="tag">From memory</span>' : ''}</li>`).join('')}</ul>`;
}
const ARR = '<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>';
const buttons = (p) => `<div class="pbtns"><button type="button" class="btn btn-primary btn-lg fbb" data-id="${esc(p.latest)}" data-k="confirm">Still like this</button>
  <a class="btn btn-secondary btn-lg" href="../">Changed? Update it when you're there ${ARR}</a>
  <button type="button" class="linkbtn fbb" data-id="${esc(p.latest)}">Something looks wrong</button></div>`;
function sideLabel(id) {
  const [sid, side] = id.split(':'), s = STRETCH.get(sid), c = s.c, a = c[0], b = c[c.length - 1];
  const brg = (Math.atan2((b[0] - a[0]) * Math.cos(a[1] * Math.PI / 180), b[1] - a[1]) * 180 / Math.PI + 360) % 360;
  const out = (brg + (side === 'l' ? -90 : 90) + 360) % 360;
  const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(out / 45) % 8];
  return { name: s.name || 'Main road', dir, m: Math.round(s.m / 10) * 10, divided: s.sides.length === 1 };
}
function open(html) { $('panel').innerHTML = html; if (matchMedia('(max-width: 959px)').matches) $('panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
let selId = '';                                 // the chosen road side, also when the map draws later
const sel = (id) => { selId = id; if (map.getLayer('sel')) map.setFilter('sel', ['==', ['get', 'id'], id]); };
function showSide(id) {
  sel(id);
  const n = sideLabel(id), p = PROFILES[id];
  const head = `<p class="eyebrow">Footpath profile</p><h2>${esc(n.name)}</h2><p class="ctx">${n.dir[0].toUpperCase() + n.dir.slice(1)} side${n.divided ? ' of a divided road' : ''} · about ${n.m} m, junction to junction</p>`;
  if (!p) return open(head + `<p class="empty">No one has described this side yet. Walking here? Your answers start its profile.</p><div class="pbtns"><a class="btn btn-primary btn-lg" href="../">Describe it ${ARR}</a></div>`);
  open(head + (p.old ? '<p class="oldnote">Not seen recently: the latest answers are more than six months old.</p>' : '') + `<ul class="facts">${facts('spot', p)}</ul>${buttons(p)}${histList(p)}`);
}
function showJunction(id) {
  sel('');
  const p = PROFILES[id], head = `<p class="eyebrow">Crossing profile</p><h2>${esc(junctionName(id))}</h2><p class="ctx">Where main roads meet: one profile for crossing here</p>`;
  if (!p) return open(head + `<p class="empty">No one has described crossing here yet.</p><div class="pbtns"><a class="btn btn-primary btn-lg" href="../">Describe it ${ARR}</a></div>`);
  open(head + (p.old ? '<p class="oldnote">Not seen recently: the latest answers are more than six months old.</p>' : '') + `<ul class="facts">${facts('crossing', p)}</ul>${buttons(p)}${histList(p)}`);
}
function showSpot(rid) {
  sel('');
  const r = ROWS.find(x => x.id === rid); if (!r) return;
  const kind = r.item === 'crossing' ? 'crossing' : 'spot';
  const items = QS(kind).filter(q => shown(q, r) && real(r[q.id])).map(q => `<li><span>${esc(q.s)}</span><b>${esc(q.multi ? r[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, r[q.id]))}</b></li>`).join('');
  open(`<p class="eyebrow">A single ${kind === 'crossing' ? 'crossing' : 'spot'}</p><h2>${kind === 'crossing' ? 'Crossing' : 'Footpath spot'} on another street</h2>
    <p class="ctx">${day(r.observed_at)}${r.nick ? ' · ' + esc(r.nick) : ''}${r.located === 'memory' ? ' · from memory' : ''}${r.confirmed ? ` · ${r.confirmed} said it's still like this` : ''}</p>
    ${r.photo ? `<a href="${esc(r.photo)}" target="_blank" rel="noopener"><img class="pphoto" src="${esc(r.photo)}" alt="Photo"></a>` : ''}<ul class="facts">${items}</ul>${r.note ? `<p>“${esc(r.note)}”</p>` : ''}
    <p class="empty">Only main roads have profiles for now.</p>
    <div class="pbtns"><button type="button" class="btn btn-secondary btn-lg fbb" data-id="${esc(r.id)}" data-photo="${r.photo ? 1 : ''}">Give feedback</button></div>`);
}

// ── numbers, in one line (Teja, 17 Nov 2026); "checked" = someone else said it's still like this ──
const keys = Object.keys(PROFILES), sideKeys = keys.filter(k => k.includes(':'));
const km = sideKeys.reduce((a, k) => a + (STRETCH.get(k.split(':')[0])?.m || 0), 0) / 1000;
const checked = ROWS.filter(r => r.confirmed > 0).length, fmt = (n) => n.toLocaleString('en-IN');
$('counts').innerHTML = [`${fmt(sideKeys.length)} road sides described (${km.toFixed(1)} km)`, `${fmt(keys.length - sideKeys.length)} junctions`,
  `${fmt(loose.length)} spots on other streets`, `${fmt(checked)} of ${fmt(ROWS.length)} checked by someone else`,
  '<a href="../../bus-stops/leaderboard/">Leaderboard</a>', '<a href="../download/">Download</a>'].join(' · ');

// a junction's name: the main roads that meet there
function junctionName(id) {
  const j = JUNCTION.get(id); if (!j) return 'Junction';
  const near = (c) => Math.abs(c[0] - j.c[0]) < 0.0008 && Math.abs(c[1] - j.c[1]) < 0.0008;
  const names = [...new Set([...STRETCH.values()].filter(s => s.name && (near(s.c[0]) || near(s.c[s.c.length - 1]))).map(s => s.name))];
  return names.length > 1 ? `${names.slice(0, 2).join(' and ')} junction` : names.length ? `Junction on ${names[0]}` : 'Junction';
}

// ── map or list: road sides, junctions and single spots, newest first; a row opens it on the map ──
const colourOf = (g, a) => { const v = a && view.g === g ? view.of(a) : null; return v ? VIEW_COLORS[v] : NONE; };
const factLine = (vs, a) => vs.map(v => v.of(a) && v.labels[v.of(a)]).filter(Boolean).slice(0, 3).join(' · ');
const many = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
function listItems() {
  const out = [];
  for (const [key, p] of Object.entries(PROFILES)) {
    const a = flat(p);
    if (key.includes(':')) {
      if (!STRETCH.has(key.split(':')[0])) continue;
      const n = sideLabel(key);
      out.push({ href: '?p=' + encodeURIComponent(key), at: p.seen, name: n.name, col: colourOf('foot', a), facts: factLine(VIEWS, a),
        meta: [`${n.dir[0].toUpperCase() + n.dir.slice(1)} side`, day(p.seen), many(p.n, 'contribution'), p.checks ? 'checked' : null, p.old ? 'not seen recently' : null] });
    } else {
      out.push({ href: '?p=' + encodeURIComponent(key), at: p.seen, name: junctionName(key), col: colourOf('x', a), facts: factLine(CROSS_VIEWS, a),
        meta: ['Crossing at a junction', day(p.seen), many(p.n, 'contribution'), p.checks ? 'checked' : null, p.old ? 'not seen recently' : null] });
    }
  }
  for (const r of loose) {
    const x = r.item === 'crossing';
    out.push({ href: '?r=' + encodeURIComponent(r.id), at: r.observed_at, name: x ? 'Crossing' : 'Footpath spot', col: colourOf(x ? 'x' : 'foot', r), facts: factLine(x ? CROSS_VIEWS : VIEWS, r),
      meta: ['Another street', day(r.observed_at), r.nick ? esc(r.nick) : null, r.located === 'memory' ? 'from memory' : null, r.confirmed ? 'checked' : null] });
  }
  return out.sort((a, b) => String(b.at).slice(0, 16).localeCompare(String(a.at).slice(0, 16)));
}
let mode = 'map', shownN = 60;
function drawList() {
  if (mode !== 'list') return;
  const items = listItems();
  $('rows').innerHTML = items.slice(0, shownN).map(it => `<li><a href="${it.href}" data-open="${it.href}"><i class="dot" style="background:${it.col}"></i><span class="t"><b>${esc(it.name)}</b>
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
// open one profile or spot on the map: ?p=<stretch:side or junction> or ?r=<row id> (the thank-you screen links here)
function openItem(q) {
  const P = new URLSearchParams(q), r = P.get('r') ? ROWS.find(x => x.id === P.get('r')) : null;
  const key = P.get('p') || (r && (r.stretch && r.stretch_side ? `${r.stretch}:${r.stretch_side}` : r.junction)) || null;
  let at = null, go = null;
  if (key && key.includes(':') && STRETCH.has(key.split(':')[0])) { const c = STRETCH.get(key.split(':')[0]).c; at = c[Math.floor(c.length / 2)]; go = () => showSide(key); }
  else if (key && JUNCTION.has(key)) { at = JUNCTION.get(key).c; go = () => showJunction(key); }
  else if (r) { at = [r.lng, r.lat]; go = () => showSpot(r.id); }
  if (!go) return;
  map.jumpTo({ center: at, zoom: 16.5 }); go();   // the panel needs no map; the highlight follows when the map has drawn
}
$('rows').addEventListener('click', (e) => {
  const a = e.target.closest('[data-open]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault(); setMode('map');
  const P = new URLSearchParams(location.search); P.delete('p'); P.delete('r');      // keep any other parameters
  for (const [k, v] of new URLSearchParams(a.dataset.open)) P.set(k, v);
  history.replaceState(null, '', location.pathname + '?' + P);
  openItem(a.dataset.open); window.scrollTo({ top: 0 });
});
if (location.hash === '#list') setMode('list');
if (location.search) openItem(location.search);

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
