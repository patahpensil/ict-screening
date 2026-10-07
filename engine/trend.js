/* Skor tren gaya Rob Carver untuk screening crypto: fungsi murni, kausal, tanpa DOM/jaringan/order.
   Rumus dan parameter sama dengan uji di research/trend-score-2026-10-07/tf.js (docs/UJI_SKOR_TREN_2026-10-07.md).
   Sinyal diskret dan exit mengikuti "starter system" Carver (Leveraged Trading): masuk saat skor kuat,
   keluar lewat trailing stop 0,5 × volatilitas harga tahunan. Lihat docs/PRD_TREND_CARVER.md. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Trend=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const RULES=Object.freeze({
    universe:250,
    ewmac:Object.freeze([[8,32,5.3],[16,64,3.75],[32,128,2.65],[64,256,1.87]]),   // [cepat, lambat, forecast scalar]
    breakout:Object.freeze([[20,0.67],[40,0.70],[80,0.73],[160,0.74]]),            // [lookback hari, forecast scalar]
    cap:20,            // skor dibatasi ±20 (Carver)
    entry:10,          // sinyal saat |skor| ≥ 10 = kekuatan rata-rata (Carver)
    volSpan:35,        // EW std perubahan harga harian
    stopFraction:0.5,  // trailing stop = 0,5 × volatilitas harga tahunan (starter system Carver)
    daysPerYear:365,   // crypto diperdagangkan setiap hari
    minCandles:300,
  });
  function closed(candles,now){
    return (candles||[]).filter(c=>[c.open,c.high,c.low,c.close].every(Number.isFinite)&&c.close>0
      &&c.high>=Math.max(c.open,c.close)&&c.low<=Math.min(c.open,c.close)&&(!Number.isFinite(c.ct)||c.ct<=now));
  }
  const ewma=(x,span)=>{const a=2/(span+1),o=[];let v=null;for(const y of x){if(y==null||!Number.isFinite(y)){o.push(v);continue;}v=v==null?y:v+a*(y-v);o.push(v);}return o;};
  const ewstd=(x,span)=>{const a=2/(span+1),o=[];let m=null,s2=null,n=0;for(const y of x){if(!Number.isFinite(y)){o.push(null);continue;}n++;if(m==null){m=y;s2=0;}else{const d=y-m;m+=a*d;s2=(1-a)*(s2+a*d*d);}o.push(n>=10?Math.sqrt(s2):null);}return o;};
  const cap=v=>Math.max(-RULES.cap,Math.min(RULES.cap,v));
  // Skor per aturan dan gabungan pada setiap candle 1D (array sejajar dengan candle).
  function series(c){
    const close=c.map(x=>x.close),dprice=close.map((v,i)=>i?v-close[i-1]:null),pvol=ewstd(dprice,RULES.volSpan),rules=[];
    for(const [f,s,sc] of RULES.ewmac){const ef=ewma(close,f),es=ewma(close,s);rules.push({name:'EWMAC '+f+'/'+s,v:close.map((_,i)=>i>=s&&pvol[i]>0?cap(sc*(ef[i]-es[i])/pvol[i]):null)});}
    for(const [L,sc] of RULES.breakout){
      const raw=close.map((v,i)=>{if(i<L)return null;let mx=-Infinity,mn=Infinity;for(let k=i-L+1;k<=i;k++){mx=Math.max(mx,close[k]);mn=Math.min(mn,close[k]);}return mx>mn?40*(v-(mx+mn)/2)/(mx-mn):0;});
      const sm=ewma(raw,Math.max(2,Math.round(L/4)));
      rules.push({name:'Breakout '+L,v:sm.map((v,i)=>raw[i]==null||v==null?null:cap(sc*v))});
    }
    const combined=close.map((_,i)=>{const v=rules.map(r=>r.v[i]);return v.every(x=>x!=null)?cap(v.reduce((a,b)=>a+b,0)/v.length):null;});
    return {rules,combined,pvol};
  }
  function sideOf(forecast){return forecast==null?null:forecast>=RULES.entry?'long':forecast<=-RULES.entry?'short':null;}
  // Jarak trailing stop dalam harga: 0,5 × std perubahan harga harian × √365.
  function stopGap(pvolDaily){return Number.isFinite(pvolDaily)&&pvolDaily>0?RULES.stopFraction*pvolDaily*Math.sqrt(RULES.daysPerYear):null;}
  // Evaluasi pada candle 1D terakhir yang sudah close. lastPrice = harga saat ini untuk entry rencana.
  // Skor hanya berubah saat candle 1D baru close, jadi hasil hitung disimpan per array candle (array yang sama
  // dipakai ulang oleh cache candle aplikasi) dan dihitung ulang hanya bila jumlah/candle terakhirnya berubah.
  const memo=new WeakMap();
  function cachedSeries(raw,c){
    const key=raw&&typeof raw==='object'?raw:null,hit=key&&memo.get(key),lastCt=c.length?c[c.length-1].ct:null;
    if(hit&&hit.n===c.length&&hit.lastCt===lastCt)return hit.s;
    const s=series(c);if(key)memo.set(key,{n:c.length,lastCt,s});return s;
  }
  function evaluate(raw,options={}){
    const now=options.now??Date.now(),c=closed(raw,now);
    if(c.length<RULES.minCandles)return {engine:'trend-v1',candles:c,forecast:null,rules:[],side:null,plan:null,decision:'SKIP',status:'data 1D kurang dari '+RULES.minCandles+' hari'};
    const s=cachedSeries(raw,c),i=c.length-1,forecast=s.combined[i],side=sideOf(forecast),last=c[i].close;
    const rules=s.rules.map(r=>({name:r.name,value:r.v[i]}));
    const gap=stopGap(s.pvol[i]),entry=Number.isFinite(options.lastPrice)&&options.lastPrice>0?options.lastPrice:last;
    let plan=null;
    if(side&&gap){
      const long=side==='long',sl=long?entry-gap:entry+gap;
      if(long?sl>0:true)plan={entry,sl,initialSl:sl,gap,risk:gap,tp:null,rr:null,trailing:true,forecastAtSignal:forecast,signalAt:c[i].ct};
    }
    const status=forecast==null?'skor belum tersedia':side?(plan?'sinyal '+side.toUpperCase()+' · skor '+(forecast>0?'+':'')+forecast.toFixed(1):'sinyal tanpa rencana valid'):'pantau · skor '+(forecast>0?'+':'')+forecast.toFixed(1)+' (ambang ±'+RULES.entry+')';
    return {engine:'trend-v1',candles:c,last,forecast,rules,side,plan,gap,pvolDaily:s.pvol[i],
      volDailyPct:s.pvol[i]&&last?100*s.pvol[i]/last:null,decision:plan?side.toUpperCase():'SKIP',status};
  }
  // Trailing stop (tidak pernah dilonggarkan): LONG = close tertinggi sejak fill − gap; SHORT = close terendah + gap.
  function trail(record,dailyCandles){
    if(!record||record.status!=='running'||!Number.isFinite(record.gap))return record;
    const after=(dailyCandles||[]).filter(c=>c.ct>(record.filledAt||record.runningAt||0));
    const long=record.side==='long';
    const extreme=after.reduce((m,c)=>long?Math.max(m,c.close):Math.min(m,c.close),record.peak??record.entry);
    record.peak=extreme;
    const candidate=long?extreme-record.gap:extreme+record.gap;
    record.sl=long?Math.max(record.sl,candidate):Math.min(record.sl,candidate);
    return record;
  }
  function rankUniverse(tickers){return tickers.filter(t=>Number.isFinite(t.quoteVolume)).slice().sort((a,b)=>b.quoteVolume-a.quoteVolume||a.symbol.localeCompare(b.symbol)).slice(0,RULES.universe);}
  return Object.freeze({RULES,closed,series,sideOf,stopGap,evaluate,trail,rankUniverse});
});
