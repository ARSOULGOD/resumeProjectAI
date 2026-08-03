# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Two independent npm projects — `Backend/` and `Frontend/` (note the capitals). There is no root `package.json`, so install and run each separately. Neither has a `start` script; both use `npm run dev`.

```bash
# Backend — http://localhost:3000 (nodemon, auto-restart)
cd Backend && npm install && npm run dev

# Frontend — http://localhost:5173
cd Frontend && npm install && npm run dev
cd Frontend && npm run build     # production build (vite)
cd Frontend && npm run lint      # eslint (flat config, ignores dist/)
cd Frontend && npm run preview   # serve the built bundle
```

No test framework is set up anywhere. `Backend`'s `npm test` is the placeholder that exits 1; `Frontend` has no test script at all. Do not claim test coverage — verify changes with `npm run lint` and `npm run build`, and say plainly when something is unverified at runtime.

### Environment

`Backend/.env` must define `MONGO_URI`, `JWT_SECRET`, `AI_API_KEY` (Google Gemini). Optional: `PORT` (defaults to 3000), `FRONTEND_URL` (defaults to `http://localhost:5173` — this is the CORS origin, see below).

`Frontend` reads `VITE_API_URL` (defaults to `http://localhost:3000`) in both `auth.api.js` and `interview.api.js`.

`AI_API_KEY` is read at *module load* — `ai.service.js` constructs `GoogleGenAI` at import time, so requiring any module in its dependency chain without the key set throws immediately. This makes the backend unrequireable in scratch scripts unless you pass a dummy key.

`Backend/.gitignore` covers `/.env` and `/node_modules`. `Frontend/.gitignore` exists. There is no root `.gitignore`.

## Architecture

AI interview-prep app. A user uploads a resume PDF plus a job description; Gemini returns a structured fit report (match score, technical + behavioral questions, skill gaps, day-by-day prep plan) that is persisted and rendered as a study dashboard. A second Gemini call rewrites the user's resume as LaTeX and compiles it to a downloadable PDF.

**Backend** (Express 5, CommonJS, Mongoose): `server.js` calls `connectToDB()` then `app.listen`; `src/app.js` mounts `/api/auth` and `/api/interview`. Layering is `routes → middlewares → controllers → services/models`.

Note that `connectToDB` catches its own connection error and only logs it, so the server starts and serves 500s rather than failing fast when Mongo is unreachable.

**Frontend** (React 19, Vite, react-router 7, SCSS): feature-sliced under `src/features/<feature>/` with a fixed internal shape — `<feature>.context.jsx` (state only), `hooks/use<Feature>.js` (all logic + effects), `services/*.api.js` (axios), `pages/`, `style/`. Contexts hold nothing but `useState` pairs; every behavior lives in the hook. Providers are nested in `App.jsx`, routes are declared in `app.routes.jsx`.

### Cross-cutting conventions

**Auth is cookie-based, not header-based.** Controllers set a `token` cookie holding a 1-day JWT; every axios instance uses `withCredentials: true`, and `app.js` pins CORS to `FRONTEND_URL` with `credentials: true`. Changing the frontend port requires updating that origin or cookie auth silently breaks. Logout does not just clear the cookie — it inserts the token into the `blacklistTokens` collection, and `middlewares/auth.middleware.js` checks that collection *before* verifying the signature. Any new auth path must go through `authMiddleware.authUser` to respect revocation.

**Route protection is client-side via `<Protected>`**, which calls `GET /api/auth/get-me` through `useAuth` and redirects to `/login` on failure. `useAuth` runs its `getMe` effect on mount in every component that calls the hook, so mounting it in several places causes duplicate requests. `auth.context.jsx` starts `loading: true`, which is what prevents a redirect flash on first paint.

**The AI contract is schema-driven.** `services/ai.service.js` defines the report shape once as a Zod object with `.describe()` on every field — those descriptions are the actual prompt for each field — then passes `zodToJsonSchema(...)` as Gemini's `responseSchema` with `responseMimeType: "application/json"`, and returns `JSON.parse(response.text)`. Model id is `gemini-3-flash-preview` for both calls.

The report shape is defined in **three** places that must be kept in sync:

1. the Zod schema in `services/ai.service.js` (what the AI returns),
2. the Mongoose sub-schemas in `models/interviewReport.model.js` (what is stored),
3. the fields read by `features/interview/pages/Interview.jsx` and `pages/Home.jsx` (what is rendered).

They are currently **in agreement** on `matchScore`, `title`, `technicalQuestions`, `behavioralQuestions`, `skillGaps` (`skill` + `severity`), and `preparationPlan` (`day`, `focus`, `tasks`). This three-way duplication remains the main source of breakage in this codebase — when changing report content, edit all three.

`getAllInterviewReportsController` projects most of the report away, leaving `_id`, `title`, `matchScore`, `user`, and timestamps — covering exactly what `Home.jsx`'s recent-reports list reads. Adding a field to that list means widening the `.select()`.

**Resume uploads are never written to disk.** `middlewares/file.middleware.js` uses multer memory storage (3 MB cap) and the controller hands `req.file.buffer` straight to `pdf-parse`.

**Resume PDF generation shells out to LaTeX.** `generateResumePdf` reads `Backend/base_resume.tex`, asks Gemini to return the tailored document as an array of lines, writes a temp `.tex` into `Backend/`, and runs `./tectonic <file>.tex` with `cwd` set to `Backend/`. `Backend/tectonic` is a committed 60 MB Linux x86-64 binary, so this path **only works on Linux x86-64** — it will fail to exec on macOS and Windows. Temp files are cleaned up in both the success and failure branches.

**Frontend error handling goes through the context, not exceptions.** The interview feature carries an `error` string in `interview.context.jsx`; `useInterview` clears it at the start of each call and sets it in every `catch`, and guarantees the invariant that **exactly one of `report` / `error` is populated after a fetch** — a 2xx carrying no report is deliberately thrown into its own catch so no screen can hang on a spinner. Consumers branch on `loading` → `error` → data, and callers must not assume a returned value exists (`Home.jsx` guards `if (!data?._id) return` before navigating). Follow this pattern for new async work. `useAuth` predates it and still swallows errors in empty `catch` blocks with no error channel — worth aligning if you touch it.

Because axios is configured with `responseType: "blob"` for the PDF download, error bodies on that route arrive as an opaque `Blob`; `useInterview`'s `toErrorMessage` helper reads it back as text before extracting `message`.

## Known issues

Verify against the code before assuming any of these is still true.

- **`generateInterViewReportController` requires a resume file.** It dereferences `req.file.buffer` unconditionally, so submitting without a PDF throws — but `Home.jsx` tells the user "Either a **Resume** or a **Self Description** is required." Either the controller needs to branch on `req.file` or the UI copy is wrong.
- **Upload limits are misadvertised.** `Home.jsx` says "PDF or DOCX (Max 5MB)"; multer caps at 3 MB and `pdf-parse` cannot read DOCX.
- **No Express error handler.** Controllers are `async` with no try/catch. Express 5 does forward rejected promises to its default handler, so failures return a 500 with an HTML body rather than `{ message }` — the frontend's message extraction therefore falls back to its generic strings on any thrown backend error.
- **Cookie flags are unset.** `res.cookie("token", token)` sets no `httpOnly`, `sameSite`, or `secure`, so the JWT is readable from JS and will not survive a cross-site deployment.
- **The token blacklist grows without bound.** `blacklistTokens` has no TTL index, so rows outlive the 1-day JWTs they revoke.
- **`getMeController` assumes the user still exists** — `findById` then `user._id` throws if the account was deleted while a valid token was live.
- **`puppeteer` (^24) is a declared dependency and imported at `ai.service.js:4` but never used** — the PDF path went to tectonic. It costs a full Chromium download on every `npm install`.
- **Duplicate fetch on the interview page.** `useInterview`'s own effect fires `getReportById` on mount, and `Interview.jsx` fires it again, so every visit to `/interview/:id` issues two identical requests. The page-level effect is the redundant one.
- **`Frontend/README.md` is still the stock Vite template**, alongside the real root `README.md`.
- **`npm run lint` is not clean:** 13 errors / 3 warnings. All 13 errors are pre-existing and concentrated in the auth feature (empty `catch` blocks and unused `err` bindings in `useAuth.js` and `auth.api.js`) plus the two `react-refresh/only-export-components` errors from the context files exporting both a context and a provider. Treat the current count as the baseline — check that your change does not raise it rather than expecting zero.
