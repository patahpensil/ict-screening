#!/usr/bin/env node
/**
 * Uji hitungan studi Fib vs OTE (scripts/study-fib-ote.js) dengan candle sintetis yang jawabannya dihitung manual.
 * Jalankan: node scripts/test-study-fib-ote.js
 */
'use strict';
const path = require('path');
const S = require('./study-fib-ote.js');
const engine = S.loadEngine(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'));

let failed = 0;
const ok = (cond, msg, extra) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg + (extra ? '  [' + extra + ']' : '')); } };
const near = (x, y, tol) => x !== null && x !== undefined && Math.abs(x - y) <= (tol === undefined ? 1e-9 : tol);
const K = (high, low, close, t) => ({ t: t || 0, open: close, high, low, close });
const OTE = S.ZONES.find(z => z.id.startsWith('OTE')), GP = S.ZONES.find(z => z.id.startsWith('GP'));
const feeR = (entry, risk) => S.CFG.fee * Math.abs(entry) / risk;

console.log('\n[statistik]');
const w = S.wilson(50, 100);
ok(near(w.p, 0.5) && near(w.lo, 0.4038, 1e-3) && near(w.hi, 0.5962, 1e-3), 'Wilson 50/100 = [0,404; 0,596]', JSON.stringify(w));
ok(S.wilson(0, 0).p === null, 'Wilson n=0 -> null (tidak membagi nol)');
const ci = S.meanCI([2, 2, 2, 2], 500, 1);
ok(near(ci.mean, 2) && near(ci.lo, 2) && near(ci.hi, 2), 'selang bootstrap data konstan = titik');
const ci2 = S.meanCI([-1, -1, -1, 5, 5, 5], 2000, 3);
ok(near(ci2.mean, 2) && ci2.lo < 2 && ci2.hi > 2 && ci2.lo >= -1 && ci2.hi <= 5, 'selang bootstrap mengapit rata-rata dan tetap dalam rentang data');
const a1 = S.meanCI([1, 2, 3, 4, 10], 800, 5), a2 = S.meanCI([1, 2, 3, 4, 10], 800, 5);
ok(a1.lo === a2.lo && a1.hi === a2.hi, 'bootstrap deterministik (seed tetap)');

console.log('\n[pullback dari ujung leg: H=200, L=100]');
let p = S.scanPullback([K(195, 160, 170), K(180, 140, 150), K(205, 150, 204)], 0, 200, 100, 60);
ok(p.outcome === 'resume' && near(p.maxDepth, 0.6), 'turun ke 140 lalu menembus ujung leg: resume, kedalaman 0,6');
p = S.scanPullback([K(190, 98, 99)], 0, 200, 100, 60);
ok(p.outcome === 'fail' && near(p.maxDepth, 1.02), 'penutupan di bawah awal leg: fail, kedalaman 1,02');
p = S.scanPullback([K(190, 150, 160), K(190, 150, 160), K(190, 150, 160)], 0, 200, 100, 2);
ok(p.outcome === 'open' && near(p.maxDepth, 0.5), 'tanpa penyelesaian dalam batas candle: open (dikeluarkan dari statistik)');
p = S.scanPullback([K(201, 110, 199)], 0, 200, 100, 60);
ok(p.outcome === 'resume' && p.maxDepth === 0, 'candle yang menembus ujung leg tidak ikut menghitung kedalaman (urutan high/low tidak diketahui)');
p = S.scanPullback([K(190, 150, 160), K(190, 150, 160)], 1, 200, 100, 60);
ok(near(p.maxDepth, 0.5) && p.outcome === 'open', 'pengamatan mulai dari startIdx (candle sebelumnya diabaikan)');

