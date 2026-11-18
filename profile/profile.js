// A contributor's public page (Teja, 18 Nov 2026): points, place on the leaderboard, what they added and their
// entries, newest first. Dates only, never the time of day; spam reports are counted but not listed.
import { esc, player } from '../bus-stops/questions.js?v=20261118c';

const C = window.CONTRIBUTE;
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString('en-IN');
const date = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
const me = player.get()?.nick || '';
let n = (new URLSearchParams(location.search).get('n') || '').trim();
if (!n && me) { n = me; history.replaceState(null, '', '?n=' + encodeURIComponent(me)); }

const KIND = { stop: 'Bus stop', missing: 'Added a missing stop', spot: 'Footpath', crossing: 'Crossing', confirm: 'Checked: still the same' };
function link(e) {
  if (e.stop) return '../bus-stops/stop/?id=' + encodeURIComponent(e.stop);
  if (e.place) return '../walking/map/?p=' + encodeURIComponent(e.place);
  if (e.row) return '../walking/map/?r=' + encodeURIComponent(e.row);
  return null;
}
function say(text) { $('since').innerHTML = text; }

if (!n) {
  say('No contributor chosen. <a href="../bus-stops/leaderboard/">See the leaderboard</a> and tap a name.');
} else {
  $('nick').textContent = n;
  const r = await fetch(`${C.API}/bus-stops/player.json?n=${encodeURIComponent(n)}`, { credentials: 'omit', cache: 'no-cache' }).catch(() => null);
  if (!r || (!r.ok && r.status !== 404)) say("This page couldn't load just now. Please try again in a minute.");
  else if (r.status === 404) say(`No one has sent anything as “${esc(n)}” yet.` + (me && me.toLowerCase() === n.toLowerCase() ? ' Your profile starts with your first entry.' : ''));
  else {
    const p = await r.json();
    document.title = `${p.nick} · Contributor · Hyderabad Urban Observatory`;
    $('nick').textContent = p.nick;
    say(`Contributing since ${date(p.since)}.`);
    if (me && me.toLowerCase() === p.nick.toLowerCase()) { $('me-box').hidden = false; $('me-box').textContent = 'This is your profile. Anyone can see it.'; }
    $('stats').hidden = false;
    $('s-all').textContent = fmt(p.points);
    $('s-month').textContent = fmt(p.month);
    $('s-rank').textContent = p.rank ? '#' + p.rank : '–';
    $('s-of').textContent = p.rank ? `of ${fmt(p.of)} on the board` : 'on the leaderboard';
    const c = p.counts;
    $('did').textContent = [['Bus stops', c.stops], ['Stops added', c.missing], ['Footpath spots', c.spots], ['Crossings', c.crossings],
      ['Checks', c.confirms], ['Photos', c.photos], ['Spam reports', c.flags]].filter(([, v]) => v).map(([k, v]) => `${k} ${fmt(v)}`).join(' · ');
    $('list-h').hidden = !p.entries.length;
    $('entries').innerHTML = p.entries.map(e => {
      const name = esc(e.name) + (e.towards ? `, towards ${esc(e.towards)}` : ''), href = link(e);
      const bits = [date(e.date), KIND[e.what] || e.what, e.memory && 'from memory', e.photo && 'photo'].filter(Boolean).join(' · ');
      return `<li>${href ? `<a href="${href}">${name}</a>` : `<span class="nm">${name}</span>`}<b>+${e.points}</b><small>${bits}</small></li>`;
    }).join('') + (p.more ? `<li class="gap">and ${fmt(p.more)} older</li>` : '');
  }
}
