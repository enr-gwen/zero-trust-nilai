require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(require('./guard'));

// GET /transkrip/:nim -> daftar nilai final milik satu mahasiswa
app.get('/transkrip/:nim', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.nim, k.kode, k.nama AS mata_kuliah, t.nilai_angka
       FROM transkrip t JOIN kelas k ON k.id = t.kelas_id
       WHERE t.nim = ?`
    )
    .all(req.params.nim);
  res.json({ nim: req.params.nim, transkrip: rows });
});

// POST /transkrip/sinkron -> terima data nilai final dari Service Nilai
// body: { "data": [ { "nim": "2210001", "kelas_id": 1, "nilai_angka": 80 } ] }
app.post('/transkrip/sinkron', (req, res) => {
  const data = (req.body || {}).data;
  if (!Array.isArray(data) || data.length === 0) {
    return res.status(400).json({ error: 'data (array) wajib' });
  }

  const upsert = db.prepare(
    `INSERT INTO transkrip (nim, kelas_id, nilai_angka) VALUES (?,?,?)
     ON CONFLICT (nim, kelas_id) DO UPDATE SET nilai_angka = excluded.nilai_angka`
  );
  const tx = db.transaction((items) => {
    for (const d of items) upsert.run(d.nim, d.kelas_id, d.nilai_angka);
  });
  tx(data);

  res.json({ message: 'Sinkron berhasil', jumlah: data.length });
});

// bind ke 127.0.0.1 supaya tidak bisa diakses dari luar komputer ini
app.listen(3002, '127.0.0.1', () => console.log('Service Transkrip jalan di port 3002'));
