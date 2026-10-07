# Protokol Riset Tiga Gaya Pemberi Sinyal — dikunci 7 Oktober 2026

Status: **DIKUNCI sebelum dijalankan.** Kandidat, parameter, biaya, dan syarat lulus di bawah ini tidak boleh diubah setelah hasil terlihat. Perubahan apa pun = kandidat baru, dan kandidat baru hanya boleh diuji di data yang belum dibuka (forward test).
Dasar: keputusan pemilik P-1..P-5 ([`KEPUTUSAN_2026-10-07_PEMBERI_SINYAL.md`](KEPUTUSAN_2026-10-07_PEMBERI_SINYAL.md)) dan batas drawdown **20%** (pemilik, 7 Okt 2026).
Skrip: `research/riset-3-gaya-2026-10-07/riset3.js` (mode `dev` dan `holdout`), pengunduh `unduh-holdout.js`.

## 1. Data

| Tahap | Periode | Pair | Catatan |
|---|---|---|---|
| **Pengembangan (dev)** | 6 Okt 2024 – 6 Okt 2026 | 150 pair volume terbesar per 7 Okt 2026 | Sudah pernah dilihat di uji-uji sebelumnya; survivorship bias. Paruh 1: Okt 2024 – Okt 2025, paruh 2: Okt 2025 – Okt 2026 |
| **Holdout** | 1 Jan 2022 – 31 Des 2023 | Point-in-time: tiap hari, 100 pair teratas menurut quote volume 30 hari sebelumnya, **termasuk pair yang sudah delisting** (data.binance.vision) | Belum pernah dipakai untuk menilai aturan apa pun. Pasar turun 2022 + pemulihan 2023. **Dibuka sekali**, hanya untuk finalis, setelah pemilik menyetujui |
| **Forward (paper)** | Setelah lolos holdout | Live di aplikasi, label PAPER | Tahap 4 kerangka validasi |

## 2. Aturan umum (semua kandidat)

- Entry di close candle sinyal (candle sudah close). Satu posisi per pair per kandidat.
- SL tersentuh: keluar di SL, atau di open bila harga gap melewati SL. SL didahulukan bila SL dan TP tersentuh di candle yang sama.
- Biaya: **0,07% per sisi** (fee taker 0,05% + slippage 0,02%) + **funding** selama posisi terbuka.
- Posisi yang masih terbuka di akhir data ditutup di close terakhir.
- **Risiko 1% modal per trade, maksimal 5 posisi terbuka per gaya per arah** (sinyal ke-6 dilewati). Hasil tanpa batas posisi dilaporkan sebagai pembanding.
- LONG dan SHORT dinilai **terpisah**; satu arah boleh lulus tanpa arah lainnya.

## 3. Kandidat (8, parameter dari sumber, tidak dioptimasi)

| Kode | Gaya | Sinyal | SL | Exit |
|---|---|---|---|---|
| P1 | Posisi (1D) | Skor tren Carver (engine/trend.js) menembus ±10 | 3 × ATR14 | Trailing 3 × ATR14 dari close terbaik; batal bila skor berbalik tanda |
| P2 | Posisi (1D) | Konsensus CTI (Pine "Claude Trading Indicator", default: 4 dimensi bulat, bertahan 2 bar, jeda 10 bar) | 3 × ATR14 | Trailing 3 × ATR14; batal saat sinyal CTI berlawanan |
| P3 | Posisi (1D) | Turtle sistem 2: close menembus high/low 55 hari | 2 × ATR20 (N) | Close menembus low/high 20 hari |
| S1 | Swing | CRT range 1D + MSS 1H (keluarga terbaik lab konsep) | Ekstrem sweep ∓ 0,1 × ATR 1H | TP 2R; batas 10 hari |
| S2 | Swing (4H) | Konsensus CTI 4H | 3 × ATR14 4H | TP 2R; batas 10 hari; batal saat sinyal berlawanan |
| S3 | Swing (4H) | Close 4H menembus high/low 20 candle, searah skor tren Carver 1D (≥ +5 / ≤ −5) | 2 × ATR14 4H | TP 3R; batas 10 hari |
| I1 | Intraday | CRT range 4H, close 1H kembali di dalam range | Ekstrem sweep ∓ 0,1 × ATR 1H | TP 2R; batas 24 jam |
| I2 | Intraday (1H) | Konsensus CTI 1H | 3 × ATR14 1H | TP 2R; batas 24 jam; batal saat sinyal berlawanan |

## 4. Syarat lulus (per kandidat per arah, dengan batas 5 posisi)

1. **≥ 60 trade** dan rata-rata **≥ +0,10R per trade setelah biaya** (P-3).
2. Rata-rata **positif di kedua paruh** periode.
3. **Drawdown historis ≤ 20%** dan **drawdown Monte Carlo persentil 95 ≤ 20%** (urutan trade diacak 10.000 kali, risiko 1% per trade).

**Alur:** dev → kandidat yang lulus semua syarat di dev menjadi finalis (maksimal 2 per gaya, rata-rata R tertinggi) → **pemilik menyetujui daftar finalis** → holdout dibuka sekali dengan syarat yang sama (paruh = 2022 dan 2023) → yang lulus masuk aplikasi sebagai PAPER untuk forward test. Kandidat yang gagal di dev tidak dibawa ke holdout.

## 5. Keterbatasan yang diketahui sebelum uji

- 8 kandidat × 2 arah = 16 pengujian. Peluang ada satu yang lolos dev **dan** holdout karena kebetulan tidak nol (perkiraan kasar ±10–15% untuk seluruh keluarga uji), sehingga forward test (PAPER) tetap wajib.
- Drawdown dihitung dari P&L yang sudah terealisasi; penurunan sementara pada posisi terbuka yang berkorelasi (crypto bergerak bersama) bisa lebih dalam.
- Intraday hanya memakai data 1H (tanpa 15m); urutan SL/TP di dalam satu candle 1H diasumsikan SL lebih dulu.
