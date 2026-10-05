/* Data pasar pelengkap per pair: OI, rasio long/short, taker buy/sell, orderbook, CVD, ADX, volume.
   HANYA tampilan — tidak pernah masuk penilaian engine Malomo. Dikumpulkan lengkap dulu supaya nanti
   bisa disaring mana yang benar-benar bermanfaat setelah engine teruji. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MalomoMarketData=api;})(globalThis,function(){
  'use strict';
  const STALE=300000; // data per-pair yang perlu request diperbarui tiap 5 menit, atau saat Refresh
  const STORE_KEY='malomo_market_data';
  // ADX Wilder periode 14 beserta +DI/−DI candle terakhir.
  function adx(c,n=14){
    if(!Array.isArray(c)||c.length<2*n+1)return null;
    let sTR=0,sP=0,sM=0;const dx=[];
    for(let i=1;i<c.length;i++){
      const up=c[i].high-c[i-1].high,down=c[i-1].low-c[i].low;
      const p=up>down&&up>0?up:0,m=down>up&&down>0?down:0;
      const t=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));
      if(i<=n){sTR+=t;sP+=p;sM+=m;if(i<n)continue;}
      else{sTR=sTR-sTR/n+t;sP=sP-sP/n+p;sM=sM-sM/n+m;}
      const pdi=sTR>0?100*sP/sTR:0,mdi=sTR>0?100*sM/sTR:0,sum=pdi+mdi;
      dx.push({dx:sum>0?100*Math.abs(pdi-mdi)/sum:0,pdi,mdi});
    }
    if(dx.length<n)return null;
    let a=dx.slice(0,n).reduce((s,x)=>s+x.dx,0)/n;
    for(let i=n;i<dx.length;i++)a=(a*(n-1)+dx[i].dx)/n;
    const last=dx[dx.length-1];
    return {adx:a,plusDI:last.pdi,minusDI:last.mdi};
  }
  // CVD dari candle: tiap candle menyumbang (taker buy − taker sell) = 2 × taker buy quote − quote volume.
  function cvd(c,count){
    const w=(c||[]).slice(-count);
    if(w.length<count||w.some(x=>!Number.isFinite(x.takerBuyQuote)||!Number.isFinite(x.quoteVolume)))return null;
    return w.reduce((s,x)=>s+2*x.takerBuyQuote-x.quoteVolume,0);
  }
  function depth(book){
    const bids=book?.bids||[],asks=book?.asks||[];
    if(!bids.length||!asks.length)return null;
    const sum=a=>a.reduce((s,x)=>s+parseFloat(x[0])*parseFloat(x[1]),0);
    const bidUsd=sum(bids),askUsd=sum(asks),bid=parseFloat(bids[0][0]),ask=parseFloat(asks[0][0]);
    if(!(bidUsd+askUsd>0))return null;
    return {bidUsd,askUsd,bidPct:100*bidUsd/(bidUsd+askUsd),spreadPct:bid>0?100*(ask-bid)/bid:null};
  }
  // Metrik yang dihitung dari candle hasil scan (tanpa request tambahan).
  function metrics(evaluation){
    const frames=evaluation?.frames||{};
    return {adx4h:adx(frames['4h']?.candles),cvd24h:cvd(frames['1h']?.candles,24),cvd1h:cvd(frames['1h']?.candles,1)};
  }
  function parse(res){
    const [oi,accounts,top,taker,book]=res,d={};
    if(Array.isArray(oi)&&oi.length){
      const last=+oi[oi.length-1].sumOpenInterestValue,first=+oi[0].sumOpenInterestValue;
      if(last>0){d.oiUsd=last;d.oiChange24h=first>0?100*(last/first-1):null;}
    }
    const ratio=x=>Array.isArray(x)&&x[0]&&Number.isFinite(+x[0].longShortRatio)?{ratio:+x[0].longShortRatio,longPct:100*+x[0].longAccount}:null;
    d.accounts=ratio(accounts);d.topPositions=ratio(top);
    d.taker=Array.isArray(taker)&&taker[0]&&Number.isFinite(+taker[0].buySellRatio)?{ratio:+taker[0].buySellRatio}:null;
    d.book=depth(book);
    return d;
  }
  // ----- bagian browser: pengambilan dan penyimpanan -----
  let store=null,running=null,forcedAt=0;
  function load(){
    if(store)return store;
    try{store=JSON.parse(localStorage.getItem(STORE_KEY)||'{}')||{};}catch{store={};}
    return store;
  }
  function save(){try{localStorage.setItem(STORE_KEY,JSON.stringify(store));}catch{/* penyimpanan penuh: data tetap ada di memori */}}
  function get(symbol){return load()[symbol]||null;}
  async function fetchOne(symbol){
    const q='?symbol='+encodeURIComponent(symbol),request=globalThis.MalomoMarket.request;
    const safe=path=>request(path).catch(()=>null);
    const res=await Promise.all([
      safe('/futures/data/openInterestHist'+q+'&period=1h&limit=25'),
      safe('/futures/data/globalLongShortAccountRatio'+q+'&period=5m&limit=1'),
      safe('/futures/data/topLongShortPositionRatio'+q+'&period=5m&limit=1'),
      safe('/futures/data/takerlongshortRatio'+q+'&period=5m&limit=1'),
      safe('/fapi/v1/depth'+q+'&limit=20'),
    ]);
    return Object.assign(parse(res),{at:Date.now()});
  }
  // Refresh tombol: semua data yang diambil sebelum saat ini dianggap usang pada putaran berikutnya.
  function invalidate(){forcedAt=Date.now();}
  function refresh(symbols,onUpdate){
    if(running)return running;
    load();
    running=(async()=>{
      for(const symbol of symbols){
        const old=store[symbol];
        if(old&&Date.now()-old.at<STALE&&old.at>=forcedAt)continue;
        try{store[symbol]=await fetchOne(symbol);if(onUpdate)onUpdate(symbol);}catch{/* dicoba lagi pada putaran berikutnya */}
      }
      save();
    })().finally(()=>{running=null;});
    return running;
  }
  // Satu pair (detail): ambil bila belum ada atau sudah usang, tanpa menunggu putaran daftar.
  async function ensure(symbol){
    load();const old=store[symbol];
    if(old&&Date.now()-old.at<STALE&&old.at>=forcedAt)return old;
    store[symbol]=await fetchOne(symbol);save();return store[symbol];
  }
  return {adx,cvd,depth,metrics,parse,get,refresh,ensure,invalidate,fetchOne,isRunning:()=>!!running};
});
