// Bus stop leaderboard: nicknames and points, worked out on the server (all time and the last 30 days).
import { SURVEY, POINTS, esc, player } from '../questions.js';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-IN');
const me = player.get()?.nick || '';
const lb = await fetch(`${C.API}/${SURVEY}/leaderboard.json`, { credentials: 'omit' }).then(r => r.json()).catch(() => null);

function draw(period) {
  const list = lb ? lb[period] || [] : [];
  const top = list.slice(0, 50), mine = me ? list.findIndex(x => x[0].toLowerCase() === me.toLowerCase()) : -1;
  let html = top.map(([n, p], i) => `<li class="${i === mine ? 'me' : ''}"><span class="r">${i + 1}</span><span>${esc(n)}${i === mine ? ' (you)' : ''}</span><b>${fmt(p)}</b></li>`).join('');
  if (mine >= 50) html += `<li class="gap">…</li><li class="me"><span class="r">${mine + 1}</span><span>${esc(list[mine][0])} (you)</span><b>${fmt(list[mine][1])}</b></li>`;
  $('board').innerHTML = html || `<li class="gap">${lb ? 'No points yet. Create a player and tell us about a bus stop to be first.' : "The leaderboard couldn't load just now."}</li>`;
}
draw('all');
document.querySelector('.seg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  document.querySelectorAll('.seg button').forEach(x => x.setAttribute('aria-pressed', x === b));
  draw(b.dataset.p);
});
if (me) { $('me-box').hidden = false; $('me-box').innerHTML = `You're playing as <b>${esc(me)}</b>.`; }
const P = (lb && lb.points) || POINTS;
$('pts').innerHTML = [['Tell us about a stop', P.rating], ['…the first details for a stop', '+' + P.first], ['Add a photo', '+' + P.photo], ['Add a missing stop', '+' + P.missing],
  ['Confirm a stop is still the same', P.confirm], ['Flag a wrong contribution', P.flag]].map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
