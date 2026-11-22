# R2 satu bucket - keputusan Owner 21 November 2026

Kode mendukung bucket terpisah maupun satu bucket dengan prefix terpisah.
Kebijakan satu bucket publik disetujui Owner: tautan objek dapat dibuka tanpa
login jika diketahui. API tetap memeriksa permission/site untuk pembukaan
lampiran kandidat melalui aplikasi; Turnstile dan rate limit tetap berlaku.
Tidak ada pengubahan R2, environment rahasia, database atau objek otomatis.

## Konfigurasi tujuan baru

```dotenv
R2_BUCKET_NAME=rsia-live
R2_KEY_PREFIX=hris-rsia/
R2_PUBLIC_BASE_URL=https://assets.example.com
RECRUITMENT_R2_BUCKET_NAME=rsia-live
RECRUITMENT_R2_KEY_PREFIX=hris-rsia-recruitment/
```

Base URL menunjuk root domain bucket, tanpa nama bucket atau folder.
Account ID tetap untuk akun yang sama; API key harus memiliki Object Read &
Write pada bucket baru. Tidak perlu membuat folder kosong secara manual.
Folder muncul saat objek diupload. Prefix tidak boleh sama atau saling
bersarang pada bucket bersama. Bucket rekrutmen tetap wajib diisi eksplisit.

## Langkah dashboard dan cutover

1. Buka bucket `rsia-live` > Settings > Custom Domains > Add. Hubungkan
   subdomain aset yang diinginkan dan tunggu status aktif. Public Development
   URL (`pub-....r2.dev`) dapat dipakai untuk tes sementara; Cloudflare tidak
   merekomendasikannya untuk production. Jika custom domain aktif, r2.dev
   tidak wajib diaktifkan. S3 API URL bukan public base URL aplikasi.
2. Pastikan token aplikasi berizin Object Read & Write pada `rsia-live`.
   Ganti access key/secret hanya jika token lama tidak menjangkau bucket baru.
3. Salin objek lama sebelum mengganti environment. Untuk file utama,
   pertahankan object key persis seperti `files.storage_path`; jangan membuat
   folder ganda `hris-rsia/hris-rsia/...`. Jangan hapus bucket lama dahulu.
4. Jika sudah ada kandidat/objek Rekrutmen, pertahankan prefix Rekrutmen lama
   pada environment dan copy object key persis sama ke bucket baru. Contoh
   legacy: `hris-rsia-private/recruitment/`. Folder lama itu boleh berdampingan
   dengan `hris-rsia/` pada bucket yang sama. Jangan langsung mengganti prefix
   menjadi `hris-rsia-recruitment/`: pembacaan internal memeriksa prefix dan
   path database lama tetap menunjuk lokasi lama. Mengganti folder historis
   membutuhkan rencana pemetaan object key + metadata DB terpisah oleh Owner.
   Jika belum ada objek kandidat lama, pakai folder tujuan baru di atas.
5. Deploy kode pendukung terlebih dahulu sebelum menyamakan nama bucket.
   Kemudian ubah environment lokal/server ke tujuan yang sudah disiapkan,
   restart/redeploy aplikasi. `.env` lokal tidak mengganti environment live.
6. Verifikasi satu foto/dokumen lama, satu lampiran kandidat lama, upload
   baru, pembukaan lampiran via akun HR, dan konversi kandidat. Pada
   production pastikan Turnstile masih berjalan. Gunakan data uji yang
   diizinkan Owner; tes nyata ini belum dilakukan oleh perubahan kode.

Tidak perlu migrasi schema untuk dukungan bucket bersama. Penyamaan nama
bucket tidak otomatis menyalin objek ataupun memperbarui path database.

Verifikasi kode: 59 tes rekrutmen pada 7 file lulus dengan environment dummy
dan mock DB/storage. Pengujian mencakup bucket bersama/terpisah, prefix
bertabrakan/tidak valid, dan Turnstile production tetap fail-closed.
