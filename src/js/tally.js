import { escapeHtml, euro, teamColorClass } from './ui.js';

function progressPanel({ totalRaised, totalPending, goals, teams }) {
  const scaleMax = Math.max(goals.at(-1)?.amount || 1, totalRaised + totalPending);
  const pct = (v) => Math.min(100, (v / scaleMax) * 100);
  const next = goals.find((g) => g.amount > totalRaised);
  const reachedCount = goals.filter((g) => totalRaised >= g.amount).length;

  const noTeam = totalRaised - teams.reduce((sum, t) => sum + t.raised, 0);
  const segments = [
    ...teams.map((t) => ({ cls: teamColorClass(t), label: `${t.emoji || ''} ${t.name}`.trim(), amount: t.raised })),
    { cls: 'no-team', label: 'No team', amount: noTeam },
  ].filter((s) => s.amount > 0);
  const legend = segments.map((s) => `
    <span class="legend-item"><span class="legend-swatch ${s.cls}"></span>${escapeHtml(s.label)} <strong>${euro(s.amount)}</strong></span>`).join('');

  const markers = goals.filter((g) => pct(g.amount) < 100).map((g) => `
    <div class="goal-marker ${totalRaised >= g.amount ? 'reached' : ''}" style="left:${pct(g.amount)}%" title="${euro(g.amount)} — ${escapeHtml(g.label)}"></div>`).join('');

  const goalList = goals.map((g) => `
    <li class="${totalRaised >= g.amount ? 'reached' : ''} ${g === next ? 'next' : ''}">
      <span class="goal-check" aria-hidden="true">${totalRaised >= g.amount ? '✓' : ''}</span>
      <span><strong>${euro(g.amount)}</strong> ${escapeHtml(g.label)}</span>
    </li>`).join('');

  return `
    <div class="jar-panel progress-panel">
      <div class="raised">
        <span class="raised-amount">${euro(totalRaised)}</span>
        <span class="script">raised together</span>
      </div>
      ${totalPending ? `<p class="pending-note">+ ${euro(totalPending)} waiting to be confirmed</p>` : ''}
      <div class="goal-track" role="progressbar" aria-valuemin="0" aria-valuemax="${scaleMax}" aria-valuenow="${totalRaised}" aria-label="Donations raised">
        <div class="goal-fill split" style="width:${pct(totalRaised)}%">
          ${segments.map((s) => `<span class="goal-seg ${s.cls}" style="flex-grow:${s.amount}" title="${escapeHtml(s.label)}: ${euro(s.amount)}"></span>`).join('')}
        </div>
        <div class="goal-pending" style="left:${pct(totalRaised)}%;width:${pct(totalRaised + totalPending) - pct(totalRaised)}%"></div>
        ${markers}
      </div>
      ${legend ? `<div class="goal-legend">${legend}</div>` : ''}
      <p class="next-goal script">${next
        ? `${euro(next.amount - totalRaised)} to go until: ${escapeHtml(next.label)}`
        : 'Every goal smashed — legends!'}</p>
      <h3 class="goal-list-title">Collective goals <span>${reachedCount}/${goals.length} unlocked</span></h3>
      <ul class="goal-list">${goalList}</ul>
    </div>`;
}

function teamCards(teams, teamGoal) {
  const ranked = [...teams].sort((a, b) => Number(b.winner) - Number(a.winner) || b.raised - a.raised || b.members - a.members);
  const hasWinner = ranked.some((t) => t.winner);
  return `
    <div class="team-section">
      <div class="label-panel team-goal-banner">
        <span class="team-goal-amount">${euro(teamGoal.amount)}</span>
        <span>${escapeHtml(teamGoal.label)}</span>
      </div>
      <div class="team-grid">${ranked.map((t, i) => {
        const tag = t.winner ? '<span class="leader-tag winner-tag script">👑 Winners!</span>'
          : !hasWinner && i === 0 && t.raised > 0 ? '<span class="leader-tag script">Leading!</span>' : '';
        return `
          <article class="label-panel team-card ${teamColorClass(t)} ${t.winner ? 'is-winner' : ''}">
            ${tag}
            <span class="icon-badge">${escapeHtml(t.emoji || '⭐')}</span>
            <h3>${escapeHtml(t.name)}</h3>
            <p class="team-raised">${euro(t.raised)}</p>
            <div class="mini-track"><div class="mini-fill" style="width:${Math.min(100, (t.raised / teamGoal.amount) * 100)}%"></div></div>
            <p class="team-meta">${euro(t.raised)} / ${euro(teamGoal.amount)} · ${t.members} ${t.members === 1 ? 'member' : 'members'}${t.pending ? `<br />${euro(t.pending)} pending` : ''}</p>
            <a class="team-link" href="team.html?team=${encodeURIComponent(t.slug)}">See the team →</a>
          </article>`;
      }).join('')}</div>
    </div>`;
}

function leaderboardPanel(leaderboard, teamsById) {
  const rows = leaderboard.map((d, i) => `
    <li>
      <span class="rank">${i + 1}</span>
      <span class="who">${escapeHtml(d.name)}${d.teamId && teamsById[d.teamId] ? `<small><span class="team-dot ${teamColorClass(teamsById[d.teamId])}"></span>${escapeHtml(teamsById[d.teamId].name)}</small>` : ''}</span>
      <span class="amt">${euro(d.amount)}</span>
    </li>`).join('');
  return `
    <div class="label-panel leaderboard">
      <h3>Top donors</h3>
      ${rows ? `<ol>${rows}</ol>` : '<p>No confirmed donations yet — be the first!</p>'}
      <a class="link-btn" href="donate.html#rewards">See what donating gets you →</a>
    </div>`;
}

export function renderTally(root, stats) {
  root.innerHTML = `
    ${progressPanel(stats)}
    <div class="tally-grid">
      ${teamCards(stats.teams, stats.teamGoal)}
      ${leaderboardPanel(stats.leaderboard, stats.teamsById)}
    </div>`;
}
