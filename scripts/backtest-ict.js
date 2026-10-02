#!/usr/bin/env node
/**
 * Backtest walk-forward sederhana untuk engine ICT — OPSIONAL, butuh internet, tidak dijalankan di CI.
 *
 * Tujuan: mengukur apakah sinyal engine punya edge di data NYATA, bukan cuma lolos uji sintetis.
 * Di tiap candle penutupan, engine hanya melihat candle yang SUDAH TUTUP (tidak ada look-ahead; HTF diselaraskan
 * berdasarkan waktu tutup). Sinyalnya lalu diikuti ke depan: entry di harga rencana (limit), exit di SL atau TP1
 * mana yang kena duluan. Kalau SL dan TP kena di candle yang sama, dihitung SL (konservatif).
 *
 * Sumber data (--source=auto|futures|spot, default auto):
 *   futures = fapi.binance.com USDT-M (data PUBLIK, tanpa API key) — pilihan terbaik; sering diblokir ISP, biasanya jalan di VPS.
 *   spot    = data-api.binance.vision (mirror data publik, pasar SPOT) — pendekatan; candle spot ≈ futures untuk pair yang sama.
 *   auto    = coba futures, kalau tidak terjangkau jatuh ke spot dan mencetak peringatan.
 * SKRIP INI TIDAK PERNAH MEMBUTUHKAN ATAU MEMBACA API KEY. Tidak memodelkan fee, slippage, funding.
 *
 * Jalankan: node scripts/backtest-ict.js [--pairs=20] [--style=intraday|swing|both] [--history=3000] [--split=0.6]
 *             [--hold=48] [--wait=12] [--set=slBufferFrac=0.15,tpMode=nearest] [--exit=tp|oneR|partial] [--symbols=BTCUSDT,ETHUSDT]
 *             [--source=auto|futures|spot] [--delay=ms jeda antar request, default 120 untuk futures]
 * Data diunduh sekali per jam lalu di-cache di folder temp. --set menimpa parameter ICT_CFG HANYA untuk run ini.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const NPAIRS = parseInt(arg('pairs', '20'), 10);
const STYLE = arg('style', 'both');
const SOURCE_ARG = arg('source', 'auto');
const SPOT = { tag: 'spot', name: 'SPOT (mirror data-api.binance.vision)', base: 'https://data-api.binance.vision', klines: '/api/v3/klines', ticker: '/api/v3/ticker/24hr', ping: '/api/v3/ping' };
const FUT = { tag: 'fut', name: 'FUTURES USDT-M (fapi.binance.com)', base: arg('futures-base', 'https://fapi.binance.com'), klines: '/fapi/v1/klines', ticker: '/fapi/v1/ticker/24hr', ping: '/fapi/v1/ping' };
let SRC = SPOT;   // diisi pickSource() sebelum dipakai
let DELAY = parseInt(arg('delay', '-1'), 10); // ms antar request; -1 = otomatis (120 untuk futures, 0 untuk spot)
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function reachable(src) {
  try { const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 7000); const r = await fetch(src.base + src.ping, { signal: ctl.signal }); clearTimeout(tm); return r.ok; } catch (e) { return false; }
}
async function pickSource() {
  if (SOURCE_ARG === 'spot') return SPOT;
  const ok = await reachable(FUT);
  if (SOURCE_ARG === 'futures') { if (!ok) { console.error('Futures (' + FUT.base + ') tidak terjangkau dari jaringan ini. Coba dari VPS, atau pakai --source=spot.'); process.exit(3); } return FUT; }
  if (ok) return FUT;
  console.warn('⚠️  Futures tidak terjangkau — memakai SPOT sebagai pendekatan. Untuk data futures asli, jalankan dari jaringan yang tidak memblokir Binance (mis. VPS).');
  return SPOT;
}
const HISTORY = parseInt(arg('history', '3000'), 10); // jumlah candle LTF per pair (paginasi 1000/request)
const SPLIT = parseFloat(arg('split', '0.6'));          // porsi awal = periode LATIH, sisanya = UJI (tidak disentuh saat tuning)
const NO_INTRABAR_GUARD = process.argv.includes('--no-intrabar-guard'); // HANYA untuk membuktikan bias: mematikan aturan candle-fill konservatif
const EXIT = arg('exit', 'tp');                         // model exit: tp | oneR | partial
const SYMBOLS = arg('symbols', '');                      // daftar pair eksplisit, mis. BTCUSDT,ETHUSDT (menimpa --pairs)
const DUMP = arg('dump', '');                           // tulis SEMUA kandidat (termasuk yang ditolak engine) + fitur ke file JSONL untuk analisis
const os = require('os');
const CACHE_DIR = path.join(os.tmpdir(), 'ict-backtest-cache');
fs.mkdirSync(CACHE_DIR, { recursive: true });

// ---------- muat engine dari index.html ----------
const html = fs.readFileSync(path.resolve(__dirname, '..', 'index.html'), 'utf8');
const a = html.indexOf('/* ICT-ENGINE-START */'), b = html.indexOf('/* ICT-ENGINE-END */');
const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Object, Array, String });
vm.runInContext(html.slice(a, b) + ';this.E={ICT_CFG,ictEvaluate};', ctx);
const { ICT_CFG, ictEvaluate } = ctx.E;

