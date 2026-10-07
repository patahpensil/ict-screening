'use strict';
// Uji A (filter BTC SMA200 untuk SHORT, repo afries24) dan B (momentum 14h / vol 30h, repo perp-quant-lab).
// Parameter DIKUNCI dari repo sebelum uji (7 Okt 2026). Aturan trade A = aturan aplikasi trend-v1 yang live.
const fs=require('fs'),path=require('path');
const DAY=86400000,FEE=0.0005;
const P=[['Okt24–Mar26',Date.parse('2024-10-06'),Date.parse('2026-04-01')],['Apr–Okt26',Date.parse('2026-04-01'),Date.parse('2026-10-06')]];
const ewma=(x,span)=>{const a=2/(span+1),o=[];let v=null;for(const y of x){if(y==null||!Number.isFinite(y)){o.push(v);continue;}v=v==null?y:v+a*(y-v);o.push(v);}return o;};
const ewstd=(x,span)=>{const a=2/(span+1),o=[];let m=null,s2=null,n=0;for(const y of x){if(!Number.isFinite(y)){o.push(null);continue;}n++;if(m==null){m=y;s2=0;}else{const d=y-m;m+=a*d;s2=(1-a)*(s2+a*d*d);}o.push(n>=10?Math.sqrt(s2):null);}return o;};
const cap=v=>Math.max(-20,Math.min(20,v));
function forecast(c){ // identik dengan engine/trend.js
  const close=c.map(x=>x.close),dp=close.map((v,i)=>i?v-close[i-1]:null),pvol=ewstd(dp,35),rules=[];
  for(const [f,s,sc] of [[8,32,5.3],[16,64,3.75],[32,128,2.65],[64,256,1.87]]){const ef=ewma(close,f),es=ewma(close,s);rules.push(close.map((_,i)=>i>=s&&pvol[i]>0?cap(sc*(ef[i]-es[i])/pvol[i]):null));}
  for(const [L,sc] of [[20,0.67],[40,0.70],[80,0.73],[160,0.74]]){const raw=close.map((v,i)=>{if(i<L)return null;let mx=-Infinity,mn=Infinity;for(let k=i-L+1;k<=i;k++){mx=Math.max(mx,close[k]);mn=Math.min(mn,close[k]);}return mx>mn?40*(v-(mx+mn)/2)/(mx-mn):0;});const sm=ewma(raw,Math.max(2,Math.round(L/4)));rules.push(sm.map((v,i)=>raw[i]==null||v==null?null:cap(sc*v)));}
  return {F:close.map((_,i)=>{const v=rules.map(r=>r[i]);return v.every(x=>x!=null)?cap(v.reduce((a,b)=>a+b,0)/v.length):null;}),pvol};
}
const pairs=JSON.parse(fs.readFileSync('pairs.json','utf8')),S={};
for(const sym of pairs){
  const f=path.join('data',sym+'_1d.json');if(!fs.existsSync(f))continue;
  const c=JSON.parse(fs.readFileSync(f,'utf8')).filter(x=>x.close>0);if(c.length<300)continue;
  const {F,pvol}=forecast(c),ret=c.map((x,i)=>i?x.close/c[i-1].close-1:null);
  // B: (close[t-1]/close[t-15]-1) / std harian 30 hari [t-1]  (repo perp-quant-lab, backtest2.py)
  const vm=c.map((_,i)=>{if(i<31)return null;const w=ret.slice(i-30,i).filter(Number.isFinite);if(w.length<20)return null;const m=w.reduce((a,b)=>a+b,0)/w.length,sd=Math.sqrt(w.reduce((a,b)=>a+(b-m)**2,0)/(w.length-1));return sd>0?(c[i-1].close/c[i-15].close-1)/sd:null;});
  S[sym]={c,F,pvol,ret,vm,idx:new Map(c.map((x,i)=>[Math.floor(x.t/DAY),i]))};
}
const btc=S.BTCUSDT.c,btcSma=new Map();btc.forEach((x,i)=>{if(i>=199){let s=0;for(let k=i-199;k<=i;k++)s+=btc[k].close;btcSma.set(Math.floor(x.t/DAY),{above:x.close>s/200});}});
// ---------- A: simulasi aturan aplikasi per pair ----------
function simulate(o,filter){
  const trades=[],reset={long:false,short:false};let pos=null;
  for(let i=1;i<o.c.length;i++){
    const x=o.c[i],d=Math.floor(x.t/DAY);
    if(pos&&i>pos.i){
      const long=pos.side==='long';
      const hit=long?x.low<=pos.sl:x.high>=pos.sl;
      if(hit){const px=long?Math.min(x.open,pos.sl):Math.max(x.open,pos.sl);const r=(px-pos.entry)*(long?1:-1)/pos.gap;trades.push({side:pos.side,t:pos.t,days:i-pos.i,r,rNet:r-(pos.entry+px)*FEE/pos.gap});reset[pos.side]=true;pos=null;}
      else{pos.peak=long?Math.max(pos.peak,x.close):Math.min(pos.peak,x.close);pos.sl=long?Math.max(pos.sl,pos.peak-pos.gap):Math.min(pos.sl,pos.peak+pos.gap);}
    }
    const F=o.F[i];if(F==null)continue;
    const side=F>=10?'long':F<=-10?'short':null;
    for(const s of ['long','short'])if(reset[s]&&side!==s)reset[s]=false;
    if(pos||!side||reset[side])continue;
    if(filter&&side==='short'&&btcSma.get(d)?.above)continue;
    const gap=0.5*o.pvol[i]*Math.sqrt(365);if(!(gap>0))continue;
    pos={side,i,t:x.ct,entry:x.close,gap,sl:side==='long'?x.close-gap:x.close+gap,peak:x.close};
  }
  return {trades,open:pos?1:0};
}
const sum=a=>{const n=a.length;if(!n)return 'n0';const w=a.filter(x=>x.rNet>0).length,s=a.reduce((q,x)=>q+x.rNet,0);let eq=0,pk=0,dd=0;for(const x of a.slice().sort((p,q)=>p.t-q.t)){eq+=x.rNet;pk=Math.max(pk,eq);dd=Math.min(dd,eq-pk);}
  return `n${n} win ${(100*w/n).toFixed(0)}% rata ${(s/n>=0?'+':'')+(s/n).toFixed(2)}R total ${(s>=0?'+':'')+s.toFixed(1)}R DD ${dd.toFixed(1)}R tahan ${(a.reduce((q,x)=>q+x.days,0)/n).toFixed(0)}h`;};
