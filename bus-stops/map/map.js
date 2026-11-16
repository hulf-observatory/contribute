// Bus stops map: every TGSRTC stop, coloured by its latest answer to one topic at a time (shelter, crossing,
// lighting…); grey = no answer yet. No overall score (Teja, 16 Nov 2026). The leaderboard is its own page.
import { SURVEY, VIEWS, VIEW_COLORS, loadStops, loadRatings, addedStops, byStop, latest, esc } from '../questions.js';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-IN');

const [base, rs, lb] = await Promise.all([loadStops('../').catch(() => []), loadRatings().catch(() => null),
  fetch(`${C.API}/${SURVEY}/leaderboard.json`, { credentials: 'omit' }).then(r => r.json()).catch(() => null)]);
if (!rs) { $('load-msg').hidden = false; $('load-msg').textContent = "Contributions couldn't load just now; showing the stops only."; }
const ratings = rs || [];
const added = addedStops(ratings);
const stops = base.concat(added);
const per = byStop(ratings);
const answersOf = new Map([...per].map(([id, list]) => [id, latest(list).answers]));

$('n-rated').textContent = fmt(per.size);
$('n-of').textContent = `of ${fmt(stops.length)} stops with details`;
$('cover-bar').style.width = (stops.length ? per.size / stops.length * 100 : 0).toFixed(1) + '%';
$('n-ratings').textContent = fmt(ratings.length);
$('n-added').textContent = fmt(added.length);

// ── which topic, and which answers to show ──
let view = VIEWS[0], filter = null;
const catOf = (s) => { const a = answersOf.get(s.id); return a ? view.of(a) || 'none' : 'none'; };
function features() {
  return { type: 'FeatureCollection', features: stops.map(s => {
    const cat = catOf(s), list = per.get(s.id) || [];
    return { type: 'Feature', properties: { id: s.id, name: s.name, towards: s.towards || '', cat, color: VIEW_COLORS[cat], n: list.length,
      last: list[0]?.observed_at || '', added: !!s.added }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } };
  }) };
}
let feats = features().features;
function drawViews() {
  $('views').innerHTML = VIEWS.map(v => `<button type="button" class="chip" aria-pressed="${v === view}" data-v="${v.id}">${esc(v.label)}</button>`).join('');
}
function drawLegend() {
  const counts = {}; feats.forEach(f => { counts[f.properties.cat] = (counts[f.properties.cat] || 0) + 1; });
  const cats = ['good', 'mid', 'bad'].filter(c => view.labels[c]);
  $('chips').innerHTML = cats.concat('none').map(c => `<button type="button" class="chip" aria-pressed="${filter === c}" data-f="${c}"><i style="background:${VIEW_COLORS[c]}"></i>${esc(c === 'none' ? 'No answer yet' : view.labels[c])}<span class="n">${fmt(counts[c] || 0)}</span></button>`).join('');
}
$('views').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  view = VIEWS.find(v => v.id === b.dataset.v); filter = null;
  feats = features().features; drawViews(); drawLegend(); refresh();
  if (pop) pop.remove();
});
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  filter = filter === b.dataset.f ? null : b.dataset.f; drawLegend(); applyFilter();
});
drawViews(); drawLegend();

// ── map ──
const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.47, 17.40], zoom: 10.6, minZoom: 9, maxZoom: 18,
  maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true }, cooperativeGestures: matchMedia('(max-width: 767px)').matches });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.on('load', () => {
  map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
  map.addLayer({ id: 'unanswered', type: 'circle', source: 'stops', filter: ['==', ['get', 'cat'], 'none'],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 15, 4.5], 'circle-color': VIEW_COLORS.none, 'circle-opacity': .8 } });
  map.addLayer({ id: 'answered', type: 'circle', source: 'stops', filter: ['!=', ['get', 'cat'], 'none'],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 15, 8], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } });
  for (const l of ['unanswered', 'answered']) {
    map.on('click', l, (e) => popup(e.features[0]));
    map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
  }
  document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
  applyFilter();
});
function refresh() { if (map.getSource('stops')) map.getSource('stops').setData({ type: 'FeatureCollection', features: feats }); applyFilter(); }
function applyFilter() {
  if (!map.getLayer('answered')) return;
  map.setLayoutProperty('unanswered', 'visibility', !filter || filter === 'none' ? 'visible' : 'none');
  map.setLayoutProperty('answered', 'visibility', filter === 'none' ? 'none' : 'visible');
  map.setFilter('answered', !filter || filter === 'none' ? ['!=', ['get', 'cat'], 'none'] : ['==', ['get', 'cat'], filter]);
}
let pop = null;
function popup(f) {
  const p = f.properties;
  const when = p.last ? new Date(p.last).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
  const said = p.cat === 'none' ? (p.n ? `${view.label}: no answer yet` : '') : view.labels[p.cat];
  if (pop) pop.remove();
  pop = new maplibregl.Popup({ offset: 10, maxWidth: '280px' }).setLngLat(f.geometry.coordinates).setHTML(`<div class="pop">
    <b>${esc(p.name)}</b><span class="ctx">${p.towards ? 'towards ' + esc(p.towards) : ''}${p.added ? ' · added by someone' : ''}</span>
    ${said ? `<div class="cond"><i style="background:${p.color}"></i>${esc(said)}</div>` : ''}
    <div class="ctx">${p.n ? `${p.n} contribution${p.n > 1 ? 's' : ''}, latest ${when}` : 'No details yet. Be first: extra points'}</div>
    <p style="margin:8px 0 0"><a href="../stop/?id=${encodeURIComponent(p.id)}">${p.n ? 'Open the stop' : 'See the stop and add details'} →</a></p></div>`).addTo(map);
}

// find a stop by name
const sugg = $('sugg');
$('find').addEventListener('input', () => {
  const q = $('find').value.trim().toLowerCase();
  if (q.length < 2) { sugg.hidden = true; return; }
  const hits = stops.filter(s => s.name.toLowerCase().includes(q)).sort((a, b) => a.name.toLowerCase().indexOf(q) - b.name.toLowerCase().indexOf(q) || a.name.length - b.name.length).slice(0, 8);
  sugg.innerHTML = hits.map(s => `<li data-id="${esc(s.id)}">${esc(s.name)}<small>${s.towards ? 'towards ' + esc(s.towards) + ' · ' : ''}${per.has(s.id) ? per.get(s.id).length + ' contributions' : 'no details yet'}</small></li>`).join('') || '<li style="color:var(--muted)">No stop by that name</li>';
  sugg.hidden = false;
});
sugg.addEventListener('click', (e) => {
  const li = e.target.closest('[data-id]'); if (!li) return;
  const f = feats.find(x => x.properties.id === li.dataset.id);
  sugg.hidden = true; $('find').value = f.properties.name;
  map.flyTo({ center: f.geometry.coordinates, zoom: 16 }); popup(f);
  $('map').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
document.addEventListener('pointerdown', (e) => { if (!sugg.contains(e.target) && e.target !== $('find')) sugg.hidden = true; });

// the leaderboard has its own page; here only how many players it has
$('n-people').textContent = lb ? fmt(lb.all.length) : '–';
