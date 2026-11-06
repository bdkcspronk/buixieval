import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const env = import.meta.env;

export const useEmulators = env.VITE_USE_EMULATORS === 'true';

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (useEmulators ? 'demo-key' : undefined),
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const isConfigured = Boolean(config.apiKey && config.projectId);

export const app = isConfigured ? initializeApp(config) : null;

// App Check: proves requests come from this site (via invisible reCAPTCHA Enterprise, now part of
// Google Cloud Fraud Defense; classic v3 keys can no longer be created), so scripts
// using the public config can't talk to Firestore once enforcement is on in the console.
// Must start before Firestore/Auth are used. The emulators don't check it.
const recaptchaKey = env.VITE_RECAPTCHA_SITE_KEY;
if (app && recaptchaKey && !useEmulators) {
  // For `npm run dev` against the real project: register this token in the console
  // (App Check -> Apps -> Manage debug tokens).
  if (env.VITE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_APPCHECK_DEBUG_TOKEN;
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(recaptchaKey), isTokenAutoRefreshEnabled: true });
}
export const db = app ? getFirestore(app) : null;

if (db && useEmulators) {
  connectFirestoreEmulator(db, '127.0.0.1', Number(env.VITE_FIRESTORE_EMULATOR_PORT || 8080));
}
