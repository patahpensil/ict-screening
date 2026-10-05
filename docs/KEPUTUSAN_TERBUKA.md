# Keputusan Terbuka — Menunggu Pemilik Proyek

Dicatat: 6 Oktober 2026, dari audit kode terhadap `docs/PRD_MALOMO_FINAL.md`.
Diperbarui: 6 Oktober 2026, setelah pembahasan dengan pemilik proyek.

Hal-hal di bawah tidak dijawab oleh PRD, atau PRD bisa dibaca lebih dari satu cara. Keputusan yang sudah diambil dicatat rinci di [`ADDENDUM_PRD_2026-10-06.md`](ADDENDUM_PRD_2026-10-06.md).

## Status

| # | Poin PRD | Topik | Status |
|---|---|---|---|
| K-1 | Poin 5 | Definisi Candle Range | ✅ Diputuskan: badan candle \|close − open\| ÷ ATR14 |
| K-2 | Poin 5 | Label Displacement | ✅ Diputuskan: kuat/sedang/lemah dari referensi PRD (magnitude ≥ 1.0, RVOL20 ≥ 1.10) |
| K-3 | Poin 6 | Regime volatilitas | ✅ Diputuskan: persentil ATR14 dalam 100 candle; ≤ 25 Contraction, ≥ 75 Expansion |
| K-4 | Poin 2 | Trend Efficiency | ✅ Diputuskan: Kaufman ER20; ≥ 0.5 bersih, ≥ 0.3 sedang, < 0.3 choppy |
| K-5 | Poin 7.3 | Batas pengujian zona | ✅ Diputuskan: berakhir pada validasi, close menembus protected, atau target pertama tercapai |
| **K-6** | Poin 3.5 + 4 | Protected swing setelah sweep | ⏸ **Ditunda** — mencari solusi yang lebih tepat (lihat di bawah) |
| K-7 | Poin 3.5 | Asal protected yang terkonfirmasi sesudah break | ✅ Diputuskan dengan **catatan koreksi**: ditinjau ulang bila penerapannya keliru |
| K-8 | — | Mode Intraday vs Swing | ✅ Diputuskan: digabung menjadi "Scan Malomo" |
| K-9 | — | Masa berlaku rencana ARMED | ✅ Diputuskan: tanpa batas waktu; gugur bila engine tidak lagi menghasilkannya |

## K-6 · Protected swing setelah sweep — DITUNDA

**Masalah.** Struktur bullish punya protected low L. Sebuah candle menyapu di bawah L dengan wick, tapi close tetap di atas L, jadi struktur tidak patah (PRD Poin 4). Swing sweep S yang lebih rendah dari L lalu terkonfirmasi. Ketika terjadi breakout struktural berikutnya, PRD 3.5 memilih swing low terendah dalam leg, yaitu **S**. Akibatnya protected low bergeser **turun** dari L ke S.

**Perilaku sementara.** Mengikuti PRD 3.5 secara harfiah: S menjadi protected low. SL menjadi lebih lebar dan RR lebih kecil.

**Yang perlu dicari.** Apakah protected setelah sweep sebaiknya:
- tetap S (seperti sekarang, karena likuiditas di bawah L sudah tersapu dan S adalah titik invalidasi nyata),
- tetap L (protected tidak pernah turun dalam struktur bullish), atau
- aturan lain, misalnya memakai S hanya bila sweep diikuti displacement.

Belum diubah sampai ada keputusan.

## Catatan koreksi K-7

Aturan K-7 disetujui dengan syarat dikoreksi bila penerapannya keliru. Saat implementasi, ada satu aturan tambahan yang tidak tertulis di PRD: swing kandidat yang sudah ditembus close sebelum keputusan diambil tidak dipakai, dan protected lama dipertahankan. Laporkan kasus di chart yang terasa salah (pair, timeframe, waktu) untuk ditinjau.

## Catatan operasional (bukan keputusan strategi)

- **Akses Binance dari jaringan Indonesia.** Pada audit 6 Okt 2026, koneksi dari PC pemilik ke `fapi.binance.com` gagal dengan "certificate has expired" dan WebSocket juga gagal. Pola ini menunjukkan koneksi diblokir atau dibelokkan jaringan. Aplikasi berjalan sepenuhnya di browser pengguna, jadi pengguna di jaringan yang sama membutuhkan VPN.
- **URL WebSocket** `wss://fstream.binance.com/market/stream` belum terverifikasi live dari lingkungan mana pun. Jika WebSocket gagal, aplikasi jatuh ke REST polling 45 detik.
