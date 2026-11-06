import { initializeApp } from 'firebase/app';
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
export const db = app ? getFirestore(app) : null;

if (db && useEmulators) {
  connectFirestoreEmulator(db, '127.0.0.1', Number(env.VITE_FIRESTORE_EMULATOR_PORT || 8080));
}
