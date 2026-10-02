#!/usr/bin/env node
/**
 * Uji model dari dua berkas panduan — "ICT Unicorn Model" dan "The Inverse Blueprint" (IFVG) — dengan candle sintetis
 * yang jawabannya dihitung manual. Mengekstrak blok /* ICT-ENGINE-START *​/../* ICT-ENGINE-END *​/ dari index.html.
 *
 * Yang diuji (sesuai isi berkas):
 *   - Killzone Asia 20:00–00:00 / London 02:00–05:00 / New York 07:00–10:00 dan macro persis seperti tabel berkas
 *   - Unicorn: DOL=EQH/EQL, manipulation leg menjauhi DOL, breaker ∩ FVG, entry retest, SL di BODY leg, TP 2 STDV atau DOL, min 2R
 *   - IFVG: FVG tunggal dilanggar body closure; tipe POI→IFVG, Sweep→IFVG, Model Favorit (BOS + inducement + DOL);
 *     4 cara entry (body closure, retrace awal, 50%, FVG+FVG/BPR), 2 SL (swing, pelanggaran IFVG), TP (LHF, FVG mayor, external/internal), 2 breakeven
 *   - cermin harga (long ↔ short) harus menghasilkan level yang terbalik persis
 *
 * Jalankan: node scripts/test-ict-models.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const text = fs.readFileSync(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'), 'utf8');
const a = text.indexOf('/* ICT-ENGINE-START */'), b = text.indexOf('/* ICT-ENGINE-END */');
if (a < 0 || b < 0) { console.error('Marker ICT-ENGINE tidak ditemukan'); process.exit(1); }
const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Object, Array, String });
vm.runInContext(text.slice(a, b) + `;this.E={ICT_CFG,ICT_DEFAULT_PREFS,ictEvaluate,ictContext,ictSetupUnicorn,ictIfvgCandidates,ictMacro,ictKillzone,ictOrderFlow,ictFVGs,ictAllSweeps,ictLiquidityAhead,ictColorGroup,ictSessionLevels};`, ctx);
const E = ctx.E;

let failed = 0;
const ok = (cond, msg) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg); } };
const near = (x, y, tol) => x !== null && x !== undefined && Math.abs(x - y) <= (tol === undefined ? 1e-6 : tol);

// ---------- pembangun candle ----------
const C = (o, h, l, c) => ({ open: o, high: h, low: l, close: c, volume: 1 });
function leg(from, to, steps, wick){ const out = []; for(let i = 1; i <= steps; i++){ const o = from + (to - from) * (i - 1) / steps, c = from + (to - from) * i / steps, w = wick * (0.5 + 0.1 * i); out.push({ open: o, close: c, high: Math.max(o, c) + w, low: Math.min(o, c) - w, volume: 1 }); } return out; }
function zig(anchors, steps, wick){ let out = []; for(let i = 1; i < anchors.length; i++) out = out.concat(leg(anchors[i - 1], anchors[i], steps, wick)); return out; }
function mirror(cs, p){ return cs.map(k => ({ open: p - k.open, close: p - k.close, high: p - k.low, low: p - k.high, volume: k.volume, t: k.t })); }

const NOW = new Date('2025-01-15T14:00:00Z');   // 09:00 NY: killzone New York + macro NY AM 08:50–09:10
const cfg = Object.assign({}, E.ICT_CFG.styles.intraday);
const PREFS = (o) => Object.assign({}, E.ICT_DEFAULT_PREFS, o || {});
const ifvg = (cs, side, prefs, c2) => { const ltf = E.ictContext(cs); return E.ictIfvgCandidates(ltf, null, side, Object.assign({}, cfg, c2 || {}), E.ictKillzone(NOW), E.ictMacro(NOW), PREFS(prefs)); };
const unicorn = (cs, side) => E.ictSetupUnicorn(E.ictContext(cs), null, side, cfg, E.ictKillzone(NOW));

console.log('Uji model Unicorn & Inverse Blueprint\n');

