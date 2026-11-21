
(()=>{'use strict';
let run={observed_at:new Date().toISOString()},records=[],sources={},runDay=run.observed_at.slice(0,10),runMs=Date.parse(run.observed_at);
const ICON={vatten_avlopp:'💧',avfall:'♻️',väg_trafik:'🚧',driftstörning:'⚠️'},CAT={vatten_avlopp:'Vatten och avlopp',avfall:'Avfall',väg_trafik:'Väg och trafik',driftstörning:'Övrig störning'},STATUS=['pågående','planerad','osäker','historisk','avslutad'],ACTIVE=new Set(['pågående','planerad','osäker']);
const KEY='storningsradarn-local-own-cards-v3', $=s=>document.querySelector(s), $all=s=>[...document.querySelectorAll(s)];
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=u=>{try{const v=new URL(u);return v.protocol==='https:'||v.protocol==='http:'?v.href:''}catch{return ''}};
const dateDisplay=s=>{if(!s)return 'Datum saknas';const d=new Date(s);return Number.isNaN(+d)?String(s):new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Stockholm'}).format(d)};
const seenDisplay=s=>{if(!s)return 'okänt';const d=new Date(s);return Number.isNaN(+d)?s:new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Stockholm'}).format(d)};
const read=(key,def)=>{try{return JSON.parse(localStorage.getItem(key))||def}catch{return def}},store=(key,data)=>{try{localStorage.setItem(key,JSON.stringify(data));return true}catch{return false}};
let own=read(KEY,[]),view='regions',selCounty='all',selCat='all',selStatus='all',selDate='all',query='',history=false,chosenMunicipality=null,zoom=1,paging=30;
function toast(s){let t=$('#toast');t.textContent=s;t.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>t.style.display='none',3000)}
// Källans län används som en separat, tydligt märkt sorteringshjälp när händelselän saknas.
// En källa kan publicera om andra platser. Tilldela ALDRIG händelsekommun eller kartposition på detta sätt.
const SOURCE_COUNTY_FALLBACK={K020:'Östergötlands län'};
function sourceCountyFallback(r){return !(r.counties||[]).length&&SOURCE_COUNTY_FALLBACK[r.source_id]||null}
function effectiveCounties(r){return r.counties?.length?r.counties:(sourceCountyFallback(r)?[sourceCountyFallback(r)]:[])}
function county(r){return effectiveCounties(r).length?effectiveCounties(r).join(', '):'Län okänt'}
function countyLabel(r){return county(r)+(sourceCountyFallback(r)?' (källans län – händelseplats ej verifierad)':'')}
function sourceCountyBadge(r){return sourceCountyFallback(r)?'<span class="source-county" title="Sorterat efter Mjölby kommuns län; händelsens kommun är fortfarande okänd">Län från källan</span>':''}
function municipality(r){return r.municipalities?.length?r.municipalities.join(', '):'Kommun okänd'}
function source(r){return sources[r.source_id]||r.source_id||'Okänd aktör'}
function publishedToday(r){return !!(r.published&&r.published.slice(0,10)===runDay)}
function visible(){const q=query.trim().toLocaleLowerCase('sv');return records.filter(r=>{
 if(!history&&!ACTIVE.has(r.status)&&!['historisk','avslutad'].includes(selStatus))return false;
 if(selCounty!=='all'&&(selCounty==='unknown'?effectiveCounties(r).length:!effectiveCounties(r).includes(selCounty)))return false;
 if(selCat!=='all'&&r.category!==selCat)return false;
 if(selStatus!=='all'&&r.status!==selStatus)return false;
 if(selDate==='day'&&!publishedToday(r))return false;
 if(selDate==='week'&&!(r.published&&new Date(r.published).getTime()>=runMs-7*86400e3&&new Date(r.published).getTime()<=runMs))return false;
 if(selDate==='missing'&&r.published)return false;
 if(q&&![r.title,r.locality,r.place,county(r),municipality(r),source(r)].join(' ').toLocaleLowerCase('sv').includes(q))return false;
 return true;}).sort((a,b)=>{if(publishedToday(a)!==publishedToday(b))return publishedToday(b)-publishedToday(a);if((a.published||'')!==(b.published||''))return (b.published||'').localeCompare(a.published||'');const ranks={pågående:0,osäker:1,planerad:2,historisk:3,avslutad:4};return (ranks[a.status]-ranks[b.status])||a.title.localeCompare(b.title,'sv')})}
function pill(r){return `<span class="pill ${h(r.status)}">${h(r.status[0].toUpperCase()+r.status.slice(1))}</span>`}
function recInline(r,mode='card'){let today=publishedToday(r),icon=ICON[r.category]||'📌',md=`${h(municipality(r))} · ${h(source(r))}`;
if(mode==='feed')return `<article class="feed-card ${today?'day':''}"><div class="feed-ico">${icon}</div><div class="feed-main"><div class="feed-title">${h(r.title)} ${r.geo_enrichment?'<span class="geo-mark" title="Ort/kommun kontrollerad och kompletterad via belagd ortregel">Plats kontrollerad</span>':''}${sourceCountyBadge(r)} ${today?'<span class="day-tag">Publicerad insamlingsdagen</span>':''}</div><div class="feed-meta">${md} · ${h(countyLabel(r))}</div></div><div class="feed-right"><span class="item-date">${h(dateDisplay(r.published))}</span>${pill(r)}<button class="tiny-btn" data-detail="${h(r.id)}">Visa ärende</button></div></article>`;
return `<article class="item ${h(r.status)} ${today?'day':''}"><div class="item-top"><span class="cat-icon">${icon}</span><div class="item-content"><div class="item-title">${h(r.title)} ${r.geo_enrichment?'<span class="geo-mark" title="Ort/kommun kontrollerad och kompletterad via belagd ortregel">Plats kontrollerad</span>':''}${sourceCountyBadge(r)} ${today?'<span class="day-tag">Publicerad insamlingsdagen</span>':''}</div><div class="item-meta">${h(municipality(r))} · ${h(source(r))}</div></div></div><div class="item-bottom"><div>${pill(r)} <span class="item-date">${h(dateDisplay(r.published))}</span></div><button class="tiny-btn" data-detail="${h(r.id)}">Läs mer</button></div></article>`}
function changeView(next){view=next;$all('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===next);b.setAttribute('aria-pressed',String(b.dataset.view===next))});$('#filtersArea').style.display=['own','control'].includes(next)?'none':'';$('#heading').style.display=next==='own'?'none':'';render()}
function render(){if(view!=='map'&&liveMap)disposeMap();if(view==='own'){renderOwn();return}if(view==='control'){renderControl();return}let arr=visible();$('#count').textContent=`${arr.length} ärenden`;
if(view==='regions'){ $('#headingText').textContent='Händelser per län';const by={};for(const r of arr){let c=county(r);(by[c]??=[]).push(r)}let keys=Object.keys(by).sort((a,b)=>a==='Län okänt'?1:b==='Län okänt'?-1:by[b].length-by[a].length);$('#main').innerHTML=keys.length?`<div class="grid">${keys.map(c=>{let g=by[c], n=6;return `<section class="county"><div class="county-head"><div><h2>${h(c)}</h2><small>${g.length} ärenden i urvalet</small></div></div><div class="county-list">${g.slice(0,n).map(r=>recInline(r)).join('')}</div>${g.length>n?`<button class="county-more" data-county="${h(c)}">Visa alla ${g.length} i ${h(c)} →</button>`:''}</section>`}).join('')}</div>`:'<div class="empty">Inga ärenden motsvarar filtren.</div>';
} else if(view==='feed'){$('#headingText').textContent='Händelser';let page=arr.slice(0,paging);$('#main').innerHTML=page.length?`<div class="feed">${page.map(r=>recInline(r,'feed')).join('')}</div>${arr.length>paging?`<div style="text-align:center;margin:18px"><button class="btn" id="more">Visa fler (${arr.length-paging} återstår)</button></div>`:''}`:'<div class="empty">Inga ärenden motsvarar filtren.</div>';
} else if(view==='map'){$('#headingText').textContent='Karta – kommuner med styrkt koppling';renderMap(arr)} }
function openDetail(id){const r=records.find(x=>x.id===id);if(!r)return;const evidence=[`Statusbelägg: ${r.status_evidence||'Saknas'}`,r.geo_enrichment?`Geografisk komplettering med separat belägg: ${r.geo_enrichment.evidence}`:'',sourceCountyFallback(r)?'Visningstillägg: Ärendet sorteras under Östergötlands län eftersom källan är Mjölby kommun. Det är INTE bevis för händelsens kommun eller exakta plats. Kommun och kartpunkt är fortfarande okända.':'' ,`Geografiskt belägg i exporten: ${r.geography_evidence||r.county_evidence||'Uppgift om kommun saknades'}`,`Osäkerheter i exporten: ${(r.uncertainties||[]).join(' · ')||'Inga särskilt noterade'}`].join('\n\n');$('#modalBadge').className='pill '+r.status;$('#modalBadge').textContent=r.status;$('#modalTitle').textContent=r.title;$('#modalBody').innerHTML=`<div class="detail-grid"><div class="detail-cell">Kommun<b>${h(municipality(r))}</b></div><div class="detail-cell">Län i filtret<b>${h(countyLabel(r))}</b></div><div class="detail-cell">Källa<b>${h(source(r))}</b></div><div class="detail-cell">Publicerat<b>${h(dateDisplay(r.published))}</b></div><div class="detail-cell">Kategori<b>${h(CAT[r.category]||r.category)}</b></div><div class="detail-cell">Senast kontrollerad<b>${h(seenDisplay(r.checked_at))}</b></div></div><div class="evidence">${h(evidence)}</div>${url(r.url)?`<a class="btn blue" href="${h(url(r.url))}" target="_blank" rel="noopener noreferrer" style="display:inline-block">Öppna originalmeddelandet ↗</a>`:''}`;$('#modalBack').classList.add('open')}
function closeModal(){$('#modalBack').classList.remove('open')}
const anchors={"Malmö":[55.605,13.004],"Lund":[55.705,13.192],"Eslöv":[55.839,13.303],"Vallentuna":[59.535,18.077],"Ekerö":[59.291,17.810],"Burlöv":[55.641,13.076],"Österåker":[59.484,18.300],"Svedala":[55.507,13.235],"Lomma":[55.672,13.068],"Umeå":[63.8258,20.263],"Kristianstad":[56.0294,14.1567],"Vaxholm":[59.401,18.352],"Mjölby":[58.326,15.128]};
let liveMap=null,mapMarkers=[],mapSerial=0,mapLoadPromise=null;
function disposeMap(){mapSerial++;if(liveMap){try{liveMap.remove()}catch(e){}liveMap=null}mapMarkers=[]}
function loadMapLibre(){if(window.maplibregl)return Promise.resolve();if(mapLoadPromise)return mapLoadPromise;
 mapLoadPromise=new Promise((resolve,reject)=>{
   if(!document.querySelector('link[data-maplibre]')){let l=document.createElement('link');l.rel='stylesheet';l.dataset.maplibre='1';l.href='https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';document.head.appendChild(l)}
   const hosts=['https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js','https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'];let host=0;
   function next(){if(host>=hosts.length){reject(new Error('Kartbiblioteket gick inte att hämta. Kontrollera internet eller nätverkets spärrar.'));return}let s=document.createElement('script');s.src=hosts[host++];s.async=true;s.onload=()=>window.maplibregl?resolve():next();s.onerror=()=>{s.remove();next()};document.head.appendChild(s)}next();
 });return mapLoadPromise.catch(e=>{mapLoadPromise=null;throw e})}
function showMapError(message){let e=$('#mapNotice');if(e){e.hidden=false;e.textContent=message}}
function renderMap(arr){disposeMap();const serial=mapSerial;
 const groups={};for(const r of arr)for(const m of r.municipalities||[]){if(!anchors[m])continue;(groups[m]??=[]).push(r)}
 const mNames=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length);
 if(!chosenMunicipality||!groups[chosenMunicipality])chosenMunicipality=mNames[0]||null;
 const unplaced=arr.filter(r=>!r.municipalities?.some(m=>anchors[m]));
 $('#main').innerHTML=`<div class="soft-note"><b>Interaktiv karta med riktiga vägar och ortnamn.</b> Bakgrund: OpenFreeMap/OpenStreetMap (kräver internet). Markörer anger <b>ungefärliga kommuncentrum</b>, inte den exakta platsen för händelsen. <b>${unplaced.length}</b> ärenden i detta urval saknar styrkt kommun eller kartpunkt och visas i länskort och händelselista.</div><div class="map-layout"><section class="map-panel"><div class="real-map-shell"><div id="realMap" role="region" aria-label="Interaktiv karta över Sverige och kommunernas ärenden"></div><div id="mapNotice" class="map-status-overlay">Karttjänsten laddas. Kartan behöver en internetanslutning.</div></div><div class="map-legend">Kartdata © OpenStreetMap-bidragsgivare / OpenFreeMap. Siffran i markören är antal ärenden för kommunen. Ingen exakt händelseposition används.</div></section><aside class="map-info" id="geoAside"></aside></div>`;
 function updateAside(){const selected=groups[chosenMunicipality]||[];let aside=$('#geoAside');if(!aside)return;
  aside.innerHTML=`<h2>${chosenMunicipality?h(chosenMunicipality)+' kommun':'Välj en kommun'}</h2><p class="summary-label">${selected.length} meddelanden i aktuellt urval. Kompletteringar från rubrik eller ortregister är markerade i ärendedetaljerna.</p>${selected.length?selected.slice(0,12).map(r=>recInline(r,'feed')).join(''):'<div class="empty">Välj en markör på kartan.</div>'}${selected.length>12?`<p class="summary-label">${selected.length-12} fler finns i länskorten eller händelseflödet.</p>`:''}`;
  for(let {element,municipality} of mapMarkers)element.classList.toggle('selected',municipality===chosenMunicipality);
 }
 updateAside();
 if(!mNames.length){showMapError('Inga meddelanden i detta urval har en kontrollerad kommunkoppling. Filtrera annorlunda för att se markörer.');return}
 loadMapLibre().then(()=>{
   if(serial!==mapSerial||view!=='map'||!$('#realMap'))return;
   if(typeof maplibregl.supported==='function'&&!maplibregl.supported()){showMapError('Den här webbläsaren kan inte rita kartan med WebGL. Prova Chrome eller Edge, eller använd länskorten.');return}
   const map=new maplibregl.Map({container:'realMap',style:'https://tiles.openfreemap.org/styles/liberty',center:[15.8,62.25],zoom:4.3,minZoom:3.1,maxZoom:15,attributionControl:true});liveMap=map;
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');
   let errored=false;
   map.on('error',e=>{if(!errored){errored=true;showMapError('Kartbilderna kunde inte laddas från OpenFreeMap. Kontrollera internetanslutningen eller om nätverket blockerar externa karttjänster. Listor och länskort fungerar ändå.')}});
   map.on('load',()=>{if(serial!==mapSerial)return;let e=$('#mapNotice');if(e)e.hidden=true});
   for(const m of mNames){const [lat,lon]=anchors[m];const el=document.createElement('button');el.type='button';el.className='county-map-pin';el.textContent=String(groups[m].length);el.title=`${m}: ${groups[m].length} ärenden (ungefärligt kommuncentrum)`;el.setAttribute('aria-label',el.title);
      el.addEventListener('click',()=>{chosenMunicipality=m;updateAside();map.flyTo({center:[lon,lat],zoom:Math.max(7,map.getZoom()),essential:true})});
      new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([lon,lat]).addTo(map);mapMarkers.push({element:el,municipality:m});
   }
   updateAside();
 }).catch(e=>{if(serial===mapSerial)showMapError(String(e.message||e))});
}
function renderOwn(){ $('#main').innerHTML=`<div class="soft-note"><b>Egna ärenden stannar på din dator.</b> De skickas inte till Hermes, VPS, GitHub eller någon kommun. De blandas inte heller med insamlarens verifierade meddelanden. Exportera en kopia om du vill spara eller flytta dem.</div><div class="own-panel"><section class="form-panel"><h2>＋ Lägg till eget ärende</h2><p>För något du vill bevaka själv men som inte finns i Störningsradarns insamling.</p><form id="ownForm" class="form-grid"><label>Rubrik *<input id="ownTitle" required maxlength="200" placeholder="Vad har hänt?"></label><label>Kommun eller plats<input id="ownPlace" maxlength="100" placeholder="Exempelvis Mjölby"></label><label>Kategori<select id="ownCat">${Object.entries(CAT).map(([k,v])=>`<option value="${h(k)}">${h(v)}</option>`).join('')}</select></label><label>Länk till information (valfritt)<input id="ownUrl" type="url" placeholder="https://..."></label><label>Egna anteckningar<textarea id="ownNote" rows="4" maxlength="4000" placeholder="Vad vill du följa upp?"></textarea></label><button class="btn blue" type="submit">Spara på min dator</button></form></section><section class="own-list"><h2>Mina sparade ärenden <span class="count">${own.length}</span></h2><p>Endast dina egna noteringar. De är inte en del av insamlarens data.</p>${own.length?own.slice().sort((a,b)=>b.created.localeCompare(a.created)).map(x=>`<article class="own-entry"><strong>${h(x.title)}</strong> <span class="pill egen">Egen notering</span><div class="feed-meta">${h(x.place||'Plats ej angiven')} · ${h(CAT[x.cat]||'Övrigt')} · ${h(dateDisplay(x.created))}</div>${x.note?`<p style="white-space:pre-wrap;color:#526b83;margin:9px 0">${h(x.note)}</p>`:''}<div class="own-actions">${url(x.url)?`<a href="${h(url(x.url))}" target="_blank" rel="noopener noreferrer" class="tiny-btn">Öppna länk ↗</a>`:''}<button class="tiny-btn" data-delete="${h(x.id)}">Ta bort</button></div></article>`).join(''):'<div class="empty">Du har inte lagt till några egna ärenden.</div>'}<div class="own-actions" style="margin-top:15px"><button class="btn" id="exportOwn">⬇ Spara kopia (JSON)</button><button class="btn" id="importOwn">⬆ Läs in sparad kopia</button></div></section></div>`;$('#ownCount').textContent=own.length?'('+own.length+')':'';}
function download(){const blob=new Blob([JSON.stringify({schema:'storningsradarn.egna-arenden.v1',saved_at:new Date().toISOString(),items:own},null,2)],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='mina-storningsarenden.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2500)}
function init(){const allCounties=[...new Set(records.flatMap(r=>effectiveCounties(r)))].sort((a,b)=>a.localeCompare(b,'sv'));$('#county').innerHTML=[['all','Alla län'],...allCounties.map(c=>[c,c]),['unknown','Län okänt']].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');$('#category').innerHTML=[['all','Alla kategorier'],...Object.entries(CAT)].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');$('#status').innerHTML=[['all','Alla statusar'],...STATUS.map(v=>[v,v[0].toUpperCase()+v.slice(1)])].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');$('#observed').textContent=seenDisplay(run.observed_at);$('#ownCount').textContent=own.length?'('+own.length+')':'';
$all('[data-view]').forEach(b=>b.addEventListener('click',()=>changeView(b.dataset.view)));$('#search').addEventListener('input',e=>{query=e.target.value;paging=30;render()});for(const [id,fn] of [['county',v=>selCounty=v],['category',v=>selCat=v],['status',v=>{selStatus=v;if(['historisk','avslutad'].includes(v)){$('#history').checked=true;history=true}}],['date',v=>selDate=v]])$( '#'+id ).addEventListener('change',e=>{fn(e.target.value);paging=30;render()});$('#history').addEventListener('change',e=>{history=e.target.checked;render()});$('#clear').addEventListener('click',()=>{query='';selCounty='all';selCat='all';selStatus='all';selDate='all';history=false;paging=30;$('#search').value='';['county','category','status','date'].forEach(id=>$('#'+id).value='all');$('#history').checked=false;render()});$('#closeModal').addEventListener('click',closeModal);$('#modalBack').addEventListener('click',e=>{if(e.target.id==='modalBack')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
$('#main').addEventListener('click',e=>{let t=e.target.closest('[data-detail],[data-county],[data-map-muni],[data-delete],#more,#zoomIn,#zoomOut,#zoomReset,#exportOwn,#importOwn');if(!t)return;
if(t.dataset.detail)openDetail(t.dataset.detail);else if(t.dataset.county){selCounty=t.dataset.county;$('#county').value=selCounty;changeView('feed')}else if(t.id==='more'){paging+=30;render()}else if(t.dataset.delete){own=own.filter(x=>x.id!==t.dataset.delete);store(KEY,own);renderOwn();toast('Eget ärende borttaget')}else if(t.id==='exportOwn')download();else if(t.id==='importOwn')$('#fileImport').click();});
$('#main').addEventListener('submit',e=>{if(e.target.id!=='ownForm')return;e.preventDefault();const title=$('#ownTitle').value.trim(),place=$('#ownPlace').value.trim(),note=$('#ownNote').value.trim(),urlText=$('#ownUrl').value.trim();if(!title)return;if(urlText&&!url(urlText)){toast('Länken måste börja med https:// eller http://');return}own.push({id:'egen-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),title,place,note,url:urlText,cat:$('#ownCat').value,created:new Date().toISOString()});if(!store(KEY,own))toast('Webbläsaren kan inte lagra lokalt – exportera en kopia.');else toast('Eget ärende sparat på datorn');renderOwn()});
$('#fileImport').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;try{let d=JSON.parse(await f.text());if(d.schema!=='storningsradarn.egna-arenden.v1'||!Array.isArray(d.items)||d.items.length>1000)throw Error('Fel filformat');const existing=new Map(own.map(x=>[x.id,x]));for(const x of d.items){if(!x||typeof x.title!=='string'||typeof x.id!=='string')continue;existing.set(x.id,{id:x.id.slice(0,100),title:x.title.slice(0,200),place:String(x.place||'').slice(0,100),note:String(x.note||'').slice(0,4000),url:url(String(x.url||'')),cat:CAT[x.cat]?x.cat:'driftstörning',created:String(x.created||new Date().toISOString())})}own=[...existing.values()];store(KEY,own);toast('Egna ärenden inlästa');renderOwn()}catch(err){toast('Filen kunde inte läsas: '+err.message)}finally{e.target.value=''}});
render();}
/* Added around the approved interface; no editorial redesign. */
let currentBundle=null,loadError='',loader=null;
const C=window.StorningsradarnData;
C.configure(JSON.parse(document.getElementById('public-contract').textContent));
function dataStatus(){
 const m=currentBundle?.manifest,flags=m?C.staleness(m):null;
 const local=currentBundle?.manual?' · lokalt inläst fil':'';
 const badge=document.querySelector('.sample'),notice=document.querySelector('.notice');
 badge.textContent=!m?'INGA DATA INLÄSTA':m.dataset_kind==='saved_test_data'?'● SPARADE TESTDATA · INTE LIVE':m.dataset_kind==='validation'?'● VALIDERING · INTE PILOT':'● PILOTDATA';
 const mode=m?.dataset_kind==='saved_test_data'?'Sparade testdata – inte aktuellt driftläge. ':m?.dataset_kind==='validation'?'Manuell validering – inte startad pilot. ':'';
 const age=flags?.future?'Tidsstämpeln ligger i framtiden. ':flags?.stale?'Informationen är föråldrad. ':'';
 const health=m?.last_attempt_result==='failed'?'Senaste insamlingen misslyckades eller var ofullständig. Tidigare giltiga uppgifter ligger kvar. ':'';
 notice.textContent=mode+age+health+(loadError?'Uppdateringen kunde inte läsas. Tidigare giltiga uppgifter ligger kvar. ':m?'Status är regelbaserad. Kontrollera originalkällan.':'Läser publicerade data …')+local;
 notice.dataset.stale=String(!!flags?.stale);notice.dataset.error=String(!!loadError||m?.last_attempt_result==='failed');
 $('#observed').textContent=m?.last_success_at?seenDisplay(m.last_success_at):'Ingen lyckad hämtning';
 $('#dataState').textContent=loadError?'Läsfel':m?.last_attempt_result==='failed'?'Insamlingsfel':!m?'Läser data':currentBundle.manual?'Lokal fil':flags?.stale?'Föråldrad information':'Uppdaterad';
}
function applyBundle(bundle){
 currentBundle=bundle;loadError='';
 if(bundle.feed){
  const f=bundle.feed;run={...f,observed_at:f.last_success_at};records=f.records;sources=Object.fromEntries(f.sources.map(s=>[s.id,s.name]));runDay=run.observed_at.slice(0,10);runMs=Date.parse(run.observed_at);
  const counties=[...new Set(records.flatMap(r=>effectiveCounties(r)))].sort((a,b)=>a.localeCompare(b,'sv'));
  $('#county').innerHTML=[['all','Alla län'],...counties.map(c=>[c,c]),['unknown','Län okänt']].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');
  if(selCounty!=='all'&&selCounty!=='unknown'&&!counties.includes(selCounty))selCounty='all';$('#county').value=selCounty;
  $('#date').querySelector('option[value="day"]').textContent='Insamlingsdagen '+dateDisplay(run.observed_at);
 }else{records=[];sources={};$('#county').innerHTML='<option value="all">Alla län</option><option value="unknown">Län okänt</option>';selCounty='all';}
 dataStatus();render();
}
function renderControl(){
 const m=currentBundle?.manifest,f=currentBundle?.feed;
 $('#headingText').textContent='Insamlingskontroll';$('#count').textContent=f?`${f.records.length} sparade ärenden`:'';
 if(!m){$('#main').innerHTML='<div class="empty">Inga validerade data har lästs in. Använd Uppdatera eller Läs in JSON.</div>';return;}
 const changes=f?.changes||[],changeLabels={new:'Nya',updated:'Ändrade',closed:'Belagt avslutade',closed_by_text:'Avslut enligt källtext',missing_not_closed:'Försvunna – inte belagt avslutade',quality_change:'Ändrad kvalitetsbedömning',uncertain_change:'Osäker ändring'};
 const rows=m.source_health.map(s=>{const source=f?.sources.find(x=>x.id===s.id),counts=source?.counts||{},label={complete:'Komplett',incomplete:'OFULLSTÄNDIG',failed:'MISSLYCKAD'}[s.state];return `<article class="county"><div class="county-head"><h2>${h(source?.name||CRegistryName(s.id))}</h2></div><div style="padding:16px"><b>${h(label)}</b><p>Senaste lyckade hämtning: ${h(seenDisplay(s.last_success_at))}</p><p>Senaste försök: ${h(seenDisplay(s.checked_at))}</p><p>Godkända: ${counts.accepted??'uppgift saknas'} · Hämtade kandidater: ${counts.fetched_candidates??'uppgift saknas'} · Regelverifierade: ${counts.rule_verified??'uppgift saknas'} · Osäker status: ${counts.uncertain_status??'uppgift saknas'} · Bortfiltrerade: ${counts.filtered??'uppgift saknas'}</p><small>Antalen avser senaste fullständigt godkända exporten, inte ett misslyckat försök.</small></div></article>`;}).join('');
 const changeText=Object.entries(changeLabels).map(([k,l])=>`${h(l)}: ${changes.filter(c=>c.change===k).length}`).join(' · ');
 $('#main').innerHTML=`<div class="soft-note"><b>${f?.baseline?'Förstainventering – ingen jämförbar tidigare körning.':'Ändringar sedan föregående jämförbara körning.'}</b><p>${changeText}</p><p>Ett försvinnande betyder inte att störningen är avslutad. Olika metodversioner jämförs inte.</p><p>Senaste insamlingsförsök: ${h(seenDisplay(m.last_attempt_at))}. Resultat: ${m.last_attempt_result==='success'?'godkänt':'misslyckat eller ofullständigt'}. ${loadError?'Webbläsaren kunde inte läsa den senaste uppdateringen.':''}</p></div><div class="grid">${rows}</div>`;
}
function CRegistryName(id){return JSON.parse($('#public-contract').textContent)['x-source-registry'][id]?.name||id;}
function initLive(){
 $('#refreshData').addEventListener('click',()=>loader?.refresh());
 $('#loadData').addEventListener('click',()=>$('#dataImport').click());
 $('#dataImport').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>8000000)throw Error('För stor fil.');const bundle=C.manual(JSON.parse(await file.text()));applyBundle(bundle);toast('Validerad JSON lästes in lokalt.');}catch(err){toast('Filen avvisades. Tidigare uppgifter behålls.');}finally{e.target.value='';}});
 if(location.protocol==='file:'){loadError='Lokal filöppning';dataStatus();document.querySelector('.notice').textContent='Lokal filöppning: klicka på Läs in JSON och välj Sparade-testdata.json. Webbplatsens automatiska uppdatering används när sidan serveras via HTTP eller HTTPS. Mina ärenden fungerar lokalt.';return;}
 loader=C.createLoader({onData:applyBundle,onError(error){loadError=error.message;dataStatus();if(view==='control')renderControl();}});
 loader.refresh();setInterval(()=>{if(!document.hidden&&!currentBundle?.manual)loader.refresh();dataStatus();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!currentBundle?.manual)loader.refresh();});
}

init();initLive();
})();
