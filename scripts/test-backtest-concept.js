#!/usr/bin/env node
/**
 * Uji alat backtest konsep penuh (scripts/backtest-concept.js): simulasi trade dengan angka eksak, entri acak pembanding, jendela HTF tanpa
 * look-ahead, agregasi, gerbang, dan walk-forward pada data sintetis (termasuk uji "mengganti masa depan tidak mengubah sinyal masa lalu").
 * Jalankan: node scripts/test-backtest-concept.js
 */
'use strict';
const path = require('path');
const B = require('./backtest-concept.js');
const E = B.loadEngine(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'));

let failed = 0;
const ok = (cond, msg, extra) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg + (extra ? '  [' + extra + ']' : '')); } };
const near = (x, y, tol) => x !== null && x !== undefined && Math.abs(x - y) <= (tol === undefined ? 1e-9 : tol);
const K = (o, h, l, c, extra) => Object.assign({ t: 0, ct: 0, open: o, high: h, low: l, close: c, volume: 10 }, extra || {});
const FEE = B.CFG.fee;

console.log('\n[simulasi trade — angka eksak] plan LONG entry 100, SL 98, TP 106, RR 3, risiko 2');
const plan = { entry: 100, sl: 98, tp: 106, rr: 3 }, fr = FEE * 100 / 2;
ok(near(B.feeR(100, 2, FEE), 0.045), 'biaya dalam R = 0,0009 x 100 / 2 = 0,045');
let r = B.simulate(plan, 'long', [K(101, 101, 99.9, 100.5), K(100.5, 101, 100, 100.6)], 0, 12, 48, FEE);
ok(r === null, 'terisi tetapi data habis sebelum SL/TP/timeout (hold 48 > data): tidak dihitung (bukan menang/kalah palsu)');
r = B.simulate(plan, 'long', [K(101, 101, 99.9, 100.5), K(100.5, 106.5, 100, 106)], 0, 12, 2, FEE);
ok(r.filled && r.out === 'TP' && near(r.R, 3 - fr) && r.bars === 1, 'terisi di candle 0, TP di candle 1: R = 3 − 0,045 = 2,955');
r = B.simulate(plan, 'long', [K(101, 101, 99.9, 100.5), K(100.5, 101, 97, 98)], 0, 12, 2, FEE);
ok(r.filled && r.out === 'SL' && near(r.R, -1 - fr), 'terisi lalu SL: R = −1 − 0,045');
r = B.simulate(plan, 'long', [K(101, 107, 99.5, 106), K(105.5, 105.9, 105, 105.5)], 0, 12, 2, FEE);
ok(r.filled && r.out === 'TIMEOUT' && near(r.R, (105.5 - 100) / 2 - fr), 'candle fill yang juga menyentuh TP: TP TIDAK dihitung; keluar timeout di close (2,75 − 0,045)');
r = B.simulate(plan, 'long', [K(101, 101, 99.9, 100.5), K(100.5, 106.5, 97.5, 100)], 0, 12, 2, FEE);
ok(r.out === 'SL', 'SL dan TP di satu candle setelah fill: SL dianggap duluan');
r = B.simulate(plan, 'long', [K(105, 106, 103, 104), K(104, 105, 102, 103), K(103, 104, 99, 100), K(100, 101, 99, 100)], 0, 2, 2, FEE);
ok(r.filled === false, 'entry baru tersentuh di candle ke-3 padahal batas tunggu 2 candle: tidak terisi');
const mir = (c, p) => ({ t: c.t, ct: c.ct, open: p - c.open, high: p - c.low, low: p - c.high, close: p - c.close, volume: c.volume });
const candles = [K(101, 101, 99.9, 100.5), K(100.5, 106.5, 100, 106)];
const a = B.simulate(plan, 'long', candles, 0, 12, 2, FEE), b = B.simulate({ entry: 100, sl: 102, tp: 94, rr: 3 }, 'short', candles.map(c => mir(c, 200)), 0, 12, 2, FEE);
ok(a.out === b.out && near(a.R, b.R, 1e-12) && a.bars === b.bars, 'cermin SHORT (pivot 200 menjaga harga entry sama): hasil identik dengan LONG');
ok(B.simulate({ entry: 100, sl: 100, tp: 106, rr: 3 }, 'long', candles, 0, 12, 2, FEE) === null && B.simulate({ entry: 100, sl: 98, tp: null, rr: 0 }, 'long', candles, 0, 12, 2, FEE) === null, 'risiko nol atau tanpa TP: tidak disimulasikan');

