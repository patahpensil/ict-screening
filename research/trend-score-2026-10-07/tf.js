'use strict';
// Uji screener skor tren (trend following) dengan parameter baku publikasi Rob Carver — DIKUNCI sebelum uji (7 Okt 2026).
// EWMAC 8/32, 16/64, 32/128, 64/256 dibagi volatilitas harga harian (EW std span 35), scalar 5.3/3.75/2.65/1.87, cap ±20.
// Breakout 20/40/80/160 hari: 40*(close-mid)/(max-min), dihaluskan EWMA span L/4, scalar 0.67/0.70/0.73/0.74, cap ±20.
// Skor gabungan = rata-rata 8 aturan, cap ±20. Biaya 0,05% per sisi. Funding tidak dihitung.
const fs=require('fs'),path=require('path');
const DAY=86400000,FEE=0.0005;
const P1=[Date.parse('2024-10-06'),Date.parse('2026-04-01')],P2=[Date.parse('2026-04-01'),Date.parse('2026-10-06')];
const ewma=(x,span)=>{const a=2/(span+1),o=[];let v=null;for(const y of x){if(y==null||!Number.isFinite(y)){o.push(v);continue;}v=v==null?y:v+a*(y-v);o.push(v);}return o;};
const ewstd=(x,span)=>{const a=2/(span+1),o=[];let m=null,s2=null,n=0;for(const y of x){if(!Number.isFinite(y)){o.push(null);continue;}n++;if(m==null){m=y;s2=0;}else{const d=y-m;m+=a*d;s2=(1-a)*(s2+a*d*d);}o.push(n>=10?Math.sqrt(s2):null);}return o;};
const cap=v=>Math.max(-20,Math.min(20,v));
function forecasts(c){
  const close=c.map(x=>x.close),n=close.length;
  const dprice=close.map((v,i)=>i?v-close[i-1]:null);
  const pvol=ewstd(dprice,35);
  const rules=[];
  for(const [f,s,sc] of [[8,32,5.3],[16,64,3.75],[32,128,2.65],[64,256,1.87]]){
    const ef=ewma(close,f),es=ewma(close,s);
    rules.push(close.map((_,i)=>i>=s&&pvol[i]>0?cap(sc*(ef[i]-es[i])/pvol[i]):null));
  }
  for(const [L,sc] of [[20,0.67],[40,0.70],[80,0.73],[160,0.74]]){
    const raw=close.map((v,i)=>{if(i<L)return null;let mx=-Infinity,mn=Infinity;for(let k=i-L+1;k<=i;k++){mx=Math.max(mx,close[k]);mn=Math.min(mn,close[k]);}return mx>mn?40*(v-(mx+mn)/2)/(mx-mn):0;});
    const sm=ewma(raw,Math.max(2,Math.round(L/4)));
    rules.push(sm.map((v,i)=>raw[i]==null||v==null?null:cap(sc*v)));
  }
  return close.map((_,i)=>{const v=rules.map(r=>r[i]);return v.every(x=>x!=null)?cap(v.reduce((a,b)=>a+b,0)/v.length):null;});
}
const pairs=JSON.parse(fs.readFileSync('pairs.json','utf8'));
const series={};
for(const sym of pairs){
  const file=path.join('data',sym+'_1d.json');if(!fs.existsSync(file))continue;
  const c=JSON.parse(fs.readFileSync(file,'utf8')).filter(x=>x.close>0);if(c.length<300)continue;
  const ret=c.map((x,i)=>i?x.close/c[i-1].close-1:null),vol=ewstd(ret,35),F=forecasts(c);
  const byDay=new Map();c.forEach((x,i)=>byDay.set(Math.floor(x.t/DAY),{i,close:x.close,F:F[i],vol:vol[i],ret:ret[i]}));
  series[sym]={c,byDay};
}
const days=[...new Set(Object.values(series).flatMap(s=>[...s.byDay.keys()]))].sort((a,b)=>a-b);
const inP=(d,P)=>d*DAY>=P[0]&&d*DAY<P[1];
// ---------- Uji 1: screening (top/bottom 10 per hari, return ke depan) ----------
function screening(P,h){
  const out={long:[],short:[],all:[],buckets:{}};
  for(const d of days){
    if(!inP(d,P))continue;
    const rows=[];
    for(const [sym,s] of Object.entries(series)){
      const now=s.byDay.get(d),fut=s.byDay.get(d+h);
      if(!now||!fut||now.F==null)continue;
      rows.push({sym,F:now.F,r:fut.close/now.close-1});
    }
    if(rows.length<30)continue;
    rows.sort((a,b)=>b.F-a.F);
    const L=rows.slice(0,10).filter(x=>x.F>0),S=rows.slice(-10).filter(x=>x.F<0);
    const avg=a=>a.reduce((q,x)=>q+x,0)/a.length;
    if(L.length)out.long.push(avg(L.map(x=>x.r))-2*FEE);
    if(S.length)out.short.push(avg(S.map(x=>-x.r))-2*FEE);
    out.all.push(avg(rows.map(x=>x.r)));
    for(const x of rows){const b=x.F>=10?'≥+10':x.F>=0?'0..+10':x.F>-10?'-10..0':'≤-10';(out.buckets[b]=out.buckets[b]||[]).push(x.r);}
  }
  const m=a=>a.length?a.reduce((q,x)=>q+x,0)/a.length:null,hit=a=>a.length?100*a.filter(x=>x>0).length/a.length:null;
  return {hari:out.all.length,long:{rata:m(out.long),naik:hit(out.long)},short:{rata:m(out.short),untung:hit(out.short)},semuaPair:m(out.all),
    bucket:Object.fromEntries(['≥+10','0..+10','-10..0','≤-10'].map(b=>[b,{n:(out.buckets[b]||[]).length,rataReturn:m(out.buckets[b]||[])}]))};
}
// ---------- Uji 2: trading gaya Carver (posisi ∝ skor/10 × 1% vol harian / vol pair) ----------
function trading(P,mode){
  const pnl=[];
  const prevE={};
  for(let k=0;k<days.length-1;k++){
    const d=days[k];if(!inP(d,P))continue;
    let sum=0,n=0;
    for(const [sym,s] of Object.entries(series)){
      const now=s.byDay.get(d),nxt=s.byDay.get(d+1);
      if(!now||!nxt||now.F==null||!(now.vol>0))continue;
      let e=mode==='hold'?0.01/now.vol:(now.F/10)*(0.01/now.vol);
      if(mode==='long')e=Math.max(e,0);if(mode==='short')e=Math.min(e,0);
      const cost=Math.abs(e-(prevE[sym]||0))*FEE;prevE[sym]=e;
      sum+=e*(nxt.close/now.close-1)-cost;n++;
    }
    if(n)pnl.push(sum/n);
  }
  const mean=pnl.reduce((a,b)=>a+b,0)/pnl.length,sd=Math.sqrt(pnl.reduce((a,b)=>a+(b-mean)**2,0)/pnl.length);
  let eq=0,pk=0,dd=0;for(const x of pnl){eq+=x;pk=Math.max(pk,eq);dd=Math.min(dd,eq-pk);}
  // Diskalakan ke target volatilitas tahunan 20% agar return dan drawdown bisa dibaca.
  const k=sd>0?0.20/(sd*Math.sqrt(365)):0;
  return {hari:pnl.length,sharpe:sd>0?mean/sd*Math.sqrt(365):null,returnTahunanPadaVol20:mean*365*k,maxDrawdownPadaVol20:dd*k};
}
const pct=v=>v==null?'—':(100*v).toFixed(2)+'%';
const res={};
for(const [name,P] of [['Okt24–Mar26',P1],['Apr–Okt26',P2]]){
  res[name]={screening7:screening(P,7),screening30:screening(P,30),trading:{trend:trading(P,'both'),trendLongSaja:trading(P,'long'),trendShortSaja:trading(P,'short'),holdLongSemua:trading(P,'hold')}};
  const r=res[name];
  console.log('\n===== '+name+' =====  pair:',Object.keys(series).length);
  for(const h of [7,30]){const s=r['screening'+h];
    console.log(`Screening ${h} hari (${s.hari} hari sampel): LONG top10 rata ${pct(s.long.rata)} (naik ${s.long.naik?.toFixed(0)}%) | SHORT bottom10 rata ${pct(s.short.rata)} (untung ${s.short.untung?.toFixed(0)}%) | semua pair ${pct(s.semuaPair)}`);
    console.log('   per skor: '+Object.entries(s.bucket).map(([b,v])=>b+' '+pct(v.rataReturn)+' (n'+v.n+')').join(' | '));}
  for(const [k,t] of Object.entries(r.trading))console.log(`Trading ${k.padEnd(15)} Sharpe ${t.sharpe?.toFixed(2)} | return/thn @vol20% ${pct(t.returnTahunanPadaVol20)} | maxDD ${pct(t.maxDrawdownPadaVol20)}`);
}
fs.writeFileSync('hasil-tren.json',JSON.stringify(res,null,1));
