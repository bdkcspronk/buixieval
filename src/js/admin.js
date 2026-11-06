import '../css/style.css';
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch,
} from 'firebase/firestore';
import { mountDotArt } from './dot-art.js';
import { db, isConfigured } from './firebase.js';
import { logOut, renderLogin, watchUser } from './account.js';
import {
  DEFAULT_GOALS, DEFAULT_REWARDS, DEFAULT_TEAM_GOAL, TEAMS, TIKKIE_VALID_DAYS, computeDonorRewards, computeStats,
} from './store.js';
import { schedule } from './schedule-data.js';
import { escapeHtml, euro, teamColorClass } from './ui.js';
import { isSafeImage } from './photo.js';

const DAY_MS = 86400000;

function tikkieNote(link, addedAtMs, now = Date.now()) {
  if (!link) return 'No Tikkie link saved — donors will only see bank transfer.';
  if (!addedAtMs) return 'Save the link to start the countdown.';
  const days = Math.floor((now - addedAtMs) / DAY_MS);
  const left = TIKKIE_VALID_DAYS - days;
  if (left > 0) return `Added ${days} day${days === 1 ? '' : 's'} ago — expires in ${left} day${left === 1 ? '' : 's'} (about every ${TIKKIE_VALID_DAYS} days).`;
  return `Added ${days} days ago — this link has probably expired. Create a new Tikkie request and paste the link here.`;
}

mountDotArt();

const root = document.querySelector('#admin-root');
const dayShort = Object.fromEntries(schedule.map((ev) => [ev.key, ev.day.slice(0, 3)]));

const formatReward = (r) => `${r.every ? 'every ' : ''}${r.amount} | ${r.label}${r.limit ? ` | first ${r.limit}` : ''}`;

function parseReward(line) {
  const m = line.match(/^(every\s+)?€?\s*(\d+)\s*\|\s*(.+?)\s*(?:\|\s*first\s+(\d+))?$/i);
  if (!m) return null;
  const reward = { amount: Number(m[2]), label: m[3] };
  if (m[1]) reward.every = true;
  if (m[4]) reward.limit = Number(m[4]);
  return reward.amount > 0 ? reward : null;
}

let unsubscribers = [];
const stopWatching = () => { unsubscribers.forEach((u) => u()); unsubscribers = []; };

if (!isConfigured) {
  root.innerHTML = '<div class="jar-panel notice-panel"><p class="script">Firebase isn\'t configured yet.</p><p>Fill in .env.production.local — see the README.</p></div>';
} else {
  watchUser(async (user) => {
    stopWatching();
    if (!user) {
      root.innerHTML = '<div class="narrow-panel" id="login-slot"></div>';
      return renderLogin(root.querySelector('#login-slot'), { title: 'Admin login' });
    }
    const adminDoc = await getDoc(doc(db, 'admins', user.uid)).catch(() => null);
    if (!adminDoc?.exists()) return renderNotAdmin(user);
    renderDashboard(user);
  });
}

function renderNotAdmin(user) {
  root.innerHTML = `
    <div class="label-panel narrow-panel">
      <h2>Not an admin (yet)</h2>
      <p>You're logged in as <strong>${escapeHtml(user.email)}</strong>, but this account isn't an admin.</p>
      <p>In the Firebase console, add a document to the <code>admins</code> collection with this ID:</p>
      <p><code class="uid">${escapeHtml(user.uid)}</code></p>
      <button class="btn btn-dark" data-logout>Log out</button>
    </div>`;
  root.querySelector('[data-logout]').addEventListener('click', logOut);
}

function formatDate(ts) {
  const date = ts?.toDate?.();
  return date ? date.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
}

