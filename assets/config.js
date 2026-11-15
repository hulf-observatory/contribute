// Contribute: the settings every page reads. Change here, nowhere else.
window.CONTRIBUTE = {
  // the storage service on obs-mumbai (repo contribute-api)
  API: 'https://api.urbanobservatory.in/contribute',
  // wards, zones and corporations for the place search and ward look-up (the data site; Pages allows any origin)
  AREAS_URL: 'https://hyderabad.urbanobservatory.in/data/nav/areas.json',
  // Cloudflare Turnstile site key (public by design). Empty = no spam check widget: only for local testing
  // against a contribute-api started with CONTRIBUTE_DEV=1. TODO before launch: Teja creates the widget.
  TURNSTILE_SITEKEY: '',
  // the WhatsApp community (Teja, 15 Nov 2026)
  WHATSAPP: 'https://chat.whatsapp.com/GJUFWd2UJyEImsmgxbEKlg',
  // the HMDA box: phone locations and map pins outside it are refused
  HMDA: [78.00, 16.96, 79.05, 17.90],
};

// local preview: talk to a contribute-api running on this machine
if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).get('api') === 'local') {
  window.CONTRIBUTE.API = 'http://127.0.0.1:8091/contribute';
}
