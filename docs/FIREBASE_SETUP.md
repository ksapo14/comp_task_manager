# Firebase Setup

## 1. Create the project

1. Open the [Firebase console](https://console.firebase.google.com/).
2. Select **Add project**, create the project, and open it.
3. Open **Project settings → General**.
4. Under **Your apps**, add a Web app named `Compass`.
5. Copy the values from the displayed `firebaseConfig` object into `.env`:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

These web configuration values identify the Firebase project; they are not service-account secrets.

## 2. Enable Authentication

1. Open **Build → Authentication → Get started**.
2. Open **Sign-in method**.
3. Select **Email/Password**, enable it, and save.
4. Under **Settings → Authorized domains**, confirm `localhost` is present.

## 3. Create Firestore

1. Open **Build → Firestore Database → Create database**.
2. Choose **Production mode** and select a region near your users.
3. Open the **Rules** tab.
4. Replace the editor contents with [firestore.rules](../firestore.rules).
5. Click **Publish**.

The rules allow access only when the Firebase token UID matches the UID in the document path.

## 4. Configure the API

Keep these local URLs in `.env`:

```env
CORS_ORIGINS=http://localhost:5173
FRONTEND_URL=http://localhost:5173
```

FastAPI uses the same `VITE_FIREBASE_API_KEY` and `VITE_FIREBASE_PROJECT_ID`; there is no second server credential.

## 5. Verify

Run `npm run check:firebase` first. It validates the environment, API key, and
Email/Password provider without creating a user. Then run `npm run dev`, create
a new account, and add a task. Confirm the Firebase console shows:

```text
users/{firebaseUid}
users/{firebaseUid}/tasks/{taskId}
```

For local-only testing, configure the optional emulator variables from `.env.example` and run the Firebase Emulator Suite separately.
