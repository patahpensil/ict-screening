'use strict';
// Simulasi portofolio mesin sinyal "turtle-v1" persis seperti aturan yang akan dipakai aplikasi:
//  - universe: 100 pair teratas menurut quote volume 30 hari sebelumnya (point-in-time dari data yang ada)
//  - sinyal di close 1D: close > high tertinggi 55 hari sebelumnya → LONG; close < low terendah 55 hari → SHORT
//  - SL awal = entry ∓ 2 × N (N = ATR20 Wilder), disentuh intrabar; keluar di close bila close menembus low/high 20 hari (arah berlawanan)
//  - satu posisi per pair; maksimal K posisi terbuka per arah; bila sinyal melebihi slot, prioritas volume 30 hari terbesar
//  - risiko 1% per trade; biaya 0,07% per sisi + funding; drawdown dihitung dari ekuitas harian mark-to-market
// Pemakaian: node turtle-portfolio.js <dir> <dari YYYY-MM-DD> <sampai YYYY-MM-DD> <pemisah paruh YYYY-MM-DD> <K,K,...> [pairs.json]
const fs=require('fs'),path=require('path');
const [dir,fromS,toS,halfS,ksS,pairsArg,riskArg]=process.argv.slice(2);const pairsFile=pairsArg&&pairsArg!=='-'?pairsArg:null;
const DAY=86400000,FROM=Date.parse(fromS),TO=Date.parse(toS),HALF=Date.parse(halfS),COST=0.0007,RISK=Number(riskArg||0.01);
const KS=(ksS||'5').split(',').map(Number);
const files=pairsFile?JSON.parse(fs.readFileSync(pairsFile,'utf8')).map(s=>s+'_1d.json'):fs.readdirSync(dir).filter(f=>f.endsWith('_1d.json'));
const S={};
for(const f of files){
  const p=path.join(dir,f);if(!fs.existsSync(p))continue;
  const c=JSON.parse(fs.readFileSync(p,'utf8')).filter(x=>x.close>0&&x.high>=x.low);if(c.length<60)continue;
  const sym=f.replace('_1d.json',''),fp=path.join(dir,sym+'_funding.json');
  // ATR20 Wilder
  const n=new Array(c.length).fill(null);let s=0;
  for(let i=1;i<c.length;i++){const tr=Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));if(i<=20){s+=tr;if(i===20)n[i]=s/20;}else n[i]=(n[i-1]*19+tr)/20;}
  const vol30=c.map((_,i)=>{if(i<20)return null;let v=0;for(let k=Math.max(0,i-30);k<i;k++)v+=c[k].quoteVolume;return v;});
  S[sym]={c,n,vol30,idx:new Map(c.map((x,i)=>[Math.floor(x.t/DAY),i])),fund:fs.existsSync(fp)?JSON.parse(fs.readFileSync(fp,'utf8')):[]};
}
const syms=Object.keys(S);
const ext=(c,i,L,key,fn)=>{let v=fn===Math.max?-Infinity:Infinity;for(let k=i-L;k<i;k++)v=fn(v,c[k][key]);return v;};
function run(K){
  const open=[],trades=[],eq=[];let realized=0;
  for(let d=Math.floor(FROM/DAY);d<Math.floor(TO/DAY);d++){
    // 1) posisi terbuka: SL intrabar, lalu exit 20 hari di close
    for(let j=open.length-1;j>=0;j--){
      const p=open[j],o=S[p.sym],i=o.idx.get(d);if(i==null)continue;const x=o.c[i];let px=null,why=null;
      if(p.long?x.low<=p.sl:x.high>=p.sl){px=p.long?Math.min(x.open,p.sl):Math.max(x.open,p.sl);why='sl';}
      else if(i>=20&&(p.long?x.close<ext(o.c,i,20,'low',Math.min):x.close>ext(o.c,i,20,'high',Math.max))){px=x.close;why='exit20';}
      if(px!=null){let f=0;for(const q of o.fund)if(q.t>p.t&&q.t<=x.ct)f+=q.r;
        const r=(px-p.entry)*(p.long?1:-1)/p.risk,rNet=r-((p.entry+px)*COST+f*p.entry*(p.long?1:-1))/p.risk;
        trades.push({sym:p.sym,side:p.long?'long':'short',t:p.t,exitT:x.ct,why,r:rNet});realized+=rNet;open.splice(j,1);}
      else p.last=x.close;
    }
    // 2) universe point-in-time hari ini
    const uni=[];for(const s of syms){const o=S[s],i=o.idx.get(d);if(i==null||i<56||o.n[i]==null||o.vol30[i]==null)continue;uni.push([s,o.vol30[i],i]);}
    uni.sort((a,b)=>b[1]-a[1]);
    // 3) sinyal di close
    const sig={long:[],short:[]};
    for(const [s,v,i] of uni.slice(0,100)){
      if(open.some(p=>p.sym===s))continue;const o=S[s],x=o.c[i];
      if(x.close>ext(o.c,i,55,'high',Math.max))sig.long.push([s,v,i]);else if(x.close<ext(o.c,i,55,'low',Math.min))sig.short.push([s,v,i]);
    }
    for(const side of ['long','short']){
      const long=side==='long';let cnt=open.filter(p=>p.long===long).length;
      for(const [s,v,i] of sig[side].sort((a,b)=>b[1]-a[1])){if(cnt>=K)break;const o=S[s],x=o.c[i],risk=2*o.n[i],sl=long?x.close-risk:x.close+risk;if(!(risk>0)||sl<=0&&long)continue;
        open.push({sym:s,long,entry:x.close,sl,risk,t:x.ct,last:x.close});cnt++;}
    }
    const unreal=open.reduce((a,p)=>a+(p.last-p.entry)*(p.long?1:-1)/p.risk,0);
    eq.push({d,v:(realized+unreal)*RISK});
  }
  for(const p of open)trades.push({sym:p.sym,side:p.long?'long':'short',t:p.t,exitT:TO,why:'akhir data',r:(p.last-p.entry)*(p.long?1:-1)/p.risk-((p.entry+p.last)*COST)/p.risk});
  return {trades,eq};
}
function ddOf(vals){let pk=1,dd=0;for(const v of vals){const e=1+v;pk=Math.max(pk,e);dd=Math.max(dd,(pk-e)/pk);}return dd;}
let seed=99;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
function mc95(rs){if(rs.length<2)return 0;const a=rs.slice(),v=[];for(let k=0;k<10000;k++){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}let e=1,pk=1,dd=0;for(const r of a){e+=r*RISK;pk=Math.max(pk,e);dd=Math.max(dd,(pk-e)/pk);}v.push(dd);}v.sort((x,y)=>x-y);return v[9500];}
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN,f=v=>Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(2):'—',pc=v=>(100*v).toFixed(0)+'%';
const out={};
console.log(dir,fromS,'→',toS,'| pair:',syms.length,'| risiko/trade',(100*RISK)+'%');
for(const K of KS){
  const {trades,eq}=run(K),rs=trades.map(t=>t.r),h1=trades.filter(t=>t.t<HALF).map(t=>t.r),h2=trades.filter(t=>t.t>=HALF).map(t=>t.r);
  const dd=ddOf(eq.map(x=>x.v)),mc=mc95(trades.slice().sort((a,b)=>a.exitT-b.exitT).map(t=>t.r));
  const side=s=>{const t=trades.filter(x=>x.side===s).map(x=>x.r);return {n:t.length,R:mean(t)};};
  const ok=trades.length>=60&&mean(rs)>=0.10&&mean(h1)>0&&mean(h2)>0&&dd<=0.20&&mc<=0.20;
  out[K]={n:trades.length,R:mean(rs),total:rs.reduce((a,b)=>a+b,0),paruh1:mean(h1),paruh2:mean(h2),ddHarian:dd,mc95:mc,long:side('long'),short:side('short'),returnPct:eq.length?eq[eq.length-1].v:0,lulus:ok};
  const o=out[K];
  console.log(' K='+K,'|',o.n,'trade',f(o.R)+'R','(LONG',o.long.n,f(o.long.R),'· SHORT',o.short.n,f(o.short.R)+')','| paruh',f(o.paruh1),f(o.paruh2),'| total',f(o.total)+'R','≈',pc(o.returnPct),'| DD harian',pc(dd),'MC95',pc(mc),ok?'LULUS':'gagal');
}
fs.writeFileSync('hasil-turtle-'+path.basename(dir)+'-'+fromS+'-risk'+RISK+'.json',JSON.stringify(out,null,1));
