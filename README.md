# ICT Malomo Screener

Screener Binance USDⓈ-M Futures perpetual USDT berdasarkan [PRD final Poin 1–7](docs/PRD_MALOMO_FINAL.md). UI memakai CSS, layout, navigasi, panel, jurnal, watchlist, kalkulator, dan PWA yang ada. Engine lama, model, indikator, pengaturan gate, serta penelitian lama sudah dihapus.

## Arsitektur

| Modul | Tanggung jawab |
| --- | --- |
| `engine/malomo.js` | Fungsi murni: struktur/fractal kausal, protected swing, break–retest, arah, evidence, zona, entry 1H, RR dan ranking |
| `app/market.js` | Binance REST/WS, kontrak aktif USDT perpetual, antrean/backoff, cache permintaan, pipeline Top 250 → arah → Top 150 |
| `app/tracker.js` | Simulasi lokal entry, TP/SL dan candle ambigu; tidak mengeksekusi order |
| `app/storage.js` | Data pengguna dan state Malomo; jurnal/watchlist pengguna tetap terbaca |
| `app/ui.js` | Render memakai komponen tampilan yang ada |
| `app/main.js` | Navigasi, scanner, pemantauan, jurnal, kalkulator dan alert harga |

Struktur menentukan arah; EMA21/30/50 hanya posisi harga. Kandidat menunggu konfirmasi break–retest tetap masuk ranking. ATR/RVOL dan informasi kualitas tidak menjadi veto. Penembusan swing internal adalah kelanjutan lokal. Ekstrem struktural menunggu dua candle kanan close. Entry membutuhkan pengujian zona 4H dan close 1H melewati swing internal yang terbentuk selama pengujian. Target struktural terdekat wajib menghasilkan RR minimal 1:2.2. SL keluar tanpa menunggu retest.

## Keputusan teknis operasional

Hal berikut adalah pilihan implementasi, bukan tambahan syarat strategi:

- Ranking 24h mengikuti pembaruan WS; fallback REST setiap 45 detik. Scan arah dan ranking 60m diulang setiap 5 menit setelah scan pertama, selama tab aktif. Intraday dan Swing memakai satu aturan PRD 1D/4H/1H.
- Quote Volume 60m dijumlahkan dari 60 candle 1m terakhir yang sudah close, dengan rentang bergerak setiap menit. Data tidak lengkap/terlambat dicatat sebagai error, bukan dianggap volume nol. Seri volume diurutkan alfabet simbol.
- Retest: candle berikutnya menyentuh level protected persis dari sisi luar dan close tetap di luar. Tidak ditambahkan toleransi ATR/persen atau batas waktu. Close kembali merebut level membatalkan pending.
- Fractal memakai ekstrem ketat dibanding empat tetangga; plateau dengan high/low sama tidak dikonfirmasi. Swing dibaca kronologis; hanya titik yang sudah terkonfirmasi pada saat break dapat dipilih sebagai asal. Asal dipilih tepat di candle break; jika belum ada yang terkonfirmasi, breakout tetap tercatat dan protected lama dipertahankan.
- Sweep wick di luar protected swing tidak mematahkan struktur. Jika swing sweep itu menjadi swing ekstrem dalam leg, ia dipilih sebagai protected baru saat breakout berikutnya (PRD 3.5).
- Status close candle dinilai dengan jam server Binance (`/fapi/v1/time`), bukan jam perangkat.
- Evidence Poin 5 dinilai pada event Breakout, Breakdown, Trend Lanjutan, atau Reversal terakhir, bukan pada event pending/patah.
- Setiap pengujian zona dibaca terpisah. Setelah satu validasi, sentuhan zona berikutnya adalah pengujian baru, sehingga retest sesudah setup lama selesai tetap bisa tervalidasi. Plan yang SL/TP-nya sudah tersentuh diberi status tersendiri, bukan "NO TRADING PLAN".
- EMA memakai close, seed SMA sesuai periode. ATR14 memakai true range dan Wilder smoothing. RVOL membandingkan volume dengan 20 candle sebelumnya, tanpa candle yang dinilai. Evidence event menggunakan prefix candle event, bukan volume candle terbaru.
- Zona awal memakai rentang candle swing struktural relevan/referensi breakout. FVG 4H/1H boleh mempersempit irisan zona tersebut. Zona dan refinemen baru tidak berlaku sebelum waktu konfirmasinya; trigger tidak dipindahkan mundur ke candle sebelum zona diketahui.
- SL ditempatkan satu tick exchange di luar protected swing. Jika metadata tick tidak tersedia, digunakan epsilon harga kecil. Target terdekat tidak dilewati demi memaksakan RR.
- Scan dengan kegagalan data ditandai **hasil parsial**. Kandidat tetap ada jika data entry 1H gagal; Trading Plan tidak dibuat.

## Batas definisi dalam PRD final

Definisi numerik **Candle Range lama tidak tertulis** dalam PRD yang tersedia. Definisi High−Low yang ditolak pengguna tidak dimasukkan kembali. Karena itu magnitude Candle Range/ATR dan klasifikasi Displacement numerik ditampilkan **belum dinilai**; tidak diisi dengan nilai buatan atau dijadikan gate.

PRD juga tidak menetapkan rumus Trend Efficiency maupun batas kategori Contraction/Normal/Expansion. UI memberikan informasi struktur/fase dan jumlah swing internal sebagai informasi kualitas, serta perubahan ATR antar-candle sebagai konteks pengukuran. Label regime volatilitas belum dipaksakan dengan threshold baru. Ini merupakan batas cakupan implementasi, sehingga belum dapat diklaim seluruh keluaran kuantitatif PRD sudah terdefinisi. Daftar lengkap keputusan yang menunggu pemilik proyek ada di [docs/KEPUTUSAN_TERBUKA.md](docs/KEPUTUSAN_TERBUKA.md).

## Data pengguna dan simulasi

Jurnal (`pp_trade_journal`), watchlist (`pp_watchlist`) dan pengaturan Telegram pengguna tetap menggunakan key yang ada. State model/penilaian lama tidak dimigrasikan ke engine baru. State baru memakai namespace `malomo_*`. Ekspor tidak menyertakan token Telegram.

Tracking adalah simulasi lokal, bukan order bursa atau bukti keunggulan trading. Candle yang menyentuh TP dan SL sekaligus dihitung SL lebih dahulu; TP pada candle fill tidak dianggap sudah tercapai. Pemantauan melakukan catch-up candle 1m, termasuk candle yang memotong interval terakhir secara konservatif. Jika riwayat tidak cukup, simulasi dibekukan dan diberi pesan satu kali, tidak diberi hasil tebakan. Rencana ARMED gugur jika scan terbaru yang berhasil membaca pair tersebut tidak lagi menghasilkan plan yang sama; posisi RUNNING hanya keluar lewat SL/TP. Simulasi yang selesai dipindahkan ke histori. Menutup panel atau modal tidak membatalkan scan; hanya tombol tutup panel hasil scan yang membatalkannya. Fee, slippage dan funding belum masuk hasil simulasi. Alert bekerja saat aplikasi aktif dan tersambung.

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
