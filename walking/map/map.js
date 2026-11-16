// Walking map: footpath spots (walks joined into lines, coloured stretch by stretch) and crossings, one topic at a
// time; feedback on each. Data: contribute-api /walking/reports.json.
import { SURVEY, TOPICS, CROSS_TOPICS, VIEWS, CROSS_VIEWS, VIEW_COLORS, shown, optLabel, esc, loadReports, contributions, metres } from '../questions.js';
const $ = (id) => document.getElementById(id);
const NONE = '#B8BDC6';

const rows = await loadReports().catch(() => null);
if (!rows) { $('loadmsg').hidden = false; $('loadmsg').textContent = "The map's data couldn't load just now. Please try again later."; }
const all = contributions(rows || []);
for (const c of all) for (const s of c.spots) s.kind = s.item;      // spot or crossing
// one thing at a time: a footpath topic (crossings shown faint) or a crossing topic (footpaths faint)
const ALLV = [...VIEWS.map(v => ({ ...v, g: 'foot' })), ...CROSS_VIEWS.map(v => ({ ...v, g: 'x' }))];
const FAINT = '#E5E7EB';
let view = ALLV[0];

function geo() {
  const lines = [], dots = [], xings = [];
  all.forEach(c => {
    const foot = c.spots.filter(s => s.kind !== 'crossing');
    c.spots.forEach((s, i) => {
      const mine = (s.kind === 'crossing') === (view.g === 'x'), v = mine ? view.of(s) : null;
      const props = { c: c.id, i, col: mine ? (v ? VIEW_COLORS[v] : NONE) : FAINT, on: mine ? 1 : 0 };
      const pt = { type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } };
      if (s.kind === 'crossing') { xings.push(pt); return; }
      dots.push(pt);
      const nx = foot[foot.indexOf(s) + 1];          // walks join footpath spots; crossings stand alone
      if (nx) lines.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: [[s.lng, s.lat], [nx.lng, nx.lat]] } });
    });
  });
  const fc = (f) => ({ type: 'FeatureCollection', features: f });
  return { lines: fc(lines), dots: fc(dots), xings: fc(xings) };
}
function drawControls() {
  const chips = (g) => ALLV.filter(v => v.g === g).map(v => `<button type="button" class="chip" aria-pressed="${v === view}" data-v="${v.g}:${v.id}">${esc(v.label)}</button>`).join('');
  $('chips').innerHTML = `<span class="grp">Footpaths</span>${chips('foot')}<span class="grp">Crossings</span>${chips('x')}`;
  $('legend').innerHTML = Object.entries(view.labels).map(([k, l]) => `<span><i style="background:${VIEW_COLORS[k]}"></i>${esc(l)}</span>`).join('') + `<span><i style="background:${NONE}"></i>Not answered</span>`
    + `<span><b class="key-x"></b>Crossing</span><span><b class="key-f"></b>Footpath spot</span>`;
}
$('chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (!b) return; view = ALLV.find(v => `${v.g}:${v.id}` === b.dataset.v); drawControls(); const g = geo(); for (const k of ['lines', 'dots', 'xings']) map.getSource(k)?.setData(g[k]); });
drawControls();

const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.46, 17.415], zoom: 12, attributionControl: { compact: true } });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.on('load', () => {
  const g = geo();
  map.addSource('lines', { type: 'geojson', data: g.lines });
  map.addLayer({ id: 'lines', type: 'line', source: 'lines', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', 'col'], 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 2.5, 16, 7] } });
  map.addSource('dots', { type: 'geojson', data: g.dots });
  map.addLayer({ id: 'dots', type: 'circle', source: 'dots', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 7], 'circle-color': ['get', 'col'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } });
  map.addSource('xings', { type: 'geojson', data: g.xings });
  map.addLayer({ id: 'xings', type: 'circle', source: 'xings', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 10], 'circle-color': ['get', 'col'],
    'circle-stroke-color': ['case', ['==', ['get', 'on'], 1], '#111827', '#9CA3AF'], 'circle-stroke-width': 2 } });
  for (const id of ['lines', 'dots', 'xings']) {
    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; }); map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
  }
  map.on('click', (e) => {
    const f = map.queryRenderedFeatures(e.point, { layers: ['xings', 'dots', 'lines'] })[0]; if (!f) return;
    const c = all.find(x => x.id === f.properties.c), i = f.properties.i, s = c.spots[i];
    const rs = s.side;
    const isX = s.kind === 'crossing', a = s;
    const lines = (isX ? CROSS_TOPICS : TOPICS).flatMap(t => t.qs).filter(q => shown(q, a) && a[q.id] != null).map(q => `<li>${esc(q.s)}: ${esc(q.multi ? a[q.id].map(v => optLabel(q, v)).join(', ') : optLabel(q, a[q.id]))}</li>`).join('');
    new maplibregl.Popup({ maxWidth: '300px' }).setLngLat(e.lngLat).setHTML(`<div class="pop"><b>${isX ? (c.kind === 'walk' ? 'Crossing, on a walk' : 'Crossing') : c.kind === 'walk' ? `Walk, spot ${i + 1} of ${c.spots.length}` : 'A single spot'}</b>
      <div class="meta">${rs ? `${rs[0].toUpperCase() + rs.slice(1)} side of the road · ` : ''}${new Date(c.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${c.nick ? ' · ' + esc(c.nick) : ''}</div>${s.photo ? `<a href="${esc(s.photo)}" target="_blank" rel="noopener"><img src="${esc(s.photo)}" alt="Photo" style="width:100%;max-height:140px;object-fit:cover;margin:4px 0 6px;border-radius:3px"></a>` : ''}
      <ul>${lines}</ul>${s.note ? `<p style="margin:6px 0 0">“${esc(s.note)}”</p>` : ''}${s.confirmed ? `<p style="margin:4px 0 0;color:var(--muted);font-size:13px">${s.confirmed} said it's still like this</p>` : ''}<button type="button" class="fbb" data-id="${esc(s.id)}" data-photo="${s.photo ? 1 : ''}">Give feedback</button></div>`).addTo(map);
  });
});