// Override parameter engine untuk eksperimen: --set=slBufferFrac=0.15,tpMode=nearest
(arg('set', '') || '').split(',').filter(Boolean).forEach(kv => {
  const [k, v] = kv.split('=');
  if (!(k in ICT_CFG)) { console.error('parameter tidak dikenal: ' + k); process.exit(1); }
  ICT_CFG[k] = typeof ICT_CFG[k] === 'number' ? parseFloat(v) : v;
});
const HOLD = { intraday: parseInt(arg('hold', '48'), 10), swing: parseInt(arg('hold', '42'), 10) }; // candle LTF
const WAIT = parseInt(arg('wait', '12'), 10); // candle menunggu harga menyentuh entry limit

async function get(url) {
  for (let i = 0; i < 5; i++) {
    try {
      if (DELAY > 0) await sleep(DELAY);
      const r = await fetch(url);
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status === 418) { console.warn(`rate limit Binance (${r.status}) — jeda ${5 * (i + 1)} dtk`); await sleep(5000 * (i + 1)); continue; }
    } catch (e) { /* ulang */ }
    await sleep(800);
  }
  throw new Error('gagal: ' + url);
}
async function klines(symbol, interval, total) {
  const f = path.join(CACHE_DIR, `${SRC.tag}_${symbol}_${interval}_${total}_${new Date().toISOString().slice(0, 13)}.json`); // cache per jam & per sumber
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, 'utf8'));
  let out = [], end = null;
  while (out.length < total) {
    const lim = Math.min(1000, total - out.length);
    const raw = await get(`${SRC.base}${SRC.klines}?symbol=${symbol}&interval=${interval}&limit=${lim}` + (end ? `&endTime=${end}` : ''));
    if (!raw.length) break;
    out = raw.map(k => ({ open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5], t: k[0], ct: k[6] })).concat(out);
    end = raw[0][0] - 1;
    if (raw.length < lim) break;
  }
  fs.writeFileSync(f, JSON.stringify(out));
  return out;
}

const STABLE = new Set(['USDC', 'FDUSD', 'TUSD', 'BUSD', 'USDP', 'DAI', 'EUR', 'AEUR', 'USDE', 'XUSD', 'PAXG', 'WBTC', 'WBETH', 'BFUSD']);
async function topPairs(n) {
  const t = await get(`${SRC.base}${SRC.ticker}`);
  // futures: buang kontrak delivery bertanggal (mis. BTCUSDT_250627) — hanya perpetual
  return t.filter(x => x.symbol.endsWith('USDT') && !x.symbol.includes('_') && !/(UP|DOWN|BULL|BEAR)USDT$/.test(x.symbol) && !STABLE.has(x.symbol.slice(0, -4)))
    .sort((p, q) => +q.quoteVolume - +p.quoteVolume).slice(0, n).map(x => x.symbol);
}

// HTF yang SUDAH TUTUP pada waktu `ct` (tutup candle LTF)
function closedUpTo(arr, ct) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].ct <= ct) lo = m + 1; else hi = m; }
  return arr.slice(0, lo);
}

