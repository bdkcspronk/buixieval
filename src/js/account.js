import {
  GoogleAuthProvider, connectAuthEmulator, createUserWithEmailAndPassword, getAuth,
  onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword,
  signInWithPopup, signOut,
} from 'firebase/auth';
import { app, useEmulators } from './firebase.js';
import { escapeHtml } from './ui.js';

export const auth = app ? getAuth(app) : null;
if (auth && useEmulators) {
  connectAuthEmulator(auth, `http://127.0.0.1:${import.meta.env.VITE_AUTH_EMULATOR_PORT || 9099}`, { disableWarnings: true });
}

// Like onAuthStateChanged, but also fires after refreshUser() (e.g. once an email is verified,
// which Firebase doesn't announce on its own).
const userListeners = new Set();
export function watchUser(callback) {
  userListeners.add(callback);
  const stop = onAuthStateChanged(auth, callback);
  return () => { userListeners.delete(callback); stop(); };
}
export const logOut = () => signOut(auth);

// Email/password accounts must confirm their address before they can join or pledge (the
// rules check email_verified). Google accounts are verified already.
export const needsVerification = (user) => Boolean(user && !user.emailVerified
  && user.providerData.some((p) => p.providerId === 'password'));

// Reloads the account and its token so a just-verified email reaches both the page and the rules.
async function refreshUser() {
  const user = auth.currentUser;
  if (!user) return;
  await user.reload();
  if (user.emailVerified) await user.getIdToken(true);
  userListeners.forEach((cb) => cb(auth.currentUser));
}

async function sendVerification(user) {
  // Bring them back to the page they were on; fall back to Firebase's own page if that URL isn't allowed.
  try {
    await sendEmailVerification(user, { url: location.origin + location.pathname });
  } catch (err) {
    if (err.code !== 'auth/unauthorized-continue-uri' && err.code !== 'auth/invalid-continue-uri') throw err;
    await sendEmailVerification(user);
  }
}

// Relabels "Sign up" / "Join a team" links for people already in a team.
// Returns a function to call with fresh stats after each render.
export function accountLinks() {
  let user = null;
  let stats = null;
  const apply = () => {
    const isMember = Boolean(user && stats?.membersById[user.uid]);
    document.querySelectorAll('a[href="signup.html"]').forEach((a) => {
      if (!a.dataset.joinLabel) a.dataset.joinLabel = a.textContent;
      const accountLabel = a.closest('.nav-links') ? 'Account' : 'My account';
      a.textContent = isMember ? accountLabel : a.dataset.joinLabel;
    });
  };
  watchUser((u) => { user = u; apply(); });
  return (s) => { stats = s; apply(); };
}

const MESSAGES = {
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'No account with that email — create one instead.',
  'auth/email-already-in-use': 'There is already an account with this email — log in instead.',
  'auth/weak-password': 'Your password needs at least 6 characters.',
  'auth/invalid-email': 'That email address looks wrong.',
  'auth/too-many-requests': 'Too many tries — wait a minute and try again.',
  'auth/popup-blocked': 'Your browser blocked the Google pop-up — allow pop-ups and try again.',
};