console.log('\n[simulasi trade — angka eksak]');
// OTE: m=0,705 entry=129,5 stop=116 (0,79+0,05) risk=13,5
const risk = 13.5, entry = 129.5;
let t = S.simTrade([K(150, 129, 140), K(201, 125, 200)], 0, 200, 100, OTE, 60, S.CFG.fee);
ok(t && t.how === 'tp' && near(t.r, 70.5 / risk - feeR(entry, risk), 1e-9), 'OTE: terisi di candle 1, TP di candle 2: R = 70,5/13,5 − biaya = 5,2136', t && t.r.toFixed(4));
t = S.simTrade([K(150, 129, 140), K(150, 115, 120)], 0, 200, 100, OTE, 60, S.CFG.fee);
ok(t && t.how === 'sl' && near(t.r, -1 - feeR(entry, risk)), 'OTE: terisi lalu SL: R = −1 − biaya');
t = S.simTrade([K(150, 110, 140)], 0, 200, 100, OTE, 60, S.CFG.fee);
ok(t && t.how === 'sl', 'candle fill yang juga menyentuh SL: dihitung SL');
t = S.simTrade([K(201, 129, 190)], 0, 200, 100, OTE, 60, S.CFG.fee);
ok(t && t.how === 'timeout' && near(t.r, (190 - entry) / risk - feeR(entry, risk)), 'candle fill yang juga menyentuh TP: TP TIDAK dihitung; keluar di timeout pada close');
t = S.simTrade([K(150, 129, 140), K(201, 115, 190)], 0, 200, 100, OTE, 60, S.CFG.fee);
ok(t && t.how === 'sl', 'SL dan TP di satu candle setelah fill: SL dianggap duluan');
ok(S.simTrade([K(201, 150, 190)], 0, 200, 100, OTE, 60, S.CFG.fee) === null, 'ujung leg tercapai tanpa menyentuh entry: tidak ada trade');
ok(S.simTrade([K(190, 150, 160), K(190, 150, 160)], 0, 200, 100, OTE, 60, S.CFG.fee) === null, 'entry tidak pernah tersentuh: tidak ada trade');
// GP: m=0,634 entry=136,6 stop=130 (0,65+0,05) risk=6,6
t = S.simTrade([K(150, 136, 140), K(201, 135, 200)], 0, 200, 100, GP, 60, S.CFG.fee);
ok(t && t.how === 'tp' && near(t.r, 63.4 / 6.6 - feeR(136.6, 6.6), 1e-9), 'GP: R = 63,4/6,6 − biaya = 9,598 (zona sempit -> RR besar tetapi biaya relatif lebih besar)', t && t.r.toFixed(4));

console.log('\n[cermin leg naik <-> turun lewat seluruh jalur analisis]');
// wick membesar sepanjang leg supaya candle ujung leg punya high/low yang STRIKTUR lebih ekstrem dari tetangganya (syarat swing fractal)
const leg = (from, to, steps, wick) => { const out = []; for (let i = 1; i <= steps; i++) { const o = from + (to - from) * (i - 1) / steps, c = from + (to - from) * i / steps, w = wick * (0.5 + 0.1 * i); out.push({ open: o, close: c, high: Math.max(o, c) + w, low: Math.min(o, c) - w }); } return out; };
const stamp = cs => cs.map((c, i) => Object.assign({ t: 1000 + i * 4 * 3600e3 }, c));
const mirror = (cs, pv) => cs.map(c => ({ t: c.t, open: pv - c.open, close: pv - c.close, high: pv - c.low, low: pv - c.high }));
const series = stamp([].concat(leg(150, 100, 10, 0.5), leg(100, 200, 10, 0.5), leg(200, 140, 6, 0.5), leg(140, 215, 8, 0.5), leg(215, 170, 8, 0.5), leg(170, 230, 8, 0.5)));
const up = S.analyze(series, '4h', engine), dn = S.analyze(mirror(series, 400), '4h', engine);
ok(up.length > 0 && up.length === dn.length, `jumlah leg sama pada seri dan cerminnya (${up.length})`);
let diff = 0;
for (let i = 0; i < up.length; i++) {
  const x = up[i], y = dn[i];
  if (x.bull === y.bull || x.outcome !== y.outcome || !near(x.maxDepth, y.maxDepth, 1e-9)) diff++;
  for (const id of Object.keys(x.trades)) { const a = x.trades[id], b = y.trades[id]; if ((a === null) !== (b === null)) diff++; else if (a && (a.how !== b.how || Math.abs(a.r - b.r) > 0.05)) diff++; }
}
ok(diff === 0, 'cermin: arah leg terbalik; hasil pullback sama persis; hasil trade sama (selisih hanya biaya karena level harga berbeda)', 'selisih ' + diff);
const found = up.find(r => r.outcome === 'resume' && near(r.maxDepth, 0.6, 0.05));
ok(!!found, 'leg 100->200 dengan pullback ke ±140 terbaca sebagai pullback ±0,6 yang berlanjut', JSON.stringify(up.map(r => [r.bull ? 'naik' : 'turun', r.outcome, +r.maxDepth.toFixed(2)])));

