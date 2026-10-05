/* Application orchestration. All market decisions are delegated to Malomo. */
(function(root){
  'use strict';
  const U=MalomoUI,S=MalomoStore,M=MalomoMarket;
  let scanning=false,lastScanAt=0,scanToken=0,detailToken=0,renderAt=0,lastPrices=new Map(),polling=false;
  const id=()=>Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  const symbol=v=>{const s=String(v||'').trim().toUpperCase();return s.endsWith('USDT')?s:s+'USDT';};
  function on(name,fn,event='click'){U.$(name)?.addEventListener(event,fn);}
  // Track yang sudah closed sudah tersalin ke histori, jadi tidak disimpan lagi di daftar pemantauan.
  const saveTracks=tracks=>S.write('tracks',tracks.filter(x=>x.status!=='closed'));
  const scanButtons=['modeIntradayBtn','modeSwingBtn','scanTopBtn'];
  function log(message){const a=S.read('alerts');a.unshift({id:id(),at:Date.now(),message});S.write('alerts',a.slice(0,200));U.alerts();U.status(message);}
  async function telegram(message){
    const cfg=S.read('telegram',{});if(!cfg.enabled||!cfg.token||!cfg.chatId)throw new Error('Aktifkan dan simpan konfigurasi Telegram dahulu.');
    const res=await fetch('https://api.telegram.org/bot'+cfg.token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:cfg.chatId,text:message})});
    const data=await res.json();if(!data.ok)throw new Error('Telegram menolak pengiriman.');
  }
  function notify(message){
    log(message);
    if(typeof Notification!=='undefined'&&Notification.permission==='granted')new Notification('ICT Malomo Screener',{body:message});
    const cfg=S.read('telegram',{});if(cfg.enabled)telegram(message).catch(()=>log('Notifikasi Telegram gagal dikirim.'));
  }
  function prices(data){
    if(polling)return;
    const alerts=S.read('priceAlerts'),tracks=S.read('tracks');let changed=false;
    for(const d of data){
      const old=lastPrices.get(d.symbol);lastPrices.set(d.symbol,d.lastPrice);
      for(const a of alerts.filter(a=>a.symbol===d.symbol&&!a.triggered)){
        if(old!==undefined&&(a.direction==='above'?old<a.price&&d.lastPrice>=a.price:old>a.price&&d.lastPrice<=a.price)){a.triggered=true;notify(d.symbol+' menembus '+a.price);changed=true;}
      }
      for(const r of tracks.filter(r=>r.symbol===d.symbol&&r.status!=='closed'&&!r.frozen)){
        if(Date.now()-r.lastAt>120000)continue; // candle catch-up must precede decisions after background gaps
        const before=r.status;MalomoTracker.advance(r,{low:Math.min(old??d.lastPrice,d.lastPrice),high:Math.max(old??d.lastPrice,d.lastPrice)},Date.now());
        changed=true;
        if(r.status!==before){if(r.status==='closed')recordClose(r);}
      }
    }
    if(changed){S.write('priceAlerts',alerts);saveTracks(tracks);U.priceAlerts();U.decision();}
  }
  function recordClose(r){
    const history=S.read('history');if(history.some(x=>x.trackId===r.id))return;
    history.unshift(Object.assign({},r,{id:id(),trackId:r.id}));S.write('history',history);U.history();
    if(r.outcome==='void')return;
    const journal=S.read('journal');journal.unshift({id:id(),trackId:r.id,symbol:r.symbol,direction:r.side,date:new Date(r.closedAt).toISOString().slice(0,10),status:r.outcome==='tp'?'win':'loss',entry:r.entry,exit:r.exit,sl:r.sl,tp1:r.tp,setup:'Malomo · close 1H',pnlPct:100*(r.exit-r.entry)*(r.side==='long'?1:-1)/r.entry,notes:'Simulasi; tanpa fee/slippage/funding. '+r.r.toFixed(2)+'R.'});S.write('journal',journal);U.journal();
  }
  async function catchUp(){
    if(polling)return;polling=true;
    try{
      const tracks=S.read('tracks');
      const active=x=>x.status!=='closed'&&!x.frozen;
      for(const sym of [...new Set(tracks.filter(active).map(x=>x.symbol))]){
        try{
          let candles=await M.candles(sym,'1m',1000);
          // Riwayat 1m tidak menjangkau jeda terakhir: dibekukan sekali dan diberi pesan sekali,
          // bukan diulang setiap siklus refresh.
          for(const r of tracks.filter(x=>x.symbol===sym&&active(x)&&candles.length&&x.lastAt<candles[0].t)){r.frozen=true;log(sym+': riwayat simulasi belum lengkap; status dibekukan.');}
          for(const r of tracks.filter(x=>x.symbol===sym&&active(x))){
            for(const c of candles.filter(c=>c.ct>r.lastAt)){const before=r.status;MalomoTracker.advance(r,c,c.ct);if(before!=='closed'&&r.status==='closed')recordClose(r);}
          }
        }catch(e){log(sym+': pemantauan gagal — '+e.message);}
      }
      saveTracks(tracks);U.decision();
    }finally{polling=false;}
  }
  async function refresh(){try{await M.refresh();await catchUp();U.status('Data Binance diperbarui · '+new Date().toLocaleTimeString('id-ID'));}catch(e){U.status('Gagal memuat Binance: '+e.message,true);U.html('tbody','<div class="empty-state">Data pasar tidak tersedia. Periksa koneksi dan coba lagi.</div>');}}
  async function scan(mode='intraday',background=false){
    if(scanning)return;scanning=true;
    const token=++scanToken;if(!background)U.panel('modeResultsSection');U.$('heroModeStatus').classList.add('show');U.text('modeResultsTitle','Malomo · Top 250 → Top 150');
    scanButtons.forEach(x=>U.$(x).disabled=true);
    try{
      const result=await M.scan({cancelled:()=>token!==scanToken,progress:(n,total)=>{if(token===scanToken)U.text('heroModeStatus',`Scan ${n}/${total} kandidat Top 250…`);}});
      if(token!==scanToken){U.text('heroModeStatus','Scan dibatalkan.');return;}
      root.lastMalomoScan=result;lastScanAt=Date.now();U.scan(result);
      syncTracks(result);
    }catch(e){U.text('heroModeStatus','Scan gagal: '+e.message);}
    finally{scanning=false;scanButtons.forEach(x=>U.$(x).disabled=false);}
  }
  function syncTracks(result){
    const tracks=S.read('tracks'),history=S.read('history'),now=Date.now();
    const current=new Map();
    for(const row of result.candidates){const rec=MalomoTracker.create(row.symbol,row.evaluation,now);if(rec)current.set(row.symbol,rec);}
    // Hanya pair yang benar-benar terbaca tanpa error pada scan ini yang boleh menggugurkan rencana armed.
    const failed=new Set([...result.errors.map(e=>e.symbol),...result.candidates.filter(r=>r.error).map(r=>r.symbol)]);
    const scanned=new Set(result.universe.filter(s=>!failed.has(s)));
    for(const r of tracks.filter(r=>scanned.has(r.symbol)))if(MalomoTracker.expire(r,current.get(r.symbol),now))recordClose(r);
    for(const rec of current.values())if(!tracks.some(x=>x.id===rec.id)&&!history.some(x=>x.trackId===rec.id))tracks.push(rec);
    saveTracks(tracks);U.decision();
  }
  function cancelScan(){scanToken++;}
  async function detail(sym,tf='4h',modal=true){
    const token=++detailToken;const s=symbol(sym);U.$('searchResults').classList.remove('show');U.text('wsAnalysisSymbolInput',s);
    U.$('wsAnalysisSymbolInput').value=s;
    if(modal){U.panels();U.$('modalBackdrop').classList.add('show');}
    U.html('modalBody','<div class="modal-loading"><span class="loader"></span>Memuat struktur Malomo…</div>');
    try{
      const evaluation=await M.evaluate(s);const display=evaluation.frames[tf]||Malomo.frame(await M.candles(s,tf));
      if(token!==detailToken)return;U.detail(s,evaluation,tf,display);
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
    else if(a==='use-plan'){const p=U.getSelected()?.evaluation.plan;if(p){U.$('calcEntry').value=p.entry;U.$('calcSl').value=p.sl;U.workspace('wsTrading');log('Entry dan SL diterapkan ke kalkulator.');}}
    else if(a==='history-delete'){S.write('history',S.read('history').filter(x=>x.id!==target.dataset.id));U.history();}
    else if(a==='price-alert-delete'){S.write('priceAlerts',S.read('priceAlerts').filter(x=>x.id!==target.dataset.id));U.priceAlerts();}
  }
  function start(){
    document.addEventListener('click',event=>delegated(event).catch(e=>log(e.message)));
    on('hamburgerBtn',()=>{U.$('sidebar').classList.add('open');U.$('sidebarOverlay').classList.add('show');});on('sidebarCloseBtn',U.closeSidebar);on('sidebarOverlay',U.closeSidebar);
    on('introTipClose',()=>{U.$('introTip').style.display='none';localStorage.setItem('malomo_intro_hidden','1');});if(localStorage.getItem('malomo_intro_hidden'))U.$('introTip').style.display='none';
    // Menutup panel lain tidak boleh membatalkan scan yang sedang berjalan; hanya tombol tutup
    // panel hasil scan yang membatalkannya secara eksplisit.
    on('modeResultsClose',()=>{cancelScan();U.panels();});
    for(const name of ['modalCloseBtn','alertDrawerClose','settingsDrawerClose','historyPanelClose','journalModalClose'])on(name,()=>{detailToken++;U.panels();});
    for(const name of ['modalBackdrop','journalModalBackdrop'])on(name,e=>{if(e.target===U.$(name))U.$(name).classList.remove('show');});
    on('modeIntradayBtn',()=>scan('intraday'));on('modeSwingBtn',()=>scan('swing'));on('scanTopBtn',()=>scan());
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
    on('tgTestBtn',async()=>{try{await telegram('Test notifikasi ICT Malomo Screener');U.text('tgStatus','Test berhasil dikirim.');}catch(e){U.text('tgStatus',e.message);}});
    on('scrollTopBtn',()=>window.scrollTo({top:0,behavior:'smooth'}));document.addEventListener('keydown',e=>{if(e.key==='Escape'){detailToken++;U.panels();U.closeSidebar();}});
    window.addEventListener('popstate',()=>{U.panels();U.workspace('wsHome');});
    setInterval(()=>U.text('topbarClock',new Date().toLocaleString('id-ID',{timeZone:'Asia/Makassar'})),1000);U.text('sidebarEngineStatus','Malomo · PRD FINAL');
    M.subscribe(data=>{prices(data);if(Date.now()-renderAt>2000){renderAt=Date.now();U.market();U.decision();}});
    U.journal();U.history();U.decision();U.alerts();U.priceAlerts();refresh();M.connect();setInterval(refresh,45000);
    setInterval(()=>{if(root.lastMalomoScan&&!scanning&&Date.now()-lastScanAt>=300000&&!document.hidden)scan('intraday',true);},30000);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
    if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>U.status('Cache offline tidak tersedia.'));
  }
  root.MalomoApp={start,scan,detail,refresh,star,calculate,catchUp};
})(globalThis);
