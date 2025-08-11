const jwt = require('jsonwebtoken');

function authSocketMiddleware(socket, next) {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers['x-auth-token'];
    if (!token) return next(new Error('Unauthorized'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = payload; // { uid, role }
    next();
  } catch (e) {
    next(new Error('Unauthorized'));
  }
}

module.exports = { authSocketMiddleware };
