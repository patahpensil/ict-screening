# 📟 ICT Screening — Live Futures Screener

Progressive Web App (PWA) untuk screening Binance USDT-M Futures secara real-time dengan konsep **ICT (Inner Circle Trader / Smart Money Concepts)** — langsung dari browser HP atau PC, tanpa API key, tanpa backend, tanpa biaya server.

> ⚠️ **Alat bantu keputusan, bukan sinyal terbukti.** Backtest walk-forward di data nyata belum menemukan keunggulan statistik dari setup yang dideteksi. Lihat bagian [Hasil backtest](#hasil-backtest--baca-ini-sebelum-memakai-sinyalnya).

> Versi ini adalah rombakan konsep screening dari Patah Pensill (aplikasi sebelumnya). **Indikator klasik pada awalnya dibuang semua; sejak 2026-10-04 sebagian kecil (MA200, EMA 21/30/50, volume spike) dipakai KEMBALI hanya sebagai filter yang menimbang — struktur harga tetap penentu arah dan ICT penentu entry. RSI, MACD, ADX, ATR, Bollinger, VWAP, dan StochRSI tetap dibuang.** AI Confluence Score, Momentum Quick Score, dan Markov Screener diganti total dengan pipeline setup ICT di bawah. Gaya trading: **Intraday** dan **Swing** (Scalping dihapus).

## Navigasi

- **Home** — ringkasan market, Mode Trading (Intraday / Swing), Aksi Cepat (Deep Scan Top 20, Decision, Market), dan hasil scan ICT terakhir
- **Scanner Market** — daftar 400+ pair USDT-M Perpetual, filter & sortir manual (Volume, Gainers/Losers, Dekat 24H High/Low, Funding Ekstrem). Tiap baris punya badge konteks cepat: bias struktur 4H + posisi Premium/Discount
- **Decision** — pair hasil scan yang harganya sudah menyentuh Entry (RUNNING, dengan penanda). Menampilkan OI, CVD, orderbook, dan CHoCH real-time; pair hilang saat kena TP/SL dan hasilnya otomatis tercatat di Review. Hanya tampilan, tidak memengaruhi penilaian setup; pemantauan jalan selama app terbuka
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

## Model dari dua berkas panduan (Unicorn & Inverse Blueprint)

Selain Sweep+MSS dan Retest POI, app memuat **dua model dari berkas panduan** yang diterapkan apa adanya. Yang dipakai hanya aturannya; **instrumen dan timeframe berkas (ES/XAUUSD/EURUSD, M3–M15) tidak dipakai** — model berjalan di TF gaya Intraday (1H/4H/1D) dan Swing (4H/1D/1W) milik app, di crypto.

**ICT Unicorn** (berkas "ICT Unicorn Model")
1. **DOL** = *equal highs* (long) / *equal lows* (short) searah trade yang belum diambil.
2. **Manipulation leg menjauhi DOL**: long = swing high → lower low (menyapu low sebelumnya); short = swing low → higher high.
3. **Breaker** = candle (atau kelompok candle warna sama, maks 4) **terakhir** sebelum lower low / higher high — hijau untuk bullish, merah untuk bearish — yang kemudian ditembus close. Displacement setelahnya harus meninggalkan **FVG yang tumpang tindih** dengan breaker.
4. **Entry** = retest zona overlap breaker ∩ FVG (limit). **SL** = *body* high/low manipulation leg (bukan wick).
5. **TP** = 2 standard deviation (0 = ekstrem leg, 1 = awal leg, 2 = diproyeksikan sebesar leg — proyeksi sederhana, bukan alat Fibonacci) **atau** DOL. **Minimal 2R. Tanpa manajemen trade.** Jangan trading saat berita red-folder (gunakan News Guard).

**The Inverse Blueprint** (IFVG)
- **IFVG** = FVG yang dilanggar dengan **penutupan body**; hanya FVG **tunggal** yang dihitung (bukan beberapa FVG berurutan).
- **Tipe 1 — POI → IFVG:** harga ditolak dari FVG/OB/POI; saat mendekat terbentuk satu FVG (di dalam/dekat POI), lalu FVG itu dilanggar body closure. **Tipe 2 — Sweep → IFVG:** harga menyapu likuiditas (swing high/low atau **Asian high/low**), saat menuju level terbentuk satu FVG, lalu dilanggar body closure setelah sweep.
- **Model Favorit** = tipe 1 + **BOS** searah + **inducement** tepat di bawah/atas FVG utama (boleh di dalamnya) + **DOL / low hanging fruit** jelas.
- **Empat cara entry** (pilihan personal, atur di Pengaturan): 1) body closure, 2) retrace ke awal IFVG, 3) retrace 50% IFVG, 4) FVG+FVG — awal/50% FVG pelanggar atau awal/50% **BPR** (overlap dua FVG).
- **Dua stop loss:** swing high/low, atau pelanggaran IFVG (tanpa SL tetap — keluar manual saat close di luar IFVG).
- **Dua breakeven:** Rule of 50 (di 50% RR geser SL ke BE, opsional ambil 50% profit) atau Low hanging fruit (setelah likuiditas terdekat disapu).
- **Take profit:** low hanging fruit (high/low terdekat), FVG mayor terdekat, atau analisis **external ↔ internal** (dari ujung range ke PD array di dalam, atau sebaliknya).
- **Timing:** killzone Asia 20:00–00:00, London 02:00–05:00, New York 07:00–10:00 (waktu NY) dan **macro** London 02:33–03:00 & 04:03–04:30, NY AM 08:50–09:10, 09:50–10:10 & 10:50–11:10, NY PM 11:50–12:10, 13:10–13:40 & 15:15–15:45. Order flow & struktur (PD array dihormati/dilanggar, sweep short-term, displacement) ditampilkan di detail pair.
- **Checklist enam poin** berkas: harga mencapai FVG/sweep → FVG di sisi berlawanan → killzone atau macro → body closure → likuiditas target jelas → SL jelas & RR layak.

