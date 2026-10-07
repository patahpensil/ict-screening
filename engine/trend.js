/* Mesin sinyal breakout 55/20 (turtle-v1): fungsi murni, kausal, tanpa DOM/jaringan/order.
   Aturan sama persis dengan simulasi riset research/turtle-v1-2026-10-07/turtle-portfolio.js (docs/PRD_TURTLE_V1.md):
   close 1D di atas high 55 hari sebelumnya → LONG, di bawah low 55 hari → SHORT; SL = entry ∓ 2 × ATR20 (Wilder);
   keluar saat close 1D menembus low/high 20 hari sebelumnya; risiko 0,5% modal; maks 5 posisi per arah. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Trend=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RULES=Object.freeze({
    prefilter:250,     // kandidat awal menurut volume 24 jam; universe akhir dipilih dari volume 30 hari
    universe:100,      // Top 100 menurut quote volume 30 hari (dari candle 1D)
    entryLookback:55,  // breakout 55 hari
    exitLookback:20,   // exit 20 hari
    atrLength:20,      // N = ATR 20 hari (Wilder)
    slAtr:2,           // SL = entry ∓ 2 × N
    riskPct:0.5,       // risiko per trade (% modal)
    maxPerSide:5,      // maks posisi terbuka per arah
    maxDrawdown:0.20,  // drawdown jurnal ≥ 20% → sinyal baru dihentikan
    volumeDays:30,
    minCandles:57,     // simulasi riset butuh indeks ≥ 56 dan ATR tersedia
  });
  // Tahap validasi. Uji akhir Sep 2019 – Des 2021 (kriteria dikunci sebelum dijalankan): 98 trade, +1,39R per trade,
  // tetapi drawdown harian 24% > batas 20% → belum lulus. Status eksekusi menunggu keputusan pemilik.
  const VALIDATION=Object.freeze({stage:'PAPER',note:'uji akhir 2019–2021: drawdown 24% melewati batas 20%'});
  function closed(candles,now){
    return (candles||[]).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.close>0
      &&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&(!Number.isFinite(c.ct)||c.ct<=now));
  }
  // ATR Wilder: rata-rata TR 1..20 di indeks 20, lalu (N×19 + TR)/20. Sama dengan skrip riset.
  function atr(c,L=RULES.atrLength){
    const n=new Array(c.length).fill(null);let s=0;
    for(let i=1;i<c.length;i++){const tr=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));if(i<=L){s+=tr;if(i===L)n[i]=s/L;}else n[i]=(n[i-1]*(L-1)+tr)/L;}
    return n;
  }
  // Ekstrem L candle SEBELUM indeks i (candle i sendiri tidak ikut).
  function highBefore(c,i,L){let v=-Infinity;for(let k=i-L;k<i;k++)v=Math.max(v,c[k].high);return v;}
  function lowBefore(c,i,L){let v=Infinity;for(let k=i-L;k<i;k++)v=Math.min(v,c[k].low);return v;}
  // Volume 30 hari sebelum candle i (tidak termasuk candle i), seperti universe point-in-time di riset.
  function volume30(c,i){let v=0;for(let k=Math.max(0,i-RULES.volumeDays);k<i;k++)v+=Number(c[k].quoteVolume)||0;return v;}
  // Evaluasi pada candle 1D terakhir yang sudah close. lastPrice = harga saat ini untuk entry rencana.
  function evaluate(raw,options={}){
    const now=options.now??Date.now(),c=closed(raw,now);
    if(c.length<RULES.minCandles)return {engine:'turtle-v1',candles:c,side:null,plan:null,decision:'SKIP',status:'data 1D kurang dari '+RULES.minCandles+' hari'};
    const i=c.length-1,x=c[i],N=atr(c)[i];
    const high55=highBefore(c,i,RULES.entryLookback),low55=lowBefore(c,i,RULES.entryLookback);
    // Level exit yang berlaku untuk candle berikutnya: 20 candle terakhir termasuk candle i.
    const exitLong=lowBefore(c,i+1,RULES.exitLookback),exitShort=highBefore(c,i+1,RULES.exitLookback);
    const side=x.close>high55?'long':x.close<low55?'short':null;
    // Jarak close ke level breakout (% dari close): ≥ 0 berarti sudah menembus.
    const distLong=100*(x.close-high55)/x.close,distShort=100*(low55-x.close)/x.close;
    const entry=Number.isFinite(options.lastPrice)&&options.lastPrice>0?options.lastPrice:x.close;
    let plan=null;
    if(side&&N>0){
      const long=side==='long',risk=RULES.slAtr*N,sl=long?entry-risk:entry+risk;
      if(!long||sl>0)plan={entry,sl,initialSl:sl,risk,atr:N,tp:null,rr:null,signalClose:x.close,signalAt:x.ct,
        exitLevel:long?exitLong:exitShort,breakoutLevel:long?high55:low55,stage:VALIDATION.stage};
    }
    const fmt=v=>(v>=0?'+':'')+v.toFixed(1)+'%';
    const status=side?(plan?'breakout '+side.toUpperCase()+' 55 hari':'breakout tanpa rencana valid')
      :'pantau · jarak ke breakout LONG '+fmt(distLong)+' · SHORT '+fmt(distShort);
    return {engine:'turtle-v1',candles:c,last:x.close,side,plan,atr:N,high55,low55,exitLong,exitShort,distLong,distShort,
      volume30:volume30(c,i),atrPct:N>0?100*N/x.close:null,decision:plan?side.toUpperCase():'SKIP',status};
  }
  // Exit 20 hari: candle 1D yang close SESUDAH fill dan menembus low (LONG) / high (SHORT) 20 candle sebelumnya.
  // Mengembalikan {price, at} candle exit pertama, atau null. SL intrabar tetap ditangani tracker.
  function exitSignal(record,dailyCandles){
    if(!record||record.status!=='running'||record.engine!=='turtle-v1')return null;
    const c=dailyCandles||[],since=record.filledAt||record.runningAt||0,long=record.side==='long';
    for(let i=RULES.exitLookback;i<c.length;i++){
      if(!(c[i].ct>since))continue;
      if(long?c[i].close<lowBefore(c,i,RULES.exitLookback):c[i].close>highBefore(c,i,RULES.exitLookback))return {price:c[i].close,at:c[i].ct};
    }
    return null;
  }
  // Drawdown jurnal dari hasil R posisi turtle-v1 yang sudah selesai (risiko 0,5% per trade), urut waktu keluar.
  function drawdown(history){
    const rs=(history||[]).filter(x=>x.engine==='turtle-v1'&&Number.isFinite(x.r)).sort((a,b)=>(a.closedAt||0)-(b.closedAt||0));
    let e=1,pk=1,dd=0;for(const x of rs){e+=x.r*RULES.riskPct/100;pk=Math.max(pk,e);dd=Math.max(dd,(pk-e)/pk);}
    return {current:(pk-e)/pk,max:dd,trades:rs.length};
  }
  // Ukuran posisi: modal × 0,5% ÷ jarak entry–SL.
  function positionSize(balance,plan){
    if(!(balance>0)||!plan||!(Math.abs(plan.entry-plan.sl)>0))return null;
    const riskUsd=balance*RULES.riskPct/100,qty=riskUsd/Math.abs(plan.entry-plan.sl);
    return {riskUsd,qty,notional:qty*plan.entry};
  }
  // Prioritas antar-sinyal (slot per arah penuh): volume 30 hari terbesar.
  function rankUniverse(tickers){return tickers.filter(t=>Number.isFinite(t.quoteVolume)).slice().sort((a,b)=>b.quoteVolume-a.quoteVolume||a.symbol.localeCompare(b.symbol)).slice(0,RULES.prefilter);}
  function topByVolume30(rows){return rows.slice().sort((a,b)=>b.evaluation.volume30-a.evaluation.volume30||a.symbol.localeCompare(b.symbol)).slice(0,RULES.universe);}
  // Rekaman lama engine trend-v1 (PAPER) yang masih RUNNING: trailing stop tetap dijalankan sampai selesai.
  function trail(record,dailyCandles){
    if(!record||record.status!=='running'||record.engine!=='trend-v1'||!Number.isFinite(record.gap))return record;
    const after=(dailyCandles||[]).filter(c=>c.ct>(record.filledAt||record.runningAt||0)),long=record.side==='long';
    const extreme=after.reduce((m,c)=>long?Math.max(m,c.close):Math.min(m,c.close),record.peak??record.entry);
    record.peak=extreme;const candidate=long?extreme-record.gap:extreme+record.gap;
    record.sl=long?Math.max(record.sl,candidate):Math.min(record.sl,candidate);
    return record;
  }
  return Object.freeze({RULES,VALIDATION,closed,atr,highBefore,lowBefore,volume30,evaluate,exitSignal,drawdown,positionSize,rankUniverse,topByVolume30,trail});
});
