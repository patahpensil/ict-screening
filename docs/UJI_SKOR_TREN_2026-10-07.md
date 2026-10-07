# Uji Screener Skor Tren (Trend Following) — 7 Oktober 2026

Status: **hasil uji untuk keputusan pemilik.** Penerapan diputuskan pemilik. Bukan bukti keunggulan trading.
Skrip dan hasil: [`research/trend-score-2026-10-07/`](../research/trend-score-2026-10-07/).

## 1. Asal konsep

Dari penelusuran GitHub, satu-satunya konsep yang dapat dijadikan alat screening dan memiliki bukti di luar data penyusunnya adalah **trend following / time-series momentum**: sistem Rob Carver (pysystemtrade, dipakai live sejak 2015) dan reproduksi paper akademik di rolling-panda-san/notebooks. Repo ICT/SMC/CRT yang ditemukan tidak memiliki hasil yang dapat diverifikasi.

## 2. Parameter (baku dari publikasi Carver, dikunci sebelum uji)

| Aturan | Isi |
|---|---|
| EWMAC | EMA 8/32, 16/64, 32/128, 64/256 pada close 1D; selisih dibagi volatilitas harga harian (EW std span 35); scalar 5,3 / 3,75 / 2,65 / 1,87; batas ±20 |
| Breakout | Lookback 20/40/80/160 hari; 40 × (close − tengah range) / (high − low range); dihaluskan EWMA span L/4; scalar 0,67 / 0,70 / 0,73 / 0,74; batas ±20 |
| Skor gabungan | Rata-rata 8 aturan, batas ±20 (positif = tren naik, negatif = tren turun) |
| Biaya | 0,05% per sisi. **Funding tidak dihitung.** |

Data: 136 pair (dari 150 pair volume terbesar per 7 Okt 2026 yang punya ≥300 hari sejarah). Periode dilaporkan terpisah: Okt 2024 – Mar 2026 dan Apr – Okt 2026 (periode naik kuat yang sudah diketahui sebelumnya).

## 3. Uji screening: 10 skor tertinggi (LONG) dan 10 terendah (SHORT) setiap hari

Rata-rata pergerakan 30 hari ke depan, sesudah fee:

| | Okt 2024 – Mar 2026 | Apr – Okt 2026 |
|---|---|---|
| Rata-rata semua pair | −1,51% | +12,65% |
| **LONG** 10 skor tertinggi | **+1,95%** (naik 52% kasus) | **+17,95%** (naik 58%) |
| **SHORT** 10 skor terendah (untung bila turun) | +1,20% (untung 64%) | **−8,98%** (untung 38%) |

Per kelompok skor (rata-rata return 30 hari, semua pair):

| Skor | Okt 2024 – Mar 2026 | Apr – Okt 2026 |
|---|---|---|
| ≥ +10 | −2,88% | +18,49% |
| 0 … +10 | −1,99% | +19,77% |
| −10 … 0 | −3,38% | +12,61% |
| ≤ −10 | −1,25% | +10,70% |

## 4. Uji trading gaya Carver (posisi ∝ skor dan volatilitas, diperbarui harian)

Diskalakan ke volatilitas tahunan 20%:

| | Okt 2024 – Mar 2026 | Apr – Okt 2026 |
|---|---|---|
| Tren LONG + SHORT | Sharpe 0,21 · +4,2%/thn · DD −23% | Sharpe −1,19 · −23,8%/thn · DD −16% |
| **Tren LONG saja** | **Sharpe 0,28** · +5,5%/thn · DD −30% | **Sharpe 2,95** · +59,1%/thn · DD −5% |
| Tren SHORT saja | Sharpe 0,13 · +2,6%/thn · DD −23% | Sharpe −1,64 · −32,8%/thn · DD −18% |
| Pembanding: hold LONG semua pair | Sharpe −0,18 · −3,7%/thn · DD −27% | Sharpe 2,43 · +48,6%/thn · DD −13% |

## 5. Bacaan

1. **Sebagai pemilih kandidat LONG, skor tren konsisten membantu.** Di kedua periode, 10 pair dengan skor tertinggi bergerak lebih baik daripada rata-rata pasar (+3,5 poin per 30 hari di periode turun, +5,3 poin di periode naik). Tren LONG saja juga mengungguli hold LONG di kedua periode.
2. **Sisi SHORT tidak andal.** SHORT untung di periode turun, tapi rugi besar di periode naik, karena semua koin ikut naik bersama pasar. Sebagai daftar relatif, pair skor terendah memang naik lebih sedikit dari pasar (+9% vs +12,7%), tapi tetap naik.
3. **Besar skor tidak selalu sebanding dengan hasil.** Di periode Okt 2024 – Mar 2026, kelompok skor tidak berurutan rapi (skor ≤ −10 justru turun paling sedikit). Yang konsisten adalah posisi teratas dalam peringkat, bukan angka skornya.
4. **Keunggulannya sederhana, bukan besar.** Di periode yang tidak naik kuat, Sharpe hanya 0,21–0,28; untuk 1,5 tahun data itu belum signifikan secara statistik.

