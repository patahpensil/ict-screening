# ICT Malomo Screener

Screener Binance USDⓈ-M Futures perpetual USDT berdasarkan [PRD final Poin 1–7](docs/PRD_MALOMO_FINAL.md). UI memakai CSS, layout, navigasi, panel, jurnal, watchlist, kalkulator, dan PWA yang ada. Engine lama, model, indikator, pengaturan gate, serta penelitian lama sudah dihapus.

## Arsitektur

| Modul | Tanggung jawab |
| --- | --- |
| `engine/malomo.js` | Fungsi murni: struktur/fractal kausal, protected swing, break–retest, arah, evidence, zona, entry 1H, RR dan ranking |
| `app/market.js` | Binance REST/WS, kontrak aktif USDT perpetual, antrean/backoff, cache permintaan, pipeline Top 250 → arah → Top 150 |
| `app/tracker.js` | Pemantauan Trading Plan (ARMED → RUNNING → TP/SL) untuk ditinjau sebelum eksekusi manual; tidak mengirim order |
| `app/storage.js` | Data pengguna dan state Malomo; jurnal/watchlist pengguna tetap terbaca |
| `app/ui.js` | Render memakai komponen tampilan yang ada |
| `app/main.js` | Navigasi, scanner, pemantauan, jurnal, kalkulator dan alert harga |

Struktur menentukan arah; EMA21/30/50 hanya posisi harga. Kandidat menunggu konfirmasi break–retest tetap masuk ranking. ATR/RVOL dan informasi kualitas tidak menjadi veto. Penembusan swing internal adalah kelanjutan lokal. Ekstrem struktural menunggu dua candle kanan close. Entry membutuhkan pengujian zona 4H dan close 1H melewati swing internal yang terbentuk selama pengujian. Target struktural terdekat wajib menghasilkan RR minimal 1:2.2. SL keluar tanpa menunggu retest.

## Keputusan teknis operasional

Hal berikut adalah pilihan implementasi, bukan tambahan syarat strategi:

- Ranking 24h mengikuti pembaruan WS; fallback REST setiap 45 detik. Scan arah dan ranking 60m diulang setiap 5 menit setelah scan pertama, selama tab aktif. Satu jenis scan ("Scan Malomo") dengan aturan PRD 1D/4H/1H (addendum K-8).
- Quote Volume 60m dijumlahkan dari 60 candle 1m terakhir yang sudah close, dengan rentang bergerak setiap menit. Data tidak lengkap/terlambat dicatat sebagai error, bukan dianggap volume nol. Seri volume diurutkan alfabet simbol.
- Retest: candle berikutnya menyentuh level protected persis dari sisi luar dan close tetap di luar. Tidak ditambahkan toleransi ATR/persen atau batas waktu. Close kembali merebut level membatalkan pending.
- Fractal memakai ekstrem ketat dibanding empat tetangga; plateau dengan high/low sama tidak dikonfirmasi. Swing dibaca kronologis. Asal protected swing adalah swing ekstrem yang terbentuk sejak swing acuan sampai candle break; konfirmasinya ditunggu sampai 2 candle sesudah break (addendum K-7). Swing yang terbentuk sesudah break tidak pernah dipilih. Asal yang sudah ditembus close sebelum keputusan, atau tidak ada asal, membuat protected lama dipertahankan.
- Sweep wick di luar protected swing tidak mematahkan struktur. Jika swing sweep itu menjadi swing ekstrem dalam leg, ia dipilih sebagai protected baru saat breakout berikutnya (PRD 3.5). Perilaku ini masih ditinjau (K-6).
- Status close candle dinilai dengan jam server Binance (`/fapi/v1/time`), bukan jam perangkat.
- Evidence Poin 5 dinilai pada event Breakout, Breakdown, Trend Lanjutan, atau Reversal terakhir, bukan pada event pending/patah.
- Setiap pengujian zona dibaca terpisah dan berakhir pada validasi, close 1H menembus protected swing, atau target struktural pertama tercapai sebelum validasi (addendum K-5). Sentuhan zona berikutnya adalah pengujian baru, sehingga retest sesudah setup lama selesai tetap bisa tervalidasi. Plan yang SL/TP-nya sudah tersentuh diberi status tersendiri, bukan "NO TRADING PLAN".
- EMA memakai close, seed SMA sesuai periode. ATR14 memakai true range dan Wilder smoothing. RVOL membandingkan volume dengan 20 candle sebelumnya, tanpa candle yang dinilai. Evidence event menggunakan prefix candle event, bukan volume candle terbaru.
- Zona awal memakai rentang candle swing struktural relevan/referensi breakout. FVG 4H/1H boleh mempersempit irisan zona tersebut. Zona dan refinemen baru tidak berlaku sebelum waktu konfirmasinya; trigger tidak dipindahkan mundur ke candle sebelum zona diketahui.
- SL ditempatkan satu tick exchange di luar protected swing. Jika metadata tick tidak tersedia, digunakan epsilon harga kecil. Target terdekat tidak dilewati demi memaksakan RR.
- Scan dengan kegagalan data ditandai **hasil parsial**. Kandidat tetap ada jika data entry 1H gagal; Trading Plan tidak dibuat.

