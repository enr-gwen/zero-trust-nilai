#!/bin/bash
# Tes skenario zero trust. Jalankan dengan data fresh (node seed.js).
GW=http://localhost:3000
PASS=0; FAIL=0

login() {
  curl -s -X POST $GW/auth/login -H "Content-Type: application/json" \
    -H "X-Device-ID: $3" -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
    | node -pe "JSON.parse(require('fs').readFileSync(0)).access_token"
}

# cek <nama> <status-http-yang-diharapkan> <curl args...>
cek() {
  local nama="$1" harap="$2"; shift 2
  local kode
  kode=$(curl -s -o /dev/null -w "%{http_code}" "$@")
  if [ "$kode" = "$harap" ]; then
    echo "PASS  [$kode] $nama"; PASS=$((PASS+1))
  else
    echo "FAIL  [$kode, harap $harap] $nama"; FAIL=$((FAIL+1))
  fi
}

MHS1=$(login mhs1 password123 DEV-MHS1-01)
DOSEN1=$(login dosen1 password123 DEV-DOSEN1-01)
DOSEN2=$(login dosen2 password123 DEV-DOSEN2-01)
ADMIN=$(login admin password123 DEV-ADMIN-01)
SECRET=$(grep '^GATEWAY_SECRET=' .env | cut -d= -f2)

H() { echo -H "Authorization: Bearer $1" -H "X-Device-ID: $2"; }

echo "=== 1. Autentikasi ==="
cek "login benar" 200 -X POST $GW/auth/login -H "Content-Type: application/json" -H "X-Device-ID: DEV-MHS1-01" -d '{"username":"mhs1","password":"password123"}'
cek "login password salah" 401 -X POST $GW/auth/login -H "Content-Type: application/json" -H "X-Device-ID: DEV-MHS1-01" -d '{"username":"mhs1","password":"salah"}'
cek "login device tidak terdaftar" 403 -X POST $GW/auth/login -H "Content-Type: application/json" -H "X-Device-ID: DEV-ASAL" -d '{"username":"mhs1","password":"password123"}'
cek "service token client salah" 401 -X POST $GW/auth/service -H "Content-Type: application/json" -d '{"client_id":"service-nilai","client_secret":"salah"}'

echo "=== 2. Gateway sebagai satu-satunya pintu ==="
cek "akses langsung service nilai (3001) tanpa secret" 403 http://localhost:3001/nilai
cek "akses langsung service transkrip (3002) tanpa secret" 403 http://localhost:3002/transkrip/2210001
cek "pakai secret tapi tanpa token" 401 http://localhost:3001/nilai -H "X-Gateway-Secret: $SECRET"
cek "lewat gateway tanpa token" 401 $GW/nilai
cek "token palsu" 401 $GW/nilai -H "Authorization: Bearer abc.def.ghi" -H "X-Device-ID: DEV-MHS1-01"

echo "=== 3. Konteks: device ==="
cek "token valid, device salah" 403 $GW/nilai -H "Authorization: Bearer $MHS1" -H "X-Device-ID: DEV-ASAL"
cek "token valid, tanpa X-Device-ID" 403 $GW/nilai -H "Authorization: Bearer $MHS1"
cek "device milik user lain" 403 $GW/nilai -H "Authorization: Bearer $MHS1" -H "X-Device-ID: DEV-MHS2-01"

