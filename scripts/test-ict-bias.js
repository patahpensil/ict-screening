#!/usr/bin/env node
/**
 * Uji lapis BIAS (blok ICT-BIAS di index.html): struktur menentukan arah, MA/EMA hanya menimbang.
 * Intraday: bias H4 / konteks D1. Swing: bias D1 / konteks W1. Trigger H1. Candle sintetis dengan jawaban yang dihitung manual.
 * Jalankan: node scripts/test-ict-bias.js
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
const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Object, Array, String, JSON });
vm.runInContext(engine + '\n' + filters + '\n' + bias + ';this.B={BIAS_CFG,ictBiasLayer,ictBiasFromCandles,biasSideOf,ictContext,flMaStack};', ctx);
const B = ctx.B;

let failed = 0;
const ok = (cond, msg, extra) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg + (extra ? '  [' + extra + ']' : '')); } };

// ---------- pembangun candle ----------
function leg(from, to, steps, wick) { const out = []; for (let i = 1; i <= steps; i++) { const o = from + (to - from) * (i - 1) / steps, c = from + (to - from) * i / steps, w = wick * (0.5 + 0.1 * i); out.push({ open: o, close: c, high: Math.max(o, c) + w, low: Math.min(o, c) - w, volume: 1 }); } return out; }
function zig(anchors, steps, wick) { let out = []; for (let i = 1; i < anchors.length; i++) out = out.concat(leg(anchors[i - 1], anchors[i], steps, wick)); return out; }
const mirror = (cs, p) => cs.map(k => ({ open: p - k.open, close: p - k.close, high: p - k.low, low: p - k.high, volume: k.volume }));
const PIV = 300;
const bullFull = () => leg(60, 100, 200, 0.05).concat(zig([100, 110, 105, 115, 108, 120], 8, 0.3));   // 240 candle, struktur HH-HL, harga di atas MA200
const bearFull = () => mirror(bullFull(), PIV);
const bullShort = () => zig([100, 110, 105, 115, 108, 120], 8, 0.3);                                   // 40 candle: belum ada MA200
const flatN = n => Array.from({ length: n }, () => ({ open: 100, close: 100, high: 100.2, low: 99.8, volume: 1 }));
const bullBelowMa200 = () => flatN(200).map(k => ({ ...k, open: 150, close: 150, high: 150.2, low: 149.8 })).concat(zig([150, 60, 66, 62, 72, 68, 80], 6, 0.3).slice(0, 0)).concat(zig([60, 70, 65, 75, 68, 80], 8, 0.3)); // harga ~80, MA200 ~ 140
// H1: datar 100 lalu bergerak
const h1Above = () => flatN(230).concat(leg(100, 120, 20, 0.1));      // di atas semua MA
const h1Below = () => flatN(230).concat(leg(100, 80, 20, 0.1));       // di bawah semua MA
const h1Mixed = d => flatN(220).concat(leg(100, 130, 30, 0.1)).concat(leg(130, 130 - d, 5, 0.1)); // naik lalu turun d: MA cepat disilang lebih dulu

const raw = (style, b, c, t) => style === 'intraday' ? { '4h': b, '1d': c, '1h': t, '1w': null } : { '1d': b, '1w': c, '1h': t, '4h': null };
const run = (style, b, c, t) => B.ictBiasFromCandles(style, raw(style, b, c, t), { bars: 200 });

console.log('\n[prasyarat: struktur sintetis terbaca benar]');
ok(B.ictContext(bullFull().slice(-200)).structure.bias === 'bullish', 'seri naik membentuk struktur bullish (HH–HL)');
ok(B.ictContext(bearFull().slice(-200)).structure.bias === 'bearish', 'cerminnya membentuk struktur bearish (LH–LL)');
ok(['neutral', 'transition'].includes(B.ictContext(flatN(60)).structure.bias), 'seri datar tidak punya struktur (netral/transisi)');

console.log('\n[arah hanya dari struktur TF bias]');
let r = run('intraday', bullFull(), bullFull(), h1Above());
ok(r.ok && r.side === 'long' && r.tf.bias === '4h' && r.tf.context === '1d' && r.tf.trigger === '1h', 'Intraday: bias dari 4H bullish -> LONG (konteks 1D, trigger 1H)');
r = run('swing', bearFull(), bearFull(), h1Below());
ok(r.ok && r.side === 'short' && r.tf.bias === '1d' && r.tf.context === '1w', 'Swing: bias dari 1D bearish -> SHORT (konteks 1W)');
r = run('intraday', flatN(60), bullFull(), h1Above());
ok(!r.ok && r.side === null && r.areaRule === null && /belum jelas/.test(r.reasons[0]), 'struktur TF bias tidak jelas -> tidak ada bias (tidak mengarang arah dari MA/konteks)');
r = run('intraday', flatN(10), bullFull(), h1Above());
ok(!r.ok && /belum cukup/.test(r.reasons[0]), 'data TF bias terlalu sedikit -> tidak ada bias, alasan tercatat');
r = run('intraday', bullFull(), null, null);
ok(r.ok && r.side === 'long' && r.context.relation === 'tidak ada' && r.phase.value === null, 'tanpa konteks dan tanpa data trigger: bias tetap sah, fase tidak diketahui');

console.log('\n[D1 dan H4 berbeda -> tiap gaya mengambil biasnya sendiri, tidak netral]');
const iD = run('intraday', bearFull(), bullFull(), h1Below()), sD = run('swing', bullFull(), bullFull(), h1Above());
ok(iD.side === 'short' && sD.side === 'long' && iD.ok && sD.ok, 'H4 bearish + D1 bullish: Intraday SHORT dan Swing LONG sekaligus');
ok(iD.context.relation === 'melawan' && iD.counterContext === true, 'Intraday SHORT melawan konteks D1 bullish: ditandai counterContext');
ok(iD.areaRule.strictZone === true && iD.areaRule.zone === 'premium', 'melawan konteks -> area wajib ketat dan di premium (short)');
const iL = run('intraday', bullFull(), bearFull(), h1Above());
ok(iL.counterContext && iL.areaRule.strictZone && iL.areaRule.zone === 'discount', 'cerminnya: Intraday LONG melawan konteks D1 bearish -> ketat di discount');
ok(run('intraday', bullFull(), bullFull(), h1Above()).counterContext === false && run('intraday', bullFull(), bullFull(), h1Above()).areaRule.strictZone === false, 'searah konteks: tidak ketat');
ok(run('intraday', bullFull(), flatN(60), h1Above()).context.relation === 'netral', 'konteks tanpa struktur jelas -> relasi "netral" (bukan melawan)');

console.log('\n[MA200 hanya menimbang]');
r = run('intraday', bullFull(), bullFull(), h1Above());
ok(r.ma.available === 2 && r.ma.aligned === 2 && r.ma.opposed === 0 && r.rankDelta === 2, 'MA200 TF bias dan konteks di bawah harga mendukung LONG: selisih peringkat +2');
r = run('intraday', bullBelowMa200(), bullFull(), h1Above());
ok(r.ok && r.side === 'long' && r.ma.opposed === 1, 'struktur bullish tetapi harga DI BAWAH MA200: tetap LONG (struktur menang), MA200 dihitung melawan');
ok(r.rankDelta === 0 && r.reasons.some(x => /melawan bias \(hanya menimbang\)/.test(x)), 'MA200 yang melawan hanya menurunkan peringkat (1 mendukung - 1 melawan = 0), tidak membatalkan');
r = run('intraday', bullShort(), bullShort(), h1Above());
ok(r.ok && r.side === 'long' && r.ma.available === 0 && r.rankDelta === 0 && r.reasons.some(x => /MA200 belum tersedia/.test(x)), 'pair tanpa MA200 (data kurang): lolos sebagai LONG, tidak memblokir');
r = run('intraday', bullFull(), bearFull(), h1Above());
ok(r.rankDelta === -3 + 1 - 1, 'melawan konteks (-3) + MA200 bias mendukung (+1) + MA200 konteks melawan (-1) = -3');

console.log('\n[fase di TF trigger: koreksi vs lanjutan]');
r = run('intraday', bullFull(), bullFull(), h1Above());
ok(r.phase.value === 'lanjutan' && r.phase.against === 0 && r.phase.available === 4 && r.areaRule.depth === 'biasa', 'LONG, H1 di atas semua MA: fase LANJUTAN, kedalaman area biasa');
r = run('intraday', bullFull(), bullFull(), h1Below());
ok(r.phase.value === 'koreksi' && r.phase.against === 4 && r.areaRule.depth === 'dalam' && r.ok && r.side === 'long', 'LONG, H1 di bawah MA200 dan EMA21/30/50: fase KOREKSI, area lebih dalam — bias LONG TIDAK dibatalkan');
const names4 = r.phase.names.slice().sort().join(',');
ok(names4 === 'EMA21,EMA30,EMA50,MA200', 'nama MA yang melawan tercatat', names4);
let found1 = null, found2 = null;
for (let d = 0; d <= 60 && !(found1 && found2); d++) { const x = run('intraday', bullFull(), bullFull(), h1Mixed(d)); if (x.phase.against === 1 && !found1) found1 = x; if (x.phase.against === 2 && !found2) found2 = x; }
ok(found1 && found1.phase.value === 'lanjutan', 'tepat 1 MA melawan -> masih LANJUTAN (ambang koreksi = 2)', found1 ? found1.phase.names.join('+') : 'tidak ditemukan');
ok(found2 && found2.phase.value === 'koreksi' && found2.areaRule.depth === 'dalam', 'tepat 2 MA melawan -> KOREKSI', found2 ? found2.phase.names.join('+') : 'tidak ditemukan');
r = run('intraday', bearFull(), bearFull(), h1Below());
ok(r.side === 'short' && r.phase.value === 'lanjutan' && r.phase.against === 0, 'SHORT, H1 di bawah semua MA: LANJUTAN (cermin)');
r = run('intraday', bearFull(), bearFull(), h1Above());
ok(r.side === 'short' && r.phase.value === 'koreksi' && r.phase.against === 4, 'SHORT, H1 di atas semua MA: KOREKSI (cermin)');

console.log('\n[cermin penuh: semua harga dibalik]');
const mAll = c => (c ? mirror(c, 200 + PIV) : c);
for (const [b, c, t] of [[bullFull(), bullFull(), h1Below()], [bullFull(), bearFull(), h1Above()], [bullBelowMa200(), bullFull(), h1Mixed(12)]]) {
  const a1 = run('intraday', b, c, t), a2 = run('intraday', mAll(b), mAll(c), mAll(t));
  const flip = s => s === 'long' ? 'short' : s === 'short' ? 'long' : s;
  const zoneFlip = z => z === 'discount' ? 'premium' : 'discount';
  ok(a2.side === flip(a1.side) && a2.context.relation === a1.context.relation && a2.phase.value === a1.phase.value && a2.phase.against === a1.phase.against && a2.rankDelta === a1.rankDelta && a2.areaRule.zone === zoneFlip(a1.areaRule.zone) && a2.areaRule.depth === a1.areaRule.depth && a2.areaRule.strictZone === a1.areaRule.strictZone, `cermin penuh: arah terbalik, relasi/fase/peringkat/kedalaman sama (${a1.side}->${a2.side}, fase ${a1.phase.value})`);
}

console.log('\n[kebersihan]');
const snap = JSON.stringify([bullFull(), bearFull(), h1Below()]);
const inB = bullFull(), inC = bearFull(), inT = h1Below(); const before = JSON.stringify([inB, inC, inT]);
run('intraday', inB, inC, inT); ok(JSON.stringify([inB, inC, inT]) === before && before === snap, 'input candle tidak diubah (tidak ada efek samping)');
ok(!/\b(document|localStorage|fetch|window|tickerData)\b/.test(bias), 'blok BIAS murni: tidak menyentuh DOM/localStorage/fetch/global app');
ok(!/\bictBias\w*|BIAS_CFG|biasSideOf/.test(engine) && !/\bictBias\w*|BIAS_CFG|biasSideOf/.test(filters), 'engine ICT dan blok filter tidak memanggil lapis BIAS (arah mengalir satu arah)');
ok(!/\b(rsi|macd|adx|atr|bollinger|vwap|stoch)/i.test(bias), 'blok BIAS tidak memuat indikator yang tetap dilarang');

console.log('\n[fuzz: arah hanya dari struktur, tidak pernah dari MA/konteks]');
let seed = 9; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const walk = (n, base) => { const cs = []; let p = base; for (let i = 0; i < n; i++) { const o = p, c = p + (rnd() - 0.5) * 3; cs.push({ open: o, close: c, high: Math.max(o, c) + rnd(), low: Math.min(o, c) - rnd(), volume: 1 + rnd() * 5 }); p = c; } return cs; };
let bad = 0, longs = 0, shorts = 0, nones = 0, strict = 0, kor = 0, thrown = 0;
for (let n = 0; n < 300; n++) {
  const b = walk(40 + Math.floor(rnd() * 260), 100), c = walk(30 + Math.floor(rnd() * 250), 100), t = walk(60 + Math.floor(rnd() * 250), 100);
  const style = rnd() < 0.5 ? 'intraday' : 'swing';
  let x, y;
  try { x = run(style, b, c, t); y = run(style, b, walk(25, 100), walk(70, 300)); } catch (e) { thrown++; continue; }
  const st = B.ictContext(b.slice(-200)).structure.bias;
  if (x.ok !== (x.side !== null) || x.side !== B.biasSideOf(st)) bad++;
  if (x.side !== y.side) bad++;                               // konteks dan trigger yang sangat berbeda tidak boleh mengubah arah
  if (x.ok && !x.areaRule) bad++; if (!x.ok && x.areaRule) bad++;
  if (x.ok && x.rankDelta !== (x.counterContext ? -3 : 0) + x.ma.aligned - x.ma.opposed) bad++;
  if (x.side === 'long') longs++; else if (x.side === 'short') shorts++; else nones++;
  if (x.counterContext) strict++; if (x.phase.value === 'koreksi') kor++;
}
ok(thrown === 0 && bad === 0, 'fuzz 300 kombinasi: tidak ada error; arah = fungsi struktur TF bias saja; peringkat sesuai rumus');
ok(longs > 20 && shorts > 20 && strict > 5 && kor > 5, `fuzz mencakup semua kasus (long ${longs}, short ${shorts}, tanpa bias ${nones}, melawan konteks ${strict}, koreksi ${kor})`);

if (failed) { console.log('\n' + failed + ' uji BIAS GAGAL'); process.exit(1); }
console.log('\nSemua uji BIAS lulus.');
