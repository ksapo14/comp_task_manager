# Compass

A focused productivity dashboard for computer science students. Compass combines courses, tasks, habits, smart scheduling, deep-work sessions, Google Calendar, and a Markdown developer journal.

## Stack

- React, TypeScript, Vite, Tailwind CSS, Zustand, and Firebase Authentication
- FastAPI and Pydantic
- Cloud Firestore through authenticated REST requests and Security Rules
- Google Calendar OAuth2 integration

## Local setup

Prerequisites: Node.js 20+, Python 3.12+, and a Firebase project.

1. Follow [docs/FIREBASE_SETUP.md](docs/FIREBASE_SETUP.md).
2. Copy `.env.example` to `.env` and enter the Firebase web configuration values.
3. Install and run:

```powershell
npm run install:all
npm run dev
```

Open `http://localhost:5173`. API documentation is at `http://localhost:8000/docs`.

No local database, service-account JSON, or database password is required. The browser obtains a Firebase ID token; FastAPI validates that session and forwards the token to Firestore. Firestore Security Rules enforce that users can access only `users/{theirUid}` and its subcollections.

## Quality checks

```powershell
npm test
npm run check:firebase
npm run lint
npm run build
```

Google Calendar is optional. Add the `GOOGLE_*` variables and
`OAUTH_STATE_SECRET` from `.env.example` after Firebase is working.

## Deployment

Use Vercel for the React frontend and Cloud Run for the containerized FastAPI
backend. Firebase remains the authentication and database provider, so no
Supabase migration is needed. Follow [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