echo "=== 4. Kebijakan akses ==="
cek "mhs1 lihat nilai (allow)" 200 $GW/nilai -H "Authorization: Bearer $MHS1" -H "X-Device-ID: DEV-MHS1-01"
cek "admin lihat nilai (deny)" 403 $GW/nilai -H "Authorization: Bearer $ADMIN" -H "X-Device-ID: DEV-ADMIN-01"
cek "mhs1 lihat transkrip sendiri" 200 $GW/transkrip/2210001 -H "Authorization: Bearer $MHS1" -H "X-Device-ID: DEV-MHS1-01"
cek "mhs1 lihat transkrip orang lain" 403 $GW/transkrip/2210002 -H "Authorization: Bearer $MHS1" -H "X-Device-ID: DEV-MHS1-01"
cek "admin lihat transkrip siapa saja" 200 $GW/transkrip/2210002 -H "Authorization: Bearer $ADMIN" -H "X-Device-ID: DEV-ADMIN-01"
cek "dosen lihat transkrip (deny)" 403 $GW/transkrip/2210001 -H "Authorization: Bearer $DOSEN1" -H "X-Device-ID: DEV-DOSEN1-01"
cek "mhs ubah nilai (deny)" 403 -X PUT $GW/nilai/1 -H "Authorization: Bearer $MHS1" -H "X-Device-ID: DEV-MHS1-01" -H "Content-Type: application/json" -d '{"nilai_angka":100}'
cek "dosen1 ubah nilai kelasnya (allow)" 200 -X PUT $GW/nilai/1 -H "Authorization: Bearer $DOSEN1" -H "X-Device-ID: DEV-DOSEN1-01" -H "Content-Type: application/json" -d '{"nilai_angka":85}'
cek "dosen1 ubah nilai kelas dosen2 (deny)" 403 -X PUT $GW/nilai/4 -H "Authorization: Bearer $DOSEN1" -H "X-Device-ID: DEV-DOSEN1-01" -H "Content-Type: application/json" -d '{"nilai_angka":99}'
cek "dosen1 ubah nilai final (deny)" 403 -X PUT $GW/nilai/6 -H "Authorization: Bearer $DOSEN2" -H "X-Device-ID: DEV-DOSEN2-01" -H "Content-Type: application/json" -d '{"nilai_angka":99}'
cek "dosen1 finalisasi kelas dosen2 (deny)" 403 -X POST $GW/kelas/2/finalisasi -H "Authorization: Bearer $DOSEN1" -H "X-Device-ID: DEV-DOSEN1-01"

echo "=== 5. Token user ke sinkron ==="
cek "token dosen ke /transkrip/sinkron (deny)" 403 -X POST $GW/transkrip/sinkron -H "Authorization: Bearer $DOSEN1" -H "X-Device-ID: DEV-DOSEN1-01" -H "Content-Type: application/json" -d '{"data":[]}'
cek "token admin ke /transkrip/sinkron (deny)" 403 -X POST $GW/transkrip/sinkron -H "Authorization: Bearer $ADMIN" -H "X-Device-ID: DEV-ADMIN-01" -H "Content-Type: application/json" -d '{"data":[]}'

echo "=== 6. Finalisasi + sinkron antar-service ==="
cek "dosen1 finalisasi kelas 1 (allow)" 200 -X POST $GW/kelas/1/finalisasi -H "Authorization: Bearer $DOSEN1" -H "X-Device-ID: DEV-DOSEN1-01"
cek "setelah final, ubah nilai (deny)" 403 -X PUT $GW/nilai/1 -H "Authorization: Bearer $DOSEN1" -H "X-Device-ID: DEV-DOSEN1-01" -H "Content-Type: application/json" -d '{"nilai_angka":99}'
cek "transkrip mhs1 sudah terisi" 200 $GW/transkrip/2210001 -H "Authorization: Bearer $MHS1" -H "X-Device-ID: DEV-MHS1-01"

echo "=== 7. Logout ==="
RES=$(curl -s -X POST $GW/auth/login -H "Content-Type: application/json" -H "X-Device-ID: DEV-MHS1-01" -d '{"username":"mhs1","password":"password123"}')
RT=$(echo "$RES" | node -pe "JSON.parse(require('fs').readFileSync(0)).refresh_token")
cek "refresh sebelum logout" 200 -X POST $GW/auth/refresh -H "Content-Type: application/json" -d "{\"refresh_token\":\"$RT\"}"
cek "logout" 200 -X POST $GW/auth/logout -H "Content-Type: application/json" -d "{\"refresh_token\":\"$RT\"}"
cek "refresh setelah logout (deny)" 401 -X POST $GW/auth/refresh -H "Content-Type: application/json" -d "{\"refresh_token\":\"$RT\"}"

echo
echo "HASIL: $PASS PASS, $FAIL FAIL"
