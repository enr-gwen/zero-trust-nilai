const jwt = require('jsonwebtoken');
const db = require('./db');
const { catat } = require('./audit');

// Verifikasi access token + device terdaftar. Hasil: req.subject
module.exports = function verify(req, res, next) {
  const deviceHeader = req.get('X-Device-ID');
  const tolak = (status, pesan, subject) => {
    catat({
      subject, method: req.method, path: req.originalUrl.split('?')[0],
      device: deviceHeader, hasil: 'deny', alasan: pesan,
    });
    return res.status(status).json({ error: pesan });
  };

  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return tolak(401, 'Access token tidak ada');
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return tolak(401, 'Token tidak valid atau kedaluwarsa');
  }

  // Token service (role: service) tidak punya device, jadi dilewati
  if (payload.role === 'service') {
    req.subject = { type: 'service', id: payload.sub, role: 'service' };
    return next();
  }

  const userSubject = { type: 'user', id: Number(payload.sub), role: payload.role };
  if (!deviceHeader) {
    return tolak(403, 'X-Device-ID wajib', userSubject);
  }
  const device = db
    .prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?')
    .get(userSubject.id, deviceHeader);
  if (!device) {
    return tolak(403, 'Device tidak terdaftar', userSubject);
  }

  req.subject = { ...userSubject, device: deviceHeader };
  next();
};
