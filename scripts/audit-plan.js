// Ekspresi audit konsistensi rumus untuk semua hasil scan (dievaluasi DI DALAM halaman oleh smoke-browser.js dan e2e-binance.js).
// Mengembalikan daftar pelanggaran (kosong = konsisten). Bukan kode aplikasi.
module.exports = `(()=>{
  const bad = [], near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  for(const h of lastScanResults.hits){
    const b = h.ev.best, p = b.plan, long = b.side === 'long', dir = long ? 1 : -1, tag = h.symbol + '/' + h.style + '/' + b.id;
    const risk = Math.abs(p.entry - p.sl), lv = [p.tp, p.tp2, p.tp3].filter(v => v !== null && v !== undefined);
    if(!(p.entry > 0 && p.sl > 0 && isFinite(p.entry) && isFinite(p.sl))) bad.push(tag + ': harga entry/SL tidak valid');
    if(!(risk > 0)) bad.push(tag + ': risiko <= 0');
    if(long ? !(p.sl < p.entry) : !(p.sl > p.entry)) bad.push(tag + ': SL di sisi yang salah');
    if(!lv.length) bad.push(tag + ': tanpa TP');
    let prev = p.entry; lv.forEach((v, i) => { if(!((v - prev) * dir > 0)) bad.push(tag + ': TP' + (i + 1) + ' tidak menjauh dari ' + (i ? 'TP sebelumnya' : 'entry')); prev = v; });
    if(lv.length && !near(p.rr, Math.abs(p.tp - p.entry) / risk)) bad.push(tag + ': rr (' + p.rr + ') != |TP1-entry|/risiko');
    if(p.risk !== undefined && !near(p.risk, risk)) bad.push(tag + ': field risk != |entry-SL|');
    if(!(p.rr >= h.ev.cfg.minRR - 1e-9)) bad.push(tag + ': rr < minimum gaya');
    if(b.check.passes > b.check.total) bad.push(tag + ': syarat lulus > total');
    if(!['siap', 'pantau', 'waitsee'].includes(h.gate.state)) bad.push(tag + ': status gerbang tidak sah ' + h.gate.state);
    if(h.gate.mode === 'longgar' && (h.gate.state === 'siap') !== (b.status === 'in_zone')) bad.push(tag + ': status longgar != status engine');
    const row = tickerData.find(d => d.symbol === h.symbol);
    if(!row || ictPlanBeyondLive(p, b.side, parseFloat(row.lastPrice))) bad.push(tag + ': harga live sudah melewati SL/TP1');
    if(lv.length && !near(trkR({ side: b.side, entry: p.entry, sl: p.sl }, p.tp), p.rr)) bad.push(tag + ': R pelacak di TP1 != rr');
  }
  const syms = lastScanResults.hits.map(h => h.symbol);
  if(new Set(syms).size !== syms.length) bad.push('pair muncul dobel di hasil');
  if(syms.length > 20) bad.push('hasil > 20 pair');
  return bad;
})()`;
