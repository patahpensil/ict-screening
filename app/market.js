/* Binance public USD-M transport and shared PRD scanner. */
(function(root){
  'use strict';
  const base='https://fapi.binance.com',minute=60000;
  const cache=new Map(),pending=new Map();let tail=Promise.resolve(),cooldown=0;
  let metadataAt=0,symbols=new Map(),tickers=[],socket=null,reconnect=null,alive=0,clockOffset=0;
  const listeners=new Set();
  // Status "candle sudah close" dibandingkan dengan jam server Binance, bukan jam perangkat:
  // jam PC yang lebih cepat beberapa detik akan membuat candle yang masih berjalan terbaca close.
  const serverNow=()=>Date.now()+clockOffset;
  const notify=()=>listeners.forEach(fn=>fn(tickers));
  async function request(path){
    const start=tail.then(()=>new Promise(resolve=>setTimeout(resolve,200)));
    tail=start.catch(()=>{});await start;
    for(let attempt=0;attempt<3;attempt++){
      if(cooldown>Date.now())await new Promise(resolve=>setTimeout(resolve,cooldown-Date.now()));
      const res=await fetch(base+path,{signal:AbortSignal.timeout(20000),cache:'no-store'});
      if(res.status===429||res.status===418){cooldown=Date.now()+Math.max(3000,Number(res.headers.get('Retry-After')||0)*1000)*(attempt+1);continue;}
      if(!res.ok)throw new Error('Binance HTTP '+res.status);
      return res.json();
    }
    throw new Error('Binance rate limit; coba ulang setelah jeda.');
  }
  const TF_MS={'1m':60000,'5m':300000,'15m':900000,'1h':3600000,'4h':14400000,'1d':86400000};
  // Engine hanya memakai candle yang sudah close, dan candle close tidak pernah berubah. Jadi data satu
  // timeframe tetap berlaku sampai candle yang sedang berjalan close: 1D diunduh ulang sekali sehari,
  // 4H tiap 4 jam, 1H tiap jam, 1m tiap menit. Scan ulang cukup mengambil data yang memang berubah.
  async function cachedCandles(key,tf,fetchRows){
    const value=cache.get(key);if(value&&serverNow()<value.until)return value.data;
    if(pending.has(key))return pending.get(key);
    const job=fetchRows().then(all=>{
      const now=serverNow(),data=Trend.closed(all,now);
      const lastCt=all.reduce((m,c)=>Math.max(m,Number(c.ct)||0),0);
      const until=(lastCt>now?lastCt:lastCt+(TF_MS[tf]||60000))+1000;
      cache.delete(key);cache.set(key,{data,until});
      if(cache.size>2000)cache.delete(cache.keys().next().value);
      return data;
    }).finally(()=>pending.delete(key));
    pending.set(key,job);return job;
  }
  async function syncClock(){
    const sent=Date.now(),res=await request('/fapi/v1/time'),received=Date.now();
    if(Number.isFinite(res?.serverTime))clockOffset=res.serverTime-(sent+received)/2;
  }
  function normalize(r){return {symbol:r.symbol,lastPrice:Number(r.lastPrice),priceChangePercent:Number(r.priceChangePercent),highPrice:Number(r.highPrice),lowPrice:Number(r.lowPrice),quoteVolume:Number(r.quoteVolume),fundingRate:Number(r.fundingRate||0)};}
  async function refresh(){
    if(!symbols.size||Date.now()-metadataAt>300000){const info=await request('/fapi/v1/exchangeInfo');symbols=new Map(info.symbols.filter(s=>s.quoteAsset==='USDT'&&s.contractType==='PERPETUAL'&&s.status==='TRADING').map(s=>[s.symbol,s]));metadataAt=Date.now();await syncClock();}
    const [raw,funding]=await Promise.all([request('/fapi/v1/ticker/24hr'),request('/fapi/v1/premiumIndex')]);
    const rates=new Map(funding.map(x=>[x.symbol,Number(x.lastFundingRate)]));
    tickers=raw.filter(r=>symbols.has(r.symbol)).map(r=>normalize(Object.assign({},r,{fundingRate:rates.get(r.symbol)})));
    notify();return tickers;
  }
  function connect(){
    if(socket&&[0,1].includes(socket.readyState))return;
    socket=new WebSocket('wss://fstream.binance.com/market/stream?streams=!ticker@arr/!markPrice@arr@1s');
    const current=socket;alive=0;
    current.onmessage=evt=>{
      try{
        const msg=JSON.parse(evt.data);if(!Array.isArray(msg.data))return;
        alive=Date.now();const map=new Map(tickers.map(x=>[x.symbol,x]));
        for(const r of msg.data){const row=map.get(r.s);if(!row)continue;
          if(msg.stream==='!ticker@arr')Object.assign(row,{lastPrice:Number(r.c),quoteVolume:Number(r.q),priceChangePercent:Number(r.P),highPrice:Number(r.h),lowPrice:Number(r.l)});
          else if(msg.stream==='!markPrice@arr@1s')row.fundingRate=Number(r.r);
        }
        notify();
      }catch{/* invalid transport payload cannot change strategy */}
    };
    current.onerror=()=>current.close();
    current.onclose=()=>{if(socket===current){clearTimeout(reconnect);reconnect=setTimeout(connect,3000);}};
    const watchdog=setInterval(()=>{if(socket!==current){clearInterval(watchdog);return;}if(!alive||Date.now()-alive>20000)current.close();},25000);
  }
  async function candles(symbol,tf,limit=400){
    return cachedCandles(symbol+'|'+tf+'|'+limit,tf,async()=>{
      const rows=await request('/fapi/v1/klines?symbol='+encodeURIComponent(symbol)+'&interval='+tf+'&limit='+limit);
      return rows.map(k=>({t:k[0],open:Number(k[1]),high:Number(k[2]),low:Number(k[3]),close:Number(k[4]),volume:Number(k[5]),ct:k[6],quoteVolume:Number(k[7]),takerBuyQuote:Number(k[10])}));
    });
  }
  function tickSize(symbol){const f=(symbols.get(symbol)?.filters||[]).find(x=>x.filterType==='PRICE_FILTER');return f?Number(f.tickSize):null;}
  // Candle 1D untuk breakout 55/20: 400 candle agar ATR Wilder sudah stabil (sama dengan riwayat panjang di riset).
  async function evaluate(symbol){
    const d=await candles(symbol,'1d',400),t=tickers.find(x=>x.symbol===symbol);
    return Trend.evaluate(d,{now:serverNow(),lastPrice:t?.lastPrice,tickSize:tickSize(symbol)});
  }
  async function scan(options={}){
    const progress=options.progress||(()=>{});
    const cancelled=options.cancelled||(()=>false);
    if(!tickers.length)await refresh();
    const universe=Trend.rankUniverse(tickers),rows=[],errors=[];let i=0,done=0;
    async function worker(){
      while(i<universe.length&&!cancelled()){
        const row=universe[i++];
        try{
          const d=await candles(row.symbol,'1d',400);
          const evaluation=Trend.evaluate(d,{now:serverNow(),lastPrice:row.lastPrice,tickSize:tickSize(row.symbol)});
          if(evaluation.candles.length>=Trend.RULES.minCandles)rows.push({symbol:row.symbol,quoteVolume:row.quoteVolume,evaluation});
        }catch(e){errors.push({symbol:row.symbol,error:e.message});}
        progress(++done,universe.length);
      }
    }
    await Promise.all([worker(),worker(),worker()]);
    // Universe akhir: Top 100 menurut quote volume 30 hari dari candle 1D (urutan = prioritas slot).
    const candidates=Trend.topByVolume30(rows);
    return {at:Date.now(),universe:universe.map(x=>x.symbol),candidates,errors};
  }
  root.MalomoMarket={refresh,connect,candles,evaluate,scan,request,subscribe:fn=>listeners.add(fn),getTickers:()=>tickers,serverNow,getLive:()=>alive>0&&Date.now()-alive<20000};
})(globalThis);
