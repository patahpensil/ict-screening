#!/usr/bin/env node
/**
 * Uji lapis AREA (blok ICT-AREA di index.html): zona = OB/FVG dengan CE di band OTE leg impuls searah bias; leg >=3x lantai, >=5x bonus;
 * kedalaman dari BIAS; premium/discount vs EQ TF bias; SNR hanya bonus. Angka dihitung manual + cermin + fuzz pada konteks engine asli.
 * Jalankan: node scripts/test-ict-area.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const text = fs.readFileSync(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'), 'utf8');
const cut = (a, b) => { const i = text.indexOf(a), j = text.indexOf(b); if (i < 0 || j < 0) { console.error('Marker tidak ditemukan: ' + a); process.exit(1); } return text.slice(i, j); };
const engine = cut('/* ICT-ENGINE-START */', '/* ICT-ENGINE-END */');
const filters = cut('/* ICT-FILTERS-START */', '/* ICT-FILTERS-END */');
const bias = cut('/* ICT-BIAS-START */', '/* ICT-BIAS-END */');
const area = cut('/* ICT-AREA-START */', '/* ICT-AREA-END */');
const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Map, Object, Array, String, JSON });
vm.runInContext([engine, filters, bias, area].join('\n') + ';this.A={AREA_CFG,ICT_CFG,ictAreaLayer,areaLegOf,areaSnrLevels,areaAvgRange,ictCtxMap,ictBiasFromCandles};', ctx);
const A = ctx.A;

let failed = 0;
const ok = (cond, msg, extra) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg + (extra ? '  [' + extra + ']' : '')); } };
const near = (x, y, tol) => x !== null && x !== undefined && Math.abs(x - y) <= (tol === undefined ? 1e-9 : tol);

// ---------- konteks buatan (jawaban dihitung manual) ----------
function mkCtx(o) {
  const n = o.n || 60;
  const candles = Array.from({ length: n }, () => ({ open: 100, close: 100, high: 100 + (o.rng === undefined ? 2 : o.rng) / 2, low: 100 - (o.rng === undefined ? 2 : o.rng) / 2, volume: 1 }));
  return { n, candles, last: o.last, structure: { bias: 'bullish', label: '', lastHigh: o.hi, lastLow: o.lo, swings: [] }, range: o.eq === undefined ? null : { eq: o.eq }, fvgs: o.fvgs || [], obs: o.obs || [], liquidity: { raw: o.raw || [] } };
}
const fvg = (low, high, type, age) => ({ kind: 'fvg', type: type || 'bull', low, high, ce: (low + high) / 2, barsAgo: age === undefined ? 10 : age });
const ob = (low, high, ce, type, age) => ({ kind: 'ob', type: type || 'bull', low, high, ce, barsAgo: age === undefined ? 10 : age });
const mkBias = (side, o) => Object.assign({ ok: true, side, tf: { bias: '4h', context: '1d', trigger: '1h' }, areaRule: { zone: side === 'long' ? 'discount' : 'premium', strictZone: false, depth: 'biasa' } }, o || {});
// Intraday: leg dari 4H (TF bias); 1H hanya sumber zona dan harga terakhir.
const longLeg = { hi: { price: 200, index: 40 }, lo: { price: 100, index: 20 } };   // R=100; band OTE = [121, 138]
const run = (c4, c1, b, style) => A.ictAreaLayer(style || 'intraday', b || mkBias('long'), { '4h': c4, '1h': c1 });
const c4of = (o) => mkCtx(Object.assign({ last: 140 }, longLeg, o));
const c1of = (o) => mkCtx(Object.assign({ last: 140, hi: { price: 1, index: 1 }, lo: { price: 0, index: 0 } }, o));

