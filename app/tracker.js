/* Pemantauan rencana untuk eksekusi manual: ARMED -> entry tersentuh -> RUNNING -> keluar. Tidak mengirim order.
   Rencana breakout (engine turtle-v1) tidak punya TP: keluar di SL (intrabar, di sini) atau exit 20 hari pada close 1D
   (Trend.exitSignal, dicek sesudah scan). Rekaman trend-v1 lama keluar lewat trailing stop (Trend.trail). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MalomoTracker=api;})(globalThis,function(){
  'use strict';
  // Satu rencana per pair, arah, dan candle sinyal. Close 1D (swing) dan close 4H (intraday) bisa jatuh di waktu yang
  // sama (00:00 UTC), jadi id selain swing diberi nama engine agar tidak tertukar di histori dan Jurnal.
  function create(symbol,evaluation,at){
    if(!evaluation||!evaluation.plan||!evaluation.side)return null;
    const p=evaluation.plan,engine=evaluation.engine||'turtle-v1';
    return Object.assign({id:symbol+'|'+evaluation.side+'|'+p.signalAt+(engine==='turtle-v1'?'':'|'+engine),symbol,side:evaluation.side,createdAt:at,lastAt:at,status:'armed',engine},p);
  }
  function close(record,outcome,price,at){
    record.status='closed';record.outcome=outcome;record.exit=price;record.closedAt=at;
    record.r=(price-record.entry)*(record.side==='long'?1:-1)/record.risk;
    return record;
  }
  function advance(record,candle,at){
    if(record.status==='closed'||at<record.lastAt)return record;
    const long=record.side==='long',hasTp=Number.isFinite(record.tp);
    const sl=long?candle.low<=record.sl:candle.high>=record.sl,tp=hasTp&&(long?candle.high>=record.tp:candle.low<=record.tp);
    if(record.status==='armed'){
      const entered=candle.low<=record.entry&&candle.high>=record.entry;
      if(entered){record.status='running';record.runningAt=at;record.filledAt=at;record.peak=record.entry;if(sl)close(record,'sl',record.sl,at);}
      else if(sl||tp){record.status='closed';record.outcome='void';record.closedAt=at;record.r=null;}
    }else if(sl)close(record,'sl',record.sl,at);else if(tp)close(record,'tp',record.tp,at);
    record.lastAt=at;return record;
  }
  // Exit 20 hari pada close 1D (posisi RUNNING saja).
  function exit(record,price,at){
    if(record.status!=='running')return record;
    close(record,'exit20',price,at);record.lastAt=Math.max(record.lastAt||0,at);
    return record;
  }
  // Rencana yang belum terisi gugur bila scan terbaru tidak lagi menghasilkan rencana yang sama.
  // Posisi RUNNING tidak disentuh: keluarnya hanya lewat SL atau exit.
  function expire(record,current,at){
    if(record.status!=='armed'||(current&&current.id===record.id))return false;
    record.status='closed';record.outcome='void';record.closedAt=at;record.r=null;record.voidReason='rencana tidak lagi dihasilkan engine pada scan terbaru';
    return true;
  }
  // Satu pair hanya boleh punya satu rencana aktif (ARMED atau RUNNING), apa pun arahnya.
  function admit(tracks,record){
    return !tracks.some(x=>x.id===record.id||(x.symbol===record.symbol&&x.status!=='closed'));
  }
  // Status jurnal dari hasil R: exit 20 hari bisa menutup posisi dalam kondisi untung.
  function journalStatus(record){
    if(record.status!=='closed')return 'open';
    if(!Number.isFinite(record.r))return 'breakeven';
    return record.r>0.02?'win':record.r<-0.02?'loss':'breakeven';
  }
  return {create,advance,exit,expire,admit,journalStatus};
});
