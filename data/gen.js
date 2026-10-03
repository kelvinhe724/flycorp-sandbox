// v2 generator (reference copy). Run from a scratch dir holding: orig/{na,...}.json (v1 snapshot), airports.csv + runways.csv + countries.csv (OurAirports), cities500.txt + admin1CodesASCII.txt (GeoNames), names.json, fixes.json, facts/*.json. Writes data/*.json.
const fs=require('fs'),csv=require('./csv.js');
const REG=['na','latam','eu','mea','sca','eao'];
const FOCUS=new Set(['US','CN','HK','MO','TW','JP','KR','FR','GB','DE','NL','BE','LU']);
const ISO2NAME={AG:'Antigua and Barb.',BA:'Bosnia and Herz.',BL:'St-Barthélemy',BQ:'Caribbean Netherlands',CC:'Indian Ocean Ter.',CX:'Indian Ocean Ter.',CD:'Dem. Rep. Congo',CF:'Central African Rep.',CG:'Congo',CK:'Cook Is.',CV:'Cabo Verde',CZ:'Czechia',DO:'Dominican Rep.',EH:'W. Sahara',FK:'Falkland Is.',FO:'Faeroe Is.',GF:'French Guiana',GI:'Gibraltar',GP:'Guadeloupe',GQ:'Eq. Guinea',KN:'St. Kitts and Nevis',KY:'Cayman Is.',MF:'St-Martin',MH:'Marshall Is.',MK:'Macedonia',MO:'Macao',MP:'N. Mariana Is.',MQ:'Martinique',NR:'Nauru',PF:'Fr. Polynesia',PM:'St. Pierre and Miquelon',RE:'Réunion',SB:'Solomon Is.',SH:'Saint Helena',SS:'S. Sudan',SZ:'eSwatini',TC:'Turks and Caicos Is.',TV:'Tuvalu',UM:'United States of America',US:'United States of America',VC:'St. Vin. and Gren.',VG:'British Virgin Is.',VI:'U.S. Virgin Is.',WF:'Wallis and Futuna Is.',YT:'Mayotte',XK:'Kosovo',SX:'Sint Maarten',AX:'Åland',SJ:'Norway'};
const NEWG={'Caribbean Netherlands':28};
const NEWREG={'Caribbean Netherlands':'na'};
const NAME=JSON.parse(fs.readFileSync('names.json','utf8')); // iata → display name override
const TOURIST=new Set(['ASE','EGE','JAC','ACK','MVY','SUN','HDN','TEX','HHH','GUC','MMH','PVC','BHB','MMY','CMF','MPH','HTI','MHU','BOB']);
const PILGRIM=new Set(['LDE']);
const NOISLAND=new Set(['AES','RJK','ODE','NPT','ISP','NYM','PEX','ZKP']);
const ISLAND=new Set('RHO,CFU,EFL,AOK,MJT,JSI,MAH,PNL,TER,SMA,PXO,HOR,LBU,PQC,VCS,PMV,SPR,CUK,TAB,STX,NEV,BQU,VIJ,YAP,BUA,TAH,HPA,KNS,HTI,GTE,ELC,SNB,HID,GBJ,RRG,AJN,PRI,URE,KDL,BWK,EBA,TOD,LGK,PGK,TNJ,NTX,WNI,LUV,BIK,TTE,OIM,HAC,MYE,RJAN,RIS,OIR,KUM,TNE,TSJ,IKI,FUJ,ASJ,TKN,OKE,RNJ,KKX,UEO,TRA,OGN,AGJ,SDS,OKI,HNM,MKK,LNY,LIH,BID,FRD,ESD,LPS,DTR,KSJX,89D,KTN,SIT,PSG,WRG,KLW,HNH,ADQ,NRD,AGE,JUI,BMR,BMK,HGL,GWT,COL,CSA,TRE,ILY,KOI,SYY,BEB,ACI,CPX,VQS,BON,EUX,SAB,KSA,ROP,TIQ,VAV,CIW,UNI,MQS,GDT,XSC,NCA,BBQ,CYB,GJA,PVA,CYO,CCC,GER,FPO,GHB,MYG,RSD,GGT,IGA,TCB,MHH,ELH,BIM,TZN,SAQ,ASD,ZSA,ATC,TBI,AXP,CCZ,CRI,LGI,SML,BOB,RFP,MOZ,HUH,AUQ,NHV,TUB,RUR,GMR,UVE,ILP,LIF,MEE,TGJ,MUA,FIE,FOA,NRL,PPW,WRY,SOY,NDY,EOI,OUI,PIX,SJZ,GRW,GRY,MPH,TBH,CGM,OCS,PCP,KDO,NMF,HAQ,KDM,VAM,CAL,SNP,STG,AKB,IKO,KQA,SMK,KVC,KFP,SDP,CDB,NLG,PTH,GAM,SVA,MYU,YGR,CPX'.split(','));
const EXTRA=new Set(['UAK']); // Narsarsuaq is tagged heliport in OurAirports but is a real scheduled airport
const KEEP=new Set(['MOZ','NEV','BQU','VIJ','UNI','KTD','PPW','WRY']); // distinct islands next to an existing/new city
const KEEP_NOIATA=new Set(['RJAN','KSJX','KPCW','KCVX','89D','KR-1114']);
const DROP=new Set(['ULY','GOX','CYC','LIDT','LHPR','FYTF','SHI','NRT','BVA','XCR','NBJ','DXN','SPX','FTW','SQL','CCR','TIW','BLD','DAX','KR-1113','CA-1292']); // secondary airports of cities already present / bogus rows
const FIX={'Nairobi|Kenya':{lat:-1.29},'Gan|Maldives':{lat:-0.69}}; // sign errors in v1 coords

