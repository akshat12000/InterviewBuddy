require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const sessionRoutes = require('./src/routes/session.routes');
const problemRoutes = require('./src/routes/problem.routes');
const executeRoutes = require('./src/routes/execute.routes');
const articleRoutes = require('./src/routes/article.routes');
const { warmRuntimeCache } = require('./src/controllers/execute.controller');

const { authSocketMiddleware } = require('./src/socket/authSocket');
const { registerSessionHandlers } = require('./src/socket/sessionSocket');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const ALLOW_ALL_ORIGINS = process.env.ALLOW_ALL_ORIGINS === 'true';
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:5174,http://localhost:4000,http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:4000';
const ORIGINS = new Set(CLIENT_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean));
// Auto-allow Render external URL if present (helps single-URL deploys)
if (process.env.RENDER_EXTERNAL_URL) {
	try {
		const u = new URL(process.env.RENDER_EXTERNAL_URL);
		ORIGINS.add(`${u.protocol}//${u.host}`);
	} catch {}
}

function isAllowedOrigin(origin) {
	if (ALLOW_ALL_ORIGINS) return true;
	if (!origin) return true; // same-origin/no CORS
	if (ORIGINS.has(origin)) return true;
	try {
		const u = new URL(origin);
		const isLocalhost = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
		if (isLocalhost && (u.protocol === 'http:' || u.protocol === 'https:')) return true;
	} catch {}
	return false;
}

// Socket.IO setup
const io = new Server(server, {
	cors: {
		origin(origin, callback) {
			if (isAllowedOrigin(origin)) return callback(null, true);
			return callback(new Error('Not allowed by CORS'), false);
		},
		credentials: true,
	},
});

io.use(authSocketMiddleware);
io.on('connection', (socket) => {
	registerSessionHandlers(io, socket);
});

// Middlewares
app.use(cors({
	origin(origin, callback) {
		if (isAllowedOrigin(origin)) return callback(null, true);
		return callback(new Error('Not allowed by CORS'));
	},
	credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Health
app.get('/health', (req, res) => {
	res.json({ ok: true, ts: Date.now() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/problems', problemRoutes);
app.use('/api/execute', executeRoutes);
app.use('/api/articles', articleRoutes);

// Serve frontend (static) if built
const distPath = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(distPath)) {
	app.use(express.static(distPath));
	// SPA fallback for non-API, non-health, non-socket paths (Express v5 compatible)
	app.get(/^\/(?!api|health|socket\.io).*/, (req, res) => {
		res.sendFile(path.join(distPath, 'index.html'));
	});
}

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
	console.error('Error:', err);
	res.status(err.status || 500).json({ message: err.message || 'Server error' });
});

// Connect DB and start server
async function start() {
	const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/interview_app';
	await mongoose.connect(mongoUri);
	// Warm Piston runtime cache in background; do not block startup
	warmRuntimeCache().catch(() => {});
	server.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

start().catch((e) => {
	console.error('Failed to start server', e);
	process.exit(1);
});
