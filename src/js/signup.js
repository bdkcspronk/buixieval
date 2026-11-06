import '../css/style.css';
import { schedule } from './schedule-data.js';
import { mountDotArt } from './dot-art.js';
import { isConfigured } from './firebase.js';
import {
  computeDonorRewards, joinAsMember, removeMemberPhoto, setMemberPhoto, updateMember, watchPhotos, watchPublic,
} from './store.js';
import { isSafeImage, resizeImage } from './photo.js';
import { accountLinks, logOut, renderLogin, watchUser } from './account.js';
import { closedNotice, escapeHtml, euro, teamColorClass } from './ui.js';

mountDotArt();

const root = document.querySelector('#signup-root');
const memberLabel = (n) => `${n} ${n === 1 ? 'member' : 'members'}`;

let user;
let stats = null;
let photos = {};
let view = '';

if (!isConfigured) {
  root.innerHTML = closedNotice('Signing up');
} else {
  root.innerHTML = '<div class="jar-panel notice-panel"><p class="script">Loading…</p></div>';
  watchUser((u) => { user = u; update(); });
  const refreshLinks = accountLinks();
  watchPublic((s) => { stats = s; update(); refreshLinks(s); }, () => { root.innerHTML = closedNotice('Signing up'); });
  watchPhotos((p) => { photos = p; renderPhoto(); });
}

function update() {
  if (user === undefined || !stats) return;
  const member = user ? stats.membersById[user.uid] : null;
  const next = !user ? 'login' : member ? 'account' : 'join';

  if (next !== view) {
    view = next;
    if (view === 'login') {
      renderLogin(root, { title: 'Join BUIXIEVAL', intro: 'Log in or create an account, then pick your team. Your donations are linked to your account.' });
    } else if (view === 'join') {
      renderJoin();
    } else {
      renderAccount(member);
    }
  }

  if (view === 'join') {
    for (const t of stats.teams) {
      const el = root.querySelector(`[data-members="${t.id}"]`);
      if (el) el.textContent = memberLabel(t.members);
    }
  }
  if (view === 'account') renderSummary(member);
}

function dayChoices(selected = []) {
  return `
    <button type="button" class="link-btn" data-select-all>Select all</button>
    <div class="choice-grid days">
      ${schedule.map((ev) => `
        <label class="choice">
          <input type="checkbox" name="days" value="${ev.key}" ${selected.includes(ev.key) ? 'checked' : ''} />
          <span class="choice-body">
            <span class="choice-name">${ev.day.slice(0, 3)} ${ev.emoji}</span>
            <small>${ev.title}</small>
          </span>
        </label>`).join('')}
    </div>`;
}

function wireSelectAll(form) {
  form.querySelector('[data-select-all]').addEventListener('click', () => {
    form.querySelectorAll('input[name="days"]').forEach((cb) => { cb.checked = true; });
  });
}

function setStatus(el, text, isError) {
  el.textContent = text;
  el.className = `form-status${isError ? ' error' : ''}`;
}

