#!/usr/bin/env node
/**
 * STUDI (bukan bagian aplikasi): zona retracement mana yang lebih dihormati harga — Fib golden pocket (0,618–0,65) atau OTE ICT (0,62–0,79)?
 * Aplikasi tidak diubah oleh studi ini. Leg impuls memakai swing fractal engine yang SAMA dengan aplikasi (ictZigzag di blok ICT-ENGINE).
 *
 * Dua ukuran (satu ukuran saja menyesatkan karena zona lebar otomatis lebih sering "dihormati"):
 *  1) KEPADATAN akhir pullback: untuk leg yang akhirnya berlanjut, di kedalaman berapa pullback terdalamnya berhenti; massa kejadian di tiap
 *     zona dibagi lebar zona. Tanpa level istimewa sebarannya rata.
 *  2) SIMULASI TRADE yang sama untuk semua zona: entry limit di tengah zona, SL di luar sisi jauh zona + buffer (5% leg), TP di ujung leg,
 *     biaya 0,09%, aturan candle konservatif (di candle fill hanya SL dihitung; SL & TP satu candle = SL).
 * Anti-overfit: data dibagi menurut waktu (60% latih / 40% uji); zona dianggap lebih baik hanya bila unggul di KEDUA periode dan selang
 * kepercayaan 95% tidak tumpang tindih di data uji; kalau tidak jelas -> tetap OTE (sudah ada di engine dan konsep ICT).
 *
 * Pakai:  node scripts/study-fib-ote.js --pairs=50 --days=548 --out=./out [--tf=4h,1d] [--src=path/index.html] [--offline]
 * Tanpa API key; hanya data publik Binance Futures. --offline memakai cache candle di --out/data tanpa jaringan.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const CFG = {
  swingLeft: 2, swingRight: 2,            // sama dengan ICT_CFG (dibaca dari engine saat jalan)
  minLegRangeMult: 1.5,                   // leg dianggap impuls bila |leg| >= N x rata-rata range 1 candle (20 candle sebelum ujung leg)
  avgRangeBars: 20,
  maxBars: { '4h': 60, '1d': 30 },        // batas pengamatan pullback / trade (candle)
  buf: 0.05,                              // buffer SL = 5% leg di luar sisi jauh zona (sama dengan ICT_CFG.slBufferFrac)
  fee: 0.0009,                            // biaya pulang-pergi kira-kira 0,09% dari harga
  trainFrac: 0.6,
  bootstrap: 2000,
  excludeBase: ['USDC', 'FDUSD', 'TUSD', 'BUSD', 'USDP', 'USDT'],
};
const ZONES = [
  { id: '0.382-0.500', a: 0.382, b: 0.5 },
  { id: '0.500-0.620', a: 0.5, b: 0.62 },
  { id: 'GP 0.618-0.650', a: 0.618, b: 0.65 },
  { id: 'OTE 0.62-0.79', a: 0.62, b: 0.79 },
  { id: '0.790-0.886', a: 0.79, b: 0.886 },
];

// ---------- engine ----------
function loadEngine(src) {
  const text = fs.readFileSync(src, 'utf8');
  const a = text.indexOf('/* ICT-ENGINE-START */'), b = text.indexOf('/* ICT-ENGINE-END */');
  if (a < 0 || b < 0) throw new Error('Marker ICT-ENGINE tidak ditemukan di ' + src);
  const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Object, Array, String });
  vm.runInContext(text.slice(a, b) + ';this.E={ictZigzag,ICT_CFG};', ctx);
  return ctx.E;
}

