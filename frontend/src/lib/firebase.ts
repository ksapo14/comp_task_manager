import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "not-configured",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "not-configured",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "not-configured",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "not-configured",
};

export const firebaseConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID &&
    import.meta.env.VITE_FIREBASE_APP_ID,
);

const firebaseApp = initializeApp(config);
export const firebaseAuth = getAuth(firebaseApp);

const emulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
if (emulatorHost && !(globalThis as { __compassAuthEmulator?: boolean }).__compassAuthEmulator) {
  connectAuthEmulator(firebaseAuth, `http://${emulatorHost}`, {
    disableWarnings: true,
  });
  (globalThis as { __compassAuthEmulator?: boolean }).__compassAuthEmulator = true;
}

