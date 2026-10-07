# Hasil Riset Tiga Gaya — Tahap Pengembangan (dev), 7 Oktober 2026

Protokol: [`PROTOKOL_RISET_3_GAYA_2026-10-07.md`](PROTOKOL_RISET_3_GAYA_2026-10-07.md) (dikunci sebelum dijalankan). Data: 150 pair, 6 Okt 2024 – 6 Okt 2026. Holdout **belum dibuka**.
Data mentah: `research/riset-3-gaya-2026-10-07/hasil-riset3-dev.json`.

## 1. Hasil menurut protokol (maks 5 posisi, biaya + funding, risiko 1%)

| Kandidat | Arah | Trade | R/trade | Paruh 1 / 2 | DD historis | DD MC p95 | Status |
|---|---|---|---|---|---|---|---|
| P1 Carver 1D | LONG | 49 | +0,37 | +0,21 / +0,59 | 7% | 7% | gagal (< 60 trade) |
| P1 Carver 1D | SHORT | 81 | +0,08 | +0,14 / +0,03 | 6% | 9% | gagal |
| P2 CTI 1D | LONG | 126 | +0,01 | −0,16 / +0,16 | 20% | 23% | gagal |
| P2 CTI 1D | SHORT | 85 | −0,01 | | | | gagal |
| P3 Turtle 55/20 | LONG | 123 | +2,03 | +1,77 / +2,19 | 26% | 30% | gagal (DD) |
| P3 Turtle 55/20 | SHORT | 63 | +0,18 | +0,28 / +0,11 | 6% | 11% | **LULUS** (rapuh, lihat 2) |
| S1 CRT 1D + MSS 1H | LONG / SHORT | 1182 / 928 | +0,04 / +0,01 | | 59% / 47% | | gagal |
| S2 CTI 4H | LONG | 639 | +0,12 | +0,14 / +0,10 | 45% | 30% | gagal (DD) |
| S2 CTI 4H | SHORT | 483 | −0,01 | | | | gagal |
| S3 Breakout 4H + tren 1D | LONG | 428 | +0,15 | +0,13 / +0,16 | 31% | 35% | gagal (DD) |
| S3 Breakout 4H + tren 1D | SHORT | 516 | +0,06 | | 47% | | gagal |
| I1 CRT 4H + close 1H | LONG / SHORT | ±15.000 / ±13.400 | −0,23 / −0,15 | | | | gagal |
| I2 CTI 1H | LONG / SHORT | ±3.800 / ±3.100 | −0,02 / 0,00 | | | | gagal |

## 2. Pemeriksaan ketahanan (dilakukan setelah hasil terlihat; bukan syarat lulus yang dikunci)

1. **Urutan pemilihan posisi.** Sinyal 1D muncul serentak di jam yang sama. Skrip memilih "5 posisi pertama" menurut abjad nama pair, padahal protokol tidak mengatur urutan ini. Bila urutan diacak 500 kali, **P3 SHORT hanya lulus di 33% urutan** (median +0,08R). Kelulusannya bergantung pada abjad, bukan pada aturan.
2. **Hasil LONG posisi didorong segelintir koin yang meledak.**
   - Tiga trade terbaik P3 LONG: AKE +141R (harga naik 63×, posisi masih terbuka di akhir data), ZEC +54R, BULLA +43R. Tanpa tiga trade itu, rata-rata semua trade turun dari +0,55R ke +0,19R.
   - P2 LONG polanya sama: +42R, +27R, +24R.
   - Median R per trade di semua kandidat posisi negatif (−0,4R sampai −1,0R).
3. **Bias pemilihan pair (look-ahead).** Daftar 150 pair diambil dari volume **hari ini**. Koin seperti AKE masuk daftar *karena* sudah meledak, sehingga LONG mendapat keuntungan yang tidak mungkin diketahui saat sinyal muncul. Universe point-in-time di holdout menghilangkan bias ini.
4. **Intraday rugi setelah biaya.** Biaya 0,07% per sisi menghabiskan keunggulan pada SL 1H yang sempit.

## 3. Kesimpulan tahap dev

- Menurut protokol yang dikunci, finalis hanya **P3 SHORT**, dan kelulusannya rapuh.
- Ada empat kandidat yang **R per trade-nya lolos ≥ +0,10R tetapi gagal karena drawdown atau jumlah trade**: P3 LONG, S3 LONG, S2 LONG, dan P1 LONG. Keunggulannya kemungkinan dibesarkan oleh bias pemilihan pair.
- **Gaya intraday tidak punya kandidat**; tidak ada yang mendekati syarat.
- Keputusan finalis yang dibawa ke holdout menunggu pemilik.
