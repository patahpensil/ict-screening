'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const M=require('../engine/malomo');
const now=1800000000000,minute=60000,calls=[];
const prices=[8,9,10,12,10,9,8,9,10,11,10,9,9.5,10,11,12,13,15,13,12,11,12,13];
const bars=prices.map((p,i)=>[now-(prices.length-i)*minute,p,p+.2,p-.2,p,10,now-(prices.length-i-1)*minute-1,100]);
let rateLimit=true;
const ctx=vm.createContext({Malomo:M,Map,Set,Promise,Date:class extends Date{static now(){return now;}},AbortSignal,setTimeout:fn=>{queueMicrotask(fn);return 1;},clearTimeout(){},setInterval(){},clearInterval(){},fetch:async url=>{
  calls.push(url);const u=new URL(url),path=u.pathname;
  if(rateLimit){rateLimit=false;return {status:429,ok:false,headers:{get:()=>null}};}
  let body;
  if(path.endsWith('exchangeInfo'))body={symbols:[{symbol:'BTCUSDT',quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',filters:[{filterType:'PRICE_FILTER',tickSize:'0.01'}]},{symbol:'XBUSD',quoteAsset:'BUSD',contractType:'PERPETUAL',status:'TRADING'},{symbol:'YUSDT',quoteAsset:'USDT',contractType:'CURRENT_QUARTER',status:'TRADING'}]};
  else if(path.endsWith('24hr'))body=['BTCUSDT','XBUSD','YUSDT'].map(symbol=>({symbol,lastPrice:13,priceChangePercent:1,highPrice:15,lowPrice:8,quoteVolume:0}));
  else if(path.endsWith('/time'))body={serverTime:now+5000};
  else if(path.endsWith('premiumIndex'))body=[{symbol:'BTCUSDT',lastFundingRate:0.0001}];
  else if(u.searchParams.get('interval')==='1m')body=Array.from({length:61},(_,i)=>{const t=now-(60-i)*minute;return [t,10,11,9,10,1,t+minute-1,10];});
  else body=bars;
  return {status:200,ok:true,json:async()=>body};
}});
vm.runInContext(fs.readFileSync('app/market.js','utf8'),ctx);
(async()=>{
  const data=await ctx.MalomoMarket.refresh();assert.deepEqual(data.map(x=>x.symbol),['BTCUSDT']);assert.equal(data[0].fundingRate,.0001);
  assert.equal(calls.filter(x=>x.endsWith('exchangeInfo')).length,2); // rate-limit retry
  assert.equal(ctx.MalomoMarket.serverNow(),now+5000); // candle close dinilai dengan jam server, bukan jam perangkat
  const first=await ctx.MalomoMarket.candles('BTCUSDT','4h'),n=calls.length;assert(first.length===23);await ctx.MalomoMarket.candles('BTCUSDT','4h');assert.equal(calls.length,n);
  const r=await ctx.MalomoMarket.scan();assert.equal(r.universe.length,1);assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].quoteVolume60m,600);assert.equal(r.errors.length,0);
  const original=ctx.MalomoMarket.getTickers();original[0].quoteVolume=NaN;assert.equal((await ctx.MalomoMarket.scan()).universe.length,0);
  const map=new Map();ctx.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
  vm.runInContext(fs.readFileSync('app/storage.js','utf8'),ctx);
  map.set('pp_trade_journal','[{"id":"legacy-user-note","symbol":"BTCUSDT"}]');assert.equal(ctx.MalomoStore.read('journal')[0].id,'legacy-user-note');
  ctx.MalomoStore.write('telegram',{token:'private',enabled:true});assert(!JSON.stringify(ctx.MalomoStore.exportData()).includes('private'));
  assert.throws(()=>ctx.MalomoStore.importData({journal:[null]}));assert.throws(()=>ctx.MalomoStore.importData({tracks:[{engine:'legacy'}]}));
  assert.equal(ctx.MalomoStore.read('journal').length,1); // validation is atomic before writes
  console.log('PASS transport: USDT perpetual scope, rate-limit retry, server clock, shared cache, rolling60m, data validity, scan\nPASS storage: user journal continuity, secret-free export, atomic validation, legacy engine isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
