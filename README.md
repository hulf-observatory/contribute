# Contribute

The observatory's citizen surveys, on GitHub Pages at `https://hyderabad.urbanobservatory.in/contribute/` (org
site feature: this repo has no custom domain). Static, no build step. The answers go to the private repo
`contribute-api` on the server (`https://api.urbanobservatory.in/contribute/`). Plan and decisions:
`observatory-work/notes/surveys-plan.md`. Design: `observatory-work/DESIGN-SYSTEM.md`.

| page | |
|---|---|
| `index.html` | the list of surveys (flood open; bus stops and water to come) |
| `flood/` | the flood report form: one question per screen; phone location (explained before asking), place search (the maps viewer's `place-search.js`, unchanged) or a map pin; depth pictures or an exact-height slider; answers kept on the phone until the server accepts them |
| `flood/reports/` | the reports: list (table / cards) and map view, period filter, feedback on each report |
| `flood/download/` | the download form (name, email, organisation, purpose; kept privately), then the links to the data site |
| `assets/config.js` | the API address, the areas file, the Turnstile site key, the WhatsApp link — **settings live only here** |
| `assets/common.js` | phone menu, the spam check (Cloudflare Turnstile), the browser's random device id, sending JSON |
| `assets/contribute.css` | house tokens, header, footer, buttons, chips |
| `assets/place-search.js` | a copy of `maps/js/place-search.js`: keep it identical (the other copies are in `timeline/` and `access/`) |

Every page loads `https://api.urbanobservatory.in/visits.js`. Local preview: the `contribute` entry in
`.claude/launch.json` (port 8132); add `?api=local` to a page's address to send to a `contribute-api` running on
the same machine (`contribute-api` entry, port 8091, test mode without the spam check).

Before launch: put the Turnstile site key in `assets/config.js` (`TURNSTILE_SITEKEY`).
