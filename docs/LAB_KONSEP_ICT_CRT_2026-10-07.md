# Lab Konsep ICT + CRT + Indikator — 7 Oktober 2026

Status: **tidak ada konsep yang lulus.** Bukan bukti keunggulan trading.
Permintaan pemilik: daripada menguji konsep yang sudah ada, biarkan backtest menyusun konsep yang diterima data, dari bahan ICT + CRT dengan indikator sebagai pendukung, dan tandai indikator yang hanya noise.
Skrip dan keluaran: [`research/lab-konsep-2026-10-07/`](../research/lab-konsep-2026-10-07/).

## 1. Protokol (ditetapkan sebelum hasil dilihat)

| Bagian | Isi |
|---|---|
| Pair | 150 pair USDT perpetual dengan volume 24 jam terbesar per 7 Okt 2026 |
| Data latih | 100 pair, 6 Okt 2024 – 31 Mar 2026 |
| Data cek | 50 pair lain (tiap pair ke-3 menurut peringkat), periode yang sama |
| Data uji akhir | Semua 150 pair, 1 Apr – 6 Okt 2026. Kode pencarian memotong data di 1 Apr 2026 sehingga tidak pernah membacanya; dibuka **sekali** untuk finalis |
| Syarat lulus (pemilik) | Sesudah fee ≥ +0,10R per trade, ≥ 60 trade, positif di latih, cek, dan uji |
| Biaya | Taker 0,05% per sisi; entry market di close sinyal; SL lebih dulu bila SL dan TP tersentuh di candle sama; satu posisi per pair; batas 30 hari |

**Definisi CRT yang dipakai:** candle range (1D atau 4H) yang sudah close; di periode berikutnya harga menyapu high/low lalu candle 1H close kembali di dalam range; SL di luar ekstrem sweep + 0,1 × ATR 1H.

**Ruang pencarian (32 konsep dasar):** range 1D/4H × entry (close kembali di dalam range / MSS 1H setelah sweep) × target (50% range / sisi seberang / 2R / 3R) × bias ICT (semua / searah bias struktur 1D+4H engine Malomo).

**Indikator pendukung (14 filter):** ADX 4H, regime volatilitas 4H, Trend Efficiency 4H, posisi terhadap EMA 1D, lokasi premium/discount, RVOL dan CVD candle sweep, ukuran range dibanding ATR.

## 2. Tahap 1 — konsep dasar

Hanya **5 dari 32** konsep positif di data latih dan data cek. Semuanya memakai **range 1D + entry MSS 1H + target R tetap**:

| Konsep | Latih | Cek |
|---|---|---|
| CRT 1D · MSS 1H · TP 3R · searah bias | +0,087R (1.287 trade) | +0,084R (686) |
| CRT 1D · MSS 1H · TP 3R · semua | +0,054R (3.945) | +0,045R (2.093) |
| CRT 1D · MSS 1H · TP 2R · searah bias | +0,043R (1.390) | +0,049R (734) |
| CRT 1D · MSS 1H · TP 2R · semua | +0,010R (4.592) | +0,016R (2.437) |
| CRT 4H · MSS 1H · TP 3R · searah bias | +0,005R (1.376) | +0,028R (678) |

Semua 16 varian entry "close kembali di dalam range" negatif di kedua data (−0,07R sampai −0,15R).

## 3. Tahap 2 — finalis dengan indikator

| Finalis | Latih | Cek |
|---|---|---|
| 1. CRT 1D · MSS · TP 3R · searah bias + CVD sweep searah + ADX 4H ≥ 20 | +0,254R (264) | +0,152R (146) |
| 2. CRT 1D · MSS · TP 3R + EMA 1D searah + RVOL sweep < 1,1 | +0,280R (385) | +0,123R (203) |
| 3. CRT 1D · MSS · TP 2R · searah bias + range < 1×ATR + bukan contraction | +0,207R (340) | +0,309R (166) |

## 4. Data uji akhir — TIDAK ADA YANG LULUS

| | Trade | Win | Per trade | Total | Profit factor |
|---|---|---|---|---|---|
| Finalis 1 | 180 | 21% | **−0,313R** | −56,4R | 0,62 |
| Finalis 2 | 452 | 26% | **−0,013R** | −6,0R | 0,98 |
| Finalis 3 | 279 | 23% | **−0,355R** | −99,0R | 0,55 |
| Pembanding (konsep dasar tanpa filter, tidak bisa dipilih) | 846 | 21% | **−0,234R** | −198,3R | 0,71 |

**Per arah (data uji):**

| | LONG | SHORT |
|---|---|---|
| Pembanding | +0,291R (161 trade, PF 1,43) | −0,358R (685 trade, PF 0,57) |
| Finalis 2 | +0,214R (223 trade, PF 1,30) | −0,234R (229 trade, PF 0,71) |

## 5. Klasifikasi indikator (berguna / merugikan / noise)

Diukur sebagai filter tunggal pada 3 konsep dasar terbaik. **Berguna** = menaikkan ≥ 0,05R di latih **dan** cek; **merugikan** = menurunkan ≥ 0,05R di keduanya; **noise** = efek kecil atau arahnya berbeda antara latih dan cek.

| Indikator | Berguna | Merugikan | Noise |
|---|---|---|---|
| EMA 1D searah | 1 | 0 | 2 |
| RVOL sweep < 1,1 | 1 | 0 | 2 |
| Lokasi premium/discount sesuai | 0 | **1** | 2 |
| ADX 4H < 20 | 0 | 1 | 2 |
| ADX 4H ≥ 20, regime volatilitas, Trend Efficiency, CVD sweep, RVOL sweep ≥ 1,1, ukuran range vs ATR, EMA 1D berlawanan | 0 | 0 | 3 (semua) |

Sebagian besar indikator **noise** untuk konsep ini. Filter di ketiga finalis tidak bertahan di data uji, yang memperkuat kesimpulan bahwa filter itu cocok dengan data latih secara kebetulan.

## 6. Kesimpulan

1. **Tidak ada konsep ICT + CRT + indikator yang lulus** syarat pemilik di data uji akhir.
2. Satu-satunya keluarga konsep yang konsisten di data latih dan cek adalah **CRT 1D + MSS 1H + target R tetap**, tetapi keunggulannya tipis (±+0,05R sampai +0,09R) dan **tidak bertahan** di periode Apr–Okt 2026.
3. Pada periode uji, hasil ditentukan **arah pasar secara umum**: LONG positif, SHORT negatif. Bias struktur per pair (ICT) dan indikator tidak menangkap hal ini.
4. Sebagian besar indikator pendukung adalah **noise** untuk konsep ini; lokasi premium/discount bahkan merugikan.

## 7. Catatan untuk langkah berikutnya

- Data uji Apr–Okt 2026 **sudah dibuka**. Ide baru apa pun yang dibentuk dari temuan di atas (misalnya "LONG saja" atau "searah tren pasar BTC") **tidak boleh** diuji ulang di periode yang sama; harus diuji di data yang benar-benar baru, yaitu **forward test** dengan data sesudah 7 Okt 2026.
- Kandidat hipotesis yang layak dicatat untuk forward test: (a) CRT 1D + MSS 1H + TP 3R searah bias, hanya diambil searah tren pasar umum (misalnya BTC di atas/bawah EMA 1D); (b) varian yang sama tanpa filter, sebagai pembanding.
