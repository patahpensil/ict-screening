#!/usr/bin/env node
/**
 * BACKTEST KONSEP PENUH BIAS → AREA → TRIGGER (alat riset, bukan kode aplikasi; butuh data candle; tidak dijalankan di CI).
 *
 * Dua pertanyaan:
 *  (1) MODEL KELIMA (AREA_TRIGGER): berapa sering setup terbentuk, dan apakah hasilnya (win rate, rata-rata R setelah biaya)
 *      lebih baik daripada entri ACAK dengan geometri SL/TP yang sama?
 *  (2) GERBANG untuk model yang sudah ada (Sweep+MSS, Retest POI, Unicorn, IFVG): apakah sinyal yang lolos BIAS / BIAS+AREA /
 *      BIAS+AREA+TRIGGER lebih baik daripada sinyal tanpa gerbang? (jawaban menentukan apakah gerbang boleh dilonggarkan)
 *
 * Aturan metodologi: walk-forward di tiap penutupan candle H1 — HANYA candle yang sudah tutup (HTF dipilih lewat waktu tutup, tanpa
 * look-ahead); limit di entry, candle fill konservatif (di candle fill hanya SL), SL dan TP satu candle = SL; biaya 0,09% dari harga;
 * pembagian latih/uji menurut WAKTU (60/40). Keputusan hanya dari data uji yang konsisten dengan latih; sampel kecil = tidak disimpulkan.
 *
 * Pakai:
 *   node scripts/backtest-concept.js --mode=concept|models|both --pairs=50 --days=548 --out=./out-concept [--style=both|intraday|swing]
 *                                    [--src=path/index.html] [--offline] [--prefetch (hanya unduh data)] [--symbols=BTCUSDT,ETHUSDT] [--random=3]
 * Hanya data publik Binance Futures; tanpa API key. --offline memakai cache di --out/data.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const S = require('./study-fib-ote.js'); // wilson, meanCI

const TFMS = { '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
const CFG = {
  fee: 0.0009, wait: 12, hold: { intraday: 48, swing: 168 }, modelHold: { intraday: 48, swing: 42 }, // hold konsep dalam candle H1; model lama dalam candle LTF masing-masing
  trainFrac: 0.6, warm: 250, randomPerSignal: 3, rawBars: 400, bars: 200, dedupBars: 12,
  stable: new Set(['USDC', 'FDUSD', 'TUSD', 'BUSD', 'USDP', 'USDT', 'DAI', 'EUR', 'AEUR', 'USDE', 'XUSD', 'BFUSD']),
};

// ---------- engine ----------
function loadEngine(src) {
  const text = fs.readFileSync(src, 'utf8');
  const cut = k => { const a = text.indexOf(`/* ICT-${k}-START */`), b = text.indexOf(`/* ICT-${k}-END */`); if (a < 0 || b < 0) throw new Error('Marker ' + k + ' tidak ditemukan'); return text.slice(a, b); };
  const ctx = vm.createContext({ Intl, Date, Math, Number, parseInt, parseFloat, isFinite, Set, Map, Object, Array, String, JSON });
  vm.runInContext(['ENGINE', 'FILTERS', 'BIAS', 'AREA', 'TRIGGER'].map(cut).join('\n') + ';this.E={ICT_CFG,ICT_DEFAULT_PREFS,ictContext,ictEvaluate,ictKillzone,flMomentum,BIAS_CFG,AREA_CFG,TRIG_CFG,ictBiasLayer,ictBiasFromCandles,ictAreaLayer,ictTriggerLayer,ictTriggerCandidate};', ctx);
  return ctx.E;
}

// ---------- utilitas murni (diuji test-backtest-concept.js) ----------
// Jumlah candle yang SUDAH TUTUP pada waktu ct (arr terurut menurut waktu; setiap candle punya ct = waktu tutup).
function closedCount(arr, ct) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].ct <= ct) lo = m + 1; else hi = m; } return lo; }
// Agregasi H1 -> TF lebih besar (hanya untuk uji; data nyata diunduh per TF). Candle terakhir yang belum penuh dibuang.
function aggregate(h1, ms) {
  const out = []; let cur = null;
  for (const c of h1) {
    const start = Math.floor(c.t / ms) * ms;
    if (!cur || cur.t !== start) { if (cur && cur.n * 36e5 === ms) out.push(cur); cur = { t: start, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume, n: 1 }; }
    else { cur.high = Math.max(cur.high, c.high); cur.low = Math.min(cur.low, c.low); cur.close = c.close; cur.volume += c.volume; cur.n++; }
  }
  if (cur && cur.n * 36e5 === ms) out.push(cur);
  return out.map(c => ({ t: c.t, ct: c.t + ms - 1, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume }));
}
function overlaps(aLo, aHi, bLo, bHi) { return aLo <= bHi && aHi >= bLo; }
function feeR(entry, risk, fee) { return fee * Math.abs(entry) / risk; }
/**
 * Simulasi satu rencana pada candle `candles` mulai indeks `from` (candle pertama SETELAH sinyal): limit di plan.entry menunggu `wait` candle
 * (dibatalkan bila SL tersentuh tanpa menyentuh entry), lalu SL/TP1 sampai `hold` candle (timeout = mark-to-market di close).
 * Candle fill: hanya SL yang dihitung. Mengembalikan null bila data habis sebelum selesai.
 */
function simulate(plan, side, candles, from, wait, hold, fee) {
  const risk = Math.abs(plan.entry - plan.sl);
  if (!(risk > 0) || plan.tp === null || plan.tp === undefined) return null;
  const long = side === 'long', fr = feeR(plan.entry, risk, fee);
  let filledAt = -1;
  for (let j = from; j < Math.min(candles.length, from + wait); j++) {
    const c = candles[j], touch = long ? c.low <= plan.entry : c.high >= plan.entry, slHit = long ? c.low <= plan.sl : c.high >= plan.sl;
    if (slHit && !touch) return { filled: false };
    if (touch) { filledAt = j; break; }
  }
  if (filledAt < 0) return { filled: false };
  for (let j = filledAt; j < Math.min(candles.length, filledAt + hold); j++) {
    const c = candles[j], fill = j === filledAt;
    const slHit = long ? c.low <= plan.sl : c.high >= plan.sl;
    const tpHit = !fill && (long ? c.high >= plan.tp : c.low <= plan.tp);
    if (slHit) return { filled: true, R: -1 - fr, out: 'SL', bars: j - filledAt };
    if (tpHit) return { filled: true, R: plan.rr - fr, out: 'TP', bars: j - filledAt };
  }
  const endIdx = Math.min(candles.length, filledAt + hold) - 1;
  if (endIdx - filledAt + 1 < hold) return null;
  const mtm = (long ? candles[endIdx].close - plan.entry : plan.entry - candles[endIdx].close) / risk;
  return { filled: true, R: mtm - fr, out: 'TIMEOUT', bars: hold };
}
// Entri ACAK pembanding: market di close candle `at`, SL berjarak sama (persen harga) dan RR sama dengan sinyal. Arah sama dengan sinyal.
function simulateRandom(side, candles, at, riskPct, rr, hold, fee) {
  const entry = candles[at].close, risk = entry * riskPct, long = side === 'long';
  const plan = { entry, sl: long ? entry - risk : entry + risk, tp: long ? entry + rr * risk : entry - rr * risk, rr };
  const fr = feeR(entry, risk, fee);
  for (let j = at + 1; j < Math.min(candles.length, at + 1 + hold); j++) {
    const c = candles[j];
    if (long ? c.low <= plan.sl : c.high >= plan.sl) return { filled: true, R: -1 - fr, out: 'SL' };
    if (long ? c.high >= plan.tp : c.low <= plan.tp) return { filled: true, R: rr - fr, out: 'TP' };
  }
  if (at + hold >= candles.length) return null;
  const last = candles[at + hold].close, mtm = (long ? last - entry : entry - last) / risk;
  return { filled: true, R: mtm - fr, out: 'TIMEOUT' };
}
function mkRng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }
function stats(trades) {
  const f = trades.filter(t => t.filled);
  const wins = f.filter(t => t.out === 'TP').length, sl = f.filter(t => t.out === 'SL').length, to = f.filter(t => t.out === 'TIMEOUT').length;
  const Rs = f.map(t => t.R), gw = Rs.filter(x => x > 0).reduce((a, b) => a + b, 0), gl = -Rs.filter(x => x < 0).reduce((a, b) => a + b, 0);
  return { signals: trades.length, n: f.length, tp: wins, sl, to, win: S.wilson(wins, f.length), r: S.meanCI(Rs, 1000, 4242), pf: gl > 0 ? gw / gl : null, avgRR: f.length ? f.reduce((a, t) => a + (t.rr || 0), 0) / f.length : null };
}

// ---------- data ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJson(url, tries = 6) {
  let delay = 1500;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status === 418) { await sleep(delay * 4); delay *= 2; continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return await res.json();
    } catch (e) { if (i === tries - 1) throw e; await sleep(delay); delay *= 2; }
  }
  throw new Error('gagal: ' + url);
}
async function loadKlines(sym, tf, startMs, dir, offline) {
  const file = path.join(dir, `${sym}_${tf}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  if (offline) return null;
  const rows = []; let from = startMs;
  for (;;) {
    const part = await getJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${sym}&interval=${tf}&startTime=${from}&limit=1500`);
    if (!Array.isArray(part) || !part.length) break;
    rows.push(...part);
    if (part.length < 1500) break;
    from = part[part.length - 1][0] + 1;
    await sleep(220);
  }
  const now = Date.now();
  const candles = rows.filter(k => !(k[6] > now)).map(k => ({ t: k[0], ct: k[6], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] }));
  fs.writeFileSync(file, JSON.stringify(candles));
  return candles;
}
async function universe(n) {
  const info = await getJson('https://fapi.binance.com/fapi/v1/exchangeInfo');
  const ok = new Map(info.symbols.filter(s => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL' && s.status === 'TRADING' && /^[A-Z0-9]+$/.test(s.symbol) && !CFG.stable.has(s.baseAsset)).map(s => [s.symbol, s]));
  const tk = await getJson('https://fapi.binance.com/fapi/v1/ticker/24hr');
  return tk.filter(t => ok.has(t.symbol)).sort((a, b) => b.quoteVolume - a.quoteVolume).slice(0, n).map(t => t.symbol);
}

// ---------- walk-forward satu pair ----------
// data = { '1h': [...], '4h': [...], '1d': [...], '1w': [...] }; setiap candle {t, ct, open, high, low, close, volume}.
// Mengembalikan { concept: [sinyal model kelima], models: [sinyal model lama + penanda gerbang] }.
function walkPair(sym, data, E, opts) {
  const o = Object.assign({ styles: ['intraday', 'swing'], doConcept: true, doModels: true, from: CFG.warm, to: null }, opts || {});
  const h1 = data['1h'], tfs = ['4h', '1d', '1w'], ptr = { '4h': 0, '1d': 0, '1w': 0 }, cache = {};
  const out = { concept: [], models: [] }, seenConcept = new Set(), lastModel = {};
  const end = o.to === null ? h1.length - 1 : Math.min(o.to, h1.length - 1);
  for (let i = o.from; i < end; i++) {
    const ct = h1[i].ct;
    const raw = { '1h': h1.slice(Math.max(0, i + 1 - CFG.rawBars), i + 1) };
    const ctxMap = {};
    ctxMap['1h'] = E.ictContext(raw['1h'].length > CFG.bars ? raw['1h'].slice(-CFG.bars) : raw['1h']);
    for (const tf of tfs) {
      const arr = data[tf]; if (!arr) continue;
      while (ptr[tf] < arr.length && arr[ptr[tf]].ct <= ct) ptr[tf]++;   // candle HTF yang SUDAH TUTUP pada ct (tanpa look-ahead)
      const e = ptr[tf]; if (e < 20) continue;
      raw[tf] = arr.slice(Math.max(0, e - CFG.rawBars), e);
      const key = tf + '|' + e;
      if (!cache[tf] || cache[tf].key !== key) cache[tf] = { key, ctx: E.ictContext(raw[tf].length > CFG.bars ? raw[tf].slice(-CFG.bars) : raw[tf]) };
      ctxMap[tf] = cache[tf].ctx;
    }
    const layers = {};
    for (const style of o.styles) {
      const rawMap = {}; Object.keys(raw).forEach(k => { rawMap[k] = raw[k]; });
      const b = E.ictBiasFromCandles(style, rawMap, { bars: CFG.bars, ctxMap });
      const a = E.ictAreaLayer(style, b, ctxMap), t = E.ictTriggerLayer(style, b, a, ctxMap), tm = E.ictTriggerCandidate(style, b, a, t, ctxMap);
      layers[style] = { bias: b, area: a, trig: t, tm };
      // ----- model kelima -----
      if (o.doConcept && tm.cand && t.ok && !t.best.entryTouched) {
        const c = tm.cand;
        // identitas sinyal: gaya, arah, waktu candle penembus (indeks CHoCH relatif jendela engine -> indeks absolut), CE zona trigger
        const winStart = raw['1h'].length > CFG.bars ? raw['1h'].length - CFG.bars : 0, chochAbsIdx = i - (raw['1h'].length - 1 - (winStart + t.best.choch.idx));
        const id = [style, c.side, h1[chochAbsIdx] ? h1[chochAbsIdx].t : 'x', c.poi.ce.toFixed(6)].join('|');
        if (!seenConcept.has(id)) {
          seenConcept.add(id);
          const res = simulate(c.plan, c.side, h1, i + 1, CFG.wait, CFG.hold[style], CFG.fee);
          if (res) {
            const kz = E.ictKillzone(new Date(ct));
            out.concept.push(Object.assign({ symbol: sym, style, ct, i, side: c.side, rr: c.plan.rr, riskPct: Math.abs(c.plan.entry - c.plan.sl) / c.plan.entry, f: {
              legTier: t.best.area.legTier, snr: !!t.best.area.snr, counter: !!b.counterContext, phase: b.phase.value, rankDelta: (b.rankDelta || 0) + (a.area ? a.area.rankDelta : 0),
              zone: t.best.zone.kind, choch: t.best.choch.type, momentum: t.best.momentum.kind, kz: kz.active ? kz.name : 'Di luar', areaTf: t.best.area.tf, depth: a.depth, strict: !!a.strict } }, res));
          }
        }
      }
    }
    // ----- model lama dengan penanda gerbang -----
    if (o.doModels) {
      for (const style of o.styles) {
        const cfg = E.ICT_CFG.styles[style];
        let ltfSlice;
        if (cfg.ltf === '1h') ltfSlice = raw['1h'].slice(-CFG.bars);
        else { const arr = data[cfg.ltf]; const e = ptr[cfg.ltf]; if (e < 30 || arr[e - 1].ct !== ct) continue; ltfSlice = arr.slice(Math.max(0, e - CFG.bars), e); }
        const htfRaw = raw[cfg.htf], htf2Raw = raw[cfg.htf2];
        if (!htfRaw || htfRaw.length < 30) continue;
        const ev = E.ictEvaluate(style, ltfSlice, htfRaw.slice(-CFG.bars), htf2Raw && htf2Raw.length >= 20 ? htf2Raw.slice(-CFG.bars) : null, new Date(ct));
        if (ev.decision === 'SKIP' || !ev.best) continue;
        const c = ev.best, key = style + '|' + c.id + '|' + c.side;
        const ltfIdx = cfg.ltf === '1h' ? i : ptr[cfg.ltf] - 1;
        if (lastModel[key] !== undefined && ltfIdx - lastModel[key] < CFG.dedupBars) continue;
        lastModel[key] = ltfIdx;
        const L = layers[style], poi = c.poi || { low: c.plan.entry, high: c.plan.entry };
        const biasPass = !!(L.bias.ok && L.bias.side === c.side);
        const areaPass = biasPass && L.area.areas.some(z => overlaps(poi.low, poi.high, z.low, z.high));
        const trigPass = !!(L.trig.ok && L.trig.best && L.trig.best.side === c.side);
        const builtin = style === 'intraday' && c.id !== 'POI_RETEST';
        const dir = c.side === 'long' ? 'up' : 'down', h1c = ctxMap['1h'].candles;
        let momOk = false; for (let k = h1c.length - 8; k < h1c.length; k++) { if (k >= 0 && E.flMomentum(h1c, k, dir).ok) { momOk = true; break; } }
        const trigGate = builtin ? momOk : (trigPass && momOk);
        const arr = cfg.ltf === '1h' ? h1 : data[cfg.ltf], from = cfg.ltf === '1h' ? i + 1 : ptr[cfg.ltf];
        const res = simulate(c.plan, c.side, arr, from, CFG.wait, CFG.modelHold[style], CFG.fee);
        if (!res) continue;
        out.models.push(Object.assign({ symbol: sym, style, ct, id: c.id, side: c.side, grade: c.grade, rr: c.plan.rr, status: c.status, gate: { bias: biasPass, area: areaPass, trig: trigGate, builtin, momOk, trigPass } }, res));
      }
    }
  }
  return out;
}

// ---------- laporan ----------
const f2 = x => x === null || x === undefined ? '-' : x.toFixed(2), pc = x => x === null || x === undefined ? '-' : (x * 100).toFixed(0) + '%';
const row = (label, st) => `| ${label} | ${st.n} | ${st.tp}/${st.sl}/${st.to} | ${pc(st.win.p)} (${pc(st.win.lo)}–${pc(st.win.hi)}) | ${f2(st.r.mean)} (${f2(st.r.lo)}–${f2(st.r.hi)}) | ${f2(st.pf)} | ${f2(st.avgRR)} |`;
const HEAD = ['| kelompok | terisi | TP/SL/TO | win rate (selang 95%) | rata-rata R net (selang 95%) | PF | RR rata-rata |', '|---|---|---|---|---|---|---|'];
function phaseOf(ct, cut) { return ct <= cut ? 'latih' : 'uji'; }
function reportConcept(sigs, controls, cut, meta) {
  const L = [`# Backtest konsep penuh — model kelima AREA → Trigger H1`, '', `Data: ${meta.pairs} pair, ${meta.days} hari. Dibuat ${new Date().toISOString()}. Batas latih/uji: ${new Date(cut).toISOString().slice(0, 10)}.`, ''];
  for (const style of ['intraday', 'swing', 'semua']) {
    const sg = style === 'semua' ? sigs : sigs.filter(s => s.style === style), ct = style === 'semua' ? controls : controls.filter(s => s.style === style);
    if (!sg.length) continue;
    L.push(`## ${style}`, '', ...HEAD);
    for (const per of ['latih', 'uji', 'semua']) {
      const a = per === 'semua' ? sg : sg.filter(s => phaseOf(s.ct, cut) === per), b = per === 'semua' ? ct : ct.filter(s => phaseOf(s.ct, cut) === per);
      L.push(row(`KONSEP ${per}`, stats(a)), row(`ACAK (geometri sama) ${per}`, stats(b)));
    }
    L.push('');
    const slice = (name, fn) => { const keys = [...new Set(sg.map(fn))]; L.push(`### ${style} — menurut ${name} (semua periode)`, '', ...HEAD); keys.sort().forEach(k => L.push(row(`${name}=${k}`, stats(sg.filter(s => fn(s) === k))))); L.push(''); };
    slice('tier leg', s => s.f.legTier); slice('SNR', s => s.f.snr); slice('melawan konteks', s => s.f.counter); slice('fase H1', s => s.f.phase || 'tidak diketahui');
    slice('jenis zona', s => s.f.zone); slice('penembusan', s => s.f.choch); slice('momentum', s => s.f.momentum); slice('killzone', s => s.f.kz); slice('arah', s => s.side);
  }
  return L.join('\n');
}
function reportModels(sigs, cut, meta) {
  const L = [`# Backtest konsep penuh — model lama dengan gerbang BIAS / AREA / TRIGGER`, '', `Data: ${meta.pairs} pair, ${meta.days} hari. Dibuat ${new Date().toISOString()}. Batas latih/uji: ${new Date(cut).toISOString().slice(0, 10)}.`, ''];
  const arms = [['tanpa gerbang', () => true], ['BIAS', s => s.gate.bias], ['BIAS + AREA', s => s.gate.bias && s.gate.area], ['BIAS + AREA + TRIGGER (cara B)', s => s.gate.bias && s.gate.area && s.gate.trig]];
  for (const style of ['intraday', 'swing', 'semua']) {
    const sg = style === 'semua' ? sigs : sigs.filter(s => s.style === style);
    if (!sg.length) continue;
    L.push(`## ${style}`, '');
    for (const per of ['latih', 'uji']) {
      const p = sg.filter(s => phaseOf(s.ct, cut) === per);
      L.push(`### ${style} — ${per}`, '', ...HEAD);
      arms.forEach(([n, fn]) => L.push(row(n, stats(p.filter(fn)))));
      L.push('');
    }
    L.push(`### ${style} — per model (semua periode)`, '', ...HEAD);
    [...new Set(sg.map(s => s.id))].sort().forEach(id => arms.forEach(([n, fn]) => { const x = sg.filter(s => s.id === id && fn(s)); if (x.length) L.push(row(`${id} · ${n}`, stats(x))); }));
    L.push('');
  }
  return L.join('\n');
}

