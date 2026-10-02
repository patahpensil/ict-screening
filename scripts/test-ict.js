#!/usr/bin/env node
/**
 * Uji perilaku engine ICT (blok di antara /* ICT-ENGINE-START *​/ dan /* ICT-ENGINE-END *​/ di index.html).
 *
 * check.js cuma menjamin kode tidak rusak secara sintaks/referensi — tidak menjamin logika benar.
 * Script ini mengisi sebagian celah itu dengan candle sintetis yang jawabannya diketahui:
 *   1. skenario sweep SSL + MSS bullish  -> harus LONG, setup SWEEP_MSS, plan masuk akal
 *   2. skenario yang sama dicerminkan (harga dibalik) -> harus SHORT dengan level terbalik persis
 *   3. fuzz random-walk -> tidak boleh crash, plan harus konsisten (SL/TP di sisi yang benar)
 *   4. blok engine tidak boleh menyebut indikator klasik
 *
 * Jalankan: node scripts/test-ict.js   (opsional ICT_SRC=path/ke/file.js untuk menguji berkas lain)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html');
const text = fs.readFileSync(SRC, 'utf8');
const a = text.indexOf('/* ICT-ENGINE-START */');
const b = text.indexOf('/* ICT-ENGINE-END */');
if (a < 0 || b < 0) { console.error('Marker ICT-ENGINE tidak ditemukan di ' + SRC); process.exit(1); }
const engineSrc = text.slice(a, b);

const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Object, Array, String });
vm.runInContext(engineSrc + `
;this.E = { ICT_CFG, ictEvaluate, ictContext, ictStructure, ictLiquidity, ictFVGs, ictOrderBlocks, ictDealingRange, ictKillzone, ictQuickBias, ictSessionLevels, ictLevelSweep };`, ctx);
const E = ctx.E;

let failed = 0;
const ok = (cond, msg) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg); } };
const near = (x, y, tol) => Math.abs(x - y) <= (tol === undefined ? 1e-6 : tol);

// ---------- pembangun candle ----------
function legCandles(from, to, steps, wick){
  const out = [];
  for(let i = 1; i <= steps; i++){
    const o = from + (to - from) * (i - 1) / steps, c = from + (to - from) * i / steps;
    const w = wick * (0.5 + 0.1 * i); // wick membesar sepanjang leg -> titik balik punya high/low yang berbeda (fractal valid)
    out.push({ open: o, close: c, high: Math.max(o, c) + w, low: Math.min(o, c) - w, volume: 1 });
  }
  return out;
}
function path_(anchors, steps, wick){
  let out = [];
  for(let i = 1; i < anchors.length; i++) out = out.concat(legCandles(anchors[i - 1], anchors[i], steps, wick));
  return out;
}
const C = (o, h, l, c) => ({ open: o, high: h, low: l, close: c, volume: 1 });
function mirror(candles, pivot){
  return candles.map(k => ({ open: pivot - k.open, close: pivot - k.close, high: pivot - k.low, low: pivot - k.high, volume: k.volume }));
}

// ---------- skenario 1: sweep SSL + MSS bullish, harga kembali ke FVG ----------
function bullishScenario(){
  const c = path_([100, 110, 104, 118, 106, 111], 6, 0.2);     // ... swing high 118 (belum diambil), swing low 106, lower-high 111
  c.push(C(110.9, 111.0, 109.0, 109.4));                        // turun dari lower-high
  c.push(C(109.4, 109.6, 106.5, 106.8));
  c.push(C(106.8, 107.0, 106.2, 106.6));
  c.push(C(106.6, 106.8, 106.1, 106.5));
  c.push(C(106.5, 106.7, 104.0, 107.0));                        // SWEEP: wick di bawah 106, close balik di atas
  c.push(C(107.0, 108.0, 106.9, 107.8));                        // candle-1 FVG
  c.push(C(107.8, 112.7, 107.7, 112.5));                        // displacement + MSS (close > 111)
  c.push(C(112.5, 113.5, 109.2, 113.0));                        // candle-3 FVG: low 109.2 > high candle-1 (108.0)
  c.push(C(113.0, 113.1, 110.8, 111.0));
  c.push(C(111.0, 111.2, 109.5, 109.6));
  c.push(C(109.6, 109.7, 108.8, 109.0));                        // kembali masuk FVG [108.0, 109.2]
  return c;
}
function htfBullish(){ return path_([100, 110, 105, 115, 108, 120], 6, 0.3); }
function htfBearish(){ return mirror(htfBullish(), 200); }