// ---------- load existing ----------
const orig={},existing=[],c2r={},c2g={};
for(const r of REG){orig[r]=JSON.parse(fs.readFileSync(`orig/${r}.json`,'utf8'));for(const c of orig[r]){existing.push({...c,r});c2r[c.c]=c2r[c.c]||r;c2g[c.c]=c.g}}
Object.assign(c2g,NEWG);Object.assign(c2r,NEWREG);
const W=eval(fs.readFileSync('/Users/kelvin/flycorp/world.js','utf8')+';WORLD');
const countries=csv(fs.readFileSync('countries.csv','utf8'));
const WN=new Set(W.map(w=>w.n));
const iso2name={};for(const c of countries){iso2name[c.code]=ISO2NAME[c.code]||(WN.has(c.name)?c.name:(c2g[c.name]!=null?c.name:null))}
const facts={},badFacts=[];if(fs.existsSync('facts'))for(const f of fs.readdirSync('facts'))if(f.endsWith('.json'))for(const [k,v] of Object.entries(JSON.parse(fs.readFileSync('facts/'+f,'utf8')))){
let t=(typeof v==='string'?v:(v&&v.f)||'').replace(/\s*[\u2014\u2013]\s*/g,', ').replace(/\s+/g,' ').trim();if(!t)continue;
if(!/[.!?]$/.test(t))t+='.';if(t.length>140){badFacts.push(k+' LEN '+t.length);continue}facts[k]=t}
const FIXES=fs.existsSync('fixes.json')?JSON.parse(fs.readFileSync('fixes.json','utf8')):{};Object.assign(facts,FIXES);
const REJECT=fs.existsSync('reject.json')?new Set(JSON.parse(fs.readFileSync('reject.json','utf8'))):new Set();for(const k of REJECT)delete facts[k];

// ---------- geo helpers ----------
const R=6371;const rad=x=>x*Math.PI/180;
function km(a,b,c,d){const x=rad(c-a),y=rad(d-b)*Math.cos(rad((a+c)/2));return R*Math.sqrt(x*x+y*y)}
function norm(s){return (s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\bst\.?\s/g,'saint ').replace(/\bste\.?\s/g,'sainte ').replace(/\bmt\.?\s/g,'mount ').replace(/[^a-z0-9]+/g,' ').trim()}
const rings=[];for(const w of W)for(const p of w.p){const pts=[];for(let i=0;i<p.length;i+=2)pts.push([p[i],p[i+1]]);let a=0;for(let i=0,j=pts.length-1;i<pts.length;j=i++){if(Math.abs(pts[i][0]-pts[j][0])>180)continue;a+=(pts[j][0]*pts[i][1]-pts[i][0]*pts[j][1])}
const lat0=pts.reduce((s,q)=>s+q[1],0)/pts.length;const area=Math.abs(a)/2*(111.32*111.32*Math.cos(rad(lat0)));
let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;for(const q of pts){minx=Math.min(minx,q[0]);maxx=Math.max(maxx,q[0]);miny=Math.min(miny,q[1]);maxy=Math.max(maxy,q[1])}
rings.push({n:w.n,pts,area,minx,maxx,miny,maxy})}
const largestRing={};for(const r of rings){if(!largestRing[r.n]||r.area>largestRing[r.n].area)largestRing[r.n]=r}
function pip(pts,x,y){let inside=false;for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i][0],yi=pts[i][1],xj=pts[j][0],yj=pts[j][1];if(Math.abs(xi-xj)>180)continue;if(((yi>y)!=(yj>y))&&(x<(xj-xi)*(y-yi)/(yj-yi)+xi))inside=!inside}return inside}
function landInfo(lat,lon){let best=null;for(const r of rings){if(lon<r.minx||lon>r.maxx||lat<r.miny||lat>r.maxy)continue;if(pip(r.pts,lon,lat)&&(!best||r.area<best.area))best=r}
if(best)return{area:best.area,inside:true,main:largestRing[best.n]===best};
let d=1e9;for(const r of rings){if(lon<r.minx-1||lon>r.maxx+1||lat<r.miny-1||lat>r.maxy+1)continue;for(const q of r.pts){const t=km(lat,lon,q[1],q[0]);if(t<d)d=t}}return{area:0,inside:false,dist:d}}

