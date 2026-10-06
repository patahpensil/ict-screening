# Validasi implementasi Malomo

- `npm test`: lulus. Self-test pemeriksa, pemeriksaan sintaks/DOM, 58 skenario engine/tracker, serta pengujian transport dan penyimpanan.
- `scripts/smoke-browser.js`: lulus pada viewport desktop 1440×1000 dan mobile 390×844. Navigasi, data pasar, watchlist, pencarian, detail, scanner, jurnal, escaping catatan, kalkulator, dan tidak ada overflow horizontal/page error. Binance dimock; tidak mengirim order/notifikasi.
- Uji PWA offline: lulus. Halaman utama dan seluruh modul baru terbaca dari shell cache saat jaringan dimatikan; fallback navigasi root diperbaiki.
- CSS dalam `index.html` sama persis dengan branch main sebelum revisi. Shell menggunakan layout/panel yang ada; isi penilaian disesuaikan dengan PRD.
- Audit data pengguna: 62.310 candle arsip BTC/ETH/SOL/BNB/DOGE/XRP, 1D/4H/1H Januari–November 2024. Evaluasi 222 snapshot mingguan 21 Maret–30 November 2024. Semua swing yang dipakai telah terkonfirmasi sebelum waktu snapshot; setiap Trading Plan yang muncul memiliki konfirmasi entry dan RR ≥2.2. Tidak ditemukan exception.
- Audit historis di atas memeriksa runtime dan invariant; tidak menghitung hit rate, biaya, atau hasil pembobotan. Tidak merupakan bukti keunggulan trading.
- Versi cache PWA dinaikkan v86 → v88, lalu v89 untuk perbaikan audit dan v90 untuk addendum keputusan, v91 untuk teks Decision, dan v92 untuk porting tampilan Decision 6 Okt 2026, seluruh modul baru terdaftar di shell cache, dan data Binance tidak dicache service worker.

Probe REST Binance live dari lingkungan pengujian menghasilkan HTTP 451. Integrasi transport diuji dengan data terkendali; koneksi live belum dapat dibuktikan dari lingkungan ini.

## Keterbatasan yang ditampilkan

Magnitude Candle Range/ATR, label Displacement, regime volatilitas, dan Trend Efficiency dihitung sesuai addendum keputusan pemilik (docs/ADDENDUM_PRD_2026-10-06.md); semuanya informasi atau evidence, bukan gate. K-6 masih terbuka. Hasil TP/SL yang dicatat berdasarkan level plan, bukan fill nyata; tampilan Decision memakai kartu engine lama dengan OI/CVD/orderbook/struktur 4H real-time (hanya tampilan); satu pair satu rencana aktif. Lihat README untuk keputusan operasional dan batas pemantauan.
