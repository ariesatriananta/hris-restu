# Penanganan sesi kedaluwarsa

Perbaikan 7 November 2026 berdasarkan audit pola request auth berulang.

- Respons 401 login memakai satu refresh bersamaan per tab. Satu request hanya
  boleh diulang sekali setelah refresh berhasil. Sesi perangkat yang invalid
  tidak memicu refresh login ataupun logout login.
- Refresh yang ditolak 401/403, atau request yang tetap 401 setelah refresh,
  menandai sesi lokal kedaluwarsa. Sesi memori dan localStorage langsung dihapus.
  Request modul berikutnya ditolak lokal sampai login baru berhasil; polling
  tidak terus mengirim request ke server.
- Penanganan error query mengarahkan ke login sekali, membatalkan query aktif,
  dan tidak memanggil endpoint sign-out otomatis untuk setiap error.
- Logout manual membersihkan sesi lokal sebelum menunggu server. Kegagalan
  sign-out tidak boleh meninggalkan sesi memori aktif. Refresh/logout memiliki
  timeout 15 detik; timeout ini tidak diterapkan pada ekspor/transaksi bisnis.
- Gangguan jaringan/5xx saat refresh diteruskan sebagai gangguan layanan,
  bukan bukti sesi invalid. Error database middleware auth juga diteruskan ke
  error handler sebagai error layanan; kegagalan verifikasi JWT tetap 401.
- Refresh yang selesai setelah logout tidak mengulang request modul lama.
  Pemulihan sesi pada route login tidak menghidupkan kembali sesi yang sudah
  ditandai kedaluwarsa selama halaman tersebut masih berjalan.

Tidak ada perubahan schema, kredensial, atau database live. Audit kode tidak
membuktikan besaran kontribusi bug terhadap lonjakan CPU server; korelasikan log
request, latency database, dan metrik resource sebelum/sesudah deployment.

Koordinasi refresh lintas tab dan rotasi refresh backend yang atomik belum
termasuk perubahan ini. Single-flight saat ini berlaku di dalam satu tab.
