'use strict';
// Riset tiga gaya pemberi sinyal (keputusan pemilik 7 Okt 2026, docs/KEPUTUSAN_2026-10-07_PEMBERI_SINYAL.md).
// Semua kandidat, parameter, biaya, dan syarat lulus DIKUNCI di docs/PROTOKOL_RISET_3_GAYA_2026-10-07.md sebelum dijalankan.
//   node riset3.js dev      → data pengembangan Okt 2024 – Okt 2026 (150 pair, sudah pernah dilihat)
//   node riset3.js holdout  → data holdout Jan 2022 – Des 2023 (universe point-in-time, termasuk pair delisting). DIBUKA SEKALI.
const fs=require('fs'),path=require('path');
const H=3600000,DAY=24*H,COST=0.0007; // fee taker 0,05% + slippage 0,02% per sisi
const MODE=process.argv[2]||'dev';
const CFG=MODE==='holdout'
  ?{dir:'holdout',from:Date.parse('2022-01-01T00:00:00Z'),to:Date.parse('2024-01-01T00:00:00Z'),half:Date.parse('2023-01-01T00:00:00Z')}
  :{dir:'data',from:Date.parse('2024-10-06T00:00:00Z'),to:Date.parse('2026-10-06T00:00:00Z'),half:Date.parse('2025-10-06T00:00:00Z')};
const RISK=0.01,MAX_OPEN=5,DD_LIMIT=0.20,MC_RUNS=10000;

