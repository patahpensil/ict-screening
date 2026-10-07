'use strict';
// Laboratorium konsep: ICT + CRT + indikator pendukung.
// Protokol: data latih (100 pair) dan data cek (50 pair disisihkan) pada Okt 2024 – Mar 2026.
// Data uji akhir (Apr – Okt 2026) TIDAK pernah dibaca oleh mode "cari"; hanya mode "uji" yang membukanya, sekali.
const fs=require('fs'),path=require('path');
const E=require('./malomo_new.js'),D=require('./marketdata.js');
const BASE='https://fapi.binance.com',H=3600000,DAY=24*H,FEE=0.0005;
const TF_MS={'1h':H,'4h':4*H,'1d':DAY};
const TRAIN_FROM=Date.parse('2024-10-06T00:00:00Z'),SPLIT=Date.parse('2026-04-01T00:00:00Z'),TEST_TO=Date.parse('2026-10-06T00:00:00Z');
const DATA_DIR='data';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(p){for(let a=0;a<5;a++){const res=await fetch(BASE+p);if(res.status===429||res.status===418){await sleep(5000*(a+1));continue;}if(!res.ok)throw new Error(p+' HTTP '+res.status);await sleep(120);return res.json();}throw new Error('rate limit');}
async function klines(sym,tf,start,end){
  const file=path.join(DATA_DIR,sym+'_'+tf+'.json');
  if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
  const out=[];let from=start;
  while(from<end){
    const rows=await get(`/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${tf}&startTime=${from}&endTime=${end}&limit=1500`);
    if(!rows.length)break;
    for(const k of rows)out.push({t:k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],ct:k[6],quoteVolume:+k[7],takerBuyQuote:+k[10]});
    from=rows[rows.length-1][0]+TF_MS[tf];if(rows.length<1500)break;
  }
  fs.writeFileSync(file,JSON.stringify(out));return out;
}
const atrAt=(c,i,n=14)=>{if(i<n)return null;let s=0;for(let k=i-n+1;k<=i;k++)s+=Math.max(c[k].high-c[k].low,Math.abs(c[k].high-c[k-1].close),Math.abs(c[k].low-c[k-1].close));return s/n;};
// Konteks ICT dan indikator pada setiap close 4H (dihitung sekali per pair).
function context(d1,h4){
  const out=[];let pd=-1,fdAt=-1,fd=null;
  for(let j=0;j<h4.length;j++){
    const t=h4[j].ct;while(pd+1<d1.length&&d1[pd+1].ct<=t)pd++;
    if(pd<60||j<60){out.push({t,bias:null});continue;}
    if(fdAt!==pd){fd=E.frame(d1.slice(Math.max(0,pd-399),pd+1));fdAt=pd;}
    const fh=E.frame(h4.slice(Math.max(0,j-399),j+1));
    const bias=E.direction(fd,fh),adx=D.adx(fh.candles);
    const emaSide=[21,30,50].every(k=>fd.ema[k]!=null&&fd.last>fd.ema[k])?'atas':[21,30,50].every(k=>fd.ema[k]!=null&&fd.last<fd.ema[k])?'bawah':'campur';
    out.push({t,bias,adx:adx?adx.adx:null,regime:fh.quality.volatility.regime,er:fh.quality.trendEfficiency.label,ema1d:emaSide,
      dHigh:fh.structure.high?.price??null,dLow:fh.structure.low?.price??null});
  }
  return out;
}
// Sinyal CRT: range = candle `rtf` yang sudah close; sweep high/low di periode berikutnya lalu close 1H kembali di dalam range.
function crtSignals(sym,h1,range,rtf,ctx,cfg){
  const sig=[];let hi=0,ci=0;
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
        const inside=side==='short'?c.close<Hh&&c.close>Ll:c.close>Ll&&c.close<Hh;
        if(!inside)continue;
        let entryIdx=k;
        if(cfg.entry==='mss'){ // MSS 1H: close menembus swing 1H yang terbentuk setelah sweep dimulai
          entryIdx=-1;
          for(let m=k;m<h1.length&&h1[m].t<next.ct+TF_MS[rtf];m++){
            const piv=[];for(let q=sweep.start;q<=m-2;q++){if(q<2)continue;const a=h1[q];const nb=[h1[q-2],h1[q-1],h1[q+1],h1[q+2]];if(side==='short'?nb.every(x=>a.low<x.low):nb.every(x=>a.high>x.high))piv.push(a);}
            // Close kembali di luar range = breakout, bukan sweep: setup batal.
            if(side==='short'?h1[m].close>Hh:h1[m].close<Ll)break;
            sweep.ext=side==='short'?Math.max(sweep.ext,h1[m].high):Math.min(sweep.ext,h1[m].low);
            const last=piv[piv.length-1];
            if(last&&(side==='short'?h1[m].close<last.low:h1[m].close>last.high)){entryIdx=m;break;}
          }
          if(entryIdx<0){done=true;break;}
        }
        const e=h1[entryIdx],entry=e.close,atr=atrAt(h1,entryIdx)||0,buf=cfg.slBuffer*atr;
        const sl=side==='short'?sweep.ext+buf:sweep.ext-buf,risk=Math.abs(entry-sl);
        if(!(risk>0)){done=true;break;}
        let tp;
        if(cfg.target==='mid')tp=(Hh+Ll)/2;else if(cfg.target==='opposite')tp=side==='short'?Ll:Hh;else tp=side==='short'?entry-cfg.target*risk:entry+cfg.target*risk;
        if(side==='short'?tp>=entry:tp<=entry){done=true;break;}
        while(ci+1<ctx.length&&ctx[ci+1].t<=e.ct)ci++;
        const cx=ctx[ci]&&ctx[ci].t<=e.ct?ctx[ci]:{};
        const sc=h1[sweep.start],avg=sweep.start>=20?h1.slice(sweep.start-20,sweep.start).reduce((s,x)=>s+x.volume,0)/20:null;
        const rAtr=atrAt(range,r);
        sig.push({sym,t:e.ct,idx:entryIdx,side,entry,sl,tp,risk,rr:Math.abs(tp-entry)/risk,
          f:{bias:cx.bias===(side==='long'?'bullish':'bearish')?'searah':cx.bias?'berlawanan':'netral',adx:cx.adx,regime:cx.regime,er:cx.er,
            ema1d:cx.ema1d==='atas'?(side==='long'?'searah':'berlawanan'):cx.ema1d==='bawah'?(side==='short'?'searah':'berlawanan'):'campur',
            lokasi:cx.dHigh&&cx.dLow?((side==='short'?(Hh+Ll)/2>(cx.dHigh+cx.dLow)/2:(Hh+Ll)/2<(cx.dHigh+cx.dLow)/2)?'sesuai':'tidak sesuai'):'-',
            rvolSweep:avg?sc.volume/avg:null,cvdSweep:Number.isFinite(sc.takerBuyQuote)?((2*sc.takerBuyQuote-sc.quoteVolume)>0?(side==='long'?'searah':'berlawanan'):(side==='short'?'searah':'berlawanan')):'-',
            rangeAtr:rAtr?(Hh-Ll)/rAtr:null}});
        done=true;
      }
    }
  }
  return sig;
}
// Simulasi: entry market di close sinyal, SL lebih dulu bila SL & TP tersentuh di candle sama, batas 30 hari, satu posisi per pair.
function simulate(h1,signals){
  const trades=[];let busyUntil=0;
  for(const s of signals){
    if(s.t<busyUntil)continue;
    const long=s.side==='long';let out=null;
    for(let k=s.idx+1;k<h1.length;k++){
      const c=h1[k];
      if(long?c.low<=s.sl:c.high>=s.sl){out={o:'sl',px:s.sl,t:c.ct};break;}
      if(long?c.high>=s.tp:c.low<=s.tp){out={o:'tp',px:s.tp,t:c.ct};break;}
      if(c.ct-s.t>30*DAY){out={o:'waktu',px:c.close,t:c.ct};break;}
    }
    if(!out)continue;
    const r=(out.px-s.entry)*(long?1:-1)/s.risk,fee=(s.entry+out.px)*FEE/s.risk;
    trades.push({...s,outcome:out.o,r,rNet:r-fee,closed:out.t});busyUntil=out.t;
  }
  return trades;
}
const stat=t=>{const n=t.length,w=t.filter(x=>x.rNet>0).length,s=t.reduce((q,x)=>q+x.rNet,0),gp=t.filter(x=>x.rNet>0).reduce((q,x)=>q+x.rNet,0),gl=-t.filter(x=>x.rNet<0).reduce((q,x)=>q+x.rNet,0);
  return {n,win:n?100*w/n:null,exp:n?s/n:null,total:s,pf:gl>0?gp/gl:null};};