console.log('\n[leg impuls: lantai 3x, bonus 5x]');
let r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)] }), c1of({}));
ok(r.ok && r.legs[0].tier === 'bonus' && near(r.legs[0].mult, 50), 'leg 100 vs rata-rata range 2 = 50x -> tier bonus');
const legSmall = (R) => ({ hi: { price: 100 + R, index: 40 }, lo: { price: 100, index: 20 } });
let l = A.areaLegOf('long', mkCtx(Object.assign({ last: 105 }, legSmall(6))));
ok(l.ok && near(l.mult, 3) && l.tier === 'lantai', 'leg 6 vs rata-rata range 2 = tepat 3x -> lolos lantai (>=)');
l = A.areaLegOf('long', mkCtx(Object.assign({ last: 105 }, legSmall(5.9))));
ok(l.ok && l.tier === 'kecil', 'leg 5,9 (2,95x) -> noise (kecil)');
l = A.areaLegOf('long', mkCtx(Object.assign({ last: 105 }, legSmall(10))));
ok(near(l.mult, 5) && l.tier === 'bonus', 'leg 10 = tepat 5x -> bonus (>=)');
r = run(c4of({ hi: { price: 105.9, index: 40 }, eq: 103, fvgs: [fvg(101, 102.4)] }), c1of({ last: 104 }));
ok(!r.ok && /noise|lantai/.test(r.reasons[0]) && r.legs[0].ok === false, 'leg di bawah lantai: tidak ada AREA, alasan menyebut noise');
r = run(c4of({ lo: { price: 100, index: 50 }, eq: 150, fvgs: [fvg(126, 134)] }), c1of({}));
ok(!r.ok && /swing terakhir adalah low/.test(r.legs[0].reason), 'LONG tetapi swing terakhir adalah low (belum ada leg naik yang di-retrace): tidak ada leg');

console.log('\n[band retracement OTE dan kedalaman]');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)] }), c1of({}));
ok(r.ok && near(r.legs[0].band.lo, 121) && near(r.legs[0].band.hi, 138), 'band biasa = OTE 0,62–0,79: 200−79 = 121 sampai 200−62 = 138');
ok(near(r.area.low, 126) && near(r.area.high, 134) && r.area.status === 'waiting', 'zona CE 130 di dalam band: AREA 126–134; harga 140 di atas zona -> menunggu retrace');
r = run(c4of({ eq: 150, fvgs: [fvg(136, 142)] }), c1of({}));
ok(!r.ok, 'CE 139 di luar band (>138): ditolak');
r = run(c4of({ eq: 150, fvgs: [fvg(136, 140)] }), c1of({}));
ok(r.ok && near(r.area.low, 136) && near(r.area.high, 138), 'CE 138 tepat di tepi band: diterima; AREA dipangkas ke irisan zona∩band = 136–138');
r = run(c4of({ eq: 150, fvgs: [fvg(120, 122)] }), c1of({}));
ok(r.ok && near(r.area.ce, 121), 'CE 121 tepat di tepi dalam band: diterima');
r = run(c4of({ eq: 150, fvgs: [fvg(119, 121)] }), c1of({}));
ok(!r.ok, 'CE 120 di luar band (<121): ditolak');
const dalam = mkBias('long', { areaRule: { zone: 'discount', strictZone: false, depth: 'dalam' } });
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)] }), c1of({}), dalam);
ok(!r.ok && r.depth === 'dalam', 'fase koreksi (dalam): band 0,705–0,79 = 121–129,5; CE 130 ditolak');
r = run(c4of({ eq: 150, fvgs: [fvg(122, 128)] }), c1of({}), dalam);
ok(r.ok && near(r.legs[0].band.hi, 129.5), 'fase koreksi: CE 125 diterima; band atas = 129,5');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134, 'bear')] }), c1of({}));
ok(!r.ok, 'zona bearish tidak dipakai untuk LONG');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134, 'bull', 61)] }), c1of({}));
ok(!r.ok, 'zona lebih tua dari maxPoiAge (60 candle) dianggap basi');
r = run(c4of({ eq: 150, obs: [ob(125, 136, 130)] }), c1of({}));
ok(r.ok && r.area.kind === 'ob' && near(r.area.low, 125) && near(r.area.high, 136), 'Order Block dengan CE 130 juga diterima (zona OB ∩ band = 125–136)');
r = run(c4of({ eq: 150 }), c1of({ fvgs: [fvg(126, 134)] }));
ok(r.ok && r.area.tf === '1h', 'zona dari TF masuk 1H di dalam band leg 4H diterima');
const c1leg = c1of({ hi: { price: 200, index: 40 }, lo: { price: 100, index: 20 }, fvgs: [fvg(126, 134)] });
r = run(c4of({ lo: { price: 100, index: 50 }, eq: 150 }), c1leg);
ok(!r.ok && r.legs.length === 1 && r.legs[0].tf === '4h', 'leg 1H TIDAK dipakai (studi hanya mencakup 4H/1D); hanya TF 4H dievaluasi');

