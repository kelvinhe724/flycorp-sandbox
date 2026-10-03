// tiny CSV parser (quoted fields)
module.exports=function(txt){const rows=[];let row=[],f='',q=false;for(let i=0;i<txt.length;i++){const c=txt[i];
if(q){if(c=='"'){if(txt[i+1]=='"'){f+='"';i++}else q=false}else f+=c}
else if(c=='"')q=true;else if(c==','){row.push(f);f=''}else if(c=='\n'){row.push(f);rows.push(row);row=[];f=''}else if(c!='\r')f+=c}
if(f||row.length){row.push(f);rows.push(row)}const h=rows.shift();return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]])))}
