// One bus stop: what people said (shelter, crossing, lighting… as on the map), routes, each question's current answer
// with how many gave each answer (Teja, 18 Nov 2026: from the stop's profile on the server), photos, every
// contribution with feedback. No overall score (Teja, 16 Nov 2026).
import { SURVEY, TOPICS, VIEWS, VIEW_COLORS, shown, loadStops, loadRatings, loadProfiles, addedStops, byStop, currentOf, describe, POINTS,
  esc, player, day } from '../questions.js?v=20261119a';

const $ = (id) => document.getElementById(id);
const id = new URLSearchParams(location.search).get('id');
const [stops, ratings, profiles] = await Promise.all([loadStops('../').catch(() => []), loadRatings().catch(() => []), loadProfiles().catch(() => null)]);
const all = stops.concat(addedStops(ratings));
const s = all.find(x => x.id === id);
if (!s) { $('notfound').hidden = false; $('page').hidden = true; throw new Error('no such stop'); }
let list = byStop(ratings).get(s.id) || [];

document.title = `${s.name} bus stop · Hyderabad Urban Observatory`;
$('name').textContent = s.name;
$('ctx').textContent = [s.towards && `Towards ${s.towards}`, s.added ? 'Added by someone; not in the TGSRTC data' : `${s.buses.toLocaleString('en-IN')} buses a day`].filter(Boolean).join(' · ');
$('routes').innerHTML = s.nRoutes ? s.routes.slice(0, 10).map(r => `<span>${esc(r)}</span>`).join('') + (s.nRoutes > 10 ? `<em>and ${s.nRoutes - 10} more routes</em>` : '') : '';
$('rate').href = '../../streets/';             // the one entry for walking and public transport (20 Nov 2026); at the stop it lists the stops near you
// someone disagrees: they add what they see, and it counts with everyone else's (Teja, 18 Nov 2026: instead of "wrong")
document.querySelectorAll('.addyours').forEach(a => { a.href = $('rate').href; });

const prof = profiles && profiles[s.id], answers = currentOf(prof);
// the same short answers the map shows, one per topic that has a current answer
$('facts').innerHTML = VIEWS.map(v => [v, v.of(answers)]).filter(([, c]) => c).map(([v, c]) => `<li><i style="background:${VIEW_COLORS[c]}"></i>${esc(v.labels[c])}</li>`).join('');
$('cond-meta').textContent = list.length ? `From ${list.length} contribution${list.length > 1 ? 's' : ''}, latest ${day(list[0].observed_at)}` : 'No one has sent details for this stop yet.';
if (!list.length) { ['state-sec', 'photo-sec', 'hist-sec', 'same'].forEach(x => { $(x).hidden = true; }); $('rate').textContent = 'Be the first to add details'; }

// each question: the current answer, how many gave each answer, agreed / mixed; older answers apart
if (list.length && !prof) $('state-sub').textContent = "The answers couldn't load just now. Please try again later.";
$('state').innerHTML = !prof ? '' : TOPICS.map(t => `<div class="topic"><h3>${esc(t.title)}</h3>${t.qs.filter(q => shown(q, answers)).map(q => {
  const d = describe(q, prof.answers[q.id]);
  if (!d) return `<div class="row none"><span>${esc(q.s)}</span><b>Not answered</b></div>`;
  const v = prof.answers[q.id].current, bad = d.has && !q.multi && (q.opts.find(o => o[0] === v) || [])[2] === 0;
  return `<div class="row${d.has ? '' : ' none'}"><span>${esc(q.s)}</span><b class="${bad ? 'bad' : ''}">${esc(d.txt)}<small>${esc(d.note)}</small>${d.older ? `<small>${esc(d.older)}</small>` : ''}</b></div>`;
}).join('')}</div>`).join('');

// photos
const ph = list.filter(r => r.photo);
$('photos').innerHTML = ph.map(r => `<figure class="ph"><a href="${esc(r.photo)}" target="_blank" rel="noopener"><img src="${esc(r.photo)}" alt="Photo of ${esc(s.name)} bus stop, ${day(r.observed_at)}"></a><figcaption>${day(r.observed_at)}${r.nick ? ' · ' + esc(r.nick) : ''}</figcaption></figure>`).join('');
$('photo-sec').hidden = !ph.length;

// every rating, newest first
function drawHistory() {
  $('hist').innerHTML = list.map(r => {
    return `<li><div class="who"><b>${r.nick ? esc(r.nick) : 'Someone'}</b><span>${day(r.observed_at)}</span>${r.here === 'yes' ? '<span class="tag">At the stop</span>' : r.here === 'known' ? '<span class="tag">From memory</span>' : ''}${r.place_type === 'missing' ? '<span class="tag">Added the stop</span>' : ''}${r.photo ? '<span class="tag">Photo</span>' : ''}
${r.confirmed ? `<span>· confirmed by ${r.confirmed}</span>` : ''}</div>
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
  try { return await Contribute.post(`/${SURVEY}/reports/${rid}/feedback`, { kind, note: note || null, device: Contribute.device(), ...who(), token, website: trap }, check); }
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
    $('same-msg').textContent = r.accepted ? `Thanks, your check is added${n ? `, and ${n} gets ${POINTS.confirm} points` : ''}. Something changed? Add your details instead.`
      : 'You already confirmed the latest details from this phone. Something changed? Add your details instead.';
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
el.style.cssText = `width:16px;height:16px;border-radius:50%;background:#111827;border:3px solid #fff;box-shadow:0 0 0 1px #111827`;
new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m);
