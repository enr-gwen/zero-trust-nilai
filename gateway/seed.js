const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// DB bersama untuk semua service
const dbDir = path.join(__dirname, '..', 'db');
fs.mkdirSync(dbDir, { recursive: true });
const dbPath = path.join(dbDir, 'nilai.sqlite');
if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath); // reset tiap seed

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nama TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nim TEXT UNIQUE            -- hanya terisi untuk mahasiswa
);

CREATE TABLE devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  device_id TEXT NOT NULL,
  UNIQUE (user_id, device_id)
);

CREATE TABLE kelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode TEXT NOT NULL,
  nama TEXT NOT NULL,
  dosen_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE nilai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mahasiswa_id INTEGER NOT NULL REFERENCES users(id),
  kelas_id INTEGER NOT NULL REFERENCES kelas(id),
  nilai_angka REAL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  UNIQUE (mahasiswa_id, kelas_id)
);

CREATE TABLE transkrip (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nim TEXT NOT NULL,
  kelas_id INTEGER NOT NULL REFERENCES kelas(id),
  nilai_angka REAL NOT NULL,
  UNIQUE (nim, kelas_id)
);

CREATE TABLE refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,   -- epoch detik
  revoked INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE service_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT UNIQUE NOT NULL,
  secret_hash TEXT NOT NULL,
  nama TEXT NOT NULL
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  waktu TEXT NOT NULL,
  subjek TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  device TEXT,
  hasil TEXT NOT NULL CHECK (hasil IN ('allow','deny')),
  alasan TEXT NOT NULL
);
`);

const hash = (s) => bcrypt.hashSync(s, 10);
const PASSWORD = 'password123';

const addUser = db.prepare(
  'INSERT INTO users (username, password_hash, nama, role, nim) VALUES (?,?,?,?,?)'
);
const addDevice = db.prepare('INSERT INTO devices (user_id, device_id) VALUES (?,?)');

function user(username, nama, role, nim, deviceId) {
  const id = addUser.run(username, hash(PASSWORD), nama, role, nim).lastInsertRowid;
  addDevice.run(id, deviceId);
  return Number(id);
}

// 1 admin, 2 dosen, 3 mahasiswa (masing-masing 1 device)
const admin  = user('admin',  'Admin Prodi',    'admin',     null,      'DEV-ADMIN-01');
const dosen1 = user('dosen1', 'Dr. Budi',       'dosen',     null,      'DEV-DOSEN1-01');
const dosen2 = user('dosen2', 'Dr. Sari',       'dosen',     null,      'DEV-DOSEN2-01');
const mhs1   = user('mhs1',   'Andi Pratama',   'mahasiswa', '2210001', 'DEV-MHS1-01');
const mhs2   = user('mhs2',   'Citra Lestari',  'mahasiswa', '2210002', 'DEV-MHS2-01');
const mhs3   = user('mhs3',   'Dewi Anggraini', 'mahasiswa', '2210003', 'DEV-MHS3-01');

// 2 kelas, diampu dosen berbeda
const addKelas = db.prepare('INSERT INTO kelas (kode, nama, dosen_id) VALUES (?,?,?)');
const kelas1 = Number(addKelas.run('KP70065004', 'Keamanan Informasi', dosen1).lastInsertRowid);
const kelas2 = Number(addKelas.run('KP70065001', 'Basis Data', dosen2).lastInsertRowid);

// nilai: tiap mahasiswa ikut kedua kelas
const addNilai = db.prepare(
  'INSERT INTO nilai (mahasiswa_id, kelas_id, nilai_angka, status) VALUES (?,?,?,?)'
);
addNilai.run(mhs1, kelas1, 80, 'draft');
addNilai.run(mhs2, kelas1, 75, 'draft');
addNilai.run(mhs3, kelas1, 90, 'draft');
addNilai.run(mhs1, kelas2, 85, 'draft');
addNilai.run(mhs2, kelas2, 70, 'draft');
addNilai.run(mhs3, kelas2, 88, 'final'); // sengaja final, buat tes "nilai sudah final ditolak"

// client untuk Service Nilai (dipakai di /auth/service)
db.prepare('INSERT INTO service_clients (client_id, secret_hash, nama) VALUES (?,?,?)')
  .run('service-nilai', hash('service-nilai-secret'), 'Service Nilai');

console.log('Seed selesai:', dbPath);