## Definisi tambahan di luar PRD final

Rumus yang tidak ditetapkan PRD final diputuskan pemilik proyek pada 6 Okt 2026 dan dicatat di [docs/ADDENDUM_PRD_2026-10-06.md](docs/ADDENDUM_PRD_2026-10-06.md): Candle Range = badan candle (K-1), label Displacement kuat/sedang/lemah (K-2), regime volatilitas dari persentil ATR14 100 candle (K-3), Trend Efficiency = Kaufman ER20 (K-4), batas pengujian zona (K-5), asal protected swing (K-7), satu mode scan (K-8), dan masa berlaku rencana ARMED (K-9). Semuanya informasi atau evidence, bukan gate. Keputusan yang masih terbuka ada di [docs/KEPUTUSAN_TERBUKA.md](docs/KEPUTUSAN_TERBUKA.md).

## Data pengguna dan pemantauan

Jurnal (`pp_trade_journal`), watchlist (`pp_watchlist`) dan pengaturan Telegram pengguna tetap menggunakan key yang ada. State model/penilaian lama tidak dimigrasikan ke engine baru. State baru memakai namespace `malomo_*`. Ekspor tidak menyertakan token Telegram.

Pemantauan (tracking) menandai kapan harga menyentuh entry, TP, atau SL dari Trading Plan, sebagai bahan tinjauan sebelum pemilik mengeksekusi manual di Binance. Aplikasi tidak mengirim order. Hasil yang dicatat berdasarkan level plan, bukan fill nyata, dan bukan bukti keunggulan trading. Candle yang menyentuh TP dan SL sekaligus dihitung SL lebih dahulu; TP pada candle fill tidak dianggap sudah tercapai. Pemantauan melakukan catch-up candle 1m, termasuk candle yang memotong interval terakhir secara konservatif. Jika riwayat tidak cukup, pemantauan dibekukan dan diberi pesan satu kali, tidak diberi hasil tebakan. Rencana ARMED gugur jika scan terbaru yang berhasil membaca pair tersebut tidak lagi menghasilkan plan yang sama; posisi RUNNING hanya keluar lewat SL/TP. Pemantauan yang selesai dipindahkan ke histori. Menutup panel atau modal tidak membatalkan scan; hanya tombol tutup panel hasil scan yang membatalkannya. Fee, slippage dan funding belum masuk hasil yang dicatat. Tampilan OI, CVD, orderbook, dan CHoCH di halaman Decision masih rencana dan belum aktif di engine Malomo. Alert bekerja saat aplikasi aktif dan tersambung.

## Menjalankan dan menguji

Tidak ada build produksi. Jalankan server statis, misalnya `python3 -m http.server 8000`, lalu buka `http://localhost:8000`.

```sh
node scripts/selftest.js
node scripts/check.js
node scripts/test-malomo.js
node scripts/test-transport.js
npm install
npx playwright install chromium
npm run test:browser
```

Tes browser menggunakan respons Binance terkendali, sehingga memeriksa interaksi desktop/mobile tanpa mengirim order atau notifikasi. Koneksi Binance live bergantung pada jaringan pengguna. CI menjalankan pemeriksaan ini dan memastikan versi cache PWA naik ketika modul aplikasi berubah. GitHub Pages tetap memakai branch main.
