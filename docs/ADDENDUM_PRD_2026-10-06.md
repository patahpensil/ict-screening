# Addendum PRD ICT Malomo Screener — 6 Oktober 2026

Status: **DISETUJUI pemilik proyek**, 6 Oktober 2026.
Melengkapi `docs/PRD_MALOMO_FINAL.md` tanpa mengubah isinya. Bila ada pertentangan, PRD FINAL tetap menjadi acuan utama, dan pertentangannya dilaporkan.
Asal keputusan: `docs/KEPUTUSAN_TERBUKA.md`.

Semua nilai di bawah adalah **informasi atau evidence**. Tidak ada yang menjadi hard gate, menentukan arah, atau menggugurkan kandidat. Satu-satunya yang mengubah perilaku keputusan adalah K-5 dan K-7, yang mengatur batas pengujian zona dan pemilihan protected swing.

## K-1 · Candle Range (Poin 5)

- **Candle Range = badan candle `|close − open|`.**
- Magnitude relatif = Candle Range ÷ ATR14, pada timeframe dan candle yang sama.
- Referensi impulse besar tetap ≥ 1.0 sesuai PRD Poin 5, dan bukan syarat wajib.

## K-2 · Label Displacement (Poin 5)

Label hanya diberikan pada event struktural yang valid (Breakout, Breakdown, Trend Lanjutan, Reversal Terkonfirmasi), memakai dua referensi PRD saja:

| Label | Syarat |
|---|---|
| **kuat** | magnitude ≥ 1.0 **dan** RVOL20 ≥ 1.10 |
| **sedang** | salah satu terpenuhi |
| **lemah** | keduanya tidak terpenuhi |

Label tidak menjadi evidence tambahan atau gate. Nilai mentah tetap ditampilkan.

## K-3 · Regime volatilitas (Poin 6)

- Hitung persentil ATR14 candle terakhir terhadap **100 nilai ATR14 terakhir** pada timeframe yang sama.
- Persentil **≤ 25 → Contraction**, **≥ 75 → Expansion**, di antaranya **Normal**.
- Kurang dari 100 nilai ATR14 → "data kurang", tanpa label.

## K-4 · Trend Efficiency (Poin 2)

- **Kaufman Efficiency Ratio periode 20** dari close, dihitung terpisah di 1D dan 4H:
  `|close sekarang − close 20 candle lalu| ÷ Σ |close − close sebelumnya|` (20 perubahan terakhir).
- Label: **≥ 0.5 bersih**, **0.3 – < 0.5 sedang**, **< 0.3 choppy**.
- Kurang dari 21 candle → "data kurang".

## K-5 · Batas pengujian zona (Poin 7.3)

Satu pengujian zona dimulai saat candle 1H pertama menyentuh zona, dan berakhir pada kondisi pertama berikut:

1. **Entry tervalidasi**: candle 1H close menembus swing internal yang terbentuk selama pengujian.
2. **Close 1H menembus protected swing**: struktur gagal, pengujian gugur.
3. **Harga mencapai target struktural pertama sebelum validasi**: peluang dianggap lewat. Target yang dipakai hanya yang sudah diketahui (terkonfirmasi) pada candle tersebut.

Sentuhan zona sesudahnya dihitung sebagai pengujian baru, dan swing dari pengujian lama tidak dipakai lagi.

## K-7 · Asal protected swing setelah break (Poin 3.5) — dengan catatan koreksi

- Kandidat asal adalah swing ekstrem yang **terbentuk** sejak swing acuan sampai candle break, sesuai rentang PRD 3.5.
- Konfirmasi fractal kandidat tersebut **ditunggu sampai 2 candle sesudah break**. Breakout dicatat di candle break, dan protected swing diperbarui saat keputusan diambil (candle break + 2).
- Swing yang terbentuk **sesudah** candle break tidak pernah dipilih.
- Aturan yang sama berlaku untuk pembentukan struktur awal dan untuk kelanjutan struktural.