// =============================== A. KILLZONE & MACRO (tabel berkas) ===============================
const kzAt = iso => E.ictKillzone(new Date(iso));
const mcAt = iso => E.ictMacro(new Date(iso));
ok(kzAt('2025-01-16T01:00:00Z').name === 'Asia' && kzAt('2025-01-16T04:59:00Z').name === 'Asia', 'killzone Asia 20:00–00:00 NY (01:00Z–04:59Z)');
ok(!kzAt('2025-01-16T05:00:00Z').active, '00:00 NY bukan killzone');
ok(kzAt('2025-01-15T07:00:00Z').name === 'London' && !kzAt('2025-01-15T10:00:00Z').active, 'killzone London 02:00–05:00 NY (batas atas eksklusif)');
ok(kzAt('2025-01-15T12:00:00Z').name === 'New York' && !kzAt('2025-01-15T15:00:00Z').active, 'killzone New York 07:00–10:00 NY (tanpa "London Close" yang bukan dari berkas)');
ok(kzAt('2025-07-15T11:30:00Z').name === 'New York', 'killzone mengikuti DST (11:30Z musim panas = 07:30 NY)');
ok(mcAt('2025-01-15T07:33:00Z').active && /London 02:33–03:00/.test(mcAt('2025-01-15T07:33:00Z').name) && !mcAt('2025-01-15T07:32:00Z').active, 'macro London 02:33–03:00');
ok(/London 04:03–04:30/.test(mcAt('2025-01-15T09:10:00Z').name), 'macro London 04:03–04:30');
ok(/NY AM 08:50–09:10/.test(mcAt('2025-01-15T13:50:00Z').name) && !mcAt('2025-01-15T14:10:00Z').active, 'macro NY AM 08:50–09:10 (batas atas eksklusif)');
ok(/NY AM 09:50–10:10/.test(mcAt('2025-01-15T14:55:00Z').name) && /NY AM 10:50–11:10/.test(mcAt('2025-01-15T15:55:00Z').name), 'macro NY AM 09:50–10:10 dan 10:50–11:10');
ok(/NY PM 11:50–12:10/.test(mcAt('2025-01-15T16:55:00Z').name) && /NY PM 13:10–13:40/.test(mcAt('2025-01-15T18:20:00Z').name) && /NY PM 15:15–15:45/.test(mcAt('2025-01-15T20:30:00Z').name), 'macro NY PM 11:50–12:10, 13:10–13:40, 15:15–15:45');
ok(!mcAt('2025-01-15T15:30:00Z').active, '10:30 NY di luar semua macro');

