#!/usr/bin/env node
/**
 * Uji gerbang konsep (blok ICT-GATE): status siap/pantau/waitsee/tolak untuk tiga mode (ketat, longgar, mati), cara B untuk trigger bawaan,
 * model kelima, peringkat, cermin LONG/SHORT. Objek ev/kandidat dibuat manual supaya jawaban bisa dihitung.
 * Jalankan: node scripts/test-ict-gate.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const text = fs.readFileSync(process.env.ICT_SRC || path.resolve(__dirname, '..', 'index.html'), 'utf8');
const cut = k => { const a = text.indexOf(`/* ICT-${k}-START */`), b = text.indexOf(`/* ICT-${k}-END */`); if (a < 0 || b < 0) { console.error('Marker tidak ditemukan: ' + k); process.exit(1); } return text.slice(a, b); };
const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Map, Object, Array, String, JSON });
vm.runInContext(['ENGINE', 'FILTERS', 'BIAS', 'AREA', 'TRIGGER', 'GATE'].map(cut).join('\n') + ';this.G={GATE_CFG,ictGateEval,ictGateTrigger,gateOverlap,gateEntryTouched};', ctx);
const G = ctx.G;

let failed = 0;
const ok = (cond, msg, extra) => { if (cond) console.log('  LULUS  ' + msg); else { failed++; console.log('  GAGAL  ' + msg + (extra ? '  [' + extra + ']' : '')); } };

// ---------- objek buatan ----------
const C = (o, c, v) => ({ open: o, close: c, high: Math.max(o, c) + 0.5, low: Math.min(o, c) - 0.5, volume: v === undefined ? 10 : v });
const calm = n => Array.from({ length: n }, () => C(100, 110));                   // body 10
const withMomentum = () => calm(25).concat([C(100, 125, 10)]);                    // body 25 = 2,5x -> displacement naik (momentum)
const flatNoMom = () => calm(26);
const mkEv = o => Object.assign({
  bias: { ok: true, side: 'long', tf: { bias: '4h' }, rankDelta: 1 },
  area: { ok: true, areas: [{ low: 126, high: 134, kind: 'fvg', tf: '4h', rankDelta: 1 }], reasons: [] },
  trigger: { all: [] },
  ltf: { candles: flatNoMom(), last: 140 },
}, o || {});
const mkCand = o => Object.assign({ id: 'SWEEP_MSS', side: 'long', status: 'waiting', plan: { entry: 130, sl: 125, tp: 145, rr: 3 }, poi: { low: 128, high: 132, ce: 130 } }, o || {});
const readyTrig = (side, lo, hi) => ({ all: [{ status: 'ready', side: side || 'long', area: { low: lo === undefined ? 126 : lo, high: hi === undefined ? 134 : hi }, zone: { kind: 'fvg' }, missing: [] }] });
const E = (style, ev, cand, mode, px) => G.ictGateEval(style, ev, cand, mode, px);

console.log('\n[mode mati: perilaku lama]');
let r = E('intraday', mkEv({ bias: { ok: false } }), mkCand({ status: 'in_zone' }), 'mati', 140);
ok(r.pass && r.state === 'siap', 'mati: status engine in_zone -> siap, tanpa gerbang (walau tanpa bias)');
r = E('intraday', mkEv(), mkCand({ status: 'waiting' }), 'mati', 140);
ok(r.pass && r.state === 'pantau', 'mati: status engine waiting -> pantau');
ok(E('intraday', mkEv(), mkCand(), 'tidak-dikenal', 140).mode === 'ketat', 'mode tidak dikenal jatuh ke "ketat" (aman)');

console.log('\n[mode ketat: BIAS dan AREA wajib]');
r = E('intraday', mkEv({ bias: { ok: true, side: 'short', tf: { bias: '4h' } } }), mkCand(), 'ketat', 140);
ok(!r.pass && r.state === 'tolak' && /berlawanan dengan bias/.test(r.reasons[0]), 'arah setup berlawanan dengan bias: DITOLAK');
r = E('intraday', mkEv({ bias: { ok: false } }), mkCand(), 'ketat', 140);
ok(r.state === 'tolak' && /tidak ada bias/.test(r.gates.bias.reason), 'tanpa bias: DITOLAK');
r = E('intraday', mkEv(), mkCand({ poi: { low: 100, high: 110, ce: 105 } }), 'ketat', 140);
ok(r.state === 'tolak' && r.gates.bias.pass && !r.gates.area.pass && /tidak beririsan/.test(r.gates.area.reason), 'bias lolos tetapi zona setup tidak beririsan dengan AREA: DITOLAK');
r = E('intraday', mkEv({ area: { ok: false, areas: [], reasons: ['Tidak ada leg impuls'] } }), mkCand(), 'ketat', 140);
ok(r.state === 'tolak' && /belum ada AREA/.test(r.gates.area.reason), 'AREA belum ada: DITOLAK dengan alasan AREA');
r = E('intraday', mkEv(), mkCand({ poi: { low: 134, high: 140, ce: 137 } }), 'ketat', 150);
ok(r.gates.area.pass, 'zona setup menyentuh tepi AREA (134 = 134): dianggap beririsan');
ok(G.gateOverlap(1, 3, 3, 5) && !G.gateOverlap(1, 2, 3, 4), 'gateOverlap: tepi bersentuhan = irisan; terpisah = bukan');

console.log('\n[mode ketat: trigger — cara B]');
r = E('intraday', mkEv({ ltf: { candles: withMomentum(), last: 140 } }), mkCand({ id: 'SWEEP_MSS' }), 'ketat', 140);
ok(r.state === 'siap' && r.gates.trigger.kind === 'bawaan' && r.gates.trigger.pass, 'Intraday Sweep+MSS: trigger bawaan diakui + ada momentum di candle LTF terakhir -> SIAP ENTRY');
r = E('intraday', mkEv(), mkCand({ id: 'UNICORN' }), 'ketat', 140);
ok(r.state === 'pantau' && r.gates.trigger.kind === 'bawaan' && !r.gates.trigger.pass && /tidak ada momentum/.test(r.gates.trigger.reason), 'Intraday Unicorn tanpa momentum searah: trigger bawaan tidak cukup -> PANTAU (momentum wajib untuk semua)');
r = E('intraday', mkEv(), mkCand({ id: 'UNICORN' }), 'ketat', 130);
ok(r.state === 'waitsee' && r.entryTouched, 'trigger belum lengkap dan harga SUDAH di entry 130: WAIT AND SEE');
r = E('intraday', mkEv({ trigger: readyTrig('long') }), mkCand({ id: 'POI_RETEST' }), 'ketat', 140);
ok(r.state === 'siap' && r.gates.trigger.kind === 'h1', 'Retest POI tidak punya trigger bawaan: butuh trigger H1 lengkap yang beririsan -> SIAP ENTRY');
r = E('intraday', mkEv({ ltf: { candles: withMomentum(), last: 140 } }), mkCand({ id: 'POI_RETEST' }), 'ketat', 140);
ok(r.state === 'pantau' && r.gates.trigger.kind === 'h1', 'Retest POI TIDAK memakai momentum LTF sebagai pengganti trigger H1 -> PANTAU');
r = E('swing', mkEv({ ltf: { candles: withMomentum(), last: 140 } }), mkCand({ id: 'SWEEP_MSS' }), 'ketat', 140);
ok(r.state === 'pantau' && r.gates.trigger.kind === 'h1', 'Swing: trigger bawaan (4H) TIDAK diakui walau ada momentum -> butuh trigger H1');
r = E('swing', mkEv({ trigger: readyTrig('long') }), mkCand({ id: 'SWEEP_MSS' }), 'ketat', 140);
ok(r.state === 'siap', 'Swing dengan trigger H1 lengkap pada AREA yang beririsan: SIAP ENTRY');
r = E('swing', mkEv({ trigger: readyTrig('long', 200, 210) }), mkCand({ id: 'SWEEP_MSS' }), 'ketat', 140);
ok(r.state === 'pantau', 'trigger H1 lengkap tetapi pada AREA lain (tidak beririsan dengan zona setup): belum cukup -> PANTAU');
r = E('swing', mkEv({ trigger: readyTrig('short') }), mkCand({ id: 'SWEEP_MSS' }), 'ketat', 140);
ok(r.state === 'pantau', 'trigger H1 lengkap tetapi berlawanan arah: tidak dihitung');
r = E('intraday', mkEv({ trigger: { all: [{ status: 'pending', side: 'long', area: { low: 126, high: 134 }, zone: null, missing: ['momentum (displacement atau volume spike)'] }] } }), mkCand({ id: 'POI_RETEST' }), 'ketat', 140);
ok(r.state === 'pantau' && /kurang momentum/.test(r.gates.trigger.reason), 'trigger H1 pending: alasan menyebut apa yang kurang');
r = E('intraday', mkEv({ trigger: { all: [] } }), mkCand({ id: 'AREA_TRIGGER', poi: { low: 136, high: 140, ce: 138 } }), 'ketat', 150);
ok(r.state === 'siap' && r.gates.trigger.kind === 'model' && r.gates.area.pass, 'model kelima (AREA_TRIGGER): trigger dan area melekat pada modelnya -> SIAP ENTRY bila bias searah');
r = E('intraday', mkEv({ bias: { ok: true, side: 'short', tf: { bias: '4h' } } }), mkCand({ id: 'AREA_TRIGGER' }), 'ketat', 150);
ok(r.state === 'tolak', 'model kelima pun ditolak bila arahnya berlawanan dengan bias');

console.log('\n[mode longgar: hanya BIAS wajib]');
r = E('intraday', mkEv({ bias: { ok: true, side: 'short', tf: { bias: '4h' } } }), mkCand(), 'longgar', 140);
ok(r.state === 'tolak', 'longgar: bias berlawanan tetap DITOLAK');
r = E('intraday', mkEv(), mkCand({ poi: { low: 100, high: 110, ce: 105 }, status: 'in_zone' }), 'longgar', 140);
ok(r.pass && r.state === 'siap' && !r.gates.area.pass, 'longgar: AREA tidak beririsan tidak menolak; status mengikuti engine (in_zone -> siap)');
r = E('swing', mkEv(), mkCand({ status: 'waiting' }), 'longgar', 130);
ok(r.pass && r.state === 'pantau', 'longgar: tidak ada WAIT AND SEE; status mengikuti engine (waiting -> pantau) walau entry tersentuh');

console.log('\n[peringkat]');
r = E('intraday', mkEv({ ltf: { candles: withMomentum(), last: 140 } }), mkCand({ id: 'SWEEP_MSS' }), 'ketat', 140);
ok(r.rank === 1 + (1 + 1) + 1, 'peringkat = selisih bias (1) + AREA (1 + peringkat zona 1) + trigger (1) = 4', r.rank);
r = E('intraday', mkEv(), mkCand({ id: 'UNICORN' }), 'ketat', 140);
ok(r.rank === 1 + 2, 'trigger tidak lolos: tanpa tambahan trigger = 3', r.rank);

console.log('\n[entry tersentuh dan harga]');
ok(G.gateEntryTouched('long', 130, 130) && G.gateEntryTouched('long', 130, 129) && !G.gateEntryTouched('long', 130, 131), 'LONG: tersentuh bila harga <= entry');
ok(G.gateEntryTouched('short', 130, 130) && G.gateEntryTouched('short', 130, 131) && !G.gateEntryTouched('short', 130, 129), 'SHORT: tersentuh bila harga >= entry');
ok(!G.gateEntryTouched('long', 130, 0) && !G.gateEntryTouched('long', 130, NaN), 'harga tidak valid: tidak dianggap tersentuh');
r = E('intraday', mkEv({ ltf: { candles: flatNoMom(), last: 125 } }), mkCand({ id: 'UNICORN' }), 'ketat');
ok(r.entryTouched && r.state === 'waitsee', 'tanpa harga eksplisit: memakai harga terakhir LTF (125 <= entry 130) -> WAIT AND SEE');

console.log('\n[cermin LONG <-> SHORT]');
const mirrorEv = (ev, pv) => ({ bias: Object.assign({}, ev.bias, { side: ev.bias.side === 'long' ? 'short' : 'long' }), area: Object.assign({}, ev.area, { areas: ev.area.areas.map(z => Object.assign({}, z, { low: pv - z.high, high: pv - z.low })) }),
  trigger: { all: ev.trigger.all.map(x => Object.assign({}, x, { side: x.side === 'long' ? 'short' : 'long', area: { low: pv - x.area.high, high: pv - x.area.low } })) },
  ltf: { candles: ev.ltf.candles.map(c => ({ open: pv - c.open, close: pv - c.close, high: pv - c.low, low: pv - c.high, volume: c.volume })), last: pv - ev.ltf.last } });
const mirrorCand = (c, pv) => Object.assign({}, c, { side: c.side === 'long' ? 'short' : 'long', plan: { entry: pv - c.plan.entry, sl: pv - c.plan.sl, tp: pv - c.plan.tp, rr: c.plan.rr }, poi: { low: pv - c.poi.high, high: pv - c.poi.low, ce: pv - c.poi.ce } });
let mdiff = 0, mcases = 0;
for (const style of ['intraday', 'swing']) for (const mode of ['ketat', 'longgar', 'mati']) for (const id of ['SWEEP_MSS', 'POI_RETEST', 'UNICORN', 'AREA_TRIGGER']) for (const [ev, px] of [[mkEv({ ltf: { candles: withMomentum(), last: 140 } }), 140], [mkEv({ trigger: readyTrig('long') }), 140], [mkEv(), 130], [mkEv({ bias: { ok: false } }), 140]]) for (const status of ['in_zone', 'waiting']) {
  const c = mkCand({ id, status }), a = E(style, ev, c, mode, px), b = E(style, mirrorEv(ev, 300), mirrorCand(c, 300), mode, 300 - px);
  mcases++;
  if (a.state !== b.state || a.pass !== b.pass || a.rank !== b.rank || a.entryTouched !== b.entryTouched || a.gates.trigger.pass !== b.gates.trigger.pass || a.gates.area.pass !== b.gates.area.pass) mdiff++;
}
ok(mdiff === 0, `cermin: ${mcases} kombinasi (gaya × mode × model × skenario × status) memberi status/peringkat/gerbang yang sama pada LONG dan SHORT`, 'beda ' + mdiff);

console.log('\n[kebersihan]');
const gate = cut('GATE'), other = ['ENGINE', 'FILTERS', 'BIAS', 'AREA', 'TRIGGER'].map(cut).join('\n');
ok(!/\b(document|localStorage|fetch|window|tickerData)\b/.test(gate), 'blok GATE murni: tidak menyentuh DOM/localStorage/fetch/global app');
ok(!/\bictGate\w*|GATE_CFG|gateOverlap|gateEntryTouched/.test(other), 'engine, filter, BIAS, AREA, dan TRIGGER tidak memanggil GATE (arah alur satu jalur)');
ok(!/\b(rsi|macd|adx|atr|bollinger|vwap|stoch|fibonacci)/i.test(gate.replace(/\/\/[^\n]*/g, '')), 'kode GATE tidak memakai indikator terlarang (komentar dikecualikan)');
const ev0 = mkEv({ trigger: readyTrig('long') }), c0 = mkCand(), snap = JSON.stringify([ev0, c0]); E('swing', ev0, c0, 'ketat', 140); ok(JSON.stringify([ev0, c0]) === snap, 'input ev dan kandidat tidak diubah (tanpa efek samping)');

if (failed) { console.log('\n' + failed + ' uji GATE GAGAL'); process.exit(1); }
console.log('\nSemua uji GATE lulus.');
