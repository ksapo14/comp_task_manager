# Deployment

The recommended production layout is:

```text
Vercel (React/Vite) -> Cloud Run (FastAPI) -> Firebase Auth + Firestore
                                            -> Google Calendar API
```

Supabase is not required. Firebase Authentication and Firestore already provide
the authentication and database layers.

## 1. Prepare Firebase

1. Create the Firebase project and web app using [FIREBASE_SETUP.md](FIREBASE_SETUP.md).
2. Enable Email/Password authentication.
3. Create the production Firestore database.
4. Deploy the checked-in rules:

   ```powershell
   npx firebase-tools login
   npx firebase-tools use YOUR_FIREBASE_PROJECT_ID
   npx firebase-tools deploy --only firestore:rules
   ```

## 2. Deploy the frontend to Vercel

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, select **Add New → Project** and import the repository.
3. Keep the repository root as the Vercel root directory. The checked-in
   `vercel.json` installs the frontend dependencies, builds Vite, publishes
   `frontend/dist`, and enables React Router deep links.
4. Add these Vercel environment variables for Production:

   ```text
   VITE_FIREBASE_API_KEY
   VITE_FIREBASE_AUTH_DOMAIN
   VITE_FIREBASE_PROJECT_ID
   VITE_FIREBASE_STORAGE_BUCKET
   VITE_FIREBASE_MESSAGING_SENDER_ID
   VITE_FIREBASE_APP_ID
   ```

5. Deploy once and note the stable production URL, such as
   `https://compass-example.vercel.app`. API calls will fail until the backend
   and `VITE_API_URL` are configured below.

Do not put `GOOGLE_CLIENT_SECRET` or `OAUTH_STATE_SECRET` in Vercel. Variables
prefixed with `VITE_` are compiled into the public browser bundle.

## 3. Deploy FastAPI to Cloud Run

Use the same Google Cloud project that backs Firebase. Install the Google Cloud
CLI, authenticate, and enable the required services:

```powershell
gcloud auth login
gcloud config set project YOUR_FIREBASE_PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
```

If Google Calendar is enabled, create two Secret Manager secrets in the Google
Cloud console:

- `compass-google-client-secret`: the OAuth web client secret.
- `compass-oauth-state-secret`: a random value generated with
  `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

Grant the Cloud Run service identity **Secret Manager Secret Accessor** for
those secrets. Then deploy from the repository root, replacing every
placeholder and using the Vercel production origin without a trailing slash:

```powershell
gcloud run deploy compass-api `
  --source backend `
  --region us-east1 `
  --allow-unauthenticated `
  --set-env-vars "CORS_ORIGINS=https://YOUR_APP.vercel.app,FRONTEND_URL=https://YOUR_APP.vercel.app,VITE_FIREBASE_PROJECT_ID=YOUR_FIREBASE_PROJECT_ID,VITE_FIREBASE_API_KEY=YOUR_FIREBASE_WEB_API_KEY,GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID,GOOGLE_REDIRECT_URI=https://YOUR_APP.vercel.app/settings" `
  --set-secrets "GOOGLE_CLIENT_SECRET=compass-google-client-secret:1,OAUTH_STATE_SECRET=compass-oauth-state-secret:1"
```

The service must allow unauthenticated network invocation because browsers call
it directly. Application endpoints still validate Firebase bearer tokens.
Cloud Run builds `backend/Dockerfile`, injects `PORT`, and can scale to zero.

Google Calendar is optional. To deploy without it, omit `GOOGLE_CLIENT_ID`,
`GOOGLE_REDIRECT_URI`, and `--set-secrets`.

After deployment, copy the Cloud Run service URL and verify:

```powershell
Invoke-RestMethod https://YOUR_CLOUD_RUN_URL/api/health
```

The response should be `{"status":"ok"}`.

## 4. Connect Vercel to Cloud Run

In **Vercel → Project Settings → Environment Variables**, add:

```text
VITE_API_URL=https://YOUR_CLOUD_RUN_URL
```

Do not add a trailing slash. Redeploy the Production deployment because Vite
environment variables are embedded at build time.

For a custom frontend domain, replace the Vercel URL in `CORS_ORIGINS`,
`FRONTEND_URL`, `GOOGLE_REDIRECT_URI`, Firebase authorized domains, and the
Google OAuth redirect URI, then deploy both services again.

## 5. Authorize the production domains

### Firebase Authentication

Open **Firebase Console → Authentication → Settings → Authorized domains** and
add the Vercel production hostname:

```text
YOUR_APP.vercel.app
```

### Google Calendar

1. Enable the Google Calendar API in the Google Cloud project.
2. Configure the OAuth consent screen. While it is in Testing mode, add every
   Google account that should use the app as a test user.
3. Create or edit a **Web application** OAuth client.
4. Add this exact authorized redirect URI:

   ```text
   https://YOUR_APP.vercel.app/settings
   ```

The scheme, hostname, path, and trailing slash must exactly match
`GOOGLE_REDIRECT_URI`.

## 6. Production smoke test

1. Open the Vercel URL in a private browser window.
2. Create an account and add a task.
3. Refresh and confirm the task remains.
4. Open Settings, connect Google Calendar, and run Sync twice.
5. Confirm the second sync does not create another event.
6. Check Cloud Run logs if a request fails:

   ```powershell
   gcloud run services logs read compass-api --region us-east1 --limit 100
   ```

Vercel preview URLs are dynamic. They are not included in production CORS,
Firebase authorized domains, or Google OAuth redirect URIs by default. Use a
fixed staging domain if preview deployments need a working backend and OAuth.