// =============================== B. UNICORN ===============================
// DOL = EQH ~140.57; manipulation leg 116.20 -> 104.00 (lower low di bawah 107.43); breaker = candle hijau terakhir [113.5, 116.2];
// FVG bullish hasil displacement [110.6, 115.1]; overlap = [113.5, 115.1]; entry long = tepi atas 115.1.
function unicornLong(){
  const c = zig([100, 120, 112, 140, 126, 140, 108], 14, 0.3);
  c.push(C(108.0, 110.0, 107.8, 109.8), C(109.8, 112.0, 109.6, 111.8), C(111.8, 114.2, 111.6, 114.0), C(114.0, 114.6, 113.4, 113.6), C(113.6, 116.2, 113.5, 116.0));
  c.push(C(116.0, 116.1, 113.0, 113.2), C(113.2, 113.4, 110.0, 110.2), C(110.2, 110.4, 106.5, 106.8), C(106.8, 107.0, 104.0, 104.6));
  c.push(C(104.6, 106.0, 104.4, 105.8), C(105.8, 108.2, 105.6, 108.0), C(108.0, 110.6, 107.9, 110.4), C(110.4, 115.2, 110.3, 115.0), C(115.2, 118.0, 115.1, 117.6));
  c.push(C(117.6, 117.8, 116.4, 116.6), C(116.6, 116.8, 115.6, 115.8), C(115.8, 116.0, 114.9, 115.2));
  return c;
}
const U = unicorn(unicornLong(), 'long');
ok(!!U && U.id === 'UNICORN' && U.side === 'long', 'Unicorn LONG terdeteksi');
if (U) {
  ok(near(U.plan.entry, 115.1, 1e-9), `entry = tepi atas overlap breaker∩FVG 115.10 (dapat ${U.plan.entry})`);
  ok(near(U.plan.sl, 104.6, 1e-9), `SL = BODY low manipulation leg 104.60, bukan wick 104.00 (dapat ${U.plan.sl})`);
  ok(near(U.plan.tp, 140.57, 0.01) && /DOL/.test(U.plan.tpLabel), `TP = DOL (EQH 140.57) karena 2 STDV hanya 1.27R (dapat ${U.plan.tp} — ${U.plan.tpLabel})`);
  ok(U.plan.rr >= 2 && near(U.plan.rr, (140.57 - 115.1) / (115.1 - 104.6), 0.01), `RR ke DOL = 2.43 ≥ 2R (dapat ${U.plan.rr.toFixed(3)})`);
  ok(U.plan.managed === false && U.notes.some(n => /trade management/i.test(n)), 'tanpa trade management (aturan berkas)');
  ok(U.status === 'in_zone' && U.check.grade === 'A' && !U.check.blockingFail, 'status in_zone, grade A, tanpa syarat wajib yang gagal');
  ok(U.unicorn.breaker.low === 113.5 && U.unicorn.breaker.high === 116.2 && U.unicorn.breaker.count === 1, 'breaker = candle hijau TERAKHIR sebelum lower low [113.5, 116.2]');
  ok(near(U.unicorn.stdv2, 116.2 + (116.2 - 104.0), 1e-9), `2 STDV = awal leg + ukuran leg = 128.40 (dapat ${U.unicorn.stdv2})`);
}
// cermin -> SHORT
const UM = unicorn(mirror(unicornLong(), 300), 'short');
ok(!!UM && UM.id === 'UNICORN' && UM.side === 'short', 'cermin: Unicorn SHORT terdeteksi (EQL, higher high, breaker merah)');
if (U && UM) {
  ok(near(300 - U.plan.entry, UM.plan.entry, 1e-6) && near(300 - U.plan.sl, UM.plan.sl, 1e-6) && near(300 - U.plan.tp, UM.plan.tp, 1e-6), 'cermin: entry/SL/TP SHORT = cermin LONG persis');
}
// DOL tidak ada -> bukan Unicorn
const noDol = zig([100, 120, 112, 134, 126, 139, 108], 14, 0.3).concat(unicornLong().slice(84));
ok(unicorn(noDol, 'long') === null, 'tanpa EQH (puncak tidak sejajar) -> BUKAN Unicorn (DOL wajib equal highs/lows)');
// 2R gagal (DOL terlalu dekat)
const lowDol = zig([100, 120, 112, 128, 120, 128, 108], 14, 0.3).concat(unicornLong().slice(84));
const U2R = unicorn(lowDol, 'long');
ok(!!U2R && U2R.plan.rr < 2 && U2R.check.checks.find(k => k.name === 'Minimal 2R').result === 'fail' && !!U2R.check.blockingFail, 'DOL dekat -> RR < 2 -> syarat "Minimal 2R" gagal & memblokir');
// retest sudah terjadi / SL kena
const ucs = unicornLong();
ok(unicorn(ucs.concat([C(115.2, 115.3, 114.8, 115.0)]), 'long').status === 'invalid', 'retest sudah terjadi lalu candle berikutnya -> setup batal');
const crash2 = unicorn(ucs.concat([C(115.2, 115.3, 103.0, 103.5)]), 'long');
ok(crash2 === null || crash2.status === 'invalid', 'harga jatuh menembus SL (otomatis juga melanggar FVG/breaker) -> setup batal / hilang');
ok(E.ictColorGroup(unicornLong(), 88, 'green', 4) !== null, 'ictColorGroup menemukan kelompok candle hijau');

