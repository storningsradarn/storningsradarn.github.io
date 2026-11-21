/* Public data boundary. No AI, credentials or connection to the collector. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports){module.exports=api;api.configure(require('../pages-repo/contract.json'));}else root.StorningsradarnData=api;})(typeof globalThis==='object'?globalThis:this,()=>{
'use strict';
let contract;
const kinds=new Set(['pilot','saved_test_data','validation']);
function configure(value){if(!value?.$defs||!value['x-source-registry'])throw Error('Datakontrakt saknas.');contract=value;return value;}
function fail(message){throw Error(message);}
function walk(s,v){
 if(s.$ref)return walk(contract.$defs[s.$ref.replace('#/$defs/','')],v);
 if(s.anyOf){for(const choice of s.anyOf){try{walk(choice,v);return;}catch{}}fail('Otillåtet datavärde.');}
 const actual=v===null?'null':Array.isArray(v)?'array':typeof v==='number'?(Number.isInteger(v)?'integer':'number'):typeof v;
 if(s.type&&!(Array.isArray(s.type)?s.type:[s.type]).includes(actual))fail('Fel datatyp.');
 if(Object.hasOwn(s,'const')&&v!==s.const)fail('Fel dataversion.');
 if(s.enum&&!s.enum.includes(v))fail('Otillåtet datavärde.');
 if(actual==='object'){
  if((s.required||[]).some(k=>!Object.hasOwn(v,k)))fail('Obligatorisk uppgift saknas.');
  const props=s.properties||{};
  if(s.additionalProperties===false&&Object.keys(v).some(k=>!Object.hasOwn(props,k)))fail('Okänt fält i offentlig data.');
  for(const k of Object.keys(v))if(Object.hasOwn(props,k))walk(props[k],v[k]);
 }
 if(actual==='array'){if(v.length>(s.maxItems??100000))fail('För många dataposter.');if(s.items)for(const x of v)walk(s.items,x);}
 if(actual==='string'){
  if([...v].length>(s.maxLength??100000))fail('För lång text.');
  if(s.pattern&&!new RegExp('^(?:'+s.pattern+')$','u').test(v))fail('Fel dataformat.');
  if(s.format==='date-time'&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)||!Number.isFinite(Date.parse(v))))fail('Ogiltig tidsstämpel.');
  if(s.format==='uri'&&!safeURL(v))fail('Otillåten källadress.');
 }
 if(['integer','number'].includes(actual)&&(!Number.isFinite(v)||v<(s.minimum??-Infinity)||v>(s.maximum??Infinity)))fail('Tal utanför tillåtet intervall.');
}
function safeURL(value){try{if(typeof value!=='string'||/[\u0000-\u0020\u007f\\]/.test(value))return false;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!!u.hostname;}catch{return false;}}
function sourceURL(sid,value){if(!safeURL(value))fail('Otillåten originaladress.');const u=new URL(value),s=contract['x-source-registry'][sid];if(!s||!s.hosts.includes(u.hostname))fail('Käll-ID och originaldomän stämmer inte.');if([...u.searchParams.keys()].some(k=>/token|password|secret|api.?key|signature|authorization/i.test(k)))fail('Hemlighetsliknande parameter i originaladress.');}
function exactSources(items){const ids=Object.keys(contract['x-source-registry']);if(items.length!==ids.length||new Set(items.map(s=>s.id)).size!==ids.length||items.some(s=>!ids.includes(s.id)))fail('Fel källurval.');}
function validateFeed(feed){
 walk(contract.$defs.feed,feed);exactSources(feed.sources);
 const seen=new Set();
 for(const s of feed.sources){sourceURL(s.id,s.url);if(s.name!==contract['x-source-registry'][s.id].name)fail('Fel källnamn.');}
 for(const r of feed.records){
  sourceURL(r.source_id,r.url);
  if(!r.id.startsWith(r.source_id+'|')||seen.has(r.id))fail('Fel eller dubblerat ärende-ID.');seen.add(r.id);
  if(r.source_name!==contract['x-source-registry'][r.source_id].name)fail('Fel källnamn.');
  if(!r.municipalities.length&&r.counties.length)fail('Län får inte gissas från källan.');
  if(r.municipalities.length&&!r.geography_evidence)fail('Platsbelägg saknas.');
  if(r.municipalities.some(m=>!contract['x-municipality-counties'][m])||r.counties.some(c=>!r.municipalities.some(m=>contract['x-municipality-counties'][m]===c)))fail('Kommun och län stämmer inte.');
  if(Date.parse(r.first_seen_at)>Date.parse(r.last_seen_at)||Date.parse(r.last_seen_at)>Date.parse(r.checked_at))fail('Ärendets tidsföljd stämmer inte.');
  if(r.presence==='missing'&&r.status!=='osäker')fail('Försvinnande är inte ett belagt avslut.');
 }
 if(feed.changes.some(c=>!seen.has(c.id)))fail('Ändring saknar ärende.');
 return feed;
}
function validateManifest(m){
 walk(contract.$defs.latest,m);exactSources(m.source_health);
 for(const ref of m.history){if(ref.path!=='data/snapshots/'+ref.sha256+'.json')fail('Otillåten filsökväg.');}
 if(m.snapshot){if(!m.history.length||JSON.stringify(m.history.at(-1))!==JSON.stringify(m.snapshot)||m.last_success_at!==m.snapshot.observed_at)fail('Senaste exporten stämmer inte.');}
 else if(m.last_success_at!==null||m.history.length)fail('Export saknas.');
 if(!kinds.has(m.dataset_kind))fail('Fel dataläge.');
 return m;
}
function staleness(m,now=Date.now()){const time=m.last_success_at?Date.parse(m.last_success_at):NaN;return {stale:!Number.isFinite(time)||now-time>m.stale_after_seconds*1000,future:Number.isFinite(time)&&time>now+300000,isTest:m.dataset_kind!=='pilot',ageSeconds:Number.isFinite(time)?Math.max(0,Math.floor((now-time)/1000)):null};}
function comparable(a,b){return !!a&&!!b&&a.method===b.method&&a.dataset_kind===b.dataset_kind&&a.sources.map(s=>s.id).sort().join()===b.sources.map(s=>s.id).sort().join();}
async function digest(bytes){if(globalThis.crypto?.subtle)return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');if(typeof require==='function')return require('node:crypto').createHash('sha256').update(bytes).digest('hex');fail('Webbläsaren kan inte verifiera exporten. Använd HTTPS eller läs in en lokal JSON-fil.');}
async function fetchFile(path){
 if(path!=='data/latest.json'&&!/^data\/snapshots\/[a-f0-9]{64}\.json$/.test(path))fail('Otillåten datafil.');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const response=await fetch(path,{cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});
  if(!response.ok)fail('Datafilen kunde inte hämtas.');
  if(Number(response.headers.get('content-length'))>8000000)fail('För stor datafil.');
  const reader=response.body.getReader();let total=0;const parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>8000000){await reader.cancel();fail('För stor datafil.');}parts.push(value);}
  const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
 }finally{clearTimeout(timer);}
}
function parse(bytes){return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
function createLoader({fetchFile:read=fetchFile,onData=()=>{},onError=()=>{}}={}){
 let last=null,busy=false;
 return {get current(){return last;},async refresh(){
  if(busy)return last;busy=true;
  try{
   const m=validateManifest(parse(await read('data/latest.json')));
   if(!m.snapshot){last={manifest:m,feed:null};onData(last);return last;}
   let feed;
   if(last?.manifest.snapshot?.sha256===m.snapshot.sha256)feed=last.feed;
   else {const bytes=await read(m.snapshot.path);if(bytes.length!==m.snapshot.bytes||await digest(bytes)!==m.snapshot.sha256)fail('Exportens kontrollsumma stämmer inte.');feed=validateFeed(parse(bytes));}
   if(feed.last_success_at!==m.last_success_at||feed.dataset_kind!==m.dataset_kind||feed.method!==m.snapshot.summary.method)fail('Export och innehåll stämmer inte.');
   if(last?.feed&&Date.parse(m.last_success_at)<Date.parse(last.feed.last_success_at))fail('Äldre data ersätter inte senare giltiga uppgifter.');
   last={manifest:m,feed};onData(last);return last;
  }catch(error){onError(error,last);return last;}finally{busy=false;}
 }};
}
function manual(feed){validateFeed(feed);const m={last_success_at:feed.last_success_at,last_attempt_at:feed.last_success_at,last_attempt_result:'success',stale_after_seconds:feed.stale_after_seconds,dataset_kind:feed.dataset_kind,source_health:feed.sources.map(s=>({id:s.id,state:s.state,last_success_at:s.last_success_at,checked_at:s.checked_at})),history:[]};return {manifest:m,feed,manual:true};}
return {configure,validateFeed,validateManifest,safeURL,staleness,comparable,createLoader,manual};
});
