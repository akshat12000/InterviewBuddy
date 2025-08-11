const express = require('express');
const { auth, requireRole } = require('../utils/auth');
const { getProfile, updateProfile, getMyInterviews, findByEmail } = require('../controllers/user.controller');

const router = express.Router();

router.get('/me', auth, getProfile);
router.put('/me', auth, updateProfile);
router.get('/me/interviews', auth, getMyInterviews);
router.get('/by-email', auth, requireRole('interviewer'), findByEmail);

module.exports = router;
