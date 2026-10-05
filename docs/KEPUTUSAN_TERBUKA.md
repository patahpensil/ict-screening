# Keputusan Terbuka — Menunggu Pemilik Proyek

Dicatat: 6 Oktober 2026, dari audit kode terhadap `docs/PRD_MALOMO_FINAL.md`.

Hal-hal di bawah tidak dijawab oleh PRD, atau PRD bisa dibaca lebih dari satu cara. Engine **tidak** mengisi celah ini dengan angka buatan. Kolom "Perilaku saat ini" menjelaskan apa yang dijalankan sampai ada keputusan.

| # | Poin PRD | Pertanyaan | Perilaku saat ini |
|---|---|---|---|
| K-1 | Poin 5 | **Definisi Candle Range** untuk magnitude relatif (Candle Range / ATR14): High−Low, badan candle \|close−open\|, atau definisi lain? | Magnitude tidak dihitung; UI menampilkan "belum dinilai". |
| K-2 | Poin 5 | **Aturan label Displacement**: kombinasi structural close, magnitude, dan RVOL20 seperti apa yang diberi label kuat/lemah? Label apa saja yang dipakai? | Tidak diberi label. |
| K-3 | Poin 6 | **Batas regime Contraction / Normal / Expansion** dan rumus ATR Expansion (ATR14 dibanding apa, periode berapa, ambang berapa)? | Tidak diklasifikasikan. Baris "ATR dibanding candle sebelumnya" dihapus karena nilainya hampir selalu ≈1 dan tidak bermakna sebagai ATR Expansion. |
| K-4 | Poin 2 | **Rumus Trend Efficiency** (mis. efficiency ratio: perubahan bersih ÷ jumlah perubahan absolut, periode berapa)? | Hanya teks deskriptif: bias, fase, jumlah swing internal. |
| K-5 | Poin 7.3 | **Batas akhir "swing internal yang terbentuk selama pengujian zona"**: apakah swing yang terbentuk setelah harga meninggalkan zona masih sah sebagai acuan validasi entry? Kalau tidak, kapan pengujian zona dianggap selesai? | Swing sah jika terbentuk sejak candle pertama yang menyentuh zona, tanpa batas akhir, sampai validasi terjadi. Setelah validasi, sentuhan zona berikutnya dibaca sebagai pengujian baru. |
| K-6 | Poin 3.5 + 4 | **Protected low/high boleh bergeser keluar dari protected lama?** Setelah sweep wick di bawah protected low (close tetap di atas), lalu breakout struktural, PRD 3.5 memilih swing low terendah dalam leg, yang ternyata adalah swing sweep (lebih rendah dari protected lama). | Mengikuti PRD 3.5 secara harfiah: swing sweep menjadi protected low baru. Sebelumnya engine macet dan tidak mencatat breakout sama sekali. |
| K-7 | Poin 3.5 | **Break tanpa swing asal yang sudah terkonfirmasi pada candle break.** Swing asal yang terbentuk tepat sebelum break baru terkonfirmasi 1–2 candle sesudahnya. Apakah boleh ditunggu? | Mengikuti kata "sudah dikonfirmasi" dan aturan README: breakout tercatat, protected tetap memakai yang lama. Swing yang terkonfirmasi sesudah break tidak dipakai. |
| K-8 | — | **Tombol mode Intraday dan Swing** menjalankan aturan PRD yang sama sehingga hasilnya identik. Digabung menjadi satu tombol, atau dibedakan (dengan aturan apa)? | Keduanya menjalankan scan yang sama. |
| K-9 | — | **Masa berlaku rencana ARMED** (sudah tervalidasi, menunggu harga kembali ke entry). Perlu batas waktu? | Tanpa batas waktu. Rencana gugur (void) jika scan terbaru yang berhasil membaca pair itu tidak lagi menghasilkan plan yang sama. Posisi RUNNING hanya keluar lewat SL/TP. |

## Catatan operasional (bukan keputusan strategi)

- **Akses Binance dari jaringan Indonesia.** Pada audit 6 Okt 2026, koneksi dari PC pemilik ke `fapi.binance.com` gagal dengan "certificate has expired" dan WebSocket juga gagal. Pola ini menunjukkan koneksi diblokir atau dibelokkan jaringan. Aplikasi berjalan sepenuhnya di browser pengguna, jadi pengguna di jaringan yang sama membutuhkan VPN.
- **URL WebSocket** `wss://fstream.binance.com/market/stream` belum terverifikasi live dari lingkungan mana pun. Jika WebSocket gagal, aplikasi jatuh ke REST polling 45 detik.
