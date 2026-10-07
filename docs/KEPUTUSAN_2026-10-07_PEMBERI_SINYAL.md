# Keputusan Pemilik — 7 Oktober 2026: Arah Aplikasi Pemberi Sinyal

Dasar: bedah indikator Pine "Claude Trading Indicator" dan kerangka cryptoday.id/lab (protokol 7 elemen, validasi 6 tahap, decision log), serta hasil uji di `UJI_AB_REPO_2026-10-07.md` (branch `docs/uji-ab-repo`, belum di-merge).

| # | Pertanyaan | Keputusan pemilik |
|---|---|---|
| P-1 | Peran aplikasi | **Pemberi sinyal**: aplikasi memberi entry, SL, dan exit; pemilik tinggal eksekusi. (Bukan penyaring daftar pendek, bukan sistem portofolio.) |
| P-2 | Gaya trading | **Semua gaya, dengan fitur khusus tiap gaya**: intraday (jam–1 hari), swing pendek (2–10 hari), posisi/tren (minggu–bulan). |
| P-3 | Syarat aturan boleh tampil sebagai sinyal | Rata-rata **≥ +0,10R per trade setelah fee**, **≥ 60 trade**, di data yang belum pernah dipakai menyusun aturan; LONG dan SHORT dinilai terpisah. |
| P-4 | Risiko per trade | **1% modal**; ukuran posisi = (modal × 1%) ÷ jarak SL. |
| P-5 | Aplikasi live v95 (trend-v1) selama riset | **Label PAPER**: sinyal tetap tampil dan jurnal otomatis tetap mencatat, dengan label jelas "belum lulus uji — jangan dieksekusi". |

## Konsekuensi yang dicatat

- **P-2 adalah perluasan cakupan yang disadari.** Setiap gaya adalah protokol tersendiri (universe, regime, entry, exit, invalidation, risiko, NO TRADE) dan harus lulus P-3 secara terpisah. Lulusnya satu gaya tidak meloloskan gaya lain. Pekerjaan riset menjadi tiga jalur, bukan satu.
- **Status sekarang:** belum ada aturan yang lulus P-3 di gaya mana pun. Malomo K-10/K-11 (swing/intraday ICT) dan trend-v1 (posisi) sama-sama gagal backtest.
- **P-5 diterapkan** di cache v96: label PAPER di hasil scan, detail pair, rencana, kartu Decision, dan setiap entri jurnal otomatis (setup "… · PAPER", catatan diawali "PAPER"), supaya bukti PAPER bisa dipisahkan dari sinyal yang kelak lulus uji. Logika sinyal tidak berubah.
- **P-4 belum diterapkan** di aplikasi (modul risiko/ukuran posisi menunggu arsitektur protokol).

## Belum diputuskan

- Urutan riset tiga gaya dan kandidat aturan per gaya (mis. CRT 1D + MSS 1H untuk swing, skor tren dengan exit ATR × 3 untuk posisi, konsensus CTI).
- Batas drawdown maksimal (mandat) untuk tahap Monte Carlo dan Monitor.
- Keputusan lama: K-6, tinjauan K-7, bot Telegram (Opsi B), merge branch `docs/uji-ab-repo`.
