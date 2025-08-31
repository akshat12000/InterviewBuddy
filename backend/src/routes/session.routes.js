const express = require('express');
const { auth, requireRole } = require('../utils/auth');
const { createSession, getSession, updateStatus, addScore, finalizeDecision, addCodeSnapshot, listMySessions, setProblem, getDefaultScoringTemplate, setDefaultScoringTemplate, exportSessionPdf } = require('../controllers/session.controller');

const router = express.Router();

router.post('/', auth, requireRole('interviewer'), createSession);
// Scoring template endpoints (keep before :id route to avoid shadowing)
router.get('/templates/default', auth, getDefaultScoringTemplate);
router.put('/templates/default', auth, requireRole('interviewer'), setDefaultScoringTemplate);
router.get('/', auth, listMySessions);
router.get('/:id', auth, getSession);
router.patch('/:id/status', auth, updateStatus);
router.patch('/:id/problem', auth, requireRole('interviewer'), setProblem);
router.post('/:id/score', auth, requireRole('interviewer'), addScore);
router.post('/:id/decision', auth, requireRole('interviewer'), finalizeDecision);
router.post('/:id/code', auth, addCodeSnapshot);
// Export PDF summary for a session
router.get('/:id/export/pdf', auth, exportSessionPdf);

module.exports = router;
