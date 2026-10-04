// Uji end-to-end aplikasi ASLI terhadap Binance Futures sungguhan (bukan mock): harga, WebSocket, scan, Decision dengan stream live,
// semua tampilan. Butuh Chrome dan akses ke fapi.binance.com. Kalau ISP memblokir Binance, buat terowongan lalu beri proxy, mis.:
//   ssh -N -D 127.0.0.1:1080 <vps>   &&   BINANCE_PROXY=socks5://127.0.0.1:1080 node scripts/e2e-binance.js
// Tidak dijalankan di CI (butuh jaringan nyata); hasilnya bergantung pasar (mis. TP/SL nyata hanya dilaporkan sebagai info). Tanpa API key.
// Jalankan: node scripts/e2e-binance.js
const fs = require('fs'), path = require('path'), os = require('os'), { spawn } = require('child_process');
const INDEX = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const errors = [];
const check = (ok, msg, extra) => { results.push([ok, msg, extra]); console.log((ok ? '  LULUS  ' : '  GAGAL  ') + msg + (extra ? '  [' + extra + ']' : '')); };
const info = m => console.log('  ····   ' + m);

const INIT = `(()=>{
  window.__net = []; const f = window.fetch.bind(window);
  window.fetch = async (u, o) => { const t0 = performance.now(); try { const r = await f(u, o); window.__net.push({ u: String(u), s: r.status, ms: Math.round(performance.now() - t0) }); return r; } catch (e) { window.__net.push({ u: String(u), s: 0, err: String(e) }); throw e; } };
  const NW = window.WebSocket; window.__wsLog = {}; window.__wsEvents = []; window.__wsCount = {};
  window.WebSocket = class extends NW { constructor(u, p) { super(u, p); const url = String(u);
    window.__wsEvents.push({ url: url.slice(0, 200), ev: 'new', t: Date.now() });
    this.addEventListener('open', () => window.__wsEvents.push({ url: url.slice(0, 60), ev: 'open', t: Date.now() }));
    this.addEventListener('close', () => window.__wsEvents.push({ url: url.slice(0, 60), ev: 'close', t: Date.now() }));
    this.addEventListener('error', () => window.__wsEvents.push({ url: url.slice(0, 60), ev: 'error', t: Date.now() }));
    this.addEventListener('message', e => { const kind = url.includes('aggTrade') ? 'agg' : url.includes('depth20') ? 'depth' : url.includes('!ticker@arr') ? 'main' : 'other'; window.__wsCount[kind] = (window.__wsCount[kind] || 0) + 1; window.__wsLog[kind] = window.__wsLog[kind] || []; if (window.__wsLog[kind].length < 5) { let txt = String(e.data); try { const m = JSON.parse(e.data); const d = Array.isArray(m.data) ? null : m.data; if (kind === 'depth' && d) txt = JSON.stringify({ stream: m.stream, data: { s: d.s, keys: Object.keys(d), nb: (d.b || []).length, na: (d.a || []).length } }); } catch (x) {} window.__wsLog[kind].push(txt.slice(0, 900)); } });
  } };
})();`;