// simulasi 1 sinyal: limit di plan.entry, SL/TP1
function simulate(sig, ltf, from, hold) {
  const { side, plan } = sig;
  const risk = Math.abs(plan.entry - plan.sl);
  if (!(risk > 0) || plan.tp === null) return null;
  let filledAt = -1;
  for (let j = from; j < Math.min(ltf.length, from + WAIT); j++) {
    const c = ltf[j];
    // invalidasi sebelum terisi: harga menembus SL tanpa menyentuh entry
    if (side === 'long' ? c.low <= plan.sl : c.high >= plan.sl) { if (!(side === 'long' ? c.low <= plan.entry : c.high >= plan.entry)) return { filled: false }; }
    if (side === 'long' ? c.low <= plan.entry : c.high >= plan.entry) { filledAt = j; break; }
  }
  if (filledAt < 0) return { filled: false };
  // Model exit (--exit=): 'tp' = satu TP di likuiditas (default) | 'oneR' = keluar semua di 1R |
  // 'partial' = separuh keluar di 1R, stop sisanya digeser ke breakeven, sisa menuju TP likuiditas (kerangka "TP1 1:1, TP2 likuiditas").
  const oneR = side === 'long' ? plan.entry + risk : plan.entry - risk;
  let partialDone = false, banked = 0, curSl = plan.sl;
  const sideR = px => (side === 'long' ? px - plan.entry : plan.entry - px) / risk;
  for (let j = filledAt; j < Math.min(ltf.length, filledAt + hold); j++) {
    const c = ltf[j];
    // Candle tempat limit terisi: urutan high/low di dalam candle TIDAK diketahui. Target bisa saja tercapai SEBELUM harga turun
    // ke entry. Maka di candle fill hanya SL yang dihitung (konservatif); TP/1R baru boleh dari candle berikutnya.
    // (Tanpa aturan ini backtest memberi kemenangan palsu, terutama pada target dekat seperti 1R.)
    const fillCandle = j === filledAt && !NO_INTRABAR_GUARD;
    const hitSl = side === 'long' ? c.low <= curSl : c.high >= curSl;
    const hitTp = !fillCandle && (side === 'long' ? c.high >= plan.tp : c.low <= plan.tp);
    const hit1R = !fillCandle && (side === 'long' ? c.high >= oneR : c.low <= oneR);
    if (EXIT === 'oneR') {
      if (hitSl) return { filled: true, R: -1, out: 'SL', bars: j - filledAt };
      if (hit1R) return { filled: true, R: 1, out: 'TP', bars: j - filledAt };
      continue;
    }
    if (EXIT === 'partial') {
      if (hitSl) return partialDone ? { filled: true, R: banked, out: 'BE', bars: j - filledAt } : { filled: true, R: -1, out: 'SL', bars: j - filledAt };
      if (!partialDone && hit1R) { partialDone = true; banked = 0.5; curSl = plan.entry; if (plan.rr <= 1) return { filled: true, R: 1, out: 'TP', bars: j - filledAt }; }
      if (hitTp) return { filled: true, R: partialDone ? banked + 0.5 * plan.rr : plan.rr, out: 'TP', bars: j - filledAt };
      continue;
    }
    if (hitSl) return { filled: true, R: -1, out: 'SL', bars: j - filledAt };
    if (hitTp) return { filled: true, R: plan.rr, out: 'TP', bars: j - filledAt };
  }
  const endIdx = Math.min(ltf.length, filledAt + hold) - 1;
  if (endIdx - filledAt + 1 < hold) return null; // data habis sebelum trade selesai — jangan dihitung
  const last = ltf[endIdx].close;
  const mtm = sideR(last);
  const R = EXIT === 'partial' && partialDone ? banked + 0.5 * mtm : mtm;
  return { filled: true, R, out: 'TIMEOUT', bars: hold };
}

