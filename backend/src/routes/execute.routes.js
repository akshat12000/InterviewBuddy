const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { executeCode } = require('../controllers/execute.controller');
const { auth } = require('../utils/auth');

// Payload caps (fast checks before controller)
const MAX_CODE_CHARS = parseInt(process.env.EXECUTE_MAX_CODE_CHARS || '50000', 10); // ~50KB chars
const MAX_STDIN_CHARS = parseInt(process.env.EXECUTE_MAX_STDIN_CHARS || '10000', 10); // ~10KB chars
function payloadCap(req, res, next) {
	try {
		const { code, stdin } = req.body || {};
		if (typeof code === 'string' && code.length > MAX_CODE_CHARS) {
			return res.status(413).json({ message: 'Code payload too large' });
		}
		if (typeof stdin === 'string' && stdin.length > MAX_STDIN_CHARS) {
			return res.status(413).json({ message: 'stdin payload too large' });
		}
		return next();
	} catch (e) {
		return res.status(400).json({ message: 'Invalid payload' });
	}
}

// Per-IP limiter
const ipLimiter = rateLimit({
	windowMs: parseInt(process.env.EXECUTE_IP_WINDOW_MS || '60000', 10),
	max: parseInt(process.env.EXECUTE_IP_MAX || '30', 10),
	standardHeaders: true,
	legacyHeaders: false,
	message: { message: 'Too many requests from this IP, please try again later.' },
	keyGenerator: (req) => req.ip,
});

// Per-user limiter (applied after auth so req.user is set)
const userLimiter = rateLimit({
	windowMs: parseInt(process.env.EXECUTE_USER_WINDOW_MS || '60000', 10),
	max: parseInt(process.env.EXECUTE_USER_MAX || '20', 10),
	standardHeaders: true,
	legacyHeaders: false,
	message: { message: 'Too many requests for this user, please slow down.' },
	keyGenerator: (req) => (req.user?.uid ? `u:${req.user.uid}` : `ip:${req.ip}`),
});

// Auth gate + dual limiter + payload cap
router.post('/', auth, userLimiter, ipLimiter, payloadCap, executeCode);

module.exports = router;