// numbers and leaderboard
const xs = all.flatMap(c => c.spots).filter(s => s.kind === 'crossing');
const nSpots = all.reduce((a, c) => a + c.spots.filter(s => s.kind !== 'crossing').length, 0), walks = all.filter(c => c.kind === 'walk');
const km = walks.reduce((a, c) => a + c.spots.reduce((d, s, i) => i ? d + metres(c.spots[i - 1], s) : 0, 0), 0) / 1000;
const noFoot = all.flatMap(c => c.spots).filter(s => s.footpath === 'no').length, unmarked = xs.filter(s => s.x_marked === 'none').length;
$('stats').innerHTML = `<div><b>${nSpots}</b>spots</div><div><b>${walks.length}</b>walks</div><div><b>${km.toFixed(1)} km</b>walked</div><div><b>${Math.round(noFoot / Math.max(1, nSpots) * 100)}%</b>of spots have no footpath</div><div><b>${xs.length}</b>crossings</div><div><b>${Math.round(unmarked / Math.max(1, xs.length) * 100)}%</b>of crossings not marked</div>`;

// ── feedback: the same for every spot and crossing ──
let kind = null, target = null;
const dlg = $('dlg'), check = Contribute.spamCheck($('ts-fb'));
document.addEventListener('click', (e) => {
  const b = e.target.closest('.fbb'); if (!b) return;
  target = b.dataset.id; kind = null; $('fb-note').value = ''; $('fb-msg').hidden = true; $('fb-photo').hidden = !b.dataset.photo;
  $('fbopts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', false));
  $('fb-send').disabled = true; $('fb-send').textContent = 'Send'; dlg.showModal();
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
