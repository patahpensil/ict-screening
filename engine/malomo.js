/* ICT Malomo: pure, causal rule engine. No DOM, network, or order execution. */
(function(root, factory){
  const api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  else root.Malomo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  // Angka referensi Poin 5 dari PRD; angka konteks K-3/K-4 dari keputusan pemilik 6 Okt 2026 (docs/ADDENDUM_PRD_2026-10-06.md).
  const RULES = Object.freeze({ universe:250, candidates:150, minRR:2.2, magnitudeRef:1, rvolRef:1.1,
    regimeWindow:100, contractionPct:25, expansionPct:75, efficiencyPeriod:20, efficiencyClean:0.5, efficiencyMid:0.3 });
  // K-7: fractal 5-bar butuh dua candle kanan, jadi swing yang terbentuk sampai candle break pasti terputuskan dalam 2 candle.
  const ORIGIN_WAIT = 2;
  const EVIDENCE_EVENTS = Object.freeze(['BREAKOUT','BREAKDOWN','LOCAL_CONTINUATION','REVERSAL_CONFIRMED']);
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
  function atrSeries(c,n=14){
    if(c.length<n+1) return [];
    const tr=c.slice(1).map((x,i)=>Math.max(x.high-x.low,Math.abs(x.high-c[i].close),Math.abs(x.low-c[i].close)));
    let v=tr.slice(0,n).reduce((s,x)=>s+x,0)/n;const out=[v];
    for(let i=n;i<tr.length;i++){v=(v*(n-1)+tr[i])/n;out.push(v);}
    return out;
  }
  function atr(c,n=14){const s=atrSeries(c,n);return s.length?s[s.length-1]:null;}
  // K-1: Candle Range = badan candle |close − open|; magnitude relatif = badan ÷ ATR14 timeframe yang sama.
  function evidence(c){
    const last=c[c.length-1], a=atr(c);
    const avg=c.length>=21 ? c.slice(-21,-1).reduce((s,x)=>s+x.volume,0)/20 : null;
    return {atr14:a,rvol20:avg>0?last.volume/avg:null,candleMagnitude:a>0?Math.abs(last.close-last.open)/a:null};
  }
  // K-2: label kualitas impulse hanya dari dua referensi PRD Poin 5; bukan gate, bukan evidence tambahan.
  function displacement(e){
    if(!e||e.candleMagnitude===null||e.rvol20===null)return null;
    const passed=(e.candleMagnitude>=RULES.magnitudeRef)+(e.rvol20>=RULES.rvolRef);
    return passed===2?'kuat':passed===1?'sedang':'lemah';
  }
  // K-3: posisi persentil ATR14 terhadap 100 nilai ATR14 terakhir; konteks, bukan gate.
  function volatility(c){
    const s=atrSeries(c);if(s.length<RULES.regimeWindow)return {percentile:null,regime:null};
    const w=s.slice(-RULES.regimeWindow),cur=w[w.length-1];
    const percentile=100*w.slice(0,-1).filter(v=>v<cur).length/(w.length-1);
    return {percentile,regime:percentile<=RULES.contractionPct?'contraction':percentile>=RULES.expansionPct?'expansion':'normal'};
  }
  // K-4: Kaufman Efficiency Ratio periode 20 dari close; informasi kualitas, tidak menentukan arah.
  function trendEfficiency(c,n=RULES.efficiencyPeriod){
    if(c.length<n+1)return {value:null,label:null};
    const w=c.slice(-(n+1)),net=Math.abs(w[n].close-w[0].close);
    const path=w.slice(1).reduce((s,x,i)=>s+Math.abs(x.close-w[i].close),0);
    const value=path>0?net/path:0;
    return {value,label:value>=RULES.efficiencyClean?'bersih':value>=RULES.efficiencyMid?'sedang':'choppy'};
  }
  function structure(c){
    const raw=pivots(c), seen=[], structural=[], events=[];
    let bias='neutral', high=null, low=null, protectedSwing=null, pending=null, pendingExtreme=null, pendingOrigin=null, resetAt=0, brokenBias=null, directionAt=null, phase='struktur belum jelas', pullbackAt=null;
    const mark=s=>{ if(s&&!structural.some(x=>x.type===s.type&&x.index===s.index))structural.push(s); };
    for(let i=0;i<c.length;i++){
      for(const s of raw.filter(x=>x.confirmedAt===i)){
        seen.push(s);
        if(pendingExtreme&&s.type===pendingExtreme.type&&s.index>=pendingExtreme.breakIndex){
          if(s.type==='high'&&s.price>pendingExtreme.level){high=s;mark(s);pendingExtreme=null;}
          else if(s.type==='low'&&s.price<pendingExtreme.level){low=s;mark(s);pendingExtreme=null;}
        }
      }
      // Selama protected lama menunggu konfirmasi break–retest, acuan retest tidak boleh bergeser:
      // pembaruan ditunda, dan dibatalkan bila struktur patah terkonfirmasi.
      if(pendingOrigin&&!pending&&i>=pendingOrigin.breakIndex+ORIGIN_WAIT){
        const po=pendingOrigin,isLow=po.type==='low';
        const extreme=seen.filter(s=>s.type===po.type&&s.index>po.refIndex&&s.index<=po.breakIndex)
          .reduce((best,s)=>!best||(isLow?s.price<best.price:s.price>best.price)?s:best,null);
        // Asal yang sudah ditembus close sebelum keputusan diambil tidak dipakai; protected lama tetap.
        const violated=extreme&&c.slice(po.breakIndex+1,i+1).some(x=>isLow?x.close<extreme.price:x.close>extreme.price);
        const origin=violated?null:extreme;
        if(origin){protectedSwing=origin;if(isLow)low=origin;else high=origin;mark(origin);}
        po.event.protectedMoved=!!origin;po.event.originViolated=!!violated;po.event.originConfirmedAt=i;pendingOrigin=null;
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
            // K-7: asal = swing yang TERBENTUK sejak swing acuan hingga candle break; konfirmasinya
            // ditunggu sampai 2 candle sesudah break agar semua kandidat dalam rentang sudah bisa diputuskan.
            if(i<bi+ORIGIN_WAIT)continue;
            const origins=seen.filter(s=>s.type==='low'&&s.index>=hs[0].index&&s.index<=bi);
            if(!origins.length)continue;
            bias='bullish';high=h;low=origins.reduce((a,b)=>a.price<b.price?a:b);protectedSwing=low;mark(hs[0]);mark(ls[0]);mark(h);mark(low);
            events.push({type:'BREAKOUT',direction:bias,index:bi,confirmedAt:i,level:hs[0].price,reference:hs[0]});
          } else if(h.price<hs[0].price&&l.price<ls[0].price&&brokeDown){
            const bi=c.findIndex((x,j)=>j>ls[0].confirmedAt&&j<=i&&x.close<ls[0].price);
            if(i<bi+ORIGIN_WAIT)continue;
            const origins=seen.filter(s=>s.type==='high'&&s.index>=ls[0].index&&s.index<=bi);
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
        // K-11: retest yang gagal merebut level juga terbukti bila pullback sesudah break membentuk swing
        // terkonfirmasi yang tetap di luar level (swing high di bawah level untuk bullish yang patah turun).
        const swingRetest=seen.some(s=>s.confirmedAt===i&&s.index>pending.index&&(long?s.type==='high'&&s.price<level:s.type==='low'&&s.price>level));
        if(reclaimed) pending=null;
        else if(i>pending.index&&((touched&&outside)||swingRetest)){
          events.push({type:'STRUCTURE_BROKEN',direction:bias,index:i,level,protectedSwing,via:touched&&outside?'retest':'swing'});
          brokenBias=bias;bias='neutral';phase='patah terkonfirmasi';resetAt=pending.index;pending=null;pendingExtreme=null;pendingOrigin=null;pullbackAt=null;continue;
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
        // PRD Poin 3.5 + K-7: asal = swing ekstrem yang terbentuk sejak swing acuan hingga candle break ini.
        // Breakout dicatat sekarang; protected baru diputuskan setelah konfirmasi fractal (maks. 2 candle).
        // Asal di luar protected lama (sisa sweep wick) tetap sah: sweep tidak mematahkan struktur (Poin 4; K-6 masih ditinjau).
        const event={type:long?'BREAKOUT':'BREAKDOWN',direction:bias,index:i,level:ref.price,reference:ref,protectedMoved:null};
        events.push(event);
        pendingOrigin={type:long?'low':'high',refIndex:ref.index,breakIndex:i,event};
        phase='kelanjutan struktural';pullbackAt=null;
        pendingExtreme={type:long?'high':'low',breakIndex:i,level:ref.price};
      }
    }
    const last=c[c.length-1], ev=events[events.length-1]||null;
    const sweeps=[];
    if(last&&high&&last.high>high.price&&last.close<high.price)sweeps.push({side:'high',level:high.price});
    if(last&&low&&last.low<low.price&&last.close>low.price)sweeps.push({side:'low',level:low.price});
    let status=pending?'menunggu konfirmasi':bias==='neutral'?(ev&&ev.type==='STRUCTURE_BROKEN'?'patah terkonfirmasi':'struktur belum jelas'):'belum patah';
    return {bias,status,phase,directionAt,high,low,protectedSwing,pending,pendingOrigin:pendingOrigin?{breakIndex:pendingOrigin.breakIndex}:null,event:ev,events,sweeps,
      swings:raw.map(s=>Object.assign({},s,{role:structural.some(x=>x.index===s.index&&x.type===s.type)?'structural':'internal'}))};
  }
  function frame(c){
    const st=structure(c),last=c.length?c[c.length-1].close:null;
    // PRD Poin 5: evidence hanya untuk Breakout, Breakdown, Trend Lanjutan, dan Reversal Terkonfirmasi.
    const evidenceEvent=st.events.filter(x=>EVIDENCE_EVENTS.includes(x.type)).slice(-1)[0]||null;
    const e=evidence(c),ei=evidenceEvent?.index;
    const eventEvidence=Number.isInteger(ei)?evidence(c.slice(0,ei+1)):null;
    if(eventEvidence)eventEvidence.displacement=displacement(eventEvidence);
    return {candles:c,last,structure:st,evidence:e,evidenceEvent,eventEvidence,
      quality:{trendEfficiency:trendEfficiency(c),volatility:volatility(c)},ema:Object.fromEntries([21,30,50].map(n=>[n,ema(c,n)]))};
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
  // Setiap pengujian zona dibaca terpisah: setelah satu validasi, pengujian berikutnya dimulai
  // dari sentuhan zona yang baru, sehingga retest sesudah setup lama selesai tetap bisa tervalidasi.
  // K-5: satu pengujian zona berakhir pada kondisi pertama dari: (1) entry tervalidasi, (2) close 1H
  // menembus protected swing, (3) harga mencapai target struktural pertama sebelum validasi.
  // opts.invalidation = harga protected swing; opts.targets = [{price, at}] dengan `at` = waktu target diketahui.
  function triggers(c,z,side,opts={}){
    const ps=pivots(c),long=side==='long',out=[],ended=[];let entered=null,ref=null,extreme=null;
    const beyond=(a,b)=>long?a>b:a<b;
    const firstTarget=at=>(opts.targets||[]).filter(t=>t.at<=at&&beyond(t.price,long?z.high:z.low))
      .reduce((best,t)=>best===null||beyond(best,t.price)?t.price:best,null);
    const end=(i,reason)=>{ended.push({index:i,reason,ct:c[i].ct});entered=null;ref=null;extreme=null;};
    for(let i=0;i<c.length;i++){
      const x=c[i];
      if(Number.isFinite(z.createdAt)&&Number.isFinite(x.t)&&x.t<z.createdAt)continue;
      if(entered===null&&x.low<=z.high&&x.high>=z.low){entered=i;extreme=null;}
      if(entered===null)continue;
      // K-10: ekstrem selama pengujian zona (low untuk LONG, high untuk SHORT) menjadi dasar SL.
      extreme=extreme===null?(long?x.low:x.high):long?Math.min(extreme,x.low):Math.max(extreme,x.high);
      const available=ps.filter(p=>p.type===(long?'high':'low')&&p.index>=entered&&p.confirmedAt<i);
      if(available.length)ref=available[available.length-1];
      if(ref&&beyond(x.close,ref.price)){
        out.push({ready:true,status:'tervalidasi',enteredIdx:entered,index:i,level:ref.price,entry:x.close,ct:x.ct,extreme});
        entered=null;ref=null;extreme=null;continue;
      }
      if(Number.isFinite(opts.invalidation)&&beyond(opts.invalidation,x.close)){end(i,'close menembus protected swing');continue;}
      const target=firstTarget(x.ct);
      if(target!==null&&(long?x.high>=target:x.low<=target))end(i,'target struktural tercapai sebelum validasi');
    }
    return {list:out,ended,entered};
  }
  function trigger(c,z,side,opts={}){
    if(!z)return {ready:false,status:'menunggu zona',enteredIdx:null};
    const r=triggers(c,z,side,opts),last=r.list[r.list.length-1],lastEnd=r.ended[r.ended.length-1]||null;
    if(last)return Object.assign({},last,{count:r.list.length,lastEnded:lastEnd&&lastEnd.index>last.index?lastEnd:null});
    const status=r.entered!==null?'menunggu validasi entry':lastEnd?'pengujian zona berakhir ('+lastEnd.reason+'); menunggu sentuhan baru':'menunggu harga menguji zona';
    return {ready:false,status,enteredIdx:r.entered,lastEnded:lastEnd};
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
    const structuralTargets=side?[d,h].flatMap(f=>f.structure.swings.filter(s=>s.role==='structural'&&s.type===(side==='long'?'high':'low')).map(s=>({price:s.price,at:f.candles[s.confirmedAt].ct}))):[];
    // K-11: selama struktur 1D atau 4H menunggu konfirmasi patah, Trading Plan ditahan; kandidat tetap di ranking.
    const held=!!(side&&(d.structure.pending||h.structure.pending));
    const tr=held?{ready:false,status:'Trading Plan ditahan: struktur '+[d.structure.pending?'1D':'',h.structure.pending?'4H':''].filter(Boolean).join('/')+' menunggu konfirmasi patah',enteredIdx:null,held:true}
      :trigger(l.candles,z,side,{invalidation:h.structure.protectedSwing?.price,targets:structuralTargets});
    let p=null,resolved=false;
    if(side&&tr.ready&&h.structure.protectedSwing){
      const targets=structuralTargets.filter(t=>t.at<=tr.ct).map(t=>t.price);
      // K-10: SL di luar ekstrem 1H selama pengujian zona; protected swing 4H tetap batas struktur patah (PRD 7.6).
      p=plan(side,tr.entry,tr.extreme,targets,options.tickSize);
      if(p){p.validatedAt=tr.ct;p.zoneLocation=z.location;}
      // Plan yang SL/TP-nya sudah tersentuh sesudah validasi bukan "RR tidak cukup"; statusnya dibedakan.
      if(p&&l.candles.slice(tr.index+1).some(c=>side==='long'?c.low<=p.sl||c.high>=p.tp:c.high>=p.sl||c.low<=p.tp)){p=null;resolved=true;}
    }
    return {engine:'malomo-v1',frames,bias,side,zone:z,trigger:tr,plan:p,resolved,
      decision:p?side.toUpperCase():'SKIP',status:!side?'arah tidak valid':!tr.ready?tr.status:resolved?'plan terakhir selesai — SL/TP sudah tersentuh':!p?'NO TRADING PLAN':'tervalidasi'};
  }
  function rankUniverse(tickers){return tickers.filter(t=>Number.isFinite(t.quoteVolume)).slice().sort((a,b)=>b.quoteVolume-a.quoteVolume||a.symbol.localeCompare(b.symbol)).slice(0,RULES.universe);}
  function rankCandidates(rows){return rows.filter(r=>r.evaluation.bias&&Number.isFinite(r.quoteVolume60m)).slice().sort((a,b)=>b.quoteVolume60m-a.quoteVolume60m||a.symbol.localeCompare(b.symbol)).slice(0,RULES.candidates);}
  return Object.freeze({RULES,closed,pivots,ema,atrSeries,atr,evidence,displacement,volatility,trendEfficiency,structure,frame,direction,fvgs,zone,triggers,trigger,plan,evaluate,rankUniverse,rankCandidates});
});