// ---------- statistik ----------
function wilson(k, n, z = 1.96) {
  if (!n) return { p: null, lo: null, hi: null, n };
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return { p, lo: (c - w) / d, hi: (c + w) / d, n };
}
function mkRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function meanCI(xs, reps, seed) {
  if (!xs.length) return { mean: null, lo: null, hi: null, n: 0 };
  const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
  if (xs.length < 2) return { mean, lo: mean, hi: mean, n: xs.length };
  const rnd = mkRng(seed || 12345), means = [];
  for (let r = 0; r < reps; r++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[(rnd() * xs.length) | 0]; means.push(s / xs.length); }
  means.sort((x, y) => x - y);
  return { mean, lo: means[Math.floor(0.025 * reps)], hi: means[Math.min(reps - 1, Math.ceil(0.975 * reps) - 1)], n: xs.length };
}

// ---------- leg & pullback ----------
// Setiap leg dinormalkan ke "kerangka naik": leg turun dibalik (harga dinegatifkan) sehingga analisisnya satu kode untuk long dan short.
function toFrame(candles, bull) {
  return bull ? candles : candles.map(c => ({ t: c.t, open: -c.open, high: -c.low, low: -c.high, close: -c.close }));
}
function extractLegs(candles, engine, opts) {
  const o = Object.assign({ minMult: CFG.minLegRangeMult }, opts || {});
  const zz = engine.ictZigzag(candles, CFG.swingLeft, CFG.swingRight);
  const legs = [];
  for (let i = 0; i + 1 < zz.length; i++) {
    const s1 = zz[i], s2 = zz[i + 1];
    if (s1.type === s2.type) continue;
    const bull = s1.type === 'low';
    const e = s2.index, confirm = e + CFG.swingRight;     // swing baru terkonfirmasi 'swingRight' candle sesudahnya: tidak boleh melihat lebih awal
    if (confirm >= candles.length - 1) continue;
    let sum = 0, cnt = 0;
    for (let k = Math.max(0, e - CFG.avgRangeBars); k < e; k++) { sum += candles[k].high - candles[k].low; cnt++; }
    const avg = cnt ? sum / cnt : 0, R = Math.abs(s2.price - s1.price);
    if (!(avg > 0) || R < o.minMult * avg) continue;
    const H = bull ? s2.price : -s2.price, L = bull ? s1.price : -s1.price;
    legs.push({ bull, H, L, startIdx: confirm + 1, ts: candles[confirm].t, frame: null, candles, bullFlag: bull });
  }
  return legs;
}
// Pullback dari ujung leg: kedalaman terdalam sebelum (a) harga melewati ujung leg = 'resume', (b) penutupan di bawah awal leg = 'fail'.
// Candle yang menembus ujung leg tidak ikut dihitung kedalamannya (urutan high/low di dalam candle tidak diketahui -> konservatif).
function scanPullback(frame, startIdx, H, L, maxBars) {
  const R = H - L; let maxDepth = 0;
  for (let j = startIdx, n = 0; j < frame.length && n < maxBars; j++, n++) {
    const c = frame[j];
    if (c.high > H) return { outcome: 'resume', maxDepth };
    const d = (H - c.low) / R;
    if (d > maxDepth) maxDepth = d;
    if (c.close < L) return { outcome: 'fail', maxDepth };
  }
  return { outcome: 'open', maxDepth };
}
// Simulasi trade untuk satu zona. Mengembalikan null bila tidak ada trade (entry tak tersentuh / ujung leg terlewati dulu).
function simTrade(frame, startIdx, H, L, zone, maxBars, fee) {
  const R = H - L, m = (zone.a + zone.b) / 2;
  const entry = H - m * R, stop = H - (zone.b + CFG.buf) * R, tp = H, risk = entry - stop;
  if (!(risk > 0)) return null;
  const feeR = fee * Math.abs(entry) / risk;
  let filled = false, last = null;
  for (let j = startIdx, n = 0; j < frame.length && n < maxBars; j++, n++) {
    const c = frame[j]; last = c;
    if (!filled) {
      if (c.low <= entry) { filled = true; if (c.low <= stop) return { r: -1 - feeR, how: 'sl' }; continue; } // candle fill: hanya SL yang dihitung
      if (c.high >= tp) return null;
      continue;
    }
    if (c.low <= stop) return { r: -1 - feeR, how: 'sl' };
    if (c.high >= tp) return { r: (tp - entry) / risk - feeR, how: 'tp' };
  }
  if (filled && last) return { r: (last.close - entry) / risk - feeR, how: 'timeout' };
  return null;
}

