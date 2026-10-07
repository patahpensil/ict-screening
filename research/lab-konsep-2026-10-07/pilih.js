'use strict';
// Aturan pemilihan finalis — DITETAPKAN SEBELUM hasil pencarian dilihat (7 Okt 2026).
// Tahap 1: konsep dasar layak bila latih n>=200, latih exp>0, cek exp>0. Ambil 3 teratas menurut exp latih.
//          Bila kurang dari 3 yang layak, sisanya diisi konsep dengan exp latih tertinggi (hanya sebagai kandidat penyelamatan lewat filter).
// Tahap 2: untuk tiap konsep dasar, filter indikator ditambahkan secara bertahap (maks. 2). Filter diterima bila
//          menaikkan exp latih minimal +0,05R DAN menaikkan exp cek, dengan sisa sampel latih n>=150 dan cek n>=60.
// Finalis: konsep (dasar + filter) dengan exp latih>0 dan exp cek>0. Maksimal 3 finalis ke data uji.
// Syarat lulus di data uji (pemilik): exp sesudah fee >= +0,10R, n >= 60, positif di latih, cek, dan uji.
const fs=require('fs');
const lab=fs.readFileSync('lab.js','utf8');
const FILTERS=eval('('+lab.slice(lab.indexOf('const FILTERS={')+'const FILTERS='.length,lab.indexOf('};',lab.indexOf('const FILTERS={'))+1)+')');
const b=JSON.parse(fs.readFileSync('hasil-cari.json','utf8'));
const st=t=>{const n=t.length,s=t.reduce((q,x)=>q+x.rNet,0),w=t.filter(x=>x.rNet>0).length;return {n,exp:n?s/n:-Infinity,win:n?100*w/n:null,total:s};};
const fmt=x=>'n'+x.n+' w'+(x.win==null?'—':x.win.toFixed(0)+'%')+' e'+(Number.isFinite(x.exp)?x.exp.toFixed(3):'—');
const apply=(t,fs_)=>t.filter(x=>fs_.every(k=>FILTERS[k](x.f)));
const rows=Object.entries(b).map(([id,v])=>({id,cfg:v.cfg,latih:st(v.latih),cek:st(v.cek),raw:v})).sort((a,c)=>c.latih.exp-a.latih.exp);
console.log('=== TAHAP 1: semua konsep dasar (urut exp latih) ===');
for(const r of rows)console.log(r.id.padEnd(34),'latih',fmt(r.latih).padEnd(24),'cek',fmt(r.cek));
const eligible=rows.filter(r=>r.latih.n>=200&&r.latih.exp>0&&r.cek.exp>0);
const base=[...eligible,...rows.filter(r=>!eligible.includes(r))].slice(0,3);
console.log('\nkonsep dasar layak:',eligible.length,'| dibawa ke tahap 2:',base.map(r=>r.id+(eligible.includes(r)?'':' (penyelamatan)')).join(', '));
console.log('\n=== TAHAP 2: filter indikator ===');
const finalis=[];
for(const r of base){
  let chosen=[],cur={latih:r.latih,cek:r.cek};
  for(let step=0;step<2;step++){
    let best=null;
    for(const k of Object.keys(FILTERS)){
      if(chosen.includes(k))continue;
      const L=st(apply(r.raw.latih,[...chosen,k])),C=st(apply(r.raw.cek,[...chosen,k]));
      if(L.n<150||C.n<60)continue;
      if(L.exp>=cur.latih.exp+0.05&&C.exp>cur.cek.exp&&(!best||L.exp>best.L.exp))best={k,L,C};
    }
    if(!best)break;
    chosen.push(best.k);cur={latih:best.L,cek:best.C};
    console.log(r.id,'+',best.k,'-> latih',fmt(best.L),'| cek',fmt(best.C));
  }
  const ok=cur.latih.exp>0&&cur.cek.exp>0;
  console.log(r.id,'akhir:',chosen.join(' + ')||'(tanpa filter)','latih',fmt(cur.latih),'cek',fmt(cur.cek),ok?'=> FINALIS':'=> gugur');
  if(ok)finalis.push(Object.assign({},r.cfg,{filters:chosen,id:r.cfg.id}));
}
fs.writeFileSync('finalis.json',JSON.stringify(finalis,null,1));
console.log('\nfinalis:',finalis.length,finalis.map(f=>f.id+(f.filters.length?' | '+f.filters.join('+'):'')).join(' ; '));

// Laporan tambahan (permintaan pemilik): klasifikasi indikator berguna / merugikan / noise.
// Diukur sebagai filter tunggal pada tiap konsep dasar yang dibawa ke tahap 2. Tidak mengubah pemilihan finalis.
console.log('\n=== KLASIFIKASI INDIKATOR (berguna / merugikan / noise) ===');
const verdicts={};
for(const r of base){
  for(const k of Object.keys(FILTERS)){
    const L=st(apply(r.raw.latih,[k])),C=st(apply(r.raw.cek,[k]));
    if(L.n<100||C.n<40){(verdicts[k]=verdicts[k]||[]).push('sampel kecil');continue;}
    const dL=L.exp-r.latih.exp,dC=C.exp-r.cek.exp;
    const v=dL>=0.05&&dC>=0.05?'berguna':dL<=-0.05&&dC<=-0.05?'merugikan':'noise';
    (verdicts[k]=verdicts[k]||[]).push(v);
    console.log(r.id.padEnd(34),k.padEnd(22),'Δlatih',(dL>=0?'+':'')+dL.toFixed(3),'Δcek',(dC>=0?'+':'')+dC.toFixed(3),'->',v);
  }
}
console.log('\nRingkasan per indikator (atas 3 konsep dasar):');
for(const [k,v] of Object.entries(verdicts)){const c=t=>v.filter(x=>x===t).length;console.log(k.padEnd(22),'berguna',c('berguna'),'| merugikan',c('merugikan'),'| noise',c('noise'),'| sampel kecil',c('sampel kecil'));}
fs.writeFileSync('klasifikasi-indikator.json',JSON.stringify(verdicts,null,1));
