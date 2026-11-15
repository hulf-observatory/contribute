// Bus stops map: every TGSRTC stop, grey until rated, then coloured by its latest condition. The leaderboard is its own page.
import { SURVEY, BANDS, UNRATED, band, score, loadStops, loadRatings, addedStops, byStop, latest, esc } from '../questions.js';

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

const feats = stops.map(s => {
  const list = per.get(s.id) || [], b = list.length ? band(score(latest(list).answers)) : UNRATED;
  return { type: 'Feature', properties: { id: s.id, name: s.name, towards: s.towards || '', band: list.length && b === UNRATED ? 'few' : b.id,
    color: b.color, n: list.length, last: list[0]?.observed_at || '', added: !!s.added }, geometry: { type: 'Point', coordinates: [s.lng, s.lat] } };
});
// a stop rated with too few answers to judge still counts as rated; it shows in grey-blue
for (const f of feats) if (f.properties.band === 'few') f.properties.color = '#7C8FA6';
$('n-rated').textContent = fmt(per.size);
$('n-of').textContent = `of ${fmt(stops.length)} stops with details`;
$('cover-bar').style.width = (stops.length ? per.size / stops.length * 100 : 0).toFixed(1) + '%';
$('n-ratings').textContent = fmt(ratings.length);
$('n-added').textContent = fmt(added.length);

// filter chips double as the legend
const counts = {}; feats.forEach(f => counts[f.properties.band] = (counts[f.properties.band] || 0) + 1);
const CH = [{ id: 'rated', label: 'All with details', n: per.size }, ...BANDS.map(b => ({ ...b, n: counts[b.id] || 0 })), { ...UNRATED, n: counts.none || 0 }];
let filter = 'all';
$('chips').innerHTML = CH.map(c => `<button type="button" class="chip" aria-pressed="false" data-f="${c.id}">${c.color ? `<i style="background:${c.color}"></i>` : ''}${c.label}<span class="n">${fmt(c.n)}</span></button>`).join('');
$('chips').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  filter = filter === b.dataset.f ? 'all' : b.dataset.f;
  $('chips').querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', x.dataset.f === filter));
  applyFilter();
});

// map
const map = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [78.47, 17.40], zoom: 10.6, minZoom: 9, maxZoom: 18,
  maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true }, cooperativeGestures: matchMedia('(max-width: 767px)').matches });
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
map.on('load', () => {
  map.addSource('stops', { type: 'geojson', data: { type: 'FeatureCollection', features: feats } });
  map.addLayer({ id: 'unrated', type: 'circle', source: 'stops', filter: ['==', ['get', 'band'], 'none'],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 15, 4.5], 'circle-color': UNRATED.color, 'circle-opacity': .8 } });
  map.addLayer({ id: 'rated', type: 'circle', source: 'stops', filter: ['!=', ['get', 'band'], 'none'],
    paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 3.5, 15, 8], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.2 } });
  for (const l of ['unrated', 'rated']) {
    map.on('click', l, (e) => popup(e.features[0]));
    map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
  }
  document.querySelector('.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show');
  applyFilter();
});
function applyFilter() {
  if (!map.getLayer('rated')) return;
  map.setLayoutProperty('unrated', 'visibility', filter === 'all' || filter === 'none' ? 'visible' : 'none');
  map.setLayoutProperty('rated', 'visibility', filter === 'none' ? 'none' : 'visible');
  map.setFilter('rated', filter === 'all' || filter === 'rated' || filter === 'none' ? ['!=', ['get', 'band'], 'none'] : ['==', ['get', 'band'], filter]);
}
let pop = null;
function popup(f) {
  const p = f.properties;
  const b = p.band === 'none' ? UNRATED : p.band === 'few' ? { label: 'Too few answers to judge yet', color: p.color } : BANDS.find(x => x.id === p.band);
  const when = p.last ? new Date(p.last).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '';
  if (pop) pop.remove();
  pop = new maplibregl.Popup({ offset: 10, maxWidth: '280px' }).setLngLat(f.geometry.coordinates).setHTML(`<div class="pop">
    <b>${esc(p.name)}</b><span class="ctx">${p.towards ? 'towards ' + esc(p.towards) : ''}${p.added ? ' · added by someone' : ''}</span>
    <div class="cond"><i style="background:${b.color}"></i>${b.label}</div>
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
