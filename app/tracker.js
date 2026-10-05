/* Paper tracking only: entry confirmed by engine; SL exits independently of retest. */
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
  return {create,advance};
});
