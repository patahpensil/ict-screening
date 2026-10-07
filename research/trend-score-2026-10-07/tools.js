'use strict';
// Perbandingan alat screening gaya Carver untuk crypto — parameter DIKUNCI sebelum uji (7 Okt 2026).
// trend   : EWMAC 8/32..64/256 + breakout 20..160 (sama dengan tf.js)
// relatif : momentum harga ternormalisasi-volatilitas relatif terhadap indeks crypto berbobot sama; H=20/40/80, EWMA span H/4
// carry   : -(funding harian dihaluskan EWMA 30 hari × 365) / volatilitas tahunan  (funding negatif = LONG dibayar)
// gabungan: rata-rata z-score lintas pair dari tiga skor di atas
// Ukuran: IC (korelasi peringkat Spearman skor vs return ke depan), 10 teratas/terbawah vs pasar, selisih teratas−terbawah.
const fs=require('fs'),path=require('path');
const DAY=86400000,FEE=0.0005,BASE='https://fapi.binance.com';
const P1=[Date.parse('2024-10-06'),Date.parse('2026-04-01')],P2=[Date.parse('2026-04-01'),Date.parse('2026-10-06')];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(p){for(let a=0;a<5;a++){const res=await fetch(BASE+p);if(res.status===429||res.status===418){await sleep(5000*(a+1));continue;}if(!res.ok)throw new Error(p+' HTTP '+res.status);await sleep(150);return res.json();}throw new Error('rate limit');}
async function funding(sym){
  const file=path.join('data',sym+'_funding.json');if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
  const out=[];let from=Date.parse('2024-06-01');const end=Date.parse('2026-10-07');
  while(from<end){const rows=await get(`/fapi/v1/fundingRate?symbol=${sym}&startTime=${from}&endTime=${end}&limit=1000`);if(!rows.length)break;for(const r of rows)out.push({t:r.fundingTime,r:+r.fundingRate});from=rows[rows.length-1].fundingTime+1;if(rows.length<1000)break;}
  fs.writeFileSync(file,JSON.stringify(out));return out;
}
const ewma=(x,span)=>{const a=2/(span+1),o=[];let v=null;for(const y of x){if(y==null||!Number.isFinite(y)){o.push(v);continue;}v=v==null?y:v+a*(y-v);o.push(v);}return o;};
const ewstd=(x,span)=>{const a=2/(span+1),o=[];let m=null,s2=null,n=0;for(const y of x){if(!Number.isFinite(y)){o.push(null);continue;}n++;if(m==null){m=y;s2=0;}else{const d=y-m;m+=a*d;s2=(1-a)*(s2+a*d*d);}o.push(n>=10?Math.sqrt(s2):null);}return o;};
const cap=v=>Math.max(-20,Math.min(20,v));
function trendScore(c){
  const close=c.map(x=>x.close),dprice=close.map((v,i)=>i?v-close[i-1]:null),pvol=ewstd(dprice,35),rules=[];
  for(const [f,s,sc] of [[8,32,5.3],[16,64,3.75],[32,128,2.65],[64,256,1.87]]){const ef=ewma(close,f),es=ewma(close,s);rules.push(close.map((_,i)=>i>=s&&pvol[i]>0?cap(sc*(ef[i]-es[i])/pvol[i]):null));}
  for(const [L,sc] of [[20,0.67],[40,0.70],[80,0.73],[160,0.74]]){
    const raw=close.map((v,i)=>{if(i<L)return null;let mx=-Infinity,mn=Infinity;for(let k=i-L+1;k<=i;k++){mx=Math.max(mx,close[k]);mn=Math.min(mn,close[k]);}return mx>mn?40*(v-(mx+mn)/2)/(mx-mn):0;});
    const sm=ewma(raw,Math.max(2,Math.round(L/4)));rules.push(sm.map((v,i)=>raw[i]==null||v==null?null:cap(sc*v)));}
  return close.map((_,i)=>{const v=rules.map(r=>r[i]);return v.every(x=>x!=null)?cap(v.reduce((a,b)=>a+b,0)/v.length):null;});
}
(async()=>{
  const pairs=JSON.parse(fs.readFileSync('pairs.json','utf8')),S={};
  for(const sym of pairs){
    const f1=path.join('data',sym+'_1d.json');if(!fs.existsSync(f1))continue;
    const c=JSON.parse(fs.readFileSync(f1,'utf8')).filter(x=>x.close>0);if(c.length<300)continue;
    let fr=[];try{fr=await funding(sym);}catch(e){console.log('funding gagal',sym,e.message);}
    const day=x=>Math.floor(x/DAY);
    const fday=new Map();for(const x of fr){const d=day(x.t);fday.set(d,(fday.get(d)||0)+x.r);}
    const ret=c.map((x,i)=>i?x.close/c[i-1].close-1:null),vol=ewstd(ret,35),tr=trendScore(c);
    const fser=c.map(x=>fday.has(day(x.t))?fday.get(day(x.t)):null),fsm=ewma(fser,30);
    const carry=c.map((_,i)=>fsm[i]!=null&&vol[i]>0&&fser.slice(Math.max(0,i-29),i+1).filter(v=>v!=null).length>=20?-(fsm[i]*365)/(vol[i]*Math.sqrt(365)):null);
    const norm=ret.map((r,i)=>i>0&&vol[i-1]>0?Math.max(-6,Math.min(6,r/vol[i-1])):null);
    S[sym]={c,tr,carry,norm,vol,idx:new Map(c.map((x,i)=>[day(x.t),i]))};
  }
  const syms=Object.keys(S),days=[...new Set(syms.flatMap(s=>[...S[s].idx.keys()]))].sort((a,b)=>a-b);
  // Indeks crypto berbobot sama dari return ternormalisasi; harga relatif = kumulatif (norm koin − rata-rata norm).
  const idxRet=new Map();for(const d of days){const v=syms.map(s=>{const i=S[s].idx.get(d);return i!=null?S[s].norm[i]:null;}).filter(x=>x!=null);if(v.length)idxRet.set(d,v.reduce((a,b)=>a+b,0)/v.length);}
  for(const s of syms){const o=S[s];let cum=0;const rel=o.c.map((x,i)=>{const d=Math.floor(x.t/DAY);if(o.norm[i]!=null&&idxRet.has(d))cum+=o.norm[i]-idxRet.get(d);return cum;});
    const parts=[20,40,80].map(H=>ewma(rel.map((v,i)=>i>=H?(v-rel[i-H])/H:null),Math.round(H/4)));
    o.rel=rel.map((_,i)=>{const v=parts.map(p=>p[i]);return i>=80&&v.every(x=>x!=null)?v.reduce((a,b)=>a+b,0)/3:null;});}
  const zs=a=>{const v=a.filter(x=>x!=null);const m=v.reduce((p,q)=>p+q,0)/v.length,sd=Math.sqrt(v.reduce((p,q)=>p+(q-m)**2,0)/v.length)||1;return a.map(x=>x==null?null:(x-m)/sd);};
  const rank=a=>{const idx=a.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]);const r=new Array(a.length);idx.forEach(([_,i],k)=>r[i]=k);return r;};
  const spear=(x,y)=>{const rx=rank(x),ry=rank(y),n=x.length,mx=(n-1)/2;let num=0,dx=0,dy=0;for(let i=0;i<n;i++){num+=(rx[i]-mx)*(ry[i]-mx);dx+=(rx[i]-mx)**2;dy+=(ry[i]-mx)**2;}return num/Math.sqrt(dx*dy);};
  const res={};
  for(const [pname,P] of [['Okt24–Mar26',P1],['Apr–Okt26',P2]]){
    for(const h of [7,30]){
      const acc={};
      for(const d of days){
        if(d*DAY<P[0]||d*DAY>=P[1])continue;
        const rows=[];
        for(const s of syms){const o=S[s],i=o.idx.get(d),j=o.idx.get(d+h);if(i==null||j==null)continue;rows.push({s,tr:o.tr[i],rel:o.rel[i],carry:o.carry[i],fwd:o.c[j].close/o.c[i].close-1});}
        if(rows.length<40)continue;
        const zt=zs(rows.map(r=>r.tr)),zr=zs(rows.map(r=>r.rel)),zc=zs(rows.map(r=>r.carry));
        rows.forEach((r,k)=>{const v=[zt[k],zr[k],zc[k]].filter(x=>x!=null);r.gab=v.length===3?(v[0]+v[1]+v[2])/3:null;});
        const mkt=rows.reduce((a,r)=>a+r.fwd,0)/rows.length;
        for(const tool of ['tr','rel','carry','gab']){
          const v=rows.filter(r=>r[tool]!=null);if(v.length<40)continue;
          const a=acc[tool]=acc[tool]||{ic:[],top:[],bot:[],spread:[]};
          a.ic.push(spear(v.map(r=>r[tool]),v.map(r=>r.fwd)));
          v.sort((x,y)=>y[tool]-x[tool]);const avg=q=>q.reduce((p,r)=>p+r.fwd,0)/q.length;
          const top=avg(v.slice(0,10)),bot=avg(v.slice(-10));
          a.top.push(top-mkt);a.bot.push(bot-mkt);a.spread.push(top-bot-4*FEE);
        }
      }
      for(const [tool,a] of Object.entries(acc)){
        const m=x=>x.reduce((p,q)=>p+q,0)/x.length,sd=x=>{const mm=m(x);return Math.sqrt(x.reduce((p,q)=>p+(q-mm)**2,0)/x.length);};
        const nEff=a.ic.length/h; // jendela tumpang-tindih: sampel independen ≈ hari / h
        (res[pname]=res[pname]||{})[tool+'_'+h]={hari:a.ic.length,IC:m(a.ic),IC_t:m(a.ic)/(sd(a.ic)/Math.sqrt(nEff)),teratasVsPasar:m(a.top),terbawahVsPasar:m(a.bot),selisihTeratasTerbawah:m(a.spread),selisihPositif:100*a.spread.filter(x=>x>0).length/a.spread.length};
      }
    }
  }
  const name={tr:'Trend (EWMAC+breakout)',rel:'Relative momentum',carry:'Carry (funding)',gab:'Gabungan 3 skor'};
  const pct=v=>(v>=0?'+':'')+(100*v).toFixed(2)+'%';
  for(const [p,r] of Object.entries(res)){console.log('\n===== '+p+' =====');
    for(const h of [7,30]){console.log('-- horizon '+h+' hari --');
      for(const t of ['tr','rel','carry','gab']){const x=r[t+'_'+h];if(!x)continue;
        console.log((name[t]).padEnd(24),'IC',x.IC.toFixed(3),'(t',x.IC_t.toFixed(1)+')','| 10 teratas vs pasar',pct(x.teratasVsPasar).padEnd(8),'| 10 terbawah vs pasar',pct(x.terbawahVsPasar).padEnd(8),'| selisih',pct(x.selisihTeratasTerbawah),'(positif',x.selisihPositif.toFixed(0)+'%)');}}}
  fs.writeFileSync('hasil-alat.json',JSON.stringify(res,null,1));
})().catch(e=>{console.error('ERR',e.stack);process.exit(1);});