**Catatan koreksi (permintaan pemilik):** aturan ini disetujui dengan syarat ditinjau ulang bila penerapannya terbukti keliru. Hal yang perlu dipantau:
- Selama 2 candle setelah break, protected swing masih memakai yang lama. Bila protected lama sedang berstatus menunggu konfirmasi patah, pembaruan protected ditunda sampai status itu selesai, supaya acuan retest tidak bergeser. Pembaruan dibatalkan bila struktur patah terkonfirmasi.
- Bila tidak ada swing dalam rentang tersebut, protected lama dipertahankan.
- Bila swing kandidat sudah ditembus close **sebelum** keputusan diambil (antara candle break dan break + 2), kandidat itu tidak dipakai dan protected lama dipertahankan. Kandidat yang dipilih adalah swing paling ekstrem, jadi bila swing itu sudah ditembus, kandidat lain juga sudah ditembus. Aturan tambahan ini ditemukan saat implementasi, bukan tertulis di PRD. Ini perlu kamu tinjau.
- Laporkan setiap kasus di mana SL/protected terasa tidak masuk akal pada chart, dengan pair, timeframe, dan waktunya, supaya aturan ini bisa dikoreksi.

## K-8 · Mode scan

Tombol Intraday dan Swing digabung menjadi satu **"Scan Malomo"** (1D–4H arah, 4H zona, 1H entry). Varian lain hanya ditambahkan lewat addendum PRD.

## K-9 · Masa berlaku rencana ARMED

Tanpa batas waktu. Rencana ARMED gugur (void) jika:
- scan terbaru yang berhasil membaca pair itu tidak lagi menghasilkan plan yang sama, atau
- SL atau TP tersentuh sebelum harga mengisi entry.

Posisi RUNNING hanya keluar lewat SL/TP.

## K-10 · Geometri Trading Plan — SL di ekstrem uji zona 1H (diputuskan 7 Okt 2026)

**Masalah yang ditemukan.** Dalam 7 hari (108 pair, dievaluasi tiap 4 jam) hanya 3 Trading Plan lolos. 856 dari 894 trigger entry (96%) gagal RR 1:2.2, karena SL di protected swing 4H (median risk ±13% harga) sementara target struktural terdekat dekat dengan entry.

**Keputusan.**
- **SL = di luar ekstrem 1H selama pengujian zona**: low terendah (LONG) atau high tertinggi (SHORT) sejak candle pertama menyentuh zona sampai candle validasi, ditambah 1 tick.
- Entry tetap close candle 1H validasi. Target tetap level struktural terdekat. RR minimum tetap 1:2.2.
- Protected swing 4H tetap menjadi batas **struktur patah**, terpisah dari SL (PRD 7.6).

## K-11 · Status "menunggu konfirmasi patah" (diputuskan 7 Okt 2026)

**Masalah yang ditemukan.** 64 dari 108 kandidat tertahan di status menunggu konfirmasi karena harga menembus protected swing lalu melaju tanpa pernah kembali menyentuh level. Arah lama dipertahankan dan zona entry tertinggal jauh (contoh SOL: SHORT dengan zona 74–75 saat harga 121).

**Keputusan.**
1. Patah terkonfirmasi juga bila **pullback sesudah break membentuk swing terkonfirmasi yang tetap di luar level** (swing high di bawah level untuk bullish yang patah turun; swing low di atas level untuk bearish yang patah naik). Ini bentuk "retest gagal merebut kembali level". Retest yang menyentuh level tetap berlaku seperti sebelumnya. Close yang merebut kembali level tetap membatalkan status pending.
2. **Selama struktur 1D atau 4H menunggu konfirmasi patah, Trading Plan tidak dibentuk.** Kandidat tetap tampil di ranking Top 150 dengan status "Trading Plan ditahan".

**Hasil pengecekan 7 hari dengan data Binance (sesudah K-10 dan K-11).** Struktur pending turun dari 64 menjadi 5. Trading Plan unik naik dari 3 menjadi 12 (risk median 3,84%, RR median 2,93). Hasil 12 plan itu: 2 TP, 8 SL, 2 berjalan (±−0,6R). Sampel terlalu kecil untuk menilai kualitas; perlu backtest yang lebih panjang.

## Masih terbuka

- **K-6** · Protected swing setelah sweep: ditunda untuk mencari solusi yang lebih tepat. Sampai diputuskan, perilaku harfiah PRD 3.5 tetap berjalan. Lihat `docs/KEPUTUSAN_TERBUKA.md`.