console.log('\n[harga terhadap zona]');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)] }), c1of({ last: 130 }));
ok(r.ok && r.area.status === 'in_zone', 'harga di dalam zona -> in_zone');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)] }), c1of({ last: 125.9 }));
ok(!r.ok && r.skipped.tembus === 1, 'harga sudah di bawah zona (menembus): zona tidak berlaku (dihitung sebagai tembus)');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)] }), c1of({ last: 126 }));
ok(r.ok && r.area.status === 'in_zone', 'harga tepat di tepi bawah zona: masih berlaku');

console.log('\n[premium/discount terhadap EQ TF bias]');
r = run(c4of({ eq: 120, fvgs: [fvg(126, 134)] }), c1of({}));
ok(!r.ok && r.skipped.premiumDiscount === 1, 'tengah zona 130 > EQ 120: bukan discount -> ditolak');
r = run(c4of({ eq: 131, fvgs: [fvg(126, 134)] }), c1of({}));
ok(r.ok, 'dasar: tengah zona 130 < EQ 131 -> diterima walau zona menyeberangi EQ');
const strict = mkBias('long', { areaRule: { zone: 'discount', strictZone: true, depth: 'biasa' } });
r = run(c4of({ eq: 131, fvgs: [fvg(126, 134)] }), c1of({}), strict);
ok(!r.ok && r.skipped.premiumDiscount === 1, 'ketat (melawan konteks): zona 126–134 menyeberangi EQ 131 -> ditolak');
r = run(c4of({ eq: 134, fvgs: [fvg(126, 134)] }), c1of({}), strict);
ok(r.ok, 'ketat: seluruh zona (tinggi 134) <= EQ 134 -> diterima');
r = run(c4of({ eq: undefined, fvgs: [fvg(126, 134)] }), c1of({}), strict);
ok(r.ok, 'EQ tidak tersedia (dealing range kosong): aturan premium/discount tidak memblokir');

console.log('\n[SNR hanya bonus]');
const rawSnr = [130.1, 130.3, 160].map(p => ({ type: 'high', price: p, index: 5 }));
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)], raw: rawSnr, rng: 2 }), c1of({}));
ok(r.ok && r.area.snr && r.area.snr.touches === 2 && near(r.area.snr.price, 130.2), 'dua swing 130,1 & 130,3 (selisih 0,2 <= toleransi 0,25×2 = 0,5) = level SNR 2 sentuhan di dalam zona');
ok(r.area.rankDelta === 2, 'selisih peringkat = bonus leg (+1) + SNR (+1) = +2');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)], raw: [130.1, 160].map(p => ({ type: 'high', price: p, index: 5 })) }), c1of({}));
ok(r.ok && r.area.snr === null && r.area.rankDelta === 1, 'satu sentuhan saja bukan SNR: tanpa bonus (hanya bonus leg)');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)], raw: [131.0, 131.6].map(p => ({ type: 'low', price: p, index: 5 })) }), c1of({}));
ok(r.ok && r.area.snr === null, 'dua swing berjarak 0,6 > toleransi 0,5: bukan satu level');
r = run(c4of({ eq: 150, fvgs: [fvg(126, 134)] }), c1of({}));
ok(r.ok, 'tanpa SNR zona tetap sah (SNR bukan syarat wajib)');
const lv = A.areaSnrLevels([{ liquidity: { raw: [{ price: 10 }, { price: 10.4 }, { price: 10.8 }, { price: 20 }] } }], 0.5);
ok(lv.length === 1 && lv[0].touches === 3 && near(lv[0].price, 10.4), 'klaster berantai 10 / 10,4 / 10,8 (jarak berurutan <= 0,5) = satu level 3 sentuhan di 10,4; 20 sendirian bukan level');

