#!/usr/bin/env node
/**
 * Analisis fitur sinyal ICT terhadap hasil trade — OPSIONAL, bahan riset (tidak dijalankan di CI).
 *
 * Input: berkas JSONL dari `node scripts/backtest-ict.js --dump=berkas.jsonl` (satu baris = satu kandidat
 * setup + fitur + hasil simulasi). Berisi juga kandidat yang DITOLAK engine, jadi bisa dinilai apakah aturan
 * penyaring yang ada memang menambah nilai.
 *
 * Untuk tiap fitur (dibagi ke kategori / kuartil), dilaporkan: jumlah trade terisi, win rate, ekspektasi rata-rata
 * (R per trade), t-stat, dan ekspektasi di periode LATIH vs UJI secara terpisah. Sebuah bucket ditandai ★ hanya
 * kalau: ekspektasi positif di KEDUA periode, t-stat total ≥ ambang Bonferroni, dan n cukup besar. Ini sengaja
 * ketat — puluhan bucket diuji sekaligus, jadi "terlihat bagus" saja hampir pasti kebetulan.
 *
 * Peringatan jujur: trade pada pair/waktu berdekatan saling berkorelasi, jadi t-stat di sini cenderung OPTIMIS.
 *
 * Jalankan: node scripts/analyze-features.js berkas.jsonl [--only=valid|all] [--min-n=150]
 */
'use strict';
const fs = require('fs');

const files = process.argv.slice(2).filter(a => !a.startsWith('--'));
const opt = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const ONLY = opt('only', 'all');
const MIN_N = parseInt(opt('min-n', '150'), 10);
if (!files.length) { console.error('Pakai: node scripts/analyze-features.js berkas.jsonl [--only=valid|all] [--min-n=150]'); process.exit(1); }

let rows = [];
files.forEach(f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).forEach(l => { try { rows.push(JSON.parse(l)); } catch (e) { /* baris rusak */ } }));
const all = rows.filter(r => r.filled && r.f);
const data = ONLY === 'valid' ? all.filter(r => r.valid) : all;

function stat(a) {
  const n = a.length;
  if (!n) return { n: 0, mean: 0, t: 0, win: 0 };
  const m = a.reduce((x, r) => x + r.R, 0) / n;
  const sd = Math.sqrt(a.reduce((x, r) => x + (r.R - m) ** 2, 0) / Math.max(1, n - 1));
  return { n, mean: m, t: sd > 0 ? m / (sd / Math.sqrt(n)) : 0, win: a.filter(r => r.out === 'TP').length / n };
}
const fmt = x => (x >= 0 ? '+' : '') + x.toFixed(2);

// ---------- definisi fitur ----------
const NUM = ['rr', 'riskPct', 'depth', 'passRatio', 'htfRangeDepth', 'sweepBarsAgo', 'mssBarsAgo', 'poiAge', 'poiHeightRel', 'ltfEventAge', 'htfEventAge', 'dayOpenPos', 'weekOpenPos', 'chop40', 'chochCount40', 'sweepCount'];
const CAT = ['setup', 'side', 'status', 'grade', 'inOte', 'htfAligned', 'htf2Aligned', 'displacement', 'poiKind', 'poiTouched', 'ltfEvent', 'htfEvent', 'killzone', 'pdSwept', 'pwSwept', 'asiaSwept', 'breakerAligned', 'obFvgOverlap', 'usOpen'];

function quartileBounds(vals) {
  const v = vals.filter(x => x !== null && x !== undefined && isFinite(x)).sort((a, b) => a - b);
  if (v.length < 8) return null;
  return [0.25, 0.5, 0.75].map(q => v[Math.floor(q * (v.length - 1))]);
}
function bucketOf(x, b) {
  if (x === null || x === undefined || !isFinite(x)) return 'n/a';
  return x <= b[0] ? 'Q1 (terendah)' : x <= b[1] ? 'Q2' : x <= b[2] ? 'Q3' : 'Q4 (tertinggi)';
}