## 6. Keterbatasan

- **Survivorship bias:** pair dipilih dari volume saat ini. Pair yang dulu kuat lalu mati tidak ikut, sehingga hasil LONG cenderung terlihat lebih baik.
- **Funding tidak dihitung.** Di pasar naik, posisi LONG biasanya membayar funding; hasil LONG nyata akan lebih rendah.
- Jendela 30 hari yang tumpang-tindih membuat jumlah sampel tampak lebih besar daripada jumlah kejadian independen.
- Hanya ±2 tahun data crypto; bukti jangka panjang konsep ini berasal dari futures tradisional.

## 7. Perbandingan alat screening gaya Carver untuk crypto (7 Okt 2026)

Parameter dikunci sebelum uji, mengikuti publikasi Carver (podcast *The Algorithmic Advantage* ep. 033 dan pysystemtrade):

| Alat | Padanan crypto |
|---|---|
| Trend | EWMAC + breakout (bagian 2) |
| Relative momentum | Return ternormalisasi-volatilitas relatif terhadap indeks crypto berbobot sama; horizon 20/40/80 hari, EWMA span H/4 |
| Carry | −(funding harian, EWMA 30 hari × 365) / volatilitas tahunan. Skor tinggi = funding negatif (LONG dibayar) |
| Gabungan | Rata-rata z-score lintas pair dari tiga skor |

Ukuran: **IC** = korelasi peringkat (Spearman) skor hari ini dengan return ke depan, dirata-rata harian; t disesuaikan untuk jendela tumpang-tindih (sampel independen ≈ hari / horizon). Selisih = 10 teratas − 10 terbawah, sesudah fee.

| Alat | IC 7h · Okt24–Mar26 | IC 30h · Okt24–Mar26 | IC 7h · Apr–Okt26 | IC 30h · Apr–Okt26 |
|---|---|---|---|---|
| **Trend** | +0,037 (t 1,3) | +0,056 (t 1,1) | −0,005 (t −0,1) | +0,034 (t 0,5) |
| Relative momentum | −0,001 (t −0,1) | −0,001 (t 0,0) | −0,023 (t −0,8) | −0,016 (t −0,3) |
| Carry (funding) | **−0,043 (t −3,1)** | **−0,063 (t −2,3)** | **−0,043 (t −2,0)** | −0,074 (t −1,6) |
| Gabungan | +0,010 (t 0,4) | +0,015 (t 0,3) | −0,028 (t −0,8) | −0,014 (t −0,2) |

Selisih 10 teratas − 10 terbawah (30 hari): Trend +3,3% dan +8,8%; Relative momentum −1,0% dan +8,2%; Carry +2,0% dan −40,4%; Gabungan −0,7% dan +7,2%.

**Bacaan:**
1. **Trend** adalah satu-satunya alat yang arahnya positif di 3 dari 4 pengukuran, tetapi lemah (IC ±0,03–0,06, t ≈ 1, belum signifikan).
2. **Relative momentum** tidak punya daya ramal (IC ≈ 0) di crypto.
3. **Carry (funding) bekerja terbalik dari logika Carver**, dan inilah sinyal paling konsisten: di keempat pengukuran IC negatif (t −1,6 sampai −3,1). Artinya koin dengan **funding positif tinggi** (LONG ramai dan membayar) justru cenderung naik lebih banyak; di Apr–Okt 2026 10 koin dengan funding paling positif naik +34,9% di atas pasar dalam 30 hari. Funding di crypto tampaknya berperilaku sebagai **ukuran sentimen/keramaian**, bukan carry.
   - **Peringatan besar:** pair dipilih dari volume **saat ini**. Koin yang reli kencang dan ramai (funding tinggi) cenderung masuk daftar volume teratas sekarang, sehingga survivorship bias bisa menciptakan pola ini. Arah tanda juga baru ditemukan dari uji ini. Harus diuji di data ke depan sebelum dipercaya.
4. **Menggabungkan** ketiganya tidak membantu; alat yang lemah atau terbalik justru melemahkan trend.
