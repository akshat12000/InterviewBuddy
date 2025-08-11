const express = require('express');
const { auth, requireRole } = require('../utils/auth');
const { listProblems, createProblem, getProblem } = require('../controllers/problem.controller');

const router = express.Router();

router.get('/', auth, listProblems);
router.get('/:id', auth, getProblem);
router.post('/', auth, requireRole('interviewer'), createProblem);

module.exports = router;
