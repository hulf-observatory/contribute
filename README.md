# Contribute

The observatory's citizen surveys, on GitHub Pages at `https://hyderabad.urbanobservatory.in/contribute/` (org
site feature: this repo has no custom domain). Static, no build step. The answers go to the private repo
`contribute-api` on the server (`https://api.urbanobservatory.in/contribute/`). Plan and decisions:
`observatory-work/notes/surveys-plan.md`. Design: `observatory-work/DESIGN-SYSTEM.md`.

| page | |
|---|---|
| `index.html` | the list of surveys: Safer streets & bus stops (`streets/`), Water tankers, Flooding |
| `flood/` | the flood report form: one question per screen; phone location (explained before asking), place search (the maps viewer's `place-search.js`, unchanged) or a map pin; depth pictures or an exact-height slider; answers kept on the phone until the server accepts them |
| `flood/` from memory (20 Nov 2026) | a flood the person saw in the last 7 days: "No" on "Are you at the flooded place now?" → "Report a flood I saw"; a laptop shows the QR code and the same button. The place on the map picker (search, a pasted link or coordinates), then "When was it?" (day + morning / afternoon / evening / night), then the usual questions. Sent as `here: known`, shown as "From memory" |
| `flood/reports/` | the reports: list (table / cards) and map view, period filter, feedback on each report |
| `flood/download/` | the download form (what the data is for; optional role and organisation; no name or email), then the links to the data site |
| `streets/` | **Contribute to safer streets & bus stops** (built 19–20 Nov 2026, it replaced the `bus-stops/` and `walking/` forms on 20 Nov 2026): one entry for walking and public transport. Start asks for the phone's location ("Not there? Pick the place on a map" = from memory; a laptop sees the QR code and "Add a place you know on the map") → a bus stop / a footpath or crossing / report a problem / suggest an improvement → what's nearby for that (bus stops with distance and "On your side" / "Opposite side") → questions → optional photo → "Anything else here?", which is also the send screen. The side of the road is asked only for a footpath: "I'm facing the road", then yes / no to the side we name with a landmark (no north or south). One thing leads to the next (a broken-footpath report → its footpath questions, filled in; `lead`). "See the questions first" lists everything the form asks. Top contributors (last 7 days / all time) on the first screen. Uses `walking/questions.js` and the walking survey's endpoints. Local test: `streets/?api=local&desk&demo` |
| `bus-stops/`, `walking/` | (20 Nov 2026) the two old forms are gone: each address is a small page that forwards to `streets/` (keeping `#create` / `#login`). The folders stay for what the rest uses: `questions.js`, `stops.json`, `roads.json`, the maps, stop pages, leaderboard and downloads |
| `bus-stops/map/` | every TGSRTC stop, coloured by its latest answer to one topic at a time (shelter, seating, footpath, crossing, lighting, name sign, route info, safe after dark, floods: blue good, light orange a problem, dark red missing, grey no answer); no overall score; links to the leaderboard |
| `bus-stops/leaderboard/` | the leaderboard (all time, last 30 days, last 7 days), how points are earned; the map page links to it |
| `bus-stops/stop/?id=` | one stop: each question's current answer and how many gave each answer (agreed / mixed / one person; from `profiles.json` on the API), photos, every rating with feedback, "Still the same", "Not right? Add what you see" |
| `bus-stops/download/` | download form for the bus stop ratings |
| `bus-stops/questions.js`, `form.js`, `stops.json` | the questions (values must match `contribute-api/surveys/bus-stops.json`), the form, TGSRTC's stops (built by `contribute-api/make_bus_stops.py`) |
| `tankers/`, `tankers/orders/`, `tankers/download/` | water tanker orders: place by phone, area search or map, then the sender chooses exact / about 500 m / area / ward only; supplier, size, price, when ordered and came; results as cards, a ward map and table, latest orders with feedback |
| `assets/config.js` | the API address, the areas file, the Turnstile site key, the WhatsApp link — **settings live only here** |
| `assets/common.js` | phone menu, the spam check (Cloudflare Turnstile), the browser's random device id, sending JSON |
| `assets/contribute.css` | house tokens, header, footer, buttons, chips |
| `assets/map-mark.js` | the map picker (a mark fixed in the centre, the map moves under it); its search box also takes a pasted Google Maps link or coordinates (20 Nov 2026): read in the browser, or for a short share link by `contribute-api` (`/contribute/place`) |
| `assets/place-search.js` | a copy of `maps/js/place-search.js`: keep it identical (the other copies are in `timeline/` and `access/`) |

Every page loads `https://api.urbanobservatory.in/visits.js`. Local preview: the `contribute` entry in
`.claude/launch.json` (port 8132); add `?api=local` to a page's address to send to a `contribute-api` running on
the same machine (`contribute-api` entry, port 8091, test mode without the spam check).

Live since 15 Nov 2026 (flood) and 15 Nov 2026 (bus stops). Cloudflare Turnstile on since 15 Nov 2026 (site key in `assets/config.js`; off with `?api=local`).