// =============================== C. INVERSE BLUEPRINT (IFVG) ===============================
function sweepVariant(o){
  o = o || {};
  const c = zig([100, 92, 104, 94], 16, 0.2);
  c.push(...leg(94, 100.2, 12, 0.8));
  c.push(C(100.2, 100.6, 100.1, 100.5), C(100.5, 102.6, 100.4, 102.4), C(102.4, 103.0, 101.9, 102.8));        // FVG bullish F [100.6, 101.9]
  if (o.multi) c.push(C(103.3, 103.9, 103.1, 103.8)); else c.push(C(102.8, 103.6, 102.5, 103.4));
  c.push(C(o.multi ? 103.8 : 103.4, 104.8, o.multi ? 103.3 : 102.9, 103.2));                                    // sweep BSL (wick > 104.26, close balik)
  c.push(C(103.2, 103.3, 101.6, 101.8));
  if (o.bpr) c.push(C(101.3, 101.3, 100.0, 100.2)); else c.push(C(101.8, 101.9, 100.0, 100.2));                 // close 100.2 < F.low = body closure
  (o.tail || []).forEach(k => c.push(k));
  return c;
}
const S = ifvg(sweepVariant(), 'short');
ok(S.length === 1 && S[0].id === 'IFVG_SWEEP', 'Sweep → IFVG (short) terdeteksi sebagai satu kandidat');
const s0 = S[0];
if (s0) {
  ok(near(s0.plan.entry, 100.6, 1e-9) && /Retrace awal IFVG/.test(s0.plan.entryLabel), 'entry default = retrace ke AWAL IFVG = tepi IFVG terdekat harga (100.60)');
  ok(near(s0.plan.sl, 104.8, 1e-9), `SL swing = di atas high yang disapu 104.80 (dapat ${s0.plan.sl})`);
  ok(near(s0.plan.tp, 93.52, 0.01) && /Low hanging fruit/.test(s0.plan.tpLabel), `TP = low hanging fruit (swing low terdekat 93.52) (dapat ${s0.plan.tp})`);
  ok(s0.check.checks.length === 6 && s0.check.grade === 'A' && s0.check.passes === 6, 'checklist enam poin berkas, semua lulus -> A');
  ok(s0.status === 'waiting', 'harga belum retrace -> status waiting (pantau)');
  ok(near(s0.ifvg.entries.body.price, 100.2) && near(s0.ifvg.entries.ifvg.price, 100.6) && near(s0.ifvg.entries.ifvg50.price, 101.25), 'entry: body 100.20 · awal IFVG 100.60 · 50% IFVG 101.25');
  ok(near(s0.plan.be.price, 100.6 + 0.5 * (s0.plan.tp - 100.6), 1e-6) && s0.plan.beKey === 'rule50', 'breakeven Rule of 50 = separuh jarak ke TP');
  ok(s0.ifvg.sweep && s0.ifvg.sweep.level > 104 && s0.ifvg.sweep.src === 'swing', 'sweep BSL tercatat (swing high yang disapu)');
}
// cermin -> LONG
const SM = ifvg(mirror(sweepVariant(), 200), 'long');
ok(SM.length === 1 && SM[0].side === 'long' && SM[0].id === 'IFVG_SWEEP', 'cermin: Sweep → IFVG long terdeteksi');
if (s0 && SM[0]) ok(near(200 - s0.plan.entry, SM[0].plan.entry, 1e-6) && near(200 - s0.plan.sl, SM[0].plan.sl, 1e-6) && near(200 - s0.plan.tp, SM[0].plan.tp, 1e-6) && near(s0.plan.rr, SM[0].plan.rr, 1e-6), 'cermin: entry/SL/TP/RR long = cermin short persis');
// FVG tunggal
ok(ifvg(sweepVariant({ multi: true }), 'short').length === 0, 'FVG berurutan (bukan tunggal) -> TIDAK dihitung sebagai IFVG');
// BPR + preferensi entry
const BP = ifvg(sweepVariant({ bpr: true }), 'short')[0];
ok(!!BP && near(BP.ifvg.bpr.low, 101.3) && near(BP.ifvg.bpr.high, 101.9), 'BPR = overlap dua FVG [101.30, 101.90]');
ok(BP && near(BP.ifvg.entries.bprStart.price, 101.3) && near(BP.ifvg.entries.bpr50.price, 101.6) && near(BP.ifvg.entries.fvgStart.price, 101.3) && near(BP.ifvg.entries.fvg50.price, 102.1), 'entry BPR: awal BPR 101.30 · 50% BPR 101.60 · awal FVG 101.30 · 50% FVG 102.10');
const BP50 = ifvg(sweepVariant({ bpr: true }), 'short', { entry: 'bpr50' })[0];
ok(BP50 && near(BP50.plan.entry, 101.6) && /50% BPR/.test(BP50.plan.entryLabel), 'preferensi entry bpr50 dipakai (101.60)');
const FB = ifvg(sweepVariant({}), 'short', { entry: 'bpr50' })[0];
ok(FB && near(FB.plan.entry, 100.6) && /fallback/.test(FB.plan.entryLabel) && FB.notes.some(n => /tidak tersedia/.test(n)), 'BPR tidak ada -> fallback ke retrace awal IFVG, dengan catatan');
// status
ok(ifvg(sweepVariant({ tail: [C(100.2, 100.7, 100.0, 100.3)] }), 'short')[0].status === 'in_zone', 'candle terakhir menyentuh entry -> in_zone');
const late = ifvg(sweepVariant({ tail: [C(100.2, 100.7, 100.0, 100.3), C(100.3, 100.4, 99.8, 99.9)] }), 'short')[0];
ok(late.status === 'invalid' && /Retest/.test(late.invalidWhy), 'retest sudah terjadi di candle sebelumnya -> invalid');
const rev = ifvg(sweepVariant({ tail: [C(100.2, 102.6, 100.1, 102.4)] }), 'short')[0];
ok(rev.status === 'invalid' && /dilanggar balik/.test(rev.invalidWhy) && !!rev.check.blockingFail, 'close melewati sisi jauh IFVG -> IFVG dilanggar balik -> invalid');
const BD = ifvg(sweepVariant({}), 'short', { entry: 'body' })[0];
ok(BD && near(BD.plan.entry, 100.2) && BD.status === 'in_zone', 'entry body closure = close candle pelanggar (100.20), langsung in_zone');
const BDlate = ifvg(sweepVariant({ tail: [C(100.2, 100.3, 99.9, 100.0)] }), 'short', { entry: 'body' })[0];
ok(BDlate && /fallback/.test(BDlate.plan.entryLabel), 'body closure yang sudah lewat -> fallback ke retrace awal IFVG');
// SL / TP / BE alternatif
const ALT = ifvg(sweepVariant({}), 'short', { sl: 'ifvg', tp: 'range', be: 'lhf' })[0];
ok(ALT && near(ALT.plan.sl, 101.9) && ALT.plan.slCloseBased === true, 'SL pelanggaran IFVG = sisi jauh IFVG 101.90, berbasis penutupan (keluar manual)');
ok(ALT && /External|Internal/.test(ALT.plan.tpLabel) && ALT.ifvg.tpKey === 'range', 'TP external/internal (range) dipakai');
ok(ALT && near(ALT.plan.be.price, 93.52, 0.01) && ALT.plan.beKey === 'lhf', 'breakeven low hanging fruit = likuiditas terdekat');
ok(ifvg(sweepVariant({}), 'short', { be: 'none' })[0].plan.be === null, 'breakeven none -> tanpa panduan BE');
ok(Object.keys(s0.ifvg.tpOpts).includes('lhf') && Object.keys(s0.ifvg.tpOpts).includes('range'), 'opsi TP tersedia: lhf dan range (fvg bila ada FVG mayor)');

