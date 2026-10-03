#!/usr/bin/env node
/**
 * Uji blok ICT-FILTERS (MA200, EMA 21/30/50, volume spike, momentum) di index.html dengan angka yang dihitung manual.
 * Filter hanya MENIMBANG — uji ini juga menjaga agar blok tetap murni dan terpisah dari engine ICT.
 * Jalankan: node scripts/test-ict-filters.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const text = fs.readFileSync(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'), 'utf8');
const cut = (a, b) => { const i = text.indexOf(a), j = text.indexOf(b); if (i < 0 || j < 0) { console.error('Marker tidak ditemukan: ' + a); process.exit(1); } return text.slice(i, j); };
const engine = cut('/* ICT-ENGINE-START */', '/* ICT-ENGINE-END */');
const filters = cut('/* ICT-FILTERS-START */', '/* ICT-FILTERS-END */');
const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Object, Array, String });
vm.runInContext(engine + '\n' + filters + ';this.F={FILTER_CFG,flSmaSeries,flEmaSeries,flMaState,flMaStack,flVolumeSpike,flMomentum,ictIsDisplacement,ictAvgBodyAt};', ctx);
const F = ctx.F;

let failed = 0;
const ok = (cond, msg) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg); } };
const near = (x, y, tol) => x !== null && x !== undefined && Math.abs(x - y) <= (tol === undefined ? 1e-9 : tol);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const C = (o, h, l, c, v) => ({ open: o, high: h, low: l, close: c, volume: v === undefined ? 10 : v });