// ---------- indikator (semantik Pine) ----------
const sma=(x,n)=>{const o=new Array(x.length).fill(null);let s=0,k=0;for(let i=0;i<x.length;i++){if(x[i]==null){s=0;k=0;continue;}s+=x[i];k++;if(k>n){s-=x[i-n];k=n;}if(k===n)o[i]=s/n;}return o;};
function emaP(x,n){const a=2/(n+1),o=new Array(x.length).fill(null);let v=null,s=0,k=0;for(let i=0;i<x.length;i++){const y=x[i];if(y==null){continue;}if(v==null){s+=y;k++;if(k===n){v=s/n;o[i]=v;}continue;}v=a*y+(1-a)*v;o[i]=v;}return o;}
function rma(x,n){const a=1/n,o=new Array(x.length).fill(null);let v=null,s=0,k=0;for(let i=0;i<x.length;i++){const y=x[i];if(y==null)continue;if(v==null){s+=y;k++;if(k===n){v=s/n;o[i]=v;}continue;}v=a*y+(1-a)*v;o[i]=v;}return o;}
const trueRange=c=>c.map((x,i)=>i?Math.max(x.high-x.low,Math.abs(x.high-c[i-1].close),Math.abs(x.low-c[i-1].close)):x.high-x.low);
const atr=(c,n)=>rma(trueRange(c),n);
function supertrendDir(c,factor,n){
  const a=atr(c,n),dir=new Array(c.length).fill(null);let lb=null,ub=null,st=null,d=null;
  for(let i=0;i<c.length;i++){
    if(a[i]==null)continue;const src=(c[i].high+c[i].low)/2;let up=src+factor*a[i],lo=src-factor*a[i];
    if(lb!=null){lo=lo>lb||c[i-1].close<lb?lo:lb;up=up<ub||c[i-1].close>ub?up:ub;}
    if(a[i-1]==null||st==null)d=1;else if(st===ub)d=c[i].close>up?-1:1;else d=c[i].close<lo?1:-1;
    st=d===-1?lo:up;lb=lo;ub=up;dir[i]=d;
  }
  return dir; // −1 = naik (Pine)
}
function rsi(close,n){const up=close.map((v,i)=>i?Math.max(v-close[i-1],0):null),dn=close.map((v,i)=>i?Math.max(close[i-1]-v,0):null);const u=rma(up,n),d=rma(dn,n);return close.map((_,i)=>u[i]==null||d[i]==null?null:d[i]===0?100:u[i]===0?0:100-100/(1+u[i]/d[i]));}
function dmi(c,n,sm){
  const tr=trueRange(c),p=c.map((x,i)=>{if(!i)return null;const u=x.high-c[i-1].high,d=c[i-1].low-x.low;return u>d&&u>0?u:0;}),m=c.map((x,i)=>{if(!i)return null;const u=x.high-c[i-1].high,d=c[i-1].low-x.low;return d>u&&d>0?d:0;});
  const trr=rma(tr.map((v,i)=>i?v:null),n),pr=rma(p,n),mr=rma(m,n);
  const plus=c.map((_,i)=>trr[i]?100*pr[i]/trr[i]:null),minus=c.map((_,i)=>trr[i]?100*mr[i]/trr[i]:null);
  const dx=c.map((_,i)=>plus[i]==null?null:(plus[i]+minus[i]===0?0:Math.abs(plus[i]-minus[i])/(plus[i]+minus[i])));
  const adx=rma(dx,sm).map(v=>v==null?null:100*v);return {plus,minus,adx};
}
// ---------- Claude Trading Indicator (Pine v6), hanya bar yang sudah close ----------
function cti(c){
  const close=c.map(x=>x.close),n=c.length;
  const ema200=emaP(close,200),st=supertrendDir(c,3,10),bb=sma(close,20);
  const e12=emaP(close,12),e26=emaP(close,26),macd=close.map((_,i)=>e12[i]!=null&&e26[i]!=null?e12[i]-e26[i]:null),sig=emaP(macd,9);
  const r=rsi(close,14);
  const raw=c.map((x,i)=>{if(i<13)return null;let hh=-Infinity,ll=Infinity;for(let k=i-13;k<=i;k++){hh=Math.max(hh,c[k].high);ll=Math.min(ll,c[k].low);}return hh>ll?100*(x.close-ll)/(hh-ll):null;});
  const K=sma(raw,3),D=sma(K,3),dm=dmi(c,14,14);
  let obv=0;const ob=close.map((v,i)=>{if(i)obv+=v>close[i-1]?c[i].volume:v<close[i-1]?-c[i].volume:0;return obv;}),obm=sma(ob,10);
  const sgn=(a,b)=>a==null||b==null?null:a>b?1:a<b?-1:0;
  const out=new Array(n).fill(0);let bull=0,bear=0,last=-Infinity;
  for(let i=0;i<n;i++){
    const t=[sgn(close[i],ema200[i]),st[i]==null?null:st[i]<0?1:st[i]>0?-1:0,sgn(close[i],bb[i])];
    const m=[sgn(macd[i],sig[i]),sgn(r[i],50),sgn(K[i],D[i])];
    if([...t,...m,dm.adx[i],obm[i]].some(v=>v==null)){bull=bear=0;continue;}
    const all=(a,v)=>a.every(x=>x===v);
    const tv=all(t,1)?1:all(t,-1)?-1:0,mv=all(m,1)?1:all(m,-1)?-1:0;
    const vv=dm.adx[i]>=20?sgn(dm.plus[i],dm.minus[i]):0,ov=sgn(ob[i],obm[i]);
    const vb=tv===1&&mv===1&&vv===1&&ov===1,vs=tv===-1&&mv===-1&&vv===-1&&ov===-1;
    bull=vb?bull+1:0;bear=vs?bear+1:0;
    const ok=i-last>=10,buy=bull===2&&ok,sell=bear===2&&ok&&!buy;
    if(buy||sell){last=i;out[i]=buy?1:-1;}
  }
  return out;
}
// ---------- skor tren Carver (identik tf.js / engine/trend.js) ----------
const ewma=(x,span)=>{const a=2/(span+1),o=[];let v=null;for(const y of x){if(y==null||!Number.isFinite(y)){o.push(v);continue;}v=v==null?y:v+a*(y-v);o.push(v);}return o;};
const ewstd=(x,span)=>{const a=2/(span+1),o=[];let m=null,s2=null,n=0;for(const y of x){if(!Number.isFinite(y)){o.push(null);continue;}n++;if(m==null){m=y;s2=0;}else{const d=y-m;m+=a*d;s2=(1-a)*(s2+a*d*d);}o.push(n>=10?Math.sqrt(s2):null);}return o;};
const cap=v=>Math.max(-20,Math.min(20,v));
function carver(c){
  const close=c.map(x=>x.close),dp=close.map((v,i)=>i?v-close[i-1]:null),pv=ewstd(dp,35),rules=[];
  for(const [f,s,sc] of [[8,32,5.3],[16,64,3.75],[32,128,2.65],[64,256,1.87]]){const ef=ewma(close,f),es=ewma(close,s);rules.push(close.map((_,i)=>i>=s&&pv[i]>0?cap(sc*(ef[i]-es[i])/pv[i]):null));}
  for(const [L,sc] of [[20,0.67],[40,0.70],[80,0.73],[160,0.74]]){
    const raw=close.map((v,i)=>{if(i<L)return null;let mx=-Infinity,mn=Infinity;for(let k=i-L+1;k<=i;k++){mx=Math.max(mx,close[k]);mn=Math.min(mn,close[k]);}return mx>mn?40*(v-(mx+mn)/2)/(mx-mn):0;});
    const sm=ewma(raw,Math.max(2,Math.round(L/4)));rules.push(sm.map((v,i)=>raw[i]==null||v==null?null:cap(sc*v)));}
  return close.map((_,i)=>{const v=rules.map(r=>r[i]);return v.every(x=>x!=null)?cap(v.reduce((a,b)=>a+b,0)/v.length):null;});
}
// ---------- CRT (sama dengan lab.js, tanpa konteks indikator) ----------
const TF_MS={'1h':H,'4h':4*H,'1d':DAY};
function crt(h1,range,rtf,entryMode){
  const sig=[],a1=atr(h1,14);let hi=0;
  for(let r=1;r<range.length-1;r++){
    const R=range[r],next=range[r+1],Hh=R.high,Ll=R.low;if(!(Hh>Ll))continue;
    while(hi<h1.length&&h1[hi].t<next.t)hi++;
    let sweep=null,done=false;
    for(let k=hi;k<h1.length&&h1[k].t<next.ct&&!done;k++){
      const c=h1[k];
      for(const side of ['short','long']){
        if(done)break;
        const swept=side==='short'?c.high>Hh:c.low<Ll;
        if(swept&&(!sweep||sweep.side!==side))sweep={side,start:k,ext:side==='short'?c.high:c.low};
        if(!sweep||sweep.side!==side)continue;
        sweep.ext=side==='short'?Math.max(sweep.ext,c.high):Math.min(sweep.ext,c.low);
        if(!(c.close<Hh&&c.close>Ll))continue;
        let e=k;
        if(entryMode==='mss'){
          e=-1;
          for(let m=k;m<h1.length&&h1[m].t<next.ct+TF_MS[rtf];m++){
            const piv=[];for(let q=sweep.start;q<=m-2;q++){if(q<2)continue;const a=h1[q],nb=[h1[q-2],h1[q-1],h1[q+1],h1[q+2]];if(side==='short'?nb.every(x=>a.low<x.low):nb.every(x=>a.high>x.high))piv.push(a);}
            if(side==='short'?h1[m].close>Hh:h1[m].close<Ll)break;
            sweep.ext=side==='short'?Math.max(sweep.ext,h1[m].high):Math.min(sweep.ext,h1[m].low);
            const last=piv[piv.length-1];
            if(last&&(side==='short'?h1[m].close<last.low:h1[m].close>last.high)){e=m;break;}
          }
          if(e<0){done=true;break;}
        }
        const buf=0.1*(a1[e]||0),sl=side==='short'?sweep.ext+buf:sweep.ext-buf;
        if(Math.abs(h1[e].close-sl)>0)sig.push({i:e,side:side==='long'?1:-1,sl});
        done=true;
      }
    }
  }
  return sig;
}
// ---------- simulasi satu pair, satu posisi per pair per kandidat ----------
// sig: {i, side(±1), sl, tpR (null = tanpa TP), trail (kelipatan ATR, chandelier dari close terbaik), atr, maxHold(ms), exitAt(i)->bool}
function simulate(sym,c,sigs,fund){
  const trades=[];let busy=-1;
  for(const s of sigs.sort((a,b)=>a.i-b.i)){
    if(s.i<=busy)continue;const e=c[s.i],entry=e.close,long=s.side>0;
    let sl=s.sl;const risk=Math.abs(entry-sl);if(!(risk>0)||(long?sl>=entry:sl<=entry))continue;
    const tp=s.tpR!=null?entry+s.side*s.tpR*risk:null;let best=entry,out=null;
    for(let k=s.i+1;k<c.length;k++){
      const x=c[k];
      if(long?x.low<=sl:x.high>=sl){out={k,px:long?Math.min(x.open,sl):Math.max(x.open,sl),o:'sl'};break;}
      if(tp!=null&&(long?x.high>=tp:x.low<=tp)){out={k,px:tp,o:'tp'};break;}
      if(s.maxHold&&x.ct-e.ct>=s.maxHold){out={k,px:x.close,o:'waktu'};break;}
      if(s.exitAt&&s.exitAt(k)){out={k,px:x.close,o:'batal'};break;}
      if(s.trail&&s.atr[k]!=null){best=long?Math.max(best,x.close):Math.min(best,x.close);const cand=best-s.side*s.trail*s.atr[k];sl=long?Math.max(sl,cand):Math.min(sl,cand);}
    }
    // Posisi yang masih terbuka di akhir data ditutup di close terakhir (supaya pemenang panjang tidak terbuang).
    if(!out){if(c.length-1<=s.i)continue;out={k:c.length-1,px:c[c.length-1].close,o:'akhir data'};}
    const exitT=c[out.k].ct;let f=0;if(fund)for(const x of fund)if(x.t>e.ct&&x.t<=exitT)f+=x.r;
    const r=(out.px-entry)*s.side/risk,cost=((entry+out.px)*COST+f*entry*s.side)/risk;
    trades.push({sym,t:e.ct,exitT,side:long?'long':'short',o:out.o,r,rNet:r-cost});busy=out.k;
  }
  return trades;
}
// ---------- kandidat (DIKUNCI) ----------
const CAND={
  'P1 Posisi · skor tren Carver 1D':          {gaya:'posisi'},
  'P2 Posisi · konsensus CTI 1D':             {gaya:'posisi'},
  'P3 Posisi · Turtle 55/20 1D':              {gaya:'posisi'},
  'S1 Swing · CRT 1D + MSS 1H, TP 2R':        {gaya:'swing'},
  'S2 Swing · konsensus CTI 4H, TP 2R':       {gaya:'swing'},
  'S3 Swing · breakout 20×4H searah tren 1D': {gaya:'swing'},
  'I1 Intraday · CRT 4H + close 1H, TP 2R':   {gaya:'intraday'},
  'I2 Intraday · konsensus CTI 1H, TP 2R':    {gaya:'intraday'},
};
function generate(d1,h4,h1){
  const out={};const inP=t=>t>=CFG.from&&t<CFG.to;
  // Posisi (1D)
  const a1=atr(d1,14),sc=carver(d1),ci1=cti(d1),a20=atr(d1,20);
  const P1=[],P2=[],P3=[];
  for(let i=1;i<d1.length;i++){
    if(!inP(d1[i].ct))continue;
    if(sc[i]!=null&&sc[i-1]!=null&&a1[i]){
      const side=sc[i]>=10&&sc[i-1]<10?1:sc[i]<=-10&&sc[i-1]>-10?-1:0;
      if(side)P1.push({i,side,sl:d1[i].close-side*3*a1[i],tpR:null,trail:3,atr:a1,exitAt:k=>sc[k]!=null&&sc[k]*side<=0});
    }
    if(ci1[i]&&a1[i]){const side=ci1[i];P2.push({i,side,sl:d1[i].close-side*3*a1[i],tpR:null,trail:3,atr:a1,exitAt:k=>ci1[k]===-side});}
    if(i>=55&&a20[i]){
      let hh=-Infinity,ll=Infinity;for(let k=i-55;k<i;k++){hh=Math.max(hh,d1[k].high);ll=Math.min(ll,d1[k].low);}
      const side=d1[i].close>hh?1:d1[i].close<ll?-1:0;
      if(side)P3.push({i,side,sl:d1[i].close-side*2*a20[i],tpR:null,trail:0,atr:a20,exitAt:k=>{if(k<20)return false;let h=-Infinity,l=Infinity;for(let q=k-20;q<k;q++){h=Math.max(h,d1[q].high);l=Math.min(l,d1[q].low);}return side>0?d1[k].close<l:d1[k].close>h;}});
    }
  }
  out['P1 Posisi · skor tren Carver 1D']={c:d1,s:P1};out['P2 Posisi · konsensus CTI 1D']={c:d1,s:P2};out['P3 Posisi · Turtle 55/20 1D']={c:d1,s:P3};
  // Swing
  const S1=crt(h1,d1,'1d','mss').filter(s=>inP(h1[s.i].ct)).map(s=>({...s,tpR:2,maxHold:10*DAY}));
  const a4=atr(h4,14),ci4=cti(h4),S2=[],S3=[];
  let dj=-1;
  for(let i=20;i<h4.length;i++){
    if(!inP(h4[i].ct))continue;
    if(ci4[i]&&a4[i]){const side=ci4[i];S2.push({i,side,sl:h4[i].close-side*3*a4[i],tpR:2,maxHold:10*DAY,exitAt:k=>ci4[k]===-side});}
    while(dj+1<d1.length&&d1[dj+1].ct<=h4[i].ct)dj++;
    const ts=dj>=0?sc[dj]:null;
    if(ts!=null&&a4[i]){
      let hh=-Infinity,ll=Infinity;for(let k=i-20;k<i;k++){hh=Math.max(hh,h4[k].high);ll=Math.min(ll,h4[k].low);}
      const side=h4[i].close>hh&&ts>=5?1:h4[i].close<ll&&ts<=-5?-1:0;
      if(side)S3.push({i,side,sl:h4[i].close-side*2*a4[i],tpR:3,maxHold:10*DAY});
    }
  }
  out['S1 Swing · CRT 1D + MSS 1H, TP 2R']={c:h1,s:S1};out['S2 Swing · konsensus CTI 4H, TP 2R']={c:h4,s:S2};out['S3 Swing · breakout 20×4H searah tren 1D']={c:h4,s:S3};
  // Intraday
  const I1=crt(h1,h4,'4h','close').filter(s=>inP(h1[s.i].ct)).map(s=>({...s,tpR:2,maxHold:DAY}));
  const ah=atr(h1,14),cih=cti(h1),I2=[];
  for(let i=0;i<h1.length;i++){if(!inP(h1[i].ct)||!cih[i]||!ah[i])continue;const side=cih[i];I2.push({i,side,sl:h1[i].close-side*3*ah[i],tpR:2,maxHold:DAY,exitAt:k=>cih[k]===-side});}
  out['I1 Intraday · CRT 4H + close 1H, TP 2R']={c:h1,s:I1};out['I2 Intraday · konsensus CTI 1H, TP 2R']={c:h1,s:I2};
  return out;
}
// ---------- portofolio & statistik ----------
function capPortfolio(trades){const acc=[],open=[];for(const t of trades.slice().sort((a,b)=>a.t-b.t||a.sym.localeCompare(b.sym))){for(let k=open.length-1;k>=0;k--)if(open[k]<=t.t)open.splice(k,1);if(open.length>=MAX_OPEN)continue;open.push(t.exitT);acc.push(t);}return acc;}
function maxDD(rs){let eq=0,pk=0,dd=0;for(const r of rs){eq+=r*RISK;pk=Math.max(pk,eq);dd=Math.max(dd,pk-eq);}return dd;}
let seed=12345;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
function mc95(rs){if(rs.length<2)return null;const v=[];const a=rs.slice();for(let k=0;k<MC_RUNS;k++){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[a[i],a[j]]=[a[j],a[i]];}v.push(maxDD(a));}v.sort((x,y)=>x-y);return v[Math.floor(0.95*MC_RUNS)];}
function stat(t){
  const n=t.length,m=n?t.reduce((s,x)=>s+x.rNet,0)/n:null,w=t.filter(x=>x.rNet>0).length;
  const h1=t.filter(x=>x.t<CFG.half),h2=t.filter(x=>x.t>=CFG.half),avg=a=>a.length?a.reduce((s,x)=>s+x.rNet,0)/a.length:null;
  const seq=t.slice().sort((a,b)=>a.exitT-b.exitT).map(x=>x.rNet),dd=maxDD(seq),mc=mc95(seq);
  const lulus=n>=60&&m>=0.10&&avg(h1)>0&&avg(h2)>0&&dd<=DD_LIMIT&&mc!=null&&mc<=DD_LIMIT;
  return {n,exp:m,win:n?100*w/n:null,total:n?m*n:0,paruh1:{n:h1.length,exp:avg(h1)},paruh2:{n:h2.length,exp:avg(h2)},ddHistoris:dd,ddMC95:mc,lulus};
}
(async()=>{
  const syms=MODE==='holdout'?[...new Set(Object.values(JSON.parse(fs.readFileSync(path.join(CFG.dir,'universe.json'),'utf8'))).flat())]:JSON.parse(fs.readFileSync('pairs.json','utf8'));
  const universe=MODE==='holdout'?JSON.parse(fs.readFileSync(path.join(CFG.dir,'universe.json'),'utf8')):null;
  const inUniverse=(sym,t)=>!universe||(universe[Math.floor(t/DAY)]||[]).includes(sym);
  const all={};for(const k of Object.keys(CAND))all[k]=[];
  let done=0;
  for(const sym of syms){
    const rd=tf=>{const f=path.join(CFG.dir,sym+'_'+tf+'.json');return fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')).filter(x=>x.close>0):null;};
    const d1=rd('1d'),h4=rd('4h'),h1=rd('1h');if(!d1||!h4||!h1||d1.length<60){continue;}
    const ff=path.join(CFG.dir,sym+'_funding.json'),fund=fs.existsSync(ff)?JSON.parse(fs.readFileSync(ff,'utf8')):null;
    const gen=generate(d1,h4,h1);
    for(const [k,{c,s}] of Object.entries(gen))all[k].push(...simulate(sym,c,s.filter(x=>inUniverse(sym,c[x.i].ct)),fund));
    if(++done%25===0)console.log(new Date().toISOString().slice(11,19),MODE,done,'/',syms.length);
  }
  const res={mode:MODE,periode:[new Date(CFG.from).toISOString().slice(0,10),new Date(CFG.to).toISOString().slice(0,10)],pair:done,kandidat:{}};
  for(const [k,t] of Object.entries(all)){
    const r=res.kandidat[k]={gaya:CAND[k].gaya};
    for(const side of ['long','short']){const ts=t.filter(x=>x.side===side);r[side]={tanpaBatas:stat(ts),batas5:stat(capPortfolio(ts))};}
  }
  fs.writeFileSync('hasil-riset3-'+MODE+'.json',JSON.stringify(res,null,1));
  fs.writeFileSync('trade-riset3-'+MODE+'.json',JSON.stringify(Object.fromEntries(Object.entries(all).map(([k,t])=>[k,t.map(x=>[x.sym,x.t,x.exitT,x.side,x.o,+x.rNet.toFixed(4)])]))));
  const f=v=>v==null?'—':(v>=0?'+':'')+v.toFixed(2);
  for(const [k,r] of Object.entries(res.kandidat)){console.log('\n'+k);for(const side of ['long','short']){const s=r[side].batas5,u=r[side].tanpaBatas;
    console.log(' ',side.toUpperCase().padEnd(5),'maks 5 posisi:',String(s.n).padStart(4),'trade',f(s.exp)+'R','| paruh',f(s.paruh1.exp),f(s.paruh2.exp),'| DD',(100*s.ddHistoris).toFixed(0)+'%','MC95',s.ddMC95==null?'—':(100*s.ddMC95).toFixed(0)+'%',s.lulus?'LULUS':'gagal','|| tanpa batas:',u.n,'trade',f(u.exp)+'R');}}
  console.log('\nSELESAI');
})().catch(e=>{console.error('ERR',e.stack);process.exit(1);});
