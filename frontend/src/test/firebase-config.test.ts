import { describe, expect, it } from "vitest";

import { firebaseConfigured } from "../lib/firebase";

describe("Firebase configuration", () => {
  it("loads every required Firebase value from the root .env", () => {
    const required = {
      VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY,
      VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      VITE_FIREBASE_STORAGE_BUCKET: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      VITE_FIREBASE_MESSAGING_SENDER_ID:
        import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      VITE_FIREBASE_APP_ID: import.meta.env.VITE_FIREBASE_APP_ID,
    };
    const missing = Object.entries(required)
      .filter(([, value]) => !value?.trim())
      .map(([key]) => key);

    expect(firebaseConfigured).toBe(missing.length === 0);
  });
});