console.log('\n[SMA & EMA — angka eksak]');
ok(same(F.flSmaSeries([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]), 'SMA(3) dari 1..5 = [-,-,2,3,4]');
ok(same(F.flSmaSeries([1, 2], 3), [null, null]), 'SMA dengan data kurang -> semua null');
ok(same(F.flEmaSeries([2, 4, 6, 8], 2), [null, 3, 5, 7]), 'EMA(2) dari 2,4,6,8 = [-,3,5,7] (seed = SMA 2 close pertama, k = 2/3)');
ok(F.flEmaSeries([100, 100, 100, 100, 100], 3).slice(2).every(v => v === 100), 'EMA seri konstan tetap konstan');
const spike = [1000, 10, 10, 10, 10];
ok(F.flEmaSeries(spike, 3)[2] === (1000 + 10 + 10) / 3, 'EMA di-seed SMA n close pertama, bukan close pertama (bug cold-start lama tidak kembali)');
ok(same(F.flEmaSeries([1, 2], 3), [null, null]), 'EMA dengan data kurang -> semua null');

console.log('\n[keadaan MA satu timeframe]');
const flat = n => Array.from({ length: n }, () => C(100, 100, 100, 100));
let st = F.flMaState(flat(199), 'ma200');
ok(st.ok === false && st.reason === 'data kurang', 'MA200 dengan 199 candle -> ok:false "data kurang" (tidak memblokir)');
st = F.flMaState(flat(200), 'ma200');
ok(st.ok && near(st.value, 100) && st.above === false && near(st.distPct, 0) && st.slope === null, 'MA200 dengan tepat 200 candle: nilai 100, belum ada kemiringan (riwayat nilai kurang)');
const rising = Array.from({ length: 210 }, (_, i) => C(i + 1, i + 1, i + 1, i + 1));
st = F.flMaState(rising, 'ma200');
ok(near(st.value, 110.5) && st.above === true && st.slope === 'naik' && near(st.distPct, (210 / 110.5 - 1) * 100, 1e-9), 'MA200 dari 1..210: nilai 110,5 (rata-rata 11..210), harga di atas, kemiringan naik');
const falling = rising.map(c => C(211 - c.open, 211 - c.open, 211 - c.open, 211 - c.close));
st = F.flMaState(falling, 'ma200');
ok(near(st.value, 100.5) && st.above === false && st.slope === 'turun', 'cermin harga (turun): harga di bawah MA200, kemiringan turun');
ok(F.flMaState(flat(60), 'ema50').ok === true && F.flMaState(flat(60), 'ma200').ok === false, 'EMA50 tersedia dengan 60 candle sementara MA200 belum');
ok(F.flMaState(rising.slice(0, 40), 'ema21').slope === 'naik', 'kemiringan EMA21 pada tren naik = naik');

console.log('\n[susunan MA satu timeframe]');
const stack = F.flMaStack(rising.slice(0, 60));
ok(stack.available === 3 && stack.above === 3 && stack.below === 0 && stack.ma200.ok === false, 'tren naik 60 candle: 3 MA tersedia (EMA21/30/50), semua di bawah harga, MA200 belum ada');
const stackDown = F.flMaStack(falling.slice(0, 60));
ok(stackDown.available === 3 && stackDown.above === 0 && stackDown.below === 3, 'cermin: semua MA berada di atas harga');
ok(F.flMaStack(null).available === 0 && F.flMaStack([]).available === 0, 'data kosong/null tidak melempar error');

console.log('\n[volume spike]');
const vols = (arr, last) => arr.concat([last]).map(v => C(100, 101, 99, 100, v));
const base20 = Array.from({ length: 20 }, () => 10);
ok(F.flVolumeSpike(vols(base20, 20), 20).ok === true && near(F.flVolumeSpike(vols(base20, 20), 20).ratio, 2), 'volume tepat 2x rata-rata 20 candle -> spike (>=)');
ok(F.flVolumeSpike(vols(base20, 19.99), 20).ok === false, 'volume 1,999x -> bukan spike');
ok(F.flVolumeSpike(vols(base20.slice(0, 19), 20), 19).ok === false && F.flVolumeSpike(vols(base20.slice(0, 19), 20), 19).reason === 'data kurang', 'kurang dari 20 candle sebelumnya -> data kurang');
ok(F.flVolumeSpike(vols(Array.from({ length: 20 }, () => 0), 5), 20).ok === false, 'rata-rata volume nol -> bukan spike (tidak membagi nol)');
const withSpikeBefore = base20.slice(); withSpikeBefore[19] = 10;
ok(near(F.flVolumeSpike(vols(withSpikeBefore, 30), 20).avg, 10), 'candle yang dinilai tidak ikut dihitung dalam rata-rata');

console.log('\n[momentum: displacement ATAU volume spike, searah]');
const calm = Array.from({ length: 21 }, () => C(100, 111, 99, 110, 10)); // body 10 (angka bulat supaya batas 1,3x eksak), volume 10
const mk = (o, c, v) => calm.concat([C(o, Math.max(o, c) + 0.1, Math.min(o, c) - 0.1, c, v)]);
let m = F.flMomentum(mk(100, 113, 10), 21, 'up');
ok(m.ok && m.kind === 'displacement' && m.displacement && !m.volumeSpike && near(m.bodyRatio, 1.3, 1e-9), 'body tepat 1,3x rata-rata: displacement (kind=displacement)');
m = F.flMomentum(mk(100, 112.9, 10), 21, 'up');
ok(!m.ok && m.kind === null, 'body 1,29x dan volume biasa: bukan momentum');
m = F.flMomentum(mk(100, 105, 20), 21, 'up');
ok(m.ok && m.kind === 'volume' && m.volumeSpike && !m.displacement, 'body kecil tetapi volume 2x searah: momentum (kind=volume)');
m = F.flMomentum(mk(100, 115, 25), 21, 'up');
ok(m.ok && m.kind === 'keduanya', 'displacement dan volume spike sekaligus: kind=keduanya');
m = F.flMomentum(mk(100, 95, 30), 21, 'up');
ok(!m.ok && m.volumeSpike === false, 'lonjakan volume pada candle yang menutup MELAWAN arah bukan konfirmasi');
m = F.flMomentum(mk(100, 87, 10), 21, 'down');
ok(m.ok && m.kind === 'displacement', 'arah turun: body besar ke bawah = displacement (cermin)');
m = F.flMomentum(mk(100, 95, 20), 21, 'down');
ok(m.ok && m.kind === 'volume', 'arah turun: volume spike pada candle turun = konfirmasi (cermin)');

console.log('\n[konsistensi dengan engine & fuzz]');
let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
let bad = 0, spikes = 0, disps = 0;
for (let n = 0; n < 500; n++) {
  const cs = []; let p = 100;
  for (let i = 0; i < 30; i++) { const o = p, c = p + (rnd() - 0.5) * 4, v = rnd() < 0.15 ? 60 + rnd() * 40 : 5 + rnd() * 20; /* sesekali lonjakan volume */ cs.push(C(o, Math.max(o, c) + rnd(), Math.min(o, c) - rnd(), c, v)); p = c; }
  for (const dir of ['up', 'down']) {
    const m2 = F.flMomentum(cs, 29, dir);
    if (m2.displacement !== F.ictIsDisplacement(cs, 29, dir)) bad++;
    if (m2.ok !== (m2.volumeSpike || m2.displacement)) bad++;
    if (m2.volumeSpike) spikes++; if (m2.displacement) disps++;
  }
}
ok(bad === 0, 'fuzz 500 deret: displacement di filter selalu sama dengan ictIsDisplacement milik engine (satu definisi)');
ok(spikes > 10 && disps > 10, `fuzz mencakup kedua jenis momentum (spike ${spikes}, displacement ${disps})`);

console.log('\n[kebersihan blok]');
ok(!/\b(document|localStorage|fetch|window|tickerData)\b/.test(filters), 'blok filter murni: tidak menyentuh DOM/localStorage/fetch/global app');
ok(!/\bfl(Sma|Ema|Ma|Volume|Momentum)[A-Za-z]*\b|FILTER_CFG/.test(engine), 'engine ICT tidak memanggil filter (filter menimbang di luar inti, bukan di dalamnya)');
ok(!/\b(rsi|macd|adx|atr|bollinger|vwap|stoch)/i.test(filters), 'blok filter tidak memuat indikator yang tetap dilarang (RSI, MACD, ADX, ATR, Bollinger, VWAP, Stoch)');

if (failed) { console.log('\n' + failed + ' uji filter GAGAL'); process.exit(1); }
console.log('\nSemua uji filter lulus.');
