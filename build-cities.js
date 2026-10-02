// node build-cities.js → cities.js (merges data/*.json, tags region, dedupes)
const fs=require('fs');const out=[];const seen=new Set();const bad=[];
for(const r of ['na','latam','eu','mea','sca','eao']){
  for(const c of JSON.parse(fs.readFileSync(`data/${r}.json`,'utf8'))){
    const k=c.n+'|'+c.c; if(seen.has(k))continue; seen.add(k);
    if(typeof c.lat!=='number'||typeof c.lon!=='number'||!(c.pop>0)||!c.e||c.g==null||!c.f){bad.push(k);continue}
    out.push({n:c.n,c:c.c,iata:c.iata||'',lat:c.lat,lon:c.lon,pop:c.pop,e:c.e,g:c.g,t:c.t||null,f:c.f,r});
  }}
const ties=fs.existsSync('data/ties.json')?JSON.parse(fs.readFileSync('data/ties.json','utf8')):[];
fs.writeFileSync('cities.js','const CITIES='+JSON.stringify(out)+';\nconst TIES_DATA='+JSON.stringify(ties)+';\n');
console.log(out.length,'cities; bad:',bad);
const W=new Set(eval(fs.readFileSync('world.js','utf8')+';WORLD').map(w=>w.n));
console.log('no polygon:',[...new Set(out.map(c=>c.c))].filter(n=>!W.has(n)).join(', '));