console.log('\n[entri acak pembanding (geometri sama)]');
let q = B.simulateRandom('long', [K(100, 100, 100, 100), K(100, 102.5, 99.5, 101), K(101, 101, 101, 101)], 0, 0.01, 2, 1, FEE);
ok(q.out === 'TP' && near(q.R, 2 - FEE * 100 / 1), 'market di close 100, SL 1% & RR 2: TP di 102 -> R = 2 − 0,09 = 1,91');
q = B.simulateRandom('long', [K(100, 100, 100, 100), K(100, 102.5, 98.9, 101), K(101, 101, 101, 101)], 0, 0.01, 2, 1, FEE);
ok(q.out === 'SL' && near(q.R, -1 - 0.09), 'SL dan TP di satu candle: SL dianggap duluan');
q = B.simulateRandom('short', [K(100, 100, 100, 100), K(100, 100.5, 97.5, 98), K(98, 98, 98, 98)], 0, 0.01, 2, 1, FEE);
ok(q.out === 'TP' && near(q.R, 2 - 0.09), 'SHORT: TP di 98');
q = B.simulateRandom('long', [K(100, 100, 100, 100), K(100, 100.5, 99.5, 100.4), K(100.4, 100.6, 100.2, 100.5)], 0, 0.01, 2, 1, FEE);
ok(q.out === 'TIMEOUT' && near(q.R, (100.4 - 100) / 1 - 0.09), 'tanpa SL/TP dalam hold (1 candle): mark-to-market di close candle itu');
ok(B.simulateRandom('long', [K(100, 100, 100, 100), K(100, 100.5, 99.5, 100.4)], 0, 0.01, 2, 5, FEE) === null, 'data kurang dari hold: tidak dihitung');

console.log('\n[jendela HTF tanpa look-ahead dan agregasi]');
const arr = [10, 20, 30, 40].map(x => K(1, 1, 1, 1, { ct: x }));
ok(B.closedCount(arr, 5) === 0 && B.closedCount(arr, 10) === 1 && B.closedCount(arr, 29) === 2 && B.closedCount(arr, 40) === 4 && B.closedCount(arr, 99) === 4, 'closedCount: hanya candle yang ct-nya <= waktu sekarang (tepat saat tutup = ikut)');
const H = 36e5, base = 7 * 864e5;                                     // base kelipatan 1 hari & 1 minggu epoch? (hari ke-7)
const h1 = Array.from({ length: 50 }, (_, i) => ({ t: base + i * H, ct: base + i * H + H - 1, open: 100 + i, high: 101 + i + (i === 30 ? 50 : 0), low: 99 + i - (i === 7 ? 40 : 0), close: 100.5 + i, volume: 2 }));
const d = B.aggregate(h1, 864e5);
ok(d.length === 2 && d[0].t === base && d[0].ct === base + 864e5 - 1 && d[0].open === 100 && near(d[0].close, 100.5 + 23) && d[0].high === 124 && d[0].low === 66 && d[0].volume === 48, 'agregasi 24 candle H1 -> 1 candle harian: open pertama, close terakhir, high/low ekstrem, volume dijumlah, ct = t + 1 hari − 1 ms');
ok(d[1].t === base + 864e5, 'candle harian ke-2 mulai tepat 24 jam sesudahnya; sisa 2 candle H1 yang belum penuh dibuang');
ok(B.aggregate(h1.slice(0, 23), 864e5).length === 0, 'kurang dari satu hari penuh -> tidak ada candle');

console.log('\n[kebersihan statistik dan overlap]');
ok(B.overlaps(1, 3, 3, 5) && B.overlaps(1, 5, 2, 3) && !B.overlaps(1, 2, 3, 4), 'overlaps: menyentuh di tepi dihitung beririsan; terpisah tidak');
const st = B.stats([{ filled: true, R: 2, out: 'TP', rr: 2 }, { filled: true, R: -1, out: 'SL', rr: 2 }, { filled: true, R: -1, out: 'SL', rr: 2 }, { filled: false }]);
ok(st.signals === 4 && st.n === 3 && st.tp === 1 && st.sl === 2 && near(st.r.mean, 0) && near(st.pf, 1) && near(st.win.p, 1 / 3), 'stats: 4 sinyal, 3 terisi, 1 TP, 2 SL, rata-rata R 0, PF 1, win 1/3');
ok(B.stats([]).n === 0 && B.stats([]).r.mean === null, 'stats data kosong tidak error');
ok(B.phaseOf(5, 10) === 'latih' && B.phaseOf(10, 10) === 'latih' && B.phaseOf(11, 10) === 'uji', 'pembagian latih/uji menurut waktu (batas inklusif untuk latih)');
const rng1 = B.mkRng(5), rng2 = B.mkRng(5); ok(rng1() === rng2() && rng1() === rng2(), 'RNG deterministik');