console.log('\n[pemilihan AREA terbaik dan Swing]');
r = run(c4of({ eq: 150, fvgs: [fvg(122, 126), fvg(130, 134)], raw: [132.1, 132.3].map(p => ({ type: 'high', price: p, index: 5 })) }), c1of({}));
ok(r.areas.length === 2 && near(r.area.ce, 132) && r.area.rankDelta === 2 && r.areas[1].rankDelta === 1, 'dua zona valid: yang punya SNR (peringkat +2) dipilih; alternatif tetap dicatat');
r = run(c4of({ eq: 150, fvgs: [fvg(122, 126), fvg(134, 136)] }), c1of({ last: 135 }));
ok(r.areas.length === 2 && near(r.area.ce, 135), 'peringkat sama: yang paling dekat harga sekarang dipilih');
// Swing: TF bias 1D, TF masuk 4H; leg dari 1D dan 4H; EQ dari 1D
const swingBias = mkBias('long', { tf: { bias: '1d', context: '1w', trigger: '1h' } });
const d1 = mkCtx({ last: 140, hi: { price: 200, index: 40 }, lo: { price: 100, index: 20 }, eq: 150 });
const h4small = mkCtx({ last: 140, hi: { price: 150, index: 40 }, lo: { price: 135, index: 20 }, rng: 2, fvgs: [fvg(139.5, 141.5)] }); // leg 4H 15 = 7,5x; band 0,62–0,79 = [138,15, 140,7]
r = A.ictAreaLayer('swing', swingBias, { '4h': h4small, '1d': d1 });
ok(r.legs.length === 2 && r.legs.every(x => x.ok), 'Swing mengevaluasi leg dari 1D dan 4H');
ok(r.ok && r.area.legTf === '4h' && r.area.tf === '4h' && near(r.area.low, 139.5) && near(r.area.high, 140.7), 'Swing: zona 4H di band OTE leg 4H diterima (irisan 139,5–140,7); EQ 1D = 150 -> discount');
r = A.ictAreaLayer('swing', swingBias, { '4h': h4small, '1d': Object.assign({}, d1, { range: { eq: 138 } }) });
ok(!r.ok && r.skipped.premiumDiscount >= 1, 'Swing: premium/discount memakai EQ TF bias (1D = 138): zona 140 bukan discount -> ditolak');
r = A.ictAreaLayer('intraday', { ok: false, reasons: ['x'] }, { '4h': c4of({}) });
ok(!r.ok && /Tidak ada bias/.test(r.reasons[0]), 'tanpa bias: AREA tidak dicari');