function renderDashboard(user) {
  root.innerHTML = `
    <div class="admin">
      <div class="jar-panel admin-bar">
        <span>Logged in as <strong>${escapeHtml(user.email)}</strong></span>
        <button class="btn btn-dark" data-logout>Log out</button>
      </div>
      <div class="admin-stats" id="a-stats"></div>
      <section class="label-panel admin-section">
        <h2>Pending donations</h2>
        <p class="small-print">Check your Revolut / bank app, then confirm the ones that arrived. Match on the reference.</p>
        <div id="a-pending"></div>
      </section>
      <section class="label-panel admin-section">
        <h2>All donations</h2>
        <div id="a-donations"></div>
      </section>
      <section class="label-panel admin-section">
        <h2>Donor rewards</h2>
        <p class="small-print">What each member has earned from their confirmed donations.</p>
        <div id="a-rewards"></div>
      </section>
      <section class="label-panel admin-section">
        <div class="section-title-row"><h2>Members</h2><button class="chip" data-action="export-members">Export CSV</button></div>
        <div id="a-members"></div>
      </section>
      <section class="label-panel admin-section">
        <h2>Team names</h2>
        <p class="small-print">Rename the teams; colors and team members stay the same.</p>
        <form class="form-panel-plain" id="a-team-names" novalidate>
          ${TEAMS.map((t) => `
            <div class="field">
              <label for="tn-${t.id}"><span class="team-dot ${teamColorClass(t)}"></span>${t.id === 'blue' ? 'Blue' : 'Pink'} team</label>
              <input id="tn-${t.id}" name="${t.id}" maxlength="40" required />
            </div>`).join('')}
          <button class="btn btn-red" type="submit">Save names</button>
          <p class="form-status" role="status" aria-live="polite"></p>
        </form>
      </section>
      <section class="label-panel admin-section">
        <h2>Payment details &amp; goals</h2>
        <form class="form-panel-plain" id="a-settings" novalidate>
          <div class="field">
            <label for="st-revolut">Revolut username (the part after revolut.me/)</label>
            <input id="st-revolut" name="revolutUsername" maxlength="40" placeholder="yourname" />
          </div>
          <div class="field">
            <label for="st-iban">IBAN (optional)</label>
            <input id="st-iban" name="iban" maxlength="40" placeholder="NL00 REVO 0000 0000 00" />
          </div>
          <div class="field">
            <label for="st-name">Account holder name (optional)</label>
            <input id="st-name" name="accountName" maxlength="60" />
          </div>
          <div class="field">
            <label for="st-tikkie">Tikkie link (optional)</label>
            <input id="st-tikkie" name="tikkieLink" maxlength="200" placeholder="https://tikkie.me/pay/..." />
            <p class="small-print tikkie-status" data-tikkie-status></p>
          </div>
          <div class="field">
            <label for="st-goals">Collective goals — one per line: <code>amount | what it unlocks</code></label>
            <textarea id="st-goals" name="goals" rows="9"></textarea>
          </div>
          <div class="field">
            <label for="st-team-amount">Team goal — amount and what the first team to reach it gets</label>
            <div class="inline-form tight">
              <input id="st-team-amount" name="teamGoalAmount" type="number" min="1" step="1" class="amount-input" aria-label="Team goal amount" />
              <input name="teamGoalLabel" maxlength="160" aria-label="Team goal prize" />
            </div>
          </div>
          <div class="field">
            <label for="st-rewards">Individual rewards — one per line: <code>amount | reward</code>. Start with <code>every</code> to repeat it; end with <code>| first 3</code> to limit it.</label>
            <textarea id="st-rewards" name="rewards" rows="10"></textarea>
          </div>
          <button class="btn btn-red" type="submit">Save</button>
          <p class="form-status" role="status" aria-live="polite"></p>
        </form>
      </section>
    </div>`;

  const data = { members: [], memberContacts: {}, memberPhotos: {}, donations: [], config: null };
  let settingsFilled = false;

  const list = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const byId = (snap) => Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
  const watch = (ref, apply) => unsubscribers.push(onSnapshot(ref, (snap) => { apply(snap); render(); }));

  watch(collection(db, 'members'), (s) => { data.members = list(s); });
  watch(collection(db, 'memberContacts'), (s) => { data.memberContacts = byId(s); });
  watch(collection(db, 'memberPhotos'), (s) => { data.memberPhotos = byId(s); });
  watch(collection(db, 'donations'), (s) => { data.donations = list(s); });
  watch(doc(db, 'config', 'public'), (s) => {
    data.config = s.exists() ? s.data() : null;
    if (!settingsFilled) fillSettings(data.config);
    settingsFilled = true;
  });

  function render() {
    const stats = computeStats(data);
    const teamName = (id) => (id && stats.teamsById[id] ? `${stats.teamsById[id].emoji || ''} ${stats.teamsById[id].name}` : '—');
    const realName = (d) => stats.membersById[d.uid]?.name || 'Unknown (deleted member)';
    const email = (uid) => data.memberContacts[uid]?.email || '';
    const newestFirst = (a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity);

    root.querySelector('#a-stats').innerHTML = `
      <div class="lid"><span class="num">${euro(stats.totalRaised)}</span><span class="label">confirmed</span></div>
      <div class="lid"><span class="num">${euro(stats.totalPending)}</span><span class="label">pending</span></div>
      <div class="lid"><span class="num">${stats.memberCount}</span><span class="label">members</span></div>`;

    const pending = data.donations.filter((d) => d.status === 'pending').sort(newestFirst);
    root.querySelector('#a-pending').innerHTML = pending.length ? table(
      ['When', 'Reference', 'Name', 'Team', 'Amount', ''],
      pending.map((d) => [
        formatDate(d.createdAt),
        `<code>${escapeHtml(d.reference)}</code>`,
        `${escapeHtml(realName(d))}<br /><small>${escapeHtml(email(d.uid))}</small>`,
        escapeHtml(teamName(d.teamId)),
        `<strong>${euro(d.amount)}</strong>`,
        `<button class="chip ok" data-action="status" data-status="confirmed" data-id="${d.id}">Confirm</button>
         <button class="chip" data-action="status" data-status="rejected" data-id="${d.id}">Reject</button>`,
      ]),
    ) : '<p>Nothing waiting. 🎉</p>';

    const done = data.donations.filter((d) => d.status !== 'pending').sort(newestFirst);
    root.querySelector('#a-donations').innerHTML = done.length ? table(
      ['When', 'Reference', 'Name', 'Team', 'Amount', 'Status', ''],
      done.map((d) => [
        formatDate(d.createdAt),
        `<code>${escapeHtml(d.reference)}</code>`,
        escapeHtml(realName(d)),
        escapeHtml(teamName(d.teamId)),
        euro(d.amount),
        `<span class="status-pill ${d.status}">${d.status}</span>`,
        `<button class="chip" data-action="status" data-status="pending" data-id="${d.id}">Back to pending</button>
         <button class="chip danger" data-action="delete-donation" data-id="${d.id}">Delete</button>`,
      ]),
    ) : '<p>No confirmed or rejected donations yet.</p>';

    const donorRewards = computeDonorRewards(data.donations, stats.membersById, stats.rewards);
    root.querySelector('#a-rewards').innerHTML = donorRewards.length ? table(
      ['Donor', 'Total', 'Donations', 'Earned'],
      donorRewards.map((d) => [
        escapeHtml(d.name),
        `<strong>${euro(d.total)}</strong>`,
        d.count,
        d.earned.length ? `<ul class="earned">${d.earned.map((e) => `<li>${escapeHtml(e)}</li>`).join('')}</ul>` : '—',
      ]),
    ) : '<p>No confirmed donations yet.</p>';

    const members = [...stats.members].sort(newestFirst);
    root.querySelector('#a-members').innerHTML = members.length ? table(
      ['Joined', 'Picture', 'Name', 'Email', 'Team', 'Donated', 'Days', ''],
      members.map((m) => [
        formatDate(m.createdAt),
        isSafeImage(data.memberPhotos[m.id]?.image)
          ? `<span class="admin-photo"><img src="${data.memberPhotos[m.id].image}" alt="" /><button class="chip danger photo-x" data-action="remove-photo" data-id="${m.id}" title="Remove picture" aria-label="Remove picture of ${escapeHtml(m.name)}">✕</button></span>`
          : '—',
        escapeHtml(m.name),
        escapeHtml(email(m.id) || '—'),
        `<select class="move-team ${stats.teamsById[m.teamId] ? '' : 'no-team'}" data-id="${m.id}" aria-label="Team for ${escapeHtml(m.name)}">
          ${stats.teamsById[m.teamId] ? '' : '<option value="" selected disabled>No team — pick one</option>'}
          ${stats.teams.map((t) => `<option value="${t.id}" ${t.id === m.teamId ? 'selected' : ''}>${escapeHtml(t.name)}</option>`).join('')}
        </select>`,
        euro(m.raised),
        (m.days || []).map((k) => dayShort[k] || k).join(', '),
        `<button class="chip danger" data-action="delete-member" data-id="${m.id}">Delete</button>`,
      ]),
    ) : '<p>No members yet.</p>';
  }

  function fillSettings(config) {
    const form = root.querySelector('#a-settings');
    form.revolutUsername.value = config?.revolutUsername || '';
    form.iban.value = config?.iban || '';
    form.accountName.value = config?.accountName || '';
    form.tikkieLink.value = config?.tikkieLink || '';
    form.dataset.tikkieSaved = config?.tikkieLink || '';
    const addedAtMs = config?.tikkieAddedAt?.toMillis?.() || 0;
    form.dataset.tikkieAddedAt = addedAtMs;
    form.querySelector('[data-tikkie-status]').textContent = tikkieNote(config?.tikkieLink || '', addedAtMs);
    form.goals.value = (config?.goals?.length ? config.goals : DEFAULT_GOALS)
      .map((g) => `${g.amount} | ${g.label}`).join('\n');
    const teamGoal = config?.teamGoal?.amount ? config.teamGoal : DEFAULT_TEAM_GOAL;
    form.teamGoalAmount.value = teamGoal.amount;
    form.teamGoalLabel.value = teamGoal.label;
    form.rewards.value = (config?.rewards?.length ? config.rewards : DEFAULT_REWARDS).map(formatReward).join('\n');

    const names = root.querySelector('#a-team-names');
    for (const t of TEAMS) names[t.id].value = config?.teamNames?.[t.id] || t.name;
  }

  root.querySelector('[data-logout]').addEventListener('click', logOut);

  root.addEventListener('change', async (e) => {
    const select = e.target.closest('.move-team');
    if (!select) return;
    try {
      await updateDoc(doc(db, 'members', select.dataset.id), { teamId: select.value });
    } catch (err) {
      alert(`That didn't work: ${err.message}`);
    }
  });

  root.querySelector('#a-team-names').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const status = form.querySelector('.form-status');
    const teamNames = Object.fromEntries(TEAMS.map((t) => [t.id, form[t.id].value.trim()]));
    if (Object.values(teamNames).some((n) => !n)) {
      status.textContent = 'Both teams need a name.';
      status.className = 'form-status error';
      return;
    }
    try {
      await setDoc(doc(db, 'config', 'public'), { teamNames }, { merge: true });
      status.textContent = 'Saved — the site is updated.';
      status.className = 'form-status';
    } catch (err) {
      status.textContent = `That didn't work: ${err.message}`;
      status.className = 'form-status error';
    }
  });

  root.querySelector('#a-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const status = form.querySelector('.form-status');
    const revolutUsername = form.revolutUsername.value.trim().replace(/^(https?:\/\/)?(www\.)?revolut\.me\//i, '').replace(/^@/, '');
    const iban = form.iban.value.replace(/\s+/g, '').toUpperCase();
    const goals = form.goals.value.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
      const [amount, ...label] = line.split('|');
      return { amount: Number(amount.replace(/[^\d]/g, '')), label: label.join('|').trim() };
    });

    const rewardLines = form.rewards.value.split('\n').map((line) => line.trim()).filter(Boolean);
    const rewards = rewardLines.map(parseReward);
    const teamGoal = { amount: Number(form.teamGoalAmount.value), label: form.teamGoalLabel.value.trim() };

    const problem = revolutUsername && !/^[A-Za-z0-9._-]{1,40}$/.test(revolutUsername) ? 'That Revolut username looks wrong.'
      : iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(iban) ? 'That IBAN looks wrong.'
      : goals.some((g) => !g.amount || !g.label) ? 'Each goal line needs an amount and a label, like: 250 | Free round'
      : !Number.isInteger(teamGoal.amount) || teamGoal.amount < 1 || !teamGoal.label ? 'The team goal needs an amount and a prize.'
      : rewards.some((r) => !r) ? `This reward line isn't right: "${rewardLines[rewards.findIndex((r) => !r)]}"`
      : '';
    if (problem) {
      status.textContent = problem;
      status.className = 'form-status error';
      return;
    }

    const formattedIban = iban.replace(/(.{4})/g, '$1 ').trim();
    const tikkieLink = form.tikkieLink.value.trim();
    if (tikkieLink && !/^https:\/\/\S+$/i.test(tikkieLink)) {
      status.textContent = 'The Tikkie link should start with https://';
      status.className = 'form-status error';
      return;
    }
    // The countdown restarts only when the link itself changes (or has no start date yet), not on every save.
    const restart = tikkieLink !== form.dataset.tikkieSaved || (tikkieLink && !Number(form.dataset.tikkieAddedAt));
    const tikkieFields = restart
      ? { tikkieLink, tikkieAddedAt: tikkieLink ? serverTimestamp() : null }
      : { tikkieLink };
    await setDoc(doc(db, 'config', 'public'), {
      revolutUsername,
      iban: formattedIban,
      accountName: form.accountName.value.trim(),
      goals: goals.sort((a, b) => a.amount - b.amount),
      teamGoal,
      rewards,
      ...tikkieFields,
    }, { merge: true });
    form.revolutUsername.value = revolutUsername;
    form.iban.value = formattedIban;
    form.dataset.tikkieSaved = tikkieLink;
    const savedAtMs = restart ? Date.now() : Number(form.dataset.tikkieAddedAt) || 0;
    form.dataset.tikkieAddedAt = savedAtMs;
    form.querySelector('[data-tikkie-status]').textContent = tikkieNote(tikkieLink, savedAtMs);
    status.textContent = 'Saved — the site is updated.';
    status.className = 'form-status';
  });

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    btn.disabled = true;
    try {
      if (action === 'status') {
        const status = btn.dataset.status;
        await updateDoc(doc(db, 'donations', id), status === 'confirmed'
          ? { status, confirmedAt: serverTimestamp() }
          : { status });
      } else if (action === 'delete-donation' && confirm('Delete this donation for good?')) {
        await deleteDoc(doc(db, 'donations', id));
      } else if (action === 'delete-member' && confirm('Delete this member? Their donations stay but show as unknown.')) {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'members', id));
        batch.delete(doc(db, 'memberContacts', id));
        batch.delete(doc(db, 'memberPhotos', id));
        await batch.commit();
      } else if (action === 'remove-photo' && confirm('Remove this picture?')) {
        await deleteDoc(doc(db, 'memberPhotos', id));
      } else if (action === 'export-members') {
        exportMembers();
      }
    } catch (err) {
      alert(`That didn't work: ${err.message}`);
    } finally {
      btn.disabled = false;
    }
  });

  function exportMembers() {
    const stats = computeStats(data);
    const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Name', 'Email', 'Team', 'Donated (confirmed)', ...schedule.map((ev) => ev.day)]];
    for (const m of stats.members) {
      rows.push([
        m.name,
        data.memberContacts[m.id]?.email || '',
        stats.teamsById[m.teamId]?.name || '',
        m.raised,
        ...schedule.map((ev) => ((m.days || []).includes(ev.key) ? 'yes' : '')),
      ]);
    }
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(',')).join('\n')], { type: 'text/csv' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'buixieval-members.csv' });
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

function table(headers, rows) {
  return `
    <div class="table-wrap">
      <table class="admin-table">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}
