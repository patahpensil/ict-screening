'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const M=require('../engine/trend');
const now=1800000000000,minute=60000,calls=[];let clock=now;
const prices=[8,9,10,12,10,9,8,9,10,11,10,9,9.5,10,11,12,13,15,13,12,11,12,13];
const bars=prices.map((p,i)=>[now-(prices.length-i)*minute,p,p+.2,p-.2,p,10,now-(prices.length-i-1)*minute-1,100]);
// 320 candle 1D tren naik: cukup untuk skor tren (≥300 hari).
const day=86400000,daily=Array.from({length:320},(_,i)=>{const p=10*Math.pow(1.004,i)*(1+0.02*Math.sin(i/5));return [now-(320-i)*day,p,p*1.01,p*0.99,p,10,now-(320-i-1)*day-1,100,0,0,60];});
let rateLimit=true;
const ctx=vm.createContext({Trend:M,Map,Set,Promise,Date:class extends Date{static now(){return clock;}},AbortSignal,setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},setInterval(){},clearInterval(){},fetch:async url=>{
  calls.push(url);const u=new URL(url),path=u.pathname;
  if(rateLimit){rateLimit=false;return {status:429,ok:false,headers:{get:()=>null}};}
  let body;
  if(path.endsWith('exchangeInfo'))body={symbols:[{symbol:'BTCUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'}]},{symbol:'XBUSD',quoteAsset:'BUSD',contractType:'PERPETUAL',status:'TRADING'},{symbol:'YUSDT',quoteAsset:'USDT',contractType:'CURRENT_QUARTER',status:'TRADING'}]};
  else if(path.endsWith('24hr'))body=['BTCUSDT','XBUSD','YUSDT'].map(symbol=>({symbol,lastPrice:13,priceChangePercent:1,highPrice:15,lowPrice:8,quoteVolume:0}));
  else if(path.endsWith('/time'))body={serverTime:now+5000};
  else if(path.endsWith('premiumIndex'))body=[{symbol:'BTCUSDT',lastFundingRate:0.0001}];
  else if(u.searchParams.get('interval')==='1d')body=daily;
  else body=bars;
  return {status:200,ok:true,json:async()=>body};
}});
vm.runInContext(fs.readFileSync('app/market.js','utf8'),ctx);
(async()=>{
  const data=await ctx.MalomoMarket.refresh();assert.deepEqual(data.map(x=>x.symbol),['BTCUSDT']);assert.equal(data[0].fundingRate,.0001);
  assert.equal(calls.filter(x=>x.endsWith('exchangeInfo')).length,2); // rate-limit retry
  assert.equal(ctx.MalomoMarket.serverNow(),now+5000); // candle close dinilai dengan jam server, bukan jam perangkat
  const first=await ctx.MalomoMarket.candles('BTCUSDT','4h'),n=calls.length;assert(first.length===23);await ctx.MalomoMarket.candles('BTCUSDT','4h');assert.equal(calls.length,n);
  const r=await ctx.MalomoMarket.scan();assert.equal(r.universe.length,1);assert.equal(r.candidates.length,1);assert.equal(r.errors.length,0);
  const ev=r.candidates[0].evaluation;assert.equal(ev.engine,'trend-v1');assert(ev.forecast>=10,'tren naik harus memberi skor ≥10');assert.equal(ev.side,'long');assert.equal(ev.plan.entry,13);assert(ev.plan.sl<13); // entry = harga ticker saat sinyal
  assert(calls.some(x=>x.includes('interval=1d')&&x.includes('limit=400')));
  // Cache candle berlaku sampai candle berikutnya close: tidak diunduh ulang di tengah candle 4H, diunduh ulang sesudahnya.
  let before=calls.length;clock=now+3600000;await ctx.MalomoMarket.candles('BTCUSDT','4h');assert.equal(calls.length,before);
  clock=now+4*3600000+10000;await ctx.MalomoMarket.candles('BTCUSDT','4h');assert.equal(calls.length,before+1);clock=now;
  const original=ctx.MalomoMarket.getTickers();original[0].quoteVolume=NaN;assert.equal((await ctx.MalomoMarket.scan()).universe.length,0);
  const map=new Map();ctx.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  vm.runInContext(fs.readFileSync('app/storage.js','utf8'),ctx);
  map.set('pp_trade_journal','[{"id":"legacy-user-note","symbol":"BTCUSDT"}]');assert.equal(ctx.MalomoStore.read('journal')[0].id,'legacy-user-note');
  ctx.MalomoStore.write('telegram',{token:'private',enabled:true});assert(!JSON.stringify(ctx.MalomoStore.exportData()).includes('private'));
  assert.throws(()=>ctx.MalomoStore.importData({journal:[null]}));assert.throws(()=>ctx.MalomoStore.importData({tracks:[{engine:'legacy'}]}));
  assert.doesNotThrow(()=>ctx.MalomoStore.importData({tracks:[{engine:'trend-v1',side:'long',status:'running',entry:10,sl:9,risk:1,lastAt:1,tp:null,rr:null}]})); // rencana tren tanpa TP sah
  ctx.MalomoStore.write('tracks',[]);
  assert.equal(ctx.MalomoStore.read('journal').length,1); // validation is atomic before writes
  console.log('PASS transport: USDT perpetual scope, rate-limit retry, server clock, candle cache until next close, data validity, scan skor tren 1D\nPASS storage: user journal continuity, secret-free export, atomic validation, import rencana tren tanpa TP, legacy engine isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