**Tafsiran app** (di luar teks berkas, bisa diubah): RR "layak" untuk IFVG = RR minimum gaya (1:1.5 Intraday, 1:2 Swing); "low hanging fruit" = swing (fractal 2 candle) terdekat yang belum diambil, termasuk Asian high/low — bisa sangat dekat sehingga RR rendah; Unicorn memakai sesi New York sebagai item non-blocking; analisis memakai **candle yang sudah tutup** (body closure butuh candle tertutup); inducement = swing minor yang diambil harga sebelum pelanggaran.

> Model-model ini **belum diuji secara statistik**. Hasil backtest di bawah menyangkut model lama (Sweep+MSS, Retest POI).

## Hasil backtest — baca ini sebelum memakai sinyalnya

Engine ini **alat bantu keputusan, bukan sinyal yang terbukti punya edge.** Sudah diuji walk-forward di data Binance nyata (`scripts/backtest-ict.js`): engine hanya melihat candle yang sudah tutup, sinyal diikuti ke depan sampai TP atau SL.

| | Intraday (1H) | Swing (4H) |
|---|---|---|
| Sampel | 1.982 trade terisi, ±117 hari × 20 pair | 1.878 trade terisi, ±467 hari × 20 pair |
| Ekspektasi sebelum fee | **−0,03R** (t = −0,8) | **−0,01R** (t = −0,2) |
| Ekspektasi setelah fee* | **−0,24R** (t = −5,4) | **−0,11R** (t = −2,3) |
| Periode latih → uji (sebelum fee) | +0,03R → −0,14R | −0,02R → +0,01R |
| Hanya BTC+ETH | −0,22R (n = 204) | +0,01R (n = 206) |

\*Fee ≈ 0,09% harga per trade (maker 0,02% + taker 0,05% + slippage SL 0,02%). Stop yang rapat (< 0,4%) paling terpukul: fee memakan separuh R.

Yang lebih penting dari angka di atas:

- **Tidak ada fitur yang memprediksi hasil.** Dari 217 bucket fitur yang diuji (kedalaman discount, sweep, displacement, umur zona, bias HTF, PDH/PDL, sweep range Asia, breaker, OB+FVG overlap, killzone/US open, rezim choppy, open hari/pekan, ukuran risiko, dst.), **0** yang positif di periode latih *dan* uji dengan t-stat melewati ambang. Penyaring engine (bias HTF, RR, grade) tidak menambah nilai: sinyal yang lolos −0,02R vs yang ditolak −0,02R.
- **Grade A tidak lebih baik dari B**, dan "siap entry" tidak lebih baik dari "pantau".
- **Model exit tidak mengubahnya.** TP likuiditas, keluar semua di 1R, dan partial + breakeven semuanya berada di sekitar nol atau negatif.
- Kerangka ICT-crypto yang menjadi acuan proyek ini sendiri menyebut: *"tidak ada bukti statistik independen yang membuktikan edge-nya secara konsisten"* dan bahwa ICT *"sangat diskresioner"*. Hasil di atas sejalan dengan itu.

Keterbatasan backtest: spot sebagai pengganti futures (futures sering diblokir ISP), 20 pair terbesar, rezim pasar terbatas, tanpa funding, trade berdekatan saling berkorelasi (t-stat cenderung optimis, bukan pesimis), dan yang diuji hanya definisi ICT versi proyek ini — definisi lain bisa berbeda. Backtest juga **tidak** menilai kemampuan diskresioner trader yang menafsirkan konteks di luar aturan mekanis.

Jadi pakai app ini sebagai **peta struktur, likuiditas, dan zona** (bahan untuk analisis sendiri), bukan sebagai pemberi sinyal beli/jual. Kalau ingin mengujinya sendiri: `node scripts/backtest-ict.js` (opsi ada di komentar kepala berkas) dan `node scripts/analyze-features.js berkas.jsonl` untuk riset fitur.

