/* Pemantauan Trading Plan untuk eksekusi manual: entry dikonfirmasi engine; SL keluar tanpa menunggu retest. Tidak mengirim order. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MalomoTracker=api;})(globalThis,function(){
  'use strict';
  function create(symbol,evaluation,at){
    if(!evaluation.plan||!evaluation.trigger.ready)return null;
    const p=evaluation.plan;return Object.assign({id:symbol+'|'+evaluation.side+'|'+evaluation.trigger.ct,symbol,side:evaluation.side,createdAt:at,lastAt:at,status:'armed',engine:'malomo-v1'},p);
  }
  function advance(record,candle,at){
    if(record.status==='closed'||at<record.lastAt)return record;
    const long=record.side==='long',sl=long?candle.low<=record.sl:candle.high>=record.sl,tp=long?candle.high>=record.tp:candle.low<=record.tp;
    const close=(outcome,price)=>{record.status='closed';record.outcome=outcome;record.exit=price;record.closedAt=at;record.r=(price-record.entry)*(long?1:-1)/record.risk;};
    if(record.status==='armed'){
      const entered=candle.low<=record.entry&&candle.high>=record.entry;
      if(entered){record.status='running';record.runningAt=at;if(sl)close('sl',record.sl);}
      else if(sl||tp){record.status='closed';record.outcome='void';record.closedAt=at;record.r=null;}
    }else if(sl)close('sl',record.sl);else if(tp)close('tp',record.tp);
    record.lastAt=at;return record;
  }
  // Rencana yang belum terisi gugur bila scan terbaru tidak lagi menghasilkan plan yang sama.
  // Posisi RUNNING tidak disentuh: keluarnya hanya lewat SL/TP.
  function expire(record,current,at){
    if(record.status!=='armed'||(current&&current.id===record.id))return false;
    record.status='closed';record.outcome='void';record.closedAt=at;record.r=null;record.voidReason='rencana tidak lagi dihasilkan engine pada scan terbaru';
    return true;
  }
  // Satu pair hanya boleh punya satu rencana aktif (ARMED atau RUNNING), apa pun arahnya.
  // Engine lama bisa mendaftarkan LONG dan SHORT untuk pair yang sama dari mode berbeda; ini mencegahnya.
  // Panggil setelah expire(): rencana ARMED lama yang tidak lagi dihasilkan engine sudah gugur lebih dulu.
  function admit(tracks,record){
    return !tracks.some(x=>x.id===record.id||(x.symbol===record.symbol&&x.status!=='closed'));
  }
  return {create,advance,expire,admit};
});
