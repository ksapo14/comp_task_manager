# Repository Guidelines

## Project Structure & Module Organization

The application is split into `frontend/` (React, TypeScript, Vite, Tailwind, and Firebase Auth) and `backend/` (FastAPI plus Firestore REST). Frontend pages live in `frontend/src/pages/`; shared UI, hooks, state, and API code use adjacent folders. Backend routers live in `backend/app/routers/`, with schemas, Firestore encoding, and scheduling logic in `backend/app/`. Tests are in `frontend/src/test/` and `backend/tests/`. Firebase Security Rules live in `firestore.rules`.

Do not edit `.git/`, `.codex/`, or `.agent-run/`; these contain repository or local agent metadata.

## Build, Test, and Development Commands

Install all dependencies with `npm run install:all`, configure `.env` from `.env.example`, then run both apps with `npm run dev`. Other checks are:

```text
npm test        # Backend pytest suite, then frontend Vitest suite
npm run lint    # TypeScript type checking
npm run build   # Production frontend build
```

## Coding Style & Naming Conventions

Use four spaces in Python and two in TypeScript/TSX. Keep Python names `snake_case`, React components `PascalCase`, hooks `useCamelCase`, and other TypeScript identifiers `camelCase`. Prefer typed functional components and Pydantic schemas at API boundaries. Keep lines near 100 characters where practical.

## Testing Guidelines

Pytest uses an in-memory Firestore adapter for API and scheduler tests. Vitest and Testing Library cover UI behavior. Name Python files `test_*.py` and frontend files `*.test.tsx`. Tests must never contact a real Firebase project; mock Firebase, Google APIs, and other external services.

## Commit & Pull Request Guidelines

History currently contains only `Initial commit`, so no established commit convention exists. Use short, imperative subjects, optionally scoped, for example `feat(tasks): add task validation`.

Pull requests should include a concise summary, rationale, test evidence, and linked issues. Include screenshots for visible UI changes and call out migrations, configuration changes, or follow-up work. Keep each pull request focused and avoid mixing unrelated refactors.

## Security & Configuration

Never commit secrets or local environment files. Provide sanitized examples such as `.env.example`, document required variables, and use safe development defaults.
