# ICT Screening — Skor Tren Carver

Screener Binance USDⓈ-M Futures perpetual USDT berbasis **skor tren gaya Rob Carver** (EWMAC + breakout pada candle 1D). Spesifikasi aktif: [docs/PRD_TREND_CARVER.md](docs/PRD_TREND_CARVER.md). Engine sebelumnya (Malomo, ICT struktur) diganti pada 7 Okt 2026; dokumennya disimpan sebagai arsip (`docs/PRD_MALOMO_FINAL.md`, addendum, keputusan, dan laporan riset).

UI memakai CSS, layout, navigasi, panel, jurnal, watchlist, kalkulator, dan PWA yang ada. Tampilan kartu Decision dan hasil scan dua kolom LONG/SHORT dipertahankan sesuai permintaan pemilik.

## Arsitektur

| Modul | Tanggung jawab |
| --- | --- |
| `engine/trend.js` | Fungsi murni: skor tren (EWMAC 8/32–64/256 + breakout 20–160, ±20), sinyal di \|skor\| ≥ 10, rencana (entry, stop awal 0,5 × volatilitas tahunan), trailing stop, ranking universe |
| `app/market.js` | Binance REST/WS, kontrak aktif USDT perpetual, antrean/backoff, cache candle sampai candle berikutnya close, scan Top 250 → skor tren |
| `app/tracker.js` | Pemantauan rencana (ARMED → RUNNING → keluar di stop) untuk ditinjau sebelum eksekusi manual; tidak mengirim order |
| `app/storage.js` | Data pengguna dan state pemantauan; jurnal/watchlist pengguna tetap terbaca |
| `app/marketdata.js` | Data pasar pelengkap per pair untuk tampilan: OI, rasio long/short, taker, orderbook, CVD 1D/7H, ADX 1D, volume, funding. Tidak masuk penilaian engine |
| `app/live.js` | Data real-time posisi RUNNING di Decision: OI, CVD, orderbook, skor tren 1D terkini |
| `app/ui.js` | Render memakai komponen tampilan yang ada |
| `app/main.js` | Navigasi, scan otomatis, pemantauan, **jurnal otomatis**, kalkulator, alert harga |

## Alur

1. Scan otomatis sejak aplikasi dibuka (jeda 60 detik setelah scan selesai, selama tab aktif); tombol Refresh memaksa scan baru. Hasil terakhir disimpan dan langsung tampil.
2. Top 250 menurut volume → skor tren dari 400 candle 1D. Candle 1D di-cache sampai candle berikutnya close dan hasil hitung skor disimpan, jadi scan ulang tidak mengunduh dan tidak menghitung ulang (diukur dari VPS 7 Okt 2026: scan pertama 51 dtk / 250 request, scan ulang 0 dtk / 0 request).
3. |skor| ≥ 10 → rencana ARMED di harga saat itu. Satu pair satu rencana aktif.
4. **Harga menyentuh entry → RUNNING → otomatis tercatat di Jurnal** (status `open`).
5. Trailing stop dinaikkan dari close 1D (tidak pernah dilonggarkan). Saat stop tersentuh, posisi selesai dan **entri jurnal yang sama diperbarui** (exit, win/loss dari R, catatan).
6. Pair yang selesai menunggu skor keluar dari ambang lalu menembusnya lagi sebelum boleh masuk ulang.

## Keputusan teknis operasional

- Status close candle dinilai dengan jam server Binance (`/fapi/v1/time`).
- Pemantauan melakukan catch-up candle 1m setelah aplikasi kembali aktif; bila riwayat tidak cukup, pemantauan dibekukan dan diberi pesan satu kali.
- Candle yang menyentuh stop dan TP sekaligus (rencana lama) dihitung stop lebih dahulu.
- Hasil yang dicatat berdasarkan level rencana, bukan fill nyata; belum termasuk fee, slippage, dan funding.
- Hasil scan engine lama yang tersimpan diabaikan; rencana engine lama yang masih RUNNING tetap dipantau sampai selesai.

## Data pengguna

Jurnal (`pp_trade_journal`), watchlist (`pp_watchlist`), dan pengaturan Telegram tetap memakai key yang ada. State aplikasi memakai namespace `malomo_*` (termasuk `malomo_trend_resets` untuk aturan masuk ulang). Ekspor tidak menyertakan token Telegram.

## Menjalankan dan menguji

Tidak ada build produksi. Jalankan server statis, misalnya `python3 -m http.server 8000`, lalu buka `http://localhost:8000`.

```sh
npm test                 # self-test pemeriksa, pemeriksaan statis, engine tren, transport & storage
npm install
npx playwright install chromium
npm run test:browser     # desktop, mobile, alur jurnal otomatis, PWA offline
```

`scripts/test-trend.js` memastikan skor di aplikasi identik dengan implementasi riset yang diuji (`research/trend-score-2026-10-07/tf.js`). Tes browser memakai respons Binance terkendali tanpa mengirim order atau notifikasi. CI menjalankan semua pemeriksaan dan memastikan versi cache PWA naik ketika modul aplikasi berubah. GitHub Pages memakai branch `main`.
