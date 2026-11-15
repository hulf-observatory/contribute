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
  return { spamCheck, device, post, esc };
})();