console.log('Uji engine ICT\n');

const ltfBull = bullishScenario();
const evBull = E.ictEvaluate('intraday', ltfBull, htfBullish(), htfBullish(), new Date('2025-01-15T13:00:00Z'));
console.log('  skenario bullish:', evBull.decision, evBull.best ? `${evBull.best.id} ${evBull.best.status} grade ${evBull.best.grade} RR ${evBull.best.plan.rr.toFixed(2)}` : evBull.skipReason);
ok(evBull.decision === 'LONG', 'sweep SSL + MSS + HTF bullish -> LONG');
ok(evBull.best && evBull.best.id === 'SWEEP_MSS', 'setup terdeteksi sebagai Liquidity Sweep + MSS');
ok(evBull.best && evBull.best.status === 'in_zone', 'harga sedang di dalam FVG entry (status in_zone)');
if(evBull.best){
  const p = evBull.best.plan;
  ok(near(p.entry, 108.6, 0.05), `entry di CE FVG ~108.6 (dapat ${p.entry.toFixed(3)})`);
  ok(p.sl < 104.0 && p.sl > 103.0, `SL tepat di bawah low sweep 104.0 (dapat ${p.sl.toFixed(3)})`);
  ok(near(p.tp, 118, 0.3), `TP = BSL 118 yang belum diambil (dapat ${p.tp})`);
  ok(p.rr >= 1.5, `RR memenuhi minimum intraday (1:${p.rr.toFixed(2)})`);
}

// ---------- skenario 2: cermin -> SHORT ----------
const PIV = 200;
const ltfBear = mirror(ltfBull, PIV);
const evBear = E.ictEvaluate('intraday', ltfBear, htfBearish(), htfBearish(), new Date('2025-01-15T13:00:00Z'));
console.log('  skenario cermin :', evBear.decision, evBear.best ? `${evBear.best.id} ${evBear.best.status} grade ${evBear.best.grade}` : evBear.skipReason);
ok(evBear.decision === 'SHORT', 'versi cermin (sweep BSL + MSS bearish) -> SHORT');
if(evBull.best && evBear.best){
  const pb = evBull.best.plan, ps = evBear.best.plan;
  ok(near(PIV - pb.entry, ps.entry, 1e-6), 'entry SHORT = cermin entry LONG');
  ok(near(PIV - pb.sl, ps.sl, 1e-6), 'SL SHORT = cermin SL LONG');
  ok(near(PIV - pb.tp, ps.tp, 1e-6), 'TP SHORT = cermin TP LONG');
  ok(near(pb.rr, ps.rr, 1e-6), 'RR identik di kedua arah');
}

// ---------- skenario 3: bias HTF melawan -> harus SKIP ----------
const evCounter = E.ictEvaluate('intraday', ltfBull, htfBearish(), htfBearish(), new Date('2025-01-15T13:00:00Z'));
ok(evCounter.decision === 'SKIP', 'LONG melawan bias HTF bearish -> SKIP (gate bias HTF)');
ok(!!evCounter.skipReason && /HTF/.test(evCounter.skipReason), 'alasan SKIP menyebut bias HTF: ' + evCounter.skipReason);

// ---------- skenario 4: sweep tanpa MSS -> belum ada setup, tapi harus masuk "watch" ----------
const ltfPending = ltfBull.slice(0, ltfBull.length - 6);       // berhenti tepat setelah candle sweep
const evPending = E.ictEvaluate('intraday', ltfPending, htfBullish(), htfBullish(), new Date('2025-01-15T13:00:00Z'));
ok(!evPending.candidates.some(c => c.id === 'SWEEP_MSS'), 'sweep tanpa MSS -> TIDAK ada setup Sweep+MSS (belum konfirmasi)');
ok(evPending.watch.some(w => /MSS/.test(w)), 'sweep tanpa MSS dicatat sebagai pantauan (menunggu MSS)');

// ---------- skenario 5: killzone ----------
ok(E.ictKillzone(new Date('2025-01-15T13:00:00Z')).name === 'New York AM', 'killzone 13:00 UTC (08:00 NY, musim dingin) = New York AM');
ok(E.ictKillzone(new Date('2025-07-15T12:00:00Z')).name === 'New York AM', 'killzone 12:00 UTC (08:00 NY, musim panas/DST) = New York AM');
ok(!E.ictKillzone(new Date('2025-01-15T18:00:00Z')).active, '18:00 UTC (13:00 NY) di luar killzone');

