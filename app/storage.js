/* Local user data only. Strategy state is isolated from the previous engine. */
(function(root){
  'use strict';
  const keys={watchlist:'pp_watchlist',journal:'pp_trade_journal',history:'malomo_history',tracks:'malomo_tracks',alerts:'malomo_alerts',priceAlerts:'malomo_price_alerts',telegram:'pp_telegram_config',lastScan:'malomo_last_scan',trendResets:'malomo_trend_resets'};
  function read(name,fallback=[]){try{const v=JSON.parse(localStorage.getItem(keys[name]||name));return v===null||Array.isArray(fallback)&&!Array.isArray(v)?fallback:v;}catch{return fallback;}}
  function write(name,value){localStorage.setItem(keys[name]||name,JSON.stringify(value));return value;}
  function exportData(){return {format:'malomo-user-data',version:1,watchlist:read('watchlist'),journal:read('journal'),history:read('history'),tracks:read('tracks'),priceAlerts:read('priceAlerts')};}
  function importData(value){
    if(!value||typeof value!=='object')throw new Error('Format data tidak valid');
    for(const key of ['watchlist','journal','history','tracks','priceAlerts']){
      if(value[key]!==undefined&&!Array.isArray(value[key]))throw new Error('Data '+key+' harus berupa daftar');
    }
    if(value.watchlist&&value.watchlist.some(x=>typeof x!=='string'))throw new Error('Watchlist harus berisi nama pair');
    for(const key of ['journal','history','tracks','priceAlerts'])if(value[key]?.some(x=>!x||typeof x!=='object'))throw new Error('Entry '+key+' tidak valid');
    // Engine trend-v1 tidak punya TP/RR (keluar lewat trailing stop); engine malomo-v1 lama wajib punya keduanya.
    const validTrack=x=>['malomo-v1','trend-v1'].includes(x.engine)&&['long','short'].includes(x.side)&&['armed','running','closed'].includes(x.status)&&[x.entry,x.sl,x.risk,x.lastAt].every(Number.isFinite)&&x.risk>0&&(x.engine==='trend-v1'||[x.tp,x.rr].every(Number.isFinite));
    if(value.tracks?.some(x=>!validTrack(x)))throw new Error('Data pemantauan harus berasal dari engine aplikasi ini');
    for(const key of ['watchlist','journal','history','tracks','priceAlerts'])if(value[key]!==undefined)write(key,value[key]);
  }
  root.MalomoStore={read,write,exportData,importData};
})(globalThis);