// ---------- analisis satu set candle ----------
function analyze(candles, tf, engine, opts) {
  const legs = extractLegs(candles, engine, opts), out = [];
  const frames = { true: candles, false: toFrame(candles, false) }; // kerangka naik / turun dibuat sekali
  for (const g of legs) {
    const frame = frames[g.bull];
    const pb = scanPullback(frame, g.startIdx, g.H, g.L, CFG.maxBars[tf] || 60);
    const rec = { tf, bull: g.bull, ts: g.ts, startIdx: g.startIdx, outcome: pb.outcome, maxDepth: pb.maxDepth, trades: {} };
    for (const z of ZONES) rec.trades[z.id] = simTrade(frame, g.startIdx, g.H, g.L, z, CFG.maxBars[tf] || 60, CFG.fee);
    out.push(rec);
  }
  return out;
}

// ---------- agregasi ----------
function periodOf(ts, cut) { return ts <= cut ? 'latih' : 'uji'; }
function summarize(records) {
  const tfs = [...new Set(records.map(r => r.tf))].concat(['semua']);
  const res = {};
  for (const tf of tfs) {
    const rs = tf === 'semua' ? records : records.filter(r => r.tf === tf);
    if (!rs.length) continue;
    const ts = rs.map(r => r.ts), tMin = Math.min(...ts), tMax = Math.max(...ts), cut = tMin + CFG.trainFrac * (tMax - tMin);
    res[tf] = { cut, periods: {} };
    for (const per of ['latih', 'uji', 'semua']) {
      const sub = per === 'semua' ? rs : rs.filter(r => periodOf(r.ts, cut) === per);
      const done = sub.filter(r => r.outcome === 'resume' || r.outcome === 'fail');
      const zones = {};
      for (const z of ZONES) {
        const w = z.b - z.a;
        const inZone = done.filter(r => r.outcome === 'resume' && r.maxDepth >= z.a && r.maxDepth <= z.b).length;
        const wl = wilson(inZone, done.length);
        const tr = sub.map(r => r.trades[z.id]).filter(Boolean);
        const wins = tr.filter(t => t.r > 0).length;
        zones[z.id] = {
          width: w, density: wl.p === null ? null : wl.p / w, densityLo: wl.p === null ? null : wl.lo / w, densityHi: wl.p === null ? null : wl.hi / w, endedIn: inZone,
          trades: tr.length, win: wilson(wins, tr.length), r: meanCI(tr.map(t => t.r), CFG.bootstrap, 777 + z.a * 1000 + (per === 'uji' ? 1 : per === 'latih' ? 2 : 3)),
          how: { tp: tr.filter(t => t.how === 'tp').length, sl: tr.filter(t => t.how === 'sl').length, timeout: tr.filter(t => t.how === 'timeout').length },
        };
      }
      res[tf].periods[per] = { legs: sub.length, completed: done.length, resume: done.filter(r => r.outcome === 'resume').length, zones };
    }
    // histogram kedalaman akhir pullback (leg yang berlanjut), bin 0,1
    const bins = {}; rs.filter(r => r.outcome === 'resume').forEach(r => { const k = Math.min(12, Math.floor(r.maxDepth * 10)); bins[k] = (bins[k] || 0) + 1; });
    res[tf].hist = bins;
  }
  return res;
}
// Aturan keputusan yang disepakati: unggul di latih DAN uji, dan selang kepercayaan tidak tumpang tindih di uji; selain itu -> OTE.
function verdict(sum, tf) {
  const S = sum[tf]; if (!S) return null;
  const A = 'GP 0.618-0.650', B = 'OTE 0.62-0.79', pick = (per, id) => S.periods[per].zones[id];
  const cmp = (key) => {
    const aTr = key(pick('latih', A)), bTr = key(pick('latih', B)), aTe = key(pick('uji', A)), bTe = key(pick('uji', B));
    if ([aTr, bTr, aTe, bTe].some(x => x === null || x === undefined)) return 'tidak cukup data';
    const gp = aTr.mean > bTr.mean && aTe.mean > bTe.mean && aTe.lo > bTe.hi;
    const ote = bTr.mean > aTr.mean && bTe.mean > aTe.mean && bTe.lo > aTe.hi;
    return gp ? 'GP lebih baik' : ote ? 'OTE lebih baik' : 'tidak bisa dibedakan';
  };
  const rKey = z => z.trades >= 5 ? { mean: z.r.mean, lo: z.r.lo, hi: z.r.hi } : null;
  const dKey = z => z.density === null ? null : { mean: z.density, lo: z.densityLo, hi: z.densityHi };
  const e = cmp(rKey), d = cmp(dKey);
  return { expectancy: e, density: d, final: e === 'GP lebih baik' ? 'GP (golden pocket)' : 'OTE (tetap, bukti tidak cukup untuk menggantinya)' + (e === 'OTE lebih baik' ? ' — dan memang lebih baik' : '') };
}

