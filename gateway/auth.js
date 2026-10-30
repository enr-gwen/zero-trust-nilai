const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('./db');

const router = express.Router();

const ACCESS_TTL = '10m';
const REFRESH_TTL_SEC = 24 * 60 * 60; // 1 hari

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

// POST /auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const deviceId = req.get('X-Device-ID');

  if (!username || !password || !deviceId) {
    return res.status(400).json({ error: 'username, password, dan X-Device-ID wajib' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Kredensial tidak valid' });
  }

  const device = db
    .prepare('SELECT 1 FROM devices WHERE user_id = ? AND device_id = ?')
    .get(user.id, deviceId);
  if (!device) {
    return res.status(403).json({ error: 'Device tidak terdaftar' });
  }

  const accessToken = jwt.sign(
    { sub: String(user.id), role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );

  const refreshToken = crypto.randomBytes(32).toString('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + REFRESH_TTL_SEC;
  db.prepare(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)'
  ).run(user.id, sha256(refreshToken), expiresAt);

  res.json({ access_token: accessToken, refresh_token: refreshToken, expires_in: 600 });
});


// POST /auth/refresh
router.post('/refresh', (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token wajib' });
  }

  const row = db
    .prepare(
      `SELECT rt.id, rt.revoked, rt.expires_at, u.id AS user_id, u.role
       FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = ?`
    )
    .get(sha256(refresh_token));

  if (!row) return res.status(401).json({ error: 'Refresh token tidak dikenal' });
  if (row.revoked) return res.status(401).json({ error: 'Refresh token sudah dicabut' });
  if (row.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(401).json({ error: 'Refresh token kedaluwarsa' });
  }

  const accessToken = jwt.sign(
    { sub: String(row.user_id), role: row.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TTL }
  );
  res.json({ access_token: accessToken, expires_in: 600 });
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token wajib' });
  }

  const result = db
    .prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?')
    .run(sha256(refresh_token));

  if (result.changes === 0) {
    return res.status(401).json({ error: 'Refresh token tidak dikenal' });
  }
  res.json({ message: 'Logout berhasil, refresh token dicabut' });
});


// POST /auth/service -> token untuk Service Nilai (5 menit, role: service)
router.post('/service', (req, res) => {
  const { client_id, client_secret } = req.body || {};
  if (!client_id || !client_secret) {
    return res.status(400).json({ error: 'client_id dan client_secret wajib' });
  }

  const client = db
    .prepare('SELECT * FROM service_clients WHERE client_id = ?')
    .get(client_id);
  if (!client || !bcrypt.compareSync(client_secret, client.secret_hash)) {
    return res.status(401).json({ error: 'Client ID atau secret tidak valid' });
  }

  const token = jwt.sign(
    { sub: client.client_id, role: 'service' },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
  res.json({ access_token: token, expires_in: 300 });
});

module.exports = router;
