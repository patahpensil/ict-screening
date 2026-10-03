# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ICT Screening — a Progressive Web App that screens Binance USDT-M Perpetual Futures in real time using **ICT / Smart Money Concepts**, entirely client-side (no backend, no API key, no build step). It talks directly to `fapi.binance.com` / `fstream.binance.com` from the user's browser. All persistent state (watchlist, journal, setup history, alerts, settings) lives in `localStorage` — nothing is sent to any server the app controls.

This repo is a **rewrite of the screening concept** of the original Patah Pensill (EMA/RSI/MACD/ADX-based AI Confluence Score + Momentum Quick Score + Markov Screener). Those three systems were removed on purpose. Classic indicators were also removed at first; since 2026-10-04 the owner allows a small set back **only as FILTERS that weigh, never as the decider** (see "Hard rules" below).

The README.md (in Indonesian) is the product-level source of truth for features and the screening pipeline — read it first for what the app does before touching how it's coded.

## Repo structure

There is no build system, package manager, or bundler, and nothing to compile. It is deployed as-is to GitHub Pages. The scripts below are zero-dependency (Node only).

```
index.html                     the entire app: HTML + CSS + JS in one file (~4,400 lines)
sw.js                          service worker — caches the app shell, never caches live API data
manifest.json                  PWA metadata
icon-*.png                     app icons
scripts/check.js               static checks (syntax, undefined functions, DOM ids, inline handlers)
scripts/check-cache-bump.js    enforces the CACHE_NAME rule below
scripts/selftest.js            proves check.js actually rejects defects, so it can't rot into always-green
scripts/test-ict.js            behaviour tests for the ICT engine (synthetic candles with known answers)
scripts/test-ict-models.js     tests for the Unicorn & Inverse Blueprint (IFVG) models against the rules in the two guide PDFs
scripts/test-ict-filters.js    tests for the FILTER block (MA200, EMA, volume spike, momentum) — exact numbers, mirror, fuzz, separation from the engine
scripts/test-ict-track.js      tests for the Decision tracker (armed → running → TP/SL/void, conservative candle rules)
scripts/e2e-binance.js         end-to-end test of the REAL app against REAL Binance (needs Chrome + network; optional BINANCE_PROXY; not in CI)
scripts/smoke-browser.js       OPTIONAL: drives index.html in headless Chrome/Edge against a fake Binance API
scripts/backtest-ict.js        OPTIONAL: walk-forward backtest on real Binance data (needs internet)
scripts/analyze-features.js    OPTIONAL: feature-vs-outcome research on a backtest dump
scripts/vps-backtest.sh        OPTIONAL: one-command futures backtest for a VPS (public data only — NO API key, ever)
.github/workflows/checks.yml   runs selftest + check + test-ict + cache-bump on push + PR
```

## Development workflow

- Edit `index.html` directly; there's nothing to compile. Open it in a browser (or serve the folder statically) to test.
- **Before committing, run `node scripts/check.js`, `node scripts/test-ict.js`, `node scripts/test-ict-models.js` and `node scripts/test-ict-track.js` and `node scripts/test-ict-filters.js`.**
  - `check.js` catches the class of mistake this single-file app is most prone to: a function called but never defined, a `getElementById` pointing at a missing id, a duplicate id, an inline `onclick` naming a missing function, or a syntax error. It checks *calls by name* only — it does **not** catch a reference to a deleted constant/variable.
  - `test-ict.js` extracts the block between the `/* ICT-ENGINE-START */` and `/* ICT-ENGINE-END */` markers in `index.html` and runs it in Node: a known bullish sweep+MSS scenario must give LONG with exact entry/SL/TP, its price-mirror must give SHORT with mirrored levels, an opposing HTF bias must give SKIP, plus a random-walk fuzz (no crashes, consistent plans, rare signals) and a ban on classic-indicator calls inside the engine block.