function renderJoin() {
  root.innerHTML = `
    <div class="jar-panel account-bar">
      <span>Logged in as <strong>${escapeHtml(user.email)}</strong></span>
      <button class="chip" data-logout>Log out</button>
    </div>
    <form class="label-panel form-panel" novalidate>
      <div class="field">
        <label for="su-name">Your name</label>
        <input id="su-name" name="name" maxlength="60" autocomplete="name" value="${escapeHtml(user.displayName || '')}" required />
        <small>This is how you'll show up on your team page.</small>
      </div>
      <fieldset class="field">
        <legend>Pick your team</legend>
        <div class="choice-grid">
          ${stats.teams.map((t) => `
            <label class="choice team-choice ${teamColorClass(t)}">
              <input type="radio" name="team" value="${escapeHtml(t.id)}" />
              <span class="choice-body">
                <span class="choice-emoji">${escapeHtml(t.emoji || '⭐')}</span>
                <span class="choice-name">${escapeHtml(t.name)}</span>
                <small data-members="${escapeHtml(t.id)}">${memberLabel(t.members)}</small>
              </span>
            </label>`).join('')}
        </div>
        <small>You can't switch teams yourself later, so choose wisely!</small>
      </fieldset>
      <fieldset class="field">
        <legend>Which events are you coming to?</legend>
        ${dayChoices()}
      </fieldset>
      <button class="btn btn-red" type="submit">Join the team</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>`;

  root.querySelector('[data-logout]').addEventListener('click', logOut);
  const form = root.querySelector('form');
  const status = form.querySelector('.form-status');
  wireSelectAll(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const teamId = data.get('team');
    const days = data.getAll('days');
    const problem = !name ? 'Fill in your name.' : !teamId ? 'Pick a team.' : !days.length ? 'Tick at least one event.' : '';
    if (problem) return setStatus(status, problem, true);

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    setStatus(status, 'Signing you up…');
    try {
      await joinAsMember(user, { name, teamId, days });
    } catch {
      button.disabled = false;
      setStatus(status, 'Something went wrong — please try again.', true);
    }
  });
}

function renderAccount(member) {
  const team = stats.teamsById[member.teamId];
  root.innerHTML = `
    <div class="label-panel account-panel ${teamColorClass(team)}">
      <div class="account-head">
        <span class="icon-badge">${escapeHtml(team?.emoji || '⭐')}</span>
        <div>
          <h2 data-name>${escapeHtml(member.name)}</h2>
          <p>Team <strong>${escapeHtml(team?.name || '—')}</strong> · ${escapeHtml(user.email)}</p>
        </div>
      </div>
      <div id="acct-summary"></div>
      <div class="hero-ctas">
        <a class="btn btn-red" href="donate.html">Donate</a>
        ${team ? `<a class="btn btn-dark" href="team.html?team=${encodeURIComponent(team.slug)}">Team page</a>` : ''}
        <button class="btn btn-dark" data-logout>Log out</button>
      </div>
    </div>
    <div class="label-panel photo-panel">
      <h3 class="panel-title">Your picture on the team page</h3>
      <div class="photo-row">
        <div class="photo-preview ${teamColorClass(team)}" id="photo-preview"></div>
        <div class="photo-actions">
          <label class="btn btn-red file-btn">
            Upload JPG or PNG
            <input type="file" accept="image/jpeg,image/png" data-photo-input />
          </label>
          <div class="photo-confirm" data-photo-confirm hidden>
            <p><strong>Use this picture?</strong> This is how it will look on your team page.</p>
            <div class="preset-row">
              <button type="button" class="chip ok" data-photo-yes>Use this picture</button>
              <button type="button" class="chip" data-photo-no>Cancel</button>
            </div>
          </div>
          <button type="button" class="chip danger" data-remove-photo hidden>Remove picture</button>
          <p class="form-status" data-photo-status role="status" aria-live="polite"></p>
        </div>
      </div>
    </div>
    <form class="label-panel form-panel" novalidate>
      <h3 class="panel-title">Edit your details</h3>
      <div class="field">
        <label for="ac-name">Your name</label>
        <input id="ac-name" name="name" maxlength="60" value="${escapeHtml(member.name)}" required />
      </div>
      <fieldset class="field">
        <legend>Which events are you coming to?</legend>
        ${dayChoices(member.days || [])}
      </fieldset>
      <button class="btn btn-red" type="submit">Save</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>`;

  root.querySelector('[data-logout]').addEventListener('click', logOut);
  wirePhoto();
  renderPhoto();
  const form = root.querySelector('form');
  const status = form.querySelector('.form-status');
  wireSelectAll(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const days = new FormData(form).getAll('days');
    if (!name) return setStatus(status, 'Fill in your name.', true);
    if (!days.length) return setStatus(status, 'Tick at least one event.', true);
    try {
      await updateMember(user.uid, { name, days });
      root.querySelector('[data-name]').textContent = name;
      setStatus(status, 'Saved!');
    } catch {
      setStatus(status, 'Something went wrong — please try again.', true);
    }
  });
}

