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
  // returns { token(): Promise<string|null>, reset() } for a widget in `el`.
  // A pass lasts 5 minutes, and a phone that leaves the page (the camera, another app) may not renew it in time,
  // so one older than 4 minutes is renewed before it is used (21 Nov 2026: an Un-choke entry was refused that way).
  const FRESH_MS = 4 * 60 * 1000;
  function spamCheck(el) {
    let id = null, tok = null, at = 0, waiters = [];
    const reset = () => { tok = null; if (id != null && window.turnstile) window.turnstile.reset(id); };
    loadTurnstile().then((ts) => {
      if (!ts) return;
      id = ts.render(el, { sitekey: C.TURNSTILE_SITEKEY, appearance: 'interaction-only', size: 'flexible',
        callback: (t) => { tok = t; at = Date.now(); waiters.forEach((w) => w(t)); waiters = []; },
        'expired-callback': () => { tok = null; }, 'error-callback': () => { tok = null; } });
    }).catch(() => {});
    return {
      token: () => {
        if (!C.TURNSTILE_SITEKEY) return Promise.resolve('');
        if (tok && Date.now() - at < FRESH_MS) return Promise.resolve(tok);
        if (tok) reset();
        return new Promise((ok) => { waiters.push(ok); setTimeout(() => ok(null), 20000); });
      },
      reset,
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

  // `check` (a spamCheck): if the server turns the pass down (403), get a new one and send once more on its own,
  // so the person sees the message only when the second try fails too
  async function post(path, body, check) {
    const r = await fetch(`${C.API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), credentials: 'omit', referrerPolicy: 'no-referrer' });
    let data = {};
    try { data = await r.json(); } catch { /* empty */ }
    if (r.status === 403 && check) {
      check.reset();
      const token = await check.token();
      if (token !== null) return post(path, { ...body, token });
    }
    if (!r.ok) { const e = new Error(data.error || `HTTP ${r.status}`); e.status = r.status; e.server = true; throw e; }
    return data;
  }

  // unsent entries kept on this phone, oldest first: several can wait, and each is sent or discarded on its own.
  // set() returns the new entry's id (null if the phone has no room); drop(id) removes that one only.
  function drafts(key) {
    const read = () => { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? [] : Array.isArray(v) ? v : [v]; } catch { return []; } };
    const write = (l) => { try { if (l.length) localStorage.setItem(key, JSON.stringify(l)); else localStorage.removeItem(key); return true; } catch { return false; } };
    return {
      get: () => read().find((d) => d && d.body) || null,
      set(v) { const id = Math.random().toString(36).slice(2, 10), l = read(); l.push({ ...v, id }); return write(l) ? id : null; },
      drop(id) { write(read().filter((d) => d && d.id !== id)); },
    };
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // the survey forms are filled in on a phone (Teja, 16 Nov 2026); a laptop sees a QR code to open the page on one.
  // Maps, results and downloads stay open anywhere. On this Mac, ?desk in the address skips it for testing.
  function phoneOnly({ what, mapHref, mapLabel, atSpot = true, here = '' }) {   // here: a button label that opens the form on this computer
    const phone = matchMedia('(hover: none) and (pointer: coarse)').matches;
    const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has('desk');
    const steps = document.querySelector('main .steps');
    if (phone || local || !steps) return true;
    const url = location.origin + location.pathname;
    const gate = document.createElement('section');
    gate.className = 'phone-gate';
    gate.innerHTML = `<p class="eyebrow">Contribute · ${esc(what)}</p><h1>Open this on your phone</h1>
      <p class="hint">${atSpot ? 'This survey is filled in on a phone, at the place itself, so the location is right.' : here ? 'This survey is easiest on a phone.' : 'This survey is filled in on a phone.'} Scan the code with your phone's camera${here ? ', or fill it in here' : ''}.</p>
      <div class="qr" aria-hidden="true"></div><p class="gate-url">${esc(url.replace(/^https?:\/\//, ''))}</p>
      <div class="row-btns" style="display:flex;flex-wrap:wrap;gap:10px">${here ? `<button type="button" class="btn btn-primary btn-lg" data-here>${esc(here)}</button>` : ''}<a class="btn btn-secondary btn-lg" href="${esc(mapHref)}">${esc(mapLabel)}</a></div>`;
    steps.hidden = true; steps.before(gate);
    if (here) gate.querySelector('[data-here]').onclick = () => { gate.remove(); steps.hidden = false; window.dispatchEvent(new Event('resize')); };
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = () => { try { const q = window.qrcode(0, 'M'); q.addData(url); q.make(); gate.querySelector('.qr').innerHTML = q.createSvgTag({ cellSize: 5, margin: 2, scalable: true }); } catch { /* the address is shown too */ } };
    document.head.append(s);
    return false;
  }
  return { spamCheck, device, post, esc, phoneOnly, drafts };
})();
