#!/usr/bin/env node
/**
 * Uji pelacak setup (blok ICT-TRACK di index.html): armed -> running -> TP/SL, void, aturan candle konservatif,
 * SL berbasis penutupan candle (IFVG), dan invarian cermin long <-> short.
 * Jalankan: node scripts/test-ict-track.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const text = fs.readFileSync(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'), 'utf8');
const a = text.indexOf('/* ICT-TRACK-START */'), b = text.indexOf('/* ICT-TRACK-END */');
if (a < 0 || b < 0) { console.error('Marker ICT-TRACK tidak ditemukan'); process.exit(1); }
const ctx = vm.createContext({ Math, Number, isFinite });
vm.runInContext(text.slice(a, b) + ';this.T={trkR,trkStepPrice,trkStepCandles,trkCloseSl,trkClose};', ctx);
const T = ctx.T;

let failed = 0;
const ok = (cond, msg) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg); } };
const near = (x, y) => x !== null && x !== undefined && Math.abs(x - y) < 1e-9;

const mk = (side, o) => Object.assign({ side, entry: side === 'long' ? 100 : 100, sl: side === 'long' ? 98 : 102, tp: side === 'long' ? 106 : 94, status: 'armed', armedAt: 1000 }, o || {});
const K = (t, o, h, l, c) => ({ t, open: o, high: h, low: l, close: c });
// candle dalam harga, urutan argumen (open, ujung-profit, ujung-rugi, close): untuk short high/low otomatis tertukar
const KS = (side, t, o, best, worst, c) => side === "long" ? K(t, o, best, worst, c) : K(t, o, worst, best, c);
// cermin harga di sekitar 200: long (100/98/106) <-> short (100/102/94)
const mir = k => ({ t: k.t, open: 200 - k.open, high: 200 - k.low, low: 200 - k.high, close: 200 - k.close });

