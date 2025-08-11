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
