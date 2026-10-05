/* Presentation only: existing CSS classes, panels, navigation and interaction patterns. */
(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const html=(id,value)=>{if($(id))$(id).innerHTML=value;};
  const text=(id,value)=>{if($(id))$(id).textContent=value;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const price=v=>Number.isFinite(Number(v))&&v!==null?Number(v).toLocaleString('en-US',{maximumFractionDigits:8}):'—';
  const num=v=>Number(v||0).toLocaleString('en-US',{notation:'compact',maximumFractionDigits:2});
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
    text('heroDelta',gainers>=data.length/2?'▲ Gainers dominan':'▼ Losers dominan');text('scTotalPairs',data.length);text('scStrongCount',Malomo.rankUniverse(data).length);text('scTotalVol','$'+num(total));
    text('sidebarPingStatus',MalomoMarket.getLive()?'🟢 WebSocket Live':'○ REST polling');text('liveIndicator',data.length?(MalomoMarket.getLive()?'LIVE':'REST'):'OFFLINE');
    let list=data.filter(d=>(!q||d.symbol.includes(q))&&(filter!=='watchlist'||wl.includes(d.symbol))&&(filter!=='gainers'||d.priceChangePercent>0)&&(filter!=='losers'||d.priceChangePercent<0)&&(filter!=='fundingext'||Math.abs(d.fundingRate)>=0.0005));
    const pos=d=>(d.lastPrice-d.lowPrice)/Math.max(d.highPrice-d.lowPrice,1e-12);
    list.sort((a,b)=>filter==='nearhigh'?pos(b)-pos(a):filter==='nearlow'?pos(a)-pos(b):sort==='symbol'?a.symbol.localeCompare(b.symbol):Number(b[sort])-Number(a[sort]));
    text('listTitle',`${filter} · ${Math.min(150,list.length)} dari ${list.length}`);
    html('tbody',list.length?list.slice(0,150).map(d=>tickerRow(d)).join(''):'<div class="empty-state">Tidak ada pair yang cocok.</div>');
    html('ticker',data.slice().sort((a,b)=>b.quoteVolume-a.quoteVolume).slice(0,10).map(x=>`<span class="ticker-item">${esc(x.symbol)} ${price(x.lastPrice)} · ${x.priceChangePercent.toFixed(2)}%</span>`).join(''));
    const movers=data.slice().sort((a,b)=>b.priceChangePercent-a.priceChangePercent);
    html('moversBody',[['TOP GAINERS',movers.slice(0,5)],['TOP LOSERS',movers.slice(-5).reverse()]].map(([t,a])=>`<div><div class="ws-card-title" style="margin-bottom:8px;">${t}</div><table class="movers-table"><tbody>${a.map((d,i)=>`<tr data-action="detail" data-symbol="${esc(d.symbol)}"><td>${i+1}</td><td>${esc(d.symbol.replace(/USDT$/,''))}/USDT</td><td>${price(d.lastPrice)}</td><td style="color:${d.priceChangePercent>=0?'var(--mint)':'var(--crimson)'};text-align:right;">${d.priceChangePercent>=0?'+':''}${d.priceChangePercent.toFixed(2)}%</td></tr>`).join('')}</tbody></table></div>`).join(''));
    html('searchResults',q?data.filter(x=>x.symbol.includes(q)).slice(0,10).map(x=>tickerRow(x)).join(''):'');$('searchResults').classList.toggle('show',!!q);
  }
  function scan(result){
    const ready=result.candidates.filter(x=>x.evaluation.plan),errors=result.errors.length;
    text('heroModeStatus',`✓ Malomo: ${result.candidates.length} kandidat Top 150 · ${ready.length} Trading Plan${errors?' · '+errors+' pair gagal dimuat (hasil parsial)':''}`);
    text('scLastScan',new Date(result.at).toLocaleTimeString('id-ID'));
    const bySymbol=new Map(MalomoMarket.getTickers().map(x=>[x.symbol,x]));
    html('modeResultsList',result.candidates.length?result.candidates.map(r=>{
      const m=r.evaluation,d=bySymbol.get(r.symbol);if(!d)return '';
      const pending=Object.values(m.frames).some(f=>f.structure.pending);
      return tickerRow(d,`<span class="badge-pill ${m.side==='short'?'score-lo':'score-hi'}">${esc(m.side?.toUpperCase()||m.bias)} · ${esc(r.error||m.status||'menunggu data entry')}${pending?' · menunggu konfirmasi struktur':''}${m.plan?' · RR 1:'+m.plan.rr.toFixed(2):''}</span>`);
    }).join(''):'<div class="empty-state">Belum ada kandidat dengan struktur 1D–4H selaras.</div>');
    html('topSignalGrid',ready.slice(0,20).map(r=>{const p=r.evaluation.plan;return `<div class="signal-card" data-action="detail" data-symbol="${esc(r.symbol)}"><div class="ws-card-title">${esc(r.symbol)} · ${r.evaluation.side.toUpperCase()}</div><div>Entry ${price(p.entry)} · SL ${price(p.sl)} · TP ${price(p.tp)}</div><div class="badge-pill score-hi">RR 1:${p.rr.toFixed(2)} · close 1H tervalidasi</div></div>`;}).join('')||'<div class="empty-state">Belum ada Trading Plan tervalidasi.</div>');
  }
  function detail(symbol,m,tf='4h',display=null){
    selected={symbol,evaluation:m,tf};const frame=display||m.frames[tf]||m.frames['4h'];
    text('mhSym',symbol.replace(/USDT$/,'/USDT'));text('mhPrice',price(MalomoMarket.getTickers().find(x=>x.symbol===symbol)?.lastPrice||frame.last));
    $('mhStarBtn').textContent=MalomoStore.read('watchlist').includes(symbol)?'★':'☆';
    document.querySelectorAll('.tf-btn').forEach(b=>b.classList.toggle('active',b.dataset.tf===tf));
    const bias=m.bias||'ARAH TIDAK VALID';
    const frameInfo=['1d','4h'].map(t=>{
      const f=m.frames[t],e=f.evidence,s=f.structure;
      return card(t.toUpperCase()+' · '+s.bias,row('Status',esc(s.status+' · '+s.phase))+row('Protected swing',price(s.protectedSwing?.price))+row('EMA 21/30/50',[21,30,50].map(n=>'EMA'+n+': '+(f.ema[n]===null?'data kurang':f.last>=f.ema[n]?'harga di atas':'harga di bawah')).join(' · '))+row('ATR14 / RVOL20',`${price(e.atr14)} / ${e.rvol20===null?'—':e.rvol20.toFixed(2)} · evidence, bukan gate`));
    }).join('');
    const swingRows=frame.structure.swings.slice(-12).map(s=>row(s.type+' · '+s.role,price(s.price))).join('');
    const analysis=`<div class="trend-banner ${m.side==='long'?'score-hi':m.side==='short'?'score-lo':'score-mid'}"><div class="tb-title">${esc(bias)}</div><div class="tb-sub">${esc(m.status)}</div></div><div class="mtf-zone-grid">${frameInfo}</div>${card('SWING · '+tf.toUpperCase(),swingRows||'<div class="sop-note">Belum ada swing terkonfirmasi.</div>')}${card('LIQUIDITY SWEEP',frame.structure.sweeps.map(s=>row(s.side,price(s.level))).join('')||'<div class="sop-note">Tidak ada sweep pada candle terakhir.</div>')}${card('KONTEKS',row('Trend Efficiency',esc(frame.evidence.trendEfficiency))+row('ATR dibanding candle sebelumnya',frame.evidence.atrChange===null?'—':frame.evidence.atrChange.toFixed(4)+'× · konteks, bukan gate')+row('Magnitude / Displacement','Belum dinilai: definisi Candle Range lama tidak tercantum dalam PRD final.')+row('Regime volatilitas','Belum diklasifikasikan: batas kategori tidak ditetapkan dalam PRD.'))}`;
    const z=m.zone,p=m.plan;
    const validation=card('VALIDASI STRUKTUR → ENTRY 1H',row('Struktur 1D–4H',m.bias?'✓ Selaras':'○ Tidak selaras')+row('Zona struktural 4H',z?price(z.low)+'–'+price(z.high):'○ Belum ada')+row('Close 1H',esc(m.trigger.status))+row('Volume','Hanya penguat')+row('Minimum RR',p?'✓ 1:'+p.rr.toFixed(2):'NO TRADING PLAN'));
    const decision=card('KEPUTUSAN MALOMO',`<div class="decision-btns"><div class="decision-btn buy ${m.decision==='LONG'?'active':''}"><div class="db-label">LONG</div></div><div class="decision-btn wait ${m.decision==='SKIP'?'active':''}"><div class="db-label">SKIP</div></div><div class="decision-btn sell ${m.decision==='SHORT'?'active':''}"><div class="db-label">SHORT</div></div></div><div class="sop-note">${esc(m.status)}. Status menunggu konfirmasi struktur tidak menggugurkan kandidat ranking.</div>`);
    const trading=p?`<div class="entry-card ${m.side}"><div class="entry-card-head">${m.side.toUpperCase()} · ENTRY 1H TERVALIDASI</div>${row('Zona 4H',price(z.low)+'–'+price(z.high))}${row('Entry',price(p.entry))}${row('Stop Loss',price(p.sl))}${row('Target struktural',price(p.tp))}${row('Risk : Reward','1:'+p.rr.toFixed(2))}<div class="entry-caveat">SL adalah batas keluar posisi; tidak menunggu konfirmasi break–retest.</div><button class="btn btn-primary" data-action="save-plan">📌 Simpan ke Histori Setup</button><button class="btn" data-action="use-plan">🧮 Pakai di Kalkulator</button></div>`:card('TRADING PLAN','<div class="empty-state">'+esc(m.status)+' — entry, SL struktural dan target harus memenuhi RR minimum 1:2.2.</div>');
    html('wsAnalysisBody',analysis);html('wsValidationBody',validation);html('wsDecisionBody',decision);html('wsTradingSetupBody',trading);html('modalBody',analysis+validation+decision+trading);
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
    html('historyList',data.map(e=>`<div class="ws-card"><div class="ws-card-title">${esc(e.symbol)} · ${esc(e.side)} · ${esc(e.outcome||'tersimpan')}</div>${row('Entry / SL / TP',price(e.entry)+' / '+price(e.sl)+' / '+price(e.tp))}${row('RR','1:'+Number(e.rr).toFixed(2))}<button class="btn" data-action="history-delete" data-id="${esc(e.id)}">🗑 Hapus</button></div>`).join('')||'<div class="empty-state">Belum ada histori setup Malomo.</div>');
    html('shadowSummary','');
  }
  function decision(){
    const records=MalomoStore.read('tracks'),running=records.filter(x=>x.status==='running'),armed=records.filter(x=>x.status==='armed');
    html('decisionList',running.map(e=>`<div class="dec-card ${e.side}" data-action="detail" data-symbol="${esc(e.symbol)}"><div class="dec-head"><span class="run-tag"><span class="run-dot"></span>RUNNING</span><span>${esc(e.symbol)} · ${e.side.toUpperCase()}</span></div><div class="je-row">Entry ${price(e.entry)} · SL ${price(e.sl)} · TP ${price(e.tp)} · RR 1:${e.rr.toFixed(2)}</div><div class="sop-note">Simulasi read-only; SL tidak menunggu retest.</div></div>`).join('')||'<div class="empty-state">Tidak ada posisi simulasi RUNNING.</div>');
    text('decisionArmedNote',armed.length+' rencana tervalidasi menunggu harga entry');text('decisionCount',running.length);$('decisionCount').style.display=running.length?'inline-block':'none';
  }
  function alerts(){const a=MalomoStore.read('alerts');text('alertStats',a.length+' notifikasi');html('alertLog',a.map(x=>`<div class="alert-row"><div>${esc(x.message)}</div><div class="mono">${new Date(x.at).toLocaleString('id-ID')}</div></div>`).join('')||'<div class="empty-state">Belum ada notifikasi.</div>');}
  function priceAlerts(){html('priceAlertList',MalomoStore.read('priceAlerts').map(a=>`<div class="pa-item">${esc(a.symbol)} ${a.direction==='above'?'↑':'↓'} ${price(a.price)} ${a.triggered?'✓':''}<button class="pa-del" data-action="price-alert-delete" data-id="${esc(a.id)}">✕</button></div>`).join(''));}
  root.MalomoUI={$,html,text,esc,price,num,row,card,workspace,panel,panels,status,market,scan,detail,journal,journalForm,history,decision,alerts,priceAlerts,tickerRow,closeSidebar,getSelected:()=>selected,setFilter:v=>{filter=v;document.querySelectorAll('[data-filter]').forEach(b=>b.classList.toggle('active',b.dataset.filter===v));market();},setSort:v=>{sort=v;market();},getActive:()=>active};
})(globalThis);
