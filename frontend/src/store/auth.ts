import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { create } from "zustand";

import { api } from "../lib/api";
import { firebaseAuth, firebaseConfigured } from "../lib/firebase";
import type { User } from "../types";

const AUTO_SYNC_INTERVAL_MS = 15 * 60 * 1000;
const GOOGLE_SYNC_KEY = "compass:google-last-sync:";
let autoSyncInProgress = false;

interface AuthState {
  user: User | null;
  initializing: boolean;
  restore: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

function configurationError() {
  if (!firebaseConfigured) {
    throw new Error("Firebase is not configured. Add the VITE_FIREBASE_* values to .env.");
  }
}

function readableFirebaseError(reason: unknown): Error {
  const code =
    typeof reason === "object" && reason && "code" in reason
      ? String(reason.code)
      : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/weak-password": "Use a stronger password with at least six characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/network-request-failed": "Firebase Authentication is unreachable.",
  };
  return new Error(messages[code] || "Unable to authenticate with Firebase.");
}

async function loadProfile(): Promise<User> {
  return api<User>("/auth/me");
}

export function recordGoogleCalendarSync(userId: string) {
  window.localStorage.setItem(`${GOOGLE_SYNC_KEY}${userId}`, String(Date.now()));
}

async function autoSyncGoogleCalendar(userId: string) {
  const lastSync = Number(window.localStorage.getItem(`${GOOGLE_SYNC_KEY}${userId}`));
  const justConnected =
    new URLSearchParams(window.location.search).get("google") === "connected";
  if (
    autoSyncInProgress ||
    (!justConnected &&
      Number.isFinite(lastSync) &&
      Date.now() - lastSync < AUTO_SYNC_INTERVAL_MS)
  ) {
    return;
  }
  autoSyncInProgress = true;
  recordGoogleCalendarSync(userId);
  try {
    const status = await api<{ connected: boolean }>("/google/status");
    if (status.connected) {
      await api("/google/sync", { method: "POST" });
      window.dispatchEvent(new Event("compass:calendar-synced"));
    }
  } catch {
    window.localStorage.removeItem(`${GOOGLE_SYNC_KEY}${userId}`);
    // Calendar sync is best-effort and must not block authentication.
  } finally {
    autoSyncInProgress = false;
  }
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  initializing: true,
  restore: async () => {
    if (!firebaseConfigured) {
      set({ user: null, initializing: false });
      return;
    }
    await new Promise<void>((resolve) => {
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (firebaseUser) => {
        unsubscribe();
        if (!firebaseUser) {
          set({ user: null, initializing: false });
          resolve();
          return;
        }
        try {
          set({ user: await loadProfile(), initializing: false });
          void autoSyncGoogleCalendar(firebaseUser.uid);
        } catch {
          await signOut(firebaseAuth);
          set({ user: null, initializing: false });
        }
        resolve();
      });
    });
  },
  login: async (email, password) => {
    configurationError();
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      set({ user: await loadProfile() });
      void autoSyncGoogleCalendar(credential.user.uid);
    } catch (reason) {
      await signOut(firebaseAuth);
      throw readableFirebaseError(reason);
    }
  },
  signup: async (email, password) => {
    configurationError();
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      set({ user: await loadProfile() });
      void autoSyncGoogleCalendar(credential.user.uid);
    } catch (reason) {
      await signOut(firebaseAuth);
      throw readableFirebaseError(reason);
    }
  },
  logout: () => {
    void signOut(firebaseAuth);
    set({ user: null });
  },
  setUser: (user) => set({ user }),
}));