// ---------- GeoNames ----------
const admin1={};for(const l of fs.readFileSync('admin1.txt','utf8').split('\n')){const t=l.split('\t');if(t[1])admin1[t[0]]=t[1]}
const grid={};
for(const l of fs.readFileSync('cities500.txt','utf8').split('\n')){const t=l.split('\t');if(t.length<15)continue;if(t[6]!=='P')continue;
const g={name:t[1],ascii:t[2],alt:t[3],lat:+t[4],lon:+t[5],code:t[7],cc:t[8],a1:t[10],pop:+t[14]};const k=Math.floor(g.lat)+','+Math.floor(g.lon);(grid[k]=grid[k]||[]).push(g)}
function near(lat,lon,radius,cc){const out=[];const d=Math.ceil(radius/100)+1;for(let i=-d;i<=d;i++)for(let j=-d;j<=d;j++){for(const g of grid[(Math.floor(lat)+i)+','+(Math.floor(lon)+j)]||[]){if(cc&&g.cc!==cc)continue;const k=km(lat,lon,g.lat,g.lon);if(k<=radius)out.push({g,k})}}return out}
const nameOf=g=>[g.name,g.ascii,...(g.alt?g.alt.split(','):[])].map(norm);
function matchPlace(a){const lat=+a.latitude_deg,lon=+a.longitude_deg;const cc=a.iso_country==='UM'?'US':a.iso_country;
let cands=near(lat,lon,60,cc);if(!cands.length)cands=near(lat,lon,60);
const st=a.iso_country==='US'?(a.iso_region||'').split('-')[1]:null;
const byPop=(x,y)=>(x.g.code==='PPLX')-(y.g.code==='PPLX')||(st?((y.g.a1===st)-(x.g.a1===st)):0)||y.g.pop-x.g.pop;
const mun=norm((a.municipality||'').split(/ ?[,\/] ?| - |\(/)[0]);
if(mun){const m=cands.filter(c=>nameOf(c.g).includes(mun)).sort(byPop);if(m.length)return{g:m[0].g,k:m[0].k,how:'name'}}
const an=norm(a.name.replace(/airport|international|regional|airfield|aerodrome|field|municipal|county|intl/gi,''));
const m3=cands.filter(c=>c.k<40&&c.g.code!=='PPLX'&&nameOf(c.g).some(n=>n&&n.length>3&&an.split(' ').includes(n))).sort(byPop);if(m3.length)return{g:m3[0].g,k:m3[0].k,how:'aname'};
const c25=cands.filter(c=>c.k<25&&c.g.code!=='PPLX').sort(byPop);if(c25.length)return{g:c25[0].g,k:c25[0].k,how:'big25'};
const c40=cands.filter(c=>c.k<40&&c.g.code!=='PPLX').sort((x,y)=>x.k-y.k);if(c40.length)return{g:c40[0].g,k:c40[0].k,how:'near40'};
return null}

// ---------- OurAirports ----------
const rank={large_airport:3,medium_airport:2,small_airport:1,heliport:0};
const A=csv(fs.readFileSync('airports.csv','utf8'));
const RW={};for(const r of csv(fs.readFileSync('runways.csv','utf8'))){if(r.closed==='1')continue;if(/WATER/i.test(r.surface))continue;const L=+r.length_ft;if(L>0&&L>(RW[r.airport_ident]||0))RW[r.airport_ident]=L}
const byIata={},byIdent={};for(const a of A){if(a.iata_code)byIata[a.iata_code]=byIata[a.iata_code]||a;for(const k of [a.ident,a.icao_code,a.gps_code])if(k)byIdent[k]=byIdent[k]||a}
const nearestAirport=(lat,lon)=>{let b=null,bd=30;for(const a of A){if(!['large_airport','medium_airport','small_airport'].includes(a.type))continue;const d=km(lat,lon,+a.latitude_deg,+a.longitude_deg);if(d<bd&&(!b||a.scheduled_service==='yes'&&b.scheduled_service!=='yes'||rank[a.type]>rank[b.type])){b=a;bd=d}}return b};
let cands=A.filter(a=>a.scheduled_service==='yes'&&(['large_airport','medium_airport','small_airport'].includes(a.type)||EXTRA.has(a.iata_code))&&(FOCUS.has(a.iso_country)||a.type!=='small_airport'));
cands=cands.filter(a=>!DROP.has(a.iata_code||a.ident)&&(a.iata_code||KEEP_NOIATA.has(a.ident)||(a.type!=='small_airport'&&/^[A-Z]{4}$/.test(a.ident))));
{const seen={};cands=cands.filter(a=>{const k=a.iata_code||a.ident;if(seen[k])return false;seen[k]=1;return true})}

// ---------- attach ap/el/rw to existing ----------
const exOut=existing.map(c=>{const o={...c};Object.assign(o,FIX[c.n+'|'+c.c]||{});let a=byIata[c.iata]||byIdent[c.iata];if(a&&km(o.lat,o.lon,+a.latitude_deg,+a.longitude_deg)>500)a=null;if(!a)a=nearestAirport(o.lat,o.lon);
if(a){o.ap=a.name;if(a.elevation_ft!=='')o.el=+a.elevation_ft;if(RW[a.ident])o.rw=RW[a.ident]}return o});
const noAp=exOut.filter(c=>!c.ap).map(c=>c.n+'|'+c.c+'|'+c.iata);

// ---------- dedup candidates vs existing ----------
const exByC={};for(const c of exOut)(exByC[c.c]=exByC[c.c]||[]).push(c);
const exIata=new Set(existing.map(c=>c.iata).filter(Boolean));
const skipped=[];const news=[];
function nameHit(aname,cn){return new RegExp('(^|[^a-z])'+norm(cn).replace(/ /g,'[^a-z]+')+'($|[^a-z])').test(norm(aname))}
for(const a of cands){const cn=iso2name[a.iso_country];if(!cn){skipped.push(['nocountry',a.iso_country,a.name]);continue}
if(exIata.has(a.iata_code))continue;
const lat=+a.latitude_deg,lon=+a.longitude_deg;const m=matchPlace(a);
const mun=norm((a.municipality||'').split(/ ?[,\/] ?| - |\(/)[0]);
let dup=null;if(!KEEP.has(a.iata_code))for(const c of exByC[cn]||[]){const d=km(lat,lon,c.lat,c.lon);const cn_=norm(c.n);
if(d<25||(d<130&&(norm(a.name).startsWith(cn_+' ')||norm(a.name).startsWith(cn_+'-')))||(d<50&&nameHit(a.name,c.n))||(d<100&&mun===cn_)||(d<60&&m&&norm(m.g.name)===cn_))dup=c}
if(dup){skipped.push(['dupex',a.iata_code,a.name,dup.n]);continue}
news.push({a,cn,lat,lon,m,mun})}
news.sort((x,y)=>rank[y.a.type]-rank[x.a.type]||(RW[y.a.ident]||0)-(RW[x.a.ident]||0));
const kept=[];for(const n of news){let d=null;if(!KEEP.has(n.a.iata_code))for(const k of kept){if(k.cn!==n.cn)continue;const dd=km(n.lat,n.lon,k.lat,k.lon);if(dd<5||(dd<60&&n.mun&&n.mun===k.mun))d=k}
if(d){skipped.push(['dupnew',n.a.iata_code,n.a.name,d.a.name]);continue}kept.push(n)}

// ---------- build entries ----------
const out={};for(const r of REG)out[r]=[];
for(const c of exOut)out[c.r].push(c);
const built=[];
for(const n of kept){const a=n.a;const m=n.m;let pop=0,a1=m?m.g.a1:'';
if(m&&(m.how==='name'||m.how==='aname'||m.k<12))pop=m.g.pop;
if(m&&pop===0){const alt=near(n.lat,n.lon,15,a.iso_country).filter(c=>c.g.pop>0&&nameOf(c.g).includes(norm(m.g.name)));if(alt.length)pop=alt[0].g.pop}
const ov=NAME[a.iata_code||a.ident];if(ov){const on=norm(ov.replace(/ \(.*\)$/,''));const alt=near(n.lat,n.lon,80,a.iso_country).filter(c=>c.g.code!=='PPLX'&&nameOf(c.g).includes(on)).sort((x,y)=>y.g.pop-x.g.pop);if(alt.length){pop=alt[0].g.pop;a1=alt[0].g.a1}}
let name=ov||(a.municipality||'').split(/ ?[,\/] ?| - |\(/)[0].trim()||(m&&m.g.name)||a.name.replace(/ (International |Regional |Municipal )?(Airport|Airfield|Aerodrome)$/,'');
pop=Math.max(0.0005,Math.round(pop/1000)/1000);if(pop>=1)pop=Math.round(pop*10)/10;else if(pop>=0.1)pop=Math.round(pop*100)/100;
const type=a.type;let e;
if(type==='large_airport')e=pop>=8?5:pop>=1.5?4:pop>=0.1?3:2;else if(type==='medium_airport')e=pop>=0.8?3:2;else e=pop>=0.05?2:1;
let r=c2r[n.cn];if(n.cn==='Russia')r=n.lon>60?'sca':'eu';if(!r){console.log('noregion',n.cn);r='mea'}
let t=null;const li=landInfo(n.lat,n.lon);
const isIsland=!NOISLAND.has(a.iata_code)&&((li.inside&&li.area<3500&&(!li.main||li.area<1500))||(!li.inside&&li.dist>15));
const big=near(n.lat,n.lon,150).some(c=>c.g.pop>=20000);
if(n.lat>66||n.lat<-60)t='polar';
else if(TOURIST.has(a.iata_code))t='tourist';else if(PILGRIM.has(a.iata_code))t='pilgrimage';
else if(pop<0.003&&!big)t='remote';
else if((isIsland&&pop<0.2)||ISLAND.has(a.iata_code||a.ident))t='island';
const ent={n:name,c:n.cn,iata:a.iata_code||a.icao_code||a.ident,lat:Math.round(n.lat*100)/100,lon:Math.round(n.lon*100)/100,pop,e,g:c2g[n.cn],t,f:'',ap:a.name};
if(a.elevation_ft!=='')ent.el=+a.elevation_ft;if(RW[a.ident])ent.rw=RW[a.ident];
if(ent.g==null){console.log('nogdp',n.cn);ent.g=5}
built.push({ent,r,a1,iso:a.iso_country,st:(a.iso_region||'').split('-')[1],m,li})}
// ---------- disambiguate names ----------
const exByName={};for(const c of existing)(exByName[c.n]=exByName[c.n]||[]).push(c);
const newByName={};for(const b of built)(newByName[b.ent.n]=newByName[b.ent.n]||[]).push(b);
for(const b of built){const e=b.ent;if(/\(.*\)$/.test(e.n))continue;const ex=exByName[e.n]||[];const sameC=(newByName[e.n]||[]).some(o=>o!==b&&o.ent.c===e.c);
if(!ex.length&&!sameC)continue;
let s;if(b.iso==='US')s=b.st;else if(sameC||ex.some(c=>c.c===e.c)){const k=b.iso+'.'+b.a1;s=admin1[k]||'';if(!s||norm(s)===norm(e.n))s=e.c}else s=e.c;
if(s)e.n=e.n+' ('+s+')'}
const keys=new Set(existing.map(c=>c.n+'|'+c.c));for(const b of built){let k=b.ent.n+'|'+b.ent.c;if(keys.has(k)){b.ent.n+=' ('+b.ent.iata+')';k=b.ent.n+'|'+b.ent.c}keys.add(k)}
let nf=0;for(const b of built){const f=facts[b.ent.n+'|'+b.ent.c];if(f){b.ent.f=f;nf++}}
for(const b of built)out[b.r].push(b.ent);
for(const r of REG)fs.writeFileSync(`/Users/kelvin/flycorp/data/${r}.json`,JSON.stringify(out[r],null,1)+'\n');
// ---------- report ----------
fs.writeFileSync('skipped.json',JSON.stringify(skipped));
fs.writeFileSync('built.json',JSON.stringify(built.map(b=>({...b.ent,r:b.r,iso:b.iso,how:b.m&&b.m.how,k:b.m&&Math.round(b.m.k),area:Math.round(b.li.area),inside:b.li.inside}))));
console.log('badFacts',badFacts.join('; '));
console.log('existing',existing.length,'new',built.length,'facts',nf,'skipped',skipped.length,'no-ap existing',noAp.join(';'));
const byIso={};for(const b of built)byIso[b.iso]=(byIso[b.iso]||0)+1;console.log(JSON.stringify(Object.entries(byIso).sort((a,b)=>b[1]-a[1]).slice(0,30)));
const byR={};for(const r of REG)byR[r]=out[r].length;console.log(JSON.stringify(byR));
console.log('traits',JSON.stringify(built.reduce((m,b)=>(m[b.ent.t]=(m[b.ent.t]||0)+1,m),{})));
