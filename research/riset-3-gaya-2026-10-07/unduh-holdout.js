'use strict';
// Unduh data HOLDOUT (Jan 2022 – Des 2023) dari data.binance.vision, termasuk pair yang sudah delisting
// (mengurangi survivorship bias). Skrip ini hanya MENGUNDUH; tidak menghitung hasil apa pun.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const OUT='holdout',BASE='https://data.binance.vision/',S3='https://s3-ap-northeast-1.amazonaws.com/data.binance.vision';
const DAY=86400000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
fs.mkdirSync(OUT,{recursive:true});
async function fetchBuf(url){
  for(let a=0;a<5;a++){
    try{const res=await fetch(url);if(res.status===404)return null;if(!res.ok)throw new Error('HTTP '+res.status);return Buffer.from(await res.arrayBuffer());}
    catch(e){if(a===4)throw new Error(url+' '+e.message);await sleep(2000*(a+1));}
  }
}
// Zip satu berkas: baca central directory lalu inflateRaw.
function unzip(buf){
  let e=buf.length-22;while(e>=0&&buf.readUInt32LE(e)!==0x06054b50)e--;if(e<0)throw new Error('zip rusak');
  const cd=buf.readUInt32LE(e+16);if(buf.readUInt32LE(cd)!==0x02014b50)throw new Error('central dir rusak');
  const method=buf.readUInt16LE(cd+10),size=buf.readUInt32LE(cd+20),local=buf.readUInt32LE(cd+42);
  const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),data=buf.subarray(start,start+size);
  return (method===0?data:zlib.inflateRawSync(data)).toString('utf8');
}
async function listSymbols(){
  const out=[];let marker='';
  for(;;){
    const xml=(await fetchBuf(`${S3}?delimiter=/&prefix=data/futures/um/monthly/klines/${marker?'&marker='+encodeURIComponent(marker):''}`)).toString();
    const pre=[...xml.matchAll(/<Prefix>data\/futures\/um\/monthly\/klines\/([^<\/]+)\/<\/Prefix>/g)].map(m=>m[1]);
    out.push(...pre);
    if(!/<IsTruncated>true<\/IsTruncated>/.test(xml))break;
    const nm=xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);marker=nm?nm[1]:'data/futures/um/monthly/klines/'+pre[pre.length-1]+'/';
  }
  return [...new Set(out)].filter(s=>/^[A-Z0-9]+USDT$/.test(s));
}
const months=(from,to)=>{const o=[];let [y,m]=from;while(y<to[0]||(y===to[0]&&m<=to[1])){o.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}return o;};
function parseKlines(csv){
  const o=[];for(const line of csv.split(/\r?\n/)){const k=line.split(',');if(k.length<11||!/^\d+$/.test(k[0]))continue;
    o.push({t:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],ct:+k[6],quoteVolume:+k[7],takerBuyQuote:+k[10]});}
  return o;
}
async function klines(sym,tf,ms){
  const file=path.join(OUT,sym+'_'+tf+'.json');if(fs.existsSync(file))return JSON.parse(fs.readFileSync(file,'utf8'));
  let all=[];
  for(let i=0;i<ms.length;i+=6){
    const parts=await Promise.all(ms.slice(i,i+6).map(async mo=>{const b=await fetchBuf(`${BASE}data/futures/um/monthly/klines/${sym}/${tf}/${sym}-${tf}-${mo}.zip`);return b?parseKlines(unzip(b)):[];}));
    for(const p of parts)all.push(...p);
  }
  all.sort((a,b)=>a.t-b.t);all=all.filter((x,i)=>i===0||x.t!==all[i-1].t);
  fs.writeFileSync(file,JSON.stringify(all));return all;
}
async function funding(sym,ms){
  const file=path.join(OUT,sym+'_funding.json');if(fs.existsSync(file))return;
  const out=[];
  for(let i=0;i<ms.length;i+=6){
    const parts=await Promise.all(ms.slice(i,i+6).map(async mo=>{const b=await fetchBuf(`${BASE}data/futures/um/monthly/fundingRate/${sym}/${sym}-fundingRate-${mo}.zip`);if(!b)return [];
      return unzip(b).split(/\r?\n/).map(l=>l.split(',')).filter(k=>/^\d+$/.test(k[0])).map(k=>({t:+k[0],r:+k[2]}));}));
    for(const p of parts)out.push(...p);
  }
  out.sort((a,b)=>a.t-b.t);fs.writeFileSync(file,JSON.stringify(out));
}
(async()=>{
  const syms=await listSymbols();console.log('simbol USDT-M:',syms.length);
  const m1d=months([2021,1],[2023,12]),mIntra=months([2021,11],[2023,12]);
  const daily={};
  for(const s of syms){const c=await klines(s,'1d',m1d);if(c.length)daily[s]=c;}
  console.log('punya data 1D 2021–2023:',Object.keys(daily).length);
  // Universe point-in-time: tiap hari 2022–2023, 100 pair teratas menurut quote volume 30 hari sebelumnya.
  const from=Date.parse('2022-01-01'),to=Date.parse('2024-01-01'),universe={},ever=new Set();
  const qv={};for(const [s,c] of Object.entries(daily)){qv[s]=new Map(c.map(x=>[Math.floor(x.t/DAY),x.quoteVolume]));}
  for(let d=from/DAY;d<to/DAY;d++){
    const rank=[];for(const s of Object.keys(qv)){let v=0,n=0;for(let k=d-30;k<d;k++){const q=qv[s].get(k);if(q!=null){v+=q;n++;}}if(n>=20)rank.push([s,v]);}
    rank.sort((a,b)=>b[1]-a[1]);universe[d]=rank.slice(0,100).map(x=>x[0]);universe[d].forEach(s=>ever.add(s));
  }
  fs.writeFileSync(path.join(OUT,'universe.json'),JSON.stringify(universe));
  console.log('pair yang pernah masuk Top 100:',ever.size);
  let n=0;
  for(const s of ever){await klines(s,'4h',mIntra);await klines(s,'1h',mIntra);await funding(s,months([2021,12],[2023,12]));if(++n%20===0)console.log(new Date().toISOString().slice(11,19),n,'/',ever.size);}
  console.log('SELESAI unduh holdout');
})().catch(e=>{console.error('ERR',e.stack);process.exit(1);});
