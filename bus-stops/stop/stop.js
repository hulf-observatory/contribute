// One bus stop: condition, routes, the latest answer to each question, photos, every rating with feedback.
import { SURVEY, TOPICS, optLabel, shown, band, score, UNRATED, loadStops, loadRatings, addedStops, byStop, latest, POINTS,
  esc, player, day } from '../questions.js';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
const [stops, ratings] = await Promise.all([loadStops('../').catch(() => []), loadRatings().catch(() => [])]);
const all = stops.concat(addedStops(ratings));
const s = all.find(x => x.id === id);
if (!s) { $('notfound').hidden = false; $('page').hidden = true; throw new Error('no such stop'); }
let list = byStop(ratings).get(s.id) || [];

document.title = `${s.name} bus stop · Hyderabad Urban Observatory`;
$('name').textContent = s.name;
$('ctx').textContent = [s.towards && `Towards ${s.towards}`, s.added ? 'Added by someone; not in the TGSRTC data' : `${s.buses.toLocaleString('en-IN')} buses a day`].filter(Boolean).join(' · ');
$('routes').innerHTML = s.nRoutes ? s.routes.slice(0, 10).map(r => `<span>${esc(r)}</span>`).join('') + (s.nRoutes > 10 ? `<em>and ${s.nRoutes - 10} more routes</em>` : '') : '';
$('rate').href = '../?stop=' + encodeURIComponent(s.id);

const { answers, from } = latest(list), sc = list.length ? score(answers) : null, b = list.length ? band(sc) : UNRATED;
$('cond-dot').style.background = list.length && b === UNRATED ? '#7C8FA6' : b.color;
$('cond').textContent = list.length && b === UNRATED ? 'Too few answers to judge yet' : b.label;
$('cond-meta').textContent = list.length ? `From ${list.length} rating${list.length > 1 ? 's' : ''}, latest ${day(list[0].observed_at)}` : 'No one has rated this stop yet. The first rating earns extra points.';
if (!list.length) { ['state-sec', 'photo-sec', 'hist-sec', 'same'].forEach(x => { $(x).hidden = true; }); $('rate').textContent = 'Be the first to rate it'; }

// latest state, topic by topic, with how many of the last few said the same
const agree = (q) => {
  const said = list.filter(r => r[q.id] != null).slice(0, 5).map(r => JSON.stringify(r[q.id]));
  return said.length > 1 ? `${said.filter(x => x === said[0]).length} of the last ${said.length} said this` : '';
};
$('state').innerHTML = TOPICS.map(t => `<div class="topic"><h3>${esc(t.title)}</h3>${t.qs.filter(q => shown(q, answers)).map(q => {
  const v = answers[q.id];
  if (v == null) return `<div class="row none"><span>${esc(q.s)}</span><b>Not answered</b></div>`;
  const txt = q.multi ? v.map(x => optLabel(q, x)).join(', ') : optLabel(q, v);
  const bad = !q.multi && (q.opts.find(o => o[0] === v) || [])[2] === 0;
  const a = agree(q);
  return `<div class="row"><span>${esc(q.s)}</span><b class="${bad ? 'bad' : ''}">${esc(txt)}<small>${a || day(from[q.id].observed_at)}</small></b></div>`;
}).join('')}</div>`).join('');

// photos
const ph = list.filter(r => r.photo);
$('photos').innerHTML = ph.map(r => `<figure class="ph"><a href="${esc(r.photo)}" target="_blank" rel="noopener"><img src="${esc(r.photo)}" alt="Photo of ${esc(s.name)} bus stop, ${day(r.observed_at)}"></a><figcaption>${day(r.observed_at)}${r.nick ? ' · ' + esc(r.nick) : ''}</figcaption></figure>`).join('');
$('photo-sec').hidden = !ph.length;

// every rating, newest first
function drawHistory() {
  $('hist').innerHTML = list.map(r => {
    const rb = band(score(r));
    return `<li><div class="who"><b>${r.nick ? esc(r.nick) : 'Someone'}</b><span>${day(r.observed_at)}</span>${r.here === 'yes' ? '<span class="tag">At the stop</span>' : ''}${r.place_type === 'missing' ? '<span class="tag">Added the stop</span>' : ''}${r.photo ? '<span class="tag">Photo</span>' : ''}
      <span><i class="dot" style="background:${rb === UNRATED ? '#7C8FA6' : rb.color}"></i> ${rb === UNRATED ? 'Few answers' : rb.label}</span>${r.confirmed ? `<span>· confirmed by ${r.confirmed}</span>` : ''}</div>
      ${r.improve ? `<p class="said">Would improve: <q>${esc(r.improve)}</q></p>` : ''}
      <button type="button" class="fb" data-r="${esc(r.id)}">Give feedback</button></li>`;
  }).join('');
}
drawHistory();