console.log('\n[cermin penuh LONG <-> SHORT pada konteks buatan]');
const PV = 300;
const mirrorCtx = c => ({ n: c.n, candles: c.candles, last: PV - c.last,
  structure: { bias: 'bearish', label: '', lastHigh: { price: PV - c.structure.lastLow.price, index: c.structure.lastLow.index }, lastLow: { price: PV - c.structure.lastHigh.price, index: c.structure.lastHigh.index }, swings: [] },
  range: c.range ? { eq: PV - c.range.eq } : null,
  fvgs: c.fvgs.map(z => ({ kind: z.kind, type: z.type === 'bull' ? 'bear' : 'bull', low: PV - z.high, high: PV - z.low, ce: PV - z.ce, barsAgo: z.barsAgo })),
  obs: c.obs.map(z => ({ kind: z.kind, type: z.type === 'bull' ? 'bear' : 'bull', low: PV - z.high, high: PV - z.low, ce: PV - z.ce, barsAgo: z.barsAgo })),
  liquidity: { raw: c.liquidity.raw.map(p => ({ type: p.type === 'high' ? 'low' : 'high', price: PV - p.price, index: p.index })) } });
const cases = [
  [c4of({ eq: 150, fvgs: [fvg(126, 134)], raw: rawSnr }), c1of({}), mkBias('long')],
  [c4of({ eq: 150, fvgs: [fvg(122, 128)] }), c1of({ last: 130 }), dalam],
  [c4of({ eq: 131, fvgs: [fvg(126, 134)] }), c1of({}), strict],
  [c4of({ eq: 150, obs: [ob(125, 136, 130)], fvgs: [fvg(136, 142)] }), c1of({ last: 125.9 }), mkBias('long')],
];
let mdiff = 0;
for (const [c4, c1, b] of cases) {
  const a1 = run(c4, c1, b), bs = Object.assign({}, b, { side: 'short', areaRule: Object.assign({}, b.areaRule, { zone: 'premium' }) });
  const a2 = run(mirrorCtx(c4), mirrorCtx(c1), bs);
  const key = x => [x.ok, x.areas.length, x.depth, x.strict, x.rankDelta, x.area ? x.area.status : null, x.area ? x.area.legTier : null, x.area && x.area.snr ? x.area.snr.touches : 0].join('|');
  if (key(a1) !== key(a2)) mdiff++;
  if (a1.area && a2.area && (!near(a2.area.low, PV - a1.area.high, 1e-9) || !near(a2.area.high, PV - a1.area.low, 1e-9))) mdiff++;
}
ok(mdiff === 0, 'cermin: ok/jumlah zona/kedalaman/ketat/peringkat/status/tier/SNR sama, batas zona terbalik persis (4 skenario)');