console.log('\n[walk-forward pada data sintetis: tanpa error, tanpa look-ahead]');
let seed = 91; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
function zigH1(n, t0) {
  const out = []; let p = 1000, dir = rnd() < 0.5 ? 1 : -1, size = 40 + rnd() * 60;
  while (out.length < n) {
    const steps = 6 + Math.floor(rnd() * 10), target = Math.max(780, Math.min(1220, p + dir * size));
    for (let i = 1; i <= steps && out.length < n; i++) {
      const o = p + (target - p) * (i - 1) / steps, c = p + (target - p) * i / steps + (rnd() - 0.5) * 1.5, w = rnd() * 2.5, k = out.length;
      out.push({ t: t0 + k * H, ct: t0 + k * H + H - 1, open: o, high: Math.max(o, c) + w, low: Math.min(o, c) - w, close: c, volume: 5 + rnd() * (rnd() < 0.15 ? 90 : 20) });
    }
    p = target; dir = -dir; size = size * (0.4 + rnd() * 0.5) * (rnd() < 0.5 ? 1 : 2); if (size < 20) size = 70;
  }
  return out;
}
const T0 = Date.UTC(2025, 0, 6);                                       // Senin 00:00 UTC (selaras candle mingguan Binance? cukup selaras hari)
const mkData = h => ({ '1h': h, '4h': B.aggregate(h, 144e5), '1d': B.aggregate(h, 864e5), '1w': B.aggregate(h, 6048e5) });
let nC = 0, nM = 0, thrown = 0, shapeBad = 0, chainBad = 0, lookBad = 0, lookCmp = 0;
const M = 1500;
const NSER = +process.env.BT_SERIES || 3;
for (let s = 0; s < NSER; s++) {
  const h = zigH1(1900, T0), data = mkData(h);
  let res; try { res = B.walkPair('SYN' + s, data, E, { from: 300 }); } catch (e) { thrown++; console.log('   error:', e.message); continue; }
  nC += res.concept.length; nM += res.models.length;
  res.concept.forEach(x => { const sim = x.filled ? (isFinite(x.R) && ['TP', 'SL', 'TIMEOUT'].includes(x.out)) : (x.R === undefined && x.out === undefined); if (!(sim && x.rr > 0 && x.riskPct > 0 && x.f && ['intraday', 'swing'].includes(x.style) && ['long', 'short'].includes(x.side))) shapeBad++; });
  res.models.forEach(x => { if (!(x.gate && typeof x.gate.bias === 'boolean' && typeof x.gate.area === 'boolean' && typeof x.gate.trig === 'boolean')) shapeBad++; if (x.gate.area && !x.gate.bias) chainBad++; if (x.filled && !isFinite(x.R)) shapeBad++; });
  // masa depan diganti sampah setelah indeks M: sinyal yang butuh data hanya sebelum M harus identik
  const hg = h.map((c, i) => i < M ? c : { t: c.t, ct: c.ct, open: 500, high: 2000, low: 1, close: 777, volume: 3 });
  const rg = B.walkPair('SYN' + s, mkData(hg), E, { from: 300 });
  const ok2 = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const horizon = B.CFG.wait + Math.max(B.CFG.hold.swing, B.CFG.modelHold.swing * 4) + 4;
  for (const [A1, A2] of [[res.concept, rg.concept], [res.models, rg.models]]) {
    A1.filter(x => x.ct < h[M - horizon].ct).forEach(x => { lookCmp++; const y = A2.find(z => z.ct === x.ct && z.style === x.style && z.side === x.side && (z.id || 'K') === (x.id || 'K')); if (!y || !ok2(x, y)) lookBad++; });
  }
}
ok(thrown === 0, `walk-forward ${NSER} deret sintetis (1900 candle H1) tanpa error`);
ok(nC + nM > 15, `data sintetis menghasilkan sinyal yang cukup untuk diuji (konsep ${nC}, model lama ${nM})`);
ok(shapeBad === 0 && chainBad === 0, 'semua sinyal valid: R terhingga, penanda gerbang konsisten (AREA lolos hanya jika BIAS lolos)', `bentuk ${shapeBad}, rantai ${chainBad}`);
ok(lookCmp > 5 && lookBad === 0, `mengganti candle SESUDAH indeks ${M} dengan sampah tidak mengubah ${lookCmp} sinyal sebelumnya (tanpa look-ahead di HTF maupun simulasi)`, 'beda ' + lookBad);

console.log('\n[laporan]');
const fakeC = [{ symbol: 'X', style: 'intraday', ct: 1, side: 'long', rr: 2, riskPct: 0.01, filled: true, R: 1.9, out: 'TP', f: { legTier: 'bonus', snr: true, counter: false, phase: 'koreksi', zone: 'ifvg', choch: 'CHoCH', momentum: 'keduanya', kz: 'London' } }];
const fakeM = [{ symbol: 'X', style: 'swing', ct: 1, id: 'SWEEP_MSS', side: 'short', rr: 2, filled: true, R: -1.1, out: 'SL', gate: { bias: true, area: false, trig: false } }];
const t1 = B.reportConcept(fakeC, fakeC, 5, { pairs: 1, days: 10 }), t2 = B.reportModels(fakeM, 5, { pairs: 1, days: 10 });
ok(!/NaN|undefined|Infinity/.test(t1 + t2) && /KONSEP latih/.test(t1) && /ACAK/.test(t1) && /BIAS \+ AREA \+ TRIGGER/.test(t2), 'laporan konsep dan model memuat kelompok yang benar tanpa NaN/undefined');

if (failed) { console.log('\n' + failed + ' uji backtest konsep GAGAL'); process.exit(1); }
console.log('\nSemua uji backtest konsep lulus.');
