# PRD ICT Screening — Skor Tren Carver (trend-v1)

Status: **AKTIF** sejak 7 Oktober 2026, menggantikan engine Malomo (PRD_MALOMO_FINAL.md dan addendumnya kini arsip).
Tahap validasi: **PAPER** (cache v96) — aturan ini gagal backtest (`UJI_AB_REPO_2026-10-07.md` (branch `docs/uji-ab-repo`, belum di-merge)); sinyal tampil dan tercatat di jurnal sebagai bukti, berlabel "belum lulus uji — jangan dieksekusi". Lihat [`KEPUTUSAN_2026-10-07_PEMBERI_SINYAL.md`](KEPUTUSAN_2026-10-07_PEMBERI_SINYAL.md).
Keputusan pemilik: "Langsung aplikasikan di ICT Screening, timpa semua yang ada di dalam aplikasi itu." Tampilan UI/UX Decision dan tampilan dua kolom LONG/SHORT dipertahankan sesuai permintaan pemilik sebelumnya.
Dasar: [`UJI_SKOR_TREN_2026-10-07.md`](UJI_SKOR_TREN_2026-10-07.md). Konsep dari Rob Carver: pysystemtrade, buku *Leveraged Trading* (starter system), podcast *The Algorithmic Advantage* ep. 033.

## 1. Universe

Binance USDⓈ-M perpetual USDT berstatus TRADING, Top 250 berdasarkan 24h quote volume, dinamis.

## 2. Skor tren (forecast)

Dihitung pada candle **1D yang sudah close** (minimal 300 candle; jendela 400 candle).

| Aturan | Rumus | Scalar |
|---|---|---|
| EWMAC 8/32, 16/64, 32/128, 64/256 | (EMA cepat − EMA lambat) / volatilitas harga harian (EW std perubahan harga, span 35) | 5,3 / 3,75 / 2,65 / 1,87 |
| Breakout 20, 40, 80, 160 hari | 40 × (close − tengah range) / (high − low range), dihaluskan EWMA span L/4 | 0,67 / 0,70 / 0,73 / 0,74 |

Setiap aturan dibatasi ±20. **Skor gabungan** = rata-rata 8 aturan, dibatasi ±20. Positif = tren naik, negatif = tren turun.

## 3. Sinyal dan rencana

| Hal | Aturan |
|---|---|
| Sinyal LONG | skor ≥ +10 (kekuatan rata-rata menurut Carver) |
| Sinyal SHORT | skor ≤ −10 — **ditandai tidak andal di uji** (rugi saat pasar naik) |
| Entry | Harga ticker saat sinyal dibaca. Satu rencana per pair, arah, dan hari sinyal |
| Stop awal | Entry ∓ 0,5 × volatilitas harga tahunan (EW std perubahan harga harian × √365) |
| Trailing stop | LONG: close 1D tertinggi sejak fill − jarak stop; SHORT: close 1D terendah + jarak stop. Tidak pernah dilonggarkan |
| Target | Tidak ada TP tetap; posisi keluar hanya di trailing stop |
| Satu pair satu posisi | Pair yang ARMED/RUNNING tidak mendapat rencana kedua (LONG maupun SHORT) |
| Masuk ulang | Setelah posisi selesai, pair menunggu skor keluar dari ambang arah itu lalu menembusnya lagi |
| ARMED gugur | Bila scan terbaru tidak lagi menghasilkan rencana yang sama |

## 4. Pemantauan dan jurnal otomatis

- ARMED → **RUNNING saat harga menyentuh entry** → posisi tampil di Decision dan **langsung tercatat di Jurnal** (status `open`, setup "Tren Carver · skor …").
- Saat posisi keluar di trailing stop, **entri jurnal yang sama diperbarui**: harga keluar, status win/loss/breakeven dari hasil R, persentase, dan catatan waktu keluar.
- Semua hasil memakai level rencana, belum termasuk fee, slippage, dan funding. Aplikasi tidak mengirim order.
- Tujuan: data jurnal menjadi bukti kinerja aplikasi ke depan.

## 5. Tampilan

- **Scan Tren**: dua kolom LONG (skor positif tertinggi) dan SHORT (skor negatif terendah), 40 pair per kolom, dengan banner data pasar pelengkap (OI, rasio long/short, taker, CVD 1D/7H, ADX 1D, volume, orderbook, funding). Banner hanya tampilan.
- **Detail pair**: skor tiap aturan dan gabungan, volatilitas dan jarak trailing stop, data pasar, keputusan, rencana.
- **Decision**: kartu RUNNING tampilan lama; level TRAILING STOP / ENTRY / PUNCAK (atau TERENDAH) / STOP AWAL; sel ke-4 SKOR TREN 1D terkini dengan peringatan bila skor berbalik arah posisi.

## 6. Keterbatasan yang diketahui

- Keunggulan di uji kecil (Sharpe 0,21–0,28 di periode normal); bukti utama konsep ini dari futures tradisional dengan diversifikasi lintas kelas aset yang tidak ada di crypto.
- Jarak trailing stop di crypto lebar (sering 20–50% dari harga) karena volatilitas tahunan tinggi; ukuran posisi harus disesuaikan (kalkulator).
- Hasil uji memakai pair dari volume saat ini (survivorship bias) dan belum menghitung funding.
