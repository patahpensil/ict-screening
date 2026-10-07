'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const E=require('../engine/trend');
const T=require('../app/tracker');
const D=require('../app/marketdata');
let count=0;const failures=[];
function test(name,fn){try{fn();count++;console.log('PASS '+name);}catch(e){failures.push(name);console.log('FAIL '+name+' — '+String(e.message).split('\n')[0]);}}
const DAY=86400000;
// Candle 1D dari daftar close (high/low ±1%), deterministik.
const fromCloses=(closes,t0=0)=>closes.map((c,i)=>{const o=i?closes[i-1]:c;return {t:t0+i*DAY,ct:t0+(i+1)*DAY-1,open:o,close:c,high:Math.max(o,c)*1.01,low:Math.min(o,c)*0.99,volume:1000,quoteVolume:1000*c,takerBuyQuote:600*c};});
const wave=(n,base)=>Array.from({length:n},(_,i)=>base*(1+0.02*Math.sin(i/4)));
const breakUp=fromCloses([...wave(100,10),12]),breakDown=fromCloses([...wave(100,10),8]),inside=fromCloses(wave(101,10));
const NOW=1e15;
test('close di atas high 55 hari → LONG, di bawah low 55 hari → SHORT, di dalam kisaran → tanpa sinyal',()=>{
  const u=E.evaluate(breakUp,{now:NOW}),d=E.evaluate(breakDown,{now:NOW}),f=E.evaluate(inside,{now:NOW});
  assert.equal(u.side,'long');assert.equal(u.decision,'LONG');assert.equal(d.side,'short');assert.equal(f.side,null);assert.equal(f.plan,null);assert.equal(f.decision,'SKIP');
  assert(u.distLong>0&&f.distLong<0&&f.distShort<0);
});
test('level 55 hari tidak memakai candle sinyal itu sendiri; exit 20 hari memakai 20 candle terakhir',()=>{
  const e=E.evaluate(breakUp,{now:NOW}),c=e.candles,i=c.length-1;
  assert.equal(e.high55,Math.max(...c.slice(i-55,i).map(x=>x.high)));assert.equal(e.low55,Math.min(...c.slice(i-55,i).map(x=>x.low)));
  assert.equal(e.exitLong,Math.min(...c.slice(i-19).map(x=>x.low)));assert.equal(e.exitShort,Math.max(...c.slice(i-19).map(x=>x.high)));
});
test('rencana: entry = harga saat sinyal, SL = entry ∓ 2 × ATR20 Wilder, tanpa TP, label tahap ikut',()=>{
  const e=E.evaluate(breakUp,{now:NOW,lastPrice:12.1}),N=E.atr(e.candles)[e.candles.length-1];
  assert.equal(e.plan.entry,12.1);assert(Math.abs(e.plan.sl-(12.1-2*N))<1e-12);assert.equal(e.plan.risk,2*N);assert.equal(e.plan.tp,null);assert.equal(e.plan.exitLevel,e.exitLong);
  const s=E.evaluate(breakDown,{now:NOW,lastPrice:7.9});assert(Math.abs(s.plan.sl-(7.9+2*s.atr))<1e-12);
  assert.equal(e.plan.stage,E.VALIDATION.stage);assert.equal(T.create('X',e,0).stage,E.VALIDATION.stage);assert.equal(T.create('X',e,0).engine,'turtle-v1');
});
test('ATR Wilder: rata-rata TR 1..20 di indeks 20, lalu (N×19 + TR)/20',()=>{
  const c=breakUp,n=E.atr(c),tr=i=>Math.max(c[i].high-c[i].low,Math.abs(c[i].high-c[i-1].close),Math.abs(c[i].low-c[i-1].close));
  let s=0;for(let i=1;i<=20;i++)s+=tr(i);assert.equal(n[19],null);assert(Math.abs(n[20]-s/20)<1e-12);assert(Math.abs(n[21]-(n[20]*19+tr(21))/20)<1e-12);
});
test('candle yang belum close diabaikan; data < 57 hari tidak memberi sinyal',()=>{
  const open=Object.assign({},breakUp.at(-1),{ct:NOW});const e=E.evaluate(breakUp.slice(0,-1).concat(open),{now:NOW-1});
  assert.equal(e.candles.length,100);assert.equal(e.side,null);
  assert.equal(E.evaluate(fromCloses([...wave(55,10),12]),{now:NOW}).decision,'SKIP');
});
test('exit 20 hari: hanya candle yang close sesudah fill; LONG keluar saat close < low 20 hari sebelumnya',()=>{
  const c=fromCloses([...wave(60,10),12,12.5,13,9]);const fill=c[60].ct+1;
  const r={status:'running',engine:'turtle-v1',side:'long',filledAt:fill};
  const x=E.exitSignal(r,c);assert.equal(x.price,9);assert.equal(x.at,c[63].ct);
  assert.equal(E.exitSignal(Object.assign({},r,{filledAt:c[63].ct}),c),null);
  assert.equal(E.exitSignal(Object.assign({},r,{status:'armed'}),c),null);
  const s=fromCloses([...wave(60,10),8,7.5,11]);assert.equal(E.exitSignal({status:'running',engine:'turtle-v1',side:'short',filledAt:s[60].ct+1},s).price,11);
});
test('drawdown jurnal pada risiko 0,5%: hanya hasil turtle-v1 yang selesai, urut waktu keluar',()=>{
  const h=[{engine:'turtle-v1',r:4,closedAt:1},...Array.from({length:30},(_,k)=>({engine:'turtle-v1',r:-1,closedAt:2+k})),{engine:'trend-v1',r:-50,closedAt:99},{engine:'turtle-v1',r:null,closedAt:100}];
  const dd=E.drawdown(h);assert.equal(dd.trades,31);assert(Math.abs(dd.current-0.15/1.02)<1e-12);assert(dd.current<E.RULES.maxDrawdown);
  assert(E.drawdown(Array.from({length:45},(_,k)=>({engine:'turtle-v1',r:-1,closedAt:k}))).current>=E.RULES.maxDrawdown);
});
test('ukuran posisi = modal × 0,5% ÷ jarak entry–SL',()=>{const z=E.positionSize(1000,{entry:10,sl:9});assert.equal(z.riskUsd,5);assert.equal(z.qty,5);assert.equal(z.notional,50);assert.equal(E.positionSize(0,{entry:10,sl:9}),null);});
test('universe: prefilter 250 volume 24 jam, lalu Top 100 volume 30 hari (urutan = prioritas slot)',()=>{
  const rows=Array.from({length:280},(_,i)=>({symbol:'P'+String(i).padStart(3,'0'),quoteVolume:i}));assert.equal(E.rankUniverse(rows).length,250);
  const ev=Array.from({length:130},(_,i)=>({symbol:'Q'+i,evaluation:{volume30:i}}));const top=E.topByVolume30(ev);assert.equal(top.length,100);assert.equal(top[0].evaluation.volume30,129);
  const c=breakUp,i=c.length-1;assert.equal(E.volume30(c,i),c.slice(i-30,i).reduce((a,x)=>a+x.quoteVolume,0));
});
// ---------- Kesetaraan dengan simulasi riset ----------
// Data sintetis beberapa pair dijalankan lewat skrip riset research/turtle-v1-2026-10-07/turtle-portfolio.js, lalu diputar
// ulang dengan fungsi engine aplikasi (evaluate untuk sinyal & SL, exitSignal untuk exit 20 hari) memakai aturan portofolio
// yang sama. Jumlah trade dan total R harus identik.
test('engine aplikasi menghasilkan trade yang sama persis dengan simulasi riset turtle-v1',()=>{
  let seed=7;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
  const t0=Date.parse('2020-01-01'),days=420,pairs={};
  for(let k=0;k<7;k++){let p=10+k,drift=0;const c=[];for(let i=0;i<days;i++){if(i%60===0)drift=(rnd()-0.5)*0.012;const o=p;p=Math.max(0.5,p*(1+drift+(rnd()-0.5)*0.05));const hi=Math.max(o,p)*(1+rnd()*0.02),lo=Math.min(o,p)*(1-rnd()*0.02);c.push({t:t0+i*DAY,ct:t0+(i+1)*DAY-1,open:o,high:hi,low:lo,close:p,quoteVolume:1e6*(1+k)*(1+rnd())});}pairs['S'+k+'USDT']=c;}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'turtle-eq-'));
  try{
    for(const [s,c] of Object.entries(pairs))fs.writeFileSync(path.join(dir,s+'_1d.json'),JSON.stringify(c));
    const from='2020-04-01',to='2021-02-01';
    execFileSync(process.execPath,[path.join(__dirname,'../research/turtle-v1-2026-10-07/turtle-portfolio.js'),dir,from,to,'2020-09-01','3','-','0.005'],{cwd:dir,stdio:'pipe'});
    const ref=JSON.parse(fs.readFileSync(path.join(dir,'hasil-turtle-'+path.basename(dir)+'-'+from+'-risk0.005.json'),'utf8'))['3'];
    // Putar ulang dengan engine aplikasi.
    const K=3,COST=0.0007,idx={};for(const [s,c] of Object.entries(pairs))idx[s]=new Map(c.map((x,i)=>[Math.floor(x.t/DAY),i]));
    const open=[],rs=[];
    for(let d=Math.floor(Date.parse(from)/DAY);d<Math.floor(Date.parse(to)/DAY);d++){
      for(let j=open.length-1;j>=0;j--){
        const p=open[j],c=pairs[p.sym],i=idx[p.sym].get(d);if(i==null)continue;const x=c[i];let px=null;
        if(p.long?x.low<=p.sl:x.high>=p.sl)px=p.long?Math.min(x.open,p.sl):Math.max(x.open,p.sl);
        else{const e=E.exitSignal({status:'running',engine:'turtle-v1',side:p.long?'long':'short',filledAt:p.t},c.slice(0,i+1));if(e&&e.at===x.ct)px=e.price;}
        if(px!=null){rs.push((px-p.entry)*(p.long?1:-1)/p.risk-((p.entry+px)*COST)/p.risk);open.splice(j,1);}else p.last=x.close;
      }
      const uni=[];for(const s of Object.keys(pairs)){const i=idx[s].get(d);if(i==null)continue;const ev=E.evaluate(pairs[s].slice(0,i+1),{now:Infinity});if(ev.candles.length>=E.RULES.minCandles&&ev.atr>0)uni.push({symbol:s,evaluation:ev});}
      const sig={long:[],short:[]};
      for(const r of E.topByVolume30(uni))if(!open.some(p=>p.sym===r.symbol)&&r.evaluation.plan)sig[r.evaluation.side].push(r);
      for(const side of ['long','short']){let n=open.filter(p=>p.long===(side==='long')).length;for(const r of sig[side]){if(n>=K)break;const p=r.evaluation.plan;open.push({sym:r.symbol,long:side==='long',entry:p.entry,sl:p.sl,risk:p.risk,t:p.signalAt,last:p.entry});n++;}}
    }
    for(const p of open)rs.push((p.last-p.entry)*(p.long?1:-1)/p.risk-((p.entry+p.last)*COST)/p.risk);
    assert(ref.n>=10,'data sintetis harus menghasilkan cukup trade, dapat '+ref.n);
    assert.equal(rs.length,ref.n);assert(Math.abs(rs.reduce((a,b)=>a+b,0)-ref.total)<1e-9,'total R beda: '+rs.reduce((a,b)=>a+b,0)+' vs '+ref.total);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
// ---------- Tracker ----------
const plan=(side,entry,risk,at)=>({engine:'turtle-v1',side,plan:{entry,sl:side==='long'?entry-risk:entry+risk,initialSl:side==='long'?entry-risk:entry+risk,risk,tp:null,rr:null,exitLevel:side==='long'?entry-risk/2:entry+risk/2,signalAt:at}});
test('tracker: ARMED → RUNNING saat entry tersentuh; SL intrabar = −1R',()=>{const r=T.create('X',plan('long',100,10,5),0);assert.equal(r.id,'X|long|5');T.advance(r,{low:99,high:101},1);assert.equal(r.status,'running');assert.equal(r.filledAt,1);T.advance(r,{low:100,high:500},2);assert.equal(r.status,'running');T.advance(r,{low:89,high:95},3);assert.equal(r.outcome,'sl');assert.equal(r.r,-1);assert.equal(T.journalStatus(r),'loss');});
test('tracker: exit 20 hari menutup posisi di close itu; untung = win; hanya untuk RUNNING',()=>{const r=T.create('X',plan('long',100,10,5),0);T.exit(r,130,9);assert.equal(r.status,'armed');T.advance(r,{low:100,high:100},1);T.exit(r,130,9);assert.equal(r.outcome,'exit20');assert.equal(r.exit,130);assert(Math.abs(r.r-3)<1e-12);assert.equal(T.journalStatus(r),'win');const s=T.create('Y',plan('short',100,10,5),0);T.advance(s,{low:100,high:100},1);T.exit(s,105,9);assert(Math.abs(s.r+0.5)<1e-12);});
test('satu pair satu rencana aktif; ARMED gugur bila engine tidak lagi menghasilkannya',()=>{const run=T.create('X',plan('long',100,10,5),0);T.advance(run,{low:100,high:100},1);assert.equal(T.admit([run],T.create('X',plan('short',100,10,6),2)),false);assert.equal(T.admit([run],T.create('Y',plan('long',100,10,6),2)),true);const a=T.create('X',plan('long',100,10,5),0);assert.equal(T.expire(a,T.create('X',plan('long',100,10,6),1),2),true);assert.equal(a.outcome,'void');assert.equal(T.expire(run,null,3),false);});
test('rekaman lama trend-v1 tetap selesai lewat trailing stop; engine lama dengan TP tetap ditangani',()=>{const r=Object.assign(T.create('X',plan('long',100,10,5),0),{engine:'trend-v1',gap:10,trailing:true});T.advance(r,{low:100,high:100},1);E.trail(r,[{ct:2,close:120}]);assert.equal(r.sl,110);const t=Object.assign(T.create('Z',plan('long',100,10,5),0),{tp:130});T.advance(t,{low:100,high:100},1);T.advance(t,{low:101,high:131},2);assert.equal(t.outcome,'tp');const u=T.create('W',plan('long',100,10,5),0);T.advance(u,{low:100,high:100},1);E.trail(u,[{ct:2,close:200}]);assert.equal(u.sl,90);});
// ---------- Data pasar pelengkap ----------
const trendBars=(n,step)=>Array.from({length:n},(_,i)=>{const p=100+i*step;return {open:p,close:p+step*0.8,high:p+Math.abs(step),low:p-Math.abs(step)*0.2,volume:1};});
test('data pasar: ADX tinggi dengan +DI dominan saat naik, cermin saat turun',()=>{const u=D.adx(trendBars(60,1));assert(u.adx>40);assert(u.plusDI>u.minusDI);const d=D.adx(trendBars(60,-1));assert(d.minusDI>d.plusDI);assert.equal(D.adx(trendBars(20,1)),null);});
test('data pasar: CVD = jumlah (2 × taker buy quote − quote volume); metrik dari candle 1D',()=>{const c=[{takerBuyQuote:60,quoteVolume:100},{takerBuyQuote:30,quoteVolume:100},{takerBuyQuote:80,quoteVolume:100}];assert.equal(D.cvd(c,3),40);assert.equal(D.cvd(c,4),null);const m=D.metrics({candles:breakUp});assert(m.adx1d&&m.adx1d.adx>0);assert(Math.abs(m.cvd1d-0.2*breakUp.at(-1).quoteVolume)<1e-6);assert(Number.isFinite(m.cvd7d));});
test('data pasar: orderbook dan parsing respons Binance defensif',()=>{const b=D.depth({bids:[['100','3']],asks:[['100.1','1']]});assert.equal(Math.round(b.bidPct),75);const p=D.parse([[{sumOpenInterestValue:'100'},{sumOpenInterestValue:'110'}],[{longShortRatio:'1.5',longAccount:'0.6'}],null,[{buySellRatio:'1.2'}],null]);assert.equal(p.oiUsd,110);assert.equal(p.accounts.longPct,60);assert.equal(p.topPositions,null);assert.equal(p.book,null);});
if(failures.length){console.log('\n'+failures.length+' pemeriksaan GAGAL.');process.exit(1);}
console.log('\n'+count+' pemeriksaan engine breakout / tracker / data pasar lulus.');
