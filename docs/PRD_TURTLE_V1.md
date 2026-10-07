# PRD ICT Screening — Mesin Sinyal Breakout 55/20 (turtle-v1)

Status: **AKTIF di aplikasi** (menggantikan trend-v1 / skor tren Carver, yang gagal backtest; cache v97).
Tahap validasi: **PAPER** — uji akhir 2019–2021 gagal satu kriteria (drawdown harian 24% > 20%, lihat bagian 3). Sinyal tampil dan tercatat otomatis di Jurnal; apakah dipakai untuk eksekusi diputuskan pemilik.
Dasar keputusan: pemilik menyerahkan pemilihan metode ("perbaiki sampai layak digunakan dan berhasil mengeluarkan sinyal dengan baik … saya tidak mau tau metode apa yang kamu gunakan", 7 Okt 2026). Syarat pemilik tetap berlaku: ≥ +0,10R per trade setelah biaya, ≥ 60 trade, di data yang tidak dipakai untuk menyusun aturan; drawdown ≤ 20%.

## 1. Aturan (dikunci 7 Okt 2026, sebelum uji 2019–2021)

| Elemen | Aturan |
|---|---|
| Universe | Binance USDⓈ-M perpetual USDT, **100 pair teratas menurut quote volume 30 hari** (dihitung dari candle 1D) |
| Regime | Tidak ada filter; LONG dan SHORT berjalan bersama sehingga saling menutup di pasar naik dan turun |
| Entry | Close 1D **di atas high tertinggi 55 hari sebelumnya → LONG**; **di bawah low terendah 55 hari → SHORT**. Sinyal hanya berlaku untuk candle 1D terakhir yang sudah close; entry di harga saat itu |
| Invalidation (SL) | **Entry ∓ 2 × N**, N = ATR 20 hari (Wilder). Disentuh kapan saja → keluar |
| Exit | **Close 1D menembus low terendah 20 hari sebelumnya (LONG) / high tertinggi 20 hari (SHORT)** → keluar di close itu. Tanpa TP tetap: tren dibiarkan berjalan |
| Risk | **0,5% modal per trade**; ukuran posisi = modal × 0,5% ÷ (entry − SL). Satu posisi per pair. **Maksimal 5 posisi terbuka per arah**; bila sinyal lebih banyak, prioritas volume 30 hari terbesar |
| NO TRADE | Tidak ada breakout, pair di luar Top 100, slot arah penuh, pair sudah punya posisi, atau **drawdown jurnal ≥ 20% (sinyal baru dihentikan)** |

**Risiko 0,5%, bukan 1% (P-4).** Pada risiko 1%, drawdown 2022–2023 mencapai 29% (Monte Carlo 25%) dan melewati batas 20%. Batas drawdown didahulukan.

## 2. Bukti

| Data | Trade | R/trade | LONG / SHORT | Hasil (risiko 0,5%) | DD harian | DD MC p95 |
|---|---|---|---|---|---|---|
| Okt 2024 – Okt 2026, 147 pair (bias: pair dipilih dari volume sekarang) | 183 | +1,19 | +1,66 / +0,15 | +109% | 30%* | 15% |
| **Jan 2022 – Des 2023**, 239 pair point-in-time termasuk 75 yang sudah delisting | **153** | **+0,54** | +0,57 / +0,45 | **+41%** | **16%** | **13%** |
| **Sep 2019 – Des 2021**, 134 pair (periode bersih terakhir, dibuka sekali) | **98** | **+1,39** | +2,41 / −0,22 | **+68%** | **24%** | **8%** |

\* Sebagian besar berupa untung mengambang dari koin yang meledak (contoh: AKE naik 63×) yang turun kembali sebelum sinyal exit. Bila dihitung dari trade yang sudah selesai, drawdown Monte Carlo 15%.

**Catatan jujur:** 2022 (pasar turun) rata-rata −0,21R per trade, 2023 +1,45R. Keuntungan sistem ini datang dari segelintir tren besar (median trade negatif; kebanyakan trade kecil rugi). Ini sifat dasar trend following.

## 3. Uji akhir di periode bersih Sep 2019 – Des 2021

Kriteria (dikunci sebelum dijalankan): trade dari 1 Nov 2019 sampai 31 Des 2021; ≥ 60 trade, ≥ +0,10R per trade setelah biaya, drawdown harian ≤ 20%, drawdown Monte Carlo p95 ≤ 20% pada risiko 0,5%. Hasil diisi setelah uji dijalankan, apa pun hasilnya.

**Hasil (dijalankan 7 Okt 2026, data.binance.vision, 134 pair yang punya data):**

| Kriteria | Syarat | Hasil | |
|---|---|---|---|
| Jumlah trade | ≥ 60 | 98 | ✓ |
| R per trade setelah biaya | ≥ +0,10R | +1,39R (paruh 1 +2,56R, paruh 2 +0,44R) | ✓ |
| Drawdown harian | ≤ 20% | **24%** | ✗ |
| Drawdown Monte Carlo p95 | ≤ 20% | 8% | ✓ |

**Kesimpulan: belum lulus** — satu kriteria (drawdown harian) terlewati. Total +136R ≈ +68% pada risiko 0,5%. SHORT rugi (−0,22R) di periode pasar naik ini; untung datang dari LONG. Aturan **tidak diubah** sesudah melihat hasil ini. Label PAPER dipertahankan sampai pemilik memutuskan.
Data: `research/turtle-v1-2026-10-07/hasil-turtle-awal-2019-11-01-risk0.005.json` dan `uji-akhir-2019-2021.log`.

## 4. Penerapan di aplikasi

- `engine/trend.js` (turtle-v1): sinyal, SL, level exit, ukuran posisi, drawdown jurnal. `scripts/test-trend.js` memutar data sintetis lewat skrip riset `turtle-portfolio.js` dan lewat fungsi engine aplikasi; jumlah trade dan total R harus identik.
- Universe: 250 pair volume 24 jam terbesar diunduh candle 1D-nya, lalu Top 100 dipilih dari volume 30 hari candle tersebut.
- Entry rencana = harga saat scan (riset: close 1D sinyal). SL dicek setiap tick harga; exit 20 hari dicek dari close 1D setelah scan.
- Slot 5 per arah dihitung dari rencana ARMED + RUNNING. Drawdown jurnal dihitung dari hasil R posisi yang sudah selesai (risiko 0,5%).

## 5. Tampilan

UI Decision dan dua kolom LONG/SHORT dipertahankan. Kolom berisi pair Top 100 yang paling dekat atau sudah menembus breakout. Kartu sinyal menampilkan entry, SL, level exit 20 hari, dan ukuran posisi dari modal di Kalkulator. Semua posisi yang entry-nya tersentuh tercatat otomatis di Jurnal.