// ---------- laporan ----------
const f2 = x => x === null || x === undefined ? '-' : x.toFixed(2), f3 = x => x === null || x === undefined ? '-' : x.toFixed(3), pc = x => x === null || x === undefined ? '-' : (x * 100).toFixed(0) + '%';
function report(sum, meta) {
  const L = [];
  L.push(`# Studi Fib golden pocket vs OTE ICT`, '', `Data: ${meta.pairs} pair, ${meta.days} hari, TF ${meta.tfs.join(', ')}; total leg impuls ${meta.legs}. Dibuat ${new Date().toISOString()}.`, '');
  for (const tf of Object.keys(sum)) {
    const S = sum[tf], v = verdict(sum, tf);
    L.push(`## TF ${tf}`, `Batas latih/uji: ${new Date(S.cut).toISOString().slice(0, 10)}`, '');
    for (const per of ['latih', 'uji']) {
      const P = S.periods[per];
      L.push(`### ${per}: ${P.legs} leg, ${P.completed} selesai (${P.resume} berlanjut)`, '', '| zona | lebar | kepadatan (selang 95%) | trade | win rate (selang 95%) | rata-rata R net (selang 95%) | TP/SL/timeout |', '|---|---|---|---|---|---|---|');
      for (const z of ZONES) { const Z = P.zones[z.id]; L.push(`| ${z.id} | ${f3(Z.width)} | ${f2(Z.density)} (${f2(Z.densityLo)}–${f2(Z.densityHi)}) | ${Z.trades} | ${pc(Z.win.p)} (${pc(Z.win.lo)}–${pc(Z.win.hi)}) | ${f2(Z.r.mean)} (${f2(Z.r.lo)}–${f2(Z.r.hi)}) | ${Z.how.tp}/${Z.how.sl}/${Z.how.timeout} |`); }
      L.push('');
    }
    L.push('Histogram kedalaman akhir pullback (leg yang berlanjut; bin 0,1 dari ujung leg): ' + Object.keys(S.hist).sort((a, b) => a - b).map(k => `${(k / 10).toFixed(1)}–${((+k + 1) / 10).toFixed(1)}:${S.hist[k]}`).join('  '), '');
    L.push(`**Putusan ${tf}** — rata-rata R: ${v.expectancy}; kepadatan: ${v.density}; keputusan: ${v.final}`, '');
  }
  return L.join('\n');
}

