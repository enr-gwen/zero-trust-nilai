require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(require('./guard'));

// GET /nilai
app.get('/nilai', (req, res) => {
  const { mahasiswa_id, kelas_id, dosen_id } = req.query;
  let sql = `SELECT n.id, n.mahasiswa_id, u.nama AS mahasiswa, u.nim,
                    n.kelas_id, k.nama AS kelas, n.nilai_angka, n.status
             FROM nilai n
             JOIN users u ON u.id = n.mahasiswa_id
             JOIN kelas k ON k.id = n.kelas_id
             WHERE 1=1`;
  const params = [];
  if (mahasiswa_id) { sql += ' AND n.mahasiswa_id = ?'; params.push(mahasiswa_id); }
  if (kelas_id) { sql += ' AND n.kelas_id = ?'; params.push(kelas_id); }
  if (dosen_id) { sql += ' AND k.dosen_id = ?'; params.push(dosen_id); }
  res.json(db.prepare(sql).all(...params));
});

// PUT /nilai/:id
app.put('/nilai/:id', (req, res) => {
  const { nilai_angka } = req.body || {};
  if (typeof nilai_angka !== 'number') {
    return res.status(400).json({ error: 'nilai_angka (angka) wajib' });
  }
  const r = db.prepare('UPDATE nilai SET nilai_angka = ? WHERE id = ?')
    .run(nilai_angka, req.params.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Nilai tidak ditemukan' });
  res.json({ message: 'Nilai diubah', id: Number(req.params.id), nilai_angka });
});

// Ambil token service dari gateway (client ID + secret)
async function ambilTokenService() {
  const r = await fetch(`${process.env.GATEWAY_URL}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SERVICE_CLIENT_ID,
      client_secret: process.env.SERVICE_CLIENT_SECRET,
    }),
  });
  if (!r.ok) throw new Error(`token service gagal (${r.status})`);
  return (await r.json()).access_token;
}

// POST /kelas/:id/finalisasi -> final, lalu sinkron ke Transkrip LEWAT GATEWAY
app.post('/kelas/:id/finalisasi', async (req, res) => {
  const kelasId = Number(req.params.id);
  const draftIds = db
    .prepare("SELECT id FROM nilai WHERE kelas_id = ? AND status = 'draft'")
    .all(kelasId).map((r) => r.id);

  const setStatus = db.prepare('UPDATE nilai SET status = ? WHERE id = ?');
  db.transaction(() => draftIds.forEach((id) => setStatus.run('final', id)))();

  try {
    const data = db
      .prepare(
        `SELECT u.nim, n.kelas_id, n.nilai_angka FROM nilai n
         JOIN users u ON u.id = n.mahasiswa_id
         WHERE n.kelas_id = ? AND n.status = 'final' AND n.nilai_angka IS NOT NULL`
      )
      .all(kelasId);

    const token = await ambilTokenService();
    const r = await fetch(`${process.env.GATEWAY_URL}/transkrip/sinkron`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data }),
    });
    if (!r.ok) throw new Error(`sinkron ditolak (${r.status})`);

    res.json({ message: 'Finalisasi berhasil dan transkrip tersinkron', kelas_id: kelasId, jumlah: data.length });
  } catch (err) {
    // sinkron gagal -> kembalikan status ke draft
    db.transaction(() => draftIds.forEach((id) => setStatus.run('draft', id)))();
    res.status(502).json({ error: 'Finalisasi dibatalkan: ' + err.message });
  }
});

app.listen(3001, '127.0.0.1', () => console.log('Service Nilai jalan di port 3001'));
