# 📟 ICT Screening — Live Futures Screener

Progressive Web App (PWA) untuk screening Binance USDT-M Futures secara real-time dengan konsep **ICT (Inner Circle Trader / Smart Money Concepts)** — langsung dari browser HP atau PC, tanpa API key, tanpa backend, tanpa biaya server.

> Versi ini adalah rombakan konsep screening dari Patah Pensill (aplikasi sebelumnya). **Semua indikator klasik (EMA, RSI, MACD, ADX, ATR, Bollinger, VWAP, Fibonacci, StochRSI) dibuang.** AI Confluence Score, Momentum Quick Score, dan Markov Screener diganti total dengan pipeline setup ICT di bawah. Gaya trading: **Intraday** dan **Swing** (Scalping dihapus).

## Navigasi

- **Home** — ringkasan market, Mode Trading (Intraday / Swing), Aksi Cepat (Deep Scan Top 20, Decision, Market), dan hasil scan ICT terakhir
- **Scanner Market** — daftar 400+ pair USDT-M Perpetual, filter & sortir manual (Volume, Gainers/Losers, Dekat 24H High/Low, Funding Ekstrem). Tiap baris punya badge konteks cepat: bias struktur 4H + posisi Premium/Discount
- **Trading Workspace** — analisa ICT lengkap 1 pair: Analysis → Validation → Decision → Trading setup (+ kalkulator position size, posisi terbuka)
- **Review** — histori trade, equity curve, jurnal, Histori Setup

## Konsep Screening: pipeline 3 tahap

Tidak ada skor 0–100. Hasilnya **keputusan eksplisit** (LONG / SHORT / SKIP) dengan checklist lulus/gagal.

1. **Filter likuiditas** — hanya pair dengan volume 24H ≥ $20 juta yang di-scan (`ICT_MIN_QUOTE_VOL`). Spread bid/ask tidak dipakai (butuh stream order book, di luar cakupan app tanpa backend).
2. **Deteksi setup** — dua setup ICT, dicari di timeframe entry (LTF):
   - **Liquidity Sweep + MSS** — likuiditas swing (SSL/BSL) di-sweep dengan wick, close balik ke dalam, lalu struktur bergeser (MSS: close menembus swing lawan) dengan displacement. Entry di POI baru (FVG → Order Block → OTE 62–79%), SL di luar ekstrem sweep.
   - **Retest POI** — searah bias HTF dan tren LTF, harga kembali ke FVG/Order Block yang belum termitigasi di sisi yang benar (discount untuk long, premium untuk short). SL di luar zona.
3. **Validasi multi-timeframe** — checklist konfluensi dengan syarat **WAJIB** (bias HTF searah, target likuiditas memenuhi RR minimum) dan syarat pendukung (konteks TF terbesar, premium/discount, sweep, MSS/BOS, POI, killzone). Grade A ≥ 85% lulus, B ≥ 65%, di bawahnya C = SKIP.

| Gaya | Entry (LTF) | Bias (HTF) | Konteks | RR minimum | Killzone |
|---|---|---|---|---|---|
| Intraday | 1H | 4H | 1D | 1:1.5 | ikut dinilai |
| Swing | 4H | 1D | 1W | 1:2.0 | tidak dipakai |

Hasil scan dipisah jadi **✅ Siap entry** (harga sedang di dalam zona entry) dan **👀 Pantau** (setup valid, tunggu retrace ke zona). TP selalu diarahkan ke likuiditas yang belum diambil di depan (BSL/SSL, equal highs/lows) — bukan jarak tetap.

## Komponen ICT yang dihitung (murni price action OHLC)

- **Struktur**: swing fractal, HH/HL vs LH/LL, BOS / CHoCH dihitung sekuensial (tren = arah event terakhir)
- **Likuiditas**: BSL/SSL (swing yang belum diambil), Equal Highs/Lows, deteksi sweep (wick + close balik)
- **FVG** (imbalance 3 candle, dengan status terisi/termitigasi) dan **Order Block** (candle lawan terakhir sebelum displacement yang meninggalkan FVG)
- **Premium / Discount**: dealing range dari swing terakhir, equilibrium 50%, zona OTE 62–79%
- **Killzone**: Asia, London, New York AM, London Close — waktu New York, otomatis ikut DST
- **Displacement**: body candle ≥ 1.3× rata-rata body 20 candle sebelumnya

## Alat Bantu

