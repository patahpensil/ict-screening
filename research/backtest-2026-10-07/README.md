# Backtest 2026-10-07

Laporan: [`docs/BACKTEST_2026-10-07.md`](../../docs/BACKTEST_2026-10-07.md).

- `bt.js` — skrip backtest (Node 22, butuh akses ke `fapi.binance.com`). Letakkan `malomo_new.js`, `malomo_old.js`, dan `marketdata.js` (salinan `engine/malomo.js` versi yang diuji dan `app/marketdata.js`) di folder yang sama, lalu jalankan `nice -n 15 node bt.js config.json`.
- `config.json` — engine, periode, dan pair yang diuji.
- `summary.json` — ringkasan per engine/periode: statistik trigger, hasil keseluruhan, per arah, per bulan, per pair, dan kecenderungan 21 kondisi.

Bukan bagian dari aplikasi; tidak dimuat oleh `index.html` maupun service worker.
