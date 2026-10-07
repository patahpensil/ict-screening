# Uji A & B dari Repo GitHub + Backtest Aturan Live — 7 Oktober 2026

Status: **hasil uji untuk keputusan pemilik.** Skrip dan hasil: [`research/uji-ab-repo-2026-10-07/`](../research/uji-ab-repo-2026-10-07/).

## Repo yang diperiksa pemilik

| Repo | Isi | Catatan |
|---|---|---|
| dcroessler/crypto_qr | Statistical arbitrage 35 perpetual, 4H: momentum (tren Baz/Rohrbach) + carry funding, market-neutral, train/validasi/holdout, walk-forward kuartalan | Holdout dilihat 3 kali (diakui penulis); MIT |
| AbdullaE100/perp-quant-lab | Momentum lintas-pair 14 hari / volatilitas 30 hari, LONG−SHORT berbobot peringkat; OOS Sharpe 1,62 | Sisi LONG saja Sharpe 0,05; bergantung rezim; bot live tidak memakai aturan risetnya; MIT |
| afries24/Crypto-Cross-Sectional-Momentum | Momentum mingguan 12 koin, optimasi mean-variance, **filter BTC SMA200 mematikan SHORT** | Alpha t 0,91; tergantung satu minggu terbaik; **tanpa lisensi** (konsep saja) |

## Parameter (dikunci dari repo sebelum uji)

- **A.** SHORT dimatikan bila close BTC > SMA 200 hari (afries24). Diuji dengan **aturan aplikasi trend-v1 yang live**: entry di |skor| ≥ 10 pada close 1D, trailing stop 0,5 × volatilitas tahunan (close terbaik sejak entry, tidak dilonggarkan, keluar di min(open, stop)), masuk ulang setelah skor keluar dari ambang, satu posisi per pair, fee 0,05% per sisi.
- **B.** Skor = (close[t−1] / close[t−15] − 1) / std return harian 30 hari (perp-quant-lab), dibandingkan dengan skor tren Carver.

Data: 136 pair 1D (dari 150 pair volume terbesar per 7 Okt 2026). BTC di atas SMA200: 346 dari 542 hari (Okt 2024 – Mar 2026), 48 dari 188 hari (Apr – Okt 2026).

## Temuan utama: aturan aplikasi yang live merugi di backtest

| Periode | LONG | SHORT | Semua |
|---|---|---|---|
| Okt 2024 – Mar 2026 | 84 trade, win 26%, **−0,34R**/trade, total −29,0R | 85 trade, win 11%, **−0,48R**, total −40,5R | 169 trade, **−0,41R**, total **−69,5R**, DD −72R |
| Apr – Okt 2026 (pasar naik) | 10 trade, win 60%, **+0,65R**, total +6,5R | 23 trade, win 17%, −0,55R, total −12,6R | 33 trade, −0,19R, total −6,1R |

Pemeriksaan kewajaran (Okt 2024 – Mar 2026): rata-rata trade menang LONG +0,93R, kalah −0,80R; tidak ada kerugian di bawah −1,2R; biaya rata-rata 0,002R/trade; lama posisi LONG median 27 hari, SHORT median 109 hari. Simulasi konsisten — hasilnya nyata, bukan bug.

**Bacaan:** jarak stop 0,5 × volatilitas tahunan di crypto sangat lebar (sering 20–50% harga). Kenaikan yang dibutuhkan untuk mengunci untung besar, sehingga trade yang menang rata-rata hanya ±+0,9R sementara 74–89% trade kalah. Skor tren yang sama memberi hasil positif kecil sebagai portofolio kontinu (Sharpe 0,21–0,28, bagian 4 laporan skor tren), tetapi **bentuk diskret "starter system" ini tidak**.

## A. Filter BTC SMA200 untuk SHORT — tidak membantu

| | SHORT tanpa filter | SHORT dengan filter |
|---|---|---|
| Okt 2024 – Mar 2026 | 85 trade, −0,48R, total −40,5R | 82 trade, −0,58R, total −47,4R |
| Apr – Okt 2026 | 23 trade, −0,55R | 23 trade, −0,56R |

Sinyal SHORT skor tren hampir selalu muncul saat BTC sudah di bawah SMA200, sehingga filter hampir tidak menyaring apa pun dan tidak memperbaiki hasil.

## B. Momentum 14 hari / volatilitas vs skor tren Carver

| Periode | Skor | IC 7h | IC 30h | LONG−SHORT (berbobot peringkat, harian) | LONG saja |
|---|---|---|---|---|---|
| Okt 2024 – Mar 2026 | Carver | +0,037 | +0,056 | Sharpe 0,72 | −0,10 |
| Okt 2024 – Mar 2026 | Mom14/vol30 | +0,007 | −0,016 | **Sharpe 2,04** | 0,41 |
| Apr – Okt 2026 | Carver | −0,005 | +0,034 | Sharpe 1,83 | 3,53 |
| Apr – Okt 2026 | Mom14/vol30 | −0,006 | +0,019 | Sharpe 0,86 | 3,13 |

**Bacaan:**
1. Kedua skor memberi **LONG−SHORT positif di kedua periode** (0,72–2,04). Ini konsisten dengan temuan perp-quant-lab dan crypto_qr: keunggulan momentum crypto ada pada **selisih peringkat (market-neutral)**, bukan pada trade satu arah.
2. Mom14/vol30 hampir tidak meramal return 7/30 hari (IC ≈ 0), tetapi kuat pada rebalancing **harian** (Sharpe 2,04 di periode pertama) — keunggulannya berjangka sangat pendek, menuntut pembaruan portofolio setiap hari.
3. LONG saja positif di Apr – Okt 2026 karena pasar naik kuat (hold semua pair juga Sharpe 2,43), bukan bukti keunggulan.

## Keterbatasan

Survivorship bias (pair dipilih dari volume saat ini); funding tidak dihitung; slippage hanya fee taker; periode Apr – Okt 2026 sudah dilihat dalam uji-uji sebelumnya.
