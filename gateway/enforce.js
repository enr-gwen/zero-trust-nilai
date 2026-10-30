const { decide } = require('./policy');
const { catat } = require('./audit');

// Minta keputusan ke Policy Engine, catat ke audit log, lalu allow/deny
module.exports = function enforce(req, res, next) {
  const decision = decide(req.subject, req.method, req.path);
  req.decision = decision;

  catat({
    subject: req.subject, method: req.method, path: req.path,
    device: req.subject.device, hasil: decision.allow ? 'allow' : 'deny',
    alasan: decision.reason,
  });

  if (!decision.allow) {
    return res.status(403).json({ error: 'Ditolak oleh kebijakan', alasan: decision.reason });
  }

  // Pembatasan data pada GET /nilai: query dari client ditimpa identitas dari token
  if (req.method === 'GET' && req.path === '/nilai') {
    const params = new URLSearchParams();
    if (req.subject.role === 'mahasiswa') params.set('mahasiswa_id', req.subject.id);
    if (req.subject.role === 'dosen') params.set('dosen_id', req.subject.id);
    req.url = '/nilai?' + params.toString();
  }

  next();
};
