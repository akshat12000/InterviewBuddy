const jwt = require('jsonwebtoken');

exports.auth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = req.cookies.token || (header && header.startsWith('Bearer ') ? header.slice(7) : null);
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
};

exports.requireRole = (role) => (req, res, next) => {
  if (req.user?.role !== role) return res.status(403).json({ message: 'Forbidden' });
  next();
};