// ----- POI → IFVG -----
function poiShort(){
  const c = zig([113, 110, 112, 108.6, 110.4, 107.6, 109.5], 6, 0.15);
  c.push(C(109.5, 109.6, 108.4, 108.6), C(108.6, 108.7, 105.8, 106.0), C(106.0, 106.6, 105.4, 106.3));          // POI = FVG bearish [106.6, 108.4]
  c.push(C(106.3, 106.5, 104.6, 104.8), C(104.8, 105.0, 100.0, 104.2));                                          // SSL ~100
  c.push(C(104.2, 106.0, 104.4, 105.8), C(105.8, 107.6, 104.3, 107.5), C(107.5, 108.0, 107.1, 107.9));        // r1,r2 (masuk POI),r3 -> FVG bullish tunggal [106.0, 107.1]
  c.push(C(107.9, 108.2, 107.5, 107.6), C(107.6, 107.7, 105.7, 105.8));                                          // penolakan, lalu close 105.8 < 106.0
  return c;
}
const P = ifvg(poiShort(), 'short', {}, {})[0];
ok(!!P && P.id === 'IFVG_POI' && !P.favorite, 'POI → IFVG (short) terdeteksi, belum Model Favorit (tanpa inducement)');
if (P) {
  ok(near(P.ifvg.fvg.low, 106.0) && near(P.ifvg.fvg.high, 107.1) && P.ifvg.poi && P.ifvg.poi.kind === 'fvg' && near(P.ifvg.poi.low, 106.6), 'FVG yang dibalik [106.0,107.1] berada di dalam POI FVG bearish [106.6,108.4]');
  ok(P.notes.some(n => /Model Favorit/.test(n)), 'catatan menyebut apa yang kurang untuk Model Favorit');
}
// ----- MODEL FAVORIT -----
function favShort(){
  const c = zig([113, 110, 112, 108.6, 110.4, 107.6, 109.5], 6, 0.15);
  c.push(C(109.5, 109.6, 108.4, 108.6), C(108.6, 108.7, 105.8, 106.0), C(106.0, 106.6, 105.4, 106.3), C(106.3, 106.5, 104.6, 104.8), C(104.8, 105.0, 100.0, 104.2));
  c.push(C(104.2, 106.55, 104.1, 106.2), C(106.2, 106.3, 105.0, 105.2), C(105.2, 105.4, 104.7, 104.8));          // m1 = inducement tepat di bawah POI
  c.push(C(104.8, 106.0, 104.4, 105.8), C(105.8, 107.6, 104.6, 107.5), C(107.5, 108.0, 107.1, 107.9), C(107.9, 108.2, 107.5, 107.6), C(107.6, 107.7, 105.7, 105.8));
  return c;
}
const F = ifvg(favShort(), 'short', {}, { minRR: 0.5 })[0];   // minRR diturunkan: low hanging fruit memang dekat di skenario ini
ok(!!F && F.id === 'IFVG_FAV' && F.favorite === true, 'Model Favorit: BOS bearish + inducement di bawah POI + DOL jelas -> IFVG_FAV');
if (F) ok(!!F.ifvg.fav.bos && F.ifvg.fav.bos.type === 'BOS' && !!F.ifvg.fav.inducement && near(F.ifvg.fav.inducement.price, 106.55) && F.ifvg.fav.dol === true, 'komponen favorit: BOS tercatat, inducement 106.55, DOL ada');
const noInd = ifvg(poiShort(), 'short', {}, { minRR: 0.5 })[0];
ok(noInd && noInd.id === 'IFVG_POI', 'tanpa inducement -> tetap POI → IFVG biasa');

