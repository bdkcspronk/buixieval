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

const membersOf = (team) => stats.members.filter((m) => m.teamId === team.id);

// The team in front: an admin-crowned winner, otherwise the highest total (no leader on a tie or at €0).
function leaderOf(teams) {
  const winner = teams.find((t) => t.winner);
  if (winner) return winner;
  const [a, b] = [...teams].sort((x, y) => y.raised - x.raised);
  return a && a.raised > 0 && (!b || a.raised > b.raised) ? a : null;
}

// Tug of war: each team's share of all team donations.
function tugBar(teams) {
  const [left, right] = teams;
  if (!right) return '';
  const combined = left.raised + right.raised;
  const leftShare = combined ? (left.raised / combined) * 100 : 50;
  return `
      <div class="tug-label">
        <span>${escapeHtml(left.emoji || '')} ${escapeHtml(left.name)} ${euro(left.raised)}</span>
        <span>${euro(right.raised)} ${escapeHtml(right.name)} ${escapeHtml(right.emoji || '')}</span>
      </div>
      <div class="tug" role="img" aria-label="Share of all team donations: ${escapeHtml(left.name)} ${Math.round(leftShare)}%, ${escapeHtml(right.name)} ${100 - Math.round(leftShare)}%">
        <div class="tug-side ${teamColorClass(left)}" style="width:${leftShare}%"></div>
        <div class="tug-side ${teamColorClass(right)}" style="width:${100 - leftShare}%"></div>
        <span class="tug-mid"></span>
      </div>`;
}

function render() {
  // The header shows (and takes the colour of) whichever team is ahead; on a tie it shows both.
  const team = leaderOf(stats.teams);
  const raised = team ? team.raised : stats.teams.reduce((sum, t) => sum + t.raised, 0);
  const pending = team ? team.pending : stats.teams.reduce((sum, t) => sum + (t.pending || 0), 0);
  const members = team ? membersOf(team) : stats.members.filter((m) => stats.teamsById[m.teamId]);
  const best = Math.max(0, ...stats.teams.map((t) => t.raised));
  const pct = Math.min(100, ((team ? team.raised : best) / stats.teamGoal.amount) * 100);
  const title = team ? `Team ${team.name}` : stats.teams.map((t) => t.name).join(' vs ');
  const tag = team?.winner ? '<span class="leader-tag winner-tag script">👑 Winners!</span>'
    : team ? '<span class="leader-tag script">Leading!</span>' : '';
  document.title = `Teams — BUIXIEVAL Out Back 2027`;

  root.innerHTML = `
    <div class="label-panel team-header ${teamColorClass(team)}">
      ${tag}
      <div class="team-header-main">
        <span class="icon-badge">${escapeHtml(team?.emoji || '⚔️')}</span>
        <div>
          <h1>${escapeHtml(title)}</h1>
          <p>${members.length} ${members.length === 1 ? 'member' : 'members'}${pending ? ` · ${euro(pending)} pending` : ''}</p>
        </div>
        <span class="team-header-total">${euro(raised)}</span>
      </div>
      <div class="mini-track big"><div class="mini-fill" style="width:${pct}%"></div></div>
      <p class="team-goal-line">${team ? `${euro(team.raised)} / ` : 'First to '}${euro(stats.teamGoal.amount)} — ${escapeHtml(stats.teamGoal.label)}</p>
      ${tugBar(stats.teams)}
      <div class="hero-ctas">
        <a class="btn btn-red" href="donate.html">Donate</a>
        <a class="btn btn-dark" href="signup.html">Join a team</a>
      </div>
    </div>
    <div class="map-legend">
      ${stats.teams.map((t) => `<span class="map-legend-item ${teamColorClass(t)}">${escapeHtml(t.emoji || '')} Team ${escapeHtml(t.name)} · ${membersOf(t).length}</span>`).join('')}
    </div>
    <div class="member-map" id="member-map"></div>
    <p class="map-note script">Everyone fights for the same space — the more you donate, the bigger your block.</p>`;

  drawMap();
}

// A member gets one block per team they gave to (so giving to both teams shows as two blocks).
// Members who haven't donated yet get a single block for their own team.
function memberBlocks(members) {
  return members.flatMap((m) => {
    const teamIds = [...new Set([...Object.keys(m.raisedByTeam || {}), ...Object.keys(m.pendingByTeam || {})])]
      .filter((id) => stats.teamsById[id]);
    if (!teamIds.length) teamIds.push(m.teamId);
    // Their own team first, so the photo/tone order stays stable.
    teamIds.sort((x, y) => Number(y === m.teamId) - Number(x === m.teamId));
    return teamIds.map((teamId) => ({
      member: m,
      teamId,
      raised: m.raisedByTeam?.[teamId] || 0,
      pending: m.pendingByTeam?.[teamId] || 0,
    }));
  });
}

// One shared map: every member of every team competes for the same space, coloured by team.
function drawMap() {
  const map = root.querySelector('#member-map');
  if (!map || !stats) return;
  const blocks = memberBlocks(stats.members);

  if (!blocks.length) {
    map.style.height = '';
    map.innerHTML = '<div class="member-empty"><p>No members yet — be the first to join!</p></div>';
    return;
  }

  const width = map.clientWidth;
  const height = width > 640
    ? Math.round(Math.max(480, Math.min(window.innerHeight * 0.85, 900)))
    : Math.round(Math.max(420, Math.min(1100, 160 + blocks.length * 44)));
  map.style.height = `${height}px`;
  const innerHeight = map.clientHeight;

  const top = Math.max(0, ...blocks.map((b) => b.raised));
  const floor = top ? Math.max(5, top * 0.07) : 1;
  const leader = top ? blocks.find((b) => b.raised === top) : null;
  const items = blocks.map((b) => ({ ...b, weight: Math.max(b.raised, floor) }));

  map.innerHTML = treemap(items, width, innerHeight).map(({ item, x, y, w, h }, i) => {
    const m = item.member;
    const team = stats.teamsById[item.teamId];
    const size = Math.max(12, Math.min(44, Math.sqrt(w * h) / 6.5));
    const roomy = w > 70 && h > 54;
    const photo = isSafeImage(photos[m.id]) ? photos[m.id] : null;
    return `
      <div class="member-block tone-${i % 3} ${teamColorClass(team)}" style="left:${x}px;top:${y}px;width:${w}px;height:${h}px" title="${escapeHtml(m.name)} — ${euro(item.raised)}${team ? ` for Team ${escapeHtml(team.name)}` : ''}">
        <div class="member-inner ${photo ? 'has-photo' : ''}" style="font-size:${size.toFixed(1)}px">
          ${photo ? `<img class="member-photo" src="${photo}" alt="" /><span class="photo-tint"></span>` : ''}
          <span class="member-name">${leader && m.id === leader.member.id && item.teamId === leader.teamId ? '👑 ' : ''}${escapeHtml(m.name)}</span>
          ${roomy ? `<span class="member-amount">${euro(item.raised)}</span>` : ''}
          ${roomy && item.pending && h > 90 ? `<span class="member-pending">+${euro(item.pending)} pending</span>` : ''}
        </div>
      </div>`;
  }).join('');
}
