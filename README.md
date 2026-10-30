# Sistem Nilai - Zero Trust Security

Tugas Praktikum Individu, Keamanan Informasi (KP70065004), Informatika Universitas Siliwangi.

API gateway sebagai Policy Enforcement Point (PEP) yang terpisah dari service, sesuai NIST SP 800-207.

## Arsitektur

- gateway (port 3000): satu-satunya pintu masuk. Berisi auth, verifikasi token + device, policy engine (policy.js), audit log, dan proxy.
- service-nilai (port 3001): data nilai dan kelas. Hanya menerima request dari gateway.
- service-transkrip (port 3002): data transkrip. Hanya menerima request dari gateway.
- db/nilai.sqlite: satu database SQLite bersama (dibuat oleh seed.js).

Alur request: client -> gateway (verify.js -> enforce.js/policy.js -> audit.js) -> proxy + X-Gateway-Secret -> service (guard.js).

## Prasyarat

Node.js 18 atau lebih baru, dan build tools (build-essential, python3) untuk better-sqlite3.

## Cara menjalankan

1. Install dependensi di tiap folder:

        cd gateway && npm install && cd ..
        cd service-nilai && npm install && cd ..
        cd service-transkrip && npm install && cd ..

2. Buat file .env dari contoh, lalu isi JWT_SECRET dan GATEWAY_SECRET dengan string acak:

        cp .env.example .env

3. Buat database dan data awal:

        cd gateway && node seed.js

4. Jalankan tiga server, masing-masing di terminal sendiri:

        cd service-transkrip && node index.js
        cd service-nilai && node index.js
        cd gateway && node index.js

5. Jalankan skenario tes otomatis (dari folder utama, data harus fresh):

        ./test.sh

Jam akses diatur lewat ACCESS_START dan ACCESS_END di .env (default 07:00-21:00). Restart gateway setelah mengubahnya.

## Akun data awal

Semua password: password123

| Username | Role | NIM | Device ID |
|---|---|---|---|
| admin | admin | - | DEV-ADMIN-01 |
| dosen1 | dosen (kelas Keamanan Informasi) | - | DEV-DOSEN1-01 |
| dosen2 | dosen (kelas Basis Data) | - | DEV-DOSEN2-01 |
| mhs1 | mahasiswa | 2210001 | DEV-MHS1-01 |
| mhs2 | mahasiswa | 2210002 | DEV-MHS2-01 |
| mhs3 | mahasiswa | 2210003 | DEV-MHS3-01 |

Service client: client_id service-nilai, secret service-nilai-secret.

Kelas: id 1 Keamanan Informasi (dosen1), id 2 Basis Data (dosen2). Nilai id 6 sudah berstatus final untuk tes penolakan ubah nilai final.

## Contoh pemakaian

Login (wajib header X-Device-ID):

    curl -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -H "X-Device-ID: DEV-MHS1-01" -d '{"username":"mhs1","password":"password123"}'

Akses endpoint (access token + device ID):

    curl http://localhost:3000/nilai -H "Authorization: Bearer <access_token>" -H "X-Device-ID: DEV-MHS1-01"

## Pemetaan kebutuhan ke kode

| Kebutuhan | Berkas |
|---|---|
| 4.1 Access token, refresh token, logout | gateway/auth.js |
| 4.1 Token service (/auth/service) | gateway/auth.js |
| 4.1 Gateway secret | gateway/index.js (kirim), service-*/guard.js (cek) |
| 4.1 Verifikasi ulang token di service | service-nilai/guard.js, service-transkrip/guard.js |
| 4.2 Kebijakan akses (Tabel 3) | gateway/policy.js, gateway/enforce.js |
| 4.3 Device terdaftar | gateway/verify.js, gateway/auth.js |
| 4.3 Jam akses | gateway/policy.js (dalamJamAkses), .env |
| 4.4 Audit log | gateway/audit.js (tabel audit_log) |
| Finalisasi dan sinkron antar-service via gateway | service-nilai/index.js |

## Melihat audit log

    cd gateway
    node -e "const D=require('better-sqlite3');const db=new D('../db/nilai.sqlite');console.table(db.prepare('select waktu,subjek,endpoint,device,hasil,alasan from audit_log order by id desc limit 20').all())"

Waktu dicatat dalam UTC.