// =============================== D. ASIAN RANGE sebagai likuiditas ===============================
const T0 = Date.parse('2025-01-15T01:00:00Z');      // = 20:00 NY (14 Jan) -> jam pertama sesi Asia
const asia = Array.from({ length: 24 }, (_, i) => {
  let o = 99.5, h = 100.2, l = 99.0, c = 99.6;
  if (i === 1) h = 101.5;                              // Asian high
  if (i === 2) l = 95.0;                               // Asian low
  if (i === 12) { o = 98.5; h = 98.9; l = 94.4; c = 98.4; }   // 07:00 NY: wick di bawah Asian low, close balik = sweep
  return { t: T0 + i * 3600e3, open: o, high: h, low: l, close: c, volume: 1 };
});
const lvA = E.ictSessionLevels(asia);
ok(lvA && near(lvA.asiaLo, 94.4) === false && near(lvA.asiaLo, 95.0) && near(lvA.asiaHi, 101.5), 'range Asia (20:00–24:00 NY): low 95.00, high 101.50');
const swA = E.ictAllSweeps(E.ictContext(asia), 'ssl', 0).filter(s => s.src === 'asia');
ok(swA.length === 1 && near(swA[0].level, 95.0) && swA[0].idx === 12, 'sweep Asian Low terdeteksi (wick 94.40, close balik) di candle 12');
const asia2 = asia.map((k, i) => (i === 12 ? { ...k, low: 99.0, open: 99.5, close: 99.6, high: 100.2 } : k));    // tanpa sweep
const aheadS = E.ictLiquidityAhead(E.ictContext(asia2), 'short', 99.6);
ok(aheadS.some(x => x.label === 'Asian Low' && near(x.price, 95.0)), 'Asian Low yang belum disapu muncul sebagai target short (low hanging fruit)');
const aheadL = E.ictLiquidityAhead(E.ictContext(asia2), 'long', 99.6);
ok(aheadL.some(x => x.label === 'Asian High' && near(x.price, 101.5)), 'Asian High yang belum disapu muncul sebagai target long');

