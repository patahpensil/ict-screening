'use strict';
// Backtest engine Malomo: evaluasi tiap close candle 1H, jendela 400 candle per timeframe (sama dengan aplikasi),
// simulasi pemantauan sesuai tracker (ARMED -> entry tersentuh -> RUNNING -> SL/TP), dan pencatatan kondisi
// saat plan dibentuk untuk membaca kecenderungan (kondisi yang condong ke TP atau SL).
const fs=require('fs');
const D=require('./marketdata.js');
const BASE='https://fapi.binance.com',H=3600000,DAY=24*H,WINDOW=400;
const TF_MS={'1h':H,'4h':4*H,'1d':DAY};
const FEE=0.0005; // taker per sisi
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(path){
  for(let a=0;a<5;a++){
    const res=await fetch(BASE+path);
    if(res.status===429||res.status===418){await sleep(5000*(a+1));continue;}
    if(!res.ok)throw new Error(path+' HTTP '+res.status);
    await sleep(120);return res.json();
  }
  throw new Error('rate limit');
}
async function klines(sym,tf,start,end){
  const out=[];let from=start;
  while(from<end){
    const rows=await get(`/fapi/v1/klines?symbol=${encodeURIComponent(sym)}&interval=${tf}&startTime=${from}&endTime=${end}&limit=1500`);
    if(!rows.length)break;
    for(const k of rows)out.push({t:k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],ct:k[6],quoteVolume:+k[7],takerBuyQuote:+k[10]});
    from=rows[rows.length-1][0]+TF_MS[tf];
    if(rows.length<1500)break;
  }
  return out;
}
function lastClosed(arr,t,hint){let i=hint;while(i+1<arr.length&&arr[i+1].ct<=t)i++;return i;}
const bucket=(v,edges)=>{if(!Number.isFinite(v))return '-';for(let i=0;i<edges.length;i++)if(v<edges[i])return i===0?'<'+edges[0]:edges[i-1]+'–'+edges[i];return '≥'+edges[edges.length-1];};
// Kondisi saat plan dibentuk. Hanya dibaca untuk analisis; tidak mengubah keputusan engine.
function features(E,e){
  const h=e.frames['4h'],d=e.frames['1d'],l=e.frames['1h'],long=e.side==='long',tr=e.trigger,p=e.plan;
  const emaPos=f=>[21,30,50].filter(k=>f.ema&&f.ema[k]!=null&&(long?f.last>f.ema[k]:f.last<f.ema[k])).length+'/3 searah';
  const adx=D.adx(h.candles),cvd=D.cvd(l.candles,24);
  const rv=Number.isInteger(tr.index)?E.evidence(l.candles.slice(0,tr.index+1)).rvol20:null;
  const entered=Number.isInteger(tr.enteredIdx)?l.candles[tr.enteredIdx]:null;
  const hour=new Date(tr.ct).getUTCHours(),day=new Date(tr.ct).getUTCDay();
  return {
    sisi:e.side,
    rr:bucket(p.rr,[3,4,6]),
    risikoPersen:bucket(100*p.risk/p.entry,[1,2,4,8]),
    lokasiZona:e.zone?.location||'-',
    zonaFVG:e.zone&&(e.zone.fvg||e.zone.fvg1h)?'ya':'tidak',
    pengujianZona:(tr.count||1)===1?'pertama':'ulang',
    lamaUjiJam:entered?bucket((tr.ct-entered.t)/H,[3,12,48]):'-',
    fase4H:h.structure?.phase||'-',
    er4H:h.quality?.trendEfficiency?.label||'-',
    er1D:d.quality?.trendEfficiency?.label||'-',
    regime4H:h.quality?.volatility?.regime||'data kurang',
    regime1D:d.quality?.volatility?.regime||'data kurang',
    displacement4H:h.eventEvidence?.displacement||'-',
    adx4H:adx?bucket(adx.adx,[20,25,35]):'-',
    diSearah:adx?((long?adx.plusDI>adx.minusDI:adx.minusDI>adx.plusDI)?'searah':'berlawanan'):'-',
    ema4H:emaPos(h),
    ema1D:emaPos(d),
    cvd24jam:cvd===null?'-':((cvd>0)===long?'searah':'berlawanan'),
    rvolTrigger1H:bucket(rv,[0.8,1.1,2]),
    sesiUTC:hour<8?'Asia 00–08':hour<13?'London 08–13':hour<21?'New York 13–21':'Malam 21–24',
    hari:day===0||day===6?'akhir pekan':'hari kerja',
  };
}
function simulate(E,sym,data,tick,from,to){
  const trades=[],stat={evals:0,dir:0,held:0,trig:0,plans:0,void:0,triggerUnik:0,triggerJadiPlan:0,triggerGagalRR:0,triggerSudahSelesai:0};const trigSeen=new Map();
  const h1=data['1h'];let p4=-1,pd=-1,active=null;const seen=new Set();
  const close=(outcome,price,at)=>{
    if(outcome==='void'){stat.void++;active=null;return;}
    const long=active.side==='long',r=(price-active.entry)*(long?1:-1)/active.risk;
    const feeR=(active.entry*FEE+price*FEE)/active.risk;
    trades.push({sym,side:active.side,entry:active.entry,sl:active.sl,tp:active.tp,rr:active.rr,riskPct:100*active.risk/active.entry,created:active.created,filled:active.filledAt,closed:at,outcome,r,rNet:r-feeR,f:active.f});
    active=null;
  };
  for(let j=0;j<h1.length;j++){
    const c=h1[j],t=c.ct;
    if(t<from||t>to)continue;
    if(active&&active.created<c.t){
      const long=active.side==='long',hitSl=long?c.low<=active.sl:c.high>=active.sl,hitTp=long?c.high>=active.tp:c.low<=active.tp;
      if(active.status==='armed'){
        if(c.low<=active.entry&&c.high>=active.entry){active.status='running';active.filledAt=t;if(hitSl)close('sl',active.sl,t);}
        else if(hitSl||hitTp)close('void',null,t);
      }else if(hitSl)close('sl',active.sl,t);
      else if(hitTp)close('tp',active.tp,t);
    }
    p4=lastClosed(data['4h'],t,p4);pd=lastClosed(data['1d'],t,pd);
    if(p4<0||pd<0)continue;
    const raw={'1h':h1.slice(Math.max(0,j-WINDOW+1),j+1),'4h':data['4h'].slice(Math.max(0,p4-WINDOW+1),p4+1),'1d':data['1d'].slice(Math.max(0,pd-WINDOW+1),pd+1)};
    const e=E.evaluate(raw,{now:t,tickSize:tick});stat.evals++;
    if(e.side)stat.dir++;if(e.trigger&&e.trigger.held)stat.held++;if(e.trigger&&e.trigger.ready)stat.trig++;
    if(e.trigger&&e.trigger.ready){const k=sym+'|'+e.trigger.ct,st=e.plan?'plan':e.resolved?'selesai':'rr';if(!trigSeen.has(k)){trigSeen.set(k,st);stat.triggerUnik++;}else if(st==='plan')trigSeen.set(k,'plan');}
    const id=e.plan?sym+'|'+e.side+'|'+e.trigger.ct:null;
    if(active&&active.status==='armed'&&id!==active.id)close('void',null,t);
    if(id&&!active&&!seen.has(id)){
      seen.add(id);stat.plans++;
      const p=e.plan;let f=null;try{f=features(E,e);}catch(err){f={galat:err.message};}
      active={id,side:e.side,entry:p.entry,sl:p.sl,tp:p.tp,rr:p.rr,risk:p.risk,created:t,status:'armed',f};
    }
  }
  for(const st of trigSeen.values()){if(st==='plan')stat.triggerJadiPlan++;else if(st==='rr')stat.triggerGagalRR++;else stat.triggerSudahSelesai++;}
  if(active&&active.status==='running')trades.push({sym,side:active.side,entry:active.entry,sl:active.sl,tp:active.tp,rr:active.rr,riskPct:100*active.risk/active.entry,created:active.created,filled:active.filledAt,closed:null,outcome:'open',r:null,rNet:null,f:active.f});
  return {trades,stat};
}
function summarize(trades){
  const done=trades.filter(x=>x.outcome==='tp'||x.outcome==='sl');
  const wins=done.filter(x=>x.outcome==='tp').length,sum=k=>done.reduce((s,x)=>s+x[k],0);
  let eq=0,peak=0,dd=0;for(const x of done.slice().sort((a,b)=>a.closed-b.closed)){eq+=x.rNet;peak=Math.max(peak,eq);dd=Math.min(dd,eq-peak);}
  const med=a=>{const s=a.slice().sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:null;};
  return {trades:done.length,open:trades.filter(x=>x.outcome==='open').length,wins,winRate:done.length?100*wins/done.length:null,
    totalR:sum('r'),totalRNet:sum('rNet'),expectancyR:done.length?sum('r')/done.length:null,expectancyRNet:done.length?sum('rNet')/done.length:null,
    maxDrawdownRNet:dd,medianRR:med(done.map(x=>x.rr)),medianRiskPct:med(done.map(x=>x.riskPct))};
}
// Kecenderungan: tiap kondisi dibandingkan di dua paruh periode; hanya yang konsisten dan cukup sampel yang ditandai.
function tendencies(trades,mid,overall){
  const done=trades.filter(x=>(x.outcome==='tp'||x.outcome==='sl')&&x.f);
  const out={};
  const names=[...new Set(done.flatMap(x=>Object.keys(x.f)))];
  for(const name of names){
    const groups={};
    for(const x of done){const v=x.f[name]??'-';(groups[v]=groups[v]||[]).push(x);}
    out[name]=Object.fromEntries(Object.entries(groups).map(([v,a])=>{
      const s=summarize(a),h1=summarize(a.filter(x=>x.created<mid)),h2=summarize(a.filter(x=>x.created>=mid));
      const lean=s.trades<20||h1.trades<8||h2.trades<8?'sampel kecil'
        :(h1.expectancyRNet>overall&&h2.expectancyRNet>overall&&s.expectancyRNet>0)?'condong positif (konsisten)'
        :(h1.expectancyRNet<overall&&h2.expectancyRNet<overall)?'condong negatif (konsisten)':'tidak konsisten';
      return [v,{trades:s.trades,winRate:s.winRate,expectancyRNet:s.expectancyRNet,totalRNet:s.totalRNet,paruh1:{trades:h1.trades,expectancyRNet:h1.expectancyRNet},paruh2:{trades:h2.trades,expectancyRNet:h2.expectancyRNet},kecenderungan:lean}];
    }));
  }
  return out;
}
(async()=>{
  const cfg=JSON.parse(fs.readFileSync(process.argv[2]||'config.json','utf8'));
  const engines=Object.fromEntries(Object.entries(cfg.engines).map(([k,f])=>[k,require('./'+f)]));
  const info=await get('/fapi/v1/exchangeInfo'),ticks=new Map(info.symbols.map(s=>[s.symbol,+((s.filters||[]).find(f=>f.filterType==='PRICE_FILTER')||{}).tickSize||null]));
  const results={},meta={};
  const tick24=await get('/fapi/v1/ticker/24hr');
  const live=new Set(info.symbols.filter(x=>x.quoteAsset==='USDT'&&x.contractType==='PERPETUAL'&&x.status==='TRADING').map(x=>x.symbol));
  const top=tick24.filter(x=>live.has(x.symbol)&&/^[A-Z0-9]+$/.test(x.symbol)).sort((a,b)=>+b.quoteVolume-+a.quoteVolume).map(x=>x.symbol);
  for(const run of cfg.runs){
    if(!Array.isArray(run.symbols))run.symbols=[...new Set([...top.slice(run.symbols.skip||0,run.symbols.top),...(run.symbols.plus||[])])];
    console.log(run.name,run.symbols.length,'pair:',run.symbols.join(','));
    const from=Date.parse(run.from),to=Date.parse(run.to),warm=from-WINDOW*DAY;
    for(const sym of run.symbols){
      let data;
      try{data={'1d':await klines(sym,'1d',warm,to),'4h':await klines(sym,'4h',from-WINDOW*4*H,to),'1h':await klines(sym,'1h',from-WINDOW*H,to)};}
      catch(e){console.log('lewati',sym,e.message);continue;}
      for(const [name,E] of Object.entries(engines)){
        const key=run.name+'|'+name;meta[key]={from,to};results[key]=results[key]||{trades:[],stat:{evals:0,dir:0,held:0,trig:0,plans:0,void:0,triggerUnik:0,triggerJadiPlan:0,triggerGagalRR:0,triggerSudahSelesai:0}};
        const r=simulate(E,sym,data,ticks.get(sym),from,to);
        results[key].trades.push(...r.trades);for(const k in r.stat)results[key].stat[k]+=r.stat[k];
      }
      console.log(new Date().toISOString().slice(11,19),run.name,sym,'selesai');
      fs.writeFileSync('results.json',JSON.stringify(results));
    }
  }
  const summary={};
  for(const [key,v] of Object.entries(results)){
    const by=f=>{const g={};for(const x of v.trades){const k=f(x);(g[k]=g[k]||[]).push(x);}return Object.fromEntries(Object.entries(g).map(([k,a])=>[k,summarize(a)]));};
    const all=summarize(v.trades),mid=(meta[key].from+meta[key].to)/2;
    summary[key]={stat:v.stat,all,bySide:by(x=>x.side),byMonth:by(x=>new Date(x.created).toISOString().slice(0,7)),bySymbol:by(x=>x.sym),
      tendencies:tendencies(v.trades,mid,all.expectancyRNet??0)};
  }
  fs.writeFileSync('summary.json',JSON.stringify(summary,null,1));
  console.log('SELESAI');
})().catch(e=>{console.error('ERR',e.stack);process.exit(1);});
