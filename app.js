/* Shared selection/time model for the supplied v3.1 map and lists. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StorningsradarnUI=api;})(globalThis,()=>{
'use strict';
const precise=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(s)&&Number.isFinite(Date.parse(s));
function dateOnly(s){return typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;}
function stockholmDay(v){if(v===null||v===undefined||v==='')return '';if(dateOnly(v))return v;const d=new Date(v);if(!Number.isFinite(+d))return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Stockholm',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);}
function eventTime(r,precision='any'){
 if(precise(r.published))return {ms:Date.parse(r.published),basis:'published',precise:true};
 if(precision!=='hour'&&dateOnly(r.published))return {ms:Date.parse(r.published),basis:'published',precise:false};
 return precise(r.first_seen_at)?{ms:Date.parse(r.first_seen_at),basis:'first_seen',precise:true}:null;
}
function matchesPeriod(r,period='all',now=Date.now()){
 if(period==='all')return true;
 if(period==='missing')return !r.published;
 const info=eventTime(r,['1h','3h','24h'].includes(period)?'hour':'any');
 if(!info||(info.precise&&info.ms>now))return false;
 if(period==='today'||period==='day')return stockholmDay(info.ms)===stockholmDay(now);
 const limit={'1h':3600000,'3h':10800000,'24h':86400000,week:7*86400000}[period];
 return limit!==undefined&&now-info.ms<=limit;
}
function tone(r,now=Date.now()){
 const info=eventTime(r,'hour');if(!info||info.ms>now)return 0;
 if(!info.precise)return stockholmDay(info.ms)===stockholmDay(now)?2:0;
 const age=(now-info.ms)/3600000;return age<=3?3:age<=12?2:age<=24?1:0;
}
function mapState(rows,anchors,selectedCounty='all',municipalityCounties={}){
 const groups={},placed=[],unplaced=[],seen=new Set();
 for(const r of rows){if(seen.has(r.id))continue;seen.add(r.id);
  const safe=!!r.geography_evidence&&!r.geography_conflict;
  const municipality=safe?(r.municipalities||[]).find(m=>Object.hasOwn(anchors,m)&&(['all','unknown'].includes(selectedCounty)||municipalityCounties[m]===selectedCounty)):null;
  if(municipality){(groups[municipality]??=[]).push(r);placed.push(r);}else unplaced.push(r);
 }
 const names=Object.keys(groups).sort((a,b)=>groups[b].length-groups[a].length||a.localeCompare(b,'sv'));
 return {groups,names,placed,unplaced};
}
return {precise,dateOnly,stockholmDay,eventTime,matchesPeriod,tone,mapState};
});


(()=>{'use strict';
const M=window.StorningsradarnUI;
let run={observed_at:new Date().toISOString()},records=[],sources={},runDay=run.observed_at.slice(0,10),runMs=Date.parse(run.observed_at);
const ICON={vatten_avlopp:'💧',avfall:'♻️',väg_trafik:'🚧',driftstörning:'⚠️'},CAT={vatten_avlopp:'Vatten och avlopp',avfall:'Avfall',väg_trafik:'Väg och trafik',driftstörning:'Övrig störning'},STATUS=['pågående','planerad','osäker','historisk','avslutad'],ACTIVE=new Set(['pågående','planerad','osäker']);
const KEY='storningsradarn-local-own-cards-v3', $=s=>document.querySelector(s), $all=s=>[...document.querySelectorAll(s)];
const h=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url=u=>{try{const v=new URL(u);return v.protocol==='https:'||v.protocol==='http:'?v.href:''}catch{return ''}};
const dateDisplay=s=>{if(!s)return 'Datum saknas';const d=new Date(s);return Number.isNaN(+d)?String(s):new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short',year:'numeric',timeZone:'Europe/Stockholm'}).format(d)};
const seenDisplay=s=>{if(!s)return 'okänt';const d=new Date(s);return Number.isNaN(+d)?s:new Intl.DateTimeFormat('sv-SE',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Stockholm'}).format(d)};
const read=(key,def)=>{try{return JSON.parse(localStorage.getItem(key))||def}catch{return def}},store=(key,data)=>{try{localStorage.setItem(key,JSON.stringify(data));return true}catch{return false}};
let own=read(KEY,[]),view='regions',selCounty='all',selCat='all',selStatus='all',selDate='all',query='',history=false,chosenMunicipality=null,zoom=1,paging=30;
let newOnly=false,newSinceIds=new Set(),hasComparison=false;
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

// Källa och insamlare använder olika tidpunkter: blanda aldrig ihop dem i gränssnittet.
const hasClock=M.precise;
const validMs=s=>{const n=s?Date.parse(s):NaN;return Number.isFinite(n)?n:null};
const stockholmDay=M.stockholmDay;
function publishLabel(r){return r.published?`Publicerad: ${dateDisplay(r.published)}${hasClock(r.published)?' '+new Intl.DateTimeFormat('sv-SE',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Stockholm'}).format(new Date(r.published)):''}`:'Publiceringsdatum ej hämtat från källan'}
const eventTime=M.eventTime;
const recentTone=M.tone;
function freshnessTag(r){const level=recentTone(r);if(!level)return '';const info=eventTime(r,'hour'),basis=info?.basis==='published'?'Publicerad':'Upptäckt';const label=info?.basis==='published'&&!info.precise?'Publicerad idag':level===3?`${basis} senaste 3 h`:level===2?`${basis} senaste 12 h`:`${basis} senaste dygnet`;return `<span class="fresh-tag ${level===3?'':level===2?'soft':'light'}">${label}</span>`}
let mapPeriod='all',mapCategory='all',mapListLimit=16;
function filterMapRecords(rows){return rows.filter(r=>(mapCategory==='all'||r.category===mapCategory)&&M.matchesPeriod(r,mapPeriod));}
function publishedToday(r){return !!(r.published&&r.published.slice(0,10)===runDay)}
function visible(){const q=query.trim().toLocaleLowerCase('sv');return records.filter(r=>{
 if(newOnly&&!newSinceIds.has(r.id))return false;
 // Nya vid senaste hämtningen ska inte döljas för att källan redan angett avslutad status.
 if(!newOnly&&!history&&!ACTIVE.has(r.status)&&!['historisk','avslutad'].includes(selStatus))return false;
 if(selCounty!=='all'&&(selCounty==='unknown'?effectiveCounties(r).length:!effectiveCounties(r).includes(selCounty)))return false;
 if(selCat!=='all'&&r.category!==selCat)return false;
 if(selStatus!=='all'&&r.status!==selStatus)return false;
 if(selDate==='published_day'&&(!r.published||M.stockholmDay(r.published)!==M.stockholmDay(Date.now())))return false;
 if(selDate==='discovered_day'&&(!r.first_seen_at||M.stockholmDay(r.first_seen_at)!==M.stockholmDay(Date.now())))return false;
 if(!['all','published_day','discovered_day'].includes(selDate)&&!M.matchesPeriod(r,selDate))return false;
 if(q&&![r.title,r.locality,r.place,county(r),municipality(r),source(r)].join(' ').toLocaleLowerCase('sv').includes(q))return false;
 return true;}).sort((a,b)=>{
   const aTime=eventTime(a)?.ms||0,bTime=eventTime(b)?.ms||0;
   if(aTime!==bTime)return bTime-aTime;
   const ranks={pågående:0,osäker:1,planerad:2,historisk:3,avslutad:4};
   return (ranks[a.status]-ranks[b.status])||a.title.localeCompare(b.title,'sv');
 });}
function pill(r){return `<span class="pill ${h(r.status)}">${h(r.status[0].toUpperCase()+r.status.slice(1))}</span>`}
function recInline(r,mode='card'){
 const icon=ICON[r.category]||'📌',md=`${h(municipality(r))} · ${h(source(r))}`,tone=recentTone(r),fresh=freshnessTag(r),cls=tone?`fresh-${tone}`:'',published=h(publishLabel(r));
 const conflict=r.status_conflict?'<span class="source-county">Motstridiga uppgifter</span>':'';
 const geo=r.geo_enrichment?'<span class="geo-mark" title="Ort/kommun kontrollerad och kompletterad via belagd ortregel">Plats kontrollerad</span>':'';
 if(mode==='feed')return `<article class="feed-card ${cls}" data-incident="${h(r.id)}"><div class="feed-ico">${icon}</div><div class="feed-main"><div class="feed-title">${h(r.title)} ${geo}${conflict}${sourceCountyBadge(r)} ${fresh}</div><div class="feed-meta">${md} · ${h(countyLabel(r))}${eventTime(r,'hour')?.basis==='first_seen'?` · Upptäckt: ${h(seenDisplay(r.first_seen_at))}`:''}</div></div><div class="feed-right"><span class="item-date">${published}</span>${pill(r)}<button class="tiny-btn" data-detail="${h(r.id)}">Visa ärende</button></div></article>`;
 return `<article class="item ${h(r.status)} ${cls}" data-incident="${h(r.id)}"><div class="item-top"><span class="cat-icon">${icon}</span><div class="item-content"><div class="item-title">${h(r.title)} ${geo}${conflict}${sourceCountyBadge(r)} ${eventTime(r,'hour')?.basis==='published'?fresh:''}</div><div class="item-meta">${md}</div></div></div><div class="item-bottom"><div>${pill(r)} <span class="item-date">${published}</span></div><button class="tiny-btn" data-detail="${h(r.id)}">Läs mer</button></div></article>`;
}
function renderNewSinceFilter(){
 const btn=$('#newSinceLast'),count=$('#newSinceCount'),note=$('#newSinceNote');
 if(!btn||!count||!note)return;
 btn.disabled=!hasComparison;
 btn.setAttribute('aria-pressed',String(newOnly));
 const validCount=[...newSinceIds].filter(id=>records.some(r=>r.id===id)).length;
 count.textContent=hasComparison?String(validCount):'–';
 btn.title=!hasComparison?'Första insamlingen har ingen tidigare jämförelse':`Hittade ${validCount} nya ärenden vid senaste insamlingen`;
 note.textContent=!hasComparison?'Det finns ännu ingen jämförbar föregående hämtning.':newOnly?`Visar nya ärenden sedan föregående hämtning (${validCount} totalt). Övriga filter gäller också.`:'Nya är ärenden som upptäckts först vid senaste insamlingen – inte alla som kontrollerats igen.';
}
function changeView(next){if(next==='map'&&view!=='map')chosenMunicipality=null;view=next;$all('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===next);b.setAttribute('aria-pressed',String(b.dataset.view===next))});$('#filtersArea').style.display=['own','control'].includes(next)?'none':'';$('#heading').style.display=next==='own'?'none':'';render()}
function render(){renderNewSinceFilter();if(view!=='map'&&liveMap)disposeMap();if(['own','control'].includes(view)&&$('#freshnessGuide'))$('#freshnessGuide').hidden=true;if(view==='own'){renderOwn();return}if(view==='control'){renderControl();return}let arr=visible();const fg=$('#freshnessGuide');if(fg)fg.hidden=!['regions','feed'].includes(view);$('#count').textContent=`${arr.length} ärenden`;
if(view==='regions'){ $('#headingText').textContent='Händelser per län';const by={};for(const r of arr){let c=county(r);(by[c]??=[]).push(r)}let keys=Object.keys(by).sort((a,b)=>a==='Län okänt'?1:b==='Län okänt'?-1:by[b].length-by[a].length);$('#main').innerHTML=keys.length?`<div class="grid">${keys.map(c=>{let g=by[c], n=6;return `<section class="county"><div class="county-head"><div><h2>${h(c)}</h2><small>${g.length} ärenden i urvalet</small></div></div><div class="county-list">${g.slice(0,n).map(r=>recInline(r)).join('')}</div>${g.length>n?`<button class="county-more" data-county="${h(c)}">Visa alla ${g.length} i ${h(c)} →</button>`:''}</section>`}).join('')}</div>`:'<div class="empty">Inga ärenden motsvarar filtren.</div>';
} else if(view==='feed'){$('#headingText').textContent='Händelser';let page=arr.slice(0,paging);$('#main').innerHTML=page.length?`<div class="feed">${page.map(r=>recInline(r,'feed')).join('')}</div>${arr.length>paging?`<div style="text-align:center;margin:18px"><button class="btn" id="more">Visa fler (${arr.length-paging} återstår)</button></div>`:''}`:'<div class="empty">Inga ärenden motsvarar filtren.</div>';
} else if(view==='map'){$('#headingText').textContent='Karta – filtrerade ärenden';renderMap(arr)} }
function openDetail(id){const r=records.find(x=>x.id===id);if(!r)return;const evidence=[`Publiceringsbelägg: ${r.publication_evidence||r.publication_semantics||'Ej hämtat från källan'}`,`Uppdateringsbelägg: ${r.update_evidence||r.updated_semantics||'Ej hämtat från källan'}`,`Statusbelägg: ${r.status_evidence||'Saknas'}`,r.geo_enrichment?`Geografisk komplettering med separat belägg: ${r.geo_enrichment.evidence}`:'',sourceCountyFallback(r)?'Visningstillägg: Ärendet sorteras under Östergötlands län eftersom källan är Mjölby kommun. Det är INTE bevis för händelsens kommun eller exakta plats. Kommun och kartpunkt är fortfarande okända.':'' ,`Geografiskt belägg i exporten: ${r.geography_evidence||r.county_evidence||'Uppgift om kommun saknades'}`,`Osäkerheter i exporten: ${(r.uncertainties||[]).join(' · ')||'Inga särskilt noterade'}`].join('\n\n');$('#modalBadge').className='pill '+r.status;$('#modalBadge').textContent=r.status;$('#modalTitle').textContent=r.title;$('#modalBody').innerHTML=`<div class="detail-grid"><div class="detail-cell">Kommun<b>${h(municipality(r))}</b></div><div class="detail-cell">Län i filtret<b>${h(countyLabel(r))}</b></div><div class="detail-cell">Källa<b>${h(source(r))}</b></div><div class="detail-cell">Publicerat hos källan<b>${h(publishLabel(r).replace(/^Publicerad: /,''))}</b></div><div class="detail-cell">Uppdaterad hos källan<b>${h(r.updated?(hasClock(r.updated)?seenDisplay(r.updated):dateDisplay(r.updated)):'Uppdateringsdatum ej hämtat från källan')}</b></div><div class="detail-cell">Kategori<b>${h(CAT[r.category]||r.category)}</b></div><div class="detail-cell">Först upptäckt av Störningsradarn<b>${h(seenDisplay(r.first_seen_at))}</b></div><div class="detail-cell">Senast kontrollerad<b>${h(seenDisplay(r.checked_at))}</b></div></div><div class="evidence">${h(evidence)}</div>${url(r.url)?`<a class="btn blue" href="${h(url(r.url))}" target="_blank" rel="noopener noreferrer" style="display:inline-block">Öppna originalmeddelandet ↗</a>`:''}`;$('#modalBack').classList.add('open')}
function closeModal(){$('#modalBack').classList.remove('open')}
const anchors={"Malmö":[55.605,13.004],"Lund":[55.705,13.192],"Eslöv":[55.839,13.303],"Vallentuna":[59.535,18.077],"Ekerö":[59.291,17.810],"Burlöv":[55.641,13.076],"Österåker":[59.484,18.300],"Svedala":[55.507,13.235],"Lomma":[55.672,13.068],"Umeå":[63.8258,20.263],"Kristianstad":[56.0294,14.1567],"Vaxholm":[59.401,18.352],"Mjölby":[58.326,15.128]};
let liveMap=null,mapMarkers=[],mapSerial=0,mapLoadPromise=null,mapChooseMunicipality=null;
// Förenklade kommunpolygoner (290 kommuner). Endast för kartvisning, aldrig för att bevisa ärendets plats.
// Denna fil levereras lokalt ihop med webbplatsen vid driftsättning. I fristående HTML-förhandsvisning
// och om lokal fil saknas används samma versionslåsta utvecklingskopia på GitHub.
const MUNICIPALITY_POLYGONS_FALLBACK='https://raw.githubusercontent.com/storningsradarn/storningsradarn.github.io/ui-new-since-last-fetch-2026-11-23/municipality-boundaries.geojson';
let municipalityPolygonsPromise=null;
function loadMunicipalityPolygons(){
 if(municipalityPolygonsPromise)return municipalityPolygonsPromise;
 async function get(u){const r=await fetch(u,{mode:'cors',cache:'force-cache'});if(!r.ok)throw Error('Geodata HTTP '+r.status);const data=await r.json();if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.length<250)throw Error('Ogiltiga kommungränser');return data;}
 municipalityPolygonsPromise=(location.protocol==='file:'?get(MUNICIPALITY_POLYGONS_FALLBACK):get('municipality-boundaries.geojson').catch(()=>get(MUNICIPALITY_POLYGONS_FALLBACK))).catch(e=>{municipalityPolygonsPromise=null;throw e;});
 return municipalityPolygonsPromise;
}

function disposeMap(){mapSerial++;mapChooseMunicipality=null;if(liveMap){try{liveMap.remove()}catch(e){}liveMap=null}mapMarkers=[]}
function loadMapLibre(){if(window.maplibregl)return Promise.resolve();if(mapLoadPromise)return mapLoadPromise;
 mapLoadPromise=new Promise((resolve,reject)=>{
   if(!document.querySelector('link[data-maplibre]')){let l=document.createElement('link');l.rel='stylesheet';l.dataset.maplibre='1';l.href='https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';document.head.appendChild(l)}
   const hosts=['https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js','https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'];let host=0;
   function next(){if(host>=hosts.length){reject(new Error('Kartbiblioteket gick inte att hämta. Kontrollera internet eller nätverkets spärrar.'));return}let s=document.createElement('script');s.src=hosts[host++];s.async=true;s.onload=()=>window.maplibregl?resolve():next();s.onerror=()=>{s.remove();next()};document.head.appendChild(s)}next();
 });return mapLoadPromise.catch(e=>{mapLoadPromise=null;throw e})}
function showMapError(message){let e=$('#mapNotice');if(e){e.hidden=false;e.textContent=message}}
function renderMap(arr){disposeMap();const serial=mapSerial;
 const mapped=filterMapRecords(arr),state=M.mapState(mapped,anchors,selCounty,JSON.parse($('#public-contract').textContent)['x-municipality-counties']),groups=state.groups,unplaced=state.unplaced,mNames=state.names,placed=state.placed;
 if(chosenMunicipality&&!groups[chosenMunicipality])chosenMunicipality=null;
 $('#count').textContent=`${mapped.length} ${mapped.length===1?'ärende':'ärenden'}`;
 const filters=[['all','Alla ärenden'],['1h','Senaste timmen'],['3h','Senaste 3 timmarna'],['today','Idag'],['24h','Senaste dygnet']];
 $('#main').innerHTML=`<section class="map-filter-panel" aria-label="Kartans filter"><div class="map-filter-block"><div class="map-filter-label">När publicerades eller upptäcktes ärendet?</div><div class="map-period-list" role="group" aria-label="Tidsperiod för kartan">${filters.map(([key,label])=>`<button class="map-period" data-map-period="${key}" aria-pressed="${String(mapPeriod===key)}" type="button">${label}</button>`).join('')}</div></div><label class="map-filter-block"><span class="map-filter-label">Ärendetyp på kartan</span><select id="mapCategory" aria-label="Välj ärendetyp på kartan"><option value="all">Alla ärendetyper</option>${Object.entries(CAT).map(([k,l])=>`<option value="${h(k)}" ${k===mapCategory?'selected':''}>${h(l)}</option>`).join('')}</select></label><p class="map-note-small">Samma urval på kartan och i listan. Saknas exakt publiceringstid används första upptäckt.</p></section>
 <div class="map-summary" role="status" data-total="${mapped.length}" data-placed="${placed.length}" data-unplaced="${unplaced.length}" data-municipalities="${mNames.length}"><strong>${placed.length} ${placed.length===1?'ärende':'ärenden'} i ${mNames.length} ${mNames.length===1?'kommun':'kommuner'}</strong><span class="map-summary-sep">|</span><span>${mapped.length} i urvalet</span><span class="map-summary-sep">|</span><span>${unplaced.length} saknar säker kartplacering</span></div>
 <div class="soft-note"><b>Så fungerar kartan:</b> Blå markörer visar vilka kommuner som har ärenden. Klicka på en markör för att markera kommunen och se dess ärenden till höger. Kommungränser visar kommunens område, inte var störningen inträffat.</div>
 <div class="map-layout"><section class="map-panel"><div class="real-map-shell"><div id="realMap" role="region" aria-label="Interaktiv karta över Sverige och filtrerade ärenden"></div><div id="mapNotice" class="map-status-overlay">Karttjänsten laddas. Kartan behöver internetanslutning.</div></div><div class="map-legend">Kartdata © OpenStreetMap / OpenFreeMap. Blå markör = kommun med ett eller flera ärenden. Markören ligger ungefär vid kommuncentrum. Kommungränser: förenklat geografiskt underlag.</div></section><aside class="map-info" id="geoAside" aria-live="polite"></aside></div>`;
 function updateAside(){
   const selection=chosenMunicipality?groups[chosenMunicipality]||[]:placed;
   const title=chosenMunicipality?`Ärenden i ${h(chosenMunicipality)} kommun`:'Ärenden på kartan';
   const desc=chosenMunicipality?`${selection.length} ${selection.length===1?'ärende':'ärenden'}.`:`${placed.length} ${placed.length===1?'ärende':'ärenden'} i ${mNames.length} ${mNames.length===1?'kommun':'kommuner'}. Klicka på en markör för att välja kommun.`;
   const aside=$('#geoAside');if(!aside)return;
   aside.innerHTML=`<div class="map-aside-head" data-count="${selection.length}"><div><h2>${title}</h2><p class="summary-label">${desc}</p></div>${chosenMunicipality?'<button class="tiny-btn" type="button" id="mapShowAll">Visa alla</button>':''}</div>${selection.length?`<div class="map-aside-list">${selection.slice(0,mapListLimit).map(r=>recInline(r,'feed')).join('')}</div>`:'<div class="empty">Inga kartplacerade ärenden i detta urval. Prova ett bredare tidsfilter.</div>'}${selection.length>mapListLimit?`<button class="county-more" id="mapMore">Visa fler (${selection.length-mapListLimit} kvar)</button>`:''}`;
   for(const {element,municipality} of mapMarkers){const selected=municipality===chosenMunicipality;element.classList.toggle('selected',selected);element.setAttribute('aria-pressed',String(selected))}
   if(liveMap?.getLayer('sr-municipality-fill')){
    liveMap.setPaintProperty('sr-municipality-fill','fill-opacity',['case',['==',['get','municipality'],chosenMunicipality||''],0.42,0.12]);
    liveMap.setPaintProperty('sr-municipality-line','line-width',['case',['==',['get','municipality'],chosenMunicipality||''],2.7,1.25]);
    liveMap.setPaintProperty('sr-municipality-line','line-color',['case',['==',['get','municipality'],chosenMunicipality||''],'#075bbd','#4a9ce3']);
   }
 }
 updateAside();
 // Även när urvalet är tomt ska den riktiga baskartan laddas, men inga markörer skapas.
 // Nollresultatet förklaras i listan till höger.
 loadMapLibre().then(()=>{
   if(serial!==mapSerial||view!=='map'||!$('#realMap'))return;
   if(typeof maplibregl.supported==='function'&&!maplibregl.supported()){showMapError('Webbläsaren kan inte visa kartan med WebGL. Använd Händelser eller länskorten.');return;}
   const map=new maplibregl.Map({container:'realMap',style:'https://tiles.openfreemap.org/styles/liberty',center:[15.8,62.25],zoom:4.3,minZoom:3.1,maxZoom:15,attributionControl:true});liveMap=map;
   map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-left');
   let errored=false;
   map.on('error',()=>{if(!errored){errored=true;showMapError('Kartbilderna kunde inte laddas. Kontrollera nätverket. Ärendelistan fungerar ändå.')}});
   // Kartval ändrar endast listan och den markerade kommunytan – ingen automatiskt förflyttning.
   function chooseMunicipality(m){
    if(m!==null&&!groups[m])return;
    chosenMunicipality=m;
    mapListLimit=16;
    updateAside();
   }
   mapChooseMunicipality=chooseMunicipality;
   map.on('load',()=>{
     if(serial!==mapSerial)return;
     const e=$('#mapNotice');if(e)e.hidden=true;
     // Ingen data / noll träffar: baskartan visas ändå och inga kommuner färgmarkeras.
     if(!mNames.length)return;
     loadMunicipalityPolygons().then(geo=>{
       if(serial!==mapSerial||view!=='map'||!liveMap||liveMap!==map)return;
       const wanted=new Set(mNames);
       const features=geo.features.filter(f=>wanted.has(f.properties?.municipality));
       if(!features.length)return;
       map.addSource('sr-municipalities',{type:'geojson',data:{type:'FeatureCollection',features}});
       map.addLayer({id:'sr-municipality-fill',type:'fill',source:'sr-municipalities',paint:{'fill-color':'#5eacfa','fill-opacity':['case',['==',['get','municipality'],chosenMunicipality||''],0.42,0.12]}});
       map.addLayer({id:'sr-municipality-line',type:'line',source:'sr-municipalities',paint:{'line-color':['case',['==',['get','municipality'],chosenMunicipality||''],'#075bbd','#4a9ce3'],'line-width':['case',['==',['get','municipality'],chosenMunicipality||''],2.7,1.25]}});
       map.on('click','sr-municipality-fill',event=>{const name=event.features?.[0]?.properties?.municipality;if(name&&wanted.has(name))chooseMunicipality(name)});
       map.on('mouseenter','sr-municipality-fill',()=>{map.getCanvas().style.cursor='pointer'});
       map.on('mouseleave','sr-municipality-fill',()=>{map.getCanvas().style.cursor=''});
     }).catch(()=>{const legend=$('.map-legend');if(legend)legend.textContent+=' Kommunytorna kunde inte laddas; markörerna fungerar ändå.';});
   });
   for(const m of mNames){const [lat,lon]=anchors[m];const el=document.createElement('button');el.type='button';el.className='county-map-pin';el.innerHTML='<svg viewBox="0 0 32 43" width="30" height="40" aria-hidden="true"><path d="M16 1C7.7 1 1 7.7 1 16c0 12.3 15 25.5 15 25.5S31 28.3 31 16C31 7.7 24.3 1 16 1Z" fill="#0869cb" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="6.4" fill="#fff"/></svg>';el.dataset.municipality=m;el.dataset.count=String(groups[m].length);el.title=`Visa ${groups[m].length} ${groups[m].length===1?'ärende':'ärenden'} i ${m} kommun`;el.setAttribute('aria-label',el.title);el.setAttribute('aria-pressed','false');
      el.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();chooseMunicipality(m)});
      new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([lon,lat]).addTo(map);mapMarkers.push({element:el,municipality:m});
   }
   fitMarkers(map,mNames);
   updateAside();
 }).catch(e=>{if(serial===mapSerial)showMapError(String(e.message||e))});
}
function fitMarkers(map,names){
 if(!names.length)return;
 const coords=names.map(m=>anchors[m]).filter(Boolean);
 if(coords.length===1){map.flyTo({center:[coords[0][1],coords[0][0]],zoom:6.7,essential:true});return;}
 const lon=coords.map(x=>x[1]),lat=coords.map(x=>x[0]);
 map.fitBounds([[Math.min(...lon),Math.min(...lat)],[Math.max(...lon),Math.max(...lat)]],{padding:65,maxZoom:7,duration:0});
}
function renderOwn(){ $('#main').innerHTML=`<div class="soft-note"><b>Egna ärenden stannar på din dator.</b> De skickas inte till Hermes, VPS, GitHub eller någon kommun. De blandas inte heller med insamlarens verifierade meddelanden. Exportera en kopia om du vill spara eller flytta dem.</div><div class="own-panel"><section class="form-panel"><h2>＋ Lägg till eget ärende</h2><p>För något du vill bevaka själv men som inte finns i Störningsradarns insamling.</p><form id="ownForm" class="form-grid"><label>Rubrik *<input id="ownTitle" required maxlength="200" placeholder="Vad har hänt?"></label><label>Kommun eller plats<input id="ownPlace" maxlength="100" placeholder="Exempelvis Mjölby"></label><label>Kategori<select id="ownCat">${Object.entries(CAT).map(([k,v])=>`<option value="${h(k)}">${h(v)}</option>`).join('')}</select></label><label>Länk till information (valfritt)<input id="ownUrl" type="url" placeholder="https://..."></label><label>Egna anteckningar<textarea id="ownNote" rows="4" maxlength="4000" placeholder="Vad vill du följa upp?"></textarea></label><button class="btn blue" type="submit">Spara på min dator</button></form></section><section class="own-list"><h2>Mina sparade ärenden <span class="count">${own.length}</span></h2><p>Endast dina egna noteringar. De är inte en del av insamlarens data.</p>${own.length?own.slice().sort((a,b)=>b.created.localeCompare(a.created)).map(x=>`<article class="own-entry"><strong>${h(x.title)}</strong> <span class="pill egen">Egen notering</span><div class="feed-meta">${h(x.place||'Plats ej angiven')} · ${h(CAT[x.cat]||'Övrigt')} · ${h(dateDisplay(x.created))}</div>${x.note?`<p style="white-space:pre-wrap;color:#526b83;margin:9px 0">${h(x.note)}</p>`:''}<div class="own-actions">${url(x.url)?`<a href="${h(url(x.url))}" target="_blank" rel="noopener noreferrer" class="tiny-btn">Öppna länk ↗</a>`:''}<button class="tiny-btn" data-delete="${h(x.id)}">Ta bort</button></div></article>`).join(''):'<div class="empty">Du har inte lagt till några egna ärenden.</div>'}<div class="own-actions" style="margin-top:15px"><button class="btn" id="exportOwn">⬇ Spara kopia (JSON)</button><button class="btn" id="importOwn">⬆ Läs in sparad kopia</button></div></section></div>`;$('#ownCount').textContent=own.length?'('+own.length+')':'';}
function download(){const blob=new Blob([JSON.stringify({schema:'storningsradarn.egna-arenden.v1',saved_at:new Date().toISOString(),items:own},null,2)],{type:'application/json;charset=utf-8'}),u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='mina-storningsarenden.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2500)}
function init(){const allCounties=[...new Set(records.flatMap(r=>effectiveCounties(r)))].sort((a,b)=>a.localeCompare(b,'sv'));$('#county').innerHTML=[['all','Alla län'],...allCounties.map(c=>[c,c]),['unknown','Län okänt']].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');$('#category').innerHTML=[['all','Alla kategorier'],...Object.entries(CAT)].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');$('#status').innerHTML=[['all','Alla statusar'],...STATUS.map(v=>[v,v[0].toUpperCase()+v.slice(1)])].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');$('#observed').textContent=seenDisplay(run.observed_at);$('#ownCount').textContent=own.length?'('+own.length+')':'';
 $('#newSinceLast').addEventListener('click',()=>{
  if(!hasComparison)return;
  newOnly=!newOnly;
  if(newOnly){selDate='all';$('#date').value='all';mapPeriod='all';chosenMunicipality=null;mapListLimit=16;}
  paging=30;
  if(view==='own'||view==='control'){changeView('feed');}else render();
 });
 $all('[data-view]').forEach(b=>b.addEventListener('click',()=>changeView(b.dataset.view)));$('#search').addEventListener('input',e=>{query=e.target.value;paging=30;chosenMunicipality=null;render()});for(const [id,fn] of [['county',v=>selCounty=v],['category',v=>selCat=v],['status',v=>{selStatus=v;if(['historisk','avslutad'].includes(v)){$('#history').checked=true;history=true}}],['date',v=>selDate=v]])$( '#'+id ).addEventListener('change',e=>{fn(e.target.value);paging=30;chosenMunicipality=null;render()});$('#history').addEventListener('change',e=>{history=e.target.checked;chosenMunicipality=null;render()});$('#clear').addEventListener('click',()=>{query='';selCounty='all';selCat='all';selStatus='all';selDate='all';history=false;newOnly=false;paging=30;chosenMunicipality=null;mapPeriod='all';mapCategory='all';mapListLimit=16;$('#search').value='';['county','category','status','date'].forEach(id=>$('#'+id).value='all');$('#history').checked=false;render()});$('#closeModal').addEventListener('click',closeModal);$('#modalBack').addEventListener('click',e=>{if(e.target.id==='modalBack')closeModal()});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
$('#main').addEventListener('click',e=>{let t=e.target.closest('[data-map-period],#mapShowAll,#mapMore,[data-detail],[data-county],[data-map-muni],[data-delete],#more,#zoomIn,#zoomOut,#zoomReset,#exportOwn,#importOwn');if(!t)return;
if(t.dataset.mapPeriod){mapPeriod=t.dataset.mapPeriod;chosenMunicipality=null;mapListLimit=16;render();return;}if(t.id==='mapShowAll'){if(mapChooseMunicipality)mapChooseMunicipality(null);else{chosenMunicipality=null;mapListLimit=16;render();}return;}if(t.id==='mapMore'){mapListLimit+=20;render();return;}if(t.dataset.detail)openDetail(t.dataset.detail);else if(t.dataset.county){selCounty=t.dataset.county;$('#county').value=selCounty;changeView('feed')}else if(t.id==='more'){paging+=30;render()}else if(t.dataset.delete){own=own.filter(x=>x.id!==t.dataset.delete);store(KEY,own);renderOwn();toast('Eget ärende borttaget')}else if(t.id==='exportOwn')download();else if(t.id==='importOwn')$('#fileImport').click();});
$('#main').addEventListener('change',e=>{if(e.target.id==='mapCategory'){mapCategory=e.target.value;chosenMunicipality=null;mapListLimit=16;render();}});
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
 badge.textContent=!m?'INGA PUBLICERADE DATA':m.dataset_kind==='saved_test_data'?'● SPARADE TESTDATA · INTE LIVE':m.dataset_kind==='validation'?'● VALIDERING · INTE PILOT':'● PILOTDATA';
 const mode=m?.dataset_kind==='saved_test_data'?'Sparade testdata – inte aktuellt driftläge. ':m?.dataset_kind==='validation'?'Manuell validering – inte startad pilot. ':'';
 const age=flags?.future?'Tidsstämpeln ligger i framtiden. ':flags?.stale?'Informationen är föråldrad. ':'';
 const health=m?.last_attempt_result==='failed'?'Senaste insamlingen misslyckades eller var ofullständig. Tidigare giltiga uppgifter ligger kvar. ':'';
 notice.textContent=mode+age+health+(loadError?(m?'Uppdateringen kunde inte läsas. Tidigare giltiga uppgifter ligger kvar. ':'Ingen giltig publicerad datafil är tillgänglig ännu. Sidan visar inget förrän en godkänd export finns. '):m?((m.snapshot||currentBundle?.feed)?'Status är regelbaserad. Kontrollera originalkällan.':'Väntar på första godkända dataexporten. '):'Läser publicerade data …')+local;
 notice.dataset.stale=String(!!flags?.stale);notice.dataset.error=String(!!loadError||m?.last_attempt_result==='failed');
 const updated=m?.last_success_at?seenDisplay(m.last_success_at):'Ingen lyckad hämtning';
 $('#observed').textContent=updated;
 const bar=$('#freshnessBar'),chip=$('#freshnessChip');
 if(bar)bar.dataset.stale=String(!!flags?.stale||!!flags?.future);
 if(chip){chip.dataset.state=loadError||m?.last_attempt_result==='failed'?'error':!m?'waiting':flags?.stale||flags?.future?'stale':'ok';chip.textContent=chip.dataset.state==='error'?'Kontrollera uppdateringen':chip.dataset.state==='waiting'?'Väntar på data':chip.dataset.state==='stale'?'Information kan vara äldre':'Aktuell hämtning';}
 const ageEl=$('#fetchAge');if(ageEl){let mins=flags?.ageSeconds===null||flags?.ageSeconds===undefined?null:Math.floor(flags.ageSeconds/60);ageEl.textContent=mins===null?'Väntar på insamling':mins<60?`För ${mins} min sedan`:mins<1440?`För ${Math.floor(mins/60)} tim ${mins%60} min sedan`:`För ${Math.floor(mins/1440)} dygn sedan`;}
 const last=$('#lastAttempt');if(last)last.textContent='Senaste kontroll: '+(m?.last_attempt_at?seenDisplay(m.last_attempt_at):'saknas');
 const dataState=$('#dataState');if(dataState)dataState.textContent=loadError?'Läsfel':m?.last_attempt_result==='failed'?'Insamlingsfel':!m?'Läser data':currentBundle.manual?'Lokal fil':flags?.stale?'Föråldrad information':'Uppdaterad';
}
function applyBundle(bundle){
 currentBundle=bundle;loadError='';
 if(bundle.feed){
  const f=bundle.feed;run={...f,observed_at:f.last_success_at};records=f.records;sources=Object.fromEntries(f.sources.map(s=>[s.id,s.name]));runDay=run.observed_at.slice(0,10);runMs=Date.parse(run.observed_at);
   hasComparison=f.baseline===false&&Array.isArray(f.changes);newSinceIds=new Set(hasComparison?f.changes.filter(c=>c.change==='new').map(c=>c.id):[]);if(!hasComparison)newOnly=false;
  const counties=[...new Set(records.flatMap(r=>effectiveCounties(r)))].sort((a,b)=>a.localeCompare(b,'sv'));
  $('#county').innerHTML=[['all','Alla län'],...counties.map(c=>[c,c]),['unknown','Län okänt']].map(([v,l])=>`<option value="${h(v)}">${h(l)}</option>`).join('');
  if(selCounty!=='all'&&selCounty!=='unknown'&&!counties.includes(selCounty))selCounty='all';$('#county').value=selCounty;

 }else{records=[];sources={};newSinceIds=new Set();newOnly=false;hasComparison=false;$('#county').innerHTML='<option value="all">Alla län</option><option value="unknown">Län okänt</option>';selCounty='all';}
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
 const localFile=location.protocol==='file:';
 if(localFile){
  $('#refreshData').addEventListener('click',()=>loader?.refresh());
  $('#loadData').addEventListener('click',()=>$('#dataImport').click());
  $('#dataImport').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>8000000)throw Error('För stor fil.');const bundle=C.manual(JSON.parse(await file.text()));applyBundle(bundle);toast('Validerad JSON lästes in lokalt.');}catch(err){toast('Filen avvisades. Tidigare uppgifter behålls.');}finally{e.target.value='';}});
  loadError='Lokal filöppning';dataStatus();document.querySelector('.notice').textContent='Lokal filöppning: klicka på Läs in JSON och välj Sparade-testdata.json. Automatiska uppdateringar används när sidan öppnas på GitHub Pages. Mina ärenden fungerar lokalt.';return;
 }
 // Publicerade webbplatsen har ingen filuppladdning, testpanel eller manuell refresh-knapp.
 $('#loadData')?.remove();$('#dataImport')?.remove();$('#refreshData')?.remove();$('.data-toolbar')?.remove();document.querySelector('[data-view="control"]')?.remove();
 loader=C.createLoader({onData:applyBundle,onError(error){loadError=error.message;dataStatus();}});
 loader.refresh();setInterval(()=>{if(!document.hidden)loader.refresh();dataStatus();},60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)loader.refresh();});
}

init();initLive();
})();