function configs(){
  const out=[];
  for(const rtf of ['1d','4h'])for(const entry of ['close','mss'])for(const target of ['mid','opposite',2,3])for(const bias of ['semua','searah'])
    out.push({id:[rtf,entry,'tp-'+target,'bias-'+bias].join('|'),rtf,entry,target,bias,slBuffer:0.1,filters:[]});
  return out;
}
const FILTERS={
  'adx>=20':f=>f.adx!=null&&f.adx>=20,'adx<20':f=>f.adx!=null&&f.adx<20,
  'regime!=contraction':f=>f.regime&&f.regime!=='contraction','regime=contraction':f=>f.regime==='contraction',
  'er!=choppy':f=>f.er&&f.er!=='choppy',
  'ema1d searah':f=>f.ema1d==='searah','ema1d berlawanan':f=>f.ema1d==='berlawanan',
  'lokasi sesuai':f=>f.lokasi==='sesuai',
  'rvolSweep>=1.1':f=>f.rvolSweep!=null&&f.rvolSweep>=1.1,'rvolSweep<1.1':f=>f.rvolSweep!=null&&f.rvolSweep<1.1,
  'cvdSweep searah':f=>f.cvdSweep==='searah','cvdSweep berlawanan':f=>f.cvdSweep==='berlawanan',
  'rangeAtr>=1':f=>f.rangeAtr!=null&&f.rangeAtr>=1,'rangeAtr<1':f=>f.rangeAtr!=null&&f.rangeAtr<1,
};
const pass=(s,cfg)=>(cfg.bias==='semua'||s.f.bias==='searah')&&cfg.filters.every(k=>FILTERS[k](s.f));
(async()=>{
  const mode=process.argv[2]||'cari';
  fs.mkdirSync(DATA_DIR,{recursive:true});
  const info=await get('/fapi/v1/exchangeInfo'),tick=await get('/fapi/v1/ticker/24hr');
  const live=new Set(info.symbols.filter(x=>x.quoteAsset==='USDT'&&x.contractType==='PERPETUAL'&&x.status==='TRADING').map(x=>x.symbol));
  const pairs=fs.existsSync('pairs.json')?JSON.parse(fs.readFileSync('pairs.json','utf8'))
    :tick.filter(x=>live.has(x.symbol)&&/^[A-Z0-9]+$/.test(x.symbol)).sort((a,b)=>+b.quoteVolume-+a.quoteVolume).slice(0,150).map(x=>x.symbol);
  fs.writeFileSync('pairs.json',JSON.stringify(pairs));
  const checkSet=new Set(pairs.filter((_,i)=>i%3===2)); // tiap pair ke-3 disisihkan sebagai data cek
  const list=mode==='uji'?JSON.parse(fs.readFileSync('finalis.json','utf8')):configs();
  const variants=mode==='cari'?null:list;
  const signalsBy={};// key rtf|entry|target -> per pair signals
  const buckets={};
  for(const sym of pairs){
    let d1,h4,h1;
    try{d1=await klines(sym,'1d',TRAIN_FROM-420*DAY,TEST_TO);h4=await klines(sym,'4h',TRAIN_FROM-80*DAY,TEST_TO);h1=await klines(sym,'1h',TRAIN_FROM-30*DAY,TEST_TO);}
    catch(e){console.log('lewati',sym,e.message);continue;}
    // Mode cari: data dipotong di SPLIT sehingga periode uji tidak pernah terbaca.
    const cut=mode==='uji'?TEST_TO:SPLIT;
    d1=d1.filter(x=>x.ct<=cut);h4=h4.filter(x=>x.ct<=cut);h1=h1.filter(x=>x.ct<=cut);
    const ctx=context(d1,h4);
    const group=mode==='uji'?'uji':checkSet.has(sym)?'cek':'latih';
    const gen=new Map();
    for(const cfg of (variants||configs())){
      const gk=[cfg.rtf,cfg.entry,cfg.target].join('|');
      if(!gen.has(gk))gen.set(gk,crtSignals(sym,h1,cfg.rtf==='1d'?d1:h4,cfg.rtf,ctx,cfg).filter(s=>s.t>=TRAIN_FROM&&(mode==='uji'?s.t>=SPLIT:s.t<SPLIT)));
      const trades=simulate(h1,gen.get(gk).filter(s=>pass(s,cfg)));
      const key=cfg.id+(cfg.filters.length?'|'+cfg.filters.join('+'):'');
      (buckets[key]=buckets[key]||{cfg,latih:[],cek:[],uji:[]})[group].push(...trades.map(t=>({sym:t.sym,t:t.t,side:t.side,rr:t.rr,outcome:t.outcome,rNet:t.rNet,f:t.f})));
    }
    console.log(new Date().toISOString().slice(11,19),mode,group,sym,'selesai');
  }
  fs.writeFileSync(mode==='uji'?'hasil-uji.json':'hasil-cari.json',JSON.stringify(buckets));
  console.log('SELESAI');
})().catch(e=>{console.error('ERR',e.stack);process.exit(1);});
