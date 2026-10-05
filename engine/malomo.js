/* ICT Malomo: pure, causal rule engine. No DOM, network, or order execution. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.Malomo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  const RULES = Object.freeze({ universe:250, candidates:150, minRR:2.2 });
  function closed(candles, now){
    return (candles || []).filter(c => [c.open,c.high,c.low,c.close,c.volume].every(Number.isFinite)
      && c.high >= Math.max(c.open,c.close) && c.low <= Math.min(c.open,c.close)
      && (!Number.isFinite(c.ct) || c.ct <= now));
  }
  function pivots(c){
    const out=[];
    for(let i=2;i<c.length-2;i++){
      const neighbors=[c[i-2],c[i-1],c[i+1],c[i+2]];
      if(neighbors.every(x=>c[i].high>x.high)) out.push({type:'high',price:c[i].high,index:i,confirmedAt:i+2});
      if(neighbors.every(x=>c[i].low<x.low)) out.push({type:'low',price:c[i].low,index:i,confirmedAt:i+2});
    }
    return out.sort((a,b)=>a.confirmedAt-b.confirmedAt);
  }
  function ema(c,n){
    if(c.length<n) return null;
    let v=c.slice(0,n).reduce((s,x)=>s+x.close,0)/n;
    for(let i=n;i<c.length;i++) v += (c[i].close-v)*2/(n+1);
    return v;
  }
  function atr(c,n=14){
    if(c.length<n+1) return null;
    const tr=c.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-c[i].close),Math.abs(x.low-c[i].close)));
    let v=tr.slice(0,n).reduce((s,x)=>s+x,0)/n;
    for(let i=n;i<tr.length;i++) v=(v*(n-1)+tr[i])/n;
    return v;
  }
  function evidence(c){
    const last=c[c.length-1], a=atr(c);
    const avg=c.length>=21 ? c.slice(-21,-1).reduce((s,x)=>s+x.volume,0)/20 : null;
    return {atr14:a,rvol20:avg>0?last.volume/avg:null,
      candleMagnitude:null,displacement:null,trendEfficiency:null,volatilityRegime:null,
      note:'Candle magnitude, Trend Efficiency, and volatility labels have no locked numerical definition; not used as gates.'};
  }
  function structure(c){
    const raw=pivots(c), seen=[], structural=[], events=[];
    let bias='neutral', high=null, low=null, protectedSwing=null, pending=null, pendingExtreme=null, resetAt=0, brokenBias=null, directionAt=null, phase='struktur belum jelas', pullbackAt=null;
    const mark=s=>{ if(s&&!structural.some(x=>x.type===s.type&&x.index===s.index))structural.push(s); };
    for(let i=0;i<c.length;i++){
      for(const s of raw.filter(x=>x.confirmedAt===i)){
        seen.push(s);
        if(pendingExtreme&&s.type===pendingExtreme.type&&s.index>=pendingExtreme.breakIndex){
          if(s.type==='high'&&s.price>pendingExtreme.level){high=s;mark(s);pendingExtreme=null;}
          else if(s.type==='low'&&s.price<pendingExtreme.level){low=s;mark(s);pendingExtreme=null;}
        }
      }
      if(bias==='neutral'){
        const hs=seen.filter(s=>s.type==='high'&&s.index>=resetAt).slice(-2);
        const ls=seen.filter(s=>s.type==='low'&&s.index>=resetAt).slice(-2);
        if(hs.length===2&&ls.length===2){
          const h=hs[1],l=ls[1];
          const brokeUp=c.slice(hs[0].confirmedAt+1,i+1).some(x=>x.close>hs[0].price);
          const brokeDown=c.slice(ls[0].confirmedAt+1,i+1).some(x=>x.close<ls[0].price);
          if(h.price>hs[0].price&&l.price>ls[0].price&&brokeUp){
            const bi=c.findIndex((x,j)=>j>hs[0].confirmedAt&&j<=i&&x.close>hs[0].price);
            const origins=seen.filter(s=>s.type==='low'&&s.index>=hs[0].index&&s.confirmedAt<=bi);
            if(!origins.length)continue;
            bias='bullish';high=h;low=origins.reduce((a,b)=>a.price<b.price?a:b);protectedSwing=low;mark(hs[0]);mark(ls[0]);mark(h);mark(low);
            events.push({type:'BREAKOUT',direction:bias,index:bi,confirmedAt:i,level:hs[0].price,reference:hs[0]});
          } else if(h.price<hs[0].price&&l.price<ls[0].price&&brokeDown){
            const bi=c.findIndex((x,j)=>j>ls[0].confirmedAt&&j<=i&&x.close<ls[0].price);
            const origins=seen.filter(s=>s.type==='high'&&s.index>=ls[0].index&&s.confirmedAt<=bi);
            if(!origins.length)continue;
            bias='bearish';low=l;high=origins.reduce((a,b)=>a.price>b.price?a:b);protectedSwing=high;mark(hs[0]);mark(ls[0]);mark(high);mark(l);
            events.push({type:'BREAKDOWN',direction:bias,index:bi,confirmedAt:i,level:ls[0].price,reference:ls[0]});
          }
        }
        if(bias==='neutral') continue;
        directionAt=i;phase=brokenBias&&brokenBias!==bias?'reversal terkonfirmasi':'struktur valid';
        if(brokenBias&&brokenBias!==bias)events.push({type:'REVERSAL_CONFIRMED',direction:bias,index:i,level:protectedSwing.price});
        brokenBias=null;
      }
      const long=bias==='bullish', level=protectedSwing.price, x=c[i];
      const outside=long?x.close<level:x.close>level;
      if(pending){
        const reclaimed=long?x.close>level:x.close<level;
        const touched=long?x.high>=level:x.low<=level;
        if(reclaimed) pending=null;
        else if(i>pending.index&&touched&&outside){
          events.push({type:'STRUCTURE_BROKEN',direction:bias,index:i,level,protectedSwing});
          brokenBias=bias;bias='neutral';phase='patah terkonfirmasi';resetAt=pending.index;pending=null;pendingExtreme=null;pullbackAt=null;continue;
        }
      } else if(outside){
        pending={index:i,level};events.push({type:'BREAK_PENDING',direction:bias,index:i,level});
      }
      if(pending) continue;
      if(i>directionAt&&(long?x.close<c[i-1].close:x.close>c[i-1].close)){
        if(pullbackAt===null)pullbackAt=i;phase='pullback';
      }
      if(pullbackAt!==null){
        const internal=seen.filter(s=>s.type===(long?'high':'low')&&s.index>=pullbackAt&&!structural.some(a=>a.type===s.type&&a.index===s.index)).slice(-1)[0];
        if(internal&&(long?x.close>internal.price:x.close<internal.price)){
          events.push({type:'LOCAL_CONTINUATION',direction:bias,index:i,level:internal.price});phase='kelanjutan lokal';pullbackAt=null;
        }
      }
      const ref=long?high:low;
      if(ref&&!pendingExtreme&&(long?x.close>ref.price:x.close<ref.price)){
        const origins=seen.filter(s=>s.type===(long?'low':'high')&&s.index>ref.index&&s.confirmedAt<=i);
        const origin=origins.reduce((best,s)=>!best||(long?s.price<best.price:s.price>best.price)?s:best,null);
        if(origin&&(long?origin.price>=protectedSwing.price:origin.price<=protectedSwing.price)){
          protectedSwing=origin; if(long)low=origin;else high=origin;mark(origin);
          events.push({type:long?'BREAKOUT':'BREAKDOWN',direction:bias,index:i,level:ref.price,reference:ref});
          phase='kelanjutan struktural';pullbackAt=null;
          pendingExtreme={type:long?'high':'low',breakIndex:i,level:ref.price};
        }
      }
    }
    const last=c[c.length-1], ev=events[events.length-1]||null;
    const sweeps=[];
    if(last&&high&&last.high>high.price&&last.close<high.price)sweeps.push({side:'high',level:high.price});
    if(last&&low&&last.low<low.price&&last.close>low.price)sweeps.push({side:'low',level:low.price});
    let status=pending?'menunggu konfirmasi':bias==='neutral'?(ev&&ev.type==='STRUCTURE_BROKEN'?'patah terkonfirmasi':'struktur belum jelas'):'belum patah';
    return {bias,status,phase,directionAt,high,low,protectedSwing,pending,event:ev,events,sweeps,
      swings:raw.map(s=>Object.assign({},s,{role:structural.some(x=>x.index===s.index&&x.type===s.type)?'structural':'internal'}))};
  }
  function frame(c){
    const st=structure(c),last=c.length?c[c.length-1].close:null;
    const e=evidence(c),ei=st.event?.index;
    const eventEvidence=Number.isInteger(ei)?evidence(c.slice(0,ei+1)):null;
    const prior=atr(c.slice(0,-1));
    e.atrChange=prior>0&&e.atr14!==null?e.atr14/prior:null;
    e.trendEfficiency='Struktur '+st.bias+'; '+st.phase+'; '+st.swings.filter(s=>s.role==='internal').length+' swing internal (informasi kualitas)';
    return {candles:c,last,structure:st,evidence:e,eventEvidence,ema:Object.fromEntries([21,30,50].map(n=>[n,ema(c,n)]))};
  }
  function direction(d,h){
    return d.structure.bias===h.structure.bias&&['bullish','bearish'].includes(d.structure.bias)?d.structure.bias:null;
  }
  function fvgs(c,side){
    const out=[];
    for(let i=2;i<c.length;i++){
      const low=side==='long'?c[i-2].high:c[i].high, high=side==='long'?c[i].low:c[i-2].low;
      if(low>=high)continue;
      if(c.slice(i+1).some(x=>side==='long'?x.low<=low:x.high>=high))continue;
      out.push({low,high,index:i,kind:'fvg'});
    }
    return out;
  }
  function zone(h,side){
    const st=h.structure,p=st.protectedSwing;
    if(!p)return null;
    const ev=st.events.filter(e=>e.type===(side==='long'?'BREAKOUT':'BREAKDOWN')).slice(-1)[0];
    const anchor=ev?ev.reference:p;
    const candle=h.candles[anchor.index];
    if(!candle)return null;
    let z={low:candle.low,high:candle.high,createdAt:Math.max(h.candles[ev?ev.index:anchor.confirmedAt].ct,h.candles[p.confirmedAt].ct,h.candles[st.directionAt??0].ct),kind:'structural',anchor};
    const mid=st.high&&st.low?(st.high.price+st.low.price)/2:null;
    z.location=mid===null?null:(z.low+z.high)/2<mid?'discount':'premium';
    // FVG refines an existing structural zone only. No independent FVG entry.
    const f=fvgs(h.candles,side).reverse().find(f=>f.low<z.high&&f.high>z.low);
    if(f)z=Object.assign({},z,{low:Math.max(z.low,f.low),high:Math.min(z.high,f.high),fvg:f,createdAt:Math.max(z.createdAt,h.candles[f.index].ct)});
    return z;
  }
  function trigger(c,z,side){
    if(!z)return {ready:false,status:'menunggu zona',enteredIdx:null};
    const ps=pivots(c),long=side==='long';let entered=null,ref=null;
    for(let i=0;i<c.length;i++){
      const x=c[i];
      if(Number.isFinite(z.createdAt)&&Number.isFinite(x.t)&&x.t<z.createdAt)continue;
      if(entered===null&&x.low<=z.high&&x.high>=z.low)entered=i;
      if(entered===null)continue;
      const available=ps.filter(p=>p.type===(long?'high':'low')&&p.index>=entered&&p.confirmedAt<i);
      if(available.length)ref=available[available.length-1];
      if(ref&&(long?x.close>ref.price:x.close<ref.price))
        return {ready:true,status:'tervalidasi',enteredIdx:entered,index:i,level:ref.price,entry:x.close,ct:x.ct};
    }
    return {ready:false,status:'menunggu validasi entry',enteredIdx:entered};
  }
  function plan(side,entry,stop,targets,tickSize){
    const tick=Number.isFinite(tickSize)&&tickSize>0?tickSize:Math.max(Number.EPSILON*stop*4,Math.abs(stop)*1e-8);
    const sl=side==='long'?stop-tick:stop+tick, risk=(entry-sl)*(side==='long'?1:-1);
    if(!(risk>0))return null;
    const ahead=targets.filter(t=>(t-entry)*(side==='long'?1:-1)>0).sort((a,b)=>side==='long'?a-b:b-a);
    const tp=ahead[0];if(!Number.isFinite(tp))return null;
    const rr=Math.round(Math.abs(tp-entry)/risk*1e12)/1e12;
    return rr>=RULES.minRR?{entry,sl,tp,tp2:null,tp3:null,risk,rr,minRR:RULES.minRR,slCloseBased:false}:null;
  }
  function evaluate(raw,options={}){
    const now=options.now??Date.now();
    const frames=Object.fromEntries(['1d','4h','1h'].map(tf=>[tf,frame(closed(raw[tf],now))]));
    const d=frames['1d'],h=frames['4h'],l=frames['1h'],bias=direction(d,h),side=bias==='bullish'?'long':bias==='bearish'?'short':null;
    let z=side?zone(h,side):null;
    if(z){
      z.createdAt=Math.max(z.createdAt,d.candles[d.structure.directionAt??0].ct);
      const f=fvgs(l.candles,side).reverse().find(f=>f.low<z.high&&f.high>z.low);
      if(f)z=Object.assign({},z,{low:Math.max(z.low,f.low),high:Math.min(z.high,f.high),fvg1h:f,createdAt:Math.max(z.createdAt,l.candles[f.index].ct)});
    }
    const tr=trigger(l.candles,z,side);
    let p=null;
    if(side&&tr.ready&&h.structure.protectedSwing){
      const targets=[d,h].flatMap(f=>f.structure.swings.filter(s=>s.role==='structural'&&s.type===(side==='long'?'high':'low')&&f.candles[s.confirmedAt].ct<=tr.ct).map(s=>s.price));
      p=plan(side,tr.entry,h.structure.protectedSwing.price,targets,options.tickSize);
      if(p&&l.candles.slice(tr.index+1).some(c=>side==='long'?c.low<=p.sl||c.high>=p.tp:c.high>=p.sl||c.low<=p.tp))p=null;
    }
    return {engine:'malomo-v1',frames,bias,side,zone:z,trigger:tr,plan:p,
      decision:p?side.toUpperCase():'SKIP',status:!side?'arah tidak valid':!tr.ready?'menunggu validasi entry':!p?'NO TRADING PLAN':'tervalidasi'};
  }
  function rankUniverse(tickers){return tickers.filter(t=>Number.isFinite(t.quoteVolume)).slice().sort((a,b)=>b.quoteVolume-a.quoteVolume||a.symbol.localeCompare(b.symbol)).slice(0,RULES.universe);}
  function rankCandidates(rows){return rows.filter(r=>r.evaluation.bias&&Number.isFinite(r.quoteVolume60m)).slice().sort((a,b)=>b.quoteVolume60m-a.quoteVolume60m||a.symbol.localeCompare(b.symbol)).slice(0,RULES.candidates);}
  return Object.freeze({RULES,closed,pivots,ema,atr,evidence,structure,frame,direction,fvgs,zone,trigger,plan,evaluate,rankUniverse,rankCandidates});
});
