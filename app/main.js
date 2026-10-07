/* Orkestrasi aplikasi. Semua keputusan pasar didelegasikan ke engine breakout 55/20 (Trend, turtle-v1). */
(function(root){
  'use strict';
  const U=MalomoUI,S=MalomoStore,M=MalomoMarket;
  let scanning=false,lastScanAt=0,scanProgress='',detailToken=0,renderAt=0,lastPrices=new Map(),polling=false;
  const id=()=>Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  const symbol=v=>{const s=String(v||'').trim().toUpperCase();return s.endsWith('USDT')?s:s+'USDT';};
  function on(name,fn,event='click'){U.$(name)?.addEventListener(event,fn);}
  // Track yang sudah closed sudah tersalin ke histori, jadi tidak disimpan lagi di daftar pemantauan.
  const saveTracks=tracks=>S.write('tracks',tracks.filter(x=>x.status!=='closed'));
  // Scan berjalan otomatis sejak aplikasi dibuka dan diulang terus selama tab aktif; jeda antar-scan dihitung
  // dari selesainya scan sebelumnya. Data candle di-cache sampai candle berikutnya close, jadi scan ulang cepat.
  const SCAN_GAP=60000;
  function log(message,sym){const a=S.read('alerts');a.unshift({id:id(),at:Date.now(),message,symbol:sym||null});S.write('alerts',a.slice(0,200));U.alerts();U.status(message);}
  // Alert transisi pemantauan; tampil di banner berjalan dan log alert seperti Decision engine lama.
  function transition(r,before){
    if(r.status===before)return;
    const head=r.symbol.replace(/USDT$/,'')+' '+r.side.toUpperCase();
    if(before==='armed'&&r.status==='running'){journalOpen(r);log('🧭 '+head+' RUNNING — harga menyentuh Entry '+U.price(r.entry)+' ('+setupLabel(r)+') · tercatat di Jurnal',r.symbol);}
    if(r.status==='closed'&&r.outcome==='tp')log('✅ '+head+' kena TP (+'+r.r.toFixed(2)+'R) — keluar dari Decision, Jurnal diperbarui',r.symbol);
    if(r.status==='closed'&&(r.outcome==='sl'||r.outcome==='exit20'))log((r.r>0?'✅ ':'❌ ')+head+' keluar di '+exitName(r)+' ('+(r.r>=0?'+':'')+r.r.toFixed(2)+'R) — keluar dari Decision, Jurnal diperbarui',r.symbol);
    MalomoLive.sync(S.read('tracks'));
    if(r.status==='running'){pollOI();MalomoLive.pollStructure(S.read('tracks'));}
  }
  async function telegram(message){
    const cfg=S.read('telegram',{});if(!cfg.enabled||!cfg.token||!cfg.chatId)throw new Error('Aktifkan dan simpan konfigurasi Telegram dahulu.');
    const res=await fetch('https://api.telegram.org/bot'+cfg.token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:cfg.chatId,text:message})});
    const data=await res.json();if(!data.ok)throw new Error('Telegram menolak pengiriman.');
  }
  function notify(message){
    log(message);
    if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('ICT Screening',{body:message});
    const cfg=S.read('telegram',{});if(cfg.enabled)telegram(message).catch(()=>log('Notifikasi Telegram gagal dikirim.'));
  }
  function prices(data){
    if(polling)return;
    const alerts=S.read('priceAlerts'),tracks=S.read('tracks'),transitions=[];let changed=false;
    for(const d of data){
      const old=lastPrices.get(d.symbol);lastPrices.set(d.symbol,d.lastPrice);
      for(const a of alerts.filter(a=>a.symbol===d.symbol&&!a.triggered)){
        if(old!==undefined&&(a.direction==='above'?old<a.price&&d.lastPrice>=a.price:old>a.price&&d.lastPrice<=a.price)){a.triggered=true;notify(d.symbol+' menembus '+a.price);changed=true;}
      }
      for(const r of tracks.filter(r=>r.symbol===d.symbol&&r.status!=='closed'&&!r.frozen)){
        if(Date.now()-r.lastAt>120000)continue; // candle catch-up must precede decisions after background gaps
        const before=r.status;MalomoTracker.advance(r,{low:Math.min(old??d.lastPrice,d.lastPrice),high:Math.max(old??d.lastPrice,d.lastPrice)},Date.now());
        changed=true;
        if(r.status!==before){if(r.status==='closed')recordClose(r);transitions.push([r,before]);}
      }
    }
    if(changed){S.write('priceAlerts',alerts);saveTracks(tracks);transitions.forEach(([r,b])=>transition(r,b));U.priceAlerts();U.decision();}
  }
  const fmtScore=v=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(1):'—';
  const exitName=r=>r.outcome==='exit20'?'exit 20 hari':r.outcome==='tp'?'TP':r.trailing?'trailing stop':'SL';
  // Label tahap validasi ikut tersimpan di jurnal supaya bukti PAPER bisa dipisah dari sinyal yang kelak lulus uji.
  const stageOf=r=>r.stage||(r.engine==='trend-v1'?'PAPER':'');
  function setupLabel(r){return (r.engine==='turtle-v1'?'Breakout 55/20':r.engine==='trend-v1'?'Tren Carver · skor '+fmtScore(r.forecastAtSignal):'Malomo · close 1H')+(stageOf(r)?' · '+stageOf(r):'');}
  const stopNote=r=>r.engine==='turtle-v1'?' (2 × ATR20). Keluar saat close 1D menembus '+(r.side==='long'?'low':'high')+' 20 hari.':r.trailing?' (trailing 0,5 × volatilitas tahunan).':'.';
  // Jurnal otomatis: setiap pair yang harganya menyentuh entry dicatat saat itu juga (status open),
  // lalu entri yang sama diperbarui saat posisi selesai. Data ini menjadi bukti kinerja aplikasi ke depan.
  function journalOpen(r){
    const journal=S.read('journal');if(journal.some(x=>x.trackId===r.id))return;
    journal.unshift({id:id(),trackId:r.id,auto:true,symbol:r.symbol,direction:r.side,date:new Date(r.runningAt||Date.now()).toISOString().slice(0,10),
      status:'open',entry:r.entry,exit:'',sl:r.sl,tp1:Number.isFinite(r.tp)?r.tp:'',tp2:'',tp3:'',pnlUsd:'',pnlPct:'',setup:setupLabel(r),emotion:'',
      notes:(stageOf(r)==='PAPER'?'PAPER (aturan belum lulus uji). ':'')+'Dicatat otomatis saat harga menyentuh entry ('+new Date(r.runningAt||Date.now()).toLocaleString('id-ID',{timeZone:'Asia/Makassar'})+' WITA). Stop awal '+U.price(r.initialSl??r.sl)+stopNote(r)+' Harga level plan; belum termasuk fee/slippage/funding.'});
    S.write('journal',journal);U.journal();
  }
  function recordClose(r){
    const history=S.read('history');if(history.some(x=>x.trackId===r.id))return;
    history.unshift(Object.assign({},r,{id:id(),trackId:r.id}));S.write('history',history);U.history();
    if(r.outcome==='void')return;
    const journal=S.read('journal'),long=r.side==='long';
    const closedText=new Date(r.closedAt).toLocaleString('id-ID',{timeZone:'Asia/Makassar'})+' WITA';
    const fields={status:MalomoTracker.journalStatus(r),exit:r.exit,sl:r.sl,pnlPct:+(100*(r.exit-r.entry)*(long?1:-1)/r.entry).toFixed(3),closedAt:r.closedAt};
    const note=' · Selesai '+closedText+' di '+exitName(r)+' '+U.price(r.exit)+' ('+(r.r>=0?'+':'')+r.r.toFixed(2)+'R).';
    const e=journal.find(x=>x.trackId===r.id);
    if(e){Object.assign(e,fields);e.notes=(e.notes||'')+note;}
    else journal.unshift(Object.assign({id:id(),trackId:r.id,auto:true,symbol:r.symbol,direction:r.side,date:new Date(r.runningAt||r.closedAt).toISOString().slice(0,10),entry:r.entry,tp1:Number.isFinite(r.tp)?r.tp:'',setup:setupLabel(r),notes:'Dicatat otomatis.'+note},fields));
    S.write('journal',journal);U.journal();
  }
  // Mesin Carver (trend-v1) dihentikan 8 Okt 2026 (keputusan pemilik): rencananya yang masih ARMED/RUNNING dibuang dari
  // Decision. Tidak dihitung sebagai hasil: tidak masuk histori dan entri jurnalnya diberi status "dihentikan".
  function retireLegacy(){
    const tracks=S.read('tracks'),old=tracks.filter(r=>r.engine==='trend-v1'&&r.status!=='closed');
    if(!old.length)return;
    const ids=new Set(old.map(r=>r.id)),journal=S.read('journal'),at=new Date().toLocaleString('id-ID',{timeZone:'Asia/Makassar'})+' WITA';
    for(const e of journal)if(ids.has(e.trackId)&&['open','floating'].includes(e.status)){e.status='cancelled';e.notes=(e.notes||'')+' · Dihentikan '+at+': mesin Carver diganti breakout 55/20; tidak dihitung sebagai hasil.';}
    S.write('journal',journal);saveTracks(tracks.filter(r=>!ids.has(r.id)));
    log('🧹 '+old.length+' posisi lama mesin Carver dibuang dari Decision (tidak dihitung sebagai hasil).');
  }
  // Permintaan pemilik 8 Okt 2026: semua entri jurnal lama dihapus sekali. Entri otomatis breakout 55/20 dipertahankan
  // (bukti forward). Salinan lengkap disimpan di malomo_journal_backup_20261008 untuk berjaga-jaga.
  function resetJournal(){
    const flag='malomo_journal_reset_20261008';if(localStorage.getItem(flag))return;
    const all=S.read('journal');
    if(all.length)localStorage.setItem('malomo_journal_backup_20261008',JSON.stringify(all));
    const keep=all.filter(e=>e.auto&&String(e.setup||'').startsWith('Breakout 55/20'));
    S.write('journal',keep);localStorage.setItem(flag,String(Date.now()));
    if(all.length>keep.length)log('🧹 '+(all.length-keep.length)+' entri jurnal lama dihapus. Jurnal kini hanya berisi sinyal breakout 55/20.');
  }
  async function catchUp(){
    if(polling)return;polling=true;
    try{
      const tracks=S.read('tracks'),transitions=[];
      const active=x=>x.status!=='closed'&&!x.frozen;
      for(const sym of [...new Set(tracks.filter(active).map(x=>x.symbol))]){
        try{
          let candles=await M.candles(sym,'1m',1000);
          // Riwayat 1m tidak menjangkau jeda terakhir: dibekukan sekali dan diberi pesan sekali,
          // bukan diulang setiap siklus refresh.
          for(const r of tracks.filter(x=>x.symbol===sym&&active(x)&&candles.length&&x.lastAt<candles[0].t)){r.frozen=true;log(sym+': riwayat pemantauan belum lengkap; status dibekukan.');}
          for(const r of tracks.filter(x=>x.symbol===sym&&active(x))){
            const start=r.status;for(const c of candles.filter(c=>c.ct>r.lastAt)){const before=r.status;MalomoTracker.advance(r,c,c.ct);if(before!=='closed'&&r.status==='closed')recordClose(r);}
            if(r.status!==start)transitions.push([r,start]);
          }
        }catch(e){log(sym+': pemantauan gagal — '+e.message);}
      }
      saveTracks(tracks);transitions.forEach(([r,b])=>transition(r,b));U.decision();
    }finally{polling=false;}
  }
  async function refresh(){try{await M.refresh();await catchUp();U.status('Data Binance diperbarui · '+new Date().toLocaleTimeString('id-ID'));}catch(e){U.status('Gagal memuat Binance: '+e.message,true);U.html('tbody','<div class="empty-state">Data pasar tidak tersedia. Periksa koneksi dan coba lagi.</div>');}}
  // Hasil disimpan ringkas agar langsung tampil saat aplikasi dibuka lagi (hanya untuk tampilan;
  // pemantauan Trading Plan selalu memakai hasil scan yang baru).
  function slimScan(r){
    const keep=['engine','side','status','plan','decision','last','atr','atrPct','high55','low55','exitLong','exitShort','distLong','distShort','volume30'];
    return {engine:'turtle-v1',at:r.at,universe:r.universe,errors:r.errors,candidates:r.candidates.map(c=>({symbol:c.symbol,quoteVolume:c.quoteVolume,error:c.error,metrics:c.metrics,
      evaluation:Object.fromEntries(keep.map(k=>[k,c.evaluation[k]]))}))};
  }
  // Tombol Scan: tampilkan hasil terakhir seketika; scan baru hanya dimulai bila tidak ada yang sedang berjalan
  // dan hasil terakhir sudah lewat jeda. Menutup panel tidak membatalkan scan.
  function openScan(){
    U.panel('modeResultsSection');U.$('heroModeStatus').classList.add('show');U.text('modeResultsTitle','Breakout Swing 55/20 · Top 100');
    if(root.lastMalomoScan)U.scan(root.lastMalomoScan,scanning?scanProgress:null);else U.text('heroModeStatus',scanning?scanProgress:'Memulai scan…');
    if(!scanning&&Date.now()-lastScanAt>=SCAN_GAP)scan();
  }
  async function scan(){
    if(scanning)return;scanning=true;scanProgress='memperbarui…';
    U.$('heroModeStatus').classList.add('show');
    try{
      const result=await M.scan({progress:(n,total)=>{
        scanProgress=root.lastMalomoScan?'memperbarui '+n+'/'+total:'Scan '+n+'/'+total+' pair (Top 100 dipilih dari volume 30 hari)…';
        if(root.lastMalomoScan)U.scanStatus(root.lastMalomoScan,scanProgress);else U.text('heroModeStatus',scanProgress);
      }});
      for(const row of result.candidates)row.metrics=MalomoMarketData.metrics(row.evaluation);
      root.lastMalomoScan=result;lastScanAt=Date.now();U.scan(result);
      S.write('lastScan',slimScan(result));
      syncTracks(result);
      await manageRunning(result);
      refreshMarketData();
    }catch(e){if(root.lastMalomoScan)U.scanStatus(root.lastMalomoScan,'pembaruan gagal: '+e.message);else U.text('heroModeStatus','Scan gagal: '+e.message);lastScanAt=Date.now();}
    finally{scanning=false;scanProgress='';}
  }
  // Data pasar pelengkap untuk semua kandidat; daftar dirender ulang berkala selama data berdatangan.
  function refreshMarketData(){
    if(!root.lastMalomoScan)return;
    let shownAt=0;
    MalomoMarketData.refresh(root.lastMalomoScan.candidates.map(r=>r.symbol),()=>{
      if(Date.now()-shownAt>1500){shownAt=Date.now();U.scan(root.lastMalomoScan,scanning?scanProgress:null);}
    }).then(()=>U.scan(root.lastMalomoScan,scanning?scanProgress:null));
  }
  // Tombol Refresh: paksa scan baru dan data pasar terbaru, tanpa menunggu jeda otomatis.
  function forceRefresh(){
    MalomoMarketData.invalidate();
    if(scanning){if(root.lastMalomoScan)U.scanStatus(root.lastMalomoScan,scanProgress+' (sedang berjalan)');return;}
    scan();
  }
  let ddWarned=false;
  function syncTracks(result){
    const tracks=S.read('tracks'),history=S.read('history'),now=Date.now();
    const current=new Map();
    for(const row of result.candidates){const rec=MalomoTracker.create(row.symbol,row.evaluation,now);if(rec)current.set(row.symbol,rec);}
    // Hanya pair yang benar-benar terbaca tanpa error pada scan ini yang boleh menggugurkan rencana armed.
    const failed=new Set([...result.errors.map(e=>e.symbol),...result.candidates.filter(r=>r.error).map(r=>r.symbol)]);
    const scanned=new Set(result.universe.filter(s=>!failed.has(s)));
    for(const r of tracks.filter(r=>scanned.has(r.symbol)))if(MalomoTracker.expire(r,current.get(r.symbol),now))recordClose(r);
    // Drawdown jurnal ≥ 20% → sinyal baru dihentikan (posisi yang sudah berjalan tetap dipantau sampai keluar).
    const dd=Trend.drawdown(history);
    if(dd.current>=Trend.RULES.maxDrawdown){if(!ddWarned)log('⛔ Drawdown jurnal '+(100*dd.current).toFixed(1)+'% ≥ '+(100*Trend.RULES.maxDrawdown)+'% — sinyal baru dihentikan.');ddWarned=true;saveTracks(tracks);U.decision();return;}
    ddWarned=false;
    // Satu pair satu rencana aktif; maks 5 per arah. Kandidat sudah urut volume 30 hari terbesar (prioritas slot).
    // Sinyal = masuk sekarang: posisi langsung RUNNING di harga terkini (SL ikut digeser, jarak 2 × ATR20 tetap) dan
    // langsung tercatat di Jurnal. Tidak menunggu harga kembali ke harga saat scan dimulai — saat breakout, harga
    // sering sudah bergerak menjauh selama scan berjalan sehingga rencana tidak pernah tersentuh.
    const slots=side=>tracks.filter(x=>x.status!=='closed'&&x.side===side&&x.engine==='turtle-v1').length,opened=[];
    const live=new Map(M.getTickers().map(t=>[t.symbol,t.lastPrice]));
    for(const rec of current.values()){
      if(!(slots(rec.side)<Trend.RULES.maxPerSide&&MalomoTracker.admit(tracks,rec)&&!history.some(x=>x.trackId===rec.id)))continue;
      const px=live.get(rec.symbol)>0?live.get(rec.symbol):rec.entry,long=rec.side==='long',sl=long?px-rec.risk:px+rec.risk;
      if(long&&!(sl>0))continue;
      Object.assign(rec,{entry:px,sl,initialSl:sl});MalomoTracker.advance(rec,{low:px,high:px},now);
      tracks.push(rec);opened.push(rec);
    }
    saveTracks(tracks);opened.forEach(r=>transition(r,'armed'));U.decision();
  }
  // Posisi RUNNING dicek pada close 1D: turtle-v1 keluar bila close menembus low/high 20 hari; rekaman trend-v1 lama
  // menaikkan trailing stop. Candle dikumpulkan dulu, lalu track dibaca-ulang dan ditulis sinkron agar tidak menimpa
  // perubahan status yang terjadi di sela jaringan.
  async function manageRunning(result){
    const rows=new Map((result?.candidates||[]).map(r=>[r.symbol,r.evaluation.candles]));
    const daily=r=>r.status==='running'&&(r.engine==='turtle-v1'||r.engine==='trend-v1');
    const need=[...new Set(S.read('tracks').filter(daily).map(r=>r.symbol))];
    const got=new Map();
    for(const sym of need){try{got.set(sym,rows.get(sym)||Trend.closed(await M.candles(sym,'1d',400),M.serverNow()));}catch{/* dicoba lagi pada scan berikutnya */}}
    const tracks=S.read('tracks'),transitions=[];let changed=false;
    for(const r of tracks){
      if(!daily(r)||!got.has(r.symbol))continue;
      if(r.engine==='turtle-v1'){const x=Trend.exitSignal(r,got.get(r.symbol));if(x){MalomoTracker.exit(r,x.price,x.at);recordClose(r);transitions.push([r,'running']);changed=true;}}
      else{const before=r.sl;Trend.trail(r,got.get(r.symbol));if(r.sl!==before)changed=true;}
    }
    if(changed){saveTracks(tracks);transitions.forEach(([r,b])=>transition(r,b));U.decision();}
  }
  // Acuan OI dicatat sinkron dari data track terbaru sesudah jaringan selesai, agar tidak menimpa status yang baru berubah.
  async function pollOI(){
    await MalomoLive.pollOI(S.read('tracks'));
    const tracks=S.read('tracks');let changed=false;
    for(const r of tracks)if(r.status==='running'&&!(r.oiBase>0)&&MalomoLive.data(r.symbol).oi>0){r.oiBase=MalomoLive.data(r.symbol).oi;changed=true;}
    if(changed)saveTracks(tracks);
  }
  async function detail(sym,tf='4h',modal=true){
    const token=++detailToken;const s=symbol(sym);U.$('searchResults').classList.remove('show');U.text('wsAnalysisSymbolInput',s);
    U.$('wsAnalysisSymbolInput').value=s;
    if(modal){U.panels();U.$('modalBackdrop').classList.add('show');}
    U.html('modalBody','<div class="modal-loading"><span class="loader"></span>Memuat breakout 55/20…</div>');
    try{
      const evaluation=await M.evaluate(s);
      if(token!==detailToken)return;U.detail(s,evaluation,tf);
      MalomoMarketData.ensure(s).then(()=>{if(token===detailToken)U.detail(s,evaluation,tf);}).catch(()=>{});
    }catch(e){if(token===detailToken){const msg='<div class="empty-state">Gagal memuat: '+U.esc(e.message)+'</div>';U.html('modalBody',msg);U.html('wsAnalysisBody',msg);U.status(e.message,true);}}
  }
  function star(sym){const wl=S.read('watchlist');S.write('watchlist',wl.includes(sym)?wl.filter(x=>x!==sym):[...wl,sym]);U.market();if(U.getSelected()?.symbol===sym)U.$('mhStarBtn').textContent=wl.includes(sym)?'☆':'★';}
  function savePlan(){const d=U.getSelected();if(!d?.evaluation.plan){log('Belum ada Trading Plan tervalidasi.');return;}const history=S.read('history');history.unshift(Object.assign({id:id(),symbol:d.symbol,side:d.evaluation.side,at:Date.now()},d.evaluation.plan));S.write('history',history);U.history();log('Trading Plan '+d.symbol+' berhasil disimpan.');}
  function calculate(){const balance=Number(U.$('calcBalance').value),risk=Number(U.$('calcRiskPct').value),entry=Number(U.$('calcEntry').value),sl=Number(U.$('calcSl').value),leverage=Number(U.$('calcLeverage').value);if(!(balance>0&&risk>0&&risk<=100&&entry>0&&sl>0&&entry!==sl)){U.html('calcResult','<div class="sop-note">Isi modal, risk, entry, dan SL yang valid.</div>');return;}const dollars=balance*risk/100,quantity=dollars/Math.abs(entry-sl),notional=quantity*entry;U.html('calcResult',U.card('POSITION SIZE',U.row('Risk ($)',U.price(dollars))+U.row('Quantity',U.price(quantity))+U.row('Notional ($)',U.price(notional))+U.row('Margin ($)',U.price(notional/leverage))));}
  function journalSave(event){event.preventDefault();const rows=S.read('journal'),entry={id:U.$('jfId').value||id()};const fields={Symbol:'symbol',Direction:'direction',Date:'date',Status:'status',Entry:'entry',Exit:'exit',Sl:'sl',Tp1:'tp1',Tp2:'tp2',Tp3:'tp3',PnlUsd:'pnlUsd',PnlPct:'pnlPct',Setup:'setup',Emotion:'emotion',Notes:'notes'};for(const [suffix,key] of Object.entries(fields))entry[key]=U.$('jf'+suffix).value;entry.symbol=symbol(entry.symbol);S.write('journal',[entry,...rows.filter(x=>x.id!==entry.id)]);U.$('journalModalBackdrop').classList.remove('show');U.journal();log('Entry jurnal berhasil disimpan.');}
  function exportData(){const blob=new Blob([JSON.stringify(S.exportData(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='ICT_Malomo_User_Data.json';link.click();URL.revokeObjectURL(url);log('Data berhasil diekspor.');}
  async function importFile(event){const file=event.target.files[0];if(!file)return;try{S.importData(JSON.parse(await file.text()));U.market();U.journal();U.history();U.decision();U.priceAlerts();log('Data berhasil diimpor.');}catch(e){log('Impor gagal: '+e.message);}event.target.value='';}
  async function delegated(event){
    const target=event.target.closest('[data-action],[data-ws],[data-filter],[data-sort],.tf-btn,.agent-chip');if(!target)return;
    if(target.dataset.ws){U.workspace(target.dataset.ws);return;}
    if(target.dataset.filter){U.setFilter(target.dataset.filter);return;}
    if(target.dataset.sort){U.setSort(target.dataset.sort);return;}
    if(target.dataset.tf){if(U.getSelected())await detail(U.getSelected().symbol,target.dataset.tf,U.$('modalBackdrop').classList.contains('show'));return;}
    if(target.dataset.agent){const d=U.getSelected();if(d){try{await navigator.clipboard.writeText(JSON.stringify({role:target.dataset.agent,symbol:d.symbol,bias:d.evaluation.bias,status:d.evaluation.status,zone:d.evaluation.zone,plan:d.evaluation.plan},null,2));log('Ringkasan berhasil disalin.');}catch{log('Clipboard tidak tersedia.');}}return;}
    const a=target.dataset.action,s=target.dataset.symbol;
    if(a==='star'){event.stopPropagation();star(s);}
    else if(a==='detail')await detail(s);
    else if(a==='journal-edit')U.journalForm(target.dataset.id);
    else if(a==='save-plan')savePlan();
    else if(a==='use-plan'){const p=U.getSelected()?.evaluation.plan;if(p){U.$('calcEntry').value=p.entry;U.$('calcSl').value=p.sl;U.$('calcRiskPct').value=Trend.RULES.riskPct;U.workspace('wsTrading');log('Entry dan SL diterapkan ke kalkulator.');}}
    else if(a==='history-delete'){S.write('history',S.read('history').filter(x=>x.id!==target.dataset.id));U.history();}
    else if(a==='price-alert-delete'){S.write('priceAlerts',S.read('priceAlerts').filter(x=>x.id!==target.dataset.id));U.priceAlerts();}
  }
  function start(){
    document.addEventListener('click',event=>delegated(event).catch(e=>log(e.message)));
    on('hamburgerBtn',()=>{U.$('sidebar').classList.add('open');U.$('sidebarOverlay').classList.add('show');});on('sidebarCloseBtn',U.closeSidebar);on('sidebarOverlay',U.closeSidebar);
    on('introTipClose',()=>{U.$('introTip').style.display='none';localStorage.setItem('malomo_intro_hidden','1');});if(localStorage.getItem('malomo_intro_hidden'))U.$('introTip').style.display='none';
    // Back hanya menutup panel; scan tetap berjalan dan hasilnya langsung tampil saat panel dibuka lagi.
    on('modeResultsClose',()=>U.panels());on('scanRefreshBtn',forceRefresh);
    for(const name of ['modalCloseBtn','alertDrawerClose','settingsDrawerClose','historyPanelClose','journalModalClose'])on(name,()=>{detailToken++;U.panels();});
    for(const name of ['modalBackdrop','journalModalBackdrop'])on(name,e=>{if(e.target===U.$(name))U.$(name).classList.remove('show');});
    on('modeIntradayBtn',openScan);on('scanTopBtn',openScan);
    on('decisionQuickBtn',()=>U.workspace('wsDecision'));on('marketQuickBtn',()=>U.workspace('wsScanner'));
    on('sqWatchlist',()=>{U.workspace('wsScanner');U.setFilter('watchlist');});on('sqFunding',()=>{U.workspace('wsScanner');U.setFilter('fundingext');});
    for(const name of ['sqAlerts','alertBtn','topbarAlertBtn'])on(name,()=>{U.alerts();U.panel('alertDrawer');});on('sqSettings',()=>U.panel('settingsDrawer'));
    for(const name of ['sqHistory','reviewHistoryBtn'])on(name,()=>{U.history();U.panel('historyPanel');});
    on('searchBox',U.market,'input');on('wsAnalysisSymbolBtn',()=>detail(U.$('wsAnalysisSymbolInput').value,'4h',false));on('wsAnalysisSymbolInput',e=>{if(e.key==='Enter')detail(e.target.value,'4h',false);},'keydown');
    on('mhStarBtn',()=>{if(U.getSelected())star(U.getSelected().symbol);});on('tvOpenBtn',()=>{const d=U.getSelected();if(d)window.open('https://www.tradingview.com/chart/?symbol=BINANCE%3A'+encodeURIComponent(d.symbol)+'.P','_blank','noopener,noreferrer');});
    on('calcLeverage',()=>U.text('calcLeverageValue',U.$('calcLeverage').value+'x'),'input');on('calcRunBtn',calculate);
    on('journalAddBtn',()=>U.journalForm());on('journalForm',journalSave,'submit');on('journalDeleteBtn',()=>{S.write('journal',S.read('journal').filter(x=>x.id!==U.$('jfId').value));U.panels();U.journal();log('Entry jurnal dihapus.');});on('journalClearBtn',()=>{S.write('journal',[]);U.journal();log('Jurnal dibersihkan.');});
    on('exportDataBtn',exportData);on('importDataBtn',()=>U.$('importDataFile').click());on('importDataFile',importFile,'change');
    on('clearAlertBtn',()=>{S.write('alerts',[]);U.alerts();});on('notifPermBtn',async()=>{if(typeof Notification==='undefined'){log('Notifikasi tidak didukung browser ini.');return;}U.text('notifStatus',await Notification.requestPermission());});
    on('paAddBtn',()=>{const p=Number(U.$('paPrice').value),s=symbol(U.$('paSymbol').value);if(!(p>0)||!M.getTickers().some(x=>x.symbol===s)){log('Pair atau harga alert tidak valid.');return;}const a=S.read('priceAlerts');a.push({id:id(),symbol:s,price:p,direction:U.$('paDirection').value,triggered:false});S.write('priceAlerts',a);U.priceAlerts();log('Alert harga berhasil ditambahkan.');});
    const tg=S.read('telegram',{});U.$('tgToken').value=tg.token||'';U.$('tgChatId').value=tg.chatId||'';U.$('tgEnabled').checked=!!tg.enabled;
    on('tgSaveBtn',()=>{S.write('telegram',{token:U.$('tgToken').value.trim(),chatId:U.$('tgChatId').value.trim(),enabled:U.$('tgEnabled').checked});U.text('tgStatus','Konfigurasi disimpan lokal.');});
    on('tgTestBtn',async()=>{try{await telegram('Test notifikasi ICT Screening');U.text('tgStatus','Test berhasil dikirim.');}catch(e){U.text('tgStatus',e.message);}});
    on('scrollTopBtn',()=>window.scrollTo({top:0,behavior:'smooth'}));document.addEventListener('keydown',e=>{if(e.key==='Escape'){detailToken++;U.panels();U.closeSidebar();}});
    window.addEventListener('popstate',()=>{U.panels();U.workspace('wsHome');});
    setInterval(()=>U.text('topbarClock',new Date().toLocaleString('id-ID',{timeZone:'Asia/Makassar'})),1000);U.text('sidebarEngineStatus','Breakout 55/20 · turtle-v1');
    M.subscribe(data=>{prices(data);if(Date.now()-renderAt>2000){renderAt=Date.now();U.market();U.decision();}});
    retireLegacy();resetJournal();
    U.journal();U.history();U.decision();U.alerts();U.priceAlerts();refresh().then(()=>{if(root.lastMalomoScan)U.scan(root.lastMalomoScan,scanning?scanProgress:null);if(!scanning&&!document.hidden)scan();});M.connect();setInterval(refresh,45000);
    // Decision: data tampilan real-time untuk posisi RUNNING (OI ±15 dtk, CVD & orderbook WebSocket, struktur 4H ±30 dtk).
    MalomoLive.sync(S.read('tracks'));
    setInterval(()=>{MalomoLive.tick();MalomoLive.sync(S.read('tracks'));if(U.getActive()==='wsDecision')U.decision();},1000);
    setInterval(pollOI,15000);setInterval(()=>MalomoLive.pollStructure(S.read('tracks')),30000);
    pollOI();MalomoLive.pollStructure(S.read('tracks'));
    // Hasil scan lama dari engine sebelumnya diabaikan karena formatnya berbeda.
    const saved=S.read('lastScan',null);if(saved&&saved.engine==='turtle-v1'&&Array.isArray(saved.candidates)){root.lastMalomoScan=saved;U.scan(saved);}
    setInterval(()=>{if(!scanning&&Date.now()-lastScanAt>=SCAN_GAP&&!document.hidden&&M.getTickers().length)scan();},10000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>U.status('Cache offline tidak tersedia.'));
  }
  root.MalomoApp={start,scan,detail,refresh,star,calculate,catchUp};
})(globalThis);
