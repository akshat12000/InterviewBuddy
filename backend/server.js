require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const { Server } = require('socket.io');

const authRoutes = require('./src/routes/auth.routes');
const userRoutes = require('./src/routes/user.routes');
const sessionRoutes = require('./src/routes/session.routes');
const problemRoutes = require('./src/routes/problem.routes');

const { authSocketMiddleware } = require('./src/socket/authSocket');
const { registerSessionHandlers } = require('./src/socket/sessionSocket');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:5174';
const ORIGINS = CLIENT_ORIGIN.split(',').map((s) => s.trim());

// Socket.IO setup
const io = new Server(server, {
	cors: {
		origin: ORIGINS,
		credentials: true,
	},
});

io.use(authSocketMiddleware);
io.on('connection', (socket) => {
	registerSessionHandlers(io, socket);
});

// Middlewares
app.use(cors({
	origin: function (origin, callback) {
		if (!origin) return callback(null, true);
		if (ORIGINS.includes(origin)) return callback(null, true);
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
	server.listen(PORT, () => console.log(`API listening on http://localhost:${PORT}`));
}

start().catch((e) => {
	console.error('Failed to start server', e);
	process.exit(1);
});
