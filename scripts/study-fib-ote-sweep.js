#!/usr/bin/env node
/**
 * Penyapuan ambang ukuran leg untuk studi Fib vs OTE: berapa kali rata-rata range candle sebuah leg harus besar agar dianggap impuls
 * (bukan noise)? Memakai candle yang SUDAH diunduh studi (tanpa jaringan). Alat riset, bukan kode aplikasi.
 * Pilih ambang dari data LATIH, lalu periksa di data UJI. Jangan memilih dari data uji.
 *
 * Pakai: node scripts/study-fib-ote-sweep.js --data=./out/data [--pairs=50] [--mults=1.5,2,3,4,5,6] [--src=path/index.html]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const S = require('./study-fib-ote.js');

const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const dataDir = path.resolve(arg('data', './out/data'));
const mults = arg('mults', '1.5,2,3,4,5,6').split(',').map(Number);
const src = arg('src', path.resolve(__dirname, '..', 'index.html'));
const engine = S.loadEngine(src);
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
const OTE = 'OTE 0.62-0.79', GP = 'GP 0.618-0.650';
const f2 = x => x === null || x === undefined ? '-' : x.toFixed(2), pc = x => x === null || x === undefined ? '-' : (x * 100).toFixed(0) + '%';

// satu kali baca candle, lalu analisis per ambang
const data = files.map(f => { const m = f.match(/^(.+)_(4h|1d)\.json$/); return m ? { sym: m[1], tf: m[2], c: JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8')) } : null; }).filter(d => d && d.c.length >= 120);
const pairsN = new Set(data.map(d => d.sym)).size;
console.log(`# Penyapuan ambang ukuran leg (Fib vs OTE)\n\nData: ${pairsN} pair, ${data.length} deret candle. Ambang = leg >= N x rata-rata range 1 candle (20 candle sebelum ujung leg).\n`);

const rows = {};
for (const m of mults) {
  const recs = [];
  for (const d of data) recs.push(...S.analyze(d.c, d.tf, engine, { minMult: m }));
  rows[m] = S.summarize(recs);
}
for (const tf of ['4h', '1d', 'semua']) {
  console.log(`## TF ${tf}\n`);
  console.log('| ambang | leg (latih/uji) | OTE trade latih | OTE win latih | OTE R latih (selang) | OTE trade uji | OTE win uji | OTE R uji (selang) | GP R uji | kepadatan OTE/GP uji |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const m of mults) {
    const S2 = rows[m][tf]; if (!S2) continue;
    const L = S2.periods.latih, U = S2.periods.uji, oL = L.zones[OTE], oU = U.zones[OTE], gU = U.zones[GP];
    console.log(`| ${m}x | ${L.legs}/${U.legs} | ${oL.trades} | ${pc(oL.win.p)} | ${f2(oL.r.mean)} (${f2(oL.r.lo)}–${f2(oL.r.hi)}) | ${oU.trades} | ${pc(oU.win.p)} | ${f2(oU.r.mean)} (${f2(oU.r.lo)}–${f2(oU.r.hi)}) | ${f2(gU.r.mean)} | ${f2(oU.density)}/${f2(gU.density)} |`);
  }
  console.log('');
}
// pilih dari LATIH (TF semua): ambang dengan R latih tertinggi yang masih punya >= 500 trade OTE di latih; lalu laporkan hasil UJI-nya
const cand = mults.map(m => ({ m, L: rows[m].semua.periods.latih.zones[OTE], U: rows[m].semua.periods.uji.zones[OTE] })).filter(x => x.L.trades >= 500);
cand.sort((a, b) => b.L.r.mean - a.L.r.mean);
const best = cand[0];
console.log(`## Pemilihan dari data LATIH (TF semua, syarat >= 500 trade OTE di latih)\n`);
if (best) console.log(`Ambang terbaik di latih: **${best.m}x** (R latih ${f2(best.L.r.mean)}, ${best.L.trades} trade). Hasil di UJI: R ${f2(best.U.r.mean)} (${f2(best.U.r.lo)}–${f2(best.U.r.hi)}), ${best.U.trades} trade, win ${pc(best.U.win.p)}.`);
const mono = mults.map(m => rows[m].semua.periods.uji.zones[OTE].r.mean);
console.log(`\nR OTE di UJI menurut ambang: ${mults.map((m, i) => `${m}x:${f2(mono[i])}`).join('  ')}`);
