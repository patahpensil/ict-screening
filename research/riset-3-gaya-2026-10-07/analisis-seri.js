'use strict';
// Analisis ketahanan (setelah hasil dev terlihat — bukan bagian syarat lulus yang dikunci):
// 1) sinyal yang muncul pada waktu yang sama diurutkan ACAK (bukan abjad) saat memilih maks 5 posisi; diulang 500 kali.
// 2) sebaran R: median, porsi 3 trade terbaik, rata-rata tanpa 3 trade terbaik.
const fs=require('fs');const MODE=process.argv[2]||'dev';
const T=JSON.parse(fs.readFileSync('trade-riset3-'+MODE+'.json','utf8'));
const half=MODE==='holdout'?Date.parse('2023-01-01'):Date.parse('2025-10-06');
let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
function cap(tr){const a=tr.map(x=>({x,k:rnd()})).sort((p,q)=>p.x[1]-q.x[1]||p.k-q.k).map(p=>p.x);const acc=[],open=[];for(const t of a){for(let i=open.length-1;i>=0;i--)if(open[i]<=t[1])open.splice(i,1);if(open.length>=5)continue;open.push(t[2]);acc.push(t);}return acc;}
function dd(rs){let e=0,p=0,d=0;for(const r of rs){e+=r*0.01;p=Math.max(p,e);d=Math.max(d,p-e);}return d;}
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:NaN,q=(a,f)=>{const b=a.slice().sort((x,y)=>x-y);return b[Math.floor(f*(b.length-1))];};
const f=v=>(v>=0?'+':'')+v.toFixed(2);
for(const [k,all] of Object.entries(T))for(const side of ['long','short']){
  const tr=all.filter(x=>x[3]===side);if(!tr.length)continue;
  const runs=[];for(let r=0;r<500;r++){const c=cap(tr),rs=c.map(x=>x[5]);const h1=c.filter(x=>x[1]<half).map(x=>x[5]),h2=c.filter(x=>x[1]>=half).map(x=>x[5]);
    const ddv=dd(c.slice().sort((a,b)=>a[2]-b[2]).map(x=>x[5]));runs.push({n:c.length,m:mean(rs),ok:c.length>=60&&mean(rs)>=0.10&&mean(h1)>0&&mean(h2)>0&&ddv<=0.20,dd:ddv});}
  const ms=runs.map(x=>x.m),rsAll=tr.map(x=>x[5]).sort((a,b)=>b-a);
  console.log(k.padEnd(44),side.padEnd(5),'acak: R/trade median',f(q(ms,0.5)),'[p5',f(q(ms,0.05)),'p95',f(q(ms,0.95))+']','n~'+q(runs.map(x=>x.n),0.5),'DD median',(100*q(runs.map(x=>x.dd),0.5)).toFixed(0)+'%','lulus (tanpa MC)',(100*runs.filter(x=>x.ok).length/runs.length).toFixed(0)+'%',
    '| semua trade: median R',f(q(rsAll,0.5)),'3 terbaik',rsAll.slice(0,3).map(f).join('/'),'rata2 tanpa 3 terbaik',f(mean(rsAll.slice(3))));
}
