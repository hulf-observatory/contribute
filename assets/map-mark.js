// Mark a place on a map with a fixed pin in the centre: move the map until the pin sits on the place. Offered when
// the phone's location fails (Teja, 16 Nov 2026). A search box moves the map to an area or road first.
import { createPlaceSearch } from './place-search.js';

const C = window.CONTRIBUTE;
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
export const MARK_ZOOM = 16;                 // close enough to see the street before the place counts

function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((ok, fail) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; js.onload = ok; js.onerror = fail; document.head.append(js);
  });
}

// host: an empty element; onChange({ lat, lng, ok }) after every move (ok = zoomed in enough, inside the HMDA area).
// points: optional () => GeoJSON points (bus stops; property has = 1 for darker dots); tapping one puts the pin on it.
export function mapMark(host, { onChange, label = 'Find the area', points = null } = {}) {
  const n = Math.random().toString(36).slice(2, 7);
  host.innerHTML = `<div class="field mm-field"><label class="field-label" for="mm-q-${n}">${label}</label>
      <div class="search"><input class="inp" type="search" id="mm-q-${n}" placeholder="An area, colony or road, for example Ameerpet"><div class="ps-results" id="mm-r-${n}" hidden></div></div></div>
    <div class="map-box mm-box"><div class="mm-map" id="mm-map-${n}"></div><span class="centre-pin" aria-hidden="true"></span></div>
    <p class="picked mm-hint" id="mm-hint-${n}"></p>`;
  const $ = (id) => document.getElementById(`${id}-${n}`);
  let map = null, list = [];
  fetch(C.AREAS_URL).then(r => r.json()).then(a => {
    const zones = a.zones || [];
    list = zones.map(z => ({ name: z.name, kind: 'Zone', bbox: z.bounds }))
      .concat((a.wards || []).map(w => ({ name: w.name, kind: 'Ward' + (w.no != null ? ' ' + w.no : ''), context: zones[w.zone] ? zones[w.zone].name + ' zone' : '', bbox: w.bounds })));
  }).catch(() => {});
  createPlaceSearch({ input: $('mm-q'), results: $('mm-r'), local: () => list, getMap: () => map, marker: { set() {}, clear() {} },
    onSelect: (p) => { if (map) map.jumpTo({ center: p.center, zoom: MARK_ZOOM + 1 }); } });   // street level at once: only a nudge left
  const inside = (lng, lat) => lng >= C.HMDA[0] && lng <= C.HMDA[2] && lat >= C.HMDA[1] && lat <= C.HMDA[3];
  function report() {
    const c = map.getCenter(), z = map.getZoom(), inArea = inside(c.lng, c.lat), ok = z >= MARK_ZOOM - .01 && inArea;
    $('mm-hint').textContent = !inArea ? 'The pin is outside the Hyderabad area (HMDA).' : ok ? 'The place is under the pin. Move the map to adjust.'
      : 'Search for the area, or pinch to zoom in until you can see the street, then move the map until the pin sits on the place.';
    onChange && onChange({ lat: c.lat, lng: c.lng, ok });
  }
  const api = {
    async open() {
      try { await loadMapLib(); } catch { $('mm-hint').textContent = "The map couldn't load. Check your connection and try again."; return; }
      if (map) { map.resize(); report(); return; }
      map = new maplibregl.Map({ container: $('mm-map'), style: STYLE, center: [78.475, 17.405], zoom: 11, minZoom: 9, maxZoom: 19,
        maxBounds: [77.6, 16.6, 79.5, 18.3], attributionControl: { compact: true } });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('moveend', report); map.on('load', report);
      if (points) map.on('load', () => {
        map.addSource('mm-pts', { type: 'geojson', data: points() });
        map.addLayer({ id: 'mm-pts', type: 'circle', source: 'mm-pts', paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 15, 4.5, 18, 7],
          'circle-color': ['case', ['==', ['get', 'has'], 1], '#111827', '#9CA3AF'],
          'circle-stroke-color': '#fff', 'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 12, 0, 15, 1.2] } });
        map.on('click', (e) => {                  // a generous tap area: the nearest dot within about 16 px
          const p = e.point, f = map.queryRenderedFeatures([[p.x - 16, p.y - 16], [p.x + 16, p.y + 16]], { layers: ['mm-pts'] })[0];
          if (f) map.easeTo({ center: f.geometry.coordinates, zoom: Math.max(map.getZoom(), MARK_ZOOM + 1), duration: 300 });
        });
      });
    },
    jump(lng, lat, zoom = 17) { if (map) map.jumpTo({ center: [lng, lat], zoom }); },
  };
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__mapMark = api;   // local checks only
  return api;
}
