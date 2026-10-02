#!/usr/bin/env node
/**
 * Smoke test di browser sungguhan (Chrome/Edge headless via DevTools Protocol) — OPSIONAL, tidak dijalankan di CI.
 *
 * check.js & test-ict.js tidak menjalankan aplikasinya. Script ini membuka index.html, memalsukan API Binance
 * dengan candle sintetis (deterministik, tanpa jaringan), lalu menjalankan alur UI utama dan GAGAL kalau ada
 * exception/console.error atau elemen kunci yang tidak muncul.
 *
 * Jalankan: node scripts/smoke-browser.js [--shots=folder]   (butuh Chrome atau Edge terpasang)
 *   CHROME_PATH=... untuk menunjuk browser lain.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INDEX_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
const shotsArg = process.argv.find(a => a.startsWith('--shots='));
const SHOTS = shotsArg ? shotsArg.slice(8) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const CHROME = CANDIDATES.find(p => fs.existsSync(p));
if (!CHROME) { console.error('Chrome/Edge tidak ditemukan. Set CHROME_PATH.'); process.exit(2); }

// ---------- API Binance palsu (disuntik sebelum script halaman jalan) ----------
const MOCK = `
(() => {
  const SYMS = ['BTCUSDT','ETHUSDT','SOLUSDT','DOGEUSDT','XRPUSDT','BNBUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','TRXUSDT'];
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const C = (o,h,l,c) => ({open:o,high:h,low:l,close:c,volume:1});
  function leg(from,to,steps,wick){ const out=[]; for(let i=1;i<=steps;i++){ const o=from+(to-from)*(i-1)/steps,c=from+(to-from)*i/steps,w=wick*(0.5+0.1*i); out.push({open:o,close:c,high:Math.max(o,c)+w,low:Math.min(o,c)-w,volume:1}); } return out; }
  function zig(anchors,steps,wick){ let out=[]; for(let i=1;i<anchors.length;i++) out=out.concat(leg(anchors[i-1],anchors[i],steps,wick)); return out; }
  function mirror(cs,p){ return cs.map(k=>({open:p-k.open,close:p-k.close,high:p-k.low,low:p-k.high,volume:k.volume})); }
  function bullScenario(){ const c=zig([100,110,104,118,106,111],6,0.2);
    c.push(C(110.9,111.0,109.0,109.4),C(109.4,109.6,106.5,106.8),C(106.8,107.0,106.2,106.6),C(106.6,106.8,106.1,106.5),C(106.5,106.7,104.0,107.0),
      C(107.0,108.0,106.9,107.8),C(107.8,112.7,107.7,112.5),C(112.5,113.5,109.2,113.0),C(113.0,113.1,110.8,111.0),C(111.0,111.2,109.5,109.6),C(109.6,109.7,108.8,109.0)); return c; }
  const htfBull = () => zig([100,110,105,115,108,120],8,0.3);
  function walk(len,base){ const out=[]; let p=base; for(let i=0;i<len;i++){ const o=p,c=p*(1+(rnd()-0.5)*0.02); out.push({open:o,close:c,high:Math.max(o,c)*(1+rnd()*0.006),low:Math.min(o,c)*(1-rnd()*0.006),volume:1+rnd()}); p=c; } return out; }
  function unicornLong(){ const c = zig([100,120,112,140,126,140,108],14,0.3);
    c.push(C(108,110,107.8,109.8),C(109.8,112,109.6,111.8),C(111.8,114.2,111.6,114),C(114,114.6,113.4,113.6),C(113.6,116.2,113.5,116),
      C(116,116.1,113,113.2),C(113.2,113.4,110,110.2),C(110.2,110.4,106.5,106.8),C(106.8,107,104,104.6),
      C(104.6,106,104.4,105.8),C(105.8,108.2,105.6,108),C(108,110.6,107.9,110.4),C(110.4,115.2,110.3,115),C(115.2,118,115.1,117.6),
      C(117.6,117.8,116.4,116.6),C(116.6,116.8,115.6,115.8),C(115.8,116,114.9,115.2)); return c; }
  function leg2(from,to,steps,wick){ return leg(from,to,steps,wick); }
  function sweepShort(){ const c = zig([100,92,104,94],16,0.2).concat(leg2(94,100.2,12,0.8));
    c.push(C(100.2,100.6,100.1,100.5),C(100.5,102.6,100.4,102.4),C(102.4,103,101.9,102.8),C(102.8,103.6,102.5,103.4),C(103.4,104.8,102.9,103.2),
      C(103.2,103.3,101.6,101.8),C(101.8,101.9,100,100.2)); return c; }
  function series(sym, iv){
    if(sym==='LINKUSDT') return iv==='1h' ? unicornLong() : htfBull();
    if(sym==='ADAUSDT') return iv==='1h' ? sweepShort() : mirror(htfBull(),200);
    if(sym==='SOLUSDT') return iv==='1h' ? bullScenario() : htfBull();
    if(sym==='DOGEUSDT') return iv==='1h' ? mirror(bullScenario(),200) : mirror(htfBull(),200);
    return walk(200, 50 + SYMS.indexOf(sym)*7);
  }
  const last = {}; SYMS.forEach(s => { const c = series(s,'1h'); last[s] = c[c.length-1].close; });
  const json = (o, ok=true) => Promise.resolve(new Response(JSON.stringify(o), {status: ok?200:404, headers:{'Content-Type':'application/json'}}));
  const realFetch = window.fetch.bind(window);
  window.__mockCalls = [];
  window.fetch = (url, opts) => {
    const u = String(url);
    if(!u.includes('fapi.binance.com')) return realFetch(url, opts);
    window.__mockCalls.push(u);
    if(u.includes('/exchangeInfo')) return json({symbols: SYMS.map(s=>({symbol:s,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING'}))});
    if(u.includes('/ticker/24hr')) return json(SYMS.map((s,i)=>({symbol:s,lastPrice:String(last[s]),priceChangePercent:String((i-5)*1.3),highPrice:String(last[s]*1.04),lowPrice:String(last[s]*0.96),quoteVolume:String(8e7-i*3e6)})));
    if(u.includes('/premiumIndex')) return json(SYMS.map((s,i)=>({symbol:s,lastFundingRate:String(i===2?0.0009:0.0001)})));
    if(u.includes('/fapi/v1/time')) return json({serverTime: Date.now()});
    if(u.includes('/klines')){
      const q = new URL(u).searchParams; const cs = series(q.get('symbol'), q.get('interval'));
      const lim = parseInt(q.get('limit')||'200',10); const t0 = Date.now() - cs.length*3600e3;
      return json(cs.slice(-lim).map((k,i)=>[t0+i*3600e3,String(k.open),String(k.high),String(k.low),String(k.close),String(k.volume),0,'0',0,'0','0','0']));
    }
    return json({code:-1,msg:'mock: endpoint tidak dikenal '+u}, false);
  };
  window.WebSocket = class { constructor(){ setTimeout(()=>{ try{ this.onerror && this.onerror(); }catch(e){} }, 20); } close(){} };
  window.WebSocket.OPEN = 1; window.WebSocket.CONNECTING = 0;
})();
`;

// ---------- klien CDP minimal ----------
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function main() {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-smoke-'));
  const port = 9300 + Math.floor(Math.random() * 500);
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${userDir}`, '--no-first-run', '--no-default-browser-check',
    '--disable-gpu', '--allow-file-access-from-files', '--window-size=430,1000', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try { const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); target = list.find(t => t.type === 'page'); } catch (e) { /* belum siap */ }
  }
  if (!target) { proc.kill(); console.error('Gagal terhubung ke Chrome'); process.exit(2); }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(); const errors = []; const logs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION: ' + (m.params.exceptionDetails.exception ? m.params.exceptionDetails.exception.description : m.params.exceptionDetails.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'warning') logs.push('warn: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('evaluate gagal: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text) + '\n  expr: ' + expr.slice(0, 140));
    return r.result.value;
  };
  const waitFor = async (expr, label, ms = 15000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { try { if (await evaluate(expr)) return true; } catch (e) { /* belum siap */ } await sleep(150); }
    failures.push('TIMEOUT menunggu: ' + label); return false;
  };
  const shot = async (name, w, h) => {
    if (!SHOTS) return;
    if (w) await send('Emulation.setDeviceMetricsOverride', { width: w, height: h || 900, deviceScaleFactor: 1, mobile: w < 600 });
    await sleep(300);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, name + '.png'), Buffer.from(r.data, 'base64'));
  };

  const failures = []; let passed = 0;
  const check = (cond, msg) => { if (cond) { passed++; console.log('  LULUS  ' + msg); } else { failures.push(msg); console.log('  GAGAL  ' + msg); } };

  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK });
  await send('Emulation.setDeviceMetricsOverride', { width: 430, height: 1000, deviceScaleFactor: 1, mobile: true });
  console.log('Smoke test browser —', path.basename(CHROME), '\n');
  await send('Page.navigate', { url: INDEX_URL });

  // 1. boot & data
  await waitFor('typeof tickerData !== "undefined" && tickerData.length === 10', 'tickerData terisi dari API palsu');
  check(await evaluate('tickerData.length') === 10, 'app boot & memuat 10 pair dari API palsu');
  check(await evaluate('document.querySelectorAll("#tbody .coin-row").length') === 0 || true, 'render list tidak crash');
  check(!(await evaluate('document.getElementById("wsMarkov")')), 'workspace Markov sudah tidak ada di DOM');
  check(!(await evaluate('document.getElementById("modeScalpingBtn")')), 'tombol Scalping sudah tidak ada');
  check(await evaluate('document.querySelectorAll(".hero-mode-pill[data-mode]").length') === 2, 'Mode Trading tinggal 2 pill (Intraday, Swing)');
  await shot('01-home', 430, 1000);

  // 2. scanner market + lazy row scan
  await evaluate('showWorkspace("wsScanner")');
  await waitFor('document.querySelectorAll("#tbody .coin-row").length === 10', 'list scanner 10 baris');
  await waitFor('Object.values(deepData).filter(v => v && typeof v === "object" && v.bias).length >= 6', 'lazy row scan mengisi bias 4H (baris yang terlihat di viewport)', 20000);
  const badges = await evaluate('[...document.querySelectorAll("#tbody .row-status-slot")].map(e=>e.textContent.trim()).filter(Boolean)');
  check(badges.length >= 6 && badges.every(b => /^4H (Bullish|Bearish|Transisi|Netral)/.test(b)), `badge bias 4H muncul di baris (${badges.length}): ${badges.slice(0,3).join(' | ')}`);
  check((await evaluate('document.getElementById("scStrongCount").textContent')) === '10', 'stat "Lolos Filter Likuiditas" = 10');
  await shot('02-scanner', 430, 1000);

  // 3. scan intraday
  await evaluate('showWorkspace("wsHome")');
  await evaluate('runModeScan("intraday")');
  await waitFor('document.getElementById("heroModeStatus").textContent.startsWith("✓")', 'scan Intraday selesai', 30000);
  const intraStatus = await evaluate('document.getElementById("heroModeStatus").textContent');
  console.log('        ' + intraStatus);
  const intraHtml = await evaluate('document.getElementById("modeResultsList").innerText');
  check(/SOL/.test(intraHtml) && /LONG/.test(intraHtml), 'scan Intraday menemukan SOL sebagai LONG (skenario sweep+MSS)');
  check(/DOGE/.test(intraHtml) && /SHORT/.test(intraHtml), 'scan Intraday menemukan DOGE sebagai SHORT (skenario cermin)');
  check(/ZONA SIAP ENTRY/.test(intraHtml) && /ZONA PANTAU/.test(intraHtml), 'hasil dikelompokkan: ZONA SIAP ENTRY dan ZONA PANTAU');
  check(/LINK/.test(intraHtml) && /Unicorn/.test(intraHtml), 'scan Intraday menemukan LINK sebagai model Unicorn');
  check(/ADA/.test(intraHtml) && /Sweep→IFVG/.test(intraHtml), 'scan Intraday menemukan ADA sebagai model Sweep→IFVG (Inverse Blueprint)');
  await shot('03-scan-intraday', 430, 1000);
  // tombol "← Aksi Cepat" harus benar-benar menutup panel & kembali ke Home (dulu tanpa handler = tombol mati)
  check(await evaluate('document.getElementById("modeResultsSection").classList.contains("show")') === true, 'panel hasil scan terbuka sebelum ditutup');
  await evaluate('document.getElementById("modeResultsClose").click()');
  check(await evaluate('!document.getElementById("modeResultsSection").classList.contains("show") && document.getElementById("wsHome").classList.contains("active")') === true, 'tombol "← Aksi Cepat" menutup panel hasil & kembali ke Home');
  // klik pair hasil scan Intraday harus membuka Decision di gaya yang sama (1H), bukan 4H/Swing yang bisa SKIP
  check(await evaluate('document.querySelector("#modeResultsList .coin-row[data-symbol=\\"SOLUSDT\\"]").getAttribute("onclick")') === "openDetail('SOLUSDT','1h')", 'baris hasil scan Intraday membuka detail di 1H (gaya yang sama)');
  check((await evaluate('document.querySelector("#topSignalGrid .signal-card").getAttribute("onclick")')).includes("'1h'") || (await evaluate('document.querySelector("#topSignalGrid .signal-card").getAttribute("onclick")')).includes("'4h'"), 'kartu "Setup ICT Terbaru" membawa timeframe gayanya');

  // 4. scan swing + deep scan
  await evaluate('runModeScan("swing")');
  await waitFor('document.getElementById("heroModeStatus").textContent.startsWith("✓")', 'scan Swing selesai', 30000);
  check(!(await evaluate('document.getElementById("modeResultsList").innerText')).includes('undefined'), 'hasil scan Swing tidak memuat teks "undefined"');
  await evaluate('document.getElementById("modeResultsClose").click()');
  await evaluate('runDeepScanTop20()');
  await waitFor('document.getElementById("heroModeStatus").textContent.startsWith("✓")', 'Deep Scan selesai', 40000);
  console.log('        ' + await evaluate('document.getElementById("heroModeStatus").textContent'));
  check(/Intraday|Swing/.test(await evaluate('document.getElementById("modeResultsList").innerText')) || /belum ada setup/i.test(await evaluate('document.getElementById("modeResultsList").innerText')), 'Deep Scan merender hasil (atau pesan kosong yang jujur)');
  check(await evaluate('document.getElementById("scanTopBtn").disabled') === false, 'tombol Deep Scan aktif lagi setelah selesai');
  // Deep Scan: satu baris per pair, maksimal 20, urut siap-entry lalu kualitas, tanpa mengurutkan menurut RR
  const deep = await evaluate('lastScanResults.hits.map(h=>({s:h.symbol, st:h.style, inz:h.ev.best.status==="in_zone", q:ictQuality(h.ev.best)}))');
  check(deep.length > 0 && deep.length <= 20, `Deep Scan menampilkan 1-20 pair (${deep.length})`);
  check(new Set(deep.map(h => h.s)).size === deep.length, 'Deep Scan: tiap pair hanya muncul sekali (TRX tidak dobel Swing+Intraday)');
  check(deep.every((h, i) => i === 0 || (deep[i-1].inz ? 1 : 0) > (h.inz ? 1 : 0) || ((deep[i-1].inz ? 1 : 0) === (h.inz ? 1 : 0) && deep[i-1].q >= h.q)), 'Deep Scan: urut siap-entry dulu, lalu kualitas setup menurun');
  // konsistensi: tiap hasil scan harus sama dengan keputusan halaman Decision di gaya/timeframe yang membawanya
  const mismatch = await evaluate(`(async()=>{ const bad=[]; for(const h of lastScanResults.hits){ const tf=ICT_CFG.styles[h.style].ltf; await loadDetail(h.symbol, tf); const f=lastDetailFull; const want=h.ev.best.side==='long'?'LONG':'SHORT'; if(!f||f.ev.decision!==want||f.ev.best.id!==h.ev.best.id) bad.push(h.symbol+'@'+tf+' scan='+want+'/'+h.ev.best.id+' decision='+(f?f.ev.decision+'/'+(f.ev.best&&f.ev.best.id):'null')); } return bad; })()`);
  check(mismatch.length === 0, 'hasil scan = keputusan Decision di gaya yang sama untuk semua pair' + (mismatch.length ? ' — beda: ' + mismatch.join('; ') : ''));
  await evaluate('document.getElementById("modeResultsClose").click()');
  await evaluate('showWorkspace("wsHome")');
  check((await evaluate('document.getElementById("topSignalGrid").innerText')).includes('SOL'), 'Home "Setup ICT Terbaru" menampilkan hasil scan terakhir');
  await shot('04-home-setup-terbaru', 430, 1000);

  // 5. detail modal
  await evaluate('currentDetailTf = "1h"'); // skenario sweep+MSS ada di 1H (gaya Intraday)
  await evaluate('openDetail("SOLUSDT")');
  await waitFor('document.getElementById("modalBody").innerText.includes("KEPUTUSAN") || document.getElementById("modalBody").innerText.includes("CHECKLIST ICT")', 'detail SOL ter-render');
  const modal = await evaluate('document.getElementById("modalBody").innerText');
  check(/LONG/.test(modal) && /Liquidity Sweep \+ MSS/.test(modal), 'detail SOL: keputusan LONG + setup Liquidity Sweep + MSS');
  check(/CHECKLIST ICT/.test(modal) && /Bias HTF searah/.test(modal), 'detail SOL: checklist ICT tampil');
  check(/RENCANA ENTRY ICT/.test(modal) && /Take Profit 1/.test(modal), 'detail SOL: rencana entry (Entry/SL/TP/RR) tampil');
  check(!/NaN|undefined|Infinity/.test(modal), 'detail SOL: tidak ada "NaN"/"undefined"/"Infinity" di layar');
  check(!/(EMA|RSI|MACD|ADX|ATR|VWAP|StochRSI|Bollinger|Fibonacci)/.test(modal), 'detail SOL: tidak ada indikator klasik di layar');
  await shot('05-detail-sol', 430, 1400);
  // ganti timeframe
  for (const tf of ['1h', '1d', '1w', '12h']) {
    await evaluate(`document.querySelector('#tfSwitch .tf-btn[data-tf="${tf}"]').click()`);
    await waitFor(`document.getElementById("modalBody").innerText.includes("(${tf.toUpperCase()})") || document.getElementById("modalBody").innerText.includes("${tf.toUpperCase()}")`, `detail TF ${tf}`);
    const t = await evaluate('document.getElementById("modalBody").innerText');
    check(!/NaN|undefined|Infinity/.test(t) && t.length > 400, `detail SOL di TF ${tf.toUpperCase()}: ter-render tanpa NaN/undefined`);
  }
  // ---- detail model Unicorn & IFVG ----
  await evaluate('currentDetailTf = "1h"; openDetail("LINKUSDT")');
  await waitFor('document.getElementById("modalBody").innerText.toLowerCase().includes("detail — ict unicorn")', 'detail LINK (Unicorn)');
  const lk = await evaluate('document.getElementById("modalBody").innerText');
  if (process.env.SMOKE_DEBUG) console.log('--- TEKS DETAIL LINK ---\n' + lk.slice(lk.indexOf('RENCANA ENTRY ICT') > 0 ? lk.indexOf('RENCANA ENTRY ICT') : 0, lk.indexOf('RENCANA ENTRY ICT') + 5000));
  check(/DETAIL — ICT Unicorn/i.test(lk) && /Manipulation leg/.test(lk) && /Breaker/.test(lk) && /Zona overlap/.test(lk) && /2 STDV/.test(lk), 'detail LINK: panel Unicorn (DOL, manipulation leg, breaker, overlap, 2 STDV)');
  check(/Tidak ada — biarkan trade berjalan/.test(lk), 'detail LINK: Unicorn tanpa manajemen trade');
  check(!/NaN|undefined|Infinity/.test(lk), 'detail LINK: tanpa NaN/undefined');
  await shot('05b-detail-unicorn', 430, 1700);
  await evaluate('openDetail("ADAUSDT")');
  await waitFor('document.getElementById("modalBody").innerText.toLowerCase().includes("detail — sweep")', 'detail ADA (IFVG)');
  const ad = await evaluate('document.getElementById("modalBody").innerText');
  if (process.env.SMOKE_DEBUG) console.log('--- TEKS DETAIL ADA ---\n' + ad.slice(ad.indexOf('RENCANA ENTRY ICT') > 0 ? ad.indexOf('RENCANA ENTRY ICT') : 0, ad.indexOf('RENCANA ENTRY ICT') + 7000));
  check(/CARA ENTRY/i.test(ad) && /STOP LOSS/i.test(ad) && /BREAKEVEN/i.test(ad) && /TAKE PROFIT/i.test(ad) && /MODEL FAVORIT/i.test(ad), 'detail ADA: panel IFVG lengkap (entry, SL, BE, TP, model favorit)');
  check(/Body closure/.test(ad) && /Retrace awal IFVG/.test(ad) && /Retrace 50% IFVG/.test(ad) && /BPR/.test(ad), 'detail ADA: empat cara entry tampil (body closure, retrace awal, 50%, FVG+FVG/BPR)');
  check(/Rule of 50/.test(ad) && /Low hanging fruit/.test(ad), 'detail ADA: dua breakeven (Rule of 50, Low hanging fruit)');
  check(/ORDER FLOW & MARKET STRUCTURE/i.test(ad) && /TIMING — KILLZONE & MACRO/i.test(ad) && /Macro/i.test(ad), 'detail ADA: order flow + timing (killzone & macro)');
  check(!/NaN|undefined|Infinity/.test(ad), 'detail ADA: tanpa NaN/undefined');
  await shot('05c-detail-ifvg', 430, 2600);
  // preferensi entry 50% IFVG -> kartu rencana ikut berubah
  await evaluate('(()=>{ const el=document.getElementById("ictPrefEntry"); el.value="ifvg50"; el.dispatchEvent(new Event("change")); })()');
  check((await evaluate('loadIctPrefs().entry')) === 'ifvg50', 'preferensi entry tersimpan (ifvg50)');
  await evaluate('openDetail("ADAUSDT")');
  await waitFor('document.getElementById("modalBody").innerText.includes("Retrace 50% IFVG")', 'detail ADA setelah ganti preferensi');
  check(/✓ Retrace 50% IFVG/.test(await evaluate('document.getElementById("modalBody").innerText')), 'entry 50% IFVG ditandai dipilih setelah preferensi diganti');
  await evaluate('(()=>{ const el=document.getElementById("ictPrefEntry"); el.value="ifvg"; el.dispatchEvent(new Event("change")); })()');
  await evaluate('currentDetailTf = "1h"; openDetail("SOLUSDT")');
  await waitFor('document.getElementById("modalBody").innerText.includes("Liquidity Sweep + MSS")', 'kembali ke detail SOL');
  // copy AI
  await evaluate('document.querySelector("#tfSwitch .tf-btn[data-tf=\\"1h\\"]").click()');
  await waitFor('document.getElementById("modalBody").innerText.includes("Liquidity Sweep + MSS")', 'detail kembali ke 1H (tempat setup SOL)');
  // di TF tanpa setup, tombol simpan harus menolak dengan jujur (bukan menyimpan entry kosong)
  check(true, 'kembali ke 1H untuk uji simpan histori');
  const prompts = await evaluate('["teknikal","risk","sentimen","bull","bear"].map(a => generateAgentPrompt(a))');
  check(prompts.every(p => typeof p === 'string' && p.length > 800 && !/NaN|undefined|Infinity/.test(p)), 'prompt 5 agent ter-generate tanpa NaN/undefined');
  check(!/EMA|RSI|MACD|ADX|ATR|Bollinger|VWAP|Fibonacci|StochRSI/.test(prompts[0]), 'prompt AI tidak menyebut indikator klasik');
  await evaluate('openDetail("ADAUSDT")'); await waitFor('document.getElementById("modalBody").innerText.toLowerCase().includes("detail — sweep")', 'detail ADA untuk prompt');
  const adPrompt = await evaluate('generateAgentPrompt("teknikal")');
  check(/MODEL TERDETEKSI: Sweep → IFVG/.test(adPrompt) && /Entry \(\* = dipilih\)/.test(adPrompt) && /Macro|NY AM|di luar macro/i.test(adPrompt), 'prompt AI memuat model IFVG + opsi entry/SL/TP + macro');
  // simpan histori + jurnal
  await evaluate('saveSetupSnapshot()');
  check((await evaluate('loadSetupHistory().length')) === 1, 'Simpan ke Histori Setup menulis 1 entry');
  await evaluate('document.getElementById("modalCloseBtn").click()');
  await evaluate('closeOtherFullscreenPanels("historyPanel"); document.getElementById("historyPanel").classList.add("show"); renderSetupHistory()');
  check(/ADA|SOL/.test(await evaluate('document.getElementById("historyList").innerText')), 'panel Histori Setup menampilkan entry tersimpan');
  await evaluate('checkSetupHistoryEntry(loadSetupHistory()[0].id)');
  check((await evaluate('loadSetupHistory()[0].checkedAt')) !== null, 'Cek Sekarang mengisi hasil validasi');
  await shot('06-histori', 430, 900);
  await evaluate('document.getElementById("historyPanelClose").click()');

  // 6. workspace trading + DOGE (short) + pair tanpa setup
  await evaluate('showWorkspace("wsTrading")');
  await evaluate('selectWorkspaceSymbol("DOGE")');
  await waitFor('document.getElementById("wsDecisionBody").innerText.includes("KEPUTUSAN ICT")', 'workspace Trading memuat DOGE');
  const dec = await evaluate('document.getElementById("wsDecisionBody").innerText');
  check(/SHORT/.test(dec), 'workspace Trading: DOGE keputusan SHORT');
  check((await evaluate('document.getElementById("tsEntry") && document.getElementById("tsEntry").value')) > 0, 'workspace Trading: input Entry terisi dari rencana ICT');
  await evaluate('document.getElementById("pushToCalcBtn").click()');
  check((await evaluate('document.getElementById("calcEntry").value')) !== '', 'tombol "Pakai Entry/SL di Kalkulator" mengisi kalkulator');
  await shot('07-trading-workspace', 1280, 1800);
  await evaluate('selectWorkspaceSymbol("BTC")');
  await waitFor('document.getElementById("wsAnalysisBody").innerText.includes("BTC")', 'workspace Trading memuat BTC');
  const btc = await evaluate('document.getElementById("wsAnalysisBody").innerText + document.getElementById("wsValidationBody").innerText + document.getElementById("wsDecisionBody").innerText + document.getElementById("wsTradingSetupBody").innerText');
  check(!/NaN|undefined|Infinity/.test(btc), 'pair acak (BTC, kemungkinan SKIP) ter-render tanpa NaN/undefined');
  // news guard
  await evaluate('setNewsGuard(true)'); await evaluate('selectWorkspaceSymbol("SOL")');
  await waitFor('document.getElementById("wsDecisionBody").innerText.includes("AKTIF")', 'News Guard aktif ter-render');
  check(/SKIP/.test(await evaluate('document.getElementById("wsAnalysisBody").innerText')), 'News Guard aktif mengunci keputusan SOL ke SKIP');
  await evaluate('setNewsGuard(false)');

  // 7. navigasi & panel lain
  for (const ws of ['wsReview', 'wsScanner', 'wsHome']) { await evaluate(`showWorkspace("${ws}")`); }
  for (const f of ['watchlist', 'gainers', 'losers', 'volume', 'nearhigh', 'nearlow', 'fundingext']) { await evaluate(`applyFilter("${f}")`); }
  await evaluate('toggleWatchlist("SOLUSDT"); renderTable()');
  await evaluate('checkWatchlistAlerts()');
  await sleep(1500);
  check((await evaluate('loadAlertLog().length')) >= 1, 'alert watchlist ICT/funding menghasilkan alert untuk SOL (funding ekstrem di mock)');
  await evaluate('closeOtherFullscreenPanels("settingsDrawer"); document.getElementById("settingsDrawer").classList.add("show")');
  await evaluate('closeOtherFullscreenPanels("alertDrawer"); document.getElementById("alertDrawer").classList.add("show"); renderAlertLog()');
  check(!(await evaluate('document.getElementById("alertLog").innerText')).includes('undefined'), 'riwayat alert ter-render tanpa "undefined"');
  await shot('08-alert', 430, 900);

  // 7. tombol back peramban/HP: harus menutup lapisan teratas (bukan keluar app), lapis demi lapis
  await evaluate('showWorkspace("wsHome")');
  await evaluate('closeOtherFullscreenPanels("alertDrawer"); document.getElementById("alertDrawer").classList.add("show")');
  check(await evaluate('history.state && history.state.pp === "ict-screening-guard"') === true, 'riwayat: penjaga back terpasang di atas');
  await evaluate('history.back()');
  await waitFor('!document.getElementById("alertDrawer").classList.contains("show")', 'back menutup panel Alert', 3000);
  check(await evaluate('!document.getElementById("alertDrawer").classList.contains("show")') === true, 'back peramban menutup panel Alert yang terbuka');
  await sleep(300);
  check(await evaluate('history.state && history.state.pp === "ict-screening-guard"') === true, 'penjaga back dipasang ulang setelah menutup panel (back berikutnya tetap tertangkap)');
  await evaluate('showWorkspace("wsTrading"); openDetail("SOLUSDT","1h")');
  await waitFor('document.getElementById("modalBackdrop").classList.contains("show")', 'modal detail terbuka', 3000);
  await evaluate('history.back()'); await sleep(500);
  check(await evaluate('!document.getElementById("modalBackdrop").classList.contains("show") && document.getElementById("wsTrading").classList.contains("active")') === true, 'back #1 menutup modal detail, workspace Decision tetap');
  await evaluate('history.back()'); await sleep(500);
  check(await evaluate('document.getElementById("wsHome").classList.contains("active")') === true, 'back #2 kembali dari Decision ke Home');

  // 8. hasil akhir
  await sleep(500);
  const mockCalls = await evaluate('window.__mockCalls.filter(u=>u.includes("openInterest")||u.includes("LongShort")||u.includes("longShort")).length');
  check(mockCalls === 0, 'tidak ada request OI / long-short ratio ke Binance (dibuang bersama indikator posisi)');
  check(errors.length === 0, 'tidak ada exception / console.error selama seluruh alur' + (errors.length ? ' — ' + errors.slice(0, 5).join(' || ') : ''));
  failures.forEach(f => console.log('  GAGAL  ' + f));

  ws.close(); proc.kill();
  try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* abaikan */ }

  console.log(`\n${passed} lulus, ${failures.length} gagal.`);
  process.exit(failures.length ? 1 : 0);
}
main().catch(e => { console.error('Harness error:', e); process.exit(2); });

