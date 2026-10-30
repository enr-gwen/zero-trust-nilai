const jwt = require('jsonwebtoken');

// 1) cek X-Gateway-Secret  2) verifikasi ulang JWT (tanda tangan + masa berlaku)
module.exports = function guard(req, res, next) {
  if (req.get('X-Gateway-Secret') !== process.env.GATEWAY_SECRET) {
    return res.status(403).json({ error: 'Ditolak: X-Gateway-Secret tidak valid' });
  }

  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Ditolak: access token tidak ada' });
  }

  try {
    req.auth = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Ditolak: token tidak valid atau kedaluwarsa' });
  }
};
