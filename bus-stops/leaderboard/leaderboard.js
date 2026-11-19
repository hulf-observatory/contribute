// Leaderboard for bus stops and walking together: nicknames and points, worked out on the server (all time and the last 30 days).
import { SURVEY, POINTS, esc, player } from '../questions.js?v=20261119a';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-IN');
const me = player.get()?.nick || '';
const prof = (n) => `../../profile/?n=${encodeURIComponent(n)}`;   // each contributor's public page
const lb = await fetch(`${C.API}/${SURVEY}/leaderboard.json`, { credentials: 'omit', cache: 'no-cache' }).then(r => r.json()).catch(() => null);

function draw(period) {
  const list = lb ? lb[period] || [] : [];
  const top = list.slice(0, 50), mine = me ? list.findIndex(x => x[0].toLowerCase() === me.toLowerCase()) : -1;
  let html = top.map(([n, p], i) => `<li class="${i === mine ? 'me' : ''}"><span class="r">${i + 1}</span><span><a href="${prof(n)}">${esc(n)}</a>${i === mine ? ' (you)' : ''}</span><b>${fmt(p)}</b></li>`).join('');
  if (mine >= 50) html += `<li class="gap">…</li><li class="me"><span class="r">${mine + 1}</span><span><a href="${prof(list[mine][0])}">${esc(list[mine][0])}</a> (you)</span><b>${fmt(list[mine][1])}</b></li>`;
  $('board').innerHTML = html || `<li class="gap">${lb ? 'No points yet. Join as a contributor and tell us about a bus stop, footpath or crossing to be first.' : "The leaderboard couldn't load just now."}</li>`;
}
draw('all');
document.querySelector('.seg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
  draw(b.dataset.p);
});
if (me) { $('me-box').hidden = false; $('me-box').innerHTML = `You're contributing as <b>${esc(me)}</b> · <a href="${prof(me)}">Your profile</a>`; }
const P = (lb && lb.points && (lb.points['bus-stops'] || lb.points)) || POINTS;
const W = (lb && lb.points && lb.points.walking) || { spot: 10, crossing: 10, problem: 5, request: 5, memory: 5, photo: 5, metoo: 2 };
// every entry the same, first at a place or an update; from memory half; spam earns nothing (Teja, 18 Nov 2026)
$('pts').innerHTML = [['Tell us about a bus stop, at the stop', P.rating], ['A footpath or a crossing', W.spot],
  ['Any of these from memory, not there', P.memory ?? 5], ['Add a missing stop', '+' + P.missing], ['Report a problem, or ask for something needed', W.problem ?? 5],
  ['Add a photo', '+' + P.photo], ['Check someone else\'s entry: still the same, still there or gone', P.confirm], ['Say you need something too', W.metoo ?? 2],
  ['Report spam or a bad photo', P.flag]].map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('')
  + '<li class="fine">Entries removed as spam earn nothing.</li>';