// ---------- data ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url, tries = 6) {
  let delay = 1500;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 418) { await sleep(delay * 4); delay *= 2; continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(delay); delay *= 2; }
  }
  throw new Error('gagal: ' + url);
}
async function loadKlines(sym, tf, startMs, dir, offline) {
  const file = path.join(dir, `${sym}_${tf}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (offline) return null;
  const rows = []; let from = startMs;
  for (;;) {
    const part = await getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&startTime=${from}&limit=1500`);
    if (!Array.isArray(part) || !part.length) break;
    rows.push(...part);
    if (part.length < 1500) break;
    from = part[part.length - 1][0] + 1;
    await sleep(250);
  }
  const now = Date.now();
  const candles = rows.filter(k => !(k[6] > now)).map(k => ({ t: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4] }));
  fs.writeFileSync(file, JSON.stringify(candles));
  return candles;
}
async function universe(n) {
  const info = await getJson('https://fapi.binance.com/fapi/v1/exchangeInfo');
  const ok = new Map(info.symbols.filter(s => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING' && /^[A-Z0-9]+$/.test(s.symbol) && !CFG.excludeBase.includes(s.baseAsset)).map(s => [s.symbol, s]));
  const tk = await getJson('https://fapi.binance.com/fapi/v1/ticker/24hr');
  return tk.filter(t => ok.has(t.symbol)).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, n).map(t => t.symbol);
}

async function main() {
  const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
  const pairsN = +arg('pairs', 50), days = +arg('days', 548), outDir = path.resolve(arg('out', './out')), tfs = arg('tf', '4h,1d').split(',');
  const src = arg('src', path.resolve(__dirname, '..', 'index.html')), offline = process.argv.includes('--offline');
  fs.mkdirSync(path.join(outDir, 'data'), { recursive: true });
  const engine = loadEngine(src);
  let syms;
  const uf = path.join(outDir, 'universe.json');
  if (fs.existsSync(uf) && (offline || process.argv.includes('--reuse-universe'))) syms = JSON.parse(fs.readFileSync(uf, 'utf8')).slice(0, pairsN);
  else { syms = await universe(pairsN); fs.writeFileSync(uf, JSON.stringify(syms)); }
  console.log(`universe: ${syms.length} pair; TF ${tfs.join(',')}; ${days} hari`);
  const startMs = Date.now() - days * 864e5, records = [], variants = { dasar: [], ketat: [] };
  let done = 0;
  for (const sym of syms) {
    for (const tf of tfs) {
      let c; try { c = await loadKlines(sym, tf, startMs, path.join(outDir, 'data'), offline); } catch (e) { console.log('lewati', sym, tf, e.message); continue; }
      if (!c || c.length < 120) continue;
      variants.dasar.push(...analyze(c, tf, engine));
      variants.ketat.push(...analyze(c, tf, engine, { minMult: 3 }));
    }
    if (++done % 10 === 0) console.log(`  ${done}/${syms.length} pair diproses`);
  }
  const meta = (r) => ({ pairs: syms.length, days, tfs, legs: r.length });
  const sumA = summarize(variants.dasar), sumB = summarize(variants.ketat);
  const md = report(sumA, meta(variants.dasar)) + '\n\n---\n\n# Sensitivitas: leg lebih ketat (>= 3x rata-rata range, bukan 1,5x)\n\n' + report(sumB, meta(variants.ketat)).replace(/^# .*\n/, '');
  fs.writeFileSync(path.join(outDir, 'report.md'), md);
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify({ meta: meta(variants.dasar), dasar: sumA, ketat: sumB, verdict: { dasar: Object.fromEntries(Object.keys(sumA).map(k => [k, verdict(sumA, k)])), ketat: Object.fromEntries(Object.keys(sumB).map(k => [k, verdict(sumB, k)])) } }, null, 1));
  console.log(md);
}

module.exports = { CFG, ZONES, wilson, meanCI, toFrame, extractLegs, scanPullback, simTrade, analyze, summarize, verdict, loadEngine };
if (require.main === module) main().catch(e => { console.error('ERROR:', e); process.exit(1); });
