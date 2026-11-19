// Mark a place on a map with a fixed pin in the centre: move the map until the pin sits on the place. Offered when
// the phone's location fails (Teja, 16 Nov 2026). A search box moves the map to an area or road first; a pasted
// Google Maps link or coordinates jump straight to the place (Teja, 20 Nov 2026).
import { createPlaceSearch } from './place-search.js';

const C = window.CONTRIBUTE;
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
export const MARK_ZOOM = 16;                 // close enough to see the street before the place counts

// ── a pasted place: coordinates ("17.4178, 78.4487"), a Google Maps link with the place in it, or a short share link
// (maps.app.goo.gl/…), which our server follows since it carries no place itself. Returns { lat, lng }, { link }, or null.
const NUM = '(-?\\d{1,3}\\.\\d+)';
const IN_URL = [new RegExp(`!3d${NUM}!4d${NUM}`), new RegExp(`[?&](?:q|query|ll|sll|destination|daddr|center)=(?:loc:)?${NUM}(?:,|%2C)\\+?${NUM}`, 'i'),
  new RegExp(`/(?:search|place|dir)/+${NUM},\\+?${NUM}`), new RegExp(`@${NUM},${NUM}`)];   // the pin first, the centre of the view last
const okPair = (lat, lng) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 && !(lat === 0 && lng === 0);
export function pastedPlace(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(?:geo:)?\(?\s*(-?\d{1,2}\.\d+)\s*°?\s*[Nn]?\s*[,;\s]\s*(-?\d{1,3}\.\d+)\s*°?\s*[Ee]?\s*\)?$/);
  if (m && okPair(+m[1], +m[2])) return { lat: +m[1], lng: +m[2] };
  const url = (t.match(/https?:\/\/[^\s<>"]+/) || [])[0];           // a shared message is often "Name" then the link
  if (!url) return null;
  let u; try { u = new URL(url); } catch { return null; }
  const host = u.hostname.toLowerCase(), short = ['maps.app.goo.gl', 'goo.gl', 'g.co'].includes(host);
  if (!short && !/(^|\.)google\.(com|co\.in)$/.test(host)) return null;
  if (!short) for (const re of IN_URL) { const c = url.match(re) || decodeURIComponent(url).match(re); if (c && okPair(+c[1], +c[2])) return { lat: +c[1], lng: +c[2] }; }
  return { link: url.replace(/^http:/, 'https:') };
}

function loadMapLib() {
  if (window.maplibregl) return Promise.resolve();
  return new Promise((ok, fail) => {
    const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.append(css);
    const js = document.createElement('script'); js.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; js.onload = ok; js.onerror = fail; document.head.append(js);
  });
}

// host: an empty element; onChange({ lat, lng, ok }) after every move (ok = zoomed in enough, inside the HMDA area).
// points: optional () => GeoJSON points (bus stops; property has = 1 for darker dots); tapping one puts the pin on it.
// onPick({ lat, lng }): optional; a place was chosen from the search, or pasted (the map has gone there).
export function mapMark(host, { onChange, onPick = null, label = 'Search an area, or paste a Google Maps link or coordinates', points = null, mark = 'pin' } = {}) {   // mark: what the centre mark is called in the hints
  const n = Math.random().toString(36).slice(2, 7);
  host.innerHTML = `<div class="field mm-field"><label class="field-label" for="mm-q-${n}">${label}</label>
      <div class="search"><input class="inp" type="search" id="mm-q-${n}" placeholder="Ameerpet, or a link, or 17.4178, 78.4487"><div class="ps-results" id="mm-r-${n}" hidden></div></div>
      <p class="picked mm-paste" id="mm-paste-${n}" style="margin:6px 0 0" hidden></p></div>
    <div class="map-box mm-box"><div class="mm-map" id="mm-map-${n}"></div><span class="centre-pin" aria-hidden="true"></span>
      <div id="mm-zoom-${n}" hidden style="position:absolute;left:10px;right:54px;top:10px;z-index:4;display:none;align-items:center;gap:10px;padding:9px 12px;background:rgba(255,255,255,.96);border-radius:12px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px rgba(0,0,0,.08);font:700 14px/1.3 Lato,sans-serif;color:#111827">
        <span id="mm-zoom-t-${n}" style="flex:1"></span>
        <button type="button" id="mm-zoom-b-${n}" style="flex:none;min-height:36px;padding:0 12px;border:1px solid #111827;border-radius:4px;background:#111827;color:#fff;font:700 13px Lato,sans-serif;cursor:pointer">Zoom in</button>
      </div></div>
    <p class="picked mm-hint" id="mm-hint-${n}"></p>`;
  const $ = (id) => document.getElementById(`${id}-${n}`);
  let map = null, list = [];
  fetch(C.AREAS_URL).then(r => r.json()).then(a => {
    const zones = a.zones || [];
    list = zones.map(z => ({ name: z.name, kind: 'Zone', bbox: z.bounds }))
      .concat((a.wards || []).map(w => ({ name: w.name, kind: 'Ward' + (w.no != null ? ' ' + w.no : ''), context: zones[w.zone] ? zones[w.zone].name + ' zone' : '', bbox: w.bounds })));
  }).catch(() => {});
  // a pasted link or coordinates: straight to the place, and the area search doesn't run on it
  const inside = (lng, lat) => lng >= C.HMDA[0] && lng <= C.HMDA[2] && lat >= C.HMDA[1] && lat <= C.HMDA[3];
  const say = (t) => { $('mm-paste').textContent = t; $('mm-paste').hidden = !t; };
  let asked = 0;
  function goTo({ lat, lng }) {
    if (!inside(lng, lat)) return say('That place is outside the Hyderabad area (HMDA).');
    if (!map) return;
    map.jumpTo({ center: [lng, lat], zoom: MARK_ZOOM + 2 });
    $('mm-q').value = ''; $('mm-r').hidden = true;
    say(`Found it: ${lat.toFixed(5)}, ${lng.toFixed(5)}. Move the map if the ${mark} isn't quite on the place.`);
    if (onPick) onPick({ lat, lng });
  }
  $('mm-q').addEventListener('input', async (e) => {
    const got = pastedPlace($('mm-q').value);
    if (!got) { say(''); return; }               // an area name: the search below takes it
    e.stopImmediatePropagation();                 // registered before the area search's own listener
    $('mm-r').hidden = true;
    if (got.lat != null) return goTo(got);
    const mine = ++asked;
    say('Looking up the link…');
    try {
      const r = await fetch(`${C.API}/place?u=${encodeURIComponent(got.link)}`, { credentials: 'omit' });
      if (mine !== asked) return;                 // a newer paste is on its way
      if (r.ok) return goTo(await r.json());
      say(r.status === 404 ? "We couldn't read a place from that link. Paste the coordinates instead: in Google Maps, press and hold the place, then copy the numbers."
        : r.status === 429 ? 'Too many links just now. Try again in a minute, or paste the coordinates.' : "That doesn't look like a Google Maps link. Paste the coordinates instead.");
    } catch { if (mine === asked) say("We couldn't check the link just now. Paste the coordinates, or find the place on the map."); }
  });
  createPlaceSearch({ input: $('mm-q'), results: $('mm-r'), local: () => list, getMap: () => map, marker: { set() {}, clear() {} },
    onSelect: (p) => { if (map) map.jumpTo({ center: p.center, zoom: MARK_ZOOM + 1 }); if (onPick && p.center) onPick({ lng: p.center[0], lat: p.center[1] }); } });   // street level at once: only a nudge left
  function report() {
    const c = map.getCenter(), z = map.getZoom(), inArea = inside(c.lng, c.lat), ok = z >= MARK_ZOOM - .01 && inArea;
    $('mm-hint').textContent = !inArea ? `The ${mark} is outside the Hyderabad area (HMDA).` : ok ? `The place is under the ${mark}. Move the map to adjust.`
      : `Search for the area, or zoom in until you can see the street, then move the map until the ${mark} sits on the place.`;
    // on the map itself (Teja, 20 Nov 2026): why the place can't be used yet, and a button that zooms in
    const z0 = $('mm-zoom'), show = !ok;
    z0.hidden = !show; z0.style.display = show ? 'flex' : 'none';
    $('mm-zoom-t').textContent = !inArea ? 'This is outside the Hyderabad area.' : 'Zoom in more to use this place.';
    $('mm-zoom-b').hidden = !inArea; $('mm-zoom-b').style.display = inArea ? '' : 'none';
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
      $('mm-zoom-b').onclick = () => map.easeTo({ zoom: MARK_ZOOM + 1, duration: 500 });   // street level, where the map is centred
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
    focus() { $('mm-q').focus(); },                // the search box: "Search for the area" starts by typing
  };
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) window.__mapMark = api;   // local checks only
  return api;
}