// ---------- skenario 6: primitif ----------
const fvgs = E.ictFVGs(ltfBull);
ok(fvgs.some(f => f.type === 'bull' && near(f.low, 108.0, 1e-6) && near(f.high, 109.2, 1e-6) && f.valid), 'FVG bullish [108.0, 109.2] terdeteksi & masih valid');
const obs = E.ictOrderBlocks(ltfBull, fvgs);
ok(obs.some(o => o.type === 'bull' && o.valid), 'Order Block bullish terdeteksi dari displacement');
const rg = E.ictDealingRange(ltfBull, E.ictStructure(ltfBull));
ok(rg && rg.eq > rg.lo && rg.eq < rg.hi, 'dealing range & equilibrium konsisten');

// ---------- primitif tambahan: level hari/pekan, sweep level, range Asia, breaker ----------
function hourly(startIso, n, fn){
  const t0 = Date.parse(startIso);
  return Array.from({ length: n }, (_, i) => Object.assign({ t: t0 + i * 3600e3, volume: 1 }, fn(i)));
}
// 3 hari NY (Jan = UTC-5): 13, 14, 15 Jan 2025, mulai 00:00 NY = 05:00Z. Harga dasar 100 dengan ekstrem yang diketahui.
const base = hourly('2025-01-13T05:00:00Z', 72, i => {
  let o = 100, h = 100.5, l = 99.5, c = 100;
  if(i === 5)  { h = 110; }                 // 13 Jan 05:00 NY: high hari-1 = 110 (BUKAN PDH, bukan hari sebelumnya)
  if(i === 10) { l = 95; }                  // 13 Jan: low hari-1 = 95
  if(i === 30) { h = 108; }                 // 14 Jan 06:00 NY: PDH = 108
  if(i === 36) { l = 98; }                  // 14 Jan 12:00 NY: PDL = 98
  return { open: o, high: h, low: l, close: c };
});
const lvA = E.ictSessionLevels(base);
ok(lvA && near(lvA.pdh, 108, 1e-9) && near(lvA.pdl, 98, 1e-9), `PDH/PDL = hari NY sebelumnya (108/98), bukan 2 hari lalu (dapat ${lvA && lvA.pdh}/${lvA && lvA.pdl})`);
ok(lvA && near(lvA.pwh, 0 + lvA.pwh) && lvA.dayOpen === 100, 'open hari berjalan terbaca dari candle pertama hari itu');
// sweep PDL: candle terakhir-2 menembus 98 dengan wick lalu close balik
const sw = base.slice(0, 70).concat([
  Object.assign({}, base[70], { open: 100, high: 100.4, low: 97.2, close: 99.8 }),   // wick di bawah PDL (98), close di atas
  Object.assign({}, base[71], { open: 99.8, high: 100.3, low: 99.6, close: 100.1 }),
]);
const swLv = E.ictSessionLevels(sw);
ok(E.ictLevelSweep(sw, swLv.pdl, 'low') === 1, 'sweep PDL (wick di bawah, close balik) terdeteksi 1 candle lalu');
ok(E.ictLevelSweep(sw, swLv.pdh, 'high') === null, 'tidak ada sweep PDH palsu');
const brk = base.slice(0, 70).concat([
  Object.assign({}, base[70], { open: 100, high: 100.4, low: 97.2, close: 97.5 }),   // close TETAP di bawah level = breakout, bukan sweep
  Object.assign({}, base[71], { open: 97.5, high: 98.0, low: 97.0, close: 97.4 }),
]);
ok(E.ictLevelSweep(brk, E.ictSessionLevels(brk).pdl, 'low') === null, 'close bertahan di bawah PDL = breakout, BUKAN sweep');
ok(E.ictSessionLevels(base.map(k => ({ open: k.open, high: k.high, low: k.low, close: k.close }))) === null, 'tanpa candle.t -> level sesi null (engine tidak crash)');