## Menjalankan backtest di VPS (data futures asli)

Backtest di atas memakai data **spot** karena futures sering diblokir ISP. Kalau VPS Anda tidak memblokir Binance, jalankan di sana dengan **data futures USDT-M asli** — ini menutup keterbatasan terbesar hasil di atas.

**Tidak butuh API key.** Data pasar futures bersifat publik: skrip hanya memanggil `ping`, `ticker/24hr`, dan `klines`. Jangan menaruh API key di VPS ini untuk keperluan backtest, dan jangan pernah mengirim key ke siapa pun — termasuk ke Claude.

```bash
# Prasyarat: Node >= 18, git, curl
git clone https://github.com/patahpensil/ict-screening.git && cd ict-screening
curl -s https://fapi.binance.com/fapi/v1/ping        # harus membalas {}  (kalau gagal, VPS ini memblokir Binance)
bash scripts/vps-backtest.sh                         # opsi: PAIRS=30 HISTORY=4000 bash scripts/vps-backtest.sh
```

- Lama: puluhan menit (dominan komputasi). Pakai `tmux`/`screen`, atau `nohup bash scripts/vps-backtest.sh &`.
- Hasil: `results/<waktu>/RINGKASAN.txt` (backtest Intraday + Swing + analisis fitur latih/uji). Isinya tidak memuat data pribadi — tempel ke Claude untuk dianalisis.
- Skrip melakukan preflight kecil dulu (2 pair) supaya salah konfigurasi ketahuan sebelum run panjang, dan otomatis berhenti dengan pesan jelas kalau Binance tidak terjangkau.
- Binance membatasi request (weight/menit). Skrip memberi jeda 120 ms per request dan mundur otomatis saat kena 429/418. Jangan menjalankan beberapa instance sekaligus dari IP yang sama.
- Keamanan umum VPS: jangan jalankan sebagai root, aktifkan firewall dan login SSH dengan key (bukan password).

Opsi `--source=auto|futures|spot` pada `scripts/backtest-ict.js`: `auto` (default) mencoba futures lalu jatuh ke spot dengan peringatan, `futures` gagal tegas bila tidak terjangkau.

## Alat Bantu

- Rencana entry otomatis (Entry/SL/TP1/TP2/RR) berbasis POI, invalidasi struktural, dan target likuiditas, lengkap dengan **estimasi biaya (fee+slippage) dalam satuan R** supaya terlihat kapan stop terlalu rapat
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
scripts/test-ict-models.js     uji model Unicorn & IFVG terhadap aturan di kedua berkas panduan (angka eksak, cermin, fuzz)
scripts/backtest-concept.js     RISET: backtest konsep penuh BIAS→AREA→TRIGGER (model kelima vs entri acak; gerbang pada model lama); diuji test-backtest-concept.js
scripts/test-ict-gate.js       uji GERBANG konsep (mode ketat/longgar/mati; status siap/pantau/wait and see/tolak; trigger bawaan; peringkat)
scripts/test-ict-trigger.js    uji lapis TRIGGER H1 (masuk AREA → CHoCH/BOS → momentum → FVG/IFVG → entry; kedaluwarsa/batal; cermin; model kelima; fuzz)
scripts/test-ict-area.js       uji lapis AREA (band OTE, leg lantai 3x/bonus 5x, premium/discount, SNR bonus, cermin, fuzz)
scripts/test-ict-bias.js       uji lapis BIAS (struktur menentukan arah; MA/EMA hanya menimbang; fase koreksi/lanjutan; cermin; fuzz)
scripts/test-ict-filters.js    uji filter (MA200, EMA, volume spike, momentum): angka eksak, cermin, fuzz, keterpisahan dari engine
scripts/test-ict-track.js      uji pelacak Decision (armed → RUNNING → TP/SL/void, candle konservatif, SL close-based, cermin)
scripts/e2e-binance.js         uji end-to-end aplikasi asli terhadap Binance sungguhan (butuh Chrome + jaringan; opsional BINANCE_PROXY; tidak di CI)
scripts/smoke-browser.js       OPSIONAL: smoke test di Chrome/Edge headless dengan API Binance palsu
scripts/backtest-ict.js        OPSIONAL: backtest walk-forward di data Binance nyata (futures atau spot; butuh internet)
scripts/vps-backtest.sh        OPSIONAL: satu perintah untuk menjalankan backtest + analisis di VPS (tanpa API key)
scripts/analyze-features.js    OPSIONAL: riset fitur sinyal vs hasil trade (latih/uji + koreksi multiple-comparison)
.github/workflows/checks.yml   menjalankan pemeriksaan otomatis di GitHub
```

Sebelum commit, cukup pakai Node tanpa install apa pun:

```
node scripts/check.js
node scripts/test-ict.js
node scripts/test-ict-models.js
node scripts/test-ict-track.js
node scripts/test-ict-filters.js
node scripts/test-ict-bias.js
node scripts/test-ict-area.js
node scripts/test-ict-trigger.js
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
