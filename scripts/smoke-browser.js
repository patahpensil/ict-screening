'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(req.url==='/')f=path.join(root,'index.html');if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':'image/png');res.end(fs.readFileSync(f));});
const prices=[8,9,10,12,10,9,8,9,10,11,10,9,9.5,10,11,12,13,15,13,12,11,12,13];
// 320 candle 1D: BTC tren naik, ETH tren turun; close terakhir 13 agar sama dengan harga ticker.
const daily=(sym,now)=>{const dir=sym==='BTCUSDT'?1:-1,n=320;return Array.from({length:n},(_,i)=>{const p=13*Math.exp(dir*0.004*(i-(n-1)))*(1+0.02*Math.sin((i-(n-1))/5));const t=now-(n-i)*86400000;return [t,p,p*1.01,p*0.99,p,10,t+86399999,100,0,0,60];});};
(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined,args:['--no-sandbox']});
  try{
    for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
      const context=await browser.newContext({viewport,serviceWorkers:'block'}),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>{window.WebSocket=class{constructor(){this.readyState=1;}close(){this.readyState=3;}};});
      await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
      await page.route('https://fapi.binance.com/**',async route=>{
        const u=new URL(route.request().url()),now=Math.floor(Date.now()/60000)*60000;let data;
        if(u.pathname.endsWith('exchangeInfo'))data={symbols:['BTCUSDT','ETHUSDT'].map(symbol=>({symbol,quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'}]}))};
        else if(u.pathname.endsWith('24hr'))data=['BTCUSDT','ETHUSDT'].map(symbol=>({symbol,lastPrice:13,priceChangePercent:symbol==='BTCUSDT'?1:-1,highPrice:15,lowPrice:8,quoteVolume:1000000}));
        else if(u.pathname.endsWith('premiumIndex'))data=['BTCUSDT','ETHUSDT'].map(symbol=>({symbol,lastFundingRate:0.0001}));
        else if(u.searchParams.get('interval')==='1d')data=daily(u.searchParams.get('symbol'),now);
        else if(u.searchParams.get('interval')==='1m')data=Array.from({length:Number(u.searchParams.get('limit'))},(_,i)=>{const t=now-(Number(u.searchParams.get('limit'))-1-i)*60000;return [t,10,11,9,10,1,t+59999,10];});
        else data=prices.map((p,i)=>{const t=now-(prices.length-i)*3600000;return [t,p,p+.2,p-.2,p,10,t+3599999,100];});
        await route.fulfill({json:data});
      });
      await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>MalomoMarket.getTickers().length===2);
      const nav=async ws=>{if(viewport.width<700)await page.locator('#hamburgerBtn').click();await page.locator(`[data-ws="${ws}"]`).first().click();};
      await nav('wsScanner');assert(await page.locator('#tbody .coin-row').count()===2);
      await page.locator('#tbody .crow-star').first().click();assert.equal(await page.evaluate(()=>MalomoStore.read('watchlist').length),1);
      await page.locator('#searchBox').fill('BTC');assert.equal(await page.locator('#tbody .coin-row').count(),1);await page.locator('#searchBox').fill('');
      await page.locator('#tbody .coin-row').first().click();await page.waitForFunction(()=>document.getElementById('modalBody').textContent.includes('SKOR TREN CARVER'));
      const modal=await page.locator('#modalBody').innerText();for(const part of ['EWMAC 8/32','Breakout 160','Gabungan','RISIKO & TRAILING STOP','DATA PASAR'])assert(modal.includes(part),'detail tanpa '+part);await page.locator('#mhStarBtn').click();await page.locator('#modalCloseBtn').click();
      await nav('wsHome');await page.locator('#modeIntradayBtn').click();await page.waitForFunction(()=>window.lastMalomoScan&&document.querySelectorAll('#modeResultsList .scan-card').length===2);
      assert((await page.locator('#modeResultsList .scan-col').nth(0).innerText()).includes('BTC'));assert((await page.locator('#modeResultsList .scan-col').nth(1).innerText()).includes('ETH'));assert((await page.locator('#modeResultsList').innerText()).includes('SINYAL PAPER'));assert((await page.locator('#modeResultsList').innerText()).includes('jangan dieksekusi'));assert.equal((await page.locator('#modeResultsClose').innerText()).trim(),'← Back');assert.equal((await page.locator('#scanRefreshBtn').innerText()).trim(),'⟳ Refresh');assert.deepEqual((await page.locator('#modeResultsList .scan-col-head').allInnerTexts()).map(t=>t.split(' ')[0]),['LONG','SHORT']);assert((await page.locator('#modeResultsList .md-chip').count())>0,'banner data pasar tidak tampil');await page.locator('#modeResultsClose').click();
      // Dibuka lagi: hasil terakhir tampil seketika (tanpa menunggu scan ulang) dan tersimpan untuk pembukaan berikutnya.
      await page.locator('#modeIntradayBtn').click();assert.equal(await page.locator('#modeResultsList .scan-card').count(),2);assert.equal(await page.evaluate(()=>MalomoStore.read('lastScan',null).candidates.length),2);await page.locator('#modeResultsClose').click();
      // Scan membuat rencana ARMED (BTC LONG, ETH SHORT) di harga ticker 13; tick berikutnya menyentuh entry.
      await page.waitForFunction(()=>MalomoStore.read('tracks').filter(r=>r.engine==='trend-v1').length===2);
      await page.evaluate(()=>MalomoApp.refresh());
      await page.waitForFunction(()=>MalomoStore.read('tracks').filter(r=>r.status==='running').length===2);
      // Jurnal otomatis: setiap pair yang menyentuh entry langsung tercatat (status open).
      let auto=await page.evaluate(()=>MalomoStore.read('journal').filter(e=>e.auto));
      assert.equal(auto.length,2);assert(auto.every(e=>e.status==='open'&&e.setup.startsWith('Tren Carver')&&e.setup.endsWith('PAPER')&&e.notes.startsWith('PAPER')&&Number(e.entry)===13));
      await nav('wsDecision');await page.waitForFunction(()=>document.querySelectorAll('#decisionList .dec-card').length===2);
      const card=await page.locator('#decisionList .dec-card').first().innerText();
      for(const part of ['RUNNING','TRAILING STOP','ENTRY','STOP AWAL','OPEN INTEREST','CVD (TAKER)','ORDERBOOK','SKOR TREN 1D','Tren Carver','PAPER'])assert(card.includes(part),'kartu Decision tanpa '+part);
      assert.equal(await page.locator('#decisionCount').innerText(),'2');
      // Trailing stop BTC dinaikkan ke atas harga: posisi selesai dalam untung dan entri jurnal yang sama diperbarui.
      await page.evaluate(()=>{const t=MalomoStore.read('tracks');for(const r of t)if(r.symbol==='BTCUSDT')r.sl=14;MalomoStore.write('tracks',t);});
      await page.evaluate(()=>MalomoApp.refresh());
      await page.waitForFunction(()=>MalomoStore.read('journal').some(e=>e.auto&&e.symbol==='BTCUSDT'&&e.status==='win'));
      auto=await page.evaluate(()=>MalomoStore.read('journal').filter(e=>e.auto));
      assert.equal(auto.length,2,'entri jurnal harus diperbarui, bukan diduplikasi');
      const btc=auto.find(e=>e.symbol==='BTCUSDT');assert.equal(Number(btc.exit),14);assert(btc.notes.includes('trailing stop'));assert.equal(auto.find(e=>e.symbol==='ETHUSDT').status,'open');
      assert.equal(await page.evaluate(()=>MalomoStore.read('tracks').filter(r=>r.status==='running').length),1);
      assert(await page.evaluate(()=>!!MalomoStore.read('trendResets',{})['BTCUSDT|long']),'BTC harus menunggu sinyal baru setelah keluar');
      await page.evaluate(()=>MalomoStore.write('tracks',[]));
      const journalBefore=await page.evaluate(()=>MalomoStore.read('journal').length);
      await nav('wsReview');await page.locator('#journalAddBtn').click();await page.locator('#jfSymbol').fill('BTC');await page.locator('#jfEntry').fill('10');await page.locator('#jfSl').fill('9');await page.locator('#jfPnlUsd').fill('5');await page.locator('#jfNotes').fill('<b>catatan pengguna</b>');await page.locator('#journalForm button[type="submit"]').click();assert.equal(await page.locator('#journalList .journal-entry').count(),journalBefore+1);assert.equal(await page.locator('#journalList .je-notes b').count(),0);
      await nav('wsTrading');await page.locator('#calcBalance').fill('1000');await page.locator('#calcRiskPct').fill('1');await page.locator('#calcEntry').fill('10');await page.locator('#calcSl').fill('9');await page.locator('#calcRunBtn').click();assert((await page.locator('#calcResult').innerText()).includes('10'));
      await nav('wsHome');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'page must not overflow horizontally');
      if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,viewport.width+'.png'),fullPage:true,animations:'disabled'});}
      assert.deepEqual(errors,[]);console.log('PASS browser '+viewport.width+'px: navigation, market, watchlist, search, detail skor tren, scan LONG/SHORT, entry→RUNNING→jurnal otomatis, trailing stop→jurnal diperbarui, Decision, calculator, responsive width');await context.close();
    }
    const offlineContext=await browser.newContext(),offlinePage=await offlineContext.newPage();
    await offlinePage.addInitScript(()=>{window.WebSocket=class{constructor(){this.readyState=1;}close(){this.readyState=3;}};});
    await offlinePage.route('https://fapi.binance.com/**',r=>r.fulfill({status:503,body:'Unavailable'}));
    await offlinePage.route('https://fonts.googleapis.com/**',r=>r.abort());
    await offlinePage.goto('http://127.0.0.1:'+server.address().port);
    await offlinePage.waitForFunction(async()=>navigator.serviceWorker.controller&&await caches.has('ict-screening-v95'));
    await offlinePage.waitForFunction(async()=>{const c=await caches.open('ict-screening-v95');return !!await c.match('./app/main.js');});
    // `controller` bisa sudah terisi sebelum service worker siap menangani navigasi; tanpa menunggu
    // `ready`, reload offline kadang lolos dari service worker dan gagal (flaky di CI dan Chrome lokal).
    await offlinePage.evaluate(()=>navigator.serviceWorker.ready.then(()=>true));
    await offlineContext.setOffline(true);await offlinePage.reload();
    await offlinePage.waitForFunction(()=>typeof MalomoApp==='object'&&document.getElementById('sidebarEngineStatus').textContent.includes('Tren'));
    assert.equal(await offlinePage.evaluate(()=>typeof Trend.evaluate),'function');
    console.log('PASS PWA: every new module loads offline from shell cache');await offlineContext.close();
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