function report(title, set) {
  console.log(`\n=== ${title} ===`);
  const total = stat(set);
  console.log(`  baseline: n=${total.n} | win ${(total.win * 100).toFixed(0)}% | ekspektasi ${fmt(total.mean)}R | t=${total.t.toFixed(1)}`);
  const lines = [];
  const tests = [];
  const add = (feat, label, sub) => {
    if (sub.length < MIN_N / 3) return;
    const s = stat(sub), tr = stat(sub.filter(r => r.phase === 'latih')), te = stat(sub.filter(r => r.phase === 'uji'));
    lines.push({ feat, label, s, tr, te });
    tests.push(1);
  };
  NUM.forEach(k => {
    const b = quartileBounds(set.map(r => r.f[k]));
    if (!b) return;
    const groups = {};
    set.forEach(r => { const g = bucketOf(r.f[k], b); (groups[g] = groups[g] || []).push(r); });
    Object.keys(groups).sort().forEach(g => add(k, `${g}${g !== 'n/a' ? ` (≤${b[['Q1 (terendah)', 'Q2', 'Q3', 'Q4 (tertinggi)'].indexOf(g)] !== undefined ? (+b[['Q1 (terendah)', 'Q2', 'Q3', 'Q4 (tertinggi)'].indexOf(g)]).toPrecision(3) : '∞'})` : ''}`, groups[g]));
  });
  CAT.forEach(k => {
    const groups = {};
    set.forEach(r => { const g = String(r.f[k]); (groups[g] = groups[g] || []).push(r); });
    Object.keys(groups).sort().forEach(g => add(k, g, groups[g]));
  });
  const m = tests.length;
  const zCrit = 3.0 + 0.0 * m; // ≈ Bonferroni untuk puluhan uji (p≈0.003 per uji)
  console.log(`  ${m} bucket diuji — ambang ★: t ≥ ${zCrit.toFixed(1)}, positif di LATIH dan UJI, n ≥ ${MIN_N}`);
  console.log('  fitur'.padEnd(16) + 'bucket'.padEnd(30) + '    n   win   ekspektasi   t     LATIH(n)     UJI(n)');
  lines.sort((a, b) => b.s.t - a.s.t).forEach(l => {
    const star = l.s.n >= MIN_N && l.s.t >= zCrit && l.tr.mean > 0 && l.te.mean > 0 && l.tr.n >= 30 && l.te.n >= 30 ? ' ★' : '';
    console.log(`  ${l.feat.padEnd(14)}${l.label.padEnd(30)}${String(l.s.n).padStart(5)} ${(l.s.win * 100).toFixed(0).padStart(4)}%  ${fmt(l.s.mean).padStart(8)}R ${l.s.t.toFixed(1).padStart(6)}  ${fmt(l.tr.mean).padStart(6)}(${String(l.tr.n).padStart(4)})  ${fmt(l.te.mean).padStart(6)}(${String(l.te.n).padStart(4)})${star}`);
  });
  const stars = lines.filter(l => l.s.n >= MIN_N && l.s.t >= zCrit && l.tr.mean > 0 && l.te.mean > 0 && l.tr.n >= 30 && l.te.n >= 30);
  console.log(stars.length ? `\n  ★ ${stars.length} bucket lolos kriteria ketat: ${stars.map(l => l.feat + '=' + l.label.split(' ')[0]).join(', ')}` : '\n  Tidak ada bucket yang lolos kriteria ketat (positif di latih DAN uji, t ≥ ambang).');
}

console.log(`Analisis fitur — ${files.length} berkas, ${rows.length} kandidat, ${all.length} terisi, dianalisis: ${data.length} (${ONLY})`);
const v = all.filter(r => r.valid), x = all.filter(r => !r.valid);
console.log('\nApakah penyaring engine menambah nilai?');
[['lolos engine (valid)', v], ['ditolak engine', x]].forEach(([l, a]) => { const s = stat(a); console.log(`  ${l.padEnd(24)} n=${String(s.n).padStart(5)} | win ${(s.win * 100).toFixed(0)}% | ekspektasi ${fmt(s.mean)}R | t=${s.t.toFixed(1)}`); });
['intraday', 'swing'].forEach(st => { const s = data.filter(r => r.style === st); if (s.length) report(`GAYA ${st.toUpperCase()}`, s); });
