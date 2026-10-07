# Hasil Riset Tiga Gaya — Holdout Jan 2022 – Des 2023 (dibuka sekali), 7 Oktober 2026

Protokol: [`PROTOKOL_RISET_3_GAYA_2026-10-07.md`](PROTOKOL_RISET_3_GAYA_2026-10-07.md) beserta Amandemen 1 (5 finalis pilihan pemilik; urutan pemilihan posisi acak 500 kali; lulus bila semua syarat terpenuhi di ≥ 50% urutan).
Data: 237 pair yang pernah masuk Top 100 volume harian (point-in-time); **75 di antaranya kini sudah tidak diperdagangkan**. Sumber data.binance.vision. Paruh 1 = 2022 (pasar turun), paruh 2 = 2023 (pemulihan).
Data mentah: `research/riset-3-gaya-2026-10-07/hasil-riset3-holdout.json`, `hasil-holdout-acak.json`.

## Hasil — TIDAK ADA FINALIS YANG LULUS

| Finalis | Trade (median) | R/trade | 2022 / 2023 | DD historis | DD MC p95 | Lulus | Penyebab utama |
|---|---|---|---|---|---|---|---|
| P3 Turtle SHORT | 40 | +0,53 | +1,04 / −0,11 | 6% | 6% | 0% urutan | < 60 trade; 2023 negatif |
| P3 Turtle LONG | 99 | +0,54 | −0,76 / +2,15 | 49% | 36% | 0% | 2022 sangat negatif; DD jauh di atas 20% |
| S3 Breakout 4H + tren 1D LONG | 325 | +0,02 | −0,37 / +0,09 | 51% | 46% | 0% | keunggulan hilang |
| S2 CTI 4H LONG | 523 | −0,03 | −0,17 / +0,08 | 49% | 53% | 0% | keunggulan hilang |
| P1 Carver LONG | 36 | +0,35 | −0,22 / +0,44 | 5% | 6% | 0% | < 60 trade; 2022 negatif |

Tanpa batas posisi: Turtle LONG +0,45R (484 trade, tiga terbaik +39R/+39R/+27R), Turtle SHORT +0,15R (561 trade), Carver LONG +0,48R (80 trade), S3 −0,07R, S2 0,00R.

## Bacaan

1. **Gaya swing (S2, S3) tidak bertahan.** Keunggulan +0,12R sampai +0,15R di dev turun ke sekitar 0 di holdout. Keunggulan di dev itu ikut terbentuk oleh pasar naik dan bias pemilihan pair.
2. **Trend following 1D (Turtle, Carver) positif, tetapi hanya searah pasar.** LONG rugi di 2022 dan untung besar di 2023; SHORT untung di 2022 dan rugi di 2023. Ini ciri khas trend following. Satu arah saja tidak memenuhi syarat "positif di kedua paruh" dan drawdown 20%.
3. **Pengamatan baru yang belum teruji:** Turtle LONG + SHORT bersama-sama tampak saling menutup di dua rezim. Gagasan ini **terbentuk setelah melihat holdout**, jadi tidak boleh dinilai ulang di data ini. Ujian yang masih bersih hanya **forward test** atau periode **Sep 2019 – Des 2021** yang belum dipakai sama sekali.
4. **Intraday:** tidak ada kandidat (gagal di dev).

## Konsekuensi

- Sesuai protokol, **tidak ada aturan yang masuk aplikasi sebagai sinyal eksekusi.** Aplikasi tetap PAPER.
- Data dev (Okt 2024 – Okt 2026) dan holdout (2022 – 2023) **sudah terpakai**. Kandidat atau ide baru hanya bisa diuji di Sep 2019 – Des 2021 (sekali) atau lewat forward test.
