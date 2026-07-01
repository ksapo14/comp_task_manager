import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const firebaseKeys = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "..", "");
  const define = Object.fromEntries(
    firebaseKeys.map((key) => [
      `import.meta.env.${key}`,
      JSON.stringify(env[key] ?? ""),
    ]),
  );

  return {
    plugins: [react()],
    envDir: "..",
    define,
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8000",
      },
    },
  };
});

