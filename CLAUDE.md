# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Two independent npm projects; there is no root `package.json`, so install and run each separately.

```bash
# Backend — http://localhost:3000 (nodemon, auto-restart)
cd backend && npm install && npm start

# Frontend — http://localhost:5173
cd FrontEnd && npm install && npm run dev
cd FrontEnd && npm run build     # production build
cd FrontEnd && npm run lint      # eslint (flat config, ignores dist/)
```

No test framework is set up. `backend`'s `npm test` is the placeholder that exits 1.

`backend/.env` must define `MONGO_URI`, `JWT_SECRET`, `AI_API_KEY` (Google Gemini). `PORT` is optional (defaults to 3000).

Note: `backend/` has no `.gitignore`, so `.env` and `node_modules` are not excluded there.

## Architecture

AI interview-prep app. A user uploads a resume PDF plus a job description; Gemini returns a structured fit report (score, technical + behavioral questions, skill gaps, day-by-day prep plan) that is persisted and rendered as a study dashboard.

**Backend** (Express 5, CommonJS, Mongoose): `server.js` connects Mongo then starts `src/app.js`, which mounts `/api/auth` and `/api/interview`. Layering is `routes → middlewares → controllers → services/models`.

**Frontend** (React 19, Vite, react-router 7, SCSS): feature-sliced under `src/features/<feature>/` with a fixed internal shape — `<feature>.context.jsx` (state only), `hooks/use<Feature>.js` (all logic + effects), `services/*.api.js` (axios), `pages/`, `style/`. Contexts hold nothing but `useState` pairs; every behavior lives in the hook. Providers are nested in `App.jsx`, routes are declared in `app.routes.jsx`.

### Cross-cutting conventions

**Auth is cookie-based, not header-based.** Controllers set a `token` cookie holding a 1-day JWT; every axios instance uses `withCredentials: true`, and `app.js` pins CORS to `http://localhost:5173` with `credentials: true`. Changing the frontend port requires updating that origin. Logout does not just clear the cookie — it inserts the token into the `tokenBlackList` collection, and `middlewares/authMiddleware.js` checks that collection *before* verifying the signature. Any new auth path must go through this middleware to respect revocation.

**Route protection is client-side via `<Protected>`**, which calls `GET /api/auth/get-me` through `useAuth` and redirects to `/login` on failure. Because `useAuth` runs its `getMe` effect on mount in every component that calls the hook, mounting it in several places causes duplicate requests.

**The AI contract is schema-driven.** `services/aiService.js` defines the report shape once as a Zod object with `.describe()` on every field — those descriptions are the actual prompt for each field — then passes `zodToJsonSchema(...)` as Gemini's `responseSchema` with `responseMimeType: "application/json"`. To change report content, edit the Zod schema; then keep the Mongoose sub-schemas in `models/interviewReport.js` and the fields read by `features/interview/pages/Interview.jsx` in sync. These three definitions of the report shape are the main source of breakage in this codebase.

**Resume files are never written to disk.** `middlewares/fileMiddleware.js` uses multer memory storage (3 MB cap) and the controller hands `req.file.buffer` straight to `pdf-parse`.

## Known broken contracts

The frontend is built ahead of the backend; the interview flow does not currently run end to end. Verify against the code before assuming any of these is still true.

- `routes/interviewRoutes.js` requires `../middleware/authMiddleware` (directory is `middlewares`), references `upload` and `interviewController` without importing them, and exports `{ interviewRouter }` while `app.js` uses the module itself as middleware.
- `interviewController.js` defines `generateInterViewReportController` but exports `generateInterviewReportController`.
- `aiService.generateInterviewReport` returns `response.text` (a JSON string) and the controller spreads it as if it were an object — it needs `JSON.parse`.
- Field-name drift: controller sends `resume` where the service destructures `resumeText`; the model stores `score`/`skillGap` while `Interview.jsx` reads `matchScore`/`skillGaps`; the model's skill-gap sub-schema omits the `reason` the AI returns.
- `features/interview/services/interview.api.js` calls three endpoints that have no route: `GET /api/interview/`, `GET /api/interview/report/:id`, `POST /api/interview/resume/pdf/:id`.
- `aiService.js` requests `gemini-3.5-flash`, which is not a real model ID.