// breaker: bull OB yang patah ke bawah lalu tidak direbut kembali = breaker bearish (resistance)
const quiet = Array.from({ length: 25 }, (_, i) => ({ open: 104 + (i % 2 ? 0.15 : -0.15), close: 104 + (i % 2 ? -0.15 : 0.15), high: 104.4, low: 103.6, volume: 1 }));
const obSeq = quiet.concat([
  C(105, 105.2, 102.8, 103),      // candle turun terakhir = calon bull OB [102.8, 105.2]
  C(103, 104, 102.9, 103.8),      // candle-1 FVG
  C(103.8, 108.2, 103.7, 108),    // displacement naik
  C(108, 109, 104.5, 108.5),      // candle-3: low 104.5 > high candle-1 (104) -> FVG bullish
  C(108.5, 108.6, 104.0, 104.2),
  C(104.2, 104.3, 101.0, 101.5),  // close di bawah low OB (102.8): OB patah
  C(101.5, 102.0, 100.8, 101.2),
]);
const obCtx = E.ictContext(obSeq);
const bz = obCtx.breakers.find(b => near(b.low, 102.8, 1e-9) && near(b.high, 105.2, 1e-9));
ok(!!bz && bz.type === 'bear', 'bull OB yang patah ke bawah menjadi breaker BEARISH (resistance)');
ok(!obCtx.obs.some(o => near(o.low, 102.8, 1e-9)), 'OB yang patah tidak lagi dihitung sebagai OB valid');
const obReclaim = obSeq.concat([C(101.2, 106.5, 101.0, 106.0)]); // close kembali di atas high OB (105.2): breaker gagal
ok(!E.ictContext(obReclaim).breakers.some(b => near(b.low, 102.8, 1e-9)), 'breaker yang direbut kembali (close di atas high OB) dibatalkan');

// ---------- fuzz: random walk ----------
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
let fuzzCrash = 0, fuzzBadPlan = 0, fuzzSignals = 0, fuzzWatch = 0, fuzzRuns = 0;
for(let r = 0; r < 400; r++){
  const mk = (len, vol) => {
    const out = []; let p = 100;
    for(let i = 0; i < len; i++){
      const o = p, c = p * (1 + (rnd() - 0.5) * vol);
      out.push({ open: o, close: c, high: Math.max(o, c) * (1 + rnd() * vol / 3), low: Math.min(o, c) * (1 - rnd() * vol / 3), volume: 1 + rnd() });
      p = c;
    }
    return out;
  };
  const len = 60 + Math.floor(rnd() * 140);
  const vol = 0.005 + rnd() * 0.04;
  try{
    ['intraday', 'swing'].forEach(style => {
      fuzzRuns++;
      const ev = E.ictEvaluate(style, mk(len, vol), mk(len, vol), mk(Math.max(25, len - 40), vol), new Date(Date.UTC(2025, 0, 1 + Math.floor(rnd() * 300), Math.floor(rnd() * 24))));
      ev.candidates.forEach(c => {
        const p = c.plan;
        const finite = [p.entry, p.sl].every(Number.isFinite) && (p.tp === null || Number.isFinite(p.tp));
        const sideOk = c.side === 'long' ? (p.sl < p.entry && (p.tp === null || p.tp > p.entry)) : (p.sl > p.entry && (p.tp === null || p.tp < p.entry));
        if(!finite || !sideOk) fuzzBadPlan++;
      });
      if(ev.decision !== 'SKIP'){ if(ev.best.status === 'in_zone') fuzzSignals++; else fuzzWatch++; }
    });
  }catch(e){ fuzzCrash++; if(fuzzCrash <= 3) console.log('   crash:', e.stack.split('\n').slice(0, 3).join(' | ')); }
}
console.log(`  fuzz: ${fuzzRuns} evaluasi, ${fuzzSignals} siap-entry (di zona), ${fuzzWatch} pantau (menunggu retrace), ${fuzzCrash} crash, ${fuzzBadPlan} plan tidak konsisten`);
ok(fuzzCrash === 0, 'fuzz: tidak ada crash pada random-walk');
ok(fuzzBadPlan === 0, 'fuzz: semua plan konsisten (SL & TP di sisi yang benar, angka finit)');
ok(fuzzSignals < fuzzRuns * 0.08, `fuzz: sinyal SIAP-ENTRY pada noise acak langka (${fuzzSignals}/${fuzzRuns})`);
ok(fuzzSignals + fuzzWatch < fuzzRuns * 0.25, `fuzz: total sinyal (siap + pantau) pada noise acak tidak membludak (${fuzzSignals + fuzzWatch}/${fuzzRuns})`);

// ---------- tidak boleh ada indikator klasik di blok engine ----------
const forbidden = ['ema(', 'rsi(', 'macd(', 'adx(', 'atr(', 'bollinger(', 'stochRSI(', 'computeAnchoredVWAP', 'computeFibonacci', 'sma('];
const hit = forbidden.filter(f => engineSrc.includes(f));
ok(hit.length === 0, 'blok engine bebas indikator klasik' + (hit.length ? ' — ditemukan: ' + hit.join(', ') : ''));

if(failed > 0){ console.log('\n' + failed + ' uji gagal.'); process.exit(1); }
console.log('\nSemua uji engine ICT lulus.');