(async () => {
  const chrome = process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(p => fs.existsSync(p));
  if (!chrome) { console.error('Chrome tidak ditemukan. Set CHROME_PATH.'); process.exit(2); }
  const port = 9800 + Math.floor(Math.random() * 90);
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'real-'));
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${ud}`, '--no-first-run', '--disable-gpu', '--allow-file-access-from-files', ...(process.env.BINANCE_PROXY ? [`--proxy-server=${process.env.BINANCE_PROXY}`, '--proxy-bypass-list=<-loopback>'] : []), 'about:blank'], { stdio: 'ignore' });
  let target; for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC: ' + (m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300)); };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr, ms = 120000) => { const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout evaluate')), ms))]); if (r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };
  const waitFor = async (expr, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await ev(expr)) return true; } catch (e) {} await sleep(250); } return false; };
  const phase = async (name, fn) => { console.log('\n=== ' + name + ' ==='); const t0 = Date.now(); try { await fn(); } catch (e) { check(false, name + ': ERROR tak terduga', e.message.slice(0, 200)); } console.log(`  (${Math.round((Date.now() - t0) / 1000)} dtk)`); };

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: INIT });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: INDEX });

  await phase('A. Data pasar & harga', async () => {
    const ok = await waitFor('typeof tickerData !== "undefined" && tickerData.length > 300', 90000);
    check(ok, 'tickerData terisi dari Binance asli', ok ? (await ev('tickerData.length')) + ' pair USDT-M' : 'tidak terisi');
    if (!ok) throw new Error('data tidak termuat');
    await ev('document.getElementById("introTip").classList.remove("show")');
    const bad = await ev('tickerData.filter(d => !(parseFloat(d.lastPrice) > 0) || isNaN(parseFloat(d.priceChangePercent)) || !(d.quoteVolume >= 0)).map(d => d.symbol)');
    check(bad.length === 0, 'semua pair punya harga/%/volume valid', bad.length ? bad.slice(0, 5).join(',') : '');
    const fr = await ev('(()=>{ const w = tickerData.filter(d => d.fundingRate !== null && d.fundingRate !== undefined); return { n: w.length, total: tickerData.length, ext: w.filter(d => Math.abs(d.fundingRate) > 0.02).map(d => d.symbol + ":" + d.fundingRate) }; })()');
    check(fr.n / fr.total > 0.9, 'funding rate terisi untuk >90% pair', `${fr.n}/${fr.total}`);
    check(fr.ext.length < 8, 'funding rate tidak ada yang absurd (|FR|>2%)', fr.ext.slice(0, 4).join(' '));
    await sleep(6000);
    check(await ev('wsConnected') === true, 'WebSocket utama (ticker + markPrice) tersambung');
    const ping = await ev('document.getElementById("sidebarPingStatus").textContent');
    info('status sidebar: ' + ping);
    // konsistensi harga: tickerData vs REST ticker/price (diambil independen)
    const syms = await ev('["BTCUSDT","ETHUSDT","SOLUSDT"].concat(tickerData.slice(0,300).filter((_, i) => i % 29 === 0).map(d => d.symbol)).filter((v, i, a) => a.indexOf(v) === i)');
    const diffs = await ev(`(async()=>{ const out=[]; for (const s of ${JSON.stringify(syms)}) { const r = await (await fetch("https://fapi.binance.com/fapi/v1/ticker/price?symbol="+s)).json(); const row = tickerData.find(d=>d.symbol===s); const a = parseFloat(row.lastPrice), b = parseFloat(r.price); out.push({ s, a, b, d: Math.abs(a-b)/b*100 }); } return out; })()`);
    const worst = diffs.reduce((m, x) => x.d > m.d ? x : m, diffs[0]);
    check(diffs.every(x => x.d < 0.5), `harga app = harga REST Binance (selisih maks ${worst.d.toFixed(3)}% di ${worst.s})`, diffs.length + ' pair diuji');
    const snap1 = await ev('tickerData.map(d => d.lastPrice)'); await sleep(10000); const snap2 = await ev('tickerData.map(d => d.lastPrice)');
    const moved = snap1.filter((p, i) => p !== snap2[i]).length; const mainMsgs = await ev('window.__wsCount.main || 0');
    check(mainMsgs > 5 && moved > 50, 'harga bergerak real-time lewat WebSocket utama (pesan masuk, banyak pair berubah dalam 10 dtk)', `${mainMsgs} pesan; ${moved}/${snap1.length} pair berubah`);
    check((await ev('wsConnected')) === true && (await ev('document.getElementById("sidebarPingStatus").textContent')).includes('WebSocket Live'), 'status sidebar "WebSocket Live" benar (data memang mengalir)');
    // klines
    const kl = await ev(`(async()=>{ const out={}; for (const [s,iv] of [["BTCUSDT","1m"],["BTCUSDT","1h"],["BTCUSDT","4h"],["BTCUSDT","1d"],["BTCUSDT","1w"],["ETHUSDT","1h"]]) { const c = await fetchKlinesFull(s, iv, ICT_CANDLES); const now = Date.now(); let bad = 0; for (let i=0;i<c.length;i++){ const k=c[i]; if(!(k.high>=k.low && k.high>=Math.max(k.open,k.close) && k.low<=Math.min(k.open,k.close) && k.low>0) || isNaN(k.volume)) bad++; if(i>0 && c[i].t<=c[i-1].t) bad++; } out[s+"_"+iv] = { n: c.length, bad, lastClosed: c[c.length-1].ct <= now, ageMin: Math.round((now - c[c.length-1].ct)/60000) }; } return out; })()`);
    for (const k in kl) check(kl[k].n >= 100 && kl[k].bad === 0 && kl[k].lastClosed, `klines ${k}: ${kl[k].n} candle valid, candle terakhir sudah TUTUP`, `umur candle terakhir ${kl[k].ageMin} mnt`);
    const px = await ev('parseFloat(tickerData.find(d=>d.symbol==="BTCUSDT").lastPrice)');
    const l1m = await ev('fetchKlinesFull("BTCUSDT","1m",ICT_CANDLES).then(c => c[c.length-1].close)');
    check(Math.abs(px - l1m) / px < 0.003, 'harga ticker BTC sejalan dengan close candle 1m terakhir', `${px} vs ${l1m}`);
    // kedalaman data 400: diterima Binance, MA200 D1 tersedia untuk pair lama dan tidak memblokir pair baru; engine tetap identik pada jendela 200
    const depth = await ev(`(async()=>{
      const out = {};
      for (const s of ["BTCUSDT","ETHUSDT"]) { const c = await fetchKlinesFull(s, "1d", ICT_FETCH); out[s] = { n: c.length, ma200: flMaState(c, "ma200").ok, ema50: flMaState(c, "ema50").ok }; }
      const young = tickerData.filter(d => d.quoteVolume > 5e6).slice(0, 120);
      let shortOne = null; for (const d of young) { const c = await fetchKlinesFull(d.symbol, "1d", ICT_FETCH).catch(() => null); if (c && c.length < 200) { shortOne = { s: d.symbol, n: c.length, ma200: flMaState(c, "ma200").ok, ma200Reason: flMaState(c, "ma200").reason }; break; } }
      return { out, shortOne };
    })()`, 300000);
    check(Object.values(depth.out).every(x => x.n >= 390 && x.ma200 && x.ema50), 'limit=400 diterima Binance: D1 BTC/ETH ≥390 candle, MA200 dan EMA50 tersedia', JSON.stringify(depth.out));
    if (depth.shortOne) check(depth.shortOne.ma200 === false && depth.shortOne.ma200Reason === 'data kurang', 'pair dengan <200 candle harian: MA200 "data kurang" (tidak memblokir)', JSON.stringify(depth.shortOne));
    else info('tidak ada pair <200 candle harian di 120 pair teratas (pengecekan pair baru dilewati)');
    const eq = await ev(`(async()=>{
      const bad = [], syms = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","LINKUSDT","AVAXUSDT"];
      const sig = e => JSON.stringify([e.decision, e.best && [e.best.id, e.best.side, e.best.plan.entry, e.best.plan.sl, e.best.plan.tp]]);
      for (const style of ["intraday","swing"]) for (const s of syms) {
        const cfg = ICT_CFG.styles[style];
        const get = async (tf) => { const a = await fetchKlinesFull(s, tf, 200); const b = await fetchKlinesFull(s, tf, ICT_FETCH); return [a, b]; };
        const [l200, l400] = await get(cfg.ltf), [h200, h400] = await get(cfg.htf), [g200, g400] = await get(cfg.htf2);
        const e1 = ictEvaluate(style, l200, h200, g200, new Date(), null, { prefs: loadIctPrefs() });
        const e2 = ictEvaluate(style, ictWindow(l400), ictWindow(h400), ictWindow(g400), new Date(), null, { prefs: loadIctPrefs() });
        if (sig(e1) !== sig(e2)) bad.push(s + "/" + style + " 200=" + sig(e1).slice(0, 60) + " 400=" + sig(e2).slice(0, 60));
      }
      return bad; })()`, 300000);
    check(eq.length === 0, 'engine ICT memberi hasil IDENTIK pada candle limit=200 vs jendela 200 dari limit=400 (16 kombinasi pair×gaya)', eq.slice(0, 3).join(' | '));
  });

  await phase('B. Scan Intraday / Swing / Deep Scan (data asli)', async () => {
    const reqBefore = await ev('window.__net.length');
    for (const mode of ['intraday', 'swing']) {
      const t0 = Date.now();
      await ev(`runModeScan("${mode}")`);
      const ok = await waitFor('document.getElementById("heroModeStatus").textContent.startsWith("✓")', 240000);
      const st = await ev('document.getElementById("heroModeStatus").textContent');
      check(ok, `scan ${mode} selesai (${Math.round((Date.now() - t0) / 1000)} dtk)`, st.slice(0, 140));
      const hits = await ev('lastScanResults.hits.map(h => ({ s: h.symbol, style: h.style, side: h.ev.best.side, id: h.ev.best.id, grade: h.ev.best.grade, st: h.ev.best.status, p: h.ev.best.plan, ltfLast: h.ev.ltf.last }))');
      info(`${mode}: ${hits.length} setup lolos`);
      await ev('document.getElementById("modeResultsClose").click()');
      globalThis['H_' + mode] = hits;
    }
    const t0 = Date.now();
    await ev('runDeepScanTop20()');
    const ok = await waitFor('document.getElementById("heroModeStatus").textContent.startsWith("✓")', 480000);
    check(ok, `Deep Scan selesai (${Math.round((Date.now() - t0) / 1000)} dtk)`, (await ev('document.getElementById("heroModeStatus").textContent')).slice(0, 150));
    const hits = await ev('lastScanResults.hits.map(h => ({ s: h.symbol, style: h.style, side: h.ev.best.side, id: h.ev.best.id, grade: h.ev.best.grade, st: h.ev.best.status, p: h.ev.best.plan, ltfLast: h.ev.ltf.last, q: ictQuality(h.ev.best), tf: ICT_CFG.styles[h.style].ltf }))');
    globalThis.H_deep = hits;
    check(hits.length <= 20, `Deep Scan menampilkan maks 20 pair`, hits.length + '');
    check(new Set(hits.map(h => h.s)).size === hits.length, 'Deep Scan: tiap pair sekali');
    const txt = await ev('document.getElementById("modeResultsList").innerText');
    check(!/NaN|undefined|Infinity/.test(txt), 'daftar hasil scan tanpa NaN/undefined', txt.length + ' karakter');
    // sanity rencana
    const all = [...globalThis.H_intraday, ...globalThis.H_swing, ...hits];
    const insane = [];
    for (const h of all) { const p = h.p, long = h.side === 'long';
      const okSl = long ? p.sl < p.entry : p.sl > p.entry; const okTp = long ? p.tp > p.entry : p.tp < p.entry;
      const okTp2 = p.tp2 == null || (long ? p.tp2 > p.tp : p.tp2 < p.tp); const okTp3 = p.tp3 == null || p.tp2 == null || (long ? p.tp3 > p.tp2 : p.tp3 < p.tp2);
      const finite = [p.entry, p.sl, p.tp, p.rr].every(v => isFinite(v) && v > 0);
      const px = parseFloat((await ev(`(tickerData.find(d=>d.symbol==="${h.s}")||{}).lastPrice`)) || 0);
      const fresh = hits.includes(h); // harga bergerak sejak scan lama; hanya hasil Deep Scan terbaru yang dinilai terhadap harga sekarang
      const beyond = fresh && px > 0 && (long ? (px <= p.sl || px >= p.tp) : (px >= p.sl || px <= p.tp));
      if (!(okSl && okTp && okTp2 && okTp3 && finite) || beyond) insane.push(`${h.s} ${h.style} ${h.side} ${h.id}: sl${okSl} tp${okTp} tp2${okTp2} tp3${okTp3} fin${finite} beyond${beyond}`); }
    check(insane.length === 0, `rencana entry masuk akal untuk ${all.length} hasil (SL sisi benar, TP berurutan, harga belum melewati SL/TP)`, insane.slice(0, 3).join(' | '));
    // harga candle vs ticker (indikasi harga miss)
    const gap = []; for (const h of hits) { const px = parseFloat(await ev(`tickerData.find(d=>d.symbol==="${h.s}").lastPrice`)); gap.push({ s: h.s, tf: h.tf, d: Math.abs(px - h.ltfLast) / px * 100 }); }
    const gw = gap.reduce((m, x) => x.d > m.d ? x : m, { d: 0 });
    check(gap.every(x => x.d < 12), 'close candle LTF dekat dengan harga ticker (tidak ada pair dengan data candle basi)', gap.length ? `selisih maks ${gw.d.toFixed(2)}% (${gw.s} @${gw.tf})` : 'tidak ada hasil');
    // konsistensi scan vs Decision
    const mism = await ev(`(async()=>{ const bad=[]; for(const h of lastScanResults.hits){ const tf=ICT_CFG.styles[h.style].ltf; await loadDetail(h.symbol, tf); const f=lastDetailFull; const want=h.ev.best.side==="long"?"LONG":"SHORT"; if(!f||f.ev.decision!==want||f.ev.best.id!==h.ev.best.id) bad.push(h.symbol+"@"+tf+" scan="+want+"/"+h.ev.best.id+" decision="+(f?f.ev.decision+"/"+(f.ev.best&&f.ev.best.id):"null")); } return bad; })()`, 300000);
    check(mism.length === 0, 'hasil scan = keputusan halaman Decision/detail untuk semua pair (rumus tidak tumpang tindih)', mism.slice(0, 3).join(' | '));
    const audit = await ev(require('./audit-plan.js'));
    check(audit.length === 0, 'audit rumus semua hasil scan (data asli) konsisten: SL/TP searah, rr, R pelacak, status gerbang', audit.slice(0, 4).join(' | '));
    // lapis BIAS di data asli: distribusi, invarian, dan kecocokan dengan hasil scan (belum menjadi gerbang)
    const bz = await ev(`(async()=>{
      const pairs = tickerData.filter(d => d.quoteVolume >= ICT_MIN_QUOTE_VOL).sort((a,b) => b.quoteVolume - a.quoteVolume).slice(0, 40).map(d => d.symbol);
      const out = { intraday: { n:0, long:0, short:0, none:0, counter:0, koreksi:0, lanjutan:0, phaseNull:0, ma200Bias:0, ma200Ctx:0 }, swing: { n:0, long:0, short:0, none:0, counter:0, koreksi:0, lanjutan:0, phaseNull:0, ma200Bias:0, ma200Ctx:0 }, bad: [], thrown: 0 };
      for (const s of pairs) {
        const raw = {}; for (const tf of ["1h","4h","1d","1w"]) raw[tf] = await fetchKlinesFull(s, tf, ICT_FETCH).catch(() => null);
        for (const style of ["intraday","swing"]) {
          let b; try { b = ictBiasFromCandles(style, raw, { bars: ICT_CANDLES }); } catch (e) { out.thrown++; continue; }
          const o = out[style]; o.n++;
          const cfg = ICT_CFG.styles[style]; const st = raw[cfg.htf] && raw[cfg.htf].length >= 20 ? ictContext(ictWindow(raw[cfg.htf])).structure.bias : null;
          const want = st === "bullish" ? "long" : st === "bearish" ? "short" : null;
          if (b.side !== want || b.ok !== (want !== null)) out.bad.push(s + "/" + style + " side=" + b.side + " struktur=" + st);
          if (b.ok && b.rankDelta !== (b.counterContext ? -3 : 0) + b.ma.aligned - b.ma.opposed) out.bad.push(s + "/" + style + " rumus peringkat");
          if (b.side === "long") o.long++; else if (b.side === "short") o.short++; else o.none++;
          if (b.counterContext) o.counter++;
          if (b.phase.value === "koreksi") o.koreksi++; else if (b.phase.value === "lanjutan") o.lanjutan++; else if (b.ok) o.phaseNull++;
          if (b.ok && b.ma.bias && b.ma.bias.ok !== false) o.ma200Bias++; if (b.ok && b.ma.context && b.ma.context.ok !== false) o.ma200Ctx++;
        }
      }
      // kecocokan hasil scan Deep Scan terakhir dengan lapis BIAS
      const hits = lastScanResults.hits, cmp = { n: hits.length, agree: 0, opposite: 0, nobias: 0, counter: 0, koreksi: 0, missing: 0 };
      for (const h of hits) { const b = h.ev.bias; if (!b) { cmp.missing++; continue; } if (!b.ok) cmp.nobias++; else if (b.side === h.ev.best.side) cmp.agree++; else cmp.opposite++; if (b.counterContext) cmp.counter++; if (b.phase.value === "koreksi") cmp.koreksi++; }
      return { out, cmp, pairs: pairs.length };
    })()`, 400000);
    check(bz.out.thrown === 0 && bz.out.bad.length === 0, `lapis BIAS di data asli (${bz.pairs} pair × 2 gaya): tanpa error; arah = struktur TF bias; rumus peringkat benar`, bz.out.bad.slice(0, 3).join(' | '));
    info('distribusi BIAS Intraday (H4): ' + JSON.stringify(bz.out.intraday));
    info('distribusi BIAS Swing (D1):    ' + JSON.stringify(bz.out.swing));
    check(bz.out.intraday.long + bz.out.intraday.short > 0 && bz.out.swing.long + bz.out.swing.short > 0, 'kedua gaya menghasilkan bias di pasar nyata');
    check(bz.cmp.missing === 0, 'setiap hasil Deep Scan membawa lapis BIAS', JSON.stringify(bz.cmp));
    info(`hasil Deep Scan terhadap lapis BIAS: sejalan ${bz.cmp.agree}, BERLAWANAN ${bz.cmp.opposite}, tanpa bias ${bz.cmp.nobias}, melawan konteks ${bz.cmp.counter}, fase koreksi ${bz.cmp.koreksi} (dari ${bz.cmp.n}) — ini yang akan tersaring bila BIAS dijadikan gerbang`);
    // lapis AREA di data asli: seberapa sering terbentuk, invarian, dan kecocokan entry hasil scan dengan AREA (belum menjadi gerbang)
    const az = await ev(`(async()=>{
      const pairs = tickerData.filter(d => d.quoteVolume >= ICT_MIN_QUOTE_VOL).sort((a,b) => b.quoteVolume - a.quoteVolume).slice(0, 40).map(d => d.symbol);
      const mk = () => ({ n: 0, bias: 0, ok: 0, bonus: 0, lantai: 0, snr: 0, inZone: 0, waiting: 0, dalam: 0, strict: 0, short: 0, legNone: 0, legSmall: 0, noZone: 0 });
      const out = { intraday: mk(), swing: mk(), bad: [], thrown: 0 };
      for (const s of pairs) {
        const raw = {}; for (const tf of ["1h","4h","1d","1w"]) raw[tf] = await fetchKlinesFull(s, tf, ICT_FETCH).catch(() => null);
        const cm = ictCtxMap(raw, ICT_CANDLES);
        for (const style of ["intraday","swing"]) {
          let b, a; try { b = ictBiasFromCandles(style, raw, { bars: ICT_CANDLES, ctxMap: cm }); a = ictAreaLayer(style, b, cm); } catch (e) { out.thrown++; continue; }
          const o = out[style]; o.n++;
          if (!b.ok) { if (a.ok || a.areas.length) out.bad.push(s + "/" + style + " area tanpa bias"); continue; }
          o.bias++;
          if (a.depth === "dalam") o.dalam++; if (a.strict) o.strict++; if (a.side === "short") o.short++;
          a.legs.forEach(l => { if (!l.ok) { if (l.mult === undefined) o.legNone++; else o.legSmall++; } });
          if (!a.ok) { if (a.legs.some(l => l.ok)) o.noZone++; continue; }
          o.ok++; if (a.area.legTier === "bonus") o.bonus++; else o.lantai++; if (a.area.snr) o.snr++; if (a.area.status === "in_zone") o.inZone++; else o.waiting++;
          const last = cm[ICT_CFG.styles[style].ltf].last, eq = cm[b.tf.bias].range ? cm[b.tf.bias].range.eq : null, long = a.side === "long";
          for (const z of a.areas) {
            if (z.ce < z.band.lo - 1e-9 || z.ce > z.band.hi + 1e-9 || z.low < z.band.lo - 1e-9 || z.high > z.band.hi + 1e-9 || z.low > z.high) out.bad.push(s + "/" + style + " zona di luar band");
            if (z.legMult < AREA_CFG.legMinMult - 1e-9) out.bad.push(s + "/" + style + " leg di bawah lantai");
            if (long ? last < z.low : last > z.high) out.bad.push(s + "/" + style + " harga sudah menembus zona");
            if (eq !== null) { const mid = (z.low + z.high) / 2; if (long ? !(mid < eq) : !(mid > eq)) out.bad.push(s + "/" + style + " premium/discount"); if (a.strict && (long ? !(z.high <= eq) : !(z.low >= eq))) out.bad.push(s + "/" + style + " ketat"); }
            if (z.type === undefined && false) out.bad.push("x");
          }
        }
      }
      const hits = lastScanResults.hits, cmp = { n: hits.length, hasArea: 0, entryInArea: 0, noArea: 0, missing: 0, aligned: 0 };
      for (const h of hits) { const a = h.ev.area; if (!a) { cmp.missing++; continue; } if (!h.ev.bias || !h.ev.bias.ok || h.ev.bias.side !== h.ev.best.side) cmp.aligned += 0; else cmp.aligned++; if (a.ok) cmp.hasArea++; else cmp.noArea++; const e = h.ev.best.plan.entry; if (a.areas.some(z => e >= z.low && e <= z.high)) cmp.entryInArea++; }
      return { out, cmp, pairs: pairs.length };
    })()`, 400000);
    check(az.out.thrown === 0 && az.out.bad.length === 0, `lapis AREA di data asli (${az.pairs} pair × 2 gaya): tanpa error; CE di band, zona ⊂ band, leg ≥ 3x, harga belum menembus zona, aturan premium/discount terpenuhi`, az.out.bad.slice(0, 3).join(' | '));
    info('AREA Intraday (H4): ' + JSON.stringify(az.out.intraday));
    info('AREA Swing (D1/H4): ' + JSON.stringify(az.out.swing));
    check(az.cmp.missing === 0, 'setiap hasil Deep Scan membawa lapis AREA', JSON.stringify(az.cmp));
    info(`hasil Deep Scan terhadap lapis AREA: AREA ada ${az.cmp.hasArea}, tidak ada ${az.cmp.noArea}, entry berada DI DALAM AREA ${az.cmp.entryInArea} (dari ${az.cmp.n}) — ini yang akan lolos gerbang AREA bila entry harus di dalam AREA`);
    const n = await ev('window.__net.length');
    const slice = await ev(`window.__net.slice(${reqBefore})`);
    const non200 = slice.filter(x => x.s !== 200);
    check(non200.length === 0, `semua request scan sukses (tanpa 429/418/error)`, `${slice.length} request; non-200: ${non200.slice(0, 3).map(x => x.s + ' ' + x.u.slice(-60)).join(' ; ')}`);
    const arm = await ev('trackRecs.filter(r => r.status === "armed").length + "/" + trackRecs.length');
    info('catatan pelacak setelah scan (armed/total): ' + arm);
  });

  await phase('C. Decision live: stream CVD/orderbook, OI, CHoCH, TP/SL, histori (BTC & ETH asli)', async () => {
    await ev('saveSetupHistory([]); trackRecs.length = 0; updateHistoryBadge()');
    const mk = (sym, side, e, sl, tp, tp2, tp3) => `armSetups([{ symbol:"${sym}", style:"intraday", ev:{ best:{ side:"${side}", id:"SWEEP_MSS", grade:"A", check:{passes:7,total:8}, plan:{ entry:${e}, sl:${sl}, tp:${tp}, tp2:${tp2}, tp3:${tp3}, rr:3, slCloseBased:false } } } }])`;
    const B = parseFloat(await ev('tickerData.find(d=>d.symbol==="BTCUSDT").lastPrice')), E = parseFloat(await ev('tickerData.find(d=>d.symbol==="ETHUSDT").lastPrice'));
    // BTC long: entry sedikit di atas harga (langsung tersentuh), TP jauh supaya tetap RUNNING selama pengamatan
    await ev(mk('BTCUSDT', 'long', B * 1.0003, B * 0.97, B * 1.02, B * 1.03, B * 1.04));
    await ev(mk('ETHUSDT', 'short', E * 0.9997, E * 1.03, E * 0.98, 'null', 'null'));
    await ev('trackTick()');
    check(await ev('trackRecs.filter(r => r.status === "running").length') === 2, 'BTC & ETH langsung RUNNING (Entry tersentuh pada harga asli)');
    await ev('showWorkspace("wsDecision")');
    info('mengamati stream selama 30 detik…');
    await waitFor('liveData.BTCUSDT && liveData.BTCUSDT.oi > 0 && liveData.BTCUSDT.imb !== undefined', 30000);
    await sleep(25000);
    await ev('pollTrackStructure()'); await sleep(2500);
    const wsEv = await ev('window.__wsEvents'); const urls = [...new Set(wsEv.filter(e => e.ev === 'new').map(e => e.url.replace(/streams=.*/, 'streams=…')))];
    info('endpoint WebSocket yang dipakai: ' + urls.join(' , '));
    check(urls.some(u => u.includes('/market/stream')) && urls.some(u => u.includes('/public/stream')), 'stream Decision memakai /market/stream (aggTrade) dan /public/stream (depth20)');
    const cnt = await ev('window.__wsCount'); check((cnt.agg || 0) > 20 && (cnt.depth || 0) > 20, `pesan stream masuk di Binance asli (aggTrade ${cnt.agg || 0}, depth ${cnt.depth || 0})`);
    const log = await ev('window.__wsLog'); const pj = a => (a || []).map(s => { try { return JSON.parse(s); } catch (e) { return null; } }).filter(Boolean);
    const agg = pj(log.agg)[0], dep = pj(log.depth)[0];
    check(!!agg && agg.data.s && agg.data.p && agg.data.q && typeof agg.data.m === 'boolean' && agg.data.T, 'bentuk pesan aggTrade sesuai asumsi (s,p,q,m,T)', agg ? JSON.stringify(agg.data).slice(0, 110) : 'tidak ada');
    check(!!dep && dep.data.s && dep.data.keys.includes('b') && dep.data.keys.includes('a') && dep.data.nb > 0 && dep.data.na > 0, 'bentuk pesan depth20 sesuai asumsi (s,b[],a[])', dep ? `kunci: ${dep.data.keys.join(',')} · ${dep.data.nb} bid/${dep.data.na} ask` : 'tidak ada');
    const L = await ev('JSON.parse(JSON.stringify(liveData))');
    for (const s of ['BTCUSDT', 'ETHUSDT']) { const d = L[s] || {};
      check(d.oi > 0, `${s}: OI terambil dari REST`, d.oi + ' koin');
      check(d.wsOn === true && Math.abs(d.cvd) > 0, `${s}: CVD berjalan`, 'cvd=' + Math.round(d.cvd) + ' USDT');
      check(d.imb !== undefined && d.imb >= -1 && d.imb <= 1 && d.bid > 0 && d.ask >= d.bid, `${s}: orderbook valid`, `imb=${(d.imb || 0).toFixed(3)} bid=${d.bid} ask=${d.ask}`); }
    // validasi CVD independen: jumlahkan aggTrades REST 60 detik terakhir dan bandingkan arah/skala dengan jendela CVD aplikasi
    const ind = await ev(`(async()=>{ const now=Date.now(); const r = await (await fetch("https://fapi.binance.com/fapi/v1/aggTrades?symbol=BTCUSDT&startTime="+(now-26000)+"&endTime="+(now-4000)+"&limit=1000")).json(); let d=0,v=0; for(const t of r){ const q=parseFloat(t.p)*parseFloat(t.q); d += t.m ? -q : q; v += q; } const app = liveData.BTCUSDT.cvdWin.filter(x=>x.t>=now-26000 && x.t<=now-4000).reduce((s,x)=>s+x.d,0); const appV = liveData.BTCUSDT.cvdWin.filter(x=>x.t>=now-26000 && x.t<=now-4000).reduce((s,x)=>s+Math.abs(x.d),0); return { n: r.length, d, v, app, appV }; })()`);
    check(ind.v > 0 && Math.abs(ind.appV - ind.v) / ind.v < 0.30, 'volume taker 22 dtk (jendela dalam, tepi 4 dtk dibuang) di app ≈ aggTrades REST Binance (selisih <30%)', `REST ${Math.round(ind.v)} vs app ${Math.round(ind.appV)} USDT (${ind.n} trade)`);
    check(Math.sign(ind.d) === Math.sign(ind.app) || Math.abs(ind.d) < ind.v * 0.05, 'arah CVD 22 dtk (jendela dalam) (beli−jual) sama dengan hitungan independen REST', `REST ${Math.round(ind.d)} vs app ${Math.round(ind.app)}`);
    const st = await ev('JSON.stringify(structById)'); check(Object.keys(JSON.parse(st)).length >= 1, 'CHoCH/BOS terambil dari candle tutup asli', st.slice(0, 160));
    await ev('renderDecision()'); const dec = await ev('document.getElementById("decisionList").innerText');
    check(/RUNNING/.test(dec) && /BTC/.test(dec) && /ETH/.test(dec) && /OPEN INTEREST/.test(dec) && /CVD/.test(dec) && /ORDERBOOK/.test(dec) && /STRUKTUR/.test(dec), 'kartu Decision BTC & ETH menampilkan OI, CVD, orderbook, struktur');
    check(!/NaN|undefined|Infinity|memuat…|menyambung…/.test(dec), 'kartu Decision tanpa NaN/undefined/“memuat…” setelah 30 dtk', dec.slice(0, 20).replace(/\n/g, ' '));
    info('contoh kartu: ' + dec.replace(/\n+/g, ' | ').slice(0, 420));
    // TP/SL nyata: tambah dua catatan yang terpenuhi oleh gerakan harga asli beberapa detik
    const S = parseFloat(await ev('tickerData.find(d=>d.symbol==="SOLUSDT").lastPrice'));
    await ev(mk('SOLUSDT', 'long', S * 1.0002, S * 0.9995, S * 1.0005, S * 1.001, 'null')); // TP1/TP2 sangat dekat, SL sangat dekat
    await ev(mk('XRPUSDT', 'short', parseFloat(await ev('tickerData.find(d=>d.symbol==="XRPUSDT").lastPrice')) * 0.9998, parseFloat(await ev('tickerData.find(d=>d.symbol==="XRPUSDT").lastPrice')) * 1.0004, parseFloat(await ev('tickerData.find(d=>d.symbol==="XRPUSDT").lastPrice')) * 0.9996, 'null', 'null'));
    const closed = await waitFor('trackRecs.filter(r => (r.symbol === "SOLUSDT" || r.symbol === "XRPUSDT") && r.status === "closed").length === 2', 150000);
    const recs = await ev('trackRecs.filter(r => r.symbol === "SOLUSDT" || r.symbol === "XRPUSDT").map(r => ({ s: r.symbol, st: r.status, o: r.outcome, tpHit: r.tpHit, r: r.r }))');
    if (recs.some(x => x.st === 'closed' || x.tpHit >= 1)) check(true, 'harga asli menggerakkan SOL/XRP sampai TP/SL atau TP1 tercapai', JSON.stringify(recs));
    else info('pasar sangat sepi: SOL/XRP tidak menyentuh TP/SL dalam 150 dtk (bukan kegagalan; logika sudah diuji di uji unit dan smoke) ' + JSON.stringify(recs));
    if (closed) {
      await ev('trackTick(); renderDecision()');
      const decAfter = await ev('document.getElementById("decisionList").innerText');
      check(!/SOL|XRP/.test(decAfter), 'pair yang selesai hilang dari Decision');
      const hist = await ev('loadSetupHistory().filter(e => e.auto && (e.symbol==="SOLUSDT"||e.symbol==="XRPUSDT"))');
      check(hist.length === 2 && hist.every(h => h.outcome === 'win' || h.outcome === 'lose') && hist.every(h => (h.outcome === 'lose') === h.needsNote), 'keduanya tercatat otomatis di Histori Setup (SL → perlu keterangan)', hist.map(h => `${h.symbol}:${h.outcome}/${h.exit.label}/${h.exit.r.toFixed(2)}R`).join(' '));
      info('contoh keterangan otomatis: ' + (hist[0].noteAuto || '').replace(/\n/g, ' ¶ ').slice(0, 300));
    }
    // rekonsiliasi candle asli: bandingkan dengan evaluasi independen
    const rec = await ev(`(async()=>{
      const r0 = await (await fetch("https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=60")).json();
      const cs = r0.slice(0, 59).map(k => ({ t:k[0], high:+k[2], low:+k[3], close:+k[4] }));
      const from = cs[5].t; const sub = cs.slice(5);
      const entry = Math.min(...sub.slice(0, 8).map(c=>c.low)) * 1.00005; // tersentuh di candle awal
      const sl = Math.min(...sub.map(c=>c.low)) * 0.9997, tp = Math.max(...sub.slice(10).map(c=>c.high)) * 0.9999;
      const rec = { id:"t_recon", key:"recon", symbol:"BTCUSDT", style:"intraday", tf:"1h", side:"long", entry, sl, tp, tp2:null, tp3:null, rr:2, armedAt: from, status:"armed", title:"x", grade:"A", passes:1, total:1 };
      // evaluasi independen sederhana
      let st="armed", out=null; for (let i=0;i<sub.length;i++){ const c=sub[i]; if(st==="armed"){ if(c.low<=entry){ st="running"; if(c.low<=sl){ out="sl"; break; } continue; } else if(c.high>=tp){ out="void"; break; } else continue; } if(c.low<=sl){ out="sl"; break; } if(c.high>=tp){ out="tp"; break; } }
      trackReady = false; trackRecs.push(rec); await trackReconcile(rec);
      trackRecs.splice(trackRecs.indexOf(rec),1); trackReady = true;
      return { indep: out || st, app: rec.status==="closed" ? rec.outcome : rec.status, entry, sl, tp };
    })()`);
    check(rec.indep === rec.app, 'rekonsiliasi candle asli (klines 1m startTime) = evaluasi independen', JSON.stringify(rec));
  });

  await phase('D. Semua tampilan & fitur (data asli)', async () => {
    const syms = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    const lowcap = await ev('tickerData.filter(d => d.quoteVolume > 2e7).sort((a,b) => a.quoteVolume - b.quoteVolume).slice(0,2).map(d => d.symbol)');
    const tfs = ['1h', '2h', '4h', '12h', '1d', '1w'];
    const badDetail = [];
    for (const s of [...syms, ...lowcap]) for (const tf of tfs) {
      await ev(`currentDetailTf = "${tf}"; openDetail("${s}")`);
      await waitFor('!document.getElementById("modalBody").innerText.includes("Memuat analisa")', 40000);
      const t = await ev('document.getElementById("modalBody").innerText');
      const finalOk = await ev('!!lastDetailFull || document.getElementById("modalBody").innerText.includes("belum cukup")');
      if (/NaN|undefined|Infinity/.test(t) || t.length < 300 || !finalOk) badDetail.push(`${s}@${tf}`);
      await ev('document.getElementById("modalCloseBtn").click()');
    }
    check(badDetail.length === 0, `detail pair (${syms.length + lowcap.length} pair × 6 timeframe) ter-render tanpa NaN/undefined`, badDetail.slice(0, 5).join(' '));
    // workspace Trading, prompt AI, ringkasan, kalkulator
    await ev('showWorkspace("wsTrading"); selectWorkspaceSymbol("BTC")'); await sleep(6000);
    const wsT = await ev('["wsAnalysisBody","wsValidationBody","wsDecisionBody","wsTradingSetupBody"].map(id => document.getElementById(id).innerText).join("\\n")');
    check(wsT.length > 800 && !/NaN|undefined|Infinity/.test(wsT), 'Trading Workspace BTC ter-render lengkap tanpa NaN/undefined', wsT.length + ' karakter');
    const prompts = await ev('["teknikal","risk","sentimen","bull","bear"].map(a => generateAgentPrompt(a))');
    check(prompts.every(p => p.length > 800 && !/NaN|undefined|Infinity/.test(p)), 'prompt 5 agent AI ter-generate tanpa NaN/undefined');
    // filter/sort scanner market
    await ev('showWorkspace("wsScanner")'); await sleep(1500);
    const filt = await ev(`(()=>{ const out={}; for (const f of ["all","watchlist","gainers","losers","volume","nearhigh","nearlow","fundingext"]) { applyFilter(f); out[f] = document.querySelectorAll("#tbody .coin-row").length; } applyFilter("all"); return out; })()`);
    check(filt.all > 50 && filt.gainers > 0 && filt.losers > 0 && filt.volume > 0, 'Scanner Market: filter menghasilkan baris', JSON.stringify(filt));
    const sorts = await ev(`(()=>{ const out={}; for (const s of ["quoteVolume","priceChangePercent","symbol"]) { const b = document.querySelector('.sort-pill[data-sort="'+s+'"]'); b.click(); out[s] = document.querySelector("#tbody .coin-row").getAttribute("data-symbol"); } return out; })()`);
    check(Object.values(sorts).every(Boolean), 'Scanner Market: ketiga urutan berfungsi', JSON.stringify(sorts));
    await waitFor('[...document.querySelectorAll("#tbody .row-status-slot")].map(e => e.textContent.trim()).filter(Boolean).length >= 3', 25000);
    const rowBias = await ev('[...document.querySelectorAll("#tbody .row-status-slot")].map(e => e.textContent.trim()).filter(Boolean).length');
    check(rowBias >= 3, 'badge bias 4H per baris terisi lewat lazy scan (data asli)', rowBias + ' baris');
    // search
    await ev('showWorkspace("wsHome")'); await ev('document.getElementById("searchBox").value = "BTC"; document.getElementById("searchBox").dispatchEvent(new Event("input"))'); await sleep(600);
    check((await ev('document.getElementById("searchResults") ? document.getElementById("searchResults").innerText : ""')).includes('BTC'), 'pencarian pair menemukan BTC');
    // alert watchlist nyata
    await ev('toggleWatchlist("BTCUSDT"); toggleWatchlist("ETHUSDT")'); await ev('checkWatchlistAlerts()', 120000);
    check(true, 'checkWatchlistAlerts() berjalan di data asli tanpa error', (await ev('loadAlertLog().length')) + ' alert di log');
    // jurnal + export
    await ev('openJournalForm(null)'); await ev('document.getElementById("jfSymbol").value="BTCUSDT"; document.getElementById("jfEntry").value="100"; document.getElementById("journalModalClose").click()');
    await ev('showWorkspace("wsReview")'); const rv = await ev('document.getElementById("journalList").innerText + document.getElementById("journalStats").innerText');
    check(!/NaN|undefined/.test(rv), 'Review/Jurnal ter-render tanpa NaN/undefined');
    // history panel
    await ev('closeOtherFullscreenPanels("historyPanel"); document.getElementById("historyPanel").classList.add("show"); renderSetupHistory()');
    const hp = await ev('document.getElementById("historyPanel").innerText');
    check(!/NaN|undefined|Infinity/.test(hp), 'Histori Setup ter-render tanpa NaN/undefined'); await ev('document.getElementById("historyPanelClose").click()');
    // rate limit / jaringan keseluruhan
    const net = await ev('window.__net');
    const by = {}; net.forEach(x => { const k = x.u.replace(/https:\/\/fapi\.binance\.com/, '').split('?')[0]; by[k] = (by[k] || 0) + 1; });
    const bad = net.filter(x => x.s !== 200 && !/aggTrades/.test(x.u));
    check(bad.length === 0, `seluruh sesi: ${net.length} request REST, tanpa 429/418/error`, bad.slice(0, 4).map(x => `${x.s} ${x.u.slice(-70)} ${x.err || ''}`).join(' ; '));
    info('request per endpoint: ' + JSON.stringify(by));
    const slow = net.filter(x => x.ms > 5000).length; info(`request >5 dtk: ${slow}; rata-rata ${Math.round(net.reduce((s, x) => s + (x.ms || 0), 0) / net.length)} ms (termasuk latensi proxy bila dipakai)`);
  });

  const exc = errors.filter(e => !/Failed to load resource|favicon|net::ERR_/.test(e));
  check(exc.length === 0, 'tidak ada exception / console.error JavaScript selama seluruh uji', exc.slice(0, 4).join(' || '));
  const failed = results.filter(r => !r[0]);
  console.log(`\n==== HASIL: ${results.length - failed.length} lulus, ${failed.length} gagal ====`);
  failed.forEach(f => console.log('  GAGAL: ' + f[1] + (f[2] ? '  [' + f[2] + ']' : '')));
  ws.close(); proc.kill(); process.exit(0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
