# Architecture

## Authentication

Firebase Authentication owns passwords, account creation, browser persistence, and token refresh. The React client sends its current Firebase ID token as a bearer token. FastAPI validates it through Firebase Auth and uses the returned UID as the sole user identity.

## Data model

Cloud Firestore stores a profile at `users/{uid}`. Courses, tasks, habits, journals, focus links, and external events are subcollections below that document. Firestore Security Rules require `request.auth.uid == uid`; FastAPI also constructs every path from the validated UID rather than request data.

## API and scheduling

The typed FastAPI API remains the application boundary. Its Firestore REST adapter forwards each user's Firebase token, so Firestore evaluates Security Rules normally. The scheduler loads that user's tasks, courses, and external events, excludes locked time, and persists selected task times back to Firestore.

## Integrations

Google Calendar credentials live in the protected user profile. OAuth state is short-lived and held only in server memory. A multi-instance production deployment should move OAuth state to a shared expiring store.

