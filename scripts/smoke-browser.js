'use strict';
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{let f=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(req.url==='/')f=path.join(root,'index.html');if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',f.endsWith('.js')?'application/javascript':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':'image/png');res.end(fs.readFileSync(f));});
const prices=[8,9,10,12,10,9,8,9,10,11,10,9,9.5,10,11,12,13,15,13,12,11,12,13];
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
        else if(u.searchParams.get('interval')==='1m')data=Array.from({length:Number(u.searchParams.get('limit'))},(_,i)=>{const t=now-(Number(u.searchParams.get('limit'))-1-i)*60000;return [t,10,11,9,10,1,t+59999,10];});
        else data=prices.map((p,i)=>{const t=now-(prices.length-i)*3600000;return [t,p,p+.2,p-.2,p,10,t+3599999,100];});
        await route.fulfill({json:data});
      });
      await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>MalomoMarket.getTickers().length===2);
      const nav=async ws=>{if(viewport.width<700)await page.locator('#hamburgerBtn').click();await page.locator(`[data-ws="${ws}"]`).first().click();};
      await nav('wsScanner');assert(await page.locator('#tbody .coin-row').count()===2);
      await page.locator('#tbody .crow-star').first().click();assert.equal(await page.evaluate(()=>MalomoStore.read('watchlist').length),1);
      await page.locator('#searchBox').fill('BTC');assert.equal(await page.locator('#tbody .coin-row').count(),1);await page.locator('#searchBox').fill('');
      await page.locator('#tbody .coin-row').first().click();await page.waitForFunction(()=>document.getElementById('modalBody').textContent.includes('Protected swing'));
      assert((await page.locator('#modalBody').innerText()).includes('ATR14 / RVOL20'));await page.locator('#mhStarBtn').click();await page.locator('#modalCloseBtn').click();
      await nav('wsHome');await page.locator('#modeIntradayBtn').click();await page.waitForFunction(()=>window.lastMalomoScan);assert.equal(await page.locator('#modeResultsList .coin-row').count(),2);await page.locator('#modeResultsClose').click();
      await nav('wsReview');await page.locator('#journalAddBtn').click();await page.locator('#jfSymbol').fill('BTC');await page.locator('#jfEntry').fill('10');await page.locator('#jfSl').fill('9');await page.locator('#jfPnlUsd').fill('5');await page.locator('#jfNotes').fill('<b>catatan pengguna</b>');await page.locator('#journalForm button[type="submit"]').click();assert.equal(await page.locator('#journalList .journal-entry').count(),1);assert.equal(await page.locator('#journalList .je-notes b').count(),0);
      await nav('wsTrading');await page.locator('#calcBalance').fill('1000');await page.locator('#calcRiskPct').fill('1');await page.locator('#calcEntry').fill('10');await page.locator('#calcSl').fill('9');await page.locator('#calcRunBtn').click();assert((await page.locator('#calcResult').innerText()).includes('10'));
      await nav('wsHome');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'page must not overflow horizontally');
      if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR,viewport.width+'.png'),fullPage:true,animations:'disabled'});}
      assert.deepEqual(errors,[]);console.log('PASS browser '+viewport.width+'px: navigation, market, watchlist, search, detail, scanner, journal, calculator, responsive width');await context.close();
    }
  }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