console.log('\n[konteks engine asli: invarian + cermin + fuzz]');
let seed = 31; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
void 0; const walk = (n, vol) => { const cs = []; let p = 200; for (let i = 0; i < n; i++) { const o = p, c = p + (rnd() - 0.5) * vol, hi = Math.max(o, c) + rnd() * vol / 2, lo = Math.min(o, c) - rnd() * vol / 2; cs.push({ open: o, high: hi, low: lo, close: c, volume: 1 + rnd() * 5 }); p = c; } return cs; };
// zigzag impulsif ternormalisasi: harga tetap di 750–1250 (leg sebagai fraksi harga) supaya cermin (pivot 2000) tidak keluar dari rentang harga
// yang sebanding — logika berbasis rasio harga di engine tidak simetris bila harga melenceng jauh atau negatif. Wick dibuat kecil karena
// ictRawSwings mengeluarkan swing high lalu low pada candle yang sama (urutan tidak ikut terbalik saat dicerminkan): candle besar yang
// sekaligus swing high dan low membuat zigzag asli vs cermin berbeda (properti engine, bukan AREA); seri semacam itu dikeluarkan lewat structSym.
const zigSeries = (n, scale) => {
  const out = [], base = 1000;
  let p = base, dir = rnd() < 0.5 ? 1 : -1, size = base * scale * 0.01 * (60 + rnd() * 120) / 6;
  while (out.length < n) {
    const steps = 6 + Math.floor(rnd() * 8);
    const target = Math.max(base * 0.75, Math.min(base * 1.25, p + dir * size));
    for (let i = 1; i <= steps; i++) {
      const o = p + (target - p) * (i - 1) / steps, c = p + (target - p) * i / steps + (rnd() - 0.5) * base * scale * 0.0002, w = rnd() * base * scale * 0.0002;
      out.push({ open: o, close: c, high: Math.max(o, c) + w, low: Math.min(o, c) - w, volume: 1 + rnd() * 5 });
    }
    p = target; dir = -dir; size = size * (0.35 + rnd() * 0.45) * (rnd() < 0.5 ? 1 : 2);
    if (size < base * 0.01) size = base * scale * 0.01 * 30;
  }
  return out.slice(0, n);
};
const walkN = (n, vol) => { const cs = []; let pr = 1000; for (let i = 0; i < n; i++) { const o = pr, c = Math.max(800, Math.min(1200, pr + (rnd() - 0.5) * vol)), hi = Math.max(o, c) + rnd() * vol / 2, lo = Math.min(o, c) - rnd() * vol / 2; cs.push({ open: o, high: hi, low: lo, close: c, volume: 1 + rnd() * 5 }); pr = c; } return cs; };
const mirrorRaw = (cs, pv) => cs.map(k => ({ open: pv - k.open, close: pv - k.close, high: pv - k.low, low: pv - k.high, volume: k.volume }));
let bad = 0, withArea = 0, tested = 0, thrown = 0, mism = 0, tiers = { bonus: 0, lantai: 0 }, snrN = 0, strictN = 0, dalamN = 0, shortN = 0;
let skipBias = 0, skipStruct = 0;
for (let n = 0; n < 500; n++) {
  const volMul = [1, 3, 8][n % 3];
  const gen = n % 4 === 0 ? (m, v) => walkN(m, v * 4) : zigSeries; // 3 dari 4 seri impulsif, 1 dari 4 jalan acak murni
  const raw = { '1h': gen(260, 3 * volMul), '4h': gen(260, 6 * volMul), '1d': gen(260, 12 * volMul), '1w': gen(120, 25 * volMul) };
  const style = n % 2 ? 'swing' : 'intraday';
  let r1, r2;
  try {
    const cm = A.ictCtxMap(raw, 200), b1 = A.ictBiasFromCandles(style, raw, { bars: 200, ctxMap: cm });
    r1 = A.ictAreaLayer(style, b1, cm);
    const rawM = {}; Object.keys(raw).forEach(k => { rawM[k] = mirrorRaw(raw[k], 2000); });
    const cmM = A.ictCtxMap(rawM, 200), b2 = A.ictBiasFromCandles(style, rawM, { bars: 200, ctxMap: cmM });
    r2 = A.ictAreaLayer(style, b2, cmM);
    var b1x = b1, b2x = b2, cm1 = cm, cm2 = cmM;
  } catch (e) { thrown++; continue; }
  tested++;
  if (r1.ok !== (r1.areas.length > 0) || (!b1x.ok && (r1.ok || r1.areas.length))) bad++;
  if (r1.ok) { withArea++; if (r1.side === 'short') shortN++; if (r1.depth === 'dalam') dalamN++; if (r1.strict) strictN++; }
  let prev = Infinity;
  for (const a of r1.areas) {
    if (a.ce < a.band.lo - 1e-9 || a.ce > a.band.hi + 1e-9) bad++;            // CE di dalam band
    if (a.low < a.band.lo - 1e-9 || a.high > a.band.hi + 1e-9 || a.low > a.high) bad++; // irisan zona ∩ band
    if (a.legMult < A.AREA_CFG.legMinMult - 1e-9) bad++;                        // lantai leg
    if (a.rankDelta > prev) bad++; prev = a.rankDelta;                          // terurut menurut peringkat
    if (a.legTier === 'bonus' && a.legMult < A.AREA_CFG.legBonusMult - 1e-9) bad++;
    if (a.legTier === 'bonus') tiers.bonus++; else tiers.lantai++;
    if (a.snr) snrN++;
  }
  const flip = x => x === 'long' ? 'short' : x === 'short' ? 'long' : x;
  // struktur engine pada deret asli vs cermin harus saling mencerminkan (swing high <-> low di indeks yang sama); kasus langka yang tidak simetris di engine dikeluarkan
  const structSym = Object.keys(cm1).every(tf => { const x = cm1[tf].structure, y = cm2[tf] && cm2[tf].structure; return y && x.lastHigh && x.lastLow && y.lastHigh && y.lastLow && x.lastHigh.index === y.lastLow.index && x.lastLow.index === y.lastHigh.index; });
  if (!structSym) { skipStruct++; continue; }
  if (b1x.ok !== b2x.ok || flip(b1x.side) !== b2x.side || b1x.counterContext !== b2x.counterContext || b1x.phase.value !== b2x.phase.value || b1x.rankDelta !== b2x.rankDelta) { skipBias++; continue; } // simetri BIAS diuji terpisah
  if (r1.ok !== r2.ok || r1.areas.length !== r2.areas.length || r1.depth !== r2.depth || r1.strict !== r2.strict) mism++;
  else if (r1.ok && (r1.area.status !== r2.area.status || r1.area.legTier !== r2.area.legTier || r1.rankDelta !== r2.rankDelta)) mism++;
}
ok(thrown === 0 && bad === 0, `fuzz ${tested} seri (engine asli): tanpa error; CE di band; zona ⊂ band; leg ≥ lantai; terurut peringkat`, `error ${thrown}, pelanggaran ${bad}`);
ok(mism === 0, 'fuzz cermin pada konteks engine asli: hasil AREA identik pada seri yang dicerminkan (ok/jumlah/kedalaman/status/tier/peringkat)', 'beda ' + mism);
ok(skipBias + skipStruct <= tested * 0.15, `seri yang bias/struktur engine-nya sendiri tidak simetris saat dicerminkan (candle yang sekaligus swing high & low; dikeluarkan dari perbandingan AREA) <= 15%: bias ${skipBias}, struktur ${skipStruct} dari ${tested}`);
ok(withArea > 10 && shortN > 2 && tiers.bonus > 3 && tiers.lantai > 3, `fuzz mencakup AREA ada (${withArea}), short (${shortN}), leg bonus (${tiers.bonus}) & lantai (${tiers.lantai}), SNR ${snrN}, ketat ${strictN}, dalam ${dalamN}`);