// A picture chosen but not yet confirmed; shown in the preview instead of the saved one.
let pendingPhoto = null;

function renderPhoto() {
  const preview = root.querySelector('#photo-preview');
  if (!preview || !user) return;
  const image = pendingPhoto || photos[user.uid];
  preview.innerHTML = isSafeImage(image)
    ? `<img class="member-photo" src="${image}" alt="Your picture" /><span class="photo-tint"></span>`
    : '<span class="photo-empty">No picture yet</span>';
  preview.classList.toggle('is-pending', Boolean(pendingPhoto));
  root.querySelector('[data-photo-confirm]').hidden = !pendingPhoto;
  root.querySelector('.file-btn').hidden = Boolean(pendingPhoto);
  root.querySelector('[data-remove-photo]').hidden = Boolean(pendingPhoto) || !isSafeImage(photos[user.uid]);
}

function wirePhoto() {
  const input = root.querySelector('[data-photo-input]');
  const status = root.querySelector('[data-photo-status]');
  pendingPhoto = null;

  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (!file) return;
    setStatus(status, 'Preparing preview…');
    try {
      pendingPhoto = await resizeImage(file);
      setStatus(status, '');
      renderPhoto();
    } catch (err) {
      setStatus(status, err.message?.includes('picture') ? err.message : 'That didn\'t work — try another picture.', true);
    }
  });

  root.querySelector('[data-photo-yes]').addEventListener('click', async () => {
    setStatus(status, 'Uploading…');
    try {
      await setMemberPhoto(user.uid, pendingPhoto);
      pendingPhoto = null;
      renderPhoto();
      setStatus(status, 'Looking good!');
    } catch {
      setStatus(status, 'That didn\'t work — please try again.', true);
    }
  });

  root.querySelector('[data-photo-no]').addEventListener('click', () => {
    pendingPhoto = null;
    renderPhoto();
    setStatus(status, '');
  });

  root.querySelector('[data-remove-photo]').addEventListener('click', async () => {
    try {
      await removeMemberPhoto(user.uid);
      setStatus(status, 'Picture removed.');
    } catch {
      setStatus(status, 'Something went wrong — please try again.', true);
    }
  });
}

function renderSummary(member) {
  const el = root.querySelector('#acct-summary');
  if (!el) return;
  const mine = stats.donations
    .filter((d) => d.uid === user.uid)
    .sort((a, b) => (b.createdAt?.seconds ?? Infinity) - (a.createdAt?.seconds ?? Infinity));
  const rewards = computeDonorRewards(stats.donations, stats.membersById, stats.rewards).find((d) => d.uid === user.uid);
  const teamName = (id) => (id && stats.teamsById[id] ? stats.teamsById[id].name : 'No team');

  el.innerHTML = `
    <div class="account-totals">
      <div><span class="big">${euro(member.raised)}</span><span>donated</span></div>
      <div><span class="big">${euro(member.pending)}</span><span>waiting for confirmation</span></div>
    </div>
    ${rewards?.earned.length ? `
      <h3 class="panel-title">Rewards you've earned</h3>
      <ul class="earned-list">${rewards.earned.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
    ${mine.length ? `
      <h3 class="panel-title">Your donations</h3>
      <ul class="my-donations">
        ${mine.map((d) => `
          <li>
            <strong>${euro(d.amount)}</strong>
            <span>${escapeHtml(teamName(d.teamId))}</span>
            <code>${escapeHtml(d.reference)}</code>
            <span class="status-pill ${d.status}">${d.status}</span>
          </li>`).join('')}
      </ul>` : '<p>No donations yet — every euro pushes your team up the tally!</p>'}`;
}
