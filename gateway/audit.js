const db = require('./db');

const insert = db.prepare(
  `INSERT INTO audit_log (waktu, subjek, endpoint, device, hasil, alasan)
   VALUES (?,?,?,?,?,?)`
);

// subjek: objek req.subject (boleh null kalau token gagal diverifikasi)
function catat({ subject, method, path, device, hasil, alasan }) {
  let subjek = 'anonim';
  if (subject) {
    subjek = subject.type === 'service'
      ? `service:${subject.id}`
      : `user:${subject.id}(${subject.role})`;
  }
  insert.run(
    new Date().toISOString(),
    subjek,
    `${method} ${path}`,
    device || null,
    hasil,
    alasan
  );
}

module.exports = { catat };
