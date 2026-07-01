import { readFile } from "node:fs/promises";

const required = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

const source = await readFile(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const separator = line.indexOf("=");
      const key = line.slice(0, separator).trim();
      const value = line
        .slice(separator + 1)
        .trim()
        .replace(/^(['"])(.*)\1$/, "$2");
      return [key, value];
    }),
);

const missing = required.filter((key) => !env[key]);
if (missing.length) {
  console.error(`Missing Firebase variables: ${missing.join(", ")}`);
  process.exit(1);
}

const response = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(env.VITE_FIREBASE_API_KEY)}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `config-probe-${crypto.randomUUID()}@example.invalid`,
      password: "not-a-real-password",
      returnSecureToken: true,
    }),
  },
);
const payload = await response.json();
const result = payload?.error?.message;

if (response.status === 400 && result === "INVALID_LOGIN_CREDENTIALS") {
  console.log("Firebase configuration: valid");
  console.log("Email/Password authentication: enabled");
  process.exit(0);
}

console.error(`Firebase configuration check failed: ${result || response.status}`);
process.exit(1);

