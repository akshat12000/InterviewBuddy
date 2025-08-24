# InterviewApp Backend (MERN)

MVP backend for a two-person live interview platform with video, shared problem, collaborative editor, and interviewer scoring.

## Features
- Auth (register/login/me) with JWT cookies
- Users: profiles, past interviews, ratings
- Problems: CRUD (create for interviewer), list and get
- Sessions: schedule, go live, code snapshots, interviewer scoring, final decision
- Socket.IO: room join/leave, WebRTC signaling, code updates, problem selection

## Env
Copy `.env.example` to `.env` and set values.

## Run
- Dev: `npm run dev`
- Prod: `npm start`

## Health
GET `/health` => `{ ok: true }`

## Code Execution (`/api/execute`)
- POST `/api/execute` — Runs code via Piston. Auth required.
- Body (JSON): `{ language: string, code: string, stdin?: string }`
- Output: `{ ok: true, output: string, raw: object }` on success.

Limits and protection
- Payload caps: `code` ≤ 50k chars, `stdin` ≤ 10k chars (413 if exceeded).
- Rate limits (express-rate-limit): per‑user and per‑IP windows (HTTP 429 on burst).
- Execution timeouts: ~15s per request; runtimes discovery ~10s.

Config (env)
- `PISTON_BASE_URL` (default `https://emkc.org/api/v2/piston`)
- `EXECUTE_MAX_CODE_CHARS` (default `50000`), `EXECUTE_MAX_STDIN_CHARS` (default `10000`)
- `EXECUTE_IP_WINDOW_MS`/`EXECUTE_IP_MAX` (default `60000`/`30`)
- `EXECUTE_USER_WINDOW_MS`/`EXECUTE_USER_MAX` (default `60000`/`20`)

Runtime cache & fallback
- Runtimes list cached in‑memory for 5 minutes and persisted to `backend/.cache/piston_runtimes.json`.
- Cache is warmed at server start; if Piston is down, disk cache is used.
- If no network and no disk cache, controller falls back to safe default versions per language.
- Behind a proxy/CDN, set `app.set('trust proxy', 1)` to make IP rate limiting accurate.
