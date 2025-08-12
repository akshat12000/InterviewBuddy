# Multi-stage build: build frontend, install backend, serve both from one Node image

FROM node:20-alpine AS backend_deps
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev || npm ci

FROM node:20-alpine AS frontend_build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
# backend source and deps
COPY backend ./backend
COPY --from=backend_deps /app/backend/node_modules ./backend/node_modules
# static frontend
COPY --from=frontend_build /app/frontend/dist ./frontend/dist

EXPOSE 4000
CMD ["node", "backend/server.js"]
