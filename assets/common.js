// Contribute: shared by every page — phone menu, the spam check, the browser's random device id, sending JSON.

// phone menu: the burger toggles the link card; Escape or a tap outside closes it
(() => {
  const b = document.querySelector('.obs-burger'), m = document.getElementById('obs-menu');
  if (!b || !m) return;
  const set = (open) => { m.hidden = !open; b.setAttribute('aria-expanded', open); };
  b.addEventListener('click', () => set(m.hidden));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !m.hidden) { set(false); b.focus(); } });
  document.addEventListener('pointerdown', (e) => { if (!m.hidden && !m.contains(e.target) && !b.contains(e.target)) set(false); });
})();

window.Contribute = (() => {
  const C = window.CONTRIBUTE;

  // Cloudflare Turnstile: usually invisible; now and then one tick. Loaded once, rendered where asked.
  let tsReady = null;
  function loadTurnstile() {
    if (!C.TURNSTILE_SITEKEY) return Promise.resolve(null);
    if (!tsReady) tsReady = new Promise((ok, fail) => {
      window.__tsLoaded = () => ok(window.turnstile);
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__tsLoaded';
      s.async = true; s.onerror = fail; document.head.append(s);
    });
    return tsReady;
  }
  // returns { token(): Promise<string|null>, reset() } for a widget in `el`
  function spamCheck(el) {
    let id = null, tok = null, waiters = [];
    loadTurnstile().then((ts) => {
      if (!ts) return;
      id = ts.render(el, { sitekey: C.TURNSTILE_SITEKEY, appearance: 'interaction-only', size: 'flexible',
        callback: (t) => { tok = t; waiters.forEach((w) => w(t)); waiters = []; },
        'expired-callback': () => { tok = null; }, 'error-callback': () => { tok = null; } });
    }).catch(() => {});
    return {
      token: () => !C.TURNSTILE_SITEKEY ? Promise.resolve('') : tok ? Promise.resolve(tok)
        : new Promise((ok) => { waiters.push(ok); setTimeout(() => ok(null), 20000); }),
      reset: () => { tok = null; if (id != null && window.turnstile) window.turnstile.reset(id); },
    };
  }

  // a random id this browser keeps, so feedback counts once per phone; the server stores only a salted hash of it
  function device() {
    try {
      let d = localStorage.getItem('obs-device');
      if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()).replace(/[^A-Za-z0-9-]/g, ''); localStorage.setItem('obs-device', d); }
      return d;
    } catch { return 'nostorage-' + Math.random().toString(36).slice(2, 18); }
  }

  async function post(path, body) {
    const r = await fetch(`${C.API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer' });
    let data = {};
    try { data = await r.json(); } catch { /* empty */ }
    if (!r.ok) { const e = new Error(data.error || `HTTP ${r.status}`); e.status = r.status; e.server = true; throw e; }
    return data;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // the survey forms are filled in on a phone (Teja, 16 Nov 2026); a laptop sees a QR code to open the page on one.
  // Maps, results and downloads stay open anywhere. On this Mac, ?desk in the address skips it for testing.
  function phoneOnly({ what, mapHref, mapLabel, atSpot = true }) {
    const phone = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('desk');
    const steps = document.querySelector('main .steps');
    if (phone || local || !steps) return true;
    const url = location.origin + location.pathname;
    const gate = document.createElement('section');
    gate.className = 'phone-gate';
    gate.innerHTML = `<p class="eyebrow">Contribute · ${esc(what)}</p><h1>Open this on your phone</h1>
      <p class="hint">${atSpot ? 'This survey is filled in on a phone, at the place itself, so the location is right.' : 'This survey is filled in on a phone.'} Scan the code with your phone's camera.</p>
      <div class="qr" aria-hidden="true"></div><p class="gate-url">${esc(url.replace(/^https?:\/\//, ''))}</p>
      <a class="btn btn-secondary btn-lg" href="${esc(mapHref)}">${esc(mapLabel)}</a>`;
    steps.hidden = true; steps.before(gate);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = () => { try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); gate.querySelector('.qr').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch { /* the address is shown too */ } };
    document.head.append(s);
    return false;
  }
  return { spamCheck, device, post, esc, phoneOnly };
})();
