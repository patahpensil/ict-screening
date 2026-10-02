# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ICT Screening — a Progressive Web App that screens Binance USDT-M Perpetual Futures in real time using **ICT / Smart Money Concepts**, entirely client-side (no backend, no API key, no build step). It talks directly to `fapi.binance.com` / `fstream.binance.com` from the user's browser. All persistent state (watchlist, journal, setup history, alerts, settings) lives in `localStorage` — nothing is sent to any server the app controls.

This repo is a **rewrite of the screening concept** of the original Patah Pensill (EMA/RSI/MACD/ADX-based AI Confluence Score + Momentum Quick Score + Markov Screener). Those three systems and **every classic indicator** were removed on purpose. Do not reintroduce them (see "Hard rules" below).

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
scripts/smoke-browser.js       OPTIONAL: drives index.html in headless Chrome/Edge against a fake Binance API
.github/workflows/checks.yml   runs selftest + check + test-ict + cache-bump on push + PR
```

## Development workflow

- Edit `index.html` directly; there's nothing to compile. Open it in a browser (or serve the folder statically) to test.
- **Before committing, run `node scripts/check.js` and `node scripts/test-ict.js`.**
  - `check.js` catches the class of mistake this single-file app is most prone to: a function called but never defined, a `getElementById` pointing at a missing id, a duplicate id, an inline `onclick` naming a missing function, or a syntax error. It checks *calls by name* only — it does **not** catch a reference to a deleted constant/variable.
  - `test-ict.js` extracts the block between the `/* ICT-ENGINE-START */` and `/* ICT-ENGINE-END */` markers in `index.html` and runs it in Node: a known bullish sweep+MSS scenario must give LONG with exact entry/SL/TP, its price-mirror must give SHORT with mirrored levels, an opposing HTF bias must give SKIP, plus a random-walk fuzz (no crashes, consistent plans, rare signals) and a ban on classic-indicator calls inside the engine block.
- For anything touching UI/flow, also run `node scripts/smoke-browser.js --shots=<folder>` (needs Chrome or Edge) and look at the screenshots. It mocks the Binance API with synthetic candles, so it is deterministic and offline. It fails on any exception or `console.error`.
- `node scripts/selftest.js` verifies the checker itself. Run it after changing `scripts/check.js`.
- These checks say nothing about whether the ICT *interpretation* is right for real markets — there is no backtest. That needs a human reading real charts.
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

`ictEvaluate` returns `best.status`: `in_zone` (price inside the entry zone = "siap entry") or `waiting` (valid but price hasn't retraced = "pantau"). UI and notifications must keep these two apart — Telegram/alarm notifications fire only for `in_zone`.

## Hard rules

- **No classic indicators, anywhere.** No EMA/SMA, RSI/StochRSI, MACD, ADX, ATR, Bollinger, VWAP, Fibonacci, momentum/quick scores, OI/long-short-ratio derived signals. `test-ict.js` bans their function names inside the engine block; keep the rest of the file clean too. The only market-data extras that remain are funding rate (display, filter, watchlist alert) and the 24h range position — neither may feed a setup decision.
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
