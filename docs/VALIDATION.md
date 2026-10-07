# Validasi implementasi — engine skor tren (trend-v1)

Diperbarui: 7 Oktober 2026 (penggantian engine Malomo dengan skor tren Carver). Riwayat validasi engine Malomo ada di git history file ini.

## Pengujian otomatis

- `npm test`: lulus.
  - Self-test pemeriksa dan pemeriksaan statis (sintaks, DOM, delapan modul lokal).
  - `scripts/test-trend.js` (17 pemeriksaan): **skor aplikasi identik dengan implementasi riset yang diuji** pada tren naik, turun, dan datar; sinyal LONG/SHORT/tanpa sinyal; batas ±20; rencana (entry, stop awal 0,5 × volatilitas tahunan, tanpa TP); candle belum close diabaikan; data < 300 hari tanpa skor; kausal; hasil hitung dipakai ulang; tracker ARMED → RUNNING → stop; trailing stop LONG dan SHORT tidak pernah dilonggarkan; keluar dalam untung = win; satu pair satu rencana; rencana lama dengan TP tetap ditangani; data pasar (ADX, CVD 1D, orderbook, parsing); ranking universe.
  - `scripts/test-transport.js`: cakupan USDT perpetual, retry rate limit, jam server, cache candle sampai close, scan skor tren 1D (400 candle), impor rencana tren tanpa TP, kontinuitas jurnal pengguna.
- `scripts/smoke-browser.js`: lulus di Chrome pada 1440×1000 dan 390×844, plus PWA offline.
  - Detail pair menampilkan skor tiap aturan, risiko dan trailing stop, data pasar.
  - Scan dua kolom: BTC (tren naik) di LONG, ETH (tren turun) di SHORT, label SINYAL.
  - **Alur jurnal otomatis:** scan membuat 2 rencana ARMED → tick menyentuh entry → keduanya RUNNING → 2 entri jurnal `open` tercatat otomatis → trailing stop BTC tersentuh di atas entry → entri jurnal yang sama diperbarui menjadi `win` (tidak terduplikasi), pair BTC menunggu sinyal baru.
  - Kartu Decision: TRAILING STOP, ENTRY, STOP AWAL, sel SKOR TREN 1D.
  - Tidak ada error halaman dan tidak ada luapan horizontal.

## Uji dengan data Binance sungguhan (VPS, 7 Okt 2026)

Modul aplikasi yang sama (`engine/trend.js`, `app/market.js`, `app/marketdata.js`, `app/tracker.js`) dijalankan di Node terhadap Binance:

- Scan pertama 51 detik / 250 request; scan ulang 0 detik / 0 request (cache candle + hasil hitung).
- Universe 250 pair, 219 dinilai (sisanya < 300 hari data), 20 sinyal LONG, 8 sinyal SHORT, 0 error.
- 28 rencana terbentuk dengan format benar (tanpa TP, stop awal = entry ∓ jarak trailing).
- Jarak trailing stop pada sinyal teratas 22–52% dari harga (volatilitas crypto tinggi).
- WebSocket `/market/stream` dan `/public/stream` mengirim data (diverifikasi sebelumnya dari VPS).

## Keterbatasan

Lihat [PRD_TREND_CARVER.md](PRD_TREND_CARVER.md) bagian 6 dan [UJI_SKOR_TREN_2026-10-07.md](UJI_SKOR_TREN_2026-10-07.md). Keunggulan konsep di crypto kecil dan belum signifikan secara statistik; jurnal otomatis dipakai untuk mengumpulkan bukti ke depan.
