# InterviewBuddy — MERN Interview Platform (MVP)

A modern live coding interview platform with real‑time video, collaborative editor, problem sharing, chat, and interviewer scoring.

## Highlights
- Roles: interviewer and candidate with JWT auth (cookie) and profiles
- Live video via WebRTC, signaling over Socket.IO
- Collaborative Monaco editor with code snapshots per session
- Problem panel synced to room; interviewer can change problems
- Chat with names, participants list with “me” badge
- Media state sync: mic/camera toggles reflect on both sides with overlays
- Focus Editor mode: split view to maximize editor while keeping videos visible
- Interviewer score sheet and final decision stored with the session

## Tech Stack
- Backend: Node.js, Express, MongoDB/Mongoose, Socket.IO, JWT (cookies), Zod, dotenv, bcryptjs
- Frontend: React + Vite + TypeScript, @monaco-editor/react, Tailwind CSS, axios, socket.io-client, SWR, lucide-react

## Repo Layout
```
backend/
  server.js              # Express + Socket.IO entry
  package.json
frontend/
  src/
    pages/               # Login, Signup, Dashboard, SessionRoom
    auth/                # Auth context
  package.json
```

## Quick Start (Development)
1) Backend
- copy `backend/.env.example` to `backend/.env` and set values
- open a terminal:
  - `cd backend`
  - `npm install`
  - `npm run dev`
- Health check: http://localhost:4000/health (200 OK)

2) Frontend
- open another terminal:
  - `cd frontend`
  - `npm install`
  - `npm run dev`
- App: http://localhost:5173

Notes
- The frontend dev server proxies API and Socket.IO to the backend on port 4000.
- If 5173 is busy, Vite may start on 5174; backend CORS allows both.

## Seed Data (optional)
- Run `npm run seed` in `backend` to create sample users, problems, and sessions.
- Default users:
  - interviewer@example.com / password
  - candidate@example.com / password

## Using the App
1) Signup or login (role selection on signup).
2) Dashboard: create/join a session (room) and pick a problem.
3) In the room:
   - Videos: your and remote streams with mic/camera overlays and initials when off
   - Editor: collaborative Monaco; language selector (UI). JavaScript is runnable in‑browser
   - Problem: synced problem statement on the left
   - Chat: send messages; names are shown instead of raw IDs
   - Controls: Mute, Camera, Language, Run
   - Focus Editor: stacks videos vertically on the left and enlarges the editor
   - Score Sheet (interviewer only): sliders, notes, and final decision

## Focus Editor Behavior
- Default mode keeps videos side‑by‑side with controls and editor below.
- Focus mode splits center pane: videos stacked on the left, editor on the right; exit returns to default.
- Streams are rebound when layout toggles so video never goes black.

## Development Tips
- WebRTC: This MVP uses Google STUN only. For production, configure TURN for reliability.
- Editor run: Only JavaScript executes in a Web Worker. Other languages are selectable in UI but not executed yet.
- CORS/Socket.IO: Backend is configured to accept localhost dev origins; adjust for your environment.

## Troubleshooting
- Port in use (EADDRINUSE): another backend may be running on 4000; stop it or use the running instance.
- Socket proxy errors in dev: ensure the backend is running on 4000 and the frontend proxy targets it.
- Videos black after toggling views: streams are now rebound on layout change; if an issue persists, grant camera/mic permissions.
- Editor/controls cropped or page scrolling: the layout is constrained to the viewport; inner panes scroll independently.

## Roadmap
- Multi‑language execution (server sandbox/Judge0/Docker) with limits and timeouts
- TURN server integration and device selection UI
- Recording and transcripts, problem tagging/filters, richer analytics
- Improved tests, E2E coverage, and deployments

## License
MVP code for internal/testing use. Review and update before production deployment.
