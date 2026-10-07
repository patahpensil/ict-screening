'use strict';
// Amandemen 1: penilaian holdout dengan urutan pemilihan posisi ACAK (500 kali). Lulus bila semua syarat
// (≥60 trade, ≥ +0,10R, kedua paruh positif, DD historis & Monte Carlo p95 ≤ 20%) terpenuhi di ≥ 50% urutan.
const fs=require('fs');const MODE=process.argv[2]||'holdout';
const T=JSON.parse(fs.readFileSync('trade-riset3-'+MODE+'.json','utf8'));
const half=MODE==='holdout'?Date.parse('2023-01-01'):Date.parse('2025-10-06');
const FIN={'P3 Posisi · Turtle 55/20 1D':['short','long'],'S3 Swing · breakout 20×4H searah tren 1D':['long'],'S2 Swing · konsensus CTI 4H, TP 2R':['long'],'P1 Posisi · skor tren Carver 1D':['long']};
let seed=20221;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
function cap(tr){const a=tr.map(x=>({x,k:rnd()})).sort((p,q)=>p.x[1]-q.x[1]||p.k-q.k).map(p=>p.x);const acc=[],open=[];for(const t of a){for(let i=open.length-1;i>=0;i--)if(open[i]<=t[1])open.splice(i,1);if(open.length>=5)continue;open.push(t[2]);acc.push(t);}return acc;}
function dd(rs){let e=0,p=0,d=0;for(const r of rs){e+=r*0.01;p=Math.max(p,e);d=Math.max(d,p-e);}return d;}
function mc95(rs){const a=rs.slice(),v=[];for(let k=0;k<10000;k++){for(let i=a.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));const t=a[i];a[i]=a[j];a[j]=t;}v.push(dd(a));}v.sort((x,y)=>x-y);return v[9500];}
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:NaN,q=(a,f)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(f*(b.length-1))];};
const f=v=>Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(2):'—',pc=v=>(100*v).toFixed(0)+'%';
const out={};
for(const [k,sides] of Object.entries(FIN))for(const side of sides){
  const tr=(T[k]||[]).filter(x=>x[3]===side),runs=[];
  for(let r=0;r<500;r++){const c=cap(tr),rs=c.map(x=>x[5]),seq=c.slice().sort((a,b)=>a[2]-b[2]).map(x=>x[5]);
    const h1=mean(c.filter(x=>x[1]<half).map(x=>x[5])),h2=mean(c.filter(x=>x[1]>=half).map(x=>x[5])),d=dd(seq),m=rs.length>1?mc95(rs):NaN,e=mean(rs);
    runs.push({n:c.length,e,h1,h2,d,m,edge:c.length>=60&&e>=0.10&&h1>0&&h2>0,ok:c.length>=60&&e>=0.10&&h1>0&&h2>0&&d<=0.2&&m<=0.2});}
  const all=tr.map(x=>x[5]).sort((a,b)=>b-a),med=key=>q(runs.map(x=>x[key]),0.5);
  const worst=Math.max(med('d'),med('m')),needRisk=worst>0?Math.min(1,0.2/worst):1;
  out[k+' '+side]={trade:tr.length,median:{n:med('n'),R:med('e'),paruh2022:med('h1'),paruh2023:med('h2'),dd:med('d'),mc95:med('m')},lulusEdge:runs.filter(x=>x.edge).length/500,lulus:runs.filter(x=>x.ok).length/500,risikoAgarDD20:needRisk,
    semuaTrade:{n:all.length,R:mean(all),medianR:q(all,0.5),tigaTerbaik:all.slice(0,3),tanpaTigaTerbaik:mean(all.slice(3))}};
  const o=out[k+' '+side];
  console.log(k,side.toUpperCase(),'| median urutan acak:',o.median.n,'trade',f(o.median.R)+'R','paruh 2022/2023',f(o.median.paruh2022),f(o.median.paruh2023),'DD',pc(o.median.dd),'MC95',pc(o.median.mc95),
    '| lulus keunggulan',pc(o.lulusEdge),'lulus penuh',pc(o.lulus),o.lulus>=0.5?'→ LULUS':o.lulusEdge>=0.5?'→ lulus keunggulan, gagal risiko (risiko '+(100*needRisk).toFixed(2)+'% agar DD ≤ 20%)':'→ GAGAL',
    '|| tanpa batas:',all.length,'trade',f(o.semuaTrade.R)+'R, median',f(o.semuaTrade.medianR),'3 terbaik',o.semuaTrade.tigaTerbaik.map(f).join('/'));
}
fs.writeFileSync('hasil-holdout-acak.json',JSON.stringify(out,null,1));
