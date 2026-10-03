// node verify.js [sampleFraction]  → fetches each fact's source (Wikipedia API extract or raw page) and checks whether the
// fact's numbers / capitalised terms appear in the page text. Writes verify-out.json and prints the misses for manual review.
const fs=require('fs');const {execSync}=require('child_process');
const frac=+process.argv[2]||1;
const facts={};for(const f of fs.readdirSync('facts'))if(f.endsWith('.json'))for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync('facts/'+f))))if(v&&v.f)facts[k]={f:v.f,src:v.src||'',batch:f};
const keys=Object.keys(facts).filter(()=>Math.random()<frac);
const cache=fs.existsSync('verify-cache.json')?JSON.parse(fs.readFileSync('verify-cache.json')):{};for(const k of Object.keys(cache))if(!cache[k])delete cache[k];
function fetchText(src){if(cache[src]!==undefined)return cache[src];let t='';try{
 const m=src.match(/^https?:\/\/([a-z]+)\.wikipedia\.org\/wiki\/([^#?]+)/);
 if(m){const title=decodeURIComponent(m[2]);const url=`https://${m[1]}.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&titles=${encodeURIComponent(title)}`;
  for(let a=0;a<3&&!t;a++){try{const j=JSON.parse(execSync(`curl -s -A "flycorp-verify/1.0 (kelvinhe724@gmail.com)" "${url}"`,{maxBuffer:1e8}).toString());t=Object.values(j.query.pages).map(p=>p.extract||'').join('\n')}catch(e){execSync('sleep 2')}}}
 else{t=execSync(`curl -sL -m 25 -A "Mozilla/5.0" "${src}"`,{maxBuffer:1e8}).toString().replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/&[a-z#0-9]+;/g,' ')}
}catch(e){t=''}cache[src]=t;return t}
const norm=s=>s.replace(/(\d),(\d)/g,'$1$2').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9%.]+/g,' ');
const out={};let i=0;
for(const k of keys){const {f,src}=facts[k];i++;
 if(!src){out[k]={status:'nosrc',f};continue}
 const t=norm(fetchText(src));if(!t.trim()){out[k]={status:'nofetch',f,src};continue}
 // tokens: numbers, and capitalised words (excluding the leading word) of length>3
 const nums=(f.match(/\d[\d,.]*/g)||[]).map(x=>x.replace(/,/g,'').replace(/\.$/,''));
 const caps=(f.slice(1).match(/\b[A-Z][a-zA-Z'-]{3,}/g)||[]).map(x=>norm(x).trim());
 const missNums=nums.filter(n=>!t.replace(/,/g,'').includes(n));const missCaps=caps.filter(c=>!t.includes(c));
 out[k]={status:(missNums.length||missCaps.length>1)?'check':'ok',f,src,missNums,missCaps};
 if(i%25===0)fs.writeFileSync('verify-cache.json',JSON.stringify(cache));}
fs.writeFileSync('verify-cache.json',JSON.stringify(cache));fs.writeFileSync('verify-out.json',JSON.stringify(out,null,1));
const st={};for(const v of Object.values(out))st[v.status]=(st[v.status]||0)+1;console.log(keys.length,'checked',JSON.stringify(st));
for(const [k,v] of Object.entries(out))if(v.status!=='ok')console.log(`[${v.status}] ${k} :: ${v.f} :: nums:${(v.missNums||[]).join(',')} caps:${(v.missCaps||[]).join(',')} :: ${v.src}`);
