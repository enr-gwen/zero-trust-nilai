const db = require('./db');

const allow = (reason) => ({ allow: true, reason });
const deny = (reason) => ({ allow: false, reason });

// Jam akses dari .env, format "HH:MM"
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
function dalamJamAkses() {
  const now = new Date();
  const menit = now.getHours() * 60 + now.getMinutes();
  return (
    menit >= toMinutes(process.env.ACCESS_START || '07:00') &&
    menit < toMinutes(process.env.ACCESS_END || '21:00')
  );
}

// subject: { type, id, role }  | method: 'GET'... | path: '/nilai/3' (tanpa query)
function decide(subject, method, path) {
  const { role } = subject;

  // GET /nilai -> mahasiswa & dosen (filter data dilakukan di Langkah 7c)
  if (method === 'GET' && path === '/nilai') {
    if (role === 'mahasiswa') return allow('Mahasiswa: hanya nilai miliknya');
    if (role === 'dosen') return allow('Dosen: hanya kelas yang diampu');
    return deny(`Role ${role} tidak boleh melihat nilai`);
  }

  // PUT /nilai/:id -> dosen pengampu, nilai belum final, dalam jam akses
  let m = path.match(/^\/nilai\/(\d+)$/);
  if (method === 'PUT' && m) {
    if (role !== 'dosen') return deny(`Role ${role} tidak boleh mengubah nilai`);
    const row = db
      .prepare(
        `SELECT n.status, k.dosen_id FROM nilai n
         JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?`
      )
      .get(Number(m[1]));
    if (!row) return deny('Nilai tidak ditemukan');
    if (row.dosen_id !== subject.id) return deny('Bukan dosen pengampu kelas ini');
    if (row.status === 'final') return deny('Nilai sudah final, tidak bisa diubah');
    if (!dalamJamAkses()) return deny('Di luar jam akses');
    return allow('Dosen pengampu, nilai belum final, dalam jam akses');
  }

  // POST /kelas/:id/finalisasi -> dosen pengampu, dalam jam akses
  m = path.match(/^\/kelas\/(\d+)\/finalisasi$/);
  if (method === 'POST' && m) {
    if (role !== 'dosen') return deny(`Role ${role} tidak boleh finalisasi`);
    const kelas = db.prepare('SELECT dosen_id FROM kelas WHERE id = ?').get(Number(m[1]));
    if (!kelas) return deny('Kelas tidak ditemukan');
    if (kelas.dosen_id !== subject.id) return deny('Bukan dosen pengampu kelas ini');
    if (!dalamJamAkses()) return deny('Di luar jam akses');
    return allow('Dosen pengampu, dalam jam akses');
  }

  // POST /transkrip/sinkron -> HANYA token service
  if (method === 'POST' && path === '/transkrip/sinkron') {
    if (subject.type === 'service') return allow('Token service valid');
    return deny('Hanya token service yang boleh sinkron transkrip');
  }

  // GET /transkrip/:nim -> mahasiswa (NIM sendiri), admin (semua)
  m = path.match(/^\/transkrip\/([^/]+)$/);
  if (method === 'GET' && m) {
    if (role === 'admin') return allow('Admin boleh melihat semua transkrip');
    if (role === 'mahasiswa') {
      const u = db.prepare('SELECT nim FROM users WHERE id = ?').get(subject.id);
      if (u && u.nim === m[1]) return allow('Mahasiswa melihat NIM sendiri');
      return deny('Mahasiswa hanya boleh melihat NIM sendiri');
    }
    return deny(`Role ${role} tidak boleh melihat transkrip`);
  }

  // default: tolak semua yang tidak terdaftar di kebijakan
  return deny('Tidak ada kebijakan yang mengizinkan (default deny)');
}

module.exports = { decide };
