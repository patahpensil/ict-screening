'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{execFileSync}=require('node:child_process');
const T=require('../engine/trend');
const I=require('../engine/intraday');
const K=require('../app/tracker');
let count=0;const failures=[];
function test(name,fn){try{fn();count++;console.log('PASS '+name);}catch(e){failures.push(name);console.log('FAIL '+name+' — '+String(e.message).split('\n')[0]);}}
const H=3600000,NOW=1e15;
// Candle dari daftar close (high/low ±1%) dengan panjang candle step.
const bars=(closes,step,t0=0)=>closes.map((c,i)=>{const o=i?closes[i-1]:c;return {t:t0+i*step,ct:t0+(i+1)*step-1,open:o,close:c,high:Math.max(o,c)*1.01,low:Math.min(o,c)*0.99,quoteVolume:1000*c};});
const wave=(n,base,k=4)=>Array.from({length:n},(_,i)=>base*(1+0.02*Math.sin(i/k)));
const up4=bars([...wave(200,10),12],4*H),down4=bars([...wave(200,10),8],4*H),flat4=bars(wave(201,10),4*H),h1=bars(wave(100,12,3),H);
test('close 4H di atas high 55 candle 4H → LONG, di bawah low 55 → SHORT, di dalam kisaran → tanpa sinyal',()=>{
  const u=I.evaluate(up4,h1,{now:NOW}),d=I.evaluate(down4,h1,{now:NOW}),f=I.evaluate(flat4,h1,{now:NOW});
  assert.equal(u.side,'long');assert.equal(d.side,'short');assert.equal(f.side,null);assert.equal(f.plan,null);assert.equal(u.engine,'intraday-v1');
  const c=u.candles,i=c.length-1;assert.equal(u.high55,Math.max(...c.slice(i-55,i).map(x=>x.high)));
});
test('rencana: entry = harga saat sinyal, SL = entry ∓ 2 × ATR20 candle 1H, exit = 20 candle 1H, label INTRADAY',()=>{
  const e=I.evaluate(up4,h1,{now:NOW,lastPrice:12.1}),N=T.atr(e.candles1h)[e.candles1h.length-1];
  assert.equal(e.plan.entry,12.1);assert(Math.abs(e.plan.sl-(12.1-2*N))<1e-12);assert.equal(e.plan.tp,null);assert.equal(e.plan.style,'intraday');assert.equal(e.plan.stage,'PAPER');
  assert.equal(e.exitLong,Math.min(...h1.slice(-20).map(x=>x.low)));assert.equal(e.plan.exitLevel,e.exitLong);
  const r=K.create('X',e,0);assert.equal(r.engine,'intraday-v1');assert.equal(r.style,'intraday');
  // close 1D dan close 4H bisa bersamaan (00:00 UTC): id swing dan intraday untuk candle yang sama harus berbeda
  const sw=K.create('X',{engine:'turtle-v1',side:'long',plan:Object.assign({},e.plan)},0);assert.equal(sw.id,'X|long|'+e.plan.signalAt);assert.notEqual(r.id,sw.id);
});
test('data 4H < 181 candle (volume 30 hari) atau 1H < 21 candle → tanpa rencana',()=>{
  assert.equal(I.evaluate(bars([...wave(150,10),12],4*H),h1,{now:NOW}).plan,null);assert.equal(I.evaluate(up4,h1.slice(0,15),{now:NOW}).plan,null);
});
test('exit intraday: close 1H sesudah fill menembus low 20 candle 1H sebelumnya; engine lain diabaikan',()=>{
  const c=bars([...wave(40,12,3),12.5,13,9],H),r={status:'running',engine:'intraday-v1',side:'long',filledAt:c[40].ct+1};
  assert.deepEqual(I.exitSignal(r,c),{price:9,at:c[42].ct});assert.equal(I.exitSignal(Object.assign({},r,{engine:'turtle-v1'}),c),null);
  assert.equal(T.exitSignal(Object.assign({},r,{engine:'intraday-v1'}),c),null);
});
test('drawdown dihitung per engine (swing dan intraday terpisah)',()=>{
  const h=[...Array.from({length:45},(_,k)=>({engine:'intraday-v1',r:-1,closedAt:k})),{engine:'turtle-v1',r:1,closedAt:99}];
  assert(T.drawdown(h,'intraday-v1').current>=I.RULES.maxDrawdown);assert.equal(T.drawdown(h,'turtle-v1').current,0);assert.equal(T.drawdown(h).trades,1);
});
// ---------- Kesetaraan dengan skrip uji intraday ----------
test('engine intraday aplikasi menghasilkan trade yang sama persis dengan skrip uji research/intraday-4h-1h-2026-10-08',()=>{
  let seed=11;const rnd=()=>{seed=(seed*1103515245+12345)%2147483648;return seed/2147483648;};
  const t0=Date.parse('2024-01-01'),hours=24*110,pairs={};
  for(let k=0;k<6;k++){let p=10+k,drift=0;const h=[];for(let i=0;i<hours;i++){if(i%240===0)drift=(rnd()-0.5)*0.004;const o=p;p=Math.max(0.5,p*(1+drift+(rnd()-0.5)*0.012));h.push({t:t0+i*H,ct:t0+(i+1)*H-1,open:o,high:Math.max(o,p)*(1+rnd()*0.004),low:Math.min(o,p)*(1-rnd()*0.004),close:p,quoteVolume:1e5*(1+k)*(1+rnd())});}
    const c4=[];for(let i=0;i+4<=h.length;i+=4){const g=h.slice(i,i+4);c4.push({t:g[0].t,ct:g[3].ct,open:g[0].open,high:Math.max(...g.map(x=>x.high)),low:Math.min(...g.map(x=>x.low)),close:g[3].close,quoteVolume:g.reduce((a,x)=>a+x.quoteVolume,0)});}
    pairs['S'+k+'USDT']={h,c4};}
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'intra-eq-'));
  try{
    for(const [s,o] of Object.entries(pairs)){fs.writeFileSync(path.join(dir,s+'_1h.json'),JSON.stringify(o.h));fs.writeFileSync(path.join(dir,s+'_4h.json'),JSON.stringify(o.c4));}
    const from='2024-02-05',to='2024-04-18';
    execFileSync(process.execPath,[path.join(__dirname,'../research/intraday-4h-1h-2026-10-08/intraday.js'),dir,from,to,'2024-03-10','55'],{cwd:dir,stdio:'pipe'});
    const ref=JSON.parse(fs.readFileSync(path.join(dir,'hasil-intraday-'+from+'.json'),'utf8'))['55'];
    // Putar ulang dengan fungsi engine aplikasi (evaluate untuk sinyal & SL, exitSignal untuk exit 1H).
    const COST=0.0007,idx={},by4={};
    for(const [s,o] of Object.entries(pairs)){idx[s]=new Map(o.h.map((x,i)=>[x.t,i]));by4[s]=new Map(o.c4.map((x,i)=>[x.ct+1,i]));}
    const open=[],rs=[];
    for(let t=Date.parse(from);t<Date.parse(to);t+=H){
      for(let j=open.length-1;j>=0;j--){
        const p=open[j],h=pairs[p.sym].h,i=idx[p.sym].get(t);if(i==null)continue;const x=h[i];let px=null;
        if(p.long?x.low<=p.sl:x.high>=p.sl)px=p.long?Math.min(x.open,p.sl):Math.max(x.open,p.sl);
        else{const e=I.exitSignal({status:'running',engine:'intraday-v1',side:p.long?'long':'short',filledAt:p.t},h.slice(0,i+1));if(e&&e.at===x.ct)px=e.price;}
        if(px!=null){rs.push((px-p.entry)*(p.long?1:-1)/p.risk-((p.entry+px)*COST)/p.risk);open.splice(j,1);}else p.last=x.close;
      }
      if(((t+H)/H)%4!==0)continue;
      const uni=[];
      for(const s of Object.keys(pairs)){const i4=by4[s].get(t+H),hi=idx[s].get(t);if(i4==null||hi==null)continue;const ev=I.evaluate(pairs[s].c4.slice(0,i4+1),pairs[s].h.slice(0,hi+1),{now:Infinity});if(ev.volume30!=null&&i4>=55&&ev.atr>0)uni.push({symbol:s,evaluation:ev});}
      const sig={long:[],short:[]};
      for(const r of I.topByVolume30(uni))if(!open.some(p=>p.sym===r.symbol)&&r.evaluation.plan)sig[r.evaluation.side].push(r);
      for(const side of ['long','short']){let n=open.filter(p=>p.long===(side==='long')).length;for(const r of sig[side]){if(n>=I.RULES.maxPerSide)break;const p=r.evaluation.plan;open.push({sym:r.symbol,long:side==='long',entry:p.entry,sl:p.sl,risk:p.risk,t:t+H,last:p.entry});n++;}}
    }
    for(const p of open)rs.push((p.last-p.entry)*(p.long?1:-1)/p.risk-((p.entry+p.last)*COST)/p.risk);
    assert(ref.n>=10,'data sintetis harus menghasilkan cukup trade, dapat '+ref.n);
    assert.equal(rs.length,ref.n);assert(Math.abs(rs.reduce((a,b)=>a+b,0)-ref.total)<1e-9,'total R beda: '+rs.reduce((a,b)=>a+b,0)+' vs '+ref.total);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
if(failures.length){console.log('\n'+failures.length+' pemeriksaan GAGAL.');process.exit(1);}
console.log('\n'+count+' pemeriksaan engine intraday lulus.');