async function backtestPair(symbol, style) {
  const cfg = ICT_CFG.styles[style];
  const ratio = { '1h': 1, '4h': 4, '1d': 24, '1w': 168 };
  const need = tf => Math.min(1000 * 4, Math.ceil(HISTORY * ratio[cfg.ltf] / ratio[tf]) + 250); // HTF cukup menutupi rentang LTF + pemanasan
  const [ltf, htf, htf2] = await Promise.all([klines(symbol, cfg.ltf, HISTORY), klines(symbol, cfg.htf, need(cfg.htf)), klines(symbol, cfg.htf2, need(cfg.htf2))]);
  const trades = [];
  const lastSignalAt = {};
  const WARM = 200;
  for (let i = WARM; i < ltf.length - 1; i++) {
    const slice = ltf.slice(i - 199, i + 1); // 200 candle terakhir yang sudah tutup — sama dengan yang ditarik app
    const ct = slice[slice.length - 1].ct;
    const h = closedUpTo(htf, ct).slice(-200), h2 = closedUpTo(htf2, ct).slice(-200);
    if (h.length < 30) continue;
    const ev = ictEvaluate(style, slice, h, h2.length >= 20 ? h2 : null, new Date(ct));
    // Mode normal: hanya sinyal yang engine loloskan (best + valid). Mode --dump: semua kandidat, valid atau tidak.
    const list = DUMP ? ev.candidates.filter(c => c.status !== 'invalid' && c.plan.tp !== null) : (ev.decision === 'SKIP' || !ev.best ? [] : [ev.best]);
    for (const c of list) {
      const valid = ev.best === c && ev.decision !== 'SKIP';
      const key = c.id + '|' + c.side + '|' + (valid ? 'v' : 'x');
      if (lastSignalAt[key] !== undefined && i - lastSignalAt[key] < 12) continue; // satu sinyal per setup/arah per 12 candle
      lastSignalAt[key] = i;
      const res = simulate(c, ltf, i + 1, HOLD[style]);
      if (res === null) continue;
      const phase = (i - WARM) < SPLIT * (ltf.length - 1 - WARM) ? 'latih' : 'uji';
      const tr = { symbol, style, phase, valid, id: c.id, side: c.side, status: c.status, grade: c.grade, rr: c.plan.rr, ...res };
      if (DUMP) { tr.f = c.features; tr.t = ct; }
      trades.push(tr);
    }
  }
  return trades;
}

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
function summarize(label, trades) {
  const filled = trades.filter(t => t.filled);
  if (!trades.length) { console.log(`  ${label.padEnd(34)} (tidak ada sinyal)`); return; }
  const wins = filled.filter(t => t.out === 'TP').length, losses = filled.filter(t => t.out === 'SL').length, to = filled.filter(t => t.out === 'TIMEOUT' || t.out === 'BE').length;
  const R = filled.map(t => t.R);
  const avgRR = mean(filled.map(t => t.rr));
  const be = avgRR > 0 ? 1 / (1 + avgRR) : 0;
  const wr = filled.length ? wins / filled.length : 0;
  // interval kepercayaan kasar 95% untuk win rate (Wilson)
  const n = filled.length, z = 1.96, p = wr;
  const wl = n ? (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n) : 0;
  const wu = n ? (p + z * z / (2 * n) + z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / (1 + z * z / n) : 0;
  console.log(`  ${label.padEnd(34)} sinyal ${String(trades.length).padStart(4)} | terisi ${String(n).padStart(4)} | TP ${String(wins).padStart(3)} SL ${String(losses).padStart(3)} TO ${String(to).padStart(3)} | win ${(wr * 100).toFixed(0)}% [${(wl * 100).toFixed(0)}–${(wu * 100).toFixed(0)}%] vs impas ${(be * 100).toFixed(0)}% | avg RR ${avgRR.toFixed(2)} | ekspektasi ${mean(R) >= 0 ? '+' : ''}${mean(R).toFixed(2)}R/trade`);
}

(async () => {
  SRC = await pickSource();
  if (DELAY < 0) DELAY = SRC === FUT ? 120 : 0;
  const pairs = SYMBOLS ? SYMBOLS.split(',') : await topPairs(NPAIRS);
  console.log(`Backtest walk-forward ICT — ${pairs.length} pair (USDT)\nSumber data: ${SRC.name} · tanpa fee/slippage/funding · fill candle konservatif (SL menang kalau SL & TP di candle yang sama)\n`);
  const styles = STYLE === 'both' ? ['intraday', 'swing'] : [STYLE];
  for (const style of styles) {
    let all = [];
    if (DUMP) fs.writeFileSync(DUMP, '');
    for (const s of pairs) {
      try { all.push(...await backtestPair(s, style)); } catch (e) { console.log('  lewati ' + s + ': ' + e.message); }
    }
    if (DUMP) fs.appendFileSync(DUMP, all.map(t => JSON.stringify(t)).join('\n') + '\n');
    const cfg = ICT_CFG.styles[style];
    const spanDays = Math.round((HISTORY - 200) * (cfg.ltf === '1h' ? 1 : 4) / 24);
    console.log(`\n== ${cfg.label} (${cfg.ltf.toUpperCase()} entry · ${cfg.htf.toUpperCase()} bias · RR min 1:${cfg.minRR}) — ±${spanDays} hari per pair ==`);
    const validOnly = all.filter(t => t.valid !== false);
    if (DUMP) console.log(`  (dump: ${all.length} kandidat tersimpan, ${validOnly.length} di antaranya lolos engine)`);
    const all_ = all; all = validOnly;
    summarize('SEMUA sinyal', all);
    summarize('  periode LATIH (awal)', all.filter(t => t.phase === 'latih'));
    summarize('  periode UJI (akhir, tak disentuh)', all.filter(t => t.phase === 'uji'));
    summarize('  siap entry (in_zone)', all.filter(t => t.status === 'in_zone'));
    summarize('  pantau (waiting)', all.filter(t => t.status === 'waiting'));
    summarize('  setup Sweep+MSS', all.filter(t => t.id === 'SWEEP_MSS'));
    summarize('  setup Retest POI', all.filter(t => t.id === 'POI_RETEST'));
    summarize('  grade A', all.filter(t => t.grade === 'A'));
    summarize('  grade B', all.filter(t => t.grade === 'B'));
    summarize('  LONG', all.filter(t => t.side === 'long'));
    summarize('  SHORT', all.filter(t => t.side === 'short'));
  }
  console.log('\nCatatan: "ekspektasi" = rata-rata R per trade (1R = jarak entry ke SL). Positif & interval win rate di atas titik impas = ada indikasi edge; sampel kecil (terisi < 100) belum bisa dipercaya.');
})().catch(e => { console.error('Backtest gagal:', e.message); process.exit(1); });
