/* Data real-time untuk posisi RUNNING di Decision: OI, CVD, orderbook, dan skor tren 1D terkini.
   HANYA tampilan — tidak pernah masuk penilaian engine Malomo (port dari tampilan Decision engine lama). */
(function(root){
  'use strict';
  const MAX_LIVE=8; // pair RUNNING yang mendapat stream CVD/orderbook sekaligus
  // Binance memisahkan endpoint WebSocket futures: aggTrade di /market, depth di /public.
  const SOCKS={
    market:{path:'market',stream:s=>s+'@aggTrade',flag:'wsOn'},
    public:{path:'public',stream:s=>s+'@depth20@500ms',flag:'depthOn'},
  };
  const data={},structure={};
  let socks={},signature='',timers={},delay=2000;
  const ld=s=>data[s]||(data[s]={cvd:0,cvdWin:[],cvdSince:Date.now(),wsOn:false});
  function liveSymbols(tracks){
    return [...new Set(tracks.filter(r=>r.status==='running').sort((a,b)=>(b.runningAt||0)-(a.runningAt||0)).map(r=>r.symbol))].slice(0,MAX_LIVE);
  }
  function closeAll(){
    for(const k in timers)clearTimeout(timers[k]);timers={};
    for(const k in socks){const w=socks[k];w.onclose=null;w.onerror=null;try{w.close();}catch{/* sudah tertutup */}}
    socks={};
  }
  function handle(stream,msg){
    const sym=msg.s;if(!sym)return;const d=ld(sym);
    if(stream.endsWith('@aggTrade')){
      const q=parseFloat(msg.p)*parseFloat(msg.q);if(!(q>0))return;
      const delta=msg.m?-q:q; // m = pembeli adalah maker -> agresor JUAL
      d.cvd+=delta;d.cvdWin.push({t:msg.T||Date.now(),d:delta});
    }else if(stream.includes('@depth')){
      const bids=msg.b||[],asks=msg.a||[];
      const sum=a=>a.reduce((s,x)=>s+parseFloat(x[0])*parseFloat(x[1]),0);
      const bu=sum(bids),au=sum(asks);
      if(bu+au>0&&bids.length&&asks.length)Object.assign(d,{bidUsd:bu,askUsd:au,imb:(bu-au)/(bu+au),bid:parseFloat(bids[0][0]),ask:parseFloat(asks[0][0])});
    }
  }
  function open(kind,syms){
    const cfg=SOCKS[kind];
    try{
      const w=new WebSocket('wss://fstream.binance.com/'+cfg.path+'/stream?streams='+syms.map(s=>cfg.stream(s.toLowerCase())).join('/'));
      w._last=0;w._t0=Date.now();socks[kind]=w;
      w.onopen=()=>{delay=2000;};
      w.onmessage=e=>{
        try{
          const m=JSON.parse(e.data);if(!m||!m.stream||!m.data)return;
          if(!w._last)syms.forEach(s=>{ld(s)[cfg.flag]=true;});
          w._last=Date.now();handle(m.stream,m.data);
        }catch{/* pesan rusak tidak mengubah tampilan */}
      };
      w.onerror=()=>{try{w.close();}catch{/* sudah tertutup */}};
      w.onclose=()=>{
        if(socks[kind]!==w)return;
        delete socks[kind];syms.forEach(s=>{ld(s)[cfg.flag]=false;});
        clearTimeout(timers[kind]);
        timers[kind]=setTimeout(()=>{if(!socks[kind]&&signature)open(kind,signature.split(','));},delay);
        delay=Math.min(delay*1.6,30000);
      };
    }catch{/* WebSocket tidak tersedia: sel menampilkan "menyambung…" */}
  }
  function sync(tracks){
    const syms=liveSymbols(tracks),sig=syms.join(',');
    if(sig===signature&&(Object.keys(socks).length||!syms.length))return;
    closeAll();signature=sig;
    Object.keys(data).forEach(s=>{if(!syms.includes(s)){data[s].wsOn=false;data[s].depthOn=false;}});
    if(syms.length)for(const kind in SOCKS)open(kind,syms);
  }
  // Dipanggil tiap detik: buang CVD di luar jendela 5 menit, tutup koneksi yang tersambung tapi tidak mengirim data.
  function tick(){
    const now=Date.now();
    for(const s in data){const d=data[s];while(d.cvdWin.length&&d.cvdWin[0].t<now-300000)d.cvdWin.shift();}
    for(const kind in socks){
      const w=socks[kind];if(w.readyState!==1)continue;
      if((!w._last&&now-w._t0>20000)||(kind==='public'&&w._last&&now-w._last>20000)){try{w.close();}catch{/* sudah tertutup */}}
    }
  }
  // OI lewat REST ±15 detik. Modul ini tidak menulis ke record track: pemanggil mencatat oiBase secara
  // sinkron dari data terbaru, supaya hasil jaringan yang lambat tidak menimpa perubahan status di sela waktu.
  async function pollOI(tracks){
    for(const sym of liveSymbols(tracks)){
      try{
        const oi=parseFloat((await MalomoMarket.request('/fapi/v1/openInterest?symbol='+encodeURIComponent(sym))).openInterest);
        if(!(oi>0))continue;
        const d=ld(sym);d.oi=oi;d.oiAt=Date.now();
      }catch{/* dicoba lagi pada siklus berikutnya */}
    }
  }
  // Skor tren 1D terkini (engine trend-v1), ±30 detik; candle 1D di-cache sampai candle berikutnya close.
  async function pollStructure(tracks){
    for(const sym of liveSymbols(tracks)){
      try{const e=Trend.evaluate(await MalomoMarket.candles(sym,'1d',400),{now:MalomoMarket.serverNow()});structure[sym]={forecast:e.forecast,at:Date.now()};}
      catch{/* dicoba lagi pada siklus berikutnya */}
    }
  }
  root.MalomoLive={sync,tick,pollOI,pollStructure,data:sym=>data[sym]||{},structure:sym=>structure[sym]};
})(globalThis);
