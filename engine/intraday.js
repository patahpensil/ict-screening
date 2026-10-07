/* Mesin sinyal breakout INTRADAY (intraday-v1): fungsi murni, kausal, tanpa DOM/jaringan/order.
   Pondasi sama dengan breakout swing (engine/trend.js), timeframe pemilik: arah 4H, pengelolaan 1H.
   Aturan = skrip uji research/intraday-4h-1h-2026-10-08/intraday.js (L=55):
   close 4H di atas high 55 candle 4H sebelumnya → LONG, di bawah low 55 → SHORT; SL = entry ∓ 2 × ATR20 1H (Wilder);
   keluar saat close 1H menembus low/high 20 candle 1H sebelumnya; risiko 0,5%; maks 5 posisi per arah. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?module.require('./trend'):root.Trend);if(typeof module==='object'&&module.exports)module.exports=api;else root.Intraday=api;})(typeof globalThis!=='undefined'?globalThis:this,function(T){
  'use strict';
  const RULES=Object.freeze({
    prefilter:250,     // kandidat awal menurut volume 24 jam
    universe:100,      // Top 100 menurut quote volume 30 hari (180 candle 4H sebelum candle sinyal)
    entryLookback:55,  // breakout 55 candle 4H
    exitLookback:20,   // exit 20 candle 1H
    atrLength:20,      // N = ATR 20 candle 1H (Wilder)
    slAtr:2,
    riskPct:0.5,
    maxPerSide:5,      // slot terpisah dari swing
    maxDrawdown:0.20,
    volumeBars:180,
    min4h:181,         // volume 30 hari butuh 180 candle 4H sebelum candle sinyal
    min1h:21,          // ATR20 1H
  });
  // Uji Sep 2024 – Okt 2026: +0,11R/trade (2.795 trade) tetapi tahun kedua −0,01R, DD 29% → belum lulus.
  const VALIDATION=Object.freeze({stage:'PAPER',note:'uji 2024–2026: tahun kedua rugi, drawdown 29% melewati batas 20%'});
  function volume30(c,i){let v=0;for(let k=Math.max(0,i-RULES.volumeBars);k<i;k++)v+=Number(c[k].quoteVolume)||0;return v;}
  // Tahap 1 (murah, hanya 4H): arah breakout dan volume 30 hari untuk memilih Top 100.
  function evaluate4h(raw4h,options={}){
    const now=options.now??Date.now(),c=T.closed(raw4h,now);
    if(c.length<RULES.min4h)return {engine:'intraday-v1',candles:c,side:null,volume30:null,status:'data 4H kurang dari '+RULES.min4h+' candle'};
    const i=c.length-1,x=c[i],L=RULES.entryLookback,high55=T.highBefore(c,i,L),low55=T.lowBefore(c,i,L);
    return {engine:'intraday-v1',candles:c,last:x.close,signalAt:x.ct,high55,low55,side:x.close>high55?'long':x.close<low55?'short':null,
      distLong:100*(x.close-high55)/x.close,distShort:100*(low55-x.close)/x.close,volume30:volume30(c,i)};
  }
  // Tahap 2: SL dan level exit dari candle 1H.
  function evaluate(raw4h,raw1h,options={}){
    const now=options.now??Date.now(),e=evaluate4h(raw4h,options);
    if(e.volume30==null)return Object.assign(e,{plan:null,decision:'SKIP'});
    const h=T.closed(raw1h,now);
    if(h.length<RULES.min1h)return Object.assign(e,{candles1h:h,plan:null,decision:'SKIP',status:'data 1H kurang dari '+RULES.min1h+' candle'});
    const j=h.length-1,N=T.atr(h,RULES.atrLength)[j],X=RULES.exitLookback;
    const exitLong=T.lowBefore(h,j+1,X),exitShort=T.highBefore(h,j+1,X);
    const entry=Number.isFinite(options.lastPrice)&&options.lastPrice>0?options.lastPrice:e.last;
    let plan=null;
    if(e.side&&N>0){
      const long=e.side==='long',risk=RULES.slAtr*N,sl=long?entry-risk:entry+risk;
      if(!long||sl>0)plan={entry,sl,initialSl:sl,risk,atr:N,tp:null,rr:null,signalClose:e.last,signalAt:e.signalAt,
        exitLevel:long?exitLong:exitShort,breakoutLevel:long?e.high55:e.low55,stage:VALIDATION.stage,style:'intraday'};
    }
    const fmt=v=>(v>=0?'+':'')+v.toFixed(1)+'%';
    const status=e.side?(plan?'breakout '+e.side.toUpperCase()+' 55 candle 4H':'breakout tanpa rencana valid')
      :'pantau · jarak ke breakout LONG '+fmt(e.distLong)+' · SHORT '+fmt(e.distShort);
    return Object.assign(e,{candles1h:h,atr:N,atrPct:N>0?100*N/e.last:null,exitLong,exitShort,plan,decision:plan?e.side.toUpperCase():'SKIP',status});
  }
  // Exit 20 candle 1H: candle 1H yang close SESUDAH fill dan menembus low (LONG) / high (SHORT) 20 candle sebelumnya.
  function exitSignal(record,candles1h){
    if(!record||record.status!=='running'||record.engine!=='intraday-v1')return null;
    const c=candles1h||[],since=record.filledAt||record.runningAt||0,long=record.side==='long',X=RULES.exitLookback;
    for(let i=X;i<c.length;i++){
      if(!(c[i].ct>since))continue;
      if(long?c[i].close<T.lowBefore(c,i,X):c[i].close>T.highBefore(c,i,X))return {price:c[i].close,at:c[i].ct};
    }
    return null;
  }
  function topByVolume30(rows){return rows.slice().sort((a,b)=>b.evaluation.volume30-a.evaluation.volume30||a.symbol.localeCompare(b.symbol)).slice(0,RULES.universe);}
  return Object.freeze({RULES,VALIDATION,volume30,evaluate4h,evaluate,exitSignal,topByVolume30});
});
