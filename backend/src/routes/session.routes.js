const express = require('express');
const { auth, requireRole } = require('../utils/auth');
const { createSession, getSession, updateStatus, addScore, finalizeDecision, addCodeSnapshot, listMySessions } = require('../controllers/session.controller');

const router = express.Router();

router.post('/', auth, requireRole('interviewer'), createSession);
router.get('/:id', auth, getSession);
router.get('/', auth, listMySessions);
router.patch('/:id/status', auth, updateStatus);
router.post('/:id/score', auth, requireRole('interviewer'), addScore);
router.post('/:id/decision', auth, requireRole('interviewer'), finalizeDecision);
router.post('/:id/code', auth, addCodeSnapshot);

module.exports = router;
