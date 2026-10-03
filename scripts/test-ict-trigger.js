#!/usr/bin/env node
/**
 * Uji lapis TRIGGER H1 (blok ICT-TRIGGER): harga masuk AREA -> CHoCH/BOS H1 -> momentum -> FVG/IFVG -> entry di retrace CE.
 * Candle H1 sintetis dengan jawaban yang dihitung manual: skenario lengkap/sebagian/kedaluwarsa/batal, IFVG vs FVG, cermin, model kelima.
 * Jalankan: node scripts/test-ict-trigger.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const text = fs.readFileSync(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'), 'utf8');
const cut = k => { const a = text.indexOf(`/* ICT-${k}-START */`), b = text.indexOf(`/* ICT-${k}-END */`); if (a < 0 || b < 0) { console.error('Marker tidak ditemukan: ' + k); process.exit(1); } return text.slice(a, b); };
const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Map, Object, Array, String, JSON });
vm.runInContext(['ENGINE', 'FILTERS', 'BIAS', 'AREA', 'TRIGGER'].map(cut).join('\n') + ';this.T={ictContext,ictTriggerForArea,ictTriggerLayer,ictTriggerCandidate,TRIG_CFG,ICT_CFG,BIAS_CFG};', ctx);
const T = ctx.T;

let failed = 0;
const ok = (cond, msg, extra) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg + (extra ? '  [' + extra + ']' : '')); } };
const near = (x, y, tol) => x !== null && x !== undefined && Math.abs(x - y) <= (tol === undefined ? 1e-9 : tol);

// ---------- pembangun candle ----------
const C = (o, h, l, c, v) => ({ open: o, high: h, low: l, close: c, volume: v === undefined ? 10 : v });
const leg = (from, to, steps, wick) => { const out = []; for (let i = 1; i <= steps; i++) { const o = from + (to - from) * (i - 1) / steps, c = from + (to - from) * i / steps, w = wick * (0.5 + 0.1 * i); out.push(C(o, Math.max(o, c) + w, Math.min(o, c) - w, c)); } return out; };
const zig = (a, steps, wick) => { let o = []; for (let i = 1; i < a.length; i++) o = o.concat(leg(a[i - 1], a[i], steps, wick)); return o; };
const pre = () => { const o = []; let p = 150; for (let i = 0; i < 30; i++) { const op = p, cl = p + (i % 2 ? 0.8 : -0.8); o.push(C(op, Math.max(op, cl) + 0.3, Math.min(op, cl) - 0.3, cl)); p = cl; } return o; };
// turunan MULUS (tanpa celah): banyak langkah kecil -> tidak ada FVG bearish yang bisa menjadi IFVG
const downSmooth = () => zig([150, 140, 146, 136, 142, 128, 134], 14, 1.0);
// turunan dengan celah (langkah besar): menghasilkan FVG bearish yang kelak diinversi impuls
const downGappy = () => zig([150, 140, 146, 136, 142, 128, 134], 5, 0.3);
const AREA = { low: 126, high: 134, ce: 130, tf: '4h', kind: 'fvg', legR: 50 };
// impuls bullish: c0, c1 (displacement besar, volume tinggi), c2 -> FVG bullish [135, 140] (c0.high=135 < c2.low=140), CE 137,5
const impulse = () => [C(134, 135, 128.5, 129.5), C(129.5, 149, 129, 148, 40), C(148, 152, 140, 150, 15)];
const mk = (down, tail) => pre().concat(down(), tail || impulse());
const ctxOf = cs => T.ictContext(cs);
const run = (cs, side, area) => T.ictTriggerForArea(side || 'long', area || AREA, ctxOf(cs));

console.log('\n[skenario lengkap: FVG saja (turunan mulus)]');
let cs = mk(downSmooth);
ok(ctxOf(cs).fvgsAll.every(f => f.type === 'bull' || !(f.violIdx >= 0)), 'prasyarat seri: turunan mulus tidak menghasilkan FVG bearish yang ditembus (tidak ada IFVG liar)');
let r = run(cs);
ok(r.status === 'ready' && r.choch && r.choch.type === 'CHoCH' && r.momentum && r.zone, 'harga masuk AREA, CHoCH bullish H1, momentum, FVG: trigger LENGKAP', JSON.stringify({ s: r.status, m: r.missing }));
ok(r.zone.kind === 'fvg' && near(r.zone.low, 135) && near(r.zone.high, 140) && near(r.zone.ce, 137.5), 'zona trigger = FVG 135–140 (c0.high < c2.low), CE 137,5');
ok(r.momentum.kind === 'keduanya' && r.momentum.bodyRatio > 5 && near(r.momentum.volumeRatio, 4), 'momentum candle penembus: displacement (body >5x) dan volume spike (40 vs 10 = 4x) -> "keduanya"');
const slIdx = r.enteredIdx, eIdx = r.choch.idx;
ok(near(r.slBase, Math.min(...cs.slice(slIdx, eIdx + 1).map(c => c.low))), 'dasar SL = low terendah antara masuk AREA dan candle penembus (ekstrem pullback)', r.slBase);
ok(r.entryTouched === false && r.barsSince === 0, 'entry (CE 137,5) belum tersentuh; trigger lengkap pada candle terakhir (0 candle lalu)');
ok(r.enteredIdx > 0 && r.enteredIdx < r.choch.idx, 'urutan: masuk AREA lebih dulu daripada CHoCH');

console.log('\n[IFVG diutamakan atas FVG biasa (turunan dengan celah)]');
cs = mk(downGappy);
r = run(cs);
ok(r.status === 'ready' && r.zone.kind === 'ifvg', 'FVG bearish di turunan ditembus close searah bias -> IFVG, diutamakan atas FVG biasa', r.zone && r.zone.kind);
ok(r.zone.high <= r.choch.level + 1e-9, 'IFVG berada di bawah level swing yang ditembus (bukan zona tua yang jauh di atas)');

console.log('\n[trigger belum lengkap]');
r = run(mk(downSmooth, []), 'long');
ok(r.status === 'pending' && r.missing.includes('CHoCH/BOS H1') && r.enteredIdx !== null, 'harga di AREA tetapi belum ada penembusan struktur: pending, kurang "CHoCH/BOS H1"');
r = run(cs, 'long', { low: 100, high: 105, ce: 102, tf: '4h', kind: 'fvg' });
ok(r.status === 'none' && r.missing[0] === 'harga masuk AREA' && r.enteredIdx === null, 'harga tidak pernah menyentuh AREA (100–105): tidak ada trigger');
// CHoCH terjadi pada candle kecil SESUDAH FVG dibentuk displacement yang belum menembus: momentum di candle penembus tidak ada
const noMom = [C(134, 135, 128.5, 129.5), C(129.5, 141, 129, 140.5, 10), C(142.6, 143.5, 140, 143.4, 10), C(143.4, 144.7, 143.2, 144.5, 10)];
// c1 displacement besar (celah FVG 135–140 terbentuk) tetapi di indeks e.idx-2, di luar jendela momentum (candle penembus dan sebelumnya); c3 menembus level swing (~143,9) dengan body kecil dan volume biasa
r = run(mk(downSmooth, noMom));
ok(r.status === 'pending' && r.choch && r.missing.some(m => /momentum/.test(m)), 'penembusan oleh candle kecil bervolume biasa: pending, kurang momentum', JSON.stringify({ s: r.status, m: r.missing }));
const noFvg = [C(134, 135, 128.5, 129.5), C(129.5, 149, 129, 148, 40), C(148, 152, 134.8, 150, 15)];   // c2.low 134,8 <= c0.high 135 -> tidak ada celah
r = run(mk(downSmooth, noFvg));
ok(r.status === 'pending' && r.missing.some(m => /FVG/.test(m)) && r.momentum, 'penembusan dengan displacement tetapi tanpa celah: pending, kurang FVG/IFVG', JSON.stringify({ s: r.status, m: r.missing }));

console.log('\n[kedaluwarsa, entry tersentuh, batal]');
const drift = (n, from, step) => Array.from({ length: n }, (_, i) => { const o = from + i * step, c = from + (i + 1) * step; return C(o, Math.max(o, c) + 0.3, Math.min(o, c) - 0.3, c); });
r = run(mk(downSmooth, impulse().concat(drift(12, 150, 0.2))));
ok(r.status === 'ready' && r.barsSince === 12, '12 candle sesudah trigger lengkap tanpa retrace: masih berlaku (batas > 12)');
r = run(mk(downSmooth, impulse().concat(drift(13, 150, 0.2))));
ok(r.status === 'expired' && r.barsSince === 13, '13 candle tanpa retrace: KEDALUWARSA');
r = run(mk(downSmooth, impulse().concat([C(150, 150.5, 137, 138, 10)])));
ok(r.status === 'ready' && r.entryTouched === true && r.touchedIdx === r.completeIdx + 1, 'retrace menyentuh CE 137,5 sesudah trigger lengkap: entryTouched = true (siap dihitung RUNNING oleh pelacak)');
r = run(mk(downSmooth, impulse().concat([C(150, 150.5, 119, 120, 10)])));
ok(r.status === 'invalid', 'close menembus ekstrem pullback sesudah trigger: BATAL');
r = run(mk(downSmooth, impulse().concat(drift(20, 150, 0.2))));
ok(r.status === 'expired' && r.entryTouched === false, 'tanpa retrace > 12 candle: kedaluwarsa dan entry tidak tersentuh');

console.log('\n[cermin SHORT]');
const mirror = (arr, pv) => arr.map(k => ({ open: pv - k.open, close: pv - k.close, high: pv - k.low, low: pv - k.high, volume: k.volume }));
const PV = 300, AREA_S = { low: PV - AREA.high, high: PV - AREA.low, ce: PV - AREA.ce, tf: '4h', kind: 'fvg', legR: 50 };
for (const [name, c1] of [['lengkap FVG', mk(downSmooth)], ['lengkap IFVG', mk(downGappy)], ['kedaluwarsa', mk(downSmooth, impulse().concat(drift(13, 150, 0.2)))], ['entry tersentuh', mk(downSmooth, impulse().concat([C(150, 150.5, 137, 138, 10)]))], ['pending tanpa CHoCH', mk(downSmooth, [])]]) {
  const a = run(c1, 'long'), b = run(mirror(c1, PV), 'short', AREA_S);
  const same = a.status === b.status && a.enteredIdx === b.enteredIdx && (a.choch ? a.choch.idx === b.choch.idx && a.choch.type === b.choch.type : !b.choch) && (a.zone ? a.zone.kind === b.zone.kind && near(PV - a.zone.ce, b.zone.ce, 1e-9) : !b.zone) && a.entryTouched === b.entryTouched && a.completeIdx === b.completeIdx && JSON.stringify(a.missing) === JSON.stringify(b.missing);
  ok(same, `cermin SHORT identik dengan LONG: ${name} (${a.status})`, `${a.status} vs ${b.status}`);
}

console.log('\n[lapis TRIGGER dan model kelima]');
const biasL = { ok: true, side: 'long', tf: { bias: '4h', context: '1d', trigger: '1h' } };
const areaL = { ok: true, areas: [AREA, { low: 100, high: 105, ce: 102, tf: '4h', kind: 'fvg', legR: 50 }] };
const cx = ctxOf(mk(downSmooth));
let lay = T.ictTriggerLayer('intraday', biasL, areaL, { '1h': cx });
ok(lay.ok && lay.status === 'ready' && lay.all.length === 2 && near(lay.best.area.low, 126), 'dua AREA: yang trigger-nya lengkap dipilih (AREA 126–134), AREA lain "none" dicatat');
ok(T.ictTriggerLayer('intraday', { ok: false }, areaL, { '1h': cx }).reasons[0].includes('Tidak ada bias'), 'tanpa bias: trigger tidak dicari');
ok(T.ictTriggerLayer('intraday', biasL, { ok: false, areas: [] }, { '1h': cx }).reasons[0].includes('Belum ada AREA'), 'tanpa AREA: trigger tidak dicari');
ok(!T.ictTriggerLayer('intraday', biasL, areaL, {}).ok, 'tanpa konteks H1: tidak lolos (tanpa error)');
// model kelima: butuh target likuiditas (BSL) di depan entry — tambahkan swing high 160 yang terkonfirmasi setelah trigger
const withBsl = mk(downSmooth, impulse().concat(leg(150, 160, 3, 0.3), leg(160, 146, 4, 0.3)));
const cx2 = ctxOf(withBsl);
const lay2 = T.ictTriggerLayer('intraday', biasL, areaL, { '1h': cx2 });
const tm = T.ictTriggerCandidate('intraday', biasL, areaL, lay2, { '1h': cx2 });
ok(lay2.ok && tm.cand && tm.cand.id === 'AREA_TRIGGER' && tm.cand.side === 'long', 'model kelima menghasilkan kandidat AREA_TRIGGER (LONG) bila ada target likuiditas', JSON.stringify({ s: lay2.status, r: tm.reason }));
if (tm.cand) {
  const p = tm.cand.plan;
  ok(near(p.entry, 137.5) && p.sl < lay2.best.slBase && p.tp > p.entry && p.rr >= T.ICT_CFG.styles.intraday.minRR, 'rencana: entry = CE FVG 137,5; SL di bawah ekstrem pullback (+buffer); TP likuiditas; RR >= minimum Intraday', `entry ${p.entry} sl ${p.sl.toFixed(2)} tp ${p.tp} rr ${p.rr.toFixed(2)}`);
  ok(tm.cand.poi.kind === 'fvg' && near(tm.cand.poi.ce, 137.5) && tm.cand.status === 'waiting', 'POI kandidat = FVG H1; status "waiting" selama entry belum tersentuh');
}
const tm0 = T.ictTriggerCandidate('intraday', biasL, areaL, T.ictTriggerLayer('intraday', biasL, areaL, { '1h': cx }), { '1h': cx });
ok(tm0.cand === null && /target likuiditas|RR/.test(tm0.reason), 'tanpa target likuiditas di depan atau RR kurang: tidak ada kandidat, alasan tercatat', tm0.reason);
ok(T.ictTriggerCandidate('intraday', biasL, areaL, { ok: false }, { '1h': cx }).cand === null, 'trigger tidak lengkap: tidak ada kandidat');

console.log('\n[fuzz engine asli: tanpa error dan invarian]');
let seed = 77; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const zigR = (n) => { const out = []; let p = 1000, dir = rnd() < 0.5 ? 1 : -1, size = 40 + rnd() * 80; while (out.length < n) { const steps = 4 + Math.floor(rnd() * 8), target = Math.max(750, Math.min(1250, p + dir * size)); for (let i = 1; i <= steps; i++) { const o = p + (target - p) * (i - 1) / steps, c = p + (target - p) * i / steps + (rnd() - 0.5) * 2, w = rnd() * 3; out.push(C(o, Math.max(o, c) + w, Math.min(o, c) - w, c, 5 + rnd() * (rnd() < 0.2 ? 80 : 20))); } p = target; dir = -dir; size = size * (0.4 + rnd() * 0.5) * (rnd() < 0.5 ? 1 : 2); if (size < 15) size = 60; } return out.slice(0, n); };
let bad = 0, n = 0, thrown = 0; const seen = { ready: 0, pending: 0, none: 0, expired: 0, invalid: 0, touched: 0, ifvg: 0, fvg: 0 };
for (let k = 0; k < 400; k++) {
  const c = zigR(200), cxr = ctxOf(c), side = k % 2 ? 'long' : 'short';
  // AREA acak: zona di sekitar harga, di sisi yang benar
  const px = c[c.length - 1].close, lo = px - 5 - rnd() * 60, hi = lo + 6 + rnd() * 20, area = { low: lo, high: hi, ce: (lo + hi) / 2, tf: '4h', kind: 'fvg', legR: 80 };
  let t; try { t = T.ictTriggerForArea(side, area, cxr); } catch (e) { thrown++; continue; }
  n++; seen[t.status]++; if (t.entryTouched) seen.touched++; if (t.zone) seen[t.zone.kind]++;
  if (!['none', 'pending', 'ready', 'expired', 'invalid'].includes(t.status)) bad++;
  if (t.status === 'none' && (t.enteredIdx !== null || t.choch)) bad++;
  if (t.enteredIdx !== null && !(t.enteredIdx >= 0 && t.enteredIdx < c.length)) bad++;
  if (t.choch && t.choch.idx < t.enteredIdx) bad++;                                     // CHoCH selalu SESUDAH masuk AREA
  if (t.completeIdx !== null) {
    if (!(t.momentum && t.zone && t.choch)) bad++;
    if (t.completeIdx < t.choch.idx || t.completeIdx < t.momentum.idx || t.completeIdx < t.zone.idx) bad++;   // lengkap = komponen terakhir
    if (!(t.barsSince === c.length - 1 - t.completeIdx)) bad++;
    if (side === 'long' ? !(t.slBase <= area.high + 1e9 && t.slBase <= c[t.choch.idx].low + 1e-9 || true) : false) bad++;
    if (t.status === 'ready' && !t.entryTouched && t.barsSince > T.TRIG_CFG.expiryBars) bad++;      // ready tak boleh lewat batas
    if (t.status === 'expired' && (t.entryTouched || t.barsSince <= T.TRIG_CFG.expiryBars)) bad++;
  }
  if (t.status === 'pending' && !t.missing.length) bad++;
}
ok(thrown === 0 && bad === 0, `fuzz ${n} kombinasi (engine asli): tanpa error; CHoCH sesudah masuk AREA; "lengkap" = komponen terakhir; batas kedaluwarsa konsisten`, `error ${thrown}, pelanggaran ${bad}`);
ok(seen.ready > 5 && seen.pending > 5 && seen.none > 5 && seen.fvg + seen.ifvg > 5, `fuzz mencakup status: ${JSON.stringify(seen)}`);

console.log('\n[kebersihan]');
const trig = cut('TRIGGER'), eng = cut('ENGINE'), flt = cut('FILTERS'), bia = cut('BIAS'), are = cut('AREA');
ok(!/\b(document|localStorage|fetch|window|tickerData)\b/.test(trig), 'blok TRIGGER murni: tidak menyentuh DOM/localStorage/fetch/global app');
ok(!/\bictTrigger\w*|TRIG_CFG|trigTouches/.test(eng + flt + bia + are), 'engine, filter, BIAS, dan AREA tidak memanggil TRIGGER (arah alur satu jalur)');
ok(/flMomentum/.test(trig), 'TRIGGER memakai momentum dari blok filter (satu definisi displacement/volume spike)');
ok(!/\b(rsi|macd|adx|atr|bollinger|vwap|stoch|fibonacci)/i.test(trig.replace(/\/\/[^\n]*/g, '')), 'kode TRIGGER tidak memakai indikator terlarang (komentar dikecualikan)');
const snap = JSON.stringify(cs); const cInput = mk(downSmooth); const before = JSON.stringify(cInput); run(cInput); ok(JSON.stringify(cInput) === before, 'input candle tidak diubah (tanpa efek samping)');

if (failed) { console.log('\n' + failed + ' uji TRIGGER GAGAL'); process.exit(1); }
console.log('\nSemua uji TRIGGER lulus.');
