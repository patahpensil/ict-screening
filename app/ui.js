/* Presentation only: existing CSS classes, panels, navigation and interaction patterns. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const html=(id,value)=>{if($(id))$(id).innerHTML=value;};
  const text=(id,value)=>{if($(id))$(id).textContent=value;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const price=v=>Number.isFinite(Number(v))&&v!==null?Number(v).toLocaleString('en-US',{maximumFractionDigits:8}):'—';
  const num=v=>Number(v||0).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2});
  const fmtTime=ms=>Number.isFinite(ms)?new Date(ms).toLocaleString('id-ID',{timeZone:'Asia/Makassar',dateStyle:'short',timeStyle:'short'})+' WITA':'—';
  let filter='all',sort='quoteVolume',active='wsHome',selected=null;
  const card=(title,body)=>`<div class="ws-card"><div class="ws-card-title">${esc(title)}</div>${body}</div>`;
  const row=(name,value)=>`<div class="bd-row2"><span class="bd-factor2">${esc(name)}</span><span class="bd-reason2">${value}</span></div>`;
  function panels(){document.querySelectorAll('.fullscreen-panel,.modal-backdrop').forEach(el=>el.classList.remove('show'));}
  function closeSidebar(){$('sidebar').classList.remove('open');$('sidebarOverlay').classList.remove('show');}
  function workspace(id){panels();active=id;document.querySelectorAll('.workspace').forEach(el=>el.classList.toggle('active',el.id===id));document.querySelectorAll('[data-ws]').forEach(el=>el.classList.toggle('active',el.dataset.ws===id));closeSidebar();window.scrollTo({top:0});}
  function panel(id){panels();$(id).classList.add('show');closeSidebar();}
  function status(message,error=false){text('metaInfo',message);$('metaInfo').style.color=error?'var(--crimson)':'var(--text-3)';}
  function tickerRow(d,badge=''){
    const starred=MalomoStore.read('watchlist').includes(d.symbol);let hash=0;for(const c of d.symbol)hash=(hash*31+c.charCodeAt(0))|0;
    return `<div class="coin-row" data-symbol="${esc(d.symbol)}" data-action="detail"><button class="crow-star ${starred?'active':''}" data-action="star" data-symbol="${esc(d.symbol)}">${starred?'★':'☆'}</button><div class="crow-avatar" style="background:hsl(${Math.abs(hash)%360},62%,46%)">${esc(d.symbol.replace(/USDT$/,'').slice(0,3))}</div><div class="crow-info"><div class="crow-name"><span class="crow-symtext">${esc(d.symbol.replace(/USDT$/,''))}</span><span class="crow-sub">USDT-M</span></div><div class="crow-badges">${badge}<span class="row-status-slot" data-symbol="${esc(d.symbol)}"></span>${Math.abs(d.fundingRate)>=0.0005?'<span class="badge-pill score-mid">Funding '+(d.fundingRate*100).toFixed(3)+'%</span>':''}</div></div><div class="crow-right"><div class="crow-price">${price(d.lastPrice)}</div><div class="crow-change ${d.priceChangePercent>=0?'chg-pos':'chg-neg'}">${d.priceChangePercent>=0?'▲':'▼'} ${Math.abs(d.priceChangePercent).toFixed(2)}%</div></div><svg class="crow-chevron" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></div>`;
  }
  function market(){
    const data=MalomoMarket.getTickers(),q=$('searchBox').value.trim().toUpperCase(),wl=MalomoStore.read('watchlist');
    const total=data.reduce((s,x)=>s+x.quoteVolume,0),gainers=data.filter(x=>x.priceChangePercent>0).length;
    text('heroValue','$'+num(total));text('statTotalPair',data.length);text('statGainersLosers',gainers+' / '+data.filter(x=>x.priceChangePercent<0).length);
    text('heroDelta',gainers>=data.length/2?'▲ Gainers dominan':'▼ Losers dominan');text('scTotalPairs',data.length);text('scStrongCount',Trend.rankUniverse(data).length);text('scTotalVol','$'+num(total));
    text('sidebarPingStatus',MalomoMarket.getLive()?'🟢 WebSocket Live':'○ REST polling');text('liveIndicator',data.length?(MalomoMarket.getLive()?'LIVE':'REST'):'OFFLINE');
    let list=data.filter(d=>(!q||d.symbol.includes(q))&&(filter!=='watchlist'||wl.includes(d.symbol))&&(filter!=='gainers'||d.priceChangePercent>0)&&(filter!=='losers'||d.priceChangePercent<0)&&(filter!=='fundingext'||Math.abs(d.fundingRate)>=0.0005));
    const pos=d=>(d.lastPrice-d.lowPrice)/Math.max(d.highPrice-d.lowPrice,1e-12);
    list.sort((a,b)=>filter==='nearhigh'?pos(b)-pos(a):filter==='nearlow'?pos(a)-pos(b):sort==='symbol'?a.symbol.localeCompare(b.symbol):Number(b[sort])-Number(a[sort]));
    text('listTitle',`${filter} · ${Math.min(150,list.length)} dari ${list.length}`);
    html('tbody',list.length?list.slice(0,150).map(d=>tickerRow(d)).join(''):'<div class="empty-state">Tidak ada pair yang cocok.</div>');
    const movers=data.slice().sort((a,b)=>b.priceChangePercent-a.priceChangePercent);
    html('moversBody',[['TOP GAINERS',movers.slice(0,5)],['TOP LOSERS',movers.slice(-5).reverse()]].map(([t,a])=>`<div><div class="ws-card-title" style="margin-bottom:8px;">${t}</div><table class="movers-table"><tbody>${a.map((d,i)=>`<tr data-action="detail" data-symbol="${esc(d.symbol)}"><td>${i+1}</td><td>${esc(d.symbol.replace(/USDT$/,''))}/USDT</td><td>${price(d.lastPrice)}</td><td style="color:${d.priceChangePercent>=0?'var(--mint)':'var(--crimson)'};text-align:right;">${d.priceChangePercent>=0?'+':''}${d.priceChangePercent.toFixed(2)}%</td></tr>`).join('')}</tbody></table></div>`).join(''));
    html('searchResults',q?data.filter(x=>x.symbol.includes(q)).slice(0,10).map(x=>tickerRow(x)).join(''):'');$('searchResults').classList.toggle('show',!!q);
  }
  // Kartu bertumpuk untuk kolom LONG/SHORT: nama dan harga di atas, status selebar kartu, lalu banner data.
  function scanCard(d,badge,chips){
    const starred=MalomoStore.read('watchlist').includes(d.symbol);let hash=0;for(const c of d.symbol)hash=(hash*31+c.charCodeAt(0))|0;
    const name=d.symbol.replace(/USDT$/,'');
    return '<div class="scan-card" data-symbol="'+esc(d.symbol)+'" data-action="detail"><div class="scan-card-top"><button class="crow-star '+(starred?'active':'')+'" data-action="star" data-symbol="'+esc(d.symbol)+'">'+(starred?'★':'☆')+'</button><div class="crow-avatar" style="background:hsl('+(Math.abs(hash)%360)+',62%,46%)">'+esc(name.slice(0,3))+'</div><div class="crow-name scan-card-name"><span class="crow-symtext">'+esc(name)+'</span><span class="crow-sub">USDT-M</span></div><div class="crow-right"><div class="crow-price">'+price(d.lastPrice)+'</div><div class="crow-change '+(d.priceChangePercent>=0?'chg-pos':'chg-neg')+'">'+(d.priceChangePercent>=0?'▲':'▼')+' '+Math.abs(d.priceChangePercent).toFixed(2)+'%</div></div></div>'+badge+chips+'</div>';
  }
  // Banner data pasar pelengkap per pair (hanya tampilan; tidak masuk penilaian engine).
  function marketChips(symbol,metrics,t){
    const md=MalomoMarketData.get(symbol)||{},chips=[];
    const chip=(label,value,cls='')=>'<span class="md-chip '+cls+'"><b>'+label+'</b> '+value+'</span>';
    const flow=v=>(v>=0?'+':'−')+'$'+num(Math.abs(v));
    if(md.oiUsd>0)chips.push(chip('OI','$'+num(md.oiUsd)+(Number.isFinite(md.oiChange24h)?' '+(md.oiChange24h>=0?'▲':'▼')+Math.abs(md.oiChange24h).toFixed(1)+'% 24j':'')));
    if(md.accounts)chips.push(chip('L/S akun',md.accounts.ratio.toFixed(2)+' ('+md.accounts.longPct.toFixed(0)+'% L)'));
    if(md.topPositions)chips.push(chip('Top trader',md.topPositions.ratio.toFixed(2)+' ('+md.topPositions.longPct.toFixed(0)+'% L)'));
    if(md.taker)chips.push(chip('Taker B/S',md.taker.ratio.toFixed(2),md.taker.ratio>=1?'up':'down'));
    if(Number.isFinite(metrics?.cvd1d))chips.push(chip('CVD 1D',flow(metrics.cvd1d),metrics.cvd1d>=0?'up':'down'));
    if(Number.isFinite(metrics?.cvd7d))chips.push(chip('CVD 7H',flow(metrics.cvd7d),metrics.cvd7d>=0?'up':'down'));
    if(metrics?.adx1d)chips.push(chip('ADX 1D',metrics.adx1d.adx.toFixed(0)+' (+DI '+metrics.adx1d.plusDI.toFixed(0)+' / −DI '+metrics.adx1d.minusDI.toFixed(0)+')'));
    if(t)chips.push(chip('Vol 24j','$'+num(t.quoteVolume)));
    if(md.book)chips.push(chip('OB','Bid '+md.book.bidPct.toFixed(0)+'% · Ask '+(100-md.book.bidPct).toFixed(0)+'%'+(Number.isFinite(md.book.spreadPct)?' · spread '+md.book.spreadPct.toFixed(3)+'%':'')));
    if(t&&Number.isFinite(t.fundingRate))chips.push(chip('Funding',(t.fundingRate*100).toFixed(4)+'%'));
    if(!md.at)chips.push('<span class="md-chip">data pasar memuat…</span>');
    return '<div class="md-chips">'+chips.join('')+'</div>';
  }
  // note: progres pembaruan yang sedang berjalan; hasil lama tetap tampil sampai hasil baru selesai.
  const score=v=>Number.isFinite(v)?(v>0?'+':'')+v.toFixed(1):'—';
  // Tahap validasi sinyal. Rekaman trend-v1 lama (sebelum label ini) juga PAPER.
  const stageOf=r=>r&&(r.stage||(r.engine==='trend-v1'?'PAPER':''));
  const pct=v=>Number.isFinite(v)?(v>=0?'+':'')+v.toFixed(1)+'%':'—';
  const paperNote=()=>Trend.VALIDATION.stage!=='PAPER'?'':'<div class="sop-note" style="border-left:3px solid var(--amber);margin-bottom:8px;">⚠ <b>PAPER</b> — breakout 55/20 lulus syarat untung di tiga periode uji (2019–2021: 98 trade, +1,39R per trade), tetapi <b>'+esc(Trend.VALIDATION.note)+'</b>. Sinyal tampil dan dicatat otomatis di Jurnal; keputusan eksekusi ada di pemilik.</div>';
  function scanStatus(result,note){
    const c=result.candidates,longs=c.filter(x=>x.evaluation.side==='long').length,shorts=c.filter(x=>x.evaluation.side==='short').length,errors=result.errors.length;
    text('heroModeStatus',`✓ Breakout 55/20 (${Trend.VALIDATION.stage}): ${c.length} pair Top 100 · ${longs} breakout LONG · ${shorts} breakout SHORT · hasil ${new Date(result.at).toLocaleTimeString('id-ID')}${errors?' · '+errors+' pair gagal dimuat (hasil parsial)':''}${note?' · '+note:''}`);
  }
  const SHOW_PER_SIDE=40;
  function scan(result,note){
    const ready=result.candidates.filter(x=>x.evaluation.plan);
    scanStatus(result,note);
    text('scLastScan',new Date(result.at).toLocaleTimeString('id-ID'));
    const bySymbol=new Map(MalomoMarket.getTickers().map(x=>[x.symbol,x]));
    // side: 'long'/'short'. Kartu menunjukkan breakout (sinyal) atau jarak close ke level breakout 55 hari.
    const row=(r,side)=>{
      const m=r.evaluation,d=bySymbol.get(r.symbol);if(!d)return '';
      const long=side==='long',hit=m.side===side,dist=long?m.distLong:m.distShort;
      const badge=`<span class="badge-pill scan-status ${hit?(long?'score-hi':'score-lo'):'score-mid'}">${hit?'BREAKOUT '+side.toUpperCase()+' · SINYAL '+esc(Trend.VALIDATION.stage)+' · SL '+fp(m.plan?.sl)+' · exit 20h '+fp(m.plan?.exitLevel):'pantau · '+pct(-dist)+' lagi ke '+(long?'high':'low')+' 55 hari ('+fp(long?m.high55:m.low55)+')'}${Number.isFinite(m.atrPct)?' · ATR20 '+m.atrPct.toFixed(1)+'%':''}</span>`;
      return scanCard(d,badge,marketChips(r.symbol,r.metrics,d));
    };
    // Kolom LONG: yang sudah menembus high 55 hari lalu yang paling dekat; SHORT: cermin terhadap low 55 hari.
    // Pair yang sudah breakout ke satu arah tidak ditampilkan sebagai kandidat arah sebaliknya.
    const pick=side=>{const k=side==='long'?'distLong':'distShort',o=side==='long'?'short':'long';return result.candidates.filter(r=>Number.isFinite(r.evaluation[k])&&r.evaluation.side!==o).sort((a,b)=>b.evaluation[k]-a.evaluation[k]).slice(0,SHOW_PER_SIDE);};
    const longs=pick('long'),shorts=pick('short');
    const col=(title,side,list)=>`<section class="scan-col"><div class="scan-col-head ${side}">${title} · ${list.filter(r=>r.evaluation.side===side).length} breakout</div><div class="coin-list">${list.map(r=>row(r,side)).join('')||'<div class="empty-state">Tidak ada pair.</div>'}</div></section>`;
    html('modeResultsList',result.candidates.length?paperNote()+`<div class="scan-split">${col('LONG','long',longs)}${col('SHORT','short',shorts)}</div>`:'<div class="empty-state">Belum ada pair dengan data 1D yang cukup.</div>');
    html('topSignalGrid',ready.slice(0,20).map(r=>{const p=r.evaluation.plan;return `<div class="signal-card" data-action="detail" data-symbol="${esc(r.symbol)}"><div class="ws-card-title">${esc(r.symbol)} · ${r.evaluation.side.toUpperCase()} · ${esc(Trend.VALIDATION.stage)}</div><div>Entry ${price(p.entry)} · SL ${price(p.sl)} · exit 20 hari ${price(p.exitLevel)}</div><div class="badge-pill ${r.evaluation.side==='long'?'score-hi':'score-lo'}">Breakout 55 hari</div></div>`;}).join('')||'<div class="empty-state">Belum ada breakout 55 hari di Top 100.</div>');
  }
  function detail(symbol,m,tf='1d'){
    selected={symbol,evaluation:m,tf};
    const t=MalomoMarket.getTickers().find(x=>x.symbol===symbol);
    text('mhSym',symbol.replace(/USDT$/,'/USDT'));text('mhPrice',price(t?.lastPrice||m.last));
    $('mhStarBtn').textContent=MalomoStore.read('watchlist').includes(symbol)?'★':'☆';
    document.querySelectorAll('.tf-btn').forEach(b=>b.classList.toggle('active',b.dataset.tf===tf));
    const p=m.plan,side=m.side,R=Trend.RULES,title=side?'BREAKOUT '+side.toUpperCase()+' · 55 HARI':'PANTAU · BELUM BREAKOUT';
    const slPct=Number.isFinite(m.atr)&&m.last?100*R.slAtr*m.atr/m.last:null;
    const balance=Number($('calcBalance')?.value),size=p?Trend.positionSize(balance,p):null;
    const analysis=`<div class="trend-banner ${side==='long'?'score-hi':side==='short'?'score-lo':'score-mid'}"><div class="tb-title">${esc(title)}</div><div class="tb-sub">${esc(m.status)}${side?' · '+esc(Trend.VALIDATION.stage)+' — '+esc(Trend.VALIDATION.note):''}</div></div>`
      +card('BREAKOUT 55/20 · 1D',row('Close 1D terakhir',price(m.last))+row('High 55 hari sebelumnya',price(m.high55)+' · jarak '+pct(-m.distLong))+row('Low 55 hari sebelumnya',price(m.low55)+' · jarak '+pct(-m.distShort))+row('Exit LONG (low 20 hari)',price(m.exitLong))+row('Exit SHORT (high 20 hari)',price(m.exitShort))+'<div class="sop-note">Close 1D di atas high 55 hari → LONG; di bawah low 55 hari → SHORT. Keluar saat close 1D menembus low (LONG) / high (SHORT) 20 hari. Tanpa TP tetap.</div>')
      +card('RISIKO',row('N = ATR 20 hari',price(m.atr)+(Number.isFinite(m.atrPct)?' ('+m.atrPct.toFixed(1)+'%)':''))+row('Jarak SL (2 × N)',slPct!=null?slPct.toFixed(1)+'%':'—')+row('Risiko per trade',R.riskPct+'% modal')+row('Batas posisi','maks '+R.maxPerSide+' per arah · satu per pair')+'<div class="sop-note">SL tetap di entry ∓ 2 × N. Sinyal baru dihentikan bila drawdown jurnal ≥ '+(100*R.maxDrawdown)+'%.</div>');
    const validation=card('SYARAT SINYAL',row('Breakout 55 hari',side?'✓ '+side.toUpperCase():'○ belum')+row('Universe','Top '+R.universe+' volume 30 hari')+row('Tahap validasi',esc(Trend.VALIDATION.stage)+' — '+esc(Trend.VALIDATION.note)));
    const decision=card('KEPUTUSAN',`<div class="decision-btns"><div class="decision-btn buy ${m.decision==='LONG'?'active':''}"><div class="db-label">LONG</div></div><div class="decision-btn wait ${m.decision==='SKIP'?'active':''}"><div class="db-label">SKIP</div></div><div class="decision-btn sell ${m.decision==='SHORT'?'active':''}"><div class="db-label">SHORT</div></div></div><div class="sop-note">${esc(m.status)}.</div>`);
    const marketCard=card('DATA PASAR · PELENGKAP',marketChips(symbol,MalomoMarketData.metrics(m),t)+'<div class="sop-note">Hanya tampilan; tidak memengaruhi sinyal.</div>');
    const sizeText=size?price(size.qty)+' koin · notional $'+price(+size.notional.toFixed(2))+' · risiko $'+price(+size.riskUsd.toFixed(2)):'isi Modal di Kalkulator';
    const trading=p?`<div class="entry-card ${side}"><div class="entry-card-head">${side.toUpperCase()} · BREAKOUT 55/20 · ${esc(p.stage||Trend.VALIDATION.stage)}</div>${paperNote()}${row('Entry (harga saat sinyal)',price(p.entry))}${row('SL (2 × ATR20)',price(p.sl))}${row('Exit','close 1D menembus '+(side==='long'?'low':'high')+' 20 hari (sekarang '+price(p.exitLevel)+')')}${row('Ukuran posisi ('+Trend.RULES.riskPct+'%)',sizeText)}${row('Target','Tanpa TP — tren dibiarkan berjalan')}<div class="entry-caveat">Begitu harga menyentuh entry, posisi masuk Decision dan otomatis tercatat di Jurnal.</div><button class="btn btn-primary" data-action="save-plan">📌 Simpan ke Histori Setup</button><button class="btn" data-action="use-plan">🧮 Pakai di Kalkulator</button></div>`:card('RENCANA','<div class="empty-state">'+esc(m.status)+' — rencana dibuat saat close 1D menembus level 55 hari.</div>');
    html('wsAnalysisBody',analysis);html('wsValidationBody',validation);html('wsDecisionBody',decision);html('wsTradingSetupBody',trading);html('modalBody',analysis+marketCard+validation+decision+trading);
  }
  function journal(){
    const rows=MalomoStore.read('journal'),closed=rows.filter(e=>['win','loss','breakeven'].includes(e.status)),wins=closed.filter(e=>e.status==='win').length;
    const pnl=rows.reduce((s,x)=>s+(Number(x.pnlUsd)||0),0);
    html('journalStats',[['TOTAL ENTRY',rows.length],['TRADE CLOSED',closed.length],['WIN RATE',closed.length?(100*wins/closed.length).toFixed(1)+'%':'—'],['TOTAL PNL ($)',pnl.toFixed(2)]].map(([n,v])=>`<div class="sb-cell"><div class="lbl">${n}</div><div class="val">${v}</div></div>`).join(''));
    const entry=e=>`<div class="journal-entry" data-action="journal-edit" data-id="${esc(e.id)}"><div class="je-top"><span class="je-symbol">${esc(e.symbol)}</span><span class="badge-pill ${e.direction==='long'?'score-hi':'score-lo'}">${esc(e.direction)}</span><span class="badge-pill score-mid">${esc(e.status)}</span><span class="je-date">${esc(e.date)}</span></div><div class="je-row">Entry ${price(e.entry)} · SL ${price(e.sl)} · PnL $${price(e.pnlUsd)}</div><div class="je-notes">${esc(e.notes)}</div></div>`;
    html('journalList',rows.map(entry).join('')||'<div class="empty-state">Belum ada entry jurnal.</div>');
    html('wsOpenPositions',rows.filter(e=>['open','floating'].includes(e.status)).map(entry).join('')||'<div class="empty-state">Tidak ada posisi terbuka di jurnal.</div>');
    $('journalClearBtn').style.display=rows.length?'block':'none';
    let balance=0;const points=[0,...rows.slice().reverse().map(e=>balance+=Number(e.pnlUsd)||0)],lo=Math.min(...points),hi=Math.max(...points),span=hi-lo||1;
    const path=points.map((v,i)=>`${i===0?'M':'L'} ${i*300/Math.max(1,points.length-1)} ${70-60*(v-lo)/span}`).join(' ');
    html('equityCurveWrap',rows.length?`<div class="ws-card"><div class="ws-card-title">EQUITY CURVE · PNL JURNAL</div><svg viewBox="0 0 300 80" style="width:100%;height:100px;"><path d="${path}" fill="none" stroke="var(--mint)" stroke-width="2"/></svg></div>`:'');
  }
  function journalForm(id){
    const e=MalomoStore.read('journal').find(e=>e.id===id)||{};
    const fields={Id:'id',Symbol:'symbol',Direction:'direction',Date:'date',Status:'status',Entry:'entry',Exit:'exit',Sl:'sl',Tp1:'tp1',Tp2:'tp2',Tp3:'tp3',PnlUsd:'pnlUsd',PnlPct:'pnlPct',Setup:'setup',Emotion:'emotion',Notes:'notes'};
    for(const [suffix,key] of Object.entries(fields))$('jf'+suffix).value=e[key]??(key==='direction'?'long':key==='status'?'floating':key==='date'?new Date().toISOString().slice(0,10):'');
    $('journalDeleteBtn').style.display=e.id?'block':'none';text('journalModalTitle',e.id?'Ubah Entry Jurnal':'Tambah Entry Jurnal');$('journalModalBackdrop').classList.add('show');
  }
  function history(){
    const data=MalomoStore.read('history');text('historyStats',data.length+' Trading Plan tersimpan');
    html('historyList',data.map(e=>`<div class="ws-card"><div class="ws-card-title">${esc(e.symbol)} · ${esc(e.side)} · ${esc(e.outcome||'tersimpan')}</div>${row('Entry / SL / TP',price(e.entry)+' / '+price(e.sl)+' / '+(Number.isFinite(Number(e.tp))&&e.tp!==null?price(e.tp):e.engine==='turtle-v1'?'exit 20 hari':'trailing'))}${row('Hasil',Number.isFinite(e.r)?(e.r>=0?'+':'')+e.r.toFixed(2)+'R':Number.isFinite(Number(e.rr))&&e.rr!==null?'RR 1:'+Number(e.rr).toFixed(2):'—')}<button class="btn" data-action="history-delete" data-id="${esc(e.id)}">🗑 Hapus</button></div>`).join('')||'<div class="empty-state">Belum ada histori setup.</div>');
    html('shadowSummary','');
  }
  const ago=ms=>{const m=Math.max(0,Math.round(ms/60000));return m<60?m+' mnt':m<1440?Math.floor(m/60)+' jam '+(m%60)+' mnt':Math.floor(m/1440)+' hari';};
  // Format harga kartu Decision sama dengan engine lama: 2/4/6 desimal menurut besaran harga.
  const fp=v=>{const n=Number(v);return !Number.isFinite(n)?'-':n>=100?n.toFixed(2):n>=1?n.toFixed(4):n.toFixed(6);};
  const usd=v=>'$'+num(Math.abs(v));
  // Tampilan kartu Decision dipertahankan dari engine lama (permintaan pemilik); isinya dari engine breakout 55/20.
  function decisionCard(r){
    const t=MalomoMarket.getTickers().find(x=>x.symbol===r.symbol),px=t?Number(t.lastPrice):NaN,long=r.side==='long';
    const d=MalomoLive.data(r.symbol),risk=r.risk>0?r.risk:Math.abs(r.entry-r.sl);
    const R=px>0&&risk>0?(long?px-r.entry:r.entry-px)/risk:0,profit=px>0?(px-r.entry)*(long?1:-1):0;
    const hasTp=Number.isFinite(r.tp),start=Number.isFinite(r.initialSl)?r.initialSl:r.sl;
    // Posisi tanpa TP: bilah progres dari stop awal ke harga terbaik (puncak/harga sekarang).
    const end=hasTp?r.tp:long?Math.max(r.peak??r.entry,px>0?px:r.entry,r.entry+0.5*risk):Math.min(r.peak??r.entry,px>0?px:r.entry,r.entry-0.5*risk);
    const span=end-(hasTp?r.sl:start);
    const frac=v=>Math.max(0,Math.min(1,(v-(hasTp?r.sl:start))/span))*100;
    let oi='<div class="val">memuat…</div>';
    if(d.oi>0&&px>0){
      const chg=r.oiBase>0?(d.oi/r.oiBase-1)*100:null,up=chg!==null&&chg>0;
      // Untung/rugi dinilai dari sisi posisi (engine lama membalik arah ini untuk SHORT).
      const read=chg===null?'':Math.abs(chg)<0.05?'OI relatif datar':profit===0?(up?'OI naik':'OI turun'):up?(profit>0?'OI naik searah posisi':'OI naik melawan posisi'):(profit>0?'OI turun (posisi ditutup)':'OI turun, harga melawan');
      oi=`<div class="val">${usd(d.oi*px)}</div><div class="sub">${chg!==null?(chg>=0?'+':'')+chg.toFixed(2)+'% sejak RUNNING':''}${read?' · '+read:''}</div>`;
    }
    const cvd5=(d.cvdWin||[]).reduce((s,x)=>s+x.d,0);
    const cvd=d.wsOn||(d.cvdWin&&d.cvdWin.length)
      ?`<div class="val ${d.cvd>=0?'chg-pos':'chg-neg'}">${d.cvd>=0?'+':'−'}${usd(d.cvd)}</div><div class="sub">5 mnt: ${cvd5>=0?'+':'−'}${usd(cvd5)} · sejak dipantau ${ago(Date.now()-(d.cvdSince||Date.now()))}</div>`
      :'<div class="val">menyambung…</div><div class="sub">menunggu trade pertama dari stream</div>';
    const ob=d.imb!==undefined
      ?`<div class="val">Bid ${Math.round((1+d.imb)*50)}% · Ask ${Math.round((1-d.imb)*50)}%</div><div class="sub">${d.imb>0.1?'bid dominan':d.imb<-0.1?'ask dominan':'seimbang'} · 20 level · spread ${d.bid>0&&d.ask>0?((d.ask-d.bid)/d.bid*100).toFixed(3)+'%':'-'}</div>`
      :'<div class="val">menyambung…</div><div class="sub">menunggu snapshot orderbook</div>';
    const st=MalomoLive.structure(r.symbol),turtle=r.engine==='turtle-v1';
    let trendCell='<div class="val">memuat…</div>';
    if(turtle){
      // Level exit 20 hari terkini; peringatan bila harga sekarang sudah melewatinya (keluar bila close 1D di sana).
      const lvl=st?(long?st.exitLong:st.exitShort):r.exitLevel;
      if(Number.isFinite(lvl)){const warn=px>0&&(long?px<lvl:px>lvl);trendCell=`<div class="val ${warn?'dec-warn':''}">${fp(lvl)}</div><div class="sub">close 1D ${long?'di bawah':'di atas'} level ini → keluar${warn?'<br>⚠ harga sudah melewati level exit':''}</div>`;}
    }else if(st&&Number.isFinite(st.forecast)){
      const warn=long?st.forecast<0:st.forecast>0;
      trendCell=`<div class="val ${warn?'dec-warn':''}">${score(st.forecast)}</div><div class="sub">1D · saat sinyal ${score(r.forecastAtSignal)}${warn?'<br>⚠ skor berbalik arah posisi':''}</div>`;
    }
    const rr=hasTp?Math.abs(r.tp-r.entry)/risk:null;
    return `<div class="dec-card ${esc(r.side)}" data-action="detail" data-symbol="${esc(r.symbol)}">
      <div class="dec-head"><span class="run-tag"><span class="run-dot"></span>RUNNING</span><span class="dec-sym">${esc(r.symbol.replace(/USDT$/,''))}</span><span class="badge-pill ${long?'score-hi':'score-lo'}">${long?'LONG':'SHORT'}</span>${stageOf(r)?'<span class="badge-pill score-mid">'+esc(stageOf(r))+'</span>':''}
        <div class="dec-meta">${turtle?'Breakout 55/20 · SL 2 × ATR20 '+fp(start):r.engine==='trend-v1'?'Tren Carver · skor saat sinyal '+score(r.forecastAtSignal)+' · stop awal '+fp(start):'Malomo · zona 4H · entry 1H'}${stageOf(r)==='PAPER'?' · PAPER'+(turtle?' — '+esc(Trend.VALIDATION.note):''):''} · masuk ${esc(fmtTime(r.runningAt))} · berjalan ${ago(Date.now()-(r.runningAt||r.createdAt))}${r.frozen?' · pemantauan dibekukan':''}</div></div>
      <div class="dec-price"><span class="px">${px>0?fp(px):'-'}</span><span class="rr ${R>=0?'chg-pos':'chg-neg'}">${R>=0?'+':''}${R.toFixed(2)}R</span></div>
      <div class="dec-prog"><div class="fill" style="width:${px>0?frac(px):0}%"></div><div class="mark" style="left:${frac(r.entry)}%" title="Entry"></div>${px>0?`<div class="now" style="left:${frac(px)}%"></div>`:''}</div>
      <div class="dec-lv"><div><span>${hasTp||turtle?'SL':'TRAILING STOP'}</span>${fp(r.sl)}</div><div><span>ENTRY</span>${fp(r.entry)}</div>${hasTp?`<div><span>TP</span>${fp(r.tp)}</div><div><span>RR</span>1:${rr.toFixed(2)}</div>`:turtle?`<div><span>RISIKO</span>${Trend.RULES.riskPct}%</div><div><span>TP</span>tanpa TP</div>`:`<div><span>${long?'PUNCAK':'TERENDAH'}</span>${fp(r.peak??r.entry)}</div><div><span>STOP AWAL</span>${fp(start)}</div>`}</div>
      <div class="dec-data"><div class="dec-cell"><div class="lbl">OPEN INTEREST</div>${oi}</div><div class="dec-cell"><div class="lbl">CVD (TAKER)</div>${cvd}</div><div class="dec-cell"><div class="lbl">ORDERBOOK</div>${ob}</div><div class="dec-cell"><div class="lbl">${turtle?'EXIT 20 HARI':'SKOR TREN 1D'}</div>${trendCell}</div></div>
    </div>`;
  }
  function decision(){
    const records=MalomoStore.read('tracks'),running=records.filter(x=>x.status==='running').sort((a,b)=>(b.runningAt||0)-(a.runningAt||0)),armed=records.filter(x=>x.status==='armed');
    html('decisionList',running.length?(running.some(r=>stageOf(r)==='PAPER')?paperNote():'')+running.map(decisionCard).join(''):'<div class="empty-state">Belum ada pair yang menyentuh Entry. Jalankan <b>Scan Breakout Swing</b> di Home — hasilnya otomatis dipantau di sini selama app terbuka.</div>');
    text('decisionArmedNote',armed.length?armed.length+' setup dari scan sedang dipantau, menunggu harga menyentuh Entry.':'');$('decisionArmedNote').style.display=armed.length?'block':'none';
    text('decisionCount',running.length);$('decisionCount').style.display=running.length?'inline-flex':'none';
  }
  function alerts(){
    const a=MalomoStore.read('alerts');text('alertStats',a.length+' notifikasi');
    html('alertLog',a.map(x=>`<div class="alert-row"><div>${x.symbol?'<b>'+esc(x.symbol.replace(/USDT$/,''))+'</b> — ':''}${esc(x.message)}</div><div class="mono">${new Date(x.at).toLocaleString('id-ID')}</div></div>`).join('')||'<div class="empty-state">Belum ada notifikasi.</div>');
    // Banner berjalan dan angka di lonceng menampilkan log alert, seperti engine lama.
    const top=a.slice(0,20);
    html('ticker',top.length?[...top,...top].map(x=>`<span>🔔 ${x.symbol?'<b>'+esc(x.symbol.replace(/USDT$/,''))+'</b> — ':''}<span class="up">${esc(x.message)}</span></span>`).join(''):'<span class="mono">Belum ada alert atau alarm terpicu — bakal muncul di sini begitu ada.</span>');
    const count=a.length>99?'99+':String(a.length);
    for(const badge of ['alertBadge','topbarAlertBadge'])if($(badge)){$(badge).textContent=count;$(badge).style.display=a.length?(badge==='topbarAlertBadge'?'flex':'inline-flex'):'none';}
  }
  function priceAlerts(){html('priceAlertList',MalomoStore.read('priceAlerts').map(a=>`<div class="pa-item">${esc(a.symbol)} ${a.direction==='above'?'↑':'↓'} ${price(a.price)} ${a.triggered?'✓':''}<button class="pa-del" data-action="price-alert-delete" data-id="${esc(a.id)}">✕</button></div>`).join(''));}
  root.MalomoUI={$,html,text,esc,price,num,row,card,workspace,panel,panels,status,market,scan,scanStatus,detail,journal,journalForm,history,decision,alerts,priceAlerts,tickerRow,closeSidebar,getSelected:()=>selected,setFilter:v=>{filter=v;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===v));market();},setSort:v=>{sort=v;market();},getActive:()=>active};
})(globalThis);
