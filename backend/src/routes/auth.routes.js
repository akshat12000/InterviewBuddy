const express = require('express');
const { register, login, me, logout } = require('../controllers/auth.controller');
const { auth } = require('../utils/auth');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', auth, me);
router.post('/logout', auth, logout);

module.exports = router;
