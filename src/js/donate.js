import '../css/style.css';
import { mountDotArt } from './dot-art.js';
import { isConfigured } from './firebase.js';
import { watchPublic, createDonation } from './store.js';
import { accountLinks, logOut, renderLogin, watchUser } from './account.js';
import { closedNotice, escapeHtml, euro, revolutLink } from './ui.js';

mountDotArt();

const root = document.querySelector('#donate-root');
const PRESETS = [5, 10, 20, 50];

let user;
let stats = null;
let view = '';

if (!isConfigured) {
  root.innerHTML = closedNotice('Donating');
} else {
  root.innerHTML = '<div class="jar-panel notice-panel"><p class="script">Loading…</p></div>';
  watchUser((u) => { user = u; update(); });
  const refreshLinks = accountLinks();
  watchPublic((s) => { stats = s; update(); refreshLinks(s); }, () => { root.innerHTML = closedNotice('Donating'); });
}

function update() {
  if (user === undefined || !stats || view === 'paid') return;
  const member = user ? stats.membersById[user.uid] : null;
  const next = !user ? 'login' : member ? 'form' : 'join';
  if (next === view) return;
  view = next;

  if (view === 'login') {
    root.innerHTML = `${rewardsPanel(stats.rewards)}<div id="login-slot"></div>`;
    renderLogin(root.querySelector('#login-slot'), {
      title: 'Log in to donate',
      intro: 'Donations are linked to your account, so everything you give adds up on your team page.',
    });
  } else if (view === 'join') {
    root.innerHTML = `
      ${rewardsPanel(stats.rewards)}
      <div class="label-panel done-panel">
        <h2>Join a team first</h2>
        <p>You're logged in as <strong>${escapeHtml(user.email)}</strong> but haven't picked a team yet.</p>
        <div class="hero-ctas"><a class="btn btn-red" href="signup.html">Pick your team</a></div>
      </div>`;
  } else {
    renderForm(member);
  }
}

function rewardsPanel(rewards) {
  const cost = (r) => (r.every ? `every ${euro(r.amount)}` : euro(r.amount));
  return `
    <div class="label-panel rewards-panel" id="rewards">
      <h2>What your donation gets you</h2>
      <ul class="reward-list">
        ${[...rewards].sort((a, b) => a.amount - b.amount).map((r) => `
          <li><span class="reward-cost">${cost(r)}</span><span>${escapeHtml(r.label)}</span></li>`).join('')}
      </ul>
      <p class="small-print">Rewards count everything you donate, before and during the week, once it's confirmed.</p>
    </div>`;
}

function renderForm(member) {
  root.innerHTML = `
    ${rewardsPanel(stats.rewards)}
    <form class="label-panel form-panel" novalidate>
      <div class="account-bar-inline">
        Donating as <strong>${escapeHtml(member.name)}</strong>
        <button type="button" class="link-btn" data-logout>Not you? Log out</button>
      </div>
      <div class="field">
        <label for="dn-amount">Amount (€)</label>
        <div class="preset-row">
          ${PRESETS.map((a) => `<button type="button" class="chip" data-amount="${a}">${euro(a)}</button>`).join('')}
        </div>
        <input id="dn-amount" name="amount" type="number" inputmode="numeric" min="1" max="1000" step="1" placeholder="Or type an amount" required />
      </div>
      <div class="field">
        <label for="dn-team">Which team does it count for?</label>
        <select id="dn-team" name="team">
          ${stats.teams.map((t) => `<option value="${escapeHtml(t.id)}" ${t.id === member.teamId ? 'selected' : ''}>${escapeHtml(t.emoji || '')} ${escapeHtml(t.name)}${t.id === member.teamId ? ' (your team)' : ''}</option>`).join('')}
          <option value="">No team — just the event</option>
        </select>
      </div>
      <button class="btn btn-red" type="submit">Continue to payment</button>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>`;

  const form = root.querySelector('form');
  const amountInput = form.querySelector('#dn-amount');
  const status = form.querySelector('.form-status');
  const chips = form.querySelectorAll('[data-amount]');

  root.querySelector('[data-logout]').addEventListener('click', logOut);
  const syncChips = () => chips.forEach((c) => c.classList.toggle('selected', c.dataset.amount === amountInput.value));
  chips.forEach((chip) => chip.addEventListener('click', () => {
    amountInput.value = chip.dataset.amount;
    syncChips();
  }));
  amountInput.addEventListener('input', syncChips);
  if (location.hash === '#rewards') root.querySelector('#rewards').scrollIntoView();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(amountInput.value);
    const teamId = form.team.value || null;
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
      status.textContent = 'Pick a whole amount between €1 and €1000.';
      status.className = 'form-status error';
      return;
    }

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    status.textContent = 'Saving your pledge…';
    status.className = 'form-status';
    try {
      const { reference } = await createDonation({ uid: user.uid, teamId, amount });
      view = 'paid';
      showPayment({ name: member.name, amount, reference, payment: stats.payment });
    } catch {
      button.disabled = false;
      status.textContent = 'Something went wrong — please try again.';
      status.className = 'form-status error';
    }
  });
}

function showPayment({ name, amount, reference, payment }) {
  const { revolutUsername, iban, accountName } = payment;
  const copyButton = (value) => `<button type="button" class="chip" data-copy="${escapeHtml(value)}">Copy</button>`;

  root.innerHTML = `
    <div class="label-panel pay-panel">
      <h2>Nice one, ${escapeHtml(name)}!</h2>
      <p>Your pledge of <strong>${euro(amount)}</strong> is saved. Put this reference in the payment note so we can match it:</p>
      <div class="reference"><code>${escapeHtml(reference)}</code>${copyButton(reference)}</div>

      ${revolutUsername ? `
        <div class="pay-option">
          <h3>Pay with Revolut</h3>
          <a class="btn btn-red" href="${escapeHtml(revolutLink(revolutUsername))}" target="_blank" rel="noopener">Open revolut.me/${escapeHtml(revolutUsername)}</a>
          <p class="small-print">Enter <strong>${euro(amount)}</strong> and the reference above. Works with any bank card, Apple Pay or Google Pay — you don't need Revolut yourself.</p>
        </div>` : ''}

      ${iban ? `
        <div class="pay-option">
          <h3>${revolutUsername ? 'Or by' : 'Pay by'} bank transfer</h3>
          <dl class="bank-details">
            ${accountName ? `<dt>Name</dt><dd>${escapeHtml(accountName)}</dd>` : ''}
            <dt>IBAN</dt><dd><code>${escapeHtml(iban)}</code>${copyButton(iban)}</dd>
            <dt>Amount</dt><dd>${euro(amount)}</dd>
            <dt>Reference</dt><dd><code>${escapeHtml(reference)}</code></dd>
          </dl>
        </div>` : ''}

      ${!revolutUsername && !iban ? `
        <p class="script coming-soon">Payment details are coming soon — your pledge is saved and we'll let you know how to pay.</p>` : ''}

      <p class="small-print">Your donation shows up on your team page as soon as an organiser confirms it has arrived. You can follow it on your account page.</p>
      <div class="hero-ctas">
        <a class="btn btn-dark" href="signup.html">My account</a>
        <a class="btn btn-dark" href="index.html#tally">See the tally</a>
      </div>
    </div>`;

  root.querySelectorAll('[data-copy]').forEach((btn) => btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = 'Select & copy';
    }
  }));
}