console.log('\n[kebersihan]');
ok(!/\b(document|localStorage|fetch|window|tickerData)\b/.test(area), 'blok AREA murni: tidak menyentuh DOM/localStorage/fetch/global app');
ok(!/\bictArea\w*|AREA_CFG|areaLegOf/.test(engine) && !/\bictArea\w*|AREA_CFG/.test(filters) && !/\bictArea\w*|AREA_CFG/.test(bias), 'engine, filter, dan BIAS tidak memanggil AREA (arah alur satu jalur)');
ok(!/\bfl(Sma|Ema|Ma|Volume|Momentum)\w*|flMaStack/.test(area), 'AREA tidak memakai filter MA/volume (MA hanya menimbang di lapis BIAS)');
ok(!/\b(rsi|macd|adx|atr|bollinger|vwap|stoch|fibonacci|golden)/i.test(area.replace(/\/\/[^\n]*/g, '')), 'kode AREA tidak memakai indikator terlarang atau Fibonacci (komentar dikecualikan)');
const snap = JSON.stringify(c4of({ eq: 150, fvgs: [fvg(126, 134)] })); const c4i = c4of({ eq: 150, fvgs: [fvg(126, 134)] });
run(c4i, c1of({})); ok(JSON.stringify(c4i) === snap, 'input konteks tidak diubah (tanpa efek samping)');

if (failed) { console.log('\n' + failed + ' uji AREA GAGAL'); process.exit(1); }
console.log('\nSemua uji AREA lulus.');
