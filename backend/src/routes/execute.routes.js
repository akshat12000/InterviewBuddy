const router = require('express').Router();
const { executeCode } = require('../controllers/execute.controller');
const { auth } = require('../utils/auth');

// Authenticated execution to avoid abuse; rate-limiting could be added if needed
router.post('/', auth, executeCode);

module.exports = router;