- For anything touching UI/flow, also run `node scripts/smoke-browser.js --shots=<folder>` (needs Chrome or Edge) and look at the screenshots. It mocks the Binance API with synthetic candles, so it is deterministic and offline. It fails on any exception or `console.error`.
- `node scripts/selftest.js` verifies the checker itself. Run it after changing `scripts/check.js`.
- These checks say nothing about whether the ICT *interpretation* is right for real markets. `backtest-ict.js` measures it on real data (result so far: no edge — see README and "Research tooling" below); what it cannot judge is a human trader's discretion.
- Deploy = push to the `main` branch. GitHub Pages is configured in "deploy from a branch" mode and rebuilds automatically (roughly 30–45 seconds). There is no deploy workflow, and none is needed.

### ⚠️ MANDATORY: bump the cache version on every change

**Any time `index.html` or `sw.js` is modified, `CACHE_NAME` on line 1 of `sw.js` MUST be bumped** (e.g. `ict-screening-v73` → `ict-screening-v74`). CI enforces it — `scripts/check-cache-bump.js` fails the build if either file changed without the version moving. The service worker precaches the app shell (`SHELL_FILES`) under this version key and only purges old caches when the key changes (`activate` handler in `sw.js`). Skip the bump and users' browsers keep serving the stale cached shell indefinitely.

## Code organization inside `index.html`

Still **one physical file**. The `<script>` block is divided into numbered sections by large comment banners that are labeled like filenames (a leftover convention). Search for these exact strings to jump around — they are text labels inside comments, not real files:

| Banner (comment text, not a file) | Covers |
|---|---|
| `01-storage-alerts.js` | Config constants (`FAPI`, TV bridge URL), `safeFetch` w/ rate-limit backoff, all `localStorage` read/write (watchlist, journal, **setup history**, price alerts, Telegram config), alarm (beep/vibrate/banner), `pushAlert`, position-size calculator |
| `02-binance-api.js` | Raw Binance REST calls (exchangeInfo, 24hr ticker, funding), `enrichTicker`, the WebSocket connection for real-time ticker/mark-price updates, `refreshAll`, list rendering (`rowStatusBadgeHtml`, `renderTopSignals`, `coinRowHtml`) |
| `03-ict-engine.js` | **The ICT engine** (between the `ICT-ENGINE-START/END` markers — pure functions, no DOM, no network) followed by klines cache/fetch |
| `04-scanner-engine.js` | Liquidity filter, lazy per-row 4H bias scan, `scanPairIct`, `runIctScan` (shared by Mode Trading and Deep Scan), watchlist alerts |
| `05-advanced-scan-events.js` | DOM event wiring (search, filter, sort, mode pills), auto-refresh, alert/settings drawers |
| `06-router-detail-setup.js` | The 4-workspace router (`showWorkspace`), sidebar/drawer behavior, export/import, then the detail modal: `loadDetail`, `renderDetail`, `selectWorkspaceSymbol`, News Guard |
| `08-entry-plan-init.js` | "Copy Summary for AI" text builder + 5 agent profiles, TradingView bridge, journal wiring, app init/bootstrap sequence |

## The screening pipeline — three stages, no scores

There is **no 0–100 score anywhere**. The output is an explicit decision (`LONG` / `SHORT` / `SKIP`) backed by a pass/fail checklist.

1. **Liquidity filter** — `ICT_MIN_QUOTE_VOL` (24h quote volume). Pairs below it are never scanned.
2. **Setup detection** (`ictSetupSweepMss`, `ictSetupPoiRetest`) on the entry timeframe. A sweep-only state (no MSS yet) is *not* a setup; it is reported in `watch`.
3. **Validation** (`ictChecklist`) across timeframes. Checks marked `blocking` (HTF bias aligned, RR to a liquidity target ≥ `minRR`) must pass; grade = share of checks passed (A ≥ 85%, B ≥ 65%, else C = SKIP).

Style config lives in `ICT_CFG.styles` (the single place defining LTF/HTF/HTF2 and `minRR`): `intraday` = 1H entry / 4H bias / 1D context, `swing` = 4H / 1D / 1W. Scalping was removed on purpose.