async function main() {
  const arg = (k, d) => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
  const mode = arg('mode', 'both'), pairsN = +arg('pairs', 50), days = +arg('days', 548), outDir = path.resolve(arg('out', './out-concept'));
  const src = arg('src', path.resolve(__dirname, '..', 'index.html')), offline = process.argv.includes('--offline'), styleArg = arg('style', 'both');
  const randomK = +arg('random', CFG.randomPerSignal), symbolsArg = arg('symbols', ''), prefetch = process.argv.includes('--prefetch');
  const styles = styleArg === 'both' ? ['intraday', 'swing'] : [styleArg];
  fs.mkdirSync(path.join(outDir, 'data'), { recursive: true });
  const E = loadEngine(src);
  const uf = path.join(outDir, 'universe.json');
  let syms;
  if (symbolsArg) syms = symbolsArg.split(',');
  else if (fs.existsSync(uf) && (offline || process.argv.includes('--reuse-universe'))) syms = JSON.parse(fs.readFileSync(uf, 'utf8')).slice(0, pairsN);
  else { syms = await universe(pairsN); fs.writeFileSync(uf, JSON.stringify(syms)); }
  console.log(`mode=${mode} gaya=${styles.join(',')} pair=${syms.length} hari=${days}`);
  const startMs = Date.now() - (days + 12) * 864e5;
  const need = { '1h': startMs, '4h': startMs - 60 * 864e5, '1d': startMs - 260 * 864e5, '1w': Date.now() - 1500 * 864e5 };
  const all = { concept: [], models: [] }, store = {};
  let done = 0, t0 = Date.now();
  for (const sym of syms) {
    const data = {};
    try { for (const tf of ['1h', '4h', '1d', '1w']) { data[tf] = await loadKlines(sym, tf, need[tf], path.join(outDir, 'data'), offline); } } catch (e) { console.log('lewati', sym, e.message); continue; }
    if (!data['1h'] || data['1h'].length < CFG.warm + 200) { console.log('lewati', sym, '(data H1 kurang)'); continue; }
    store[sym] = data['1h'];
    if (prefetch) { if (++done % 10 === 0) console.log(`  unduh ${done}/${syms.length}`); continue; }
    const r = walkPair(sym, data, E, { styles, doConcept: mode !== 'models', doModels: mode !== 'concept' });
    all.concept.push(...r.concept); all.models.push(...r.models);
    if (++done % 5 === 0) console.log(`  ${done}/${syms.length} pair (${Math.round((Date.now() - t0) / 1000)} dtk) — konsep ${all.concept.length}, model ${all.models.length}`);
  }
  if (prefetch) { console.log('unduh selesai:', Object.keys(store).length, 'pair'); return; }
  // batas latih/uji menurut waktu (global)
  const firsts = Object.values(store).map(a => a[CFG.warm].ct), lasts = Object.values(store).map(a => a[a.length - 1].ct);
  const cut = Math.min(...firsts) + CFG.trainFrac * (Math.max(...lasts) - Math.min(...firsts));
  const meta = { pairs: Object.keys(store).length, days };
  if (mode !== 'models') {
    // kontrol acak: tiap sinyal konsep dipasangkan dengan K entri acak di pair & periode yang sama (geometri SL/TP identik)
    const rnd = mkRng(20261004), controls = [];
    for (const s of all.concept) {
      const h1 = store[s.symbol], per = phaseOf(s.ct, cut);
      for (let k = 0; k < randomK; k++) {
        let at = -1;
        for (let tries = 0; tries < 30; tries++) { const j = CFG.warm + Math.floor(rnd() * (h1.length - CFG.warm - CFG.hold[s.style] - 2)); if (phaseOf(h1[j].ct, cut) === per) { at = j; break; } }
        if (at < 0) continue;
        const res = simulateRandom(s.side, h1, at, s.riskPct, s.rr, CFG.hold[s.style], CFG.fee);
        if (res) controls.push(Object.assign({ symbol: s.symbol, style: s.style, ct: h1[at].ct, side: s.side, rr: s.rr }, res));
      }
    }
    const md = reportConcept(all.concept, controls, cut, meta);
    fs.writeFileSync(path.join(outDir, 'report-concept.md'), md);
    fs.writeFileSync(path.join(outDir, 'signals-concept.json'), JSON.stringify(all.concept));
    console.log(md);
  }
  if (mode !== 'concept') {
    const md = reportModels(all.models, cut, meta);
    fs.writeFileSync(path.join(outDir, 'report-models.md'), md);
    fs.writeFileSync(path.join(outDir, 'signals-models.json'), JSON.stringify(all.models));
    console.log(md);
  }
}

module.exports = { CFG, TFMS, loadEngine, closedCount, aggregate, overlaps, feeR, simulate, simulateRandom, stats, walkPair, mkRng, phaseOf, reportConcept, reportModels };
if (require.main === module) main().catch(e => { console.error('ERROR:', e); process.exit(1); });
