# ICT Screening — Breakout 55/20

Pemberi sinyal Binance USDⓈ-M Futures perpetual USDT dengan **breakout 55/20** pada candle 1D (turtle-v1). Spesifikasi aktif: [docs/PRD_TURTLE_V1.md](docs/PRD_TURTLE_V1.md). Tahap validasi: **PAPER** (uji akhir 2019–2021: +1,39R per trade, tetapi drawdown 24% > batas 20%). Engine sebelumnya (Malomo, lalu skor tren Carver) disimpan sebagai arsip di `docs/`.

UI memakai CSS, layout, navigasi, panel, jurnal, watchlist, kalkulator, dan PWA yang ada. Tampilan kartu Decision dan hasil scan dua kolom LONG/SHORT dipertahankan sesuai permintaan pemilik.

## Arsitektur

| Modul | Tanggung jawab |
| --- | --- |
| `engine/trend.js` | Fungsi murni: breakout 55 hari (sinyal), SL 2 × ATR20, exit 20 hari, ukuran posisi 0,5%, drawdown jurnal, universe Top 100 volume 30 hari |
| `app/market.js` | Binance REST/WS, kontrak aktif USDT perpetual, antrean/backoff, cache candle sampai candle berikutnya close, scan 250 pair → Top 100 volume 30 hari → breakout |
| `app/tracker.js` | Pemantauan rencana (ARMED → RUNNING → keluar di SL atau exit 20 hari) untuk ditinjau sebelum eksekusi manual; tidak mengirim order |
| `app/storage.js` | Data pengguna dan state pemantauan; jurnal/watchlist pengguna tetap terbaca |
| `app/marketdata.js` | Data pasar pelengkap per pair untuk tampilan: OI, rasio long/short, taker, orderbook, CVD 1D/7H, ADX 1D, volume, funding. Tidak masuk penilaian engine |
| `app/live.js` | Data real-time posisi RUNNING di Decision: OI, CVD, orderbook, level exit 20 hari terkini |
| `app/ui.js` | Render memakai komponen tampilan yang ada |
| `app/main.js` | Navigasi, scan otomatis, pemantauan, **jurnal otomatis**, kalkulator, alert harga |

## Alur

1. Scan otomatis sejak aplikasi dibuka (jeda 60 detik setelah scan selesai, selama tab aktif); tombol Refresh memaksa scan baru. Hasil terakhir disimpan dan langsung tampil.
2. 250 pair volume 24 jam terbesar → 400 candle 1D → Top 100 menurut volume 30 hari. Candle 1D di-cache sampai candle berikutnya close, jadi scan ulang tidak mengunduh ulang.
3. Close 1D di atas high 55 hari → LONG, di bawah low 55 hari → SHORT → rencana ARMED di harga saat itu, SL = entry ∓ 2 × ATR20. Satu pair satu rencana aktif, maks 5 per arah (prioritas volume 30 hari), sinyal baru berhenti bila drawdown jurnal ≥ 20%.
4. **Harga menyentuh entry → RUNNING → otomatis tercatat di Jurnal** (status `open`).
5. Keluar saat SL tersentuh atau saat close 1D menembus low (LONG) / high (SHORT) 20 hari. **Entri jurnal yang sama diperbarui** (exit, win/loss dari R, catatan).
6. Rekaman lama engine trend-v1 yang masih RUNNING tetap selesai lewat trailing stop-nya.

## Keputusan teknis operasional

- Status close candle dinilai dengan jam server Binance (`/fapi/v1/time`).
- Pemantauan melakukan catch-up candle 1m setelah aplikasi kembali aktif; bila riwayat tidak cukup, pemantauan dibekukan dan diberi pesan satu kali.
- Candle yang menyentuh stop dan TP sekaligus (rencana lama) dihitung stop lebih dahulu.
- Hasil yang dicatat berdasarkan level rencana, bukan fill nyata; belum termasuk fee, slippage, dan funding.
- Hasil scan engine lama yang tersimpan diabaikan; rencana engine lama yang masih RUNNING tetap dipantau sampai selesai.

## Data pengguna

Jurnal (`pp_trade_journal`), watchlist (`pp_watchlist`), dan pengaturan Telegram tetap memakai key yang ada. State aplikasi memakai namespace `malomo_*` (`malomo_trend_resets` dari engine trend-v1 tidak dipakai lagi). Ekspor tidak menyertakan token Telegram.

## Menjalankan dan menguji

Tidak ada build produksi. Jalankan server statis, misalnya `python3 -m http.server 8000`, lalu buka `http://localhost:8000`.

```sh
npm test                 # self-test pemeriksa, pemeriksaan statis, engine breakout, transport & storage
npm install
npx playwright install chromium
npm run test:browser     # desktop, mobile, alur jurnal otomatis, PWA offline
```

`scripts/test-trend.js` memastikan engine aplikasi menghasilkan trade yang sama persis dengan simulasi riset (`research/turtle-v1-2026-10-07/turtle-portfolio.js`). Tes browser memakai respons Binance terkendali tanpa mengirim order atau notifikasi. CI menjalankan semua pemeriksaan dan memastikan versi cache PWA naik ketika modul aplikasi berubah. GitHub Pages memakai branch `main`.
