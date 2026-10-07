'use strict';
// Unduh data 1D + funding Sep 2019 – Des 2021 (periode bersih terakhir, belum pernah dipakai) dari data.binance.vision.
const fs=require('fs'),path=require('path'),zlib=require('zlib');
const OUT='awal',BASE='https://data.binance.vision/',S3='https://s3-ap-northeast-1.amazonaws.com/data.binance.vision',DAY=86400000;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));fs.mkdirSync(OUT,{recursive:true});
async function fetchBuf(url){for(let a=0;a<5;a++){try{const r=await fetch(url);if(r.status===404)return null;if(!r.ok)throw new Error('HTTP '+r.status);return Buffer.from(await r.arrayBuffer());}catch(e){if(a===4)throw new Error(url+' '+e.message);await sleep(2000*(a+1));}}}
function unzip(buf){let e=buf.length-22;while(e>=0&&buf.readUInt32LE(e)!==0x06054b50)e--;const cd=buf.readUInt32LE(e+16),method=buf.readUInt16LE(cd+10),size=buf.readUInt32LE(cd+20),local=buf.readUInt32LE(cd+42);const st=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),d=buf.subarray(st,st+size);return (method===0?d:zlib.inflateRawSync(d)).toString('utf8');}
async function listSymbols(){const out=[];let marker='';for(;;){const xml=(await fetchBuf(`${S3}?delimiter=/&prefix=data/futures/um/monthly/klines/${marker?'&marker='+encodeURIComponent(marker):''}`)).toString();const pre=[...xml.matchAll(/<Prefix>data\/futures\/um\/monthly\/klines\/([^<\/]+)\/<\/Prefix>/g)].map(m=>m[1]);out.push(...pre);if(!/<IsTruncated>true<\/IsTruncated>/.test(xml))break;const nm=xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);marker=nm?nm[1]:'data/futures/um/monthly/klines/'+pre[pre.length-1]+'/';}return [...new Set(out)].filter(s=>/^[A-Z0-9]+USDT$/.test(s));}
const months=(f,t)=>{const o=[];let [y,m]=f;while(y<t[0]||(y===t[0]&&m<=t[1])){o.push(y+'-'+String(m).padStart(2,'0'));m++;if(m>12){m=1;y++;}}return o;};
const parse=csv=>csv.split(/\r?\n/).map(l=>l.split(',')).filter(k=>k.length>=11&&/^\d+$/.test(k[0])).map(k=>({t:+k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5],ct:+k[6],quoteVolume:+k[7],takerBuyQuote:+k[10]}));
(async()=>{
  const syms=await listSymbols(),ms=months([2019,9],[2021,12]);let n=0,have=0;
  for(const s of syms){
    const f=path.join(OUT,s+'_1d.json');
    if(!fs.existsSync(f)){let all=[];for(let i=0;i<ms.length;i+=8){const p=await Promise.all(ms.slice(i,i+8).map(async mo=>{const b=await fetchBuf(`${BASE}data/futures/um/monthly/klines/${s}/1d/${s}-1d-${mo}.zip`);return b?parse(unzip(b)):[];}));for(const x of p)all.push(...x);}
      all.sort((a,b)=>a.t-b.t);all=all.filter((x,i)=>!i||x.t!==all[i-1].t);if(all.length){fs.writeFileSync(f,JSON.stringify(all));
        const fr=[];for(let i=0;i<ms.length;i+=8){const p=await Promise.all(ms.slice(i,i+8).map(async mo=>{const b=await fetchBuf(`${BASE}data/futures/um/monthly/fundingRate/${s}/${s}-fundingRate-${mo}.zip`);return b?unzip(b).split(/\r?\n/).map(l=>l.split(',')).filter(k=>/^\d+$/.test(k[0])).map(k=>({t:+k[0],r:+k[2]})):[];}));for(const x of p)fr.push(...x);}
        fr.sort((a,b)=>a.t-b.t);fs.writeFileSync(path.join(OUT,s+'_funding.json'),JSON.stringify(fr));}}
    if(fs.existsSync(f))have++;if(++n%100===0)console.log(n,'/',syms.length,'punya data',have);
  }
  console.log('SELESAI unduh awal, pair dengan data:',have);
})().catch(e=>{console.error('ERR',e.stack);process.exit(1);});