console.log('\n[pembagian waktu latih/uji dan putusan]');
const mkRec = (ts, gp, ote) => ({ tf: '4h', bull: true, ts, startIdx: 0, outcome: 'resume', maxDepth: 0.7, trades: { 'GP 0.618-0.650': gp === null ? null : { r: gp, how: gp > 0 ? 'tp' : 'sl' }, 'OTE 0.62-0.79': ote === null ? null : { r: ote, how: ote > 0 ? 'tp' : 'sl' }, '0.382-0.500': null, '0.500-0.620': null, '0.790-0.886': null } });
const recs = Array.from({ length: 10 }, (_, i) => mkRec(i, 1, 1));
const sm = S.summarize(recs);
ok(sm['4h'].periods.latih.legs === 6 && sm['4h'].periods.uji.legs === 4 && sm['4h'].periods.semua.legs === 10, 'batas 60%: ts 0..5 latih (6 leg), 6..9 uji (4 leg)');
const mk = (gpR, oteR, n) => Array.from({ length: n }, (_, i) => mkRec(i < n / 2 ? i : 100 + i, gpR + (i % 2 ? 0.1 : -0.1), oteR + (i % 2 ? 0.1 : -0.1)));
let v = S.verdict(S.summarize(mk(2, -1, 120)), '4h');
ok(v.expectancy === 'GP lebih baik' && /^GP/.test(v.final), 'GP jauh lebih baik di latih DAN uji, selang tidak tumpang tindih -> putusan GP');
v = S.verdict(S.summarize(mk(-1, 2, 120)), '4h');
ok(v.expectancy === 'OTE lebih baik' && /^OTE/.test(v.final), 'OTE jauh lebih baik -> putusan OTE');
v = S.verdict(S.summarize(mk(1, 1.02, 120)), '4h');
ok(v.expectancy === 'tidak bisa dibedakan' && /^OTE/.test(v.final), 'selisih kecil, selang tumpang tindih -> tidak bisa dibedakan -> tetap OTE');
// GP unggul hanya di uji (di latih kalah): tidak boleh dinyatakan menang
const split = [].concat(Array.from({ length: 60 }, (_, i) => mkRec(i, -0.5 + (i % 2 ? 0.1 : -0.1), 1 + (i % 2 ? 0.1 : -0.1))), Array.from({ length: 60 }, (_, i) => mkRec(1000 + i, 3 + (i % 2 ? 0.1 : -0.1), -1 + (i % 2 ? 0.1 : -0.1))));
ok(S.verdict(S.summarize(split), '4h').expectancy !== 'GP lebih baik', 'unggul hanya di periode uji (kalah di latih): TIDAK dinyatakan menang');
ok(S.verdict(S.summarize(mk(2, -1, 4)), '4h').expectancy === 'tidak cukup data', 'trade < 5 per periode: tidak cukup data (tidak menyimpulkan dari sampel kecil)');

console.log('\n[fuzz: tanpa error, tanpa look-ahead]');
let seed = 21; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const walk = n => { const cs = []; let pr = 100; for (let i = 0; i < n; i++) { const o = pr, c = pr + (rnd() - 0.5) * 6, hi = Math.max(o, c) + rnd() * 2, lo = Math.min(o, c) - rnd() * 2; cs.push({ t: 1000 + i * 4 * 3600e3, open: o, high: hi, low: lo, close: c }); pr = c; } return cs; };
let bad = 0, legsN = 0, fills = 0;
for (let n = 0; n < 60; n++) {
  const cs = walk(400), M = 300;
  const rs = S.analyze(cs, '4h', engine);
  const garbage = cs.map((c, i) => i < M ? c : { t: c.t, open: 50, high: 400, low: 1, close: 77 });
  const rs2 = S.analyze(garbage, '4h', engine);
  for (const r of rs) {
    legsN++;
    if (!(r.maxDepth >= 0) || !['resume', 'fail', 'open'].includes(r.outcome)) bad++;
    for (const id in r.trades) { const x = r.trades[id]; if (x) { fills++; if (!isFinite(x.r) || !['tp', 'sl', 'timeout'].includes(x.how)) bad++; } }
    if (r.startIdx + S.CFG.maxBars['4h'] + 4 < M) {            // jendela pengamatan leg ini selesai jauh sebelum data diganti sampah
      const m = rs2.find(q => q.ts === r.ts && q.bull === r.bull && q.startIdx === r.startIdx);
      if (!m || m.outcome !== r.outcome || m.maxDepth !== r.maxDepth || JSON.stringify(m.trades) !== JSON.stringify(r.trades)) bad++;
    }
  }
}
ok(bad === 0, `fuzz 60 deret acak (${legsN} leg, ${fills} trade): hasil valid; mengganti candle SESUDAH jendela pengamatan tidak mengubah hasil (tanpa look-ahead)`);
ok(legsN > 100 && fills > 100, `fuzz mencakup cukup banyak leg dan trade (${legsN}, ${fills})`);

if (failed) { console.log('\n' + failed + ' uji studi GAGAL'); process.exit(1); }
console.log('\nSemua uji studi lulus.');
