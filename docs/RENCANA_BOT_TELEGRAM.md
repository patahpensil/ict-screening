# Rencana: Bot Telegram di VPS (Opsi B)

Dicatat: 6 Oktober 2026.
Status: **DITUNDA** — menunggu kualitas engine Malomo terbukti lebih dulu (keputusan pemilik).

## Tujuan

Pemilik meninjau dan mengeksekusi setup secara manual di Binance. Notifikasi harus sampai walau aplikasi web tidak terbuka. Karena itu notifikasi akan dikirim oleh layanan di VPS, bukan dari browser.

## Pilihan yang dibandingkan

| | Opsi A — dari aplikasi web | Opsi B — bot di VPS (dipilih) |
|---|---|---|
| Cara kerja | Browser mengirim pesan memakai pengaturan Telegram yang sudah ada | Layanan Node di VPS menjalankan `engine/malomo.js` yang sama, scan tiap 5 menit, 24 jam |
| Kapan jalan | Hanya selama aplikasi terbuka; tab di HP bisa dibekukan | Terus-menerus, tidak tergantung perangkat pemilik |
| Akses Binance | Diblokir di jaringan PC pemilik (perlu VPN) | VPS bisa mengakses Binance (dicek 6 Okt 2026: HTTP 200) |
| Risiko untuk eksekusi | Notifikasi bisa terlewat | Rendah |

Opsi A tidak dikerjakan dulu. Bila Opsi B jalan, Opsi A tidak diperlukan supaya tidak ada notifikasi ganda.

## Rancangan awal Opsi B

- **Engine:** file `engine/malomo.js` yang sama dengan aplikasi web, tanpa salinan, agar aturan dan hasil identik.
- **Isi notifikasi** (belum dipastikan pemilik):
  - 📋 Trading Plan baru: pair, arah, zona, entry, SL, TP, RR, waktu validasi
  - 🎯 Entry tersentuh (ARMED → RUNNING), sinyal untuk eksekusi manual
  - ✅/❌ TP atau SL tercapai
  - ⚪ Rencana gugur
- **Bot:** bot baru khusus Malomo lewat @BotFather. Token ditaruh sendiri oleh pemilik di file konfigurasi di VPS, tidak dikirim lewat chat.
- **VPS `hermes`:** Node.js tersedia. RAM 1.9 GB (±1.2 GB tersedia), disk sisa 9.7 GB. Layanan dibuat **terpisah** dan tidak menyentuh Hermes agent maupun 9router yang sudah berjalan.

## Syarat sebelum dikerjakan

Kualitas engine harus terlihat lebih dulu. Ukuran yang diusulkan: jumlah Trading Plan, hit rate TP vs SL, rata-rata R, expectancy setelah perkiraan fee, drawdown, dan hasil per pair. Rencana evaluasi dibahas terpisah.

## Yang perlu diputuskan saat dimulai

1. Bot baru atau bot yang sudah ada.
2. Jenis notifikasi yang dikirim (semua atau sebagian).