- Rencana entry otomatis (Entry/SL/TP1/TP2/RR) berbasis POI, invalidasi struktural, dan target likuiditas
- Watchlist (⭐) dengan alert otomatis: funding rate ekstrem, sweep likuiditas baru di 1H, CHoCH baru di 4H, harga masuk/dekat FVG atau Order Block 4H
- **News Guard** manual — kunci semua keputusan ke SKIP kalau kamu tahu ada berita besar (app tidak punya feed berita)
- **Histori Setup** — simpan setup, cek belakangan apakah harga ke TP/SL (membandingkan harga sekarang, bukan menelusuri jalur candle)
- Jurnal trading, equity curve, kalkulator position size, alert harga (price cross), notifikasi browser & Telegram
- Tombol "Copy Ringkasan buat AI" — merangkum keputusan, konteks multi-timeframe, likuiditas, POI, dan checklist jadi prompt siap-tempel ke Claude/AI lain (5 profil: Analis ICT, Risk Manager, Sentimen/News, Bull Case, Bear Case)
- Tombol "Lihat di TradingView" (modal detail pair) — butuh [tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) di PC yang sama (`npm run bridge`)
- PWA installable, shell app bisa offline (data tetap butuh koneksi)

Funding rate hanya ditampilkan sebagai data pasar (badge & filter "Funding Ekstrem", alert watchlist) — **tidak dipakai dalam keputusan setup**.

## Struktur File

```
index.html                     seluruh app (HTML+CSS+JS, single file)
sw.js                          service worker (cache shell app, data selalu live/no-cache)
manifest.json                  metadata PWA
icon-*.png                     ikon app
scripts/check.js               pemeriksaan statis (syntax, fungsi hilang, id DOM, handler inline)
scripts/check-cache-bump.js    memastikan CACHE_NAME naik tiap index.html/sw.js berubah
scripts/selftest.js            memastikan pemeriksanya sendiri masih bisa menolak cacat
scripts/test-ict.js            uji perilaku engine ICT dengan candle sintetis (skenario + cermin + fuzz)
scripts/smoke-browser.js       OPSIONAL: smoke test di Chrome/Edge headless dengan API Binance palsu
.github/workflows/checks.yml   menjalankan pemeriksaan otomatis di GitHub
```

Sebelum commit, cukup pakai Node tanpa install apa pun:

```
node scripts/check.js
node scripts/test-ict.js
```

`scripts/smoke-browser.js` butuh Chrome atau Edge terpasang dan tidak dijalankan di CI: `node scripts/smoke-browser.js --shots=folder`.

## Deploy ke GitHub Pages

1. Push semua file di atas ke root branch `main` (atau folder `/docs`, sesuaikan setting Pages).
2. Repo → Settings → Pages → Source: pilih branch & folder yang berisi file-file ini.
3. Tunggu build selesai, akses via `https://<username>.github.io/<repo>/`.
4. Setiap update `index.html`/`sw.js`, **naikkan versi `CACHE_NAME`** di `sw.js` (baris pertama) — ini yang memastikan HP pengguna otomatis ambil versi baru, bukan versi lama dari cache. GitHub Actions ikut menjaga aturan ini.

## Catatan Teknis

- **Tanpa API key**: semua request langsung ke endpoint publik `fapi.binance.com` dari browser pengguna sendiri (client-side). Tidak ada data yang lewat server pihak ketiga.
- **Data pribadi** (watchlist, pengaturan alert, riwayat alert, jurnal, histori setup) tersimpan di `localStorage` — tidak dikirim ke mana pun. Histori Skor lama (`pp_score_history`) tidak dibaca lagi; jurnal dan watchlist tetap kompatibel.
- **Rate limit**: scan butuh banyak candle per pair (3 timeframe × 200 candle). Jumlah pair (40 untuk Mode Trading, 50 untuk Deep Scan) dan concurrency sengaja dibatasi, dan request identik di-cache 40 detik.
- Kalau data gagal dimuat, kemungkinan besar ISP/jaringan memblokir domain Binance — coba VPN.
- **Keterbatasan jujur**: engine ICT mendeteksi pola secara mekanis; definisi ICT punya banyak variasi interpretasi, jadi hasilnya bisa berbeda dari cara kamu membaca chart. Tidak ada backtest di app ini — uji dulu di akun demo atau ukuran kecil sebelum dipercaya.
- Ini **bukan rekomendasi finansial**. Semua sinyal murni hasil kalkulasi price action, bukan saran investasi.

## Lisensi / Penggunaan

Proyek pribadi untuk keperluan trading & konten edukasi "ICT Screening". Silakan modifikasi untuk kebutuhan sendiri.
