import '../css/style.css';
import { mountDotArt } from './dot-art.js';
import { isConfigured } from './firebase.js';
import { watchPhotos, watchPublic } from './store.js';
import { isSafeImage } from './photo.js';
import { treemap } from './treemap.js';
import { closedNotice, escapeHtml, euro, teamColorClass } from './ui.js';
import { accountLinks } from './account.js';

mountDotArt();

const root = document.querySelector('#team-root');
const wanted = new URLSearchParams(location.search).get('team');
let stats = null;
let photos = {};

if (!isConfigured) {
  root.innerHTML = closedNotice('Team pages');
} else {
  root.innerHTML = '<div class="jar-panel notice-panel"><p class="script">Loading…</p></div>';
  const refreshLinks = accountLinks();
  watchPublic((s) => { stats = s; render(); refreshLinks(s); }, () => { root.innerHTML = closedNotice('Team pages'); });
  watchPhotos((p) => { photos = p; drawMap(); });
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth !== lastWidth) { lastWidth = window.innerWidth; drawMap(); }
  });
}

function currentTeam() {
  return stats.teams.find((t) => t.slug === wanted || t.id === wanted) || stats.teams[0];
}

function render() {
  const team = currentTeam();
  const members = stats.members.filter((m) => m.teamId === team.id);
  const pct = Math.min(100, (team.raised / stats.teamGoal.amount) * 100);
  document.title = `Team ${team.name} — BUIXIEVAL Out Back 2027`;

  root.innerHTML = `
    <nav class="team-tabs" aria-label="Teams">
      ${stats.teams.map((t) => `
        <a class="team-tab ${teamColorClass(t)} ${t.id === team.id ? 'active' : ''}" href="team.html?team=${encodeURIComponent(t.slug)}" ${t.id === team.id ? 'aria-current="page"' : ''}>
          ${escapeHtml(t.emoji || '')} ${escapeHtml(t.name)}
        </a>`).join('')}
    </nav>
    <div class="label-panel team-header ${teamColorClass(team)}">
      ${team.winner ? '<span class="leader-tag winner-tag script">👑 Winners!</span>' : ''}
      <div class="team-header-main">
        <span class="icon-badge">${escapeHtml(team.emoji || '⭐')}</span>
        <div>
          <h1>Team ${escapeHtml(team.name)}</h1>
          <p>${members.length} ${members.length === 1 ? 'member' : 'members'}${team.pending ? ` · ${euro(team.pending)} pending` : ''}</p>
        </div>
        <span class="team-header-total">${euro(team.raised)}</span>
      </div>
      <div class="mini-track big"><div class="mini-fill" style="width:${pct}%"></div></div>
      <p class="team-goal-line">${euro(team.raised)} / ${euro(stats.teamGoal.amount)} — ${escapeHtml(stats.teamGoal.label)}</p>
      <div class="hero-ctas">
        <a class="btn btn-red" href="donate.html">Donate</a>
        <a class="btn btn-dark" href="signup.html">Join a team</a>
      </div>
    </div>
    <div class="member-map ${teamColorClass(team)}" id="member-map"></div>
    <p class="map-note script">The more you donate, the bigger your block.</p>`;

  drawMap();
}

function drawMap() {
  const map = root.querySelector('#member-map');
  if (!map || !stats) return;
  const team = currentTeam();
  const members = stats.members.filter((m) => m.teamId === team.id);

  if (!members.length) {
    map.style.height = '';
    map.innerHTML = '<div class="member-empty"><p>No members yet — be the first to join!</p></div>';
    return;
  }

  const width = map.clientWidth;
  const height = width > 640
    ? Math.round(Math.max(440, Math.min(window.innerHeight * 0.78, 820)))
    : Math.round(Math.max(420, Math.min(960, 160 + members.length * 48)));
  map.style.height = `${height}px`;
  const innerHeight = map.clientHeight;

  const top = Math.max(0, ...members.map((m) => m.raised));
  const floor = top ? Math.max(5, top * 0.07) : 1;
  const leaderId = top ? members.find((m) => m.raised === top).id : null;
  const items = members.map((m) => ({ member: m, weight: Math.max(m.raised, floor) }));

  map.innerHTML = treemap(items, width, innerHeight).map(({ item, x, y, w, h }, i) => {
    const m = item.member;
    const size = Math.max(12, Math.min(44, Math.sqrt(w * h) / 6.5));
    const roomy = w > 70 && h > 54;
    const photo = isSafeImage(photos[m.id]) ? photos[m.id] : null;
    return `
      <div class="member-block tone-${i % 3}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px" title="${escapeHtml(m.name)} — ${euro(m.raised)}">
        <div class="member-inner ${photo ? 'has-photo' : ''}" style="font-size:${size.toFixed(1)}px">
          ${photo ? `<img class="member-photo" src="${photo}" alt="" /><span class="photo-tint"></span>` : ''}
          <span class="member-name">${m.id === leaderId ? '👑 ' : ''}${escapeHtml(m.name)}</span>
          ${roomy ? `<span class="member-amount">${euro(m.raised)}</span>` : ''}
          ${roomy && m.pending && h > 90 ? `<span class="member-pending">+${euro(m.pending)} pending</span>` : ''}
        </div>
      </div>`;
  }).join('');
}