const out={A:{},B:{}};
console.log('pair:',Object.keys(S).length,'| hari BTC di atas SMA200: P1',[...btcSma].filter(([d,v])=>d*DAY>=P[0][1]&&d*DAY<P[0][2]&&v.above).length,'dari',[...btcSma].filter(([d])=>d*DAY>=P[0][1]&&d*DAY<P[0][2]).length,'| P2',[...btcSma].filter(([d,v])=>d*DAY>=P[1][1]&&d*DAY<P[1][2]&&v.above).length,'dari',[...btcSma].filter(([d])=>d*DAY>=P[1][1]&&d*DAY<P[1][2]).length);
console.log('\n=== A. Aturan aplikasi live (trailing stop), SHORT tanpa vs dengan filter BTC SMA200 ===');
for(const filter of [false,true]){
  const all=[];for(const o of Object.values(S))all.push(...simulate(o,filter).trades);
  for(const [name,a,b] of P){const t=all.filter(x=>x.t>=a&&x.t<b);
    console.log((filter?'DENGAN filter ':'TANPA filter  ')+name.padEnd(12),'| LONG',sum(t.filter(x=>x.side==='long')),'\n'+' '.repeat(27)+'| SHORT',sum(t.filter(x=>x.side==='short')),'\n'+' '.repeat(27)+'| SEMUA',sum(t));
    out.A[(filter?'filter':'tanpa')+'|'+name]={long:t.filter(x=>x.side==='long').length,short:t.filter(x=>x.side==='short').length,rNet:t.reduce((q,x)=>q+x.rNet,0)};}
}
// ---------- B: kualitas peringkat ----------
const syms=Object.keys(S),days=[...new Set(syms.flatMap(s=>[...S[s].idx.keys()]))].sort((a,b)=>a-b);
const rank=a=>{const idx=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]);const r=new Array(a.length);idx.forEach(([_,i],k)=>r[i]=k);return r;};
const spear=(x,y)=>{const rx=rank(x),ry=rank(y),n=x.length,mx=(n-1)/2;let nu=0,dx=0,dy=0;for(let i=0;i<n;i++){nu+=(rx[i]-mx)*(ry[i]-mx);dx+=(rx[i]-mx)**2;dy+=(ry[i]-mx)**2;}return nu/Math.sqrt(dx*dy);};
const m=a=>a.reduce((p,q)=>p+q,0)/a.length,sd=a=>{const mm=m(a);return Math.sqrt(a.reduce((p,q)=>p+(q-mm)**2,0)/a.length);};
console.log('\n=== B. Skor tren Carver vs momentum 14h/vol (repo perp-quant-lab) ===');
for(const [name,a,b] of P){
  for(const [key,label] of [['F','Carver EWMAC+breakout'],['vm','Mom14/vol30']]){
    const ic={7:[],30:[]},spread={7:[],30:[]},ls=[],lo=[];let prevW=new Map(),prevL=new Map();
    for(const d of days){
      if(d*DAY<a||d*DAY>=b)continue;
      const rows=[];for(const s of syms){const o=S[s],i=o.idx.get(d);if(i==null||o[key][i]==null)continue;const r={s,v:o[key][i],r1:o.idx.get(d+1)!=null?o.c[o.idx.get(d+1)].close/o.c[i].close-1:null};for(const h of [7,30]){const j=o.idx.get(d+h);r['f'+h]=j!=null?o.c[j].close/o.c[i].close-1:null;}rows.push(r);}
      if(rows.length<40)continue;
      for(const h of [7,30]){const v=rows.filter(r=>r['f'+h]!=null);if(v.length<40)continue;ic[h].push(spear(v.map(r=>r.v),v.map(r=>r['f'+h])));v.sort((p,q)=>q.v-p.v);const av=q=>q.reduce((p,r)=>p+r['f'+h],0)/q.length;spread[h].push(av(v.slice(0,10))-av(v.slice(-10))-4*FEE);}
      // portofolio harian berbobot peringkat (repo 2): demean, |w| total 2; LONG saja = bobot positif, total 1
      const v=rows.filter(r=>r.r1!=null);if(v.length<40)continue;
      const rk=rank(v.map(r=>r.v)),mean=(v.length-1)/2;let g=0;const w=new Map();v.forEach((r,k)=>{const x=rk[k]-mean;w.set(r.s,x);g+=Math.abs(x);});
      let pnl=0,turn=0,pnlL=0,turnL=0,gL=0;for(const [s,x] of w){if(x>0)gL+=x;}
      for(const r of v){const x=2*w.get(r.s)/g,xl=w.get(r.s)>0?w.get(r.s)/gL:0;pnl+=x*r.r1;pnlL+=xl*r.r1;turn+=Math.abs(x-(prevW.get(r.s)||0));turnL+=Math.abs(xl-(prevL.get(r.s)||0));}
      prevW=new Map(v.map(r=>[r.s,2*w.get(r.s)/g]));prevL=new Map(v.map(r=>[r.s,w.get(r.s)>0?w.get(r.s)/gL:0]));
      ls.push(pnl-turn*FEE);lo.push(pnlL-turnL*FEE);
    }
    const sh=x=>(m(x)/sd(x)*Math.sqrt(365)).toFixed(2),t=(x,h)=>(m(x)/(sd(x)/Math.sqrt(x.length/h))).toFixed(1);
    console.log(name.padEnd(12),label.padEnd(22),'IC7',m(ic[7]).toFixed(3),'(t'+t(ic[7],7)+') IC30',m(ic[30]).toFixed(3),'(t'+t(ic[30],30)+') | selisih10 30h',(100*m(spread[30])).toFixed(2)+'%','| LONG−SHORT Sharpe',sh(ls),'| LONG saja Sharpe',sh(lo));
    out.B[name+'|'+key]={ic7:m(ic[7]),ic30:m(ic[30]),spread30:m(spread[30]),lsSharpe:+sh(ls),longSharpe:+sh(lo)};
  }
}
fs.writeFileSync('hasil-ab.json',JSON.stringify(out,null,1));
