import '../css/style.css';
import { mountDotArt } from './dot-art.js';
import { mountAmbience } from './ambience.js';
import { isConfigured } from './firebase.js';
import { watchPublic, createDonation } from './store.js';
import { accountLinks, justCreatedAccount, logOut, needsVerification, renderLogin, renderVerify, watchUser } from './account.js';
import { closedNotice, escapeHtml, euro, revolutLink } from './ui.js';

mountDotArt();
mountAmbience();

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
  const next = !user ? 'login' : needsVerification(user) ? 'verify' : member ? 'form' : 'join';
  if (next === view) return;
  view = next;

  if (view === 'login') {
    root.innerHTML = `${rewardsPanel(stats.rewards)}<div id="login-slot"></div>`;
    renderLogin(root.querySelector('#login-slot'), {
      title: 'Log in to donate',
      intro: 'Donations are linked to your account, so everything you give adds up on your team page.',
    });
  } else if (view === 'verify') {
    root.innerHTML = `${rewardsPanel(stats.rewards)}<div id="login-slot"></div>`;
    renderVerify(root.querySelector('#login-slot'), user, { justCreated: justCreatedAccount });
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
      <button class="btn btn-red" type="submit">Review pledge</button>
      <div class="pledge-review" hidden></div>
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

  // Step 1: review. Nothing is saved until the donor confirms.
  const review = form.querySelector('.pledge-review');
  const submitButton = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = Number(amountInput.value);
    const teamId = form.team.value || null;
    if (!Number.isInteger(amount) || amount < 1 || amount > 1000) {
      status.textContent = 'Pick a whole amount between €1 and €1000.';
      status.className = 'form-status error';
      return;
    }
    const teamName = teamId ? stats.teams.find((t) => t.id === teamId)?.name || 'your team' : null;
    review.innerHTML = `
      <p>You're pledging <strong>${euro(amount)}</strong>${teamName ? ` for <strong>${escapeHtml(teamName)}</strong>` : ' for the event (no team)'}.</p>
      <p class="small-print">Your pledge is saved to the admin right away, then you'll see how to pay.</p>
      <div class="review-actions">
        <button type="button" class="btn btn-red" data-confirm>Confirm pledge</button>
        <button type="button" class="btn btn-dark" data-back>Go back</button>
      </div>`;
    review.hidden = false;
    submitButton.hidden = true;
    status.textContent = '';

    review.querySelector('[data-back]').addEventListener('click', () => {
      review.hidden = true;
      submitButton.hidden = false;
    });

    review.querySelector('[data-confirm]').addEventListener('click', async (ev) => {
      const button = ev.currentTarget;
      button.disabled = true;
      status.textContent = 'Saving your pledge…';
      status.className = 'form-status';
      try {
        const { reference } = await createDonation({ uid: user.uid, teamId, amount });
        view = 'paid';
        showPayment({ name: member.name, amount, reference, payment: stats.payment });
      } catch {
        button.disabled = false;
        status.textContent = 'Something went wrong — wait half a minute and try again.';
        status.className = 'form-status error';
      }
    });
  });
}

function showPayment({ name, amount, reference, payment }) {
  const { tikkieLink, tikkieExpired, iban, accountName, revolutUsername } = payment;
  const hasPayment = Boolean(tikkieLink || iban || revolutUsername || tikkieExpired);
  const copyButton = (value) => `<button type="button" class="chip" data-copy="${escapeHtml(value)}">Copy</button>`;

  // One panel per payment method; only the methods that are set up are offered.
  const methods = [
    tikkieLink && {
      key: 'tikkie',
      label: 'Tikkie',
      html: `
        <a class="btn btn-red" href="${escapeHtml(tikkieLink)}" target="_blank" rel="noopener">Open Tikkie</a>
        <p class="small-print">Enter <strong>${euro(amount)}</strong> and put the reference above in the note.</p>`,
    },
    tikkieExpired && {
      key: 'tikkie',
      label: 'Tikkie',
      html: '<p class="script coming-soon">Ask Emma to create a new Tikkie link.</p>',
    },
    revolutUsername && {
      key: 'revolut',
      label: 'Revolut',
      html: `
        <a class="btn btn-red" href="${escapeHtml(revolutLink(revolutUsername))}" target="_blank" rel="noopener">Open revolut.me/${escapeHtml(revolutUsername)}</a>
        <p class="small-print">Enter <strong>${euro(amount)}</strong> and put the reference above in the note. Works with any bank card, Apple Pay or Google Pay.</p>`,
    },
    iban && {
      key: 'bank',
      label: 'Bank transfer',
      html: `
        <dl class="bank-details">
          ${accountName ? `<dt>Name</dt><dd>${escapeHtml(accountName)}</dd>` : ''}
          <dt>IBAN</dt><dd><code>${escapeHtml(iban)}</code>${copyButton(iban)}</dd>
          <dt>Amount</dt><dd>${euro(amount)}</dd>
          <dt>Reference</dt><dd><code>${escapeHtml(reference)}</code></dd>
        </dl>`,
    },
  ].filter(Boolean);

  const chooser = methods.length > 1
    ? `<p class="method-prompt">How would you like to pay?</p>
       <div class="method-chooser">${methods.map((m, i) => `<button type="button" class="chip method" data-method="${i}" aria-pressed="false">${escapeHtml(m.label)}</button>`).join('')}</div>`
    : '';

  root.innerHTML = `
    <div class="label-panel pay-panel">
      <h2>Nice one, ${escapeHtml(name)}!</h2>
      <p>Your pledge of <strong>${euro(amount)}</strong> is saved.</p>
      <div class="reference"><code>${escapeHtml(reference)}</code>${copyButton(reference)}</div>
      ${hasPayment ? `
        <p class="reminder"><strong>Don't forget to put in the reference number</strong> (<code>${escapeHtml(reference)}</code>), or your donation cannot be linked to your account.</p>` : ''}

      ${methods.length ? `
        ${chooser}
        <div class="pay-option method-panel"></div>` : `
        <p class="script coming-soon">Payment details are coming soon — your pledge is saved and we'll let you know how to pay.</p>`}

      <p class="small-print">Your donation shows up on your team page as soon as an organiser confirms it has arrived. You can follow it on your account page.</p>
      <div class="hero-ctas">
        <a class="btn btn-dark" href="signup.html">My account</a>
        <a class="btn btn-dark" href="index.html#tally">See the tally</a>
      </div>
    </div>`;

  const panel = root.querySelector('.method-panel');

  function showMethod(index) {
    const m = methods[index];
    panel.innerHTML = `<h3>Pay with ${escapeHtml(m.label)}</h3>${m.html}`;
    root.querySelectorAll('[data-method]').forEach((btn) => {
      const active = Number(btn.dataset.method) === index;
      btn.classList.toggle('selected', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    panel.querySelectorAll('[data-copy]').forEach(bindCopy);
  }

  root.querySelectorAll('[data-method]').forEach((btn) => btn.addEventListener('click', () => showMethod(Number(btn.dataset.method))));

  // With a single method there is nothing to choose, so show it straight away.
  if (methods.length === 1) showMethod(0);

  root.querySelectorAll('.reference [data-copy]').forEach(bindCopy);
}

function bindCopy(btn) {
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.textContent = 'Copied!';
    } catch {
      btn.textContent = 'Select & copy';
    }
  });
}