// "Check your inbox" panel for email/password accounts that haven't verified yet.
// The page re-renders by itself (via watchUser) once the email is verified.
export function renderVerify(root, user, { justCreated = false } = {}) {
  root.innerHTML = `
    <div class="label-panel form-panel auth-panel">
      <h2>Confirm your email</h2>
      <p>${justCreated ? 'We sent' : 'We need to check your email address first. Send'} a link to <strong>${escapeHtml(user.email)}</strong>${justCreated ? '. Click it, then come back here.' : ' and click it.'}</p>
      <p class="small-print">No email? Check your spam folder.</p>
      <div class="hero-ctas">
        <button type="button" class="btn btn-red" data-check>I've clicked the link</button>
        <button type="button" class="btn" data-send>${justCreated ? 'Send it again' : 'Send the link'}</button>
      </div>
      <p class="auth-switch"><button type="button" class="link-btn" data-logout>Use a different account</button></p>
      <p class="form-status" role="status" aria-live="polite"></p>
    </div>`;

  const status = root.querySelector('.form-status');
  const say = (text, isError = true) => {
    status.textContent = text;
    status.className = `form-status${isError ? ' error' : ''}`;
  };

  const check = async (quiet) => {
    try {
      await refreshUser();
      if (!quiet && needsVerification(auth.currentUser)) say("Not verified yet — click the link in the email first.");
    } catch {
      if (!quiet) say('Something went wrong — please try again.');
    }
  };

  root.querySelector('[data-check]').addEventListener('click', () => check(false));
  root.querySelector('[data-logout]').addEventListener('click', () => logOut());
  root.querySelector('[data-send]').addEventListener('click', async (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    try {
      await sendVerification(user);
      say('Sent! Check your inbox.', false);
    } catch (err) {
      say(MESSAGES[err.code] || 'Something went wrong — please try again.');
    } finally {
      button.disabled = false;
    }
  });

  // Coming back from the email tab is the usual moment they've just verified.
  const onVisible = () => {
    if (!root.isConnected || !root.querySelector('[data-check]')) {
      document.removeEventListener('visibilitychange', onVisible);
    } else if (document.visibilityState === 'visible') {
      check(true);
    }
  };
  document.addEventListener('visibilitychange', onVisible);
}

// Set right after an account is created, so the verify panel can say "we sent".
export let justCreatedAccount = false;

// Renders "Continue with Google" + email/password into root. watchUser fires once logged in.
export function renderLogin(root, { title = 'Log in', intro = '' } = {}) {
  let mode = 'login';

  const draw = () => {
    const creating = mode === 'create';
    root.innerHTML = `
      <div class="label-panel form-panel auth-panel">
        <h2>${escapeHtml(title)}</h2>
        ${intro ? `<p>${escapeHtml(intro)}</p>` : ''}
        <button type="button" class="btn btn-google" data-google>
          <span class="google-g" aria-hidden="true">G</span> Continue with Google
        </button>
        <div class="or-divider"><span>or with email</span></div>
        <form novalidate>
          <div class="field">
            <label for="au-email">Email</label>
            <input id="au-email" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="field">
            <label for="au-password">Password</label>
            <input id="au-password" name="password" type="password" minlength="6"
              autocomplete="${creating ? 'new-password' : 'current-password'}" required />
          </div>
          <button class="btn btn-red" type="submit">${creating ? 'Create account' : 'Log in'}</button>
        </form>
        <p class="auth-switch">
          ${creating
            ? 'Already have an account? <button type="button" class="link-btn" data-mode="login">Log in</button>'
            : 'New here? <button type="button" class="link-btn" data-mode="create">Create an account</button> · <button type="button" class="link-btn" data-reset>Forgot password?</button>'}
        </p>
        <p class="form-status" role="status" aria-live="polite"></p>
      </div>`;

    const status = root.querySelector('.form-status');
    const say = (text, isError = true) => {
      status.textContent = text;
      status.className = `form-status${isError ? ' error' : ''}`;
    };
    const fail = (err) => {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return say('', false);
      say(MESSAGES[err.code] || 'Something went wrong — please try again.');
    };

    root.querySelector('[data-google]').addEventListener('click', () => {
      say('', false);
      signInWithPopup(auth, new GoogleAuthProvider()).catch(fail);
    });

    root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      draw();
    }));

    root.querySelector('[data-reset]')?.addEventListener('click', async () => {
      const email = root.querySelector('#au-email').value.trim();
      if (!email) return say('Fill in your email first, then click "Forgot password?" again.');
      try {
        await sendPasswordResetEmail(auth, email);
        say('Check your inbox for a link to reset your password.', false);
      } catch (err) {
        fail(err);
      }
    });

    root.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const email = form.email.value.trim();
      const password = form.password.value;
      if (!email || !password) return say('Fill in your email and password.');
      say(creating ? 'Creating your account…' : 'Logging in…', false);
      try {
        if (creating) {
          justCreatedAccount = true;
          const { user } = await createUserWithEmailAndPassword(auth, email, password);
          await sendVerification(user).catch(() => { justCreatedAccount = false; });
        } else {
          await signInWithEmailAndPassword(auth, email, password);
        }
      } catch (err) {
        if (creating) justCreatedAccount = false;
        fail(err);
      }
    });
  };

  draw();
}
