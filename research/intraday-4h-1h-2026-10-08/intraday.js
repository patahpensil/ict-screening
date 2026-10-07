'use strict';
// Uji aturan "breakout intraday" (rancangan disetujui pemilik 8 Okt 2026) pada data 1H/4H Binance USDⓈ-M:
//  - universe: 100 pair teratas menurut quote volume 30 hari sebelumnya (dari candle 4H, point-in-time di data yang ada)
//  - sinyal di close 4H: close > high tertinggi L candle 4H sebelumnya → LONG; close < low terendah L candle → SHORT
//  - entry = close 4H itu; SL = entry ∓ 2 × ATR20 1H (Wilder); SL disentuh intrabar 1H (gap: harga open)
//  - exit: close 1H menembus low terendah 20 candle 1H sebelumnya (LONG) / high tertinggi (SHORT) → keluar di close itu
//  - satu posisi per pair; maks 5 posisi per arah; prioritas volume 30 hari terbesar
//  - risiko 0,5% per trade; biaya 0,07% per sisi (funding tidak dihitung; posisi intraday umumnya pendek)
// Syarat lulus (sama dengan versi swing): ≥ 60 trade, ≥ +0,10R per trade, kedua paruh positif, DD harian ≤ 20%, DD MC p95 ≤ 20%.
// Pemakaian: node intraday.js <dir data> <dari YYYY-MM-DD> <sampai YYYY-MM-DD> <pemisah paruh> <L,L,...>
const fs=require('fs'),path=require('path');
const [dir,fromS,toS,halfS,lsS]=process.argv.slice(2);
const H=3600000,DAY=86400000,FROM=Date.parse(fromS),TO=Date.parse(toS),HALF=Date.parse(halfS),COST=0.0007,RISK=0.005,K=5,SL_ATR=2,EXIT=20,ATR=20,UNIVERSE=100;
const LS=lsS.split(',').map(Number);
const valid=x=>x.close>0&&x.high>=x.low;
const S={};
for(const f of fs.readdirSync(dir).filter(f=>f.endsWith('_1h.json'))){
  const sym=f.replace('_1h.json',''),p4=path.join(dir,sym+'_4h.json');if(!fs.existsSync(p4))continue;
  const h=JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')).filter(valid),c4=JSON.parse(fs.readFileSync(p4,'utf8')).filter(valid);
  if(h.length<500||c4.length<300)continue;
  const n=new Array(h.length).fill(null);let s=0;
  for(let i=1;i<h.length;i++){const tr=Math.max(h[i].high-h[i].low,Math.abs(h[i].high-h[i-1].close),Math.abs(h[i].low-h[i-1].close));if(i<=ATR){s+=tr;if(i===ATR)n[i]=s/ATR;}else n[i]=(n[i-1]*(ATR-1)+tr)/ATR;}
  // volume 30 hari = 180 candle 4H sebelum candle sinyal
  const vol=c4.map((_,i)=>{if(i<180)return null;let v=0;for(let k=i-180;k<i;k++)v+=c4[k].quoteVolume;return v;});
  S[sym]={h,n,c4,vol,hIdx:new Map(h.map((x,i)=>[x.t,i])),c4ByCt:new Map(c4.map((x,i)=>[Math.round((x.ct+1)/H),i]))};
}
const syms=Object.keys(S);
const ext=(c,i,L,key,max)=>{let v=max?-Infinity:Infinity;for(let k=i-L;k<i;k++)v=max?Math.max(v,c[k][key]):Math.min(v,c[k][key]);return v;};
function run(L){
  const open=[],trades=[],eq=[];let realized=0;
  for(let t=FROM;t<TO;t+=H){
    // 1) posisi terbuka pada candle 1H yang mulai di t
    for(let j=open.length-1;j>=0;j--){
      const p=open[j],o=S[p.sym],i=o.hIdx.get(t);if(i==null)continue;const x=o.h[i];let px=null,why=null;
      if(p.long?x.low<=p.sl:x.high>=p.sl){px=p.long?Math.min(x.open,p.sl):Math.max(x.open,p.sl);why='sl';}
      else if(i>=EXIT&&(p.long?x.close<ext(o.h,i,EXIT,'low',false):x.close>ext(o.h,i,EXIT,'high',true))){px=x.close;why='exit20';}
      if(px!=null){const r=(px-p.entry)*(p.long?1:-1)/p.risk-((p.entry+px)*COST)/p.risk;trades.push({sym:p.sym,side:p.long?'long':'short',t:p.t,exitT:x.ct,why,r,hours:(x.ct+1-p.t)/H});realized+=r;open.splice(j,1);}
      else p.last=x.close;
    }
    // 2) candle 4H yang close di akhir jam ini → sinyal
    const endHour=Math.round((t+H)/H);
    if(endHour%4===0){
      const uni=[];
      for(const s of syms){const o=S[s],i=o.c4ByCt.get(endHour);if(i==null||i<Math.max(L,180)||o.vol[i]==null)continue;const hi=o.hIdx.get(t);if(hi==null||o.n[hi]==null)continue;uni.push([s,o.vol[i],i,hi]);}
      uni.sort((a,b)=>b[1]-a[1]);
      const sig={long:[],short:[]};
      for(const [s,v,i,hi] of uni.slice(0,UNIVERSE)){
        if(open.some(p=>p.sym===s))continue;const o=S[s],x=o.c4[i];
        if(x.close>ext(o.c4,i,L,'high',true))sig.long.push([s,i,hi]);else if(x.close<ext(o.c4,i,L,'low',false))sig.short.push([s,i,hi]);
      }
      for(const side of ['long','short']){
        const long=side==='long';let cnt=open.filter(p=>p.long===long).length;
        for(const [s,i,hi] of sig[side]){if(cnt>=K)break;const o=S[s],entry=o.c4[i].close,risk=SL_ATR*o.n[hi],sl=long?entry-risk:entry+risk;if(!(risk>0)||long&&sl<=0)continue;
          open.push({sym:s,long,entry,sl,risk,t:t+H,last:entry});cnt++;}
      }
    }
    if((t+H)%DAY===0){const unreal=open.reduce((a,p)=>a+(p.last-p.entry)*(p.long?1:-1)/p.risk,0);eq.push((realized+unreal)*RISK);}
  }
  for(const p of open)trades.push({sym:p.sym,side:p.long?'long':'short',t:p.t,exitT:TO,why:'akhir data',r:(p.last-p.entry)*(p.long?1:-1)/p.risk-((p.entry+p.last)*COST)/p.risk,hours:(TO-p.t)/H});
  return {trades,eq};
}
function ddOf(vals){let pk=1,dd=0;for(const v of vals){const e=1+v;pk=Math.max(pk,e);dd=Math.max(dd,(pk-e)/pk);}return dd;}
let seed=99;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
function mc95(rs){if(rs.length<2)return 0;const a=rs.slice(),v=[];for(let k=0;k<2000;k++){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const tt=a[i];a[i]=a[j];a[j]=tt;}let e=1,pk=1,dd=0;for(const r of a){e+=r*RISK;pk=Math.max(pk,e);dd=Math.max(dd,(pk-e)/pk);}v.push(dd);}v.sort((x,y)=>x-y);return v[1900];}
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN,f=v=>Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(2):'—',pc=v=>(100*v).toFixed(0)+'%';
const out={};
console.log(dir,fromS,'→',toS,'| pair:',syms.length,'| risiko 0,5% | biaya 0,07%/sisi');
for(const L of LS){
  const {trades,eq}=run(L),rs=trades.map(x=>x.r),h1=trades.filter(x=>x.t<HALF).map(x=>x.r),h2=trades.filter(x=>x.t>=HALF).map(x=>x.r);
  const dd=ddOf(eq),mc=mc95(trades.slice().sort((a,b)=>a.exitT-b.exitT).map(x=>x.r));
  const side=s=>{const x=trades.filter(y=>y.side===s).map(y=>y.r);return {n:x.length,R:mean(x)};};
  const hours=trades.map(x=>x.hours).sort((a,b)=>a-b);
  const ok=trades.length>=60&&mean(rs)>=0.10&&mean(h1)>0&&mean(h2)>0&&dd<=0.20&&mc<=0.20;
  out[L]={n:trades.length,R:mean(rs),total:rs.reduce((a,b)=>a+b,0),paruh1:mean(h1),paruh2:mean(h2),winRate:rs.filter(r=>r>0).length/rs.length,ddHarian:dd,mc95:mc,long:side('long'),short:side('short'),medianJam:hours[hours.length>>1],returnPct:eq.length?eq[eq.length-1]:0,lulus:ok};
  const o=out[L];
  console.log(' L='+L,'|',o.n,'trade',f(o.R)+'R','win',pc(o.winRate),'(LONG',o.long.n,f(o.long.R),'· SHORT',o.short.n,f(o.short.R)+')','| paruh',f(o.paruh1),f(o.paruh2),'| total',f(o.total)+'R ≈',pc(o.returnPct),'| DD harian',pc(dd),'MC95',pc(mc),'| median tahan',o.medianJam.toFixed(0)+' jam |',ok?'LULUS':'gagal');
}
fs.writeFileSync('hasil-intraday-'+fromS+'.json',JSON.stringify(out,null,1));