Candidates also carry `features` (`ictFeatures`) for research only — never read them in decision logic.

`ictEvaluate` returns `best.status`: `in_zone` (price inside the entry zone = "siap entry") or `waiting` (valid but price hasn't retraced = "pantau"). UI and notifications must keep these two apart — Telegram/alarm notifications fire only for `in_zone`.

## Research tooling & aturan metodologi (PENTING)

`scripts/backtest-ict.js` (walk-forward di data nyata, `--dump=` menyimpan SEMUA kandidat + fitur) dan `scripts/analyze-features.js` (bucket fitur → ekspektasi R, latih vs uji, ambang ★ ketat) adalah cara resmi menilai perubahan engine. Hasil terakhir: **tidak ada edge** (lihat README). Aturannya:

- **Jangan menjadikan sebuah fitur/aturan sebagai syarat keputusan tanpa bukti.** Syaratnya: positif di periode latih DAN uji, t-stat ≥ ambang Bonferroni, n besar. Puluhan bucket diuji sekaligus, jadi bucket yang "kelihatan bagus" hampir pasti kebetulan. Fitur riset di `ictFeatures` sengaja TIDAK dipakai dalam keputusan.
- **Jangan melonggarkan simulasi.** Di candle tempat limit order terisi, urutan high/low tidak diketahui, jadi hanya SL yang dihitung di candle itu (TP/1R baru dari candle berikutnya). Tanpa aturan ini exit 1R tampak punya edge +0,12R/+0,17R — itu murni artefak (turun jadi −0,12R setelah dikoreksi). `--no-intrabar-guard` hanya untuk membuktikan bias itu.
- **Curigai hasil bagus.** Dalam permainan adil, mengubah titik exit/entry tidak menciptakan edge. Kalau sebuah varian tiba-tiba positif, cari bias simulasinya dulu (look-ahead, ambiguitas intrabar, fill optimistis) sebelum merayakan.
- Hitung selalu **setelah fee** (`ICT_FEE_ROUNDTRIP`): stop rapat membuat fee memakan separuh R.
- Backtest memakai candle yang SUDAH TUTUP; app live menganalisis candle yang sedang terbentuk juga (belum diukur seberapa besar bedanya). Jangan mengklaim hasil backtest berlaku persis untuk sinyal live.
- Jangan mengubah teks UI menjadi lebih yakin daripada bukti: produk diposisikan sebagai alat bantu keputusan.
- **Tooling riset tidak pernah memakai API key.** Backtest/riset hanya memanggil endpoint data publik Binance (ping, ticker/24hr, klines). Jangan menambah kode yang membaca `BINANCE_*`, menandatangani request, atau mengirim `X-MBX-APIKEY`. Eksekusi order otomatis sengaja di luar cakupan (hasil backtest: ekspektasi negatif setelah fee).

## Unicorn & Inverse Blueprint models (from two guide PDFs)

`ictSetupUnicorn` and `ictIfvgCandidates` (between the engine markers) implement the rules of the two guides the user supplied ("ICT Unicorn Model", "The Inverse Blueprint"). Their instrument/timeframe parameters (ES/XAUUSD/EURUSD, M3–M15) are intentionally NOT used — the app's own Intraday/Swing timeframes apply. Rules to keep when touching them:

- **Follow the guides literally.** Killzones are exactly Asia 20:00–00:00, London 02:00–05:00, New York 07:00–10:00 (NY time) plus the macro table (`ICT_MACROS`) — do not add windows the guides do not list (an earlier "London Close" was removed for this reason). Unicorn: SL at the BODY extreme of the manipulation leg, TP = 2 STDV or DOL, min 2R, no management. IFVG: only a SINGLE FVG counts, violation = body closure, six-item checklist, four entry methods, two SLs, two breakevens, TP = LHF / major FVG / external↔internal.
- **Anything not in the guides is an "(app)" interpretation** and is listed in README ("Tafsiran app"). Keep that list honest when you add one.
- **Only CLOSED candles are analysed** (`fetchKlinesFull` drops the still-forming candle) because "body closure" is only valid on a closed candle. Do not reintroduce the forming candle.
- Entry/SL/TP/breakeven choices are user preferences (`ICT_DEFAULT_PREFS`, stored in `ict_model_prefs`, passed as `opts.prefs` to `ictEvaluate`); the engine stays pure and must never read `localStorage`.
- Both models are statistically UNTESTED. Do not claim edge for them (see "Research tooling & aturan metodologi").

## Navigasi & konsistensi scan (jangan dirusak)

- **Tombol back/tutup harus punya handler.** `← Aksi Cepat` (`#modeResultsClose`) pernah tanpa listener = tombol mati, dan `check.js` tidak menangkapnya (ia hanya memeriksa id/fungsi, bukan listener). Tombol baru → pasang handler dan tambah klik-nya ke `scripts/smoke-browser.js`.
- **Back peramban/HP** ditangani `closeTopLayer()` + `popstate` + entri riwayat "penjaga" (`BACK_GUARD`): back menutup lapisan teratas (modal → sidebar → panel → workspace non-Home) lalu memasang penjaga lagi; tanpa lapisan terbuka, back dibiarkan keluar. Lapisan UI baru (modal/panel) harus didaftarkan di `closeTopLayer()`. Tombol tutup di layar tidak menyentuh riwayat.
- **Hasil scan = keputusan Decision.** Baris/kartu hasil scan memanggil `openDetail(symbol, tf)` dengan TF entry gayanya (`ICT_CFG.styles[style].ltf`: Intraday 1h, Swing 4h). Jangan buka detail tanpa `tf` dari hasil scan — itu pernah membuat pair hasil Intraday terbuka di 4H (Swing) dan tampil SKIP. Smoke test membandingkan keduanya.
- **Deep Scan:** satu baris per pair (setup terbaik antar gaya), maksimal 20, urut siap-entry → `ictQuality()` (grade + rasio syarat lulus) → syarat lulus → likuiditas. **RR bukan kunci urut.** `ictQuality` adalah kualitas setup, BUKAN probabilitas menang — jangan menampilkan "% peluang" selama edge belum terbukti.

## Decision (pelacak setup RUNNING)

- Workspace `wsDecision` (tombol Decision di Home + sidebar) berisi pair yang harganya SUDAH menyentuh Entry. Tombol itu tidak lagi membuka Trading Workspace.
- Siklus: `armSetups()` (dipanggil `runIctScan` untuk setiap hasil scan; setup yang harganya sudah melewati SL/TP1 tidak didaftarkan) → `armed` → harga menyentuh Entry → `running` → TP terakhir / SL → `closed` dan hilang dari Decision. **Multi-TP:** TP1/TP2/TP3 (TP3 hanya dari Sweep+MSS, Retest POI, IFVG) dicatat bertahap di `rec.tpHit` dan trade tetap running sampai TP terakhir; SL tetap di level awal (SL setelah TP1 = tetap −1R, `tpHit` mencatat TP yang sempat tercapai). `void` (TP tercapai tanpa menyentuh Entry) dan `expired` (Intraday 24 jam, Swing 7 hari) bukan trade dan tidak dicatat.
- **Logika status ada di blok `ICT-TRACK-START/END` (murni, tanpa DOM/jaringan), diuji `scripts/test-ict-track.js`.** Aturan konservatif sama dengan backtest: di candle fill hanya SL yang dihitung; SL dan TP satu candle → SL. SL "pelanggaran IFVG" (`slCloseBased`) hanya dinilai dari penutupan candle LTF, bukan tick.
- Data RUNNING: OI (REST `openInterest`, ±15 dtk), CVD + orderbook (WebSocket `aggTrade` + `depth20@500ms`, maks `TRACK_MAX_LIVE` pair), struktur CHoCH/BOS (candle tutup TF entry, ±30 dtk). **Hanya tampilan — jangan pernah memasukkannya ke `ictEvaluate`/penilaian setup** (engine tetap bebas indikator, lihat "Hard rules"). Semua lewat `safeFetch` / WebSocket publik, tanpa API key.
- Pemantauan hanya jalan selama app terbuka; saat dibuka lagi atau tab kembali aktif, `trackReconcile` menutup celah dari candle 1m/5m/15m. Asumsi fill = order limit di Entry; tanpa fee/slippage.
- **Setiap pair yang keluar wajib tercatat otomatis di Histori Setup** (`historyFromTrack`, entri `auto:true` + `trackId`, WIN/LOSE, label TP1/TP2/TP3/SL, R, ringkasan kondisi saat keluar dari `trackAutoNote`). Entri SL WAJIB diberi keterangan oleh pengguna (`needsNote` sampai `saveHistoryNote` diisi; lencana di sidebar + panel terbuka otomatis saat app dibuka). Jurnal (Review) juga menerima entri otomatis. Ini catatan forward-test; jangan dicampur dengan klaim edge dan jangan masukkan hasil auto ke `computeSetupHistoryStats` akurasi manual (sudah dipisah).
- Catatan tersimpan di `localStorage` kunci `ict_track_v1`.

## Binance live-API gotchas (dari uji nyata — jangan dilupakan)

- **Endpoint WebSocket futures dipecah:** ticker/markPrice/aggTrade di `wss://fstream.binance.com/market/stream`, depth di `/public/stream`. Endpoint lama `/stream` kini mengirim NOL pesan untuk `!ticker@arr`/`!markPrice` dan tidak mengirim `aggTrade` sama sekali (koneksinya tetap "open"). WS utama memakai `WS_MAIN_URLS` (market dulu, lama sebagai cadangan); stream Decision memakai dua koneksi (`TRACK_SOCKS`). **Status "Live" baru dinyatakan setelah PESAN PERTAMA datang, bukan saat `onopen`**, dan ada watchdog untuk koneksi bisu.
- **Simbol non-ASCII dilewati** (`isTradableUsdtPerp`, mis. `币安人生USDT`): `enrichTicker` menghapus karakter non-ASCII sehingga namanya jadi "USDT" dan semua request klines-nya HTTP 400.
- **Engine memakai close candle TUTUP**, harga live bisa sudah melewati rencana: daftar scan membuang setup yang harga live-nya melewati SL/TP1 (`ictPlanBeyondLive`), dan `armSetups` tidak mendaftarkannya.
- **Tick harga ditahan (`trackReady`) sampai riwayat candle diproses** saat app dibuka / setelah celah >15 dtk, supaya setup yang sebenarnya sudah terisi lalu kena TP tidak salah dicap void.
- Uji nyata: `BINANCE_PROXY=socks5://127.0.0.1:1080 node scripts/e2e-binance.js` (ISP Indonesia memblokir Binance; pakai terowongan SSH ke VPS). Smoke test (mock) memakai jam beku 21:00Z karena hasil scan bergantung jam dinding (level Asian/killzone).

## Hard rules

- **Indicators are FILTERS only (owner decision 2026-10-04).** Price structure decides direction ("struktur is KING"); ICT (BIAS → AREA → TRIGGER) decides entries. Allowed as weighing filters, in the separate `ICT-FILTERS-START/END` block only: MA200 (SMA), EMA 21/30/50, volume spike, displacement. A filter may change *phase* (correction vs continuation), the *depth of area accepted*, or *ranking* — it must never flip the bias, create a setup, or veto one on its own. Still banned: RSI/StochRSI, MACD, ADX, ATR, Bollinger, VWAP, scores/quick scores, and OI/long-short-ratio as signals. Fibonacci is pending the Fib-vs-OTE study. **`test-ict.js` still bans indicator names inside the ICT-ENGINE block, and `test-ict-filters.js` checks the engine never calls a filter** — keep the engine pure and let the filters weigh from outside. Funding rate and 24h range position stay display/filter only.
- **Data depth:** `ICT_FETCH = 400` candles are fetched per timeframe (same Binance weight as 200; MA200 needs >200) but the ICT engine only ever reads `ictWindow()` = the last `ICT_CANDLES = 200`, so engine behaviour is unchanged. Filters get the full candles (`ev.raw`, `rawByTf`).
- **The engine block stays pure.** Nothing between `ICT-ENGINE-START` and `ICT-ENGINE-END` may touch `document`, `localStorage`, `fetch`, or app globals (it defines its own `fmtPriceSafe`). That is what makes `test-ict.js` possible.
- **One definition of each ICT concept.** Swings/zigzag, structure events, liquidity pools, FVG, OB, dealing range, killzone each exist once in the engine and are reused by the scanner, detail view, alerts, and AI prompt. Do not write a second structure/liquidity routine in UI code — a recurring bug source in the original app was the same pair showing different readings in different places.
- **Tuning knobs live in `ICT_CFG`** (swing bars, equal-level tolerance, sweep/MSS lookbacks, displacement multiple, OTE band, SL buffer, max zone distance, POI age). If you change one, rerun `test-ict.js` — the fuzz test guards against a screener that fires on noise.

## Key architectural conventions

- **Global mutable state** lives in top-level `let`s: `tickerData` (merged 24hr REST + WS data), `deepData` (per-symbol 4H bias for list badges), `allSymbols`, `lastDetailFull` (last rendered detail's full result — `{d, ev, finalDecision, newsGuardActive}` — used by Copy-for-AI, Save-to-History, Journal), `lastScanResults` (feeds the Home "Setup ICT Terbaru" card), `currentWorkspace`.
- **REST + WebSocket hybrid**: initial load is REST (`refreshAll()`), then `connectBinanceWS()` layers on real-time ticker/mark-price streams, merged into the same `tickerData`. If WS fails, REST polling every 45s keeps working — don't make features hard-depend on WS.
- **Rate-limit handling**: all Binance calls go through `safeFetch` (exponential backoff on 429/418). Any new API call must use it. Klines go through `fetchKlinesFull` → `cachedFetch` (40s cache); keep using `ICT_CANDLES` as the limit so identical requests dedupe.
- **Stale-response guards**: scans use `modeScanToken`, detail loads use `detailRequestToken`; a newer request makes older ones stop silently. Any new async flow that writes to the screen needs the same pattern.
- **The service worker never caches live data**: any URL containing `fapi.binance.com` or `fstream.binance.com` bypasses the cache. Only app shell files are cached; `index.html`/`manifest.json` are network-first. Don't add Binance endpoints to `SHELL_FILES`.
- **No secrets anywhere**: no API keys by design. Telegram and TradingView bridge config live in `localStorage` only, set by the user via UI — never hardcode credentials or bridge URLs.
- **If this repo is ever pushed to a PUBLIC GitHub repo:** before every commit, check the diff for any Telegram bot token, chat ID, or bridge URL (e.g. LAN IPs like `192.168.x.x:8787`) pasted in for local testing — none of that may be committed.
- **`pushAlert(msg, symbol, isAlarm, telegramMsg)`** is the single, sole pathway for all alerts (log entry, vibrate, beep, banner, browser Notification, Telegram). Telegram is only sent when `isAlarm=true`. `pushAlert` does not dedupe — callers own their cooldown (the scan uses `pp_deepscan_alerted` with a 30-minute cooldown keyed `symbol_side_style`; watchlist alerts use the per-session `alertFiredThisSession` set keyed per event). Any new alert-producing feature goes through `pushAlert` with its own cooldown.
- **Setup history** (`pp_setup_history`) stores the plan (entry/SL/TP) at save time. "Cek Sekarang" compares the *current price* to those levels; it does not replay the candle path. Keep the UI copy honest about that.