for (const side of ['long', 'short']) {
  const up = side === 'long' ? 1 : -1;
  const P = d => 100 + up * d; // d = jarak searah profit dari Entry
  console.log('\n[' + side + ']');
  let r = mk(side);
  T.trkStepPrice(r, P(5), 2000);
  ok(r.status === 'armed', 'harga di sisi profit Entry (belum menyentuh) tetap armed');
  T.trkStepPrice(r, P(0), 3000);
  ok(r.status === 'running' && r.runningAt === 3000, 'harga menyentuh Entry -> running');
  T.trkStepPrice(r, P(-2), 4000);
  ok(r.status === 'closed' && r.outcome === 'sl' && near(r.exitPrice, r.sl) && near(r.r, -1), 'kena SL -> closed sl, R = -1');

  r = mk(side); T.trkStepPrice(r, P(0), 2000); T.trkStepPrice(r, P(6), 3000);
  ok(r.status === 'closed' && r.outcome === 'tp' && near(r.exitPrice, r.tp) && near(r.r, 3), 'kena TP -> closed tp, R = +3 (6 / 2)');

  r = mk(side); T.trkStepPrice(r, P(6.5), 2000);
  ok(r.status === 'closed' && r.outcome === 'void' && r.exitPrice === null && r.r === 0, 'TP tercapai tanpa pernah menyentuh Entry -> void (bukan trade)');

  r = mk(side); T.trkStepPrice(r, P(-3), 2000);
  ok(r.status === 'closed' && r.outcome === 'sl' && near(r.r, -1), 'gap menembus Entry dan SL sekaligus -> terisi lalu SL');

  r = mk(side); T.trkStepPrice(r, P(0), 2000);
  ok(near(T.trkR(r, P(3)), 1.5) && near(T.trkR(r, P(-1)), -0.5), 'trkR: +3 dari Entry = +1.5R, -1 = -0.5R');

  // ---- candle ----
  r = mk(side);
  T.trkStepCandles(r, [KS(side, 2000, P(3), P(4), P(0), P(1)), KS(side, 3000, P(1), P(7), P(0.5), P(6))]);
  ok(r.status === 'closed' && r.outcome === 'tp' && r.closedAt === 3000, 'candle: fill di candle 1, TP di candle 2 -> tp');

  r = mk(side);
  T.trkStepCandles(r, [KS(side, 2000, P(3), P(7), P(0), P(5))]);
  ok(r.status === 'running', 'candle fill yang juga menyentuh TP: TP TIDAK dihitung (konservatif), tetap running');

  r = mk(side);
  T.trkStepCandles(r, [KS(side, 2000, P(3), P(4), P(-2.5), P(0))]);
  ok(r.status === 'closed' && r.outcome === 'sl', 'candle fill yang juga menyentuh SL -> sl');

  r = mk(side);
  T.trkStepCandles(r, [KS(side, 2000, P(3), P(3.5), P(0), P(1)), KS(side, 3000, P(1), P(7), P(-2.5), P(1))]);
  ok(r.outcome === 'sl', 'candle setelah fill menyentuh SL dan TP bersamaan -> SL dianggap duluan');

  r = mk(side);
  T.trkStepCandles(r, [KS(side, 2000, P(3), P(7), P(2), P(6))]);
  ok(r.status === 'closed' && r.outcome === 'void', 'candle armed menyentuh TP tanpa Entry -> void');

  // ---- SL berbasis penutupan candle (IFVG) ----
  const T0 = 10_000_000, H = 3_600_000;
  r = mk(side, { slCloseBased: true, status: 'running', runningAt: T0 });
  T.trkStepPrice(r, P(-3), T0 + 10);
  ok(r.status === 'running', 'SL close-based: tick di bawah SL TIDAK menutup (butuh penutupan candle)');
  const ltfWickOnly = [KS(side, T0 - H / 2, P(0), P(0.5), P(-3), P(-1))]; // ekor menembus SL, penutupan di dalam
  const fine = [KS(side, T0 + 1000, P(0), P(1), P(-3), P(0)), KS(side, T0 + 2000, P(0), P(7), P(0), P(6))];
  T.trkStepCandles(r, fine, { ltfCandles: ltfWickOnly, ltfMs: H });
  ok(r.status === 'closed' && r.outcome === 'tp', 'SL close-based: ekor menembus SL tapi candle LTF tutup di dalam -> tidak SL; TP kemudian kena');

  r = mk(side, { slCloseBased: true, status: 'running', runningAt: T0 });
  const ltfClose = [KS(side, T0 - H / 2, P(0), P(0.5), P(-3), P(-2.5))]; // tutup di luar SL pada T0 + H/2
  const fine2 = [KS(side, T0 + 1000, P(-1), P(-0.5), P(-1.5), P(-1)), KS(side, T0 + H / 2 + 1000, P(-1), P(7), P(-1), P(6))];
  T.trkStepCandles(r, fine2, { ltfCandles: ltfClose, ltfMs: H });
  ok(r.status === 'closed' && r.outcome === 'slclose' && near(r.exitPrice, P(-2.5)) && near(r.r, -1.25) && r.closedAt === T0 + H / 2, 'SL close-based: candle LTF tutup di luar SL -> keluar di harga penutupan (R -1.25), sebelum TP');
  ok(near(T.trkCloseSl(mk(side, { slCloseBased: true, runningAt: T0 }), ltfClose, H).price, P(-2.5)) && T.trkCloseSl(mk(side, { runningAt: T0 }), ltfClose, H) === null, 'trkCloseSl: hanya untuk catatan slCloseBased');
}

// ---- fuzz: hasil short HARUS identik dengan long pada candle yang dicerminkan ----
console.log('\n[fuzz cermin]');
let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
let bad = 0, outcomes = { tp: 0, sl: 0, void: 0, none: 0 };
for (let n = 0; n < 400; n++) {
  const cs = []; let p = 100 + (rnd() - 0.5) * 6;
  for (let i = 0; i < 40; i++) {
    const o = p, c = p + (rnd() - 0.5) * 3, h = Math.max(o, c) + rnd() * 1.5, l = Math.min(o, c) - rnd() * 1.5;
    cs.push(K(2000 + i * 1000, o, h, l, c)); p = c;
  }
  const L = mk('long'), S = mk('short');
  T.trkStepCandles(L, cs); T.trkStepCandles(S, cs.map(mir));
  if (L.status !== S.status || L.outcome !== S.outcome || L.closedAt !== S.closedAt || (L.status === "closed" && !near(L.r, S.r))) bad++;
  outcomes[L.status === 'closed' ? L.outcome : 'none']++;
}
ok(bad === 0, 'fuzz 400 deret candle: long dan cermin short selalu menghasilkan status/hasil/waktu/R yang sama');
ok(outcomes.tp > 5 && outcomes.sl > 5 && outcomes.void > 0, 'fuzz mencakup tp/sl/void (' + JSON.stringify(outcomes) + ')');

if (failed) { console.log('\n' + failed + ' uji pelacak GAGAL'); process.exit(1); }
console.log('\nSemua uji pelacak lulus.');