// =============================== E. INTEGRASI ictEvaluate ===============================
const htfBear = zig([140, 120, 130, 100], 20, 0.3);
const ev = E.ictEvaluate('intraday', sweepVariant({}), htfBear, htfBear, NOW);
const evS = ev.candidates.find(c => c.id === 'IFVG_SWEEP');
ok(!!evS && evS.side === 'short' && evS.valid === true && ev.decision === 'SHORT' && /IFVG|Sweep/.test(ev.best.title), 'ictEvaluate memuat IFVG_SWEEP valid dan memutuskan SHORT');
ok(ev.macro && ev.macro.active && ev.orderFlow && typeof ev.orderFlow.bos === 'number' && Array.isArray(ev.orderFlow.sweeps), 'hasil evaluasi membawa macro + order flow');
const htfBull = zig([100, 125, 110, 140], 20, 0.3);
const evU = E.ictEvaluate('intraday', unicornLong(), htfBull, htfBull, NOW);
const evUc = evU.candidates.find(c => c.id === 'UNICORN');
ok(!!evUc && evUc.valid === true && ['LONG', 'SHORT'].includes(evU.decision), 'ictEvaluate memuat Unicorn valid');
ok(ev.candidates.every(c => c.features && typeof c.features === 'object'), 'semua kandidat (model lama & baru) membawa fitur riset tanpa crash');
const of = E.ictOrderFlow(E.ictContext(sweepVariant({})));
ok(of.respected + of.violated + of.intact === E.ictContext(sweepVariant({})).fvgsAll.length && of.violated >= 1, 'order flow: FVG dihormati/dilanggar/utuh berjumlah total FVG, ada yang dilanggar (IFVG)');

// =============================== F. FUZZ model baru ===============================
let seed = 987654;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
let crash = 0, bad = 0, nU = 0, nI = 0, vU = 0, vI = 0, runs = 0;
const isValid = c => c.status !== 'invalid' && !c.check.blockingFail && c.check.grade !== 'C';
for (let r = 0; r < 300; r++) {
  const len = 80 + Math.floor(rnd() * 120), vol = 0.004 + rnd() * 0.04;
  const mk = L => { const out = []; let p = 100; for (let i = 0; i < L; i++) { const o = p, c = p * (1 + (rnd() - 0.5) * vol); out.push({ open: o, close: c, high: Math.max(o, c) * (1 + rnd() * vol / 3), low: Math.min(o, c) * (1 - rnd() * vol / 3), volume: 1 }); p = c; } return out; };
  try {
    ['long', 'short'].forEach(side => {
      runs++;
      const cs = mk(len), ltf = E.ictContext(cs);
      const u = E.ictSetupUnicorn(ltf, null, side, cfg, E.ictKillzone(NOW));
      const fs_ = E.ictIfvgCandidates(ltf, null, side, cfg, E.ictKillzone(NOW), E.ictMacro(NOW), PREFS());
      [u, ...fs_].filter(Boolean).forEach(c => {
        const p = c.plan;
        const finite = [p.entry, p.sl].every(Number.isFinite) && (p.tp === null || Number.isFinite(p.tp));
        const sideOk = side === 'long' ? (p.sl < p.entry && (p.tp === null || p.tp > p.entry)) : (p.sl > p.entry && (p.tp === null || p.tp < p.entry));
        if (!finite || !sideOk) bad++;
        if (c.id === 'UNICORN') { nU++; if (isValid(c)) vU++; } else { nI++; if (isValid(c)) vI++; }
      });
    });
  } catch (e) { crash++; if (crash <= 3) console.log('   crash:', e.stack.split('\n').slice(0, 3).join(' | ')); }
}
console.log(`  fuzz: ${runs} evaluasi | terdeteksi: ${nU} Unicorn, ${nI} IFVG | LOLOS validasi: ${vU} Unicorn, ${vI} IFVG | ${crash} crash, ${bad} plan tidak konsisten`);
ok(crash === 0, 'fuzz model baru: tidak ada crash pada random-walk');
ok(bad === 0, 'fuzz model baru: SL/TP selalu di sisi yang benar, angka finit');
ok(vU < runs * 0.02, `fuzz: Unicorn yang LOLOS validasi pada noise acak sangat langka (${vU}/${runs})`);
ok(vI < runs * 0.10, `fuzz: IFVG yang LOLOS validasi pada noise acak tidak membludak (${vI}/${runs})`);

if (failed > 0) { console.log('\n' + failed + ' uji gagal.'); process.exit(1); }
console.log('\nSemua uji model Unicorn & Inverse Blueprint lulus.');
