# InterviewBuddy — InterviewApp (MERN) V1

An interview platform for organizing coding interviews with live video, a shared problem, and a collaborative code editor.

An MVP for a live coding interview platform with:
- Two roles: interviewer and candidate
- Live video call (WebRTC) with signaling via Socket.IO
- Shared problem and collaborative code editor (Monaco)
- Interviewer-only scoring and final decision that updates candidate profile and rating

## Stack
- Backend: Node.js, Express, MongoDB/Mongoose, Socket.IO, JWT (cookies), Zod
- Frontend: React + Vite + TypeScript, Monaco editor, Socket.IO client, SWR

## Develop
- Backend
  - copy `backend/.env.example` to `backend/.env` and adjust
  - `cd backend`
  - `npm install`
  - `npm run dev`
  - (optional) `npm run seed`
- Frontend
  - `cd frontend`
  - `npm install`
  - `npm run dev`

Open http://localhost:5173 and http://localhost:4000/health.

## Default users (seed)
- interviewer@example.com / password
- candidate@example.com / password

## Notes
- Only JavaScript is runnable in-browser in this MVP. Other languages can be added with a sandboxed runner.
- For production, add TURN servers for reliable WebRTC and harden CORS/cookies.