// feedback and "still the same" both go to the server with this phone's id (counted once) and the nickname, if any
const who = () => { const p = player.get(); return p ? { nick: p.nick, nick_pin: p.pin } : {}; };
async function feedback(rid, kind, note, check, trap) {
  const token = await check.token();
  if (token === null) throw Object.assign(new Error('The spam check did not finish. Please try again.'), { server: true });
  try { return await Contribute.post(`/${SURVEY}/reports/${rid}/feedback`, { kind, note: note || null, device: Contribute.device(), ...who(), token, website: trap }); }
  finally { check.reset(); }
}
const why = (err) => err.status === 429 ? 'Too many tries from this connection just now. Please wait a minute.'
  : err.server ? err.message : "That didn't go through; the connection may be weak. Please try again.";

const sameCheck = Contribute.spamCheck($('ts-same'));
$('same').onclick = async () => {
  $('same').disabled = true; $('same').textContent = 'Sending…'; $('same-msg').hidden = true;
  try {
    const r = await feedback(list[0].id, 'confirm', null, sameCheck, '');
    const n = player.get()?.nick;
    $('same').textContent = 'Thanks';
    $('same-msg').textContent = r.accepted ? `Thanks, your check is added${n ? `, and ${n} gets ${POINTS.confirm} points` : ''}. Something changed? Rate the stop instead.`
      : 'You already confirmed the latest rating from this phone. Something changed? Rate the stop instead.';
    list[0].confirmed = r.confirmed; drawHistory();
  } catch (err) { $('same').disabled = false; $('same').textContent = 'Still the same'; $('same-msg').textContent = why(err); }
  $('same-msg').hidden = false;
};

let kind = null, target = null;
const dlg = $('dlg'), fbCheck = Contribute.spamCheck($('ts-fb'));
$('hist').addEventListener('click', (e) => {
  const b = e.target.closest('.fb'); if (!b) return;
  target = list.find(r => r.id === b.dataset.r); kind = null; $('fb-note').value = ''; $('fb-msg').hidden = true;
  $('fbopts').querySelectorAll('button').forEach(x => { x.setAttribute('aria-pressed', false); x.hidden = x.dataset.k === 'photo' && !target.photo; });
  $('fb-send').disabled = true; $('fb-send').textContent = 'Send'; dlg.showModal();
});
$('fbopts').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; kind = b.dataset.k; $('fbopts').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); $('fb-send').disabled = false; });
$('fb-cancel').onclick = () => dlg.close();
$('fb-send').onclick = async () => {
  $('fb-send').disabled = true; $('fb-send').textContent = 'Sending…'; $('fb-msg').hidden = true;
  try {
    const r = await feedback(target.id, kind, $('fb-note').value.trim(), fbCheck, $('fb-trap').value);
    target.confirmed = r.confirmed; drawHistory();
    $('fb-msg').textContent = !r.accepted ? 'You already sent this from this phone. Thank you.'
      : kind === 'confirm' ? 'Thanks, your confirmation is added.' : 'Thank you. We look at every flag; three spam or photo flags hide it until we check.';
    $('fb-msg').hidden = false; $('fb-send').textContent = 'Sent';
    setTimeout(() => dlg.close(), 1800);
  } catch (err) { $('fb-msg').textContent = why(err); $('fb-msg').hidden = false; $('fb-send').disabled = false; $('fb-send').textContent = 'Send'; }
};

// small map
const m = new maplibregl.Map({ container: 'map', style: 'https://tiles.openfreemap.org/styles/positron', center: [s.lng, s.lat], zoom: 16, interactive: false, attributionControl: { compact: true } });
const el = document.createElement('div');
el.style.cssText = `width:16px;height:16px;border-radius:50%;background:${$('cond-dot').style.background};border:3px solid #fff;box-shadow:0 0 0 1px #111827`;
new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m);
