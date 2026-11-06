import { escapeHtml, euro, teamColorClass } from './ui.js';

const FILL_MS = 3500; // full first fill
const MIN_UPDATE_MS = 1500; // smallest live-update animation
const CONFETTI_COLORS = ['#ffd60a', '#ffe449', '#f29400', '#e0121b', '#f3e7c4', '#3d74d8', '#ff5fa2'];
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// Amount currently drawn on the bar. null = the bar hasn't been scrolled into view yet.
let shown = null;
let rafId = 0;
let observer = null;
let confettiLayer = null;

const scaleFor = ({ totalRaised, totalPending, goals }) => Math.max(goals.at(-1)?.amount || 1, totalRaised + totalPending);

function progressPanel({ totalRaised, totalPending, goals, teams }, drawn) {
  const scaleMax = scaleFor({ totalRaised, totalPending, goals });
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
    <div class="goal-marker ${drawn >= g.amount ? 'reached' : ''}" data-amount="${g.amount}" style="left:${pct(g.amount)}%" title="${euro(g.amount)} — ${escapeHtml(g.label)}"></div>`).join('');

  const goalList = goals.map((g) => `
    <li class="${totalRaised >= g.amount ? 'reached' : ''} ${g === next ? 'next' : ''}">
      <span class="goal-check" aria-hidden="true">${totalRaised >= g.amount ? '✓' : ''}</span>
      <span><strong>${euro(g.amount)}</strong> ${escapeHtml(g.label)}</span>
    </li>`).join('');

  return `
    <div class="jar-panel progress-panel">
      <div class="raised">
        <span class="raised-amount">${euro(drawn)}</span>
        <span class="script">raised together</span>
      </div>
      ${totalPending ? `<p class="pending-note">+ ${euro(totalPending)} waiting to be confirmed</p>` : ''}
      <div class="goal-track" role="progressbar" aria-valuemin="0" aria-valuemax="${scaleMax}" aria-valuenow="${totalRaised}" aria-label="Donations raised">
        <div class="goal-clip">
          <div class="goal-fill split ${drawn > 0 ? 'has-value' : ''}" style="width:${pct(drawn)}%">
            ${segments.map((s) => `<span class="goal-seg ${s.cls}" style="flex-grow:${s.amount}" title="${escapeHtml(s.label)}: ${euro(s.amount)}"></span>`).join('')}
          </div>
          <div class="goal-pending" style="left:${pct(drawn)}%;width:${pct(drawn + totalPending) - pct(drawn)}%"></div>
        </div>
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

function burstConfetti(track, xPct) {
  if (!confettiLayer || !confettiLayer.isConnected) {
    confettiLayer = document.createElement('div');
    confettiLayer.className = 'confetti-layer';
    confettiLayer.setAttribute('aria-hidden', 'true');
    document.body.append(confettiLayer);
  }
  const rect = track.getBoundingClientRect();
  const x = rect.left + (rect.width * xPct) / 100;
  const y = rect.top + rect.height / 2;

  for (let i = 0; i < 42; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'confetti-piece';
    const w = 6 + Math.random() * 6;
    piece.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${Math.random() < 0.3 ? w : w * 1.6}px;`
      + `background:${CONFETTI_COLORS[i % CONFETTI_COLORS.length]};${Math.random() < 0.3 ? 'border-radius:50%;' : ''}`;
    confettiLayer.append(piece);

    // Fan out upwards, then fall under "gravity".
    const angle = (-90 + (Math.random() - 0.5) * 140) * (Math.PI / 180);
    const speed = 90 + Math.random() * 200;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    const spin = (Math.random() - 0.5) * 1080;
    piece.animate([
      { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${spin / 2}deg)`, opacity: 1, offset: 0.35, easing: 'ease-in' },
      { transform: `translate(calc(-50% + ${dx * 1.4}px), calc(-50% + ${dy + 220}px)) rotate(${spin}deg)`, opacity: 0 },
    ], { duration: 1300 + Math.random() * 700, easing: 'cubic-bezier(0.15, 0.6, 0.35, 1)' })
      .finished.then(() => piece.remove(), () => piece.remove());
  }
}

function animateBar(panel, stats) {
  cancelAnimationFrame(rafId);
  const { totalRaised, totalPending, goals } = stats;
  const scaleMax = scaleFor(stats);
  const pct = (v) => Math.min(100, (v / scaleMax) * 100);
  const track = panel.querySelector('.goal-track');
  const fill = panel.querySelector('.goal-fill');
  const amountEl = panel.querySelector('.raised-amount');
  const pending = panel.querySelector('.goal-pending');
  const markers = [...panel.querySelectorAll('.goal-marker')];

  const from = shown ?? 0;
  const to = totalRaised;
  const draw = (v, final) => {
    shown = v;
    fill.style.width = `${pct(v)}%`;
    fill.classList.toggle('has-value', v > 0);
    // The pledged stripes ride along on the tip of the fill.
    pending.style.left = `${pct(v)}%`;
    pending.style.width = `${pct(v + totalPending) - pct(v)}%`;
    amountEl.textContent = euro(final ? v : Math.round(v));
    markers.forEach((m) => m.classList.toggle('reached', v >= Number(m.dataset.amount)));
  };

  if (from === to || reduceMotion.matches) {
    draw(to, true);
    return;
  }

  // First reveal takes FILL_MS; later updates scale with how far the bar moves.
  const duration = from === 0
    ? FILL_MS
    : Math.max(MIN_UPDATE_MS, Math.min(FILL_MS, (Math.abs(to - from) / scaleMax) * FILL_MS * 4));
  const start = performance.now();
  let prev = from;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2; // ease-in-out: gentle start and finish
    const v = from + (to - from) * eased;
    if (v > prev) {
      goals.filter((g) => g.amount > prev && g.amount <= v).forEach((g) => burstConfetti(track, pct(g.amount)));
    }
    prev = v;
    if (t < 1) {
      draw(v, false);
      rafId = requestAnimationFrame(step);
    } else {
      draw(to, true);
    }
  };
  rafId = requestAnimationFrame(step);
}

export function renderTally(root, stats) {
  cancelAnimationFrame(rafId);
  observer?.disconnect();

  root.innerHTML = `
    ${progressPanel(stats, shown ?? 0)}
    <div class="tally-grid">
      ${teamCards(stats.teams, stats.teamGoal)}
      ${leaderboardPanel(stats.leaderboard, stats.teamsById)}
    </div>`;

  const panel = root.querySelector('.progress-panel');
  if (shown !== null || !('IntersectionObserver' in window)) {
    // Already revealed once: animate from what was on screen to the new total (live updates).
    animateBar(panel, stats);
    return;
  }
  observer = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    animateBar(panel, stats);
  }, { threshold: 0.6 });
  observer.observe(panel.querySelector('.goal-track'));
}
