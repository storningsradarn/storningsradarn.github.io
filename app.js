(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StorningsradarnComparison=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
function select(f){
 const ids=new Set(),no={comparable:false,ids};if(!f||f.baseline!==false||!f.comparison)return no;
 const c=f.comparison,prev=Date.parse(c.previous_success_at),now=Date.parse(f.last_success_at),sources=(f.sources||[]).map(s=>s.id).sort();
 if(!Number.isFinite(prev)||!Number.isFinite(now)||prev>=now||c.method!==f.method||c.dataset_kind!==f.dataset_kind||!/^[a-f0-9]{64}$/.test(c.previous_snapshot_sha256||'')||!Array.isArray(c.source_ids)||JSON.stringify([...c.source_ids].sort())!==JSON.stringify(sources))return no;
 const records=new Map((f.records||[]).map(r=>[r.id,r]));
 for(const change of f.changes||[]){const r=records.get(change.id),first=Date.parse(r?.first_seen_at);if(change.change==='new'&&r&&r.source_id===change.source_id&&r.presence==='observed'&&first>prev&&first<=now)ids.add(r.id);}
 return{comparable:true,ids};
}
return{select};});

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
const anchors={"Upplands Väsby":[59.50971366,17.91391571504976],"Vallentuna":[59.535,18.077],"Österåker":[59.484,18.3],"Värmdö":[59.260886,18.52704713269935],"Järfälla":[59.42149613,17.832787637306723],"Ekerö":[59.291,17.81],"Huddinge":[59.2154438,18.052836282111837],"Botkyrka":[59.165357099999994,17.853629456355264],"Salem":[59.2332406,17.70495507972783],"Haninge":[59.14497692,18.18060598922403],"Tyresö":[59.22313482,18.276956163268636],"Upplands-Bro":[59.521281880000004,17.67818958571794],"Nykvarn":[59.20961704,17.40255682415853],"Täby":[59.49290476,18.068693266637833],"Danderyd":[59.4130192,18.050584940786955],"Sollentuna":[59.45697202,17.928595892151755],"Stockholm":[59.2917817,18.004700241088372],"Södertälje":[59.1165625,17.489674867445093],"Nacka":[59.27377849,18.239600496332415],"Sundbyberg":[59.375705749999995,17.96152349239962],"Solna":[59.3780062,18.024645633346736],"Lidingö":[59.372942,18.184851457014503],"Vaxholm":[59.40098448,18.23096507234677],"Norrtälje":[59.75327024,18.584925486171734],"Sigtuna":[59.647985250000005,17.84844610433393],"Nynäshamn":[59.03045609,17.87188024446136],"Håbo":[59.67380421,17.545223808945703],"Älvkarleby":[60.5979753,17.46935906359458],"Knivsta":[59.76289134,17.860532226593616],"Heby":[60.16575509,17.030386622941204],"Tierp":[60.40796306,17.6273920958732],"Uppsala":[59.961816999999996,17.762739806991444],"Enköping":[59.72004426,17.151053464565344],"Östhammar":[60.21421488,18.153743990295354],"Vingåker":[59.04729556,15.86864941253274],"Gnesta":[59.13175694,17.092402902078106],"Nyköping":[58.79744438,16.97713325767502],"Oxelösund":[58.692223150000004,17.04981515818326],"Flen":[59.0680079,16.737069348410444],"Katrineholm":[58.962642960000004,16.24124684191125],"Eskilstuna":[59.31681725,16.351257443334582],"Strängnäs":[59.344929949999994,17.061783524225795],"Trosa":[58.90955574,17.503167276800106],"Ödeshög":[58.12972656,14.74133833133573],"Ydre":[57.86653435,15.282323538644484],"Kinda":[58.00439875,15.69109752155494],"Boxholm":[58.0710313,15.189179635202304],"Åtvidaberg":[58.2203765,16.120336992537343],"Finspång":[58.87021002,15.791045463547935],"Valdemarsvik":[58.14827196,16.58235285585368],"Linköping":[58.422711559999996,15.630510719203517],"Norrköping":[58.59357782,16.18253645359457],"Söderköping":[58.3977204,16.361032706574658],"Motala":[58.68967558,15.202787325951927],"Vadstena":[58.37378696,14.804348219704618],"Mjölby":[58.326,15.128],"Aneby":[57.8739103,14.766111696675399],"Gnosjö":[57.362910400000004,13.784650693072205],"Mullsjö":[58.01022624,13.855844309004567],"Habo":[57.87964478,13.97843825443293],"Gislaved":[57.17255643,13.408850147277523],"Vaggeryd":[57.5154634,14.171833016319514],"Jönköping":[57.76672062,14.191746433933757],"Nässjö":[57.532109250000005,14.577458032198596],"Värnamo":[57.231856,14.049631105166434],"Sävsjö":[57.3921342,14.59487319997881],"Vetlanda":[57.46015619,15.186129854701235],"Eksjö":[57.60331056,15.237216507485115],"Tranås":[58.0131431,14.830435428693864],"Uppvidinge":[56.95755261,15.513171197759554],"Lessebo":[56.811379259999995,15.312154397529099],"Tingsryd":[56.53669175,14.964315867576977],"Alvesta":[56.790095720000004,14.474369467280827],"Älmhult":[56.559401179999995,14.182744139820777],"Markaryd":[56.598424370000004,13.601655306987961],"Växjö":[57.1084805,14.826391649837905],"Ljungby":[56.8390541,13.799008557383894],"Högsby":[57.20930952,15.846163355247572],"Torsås":[56.4443569,15.880696054493068],"Mörbylånga":[56.59695083,16.545588614957847],"Hultsfred":[57.44430266,15.826487399779086],"Mönsterås":[57.10557148,16.366303920159183],"Emmaboda":[56.60105466,15.564718875726557],"Kalmar":[56.5636918,15.983444027189003],"Nybro":[56.8944337,15.843160284978055],"Oskarshamn":[57.404397180000004,16.320685654325604],"Västervik":[57.90289604,16.40242480642427],"Vimmerby":[57.71287996,15.786179648152038],"Borgholm":[56.88483445,16.73409235590124],"Gotland":[57.45872575,18.465923257555353],"Olofström":[56.303004539999996,14.5761940712543],"Karlskrona":[56.29958525,15.708923581459088],"Ronneby":[56.42693176,15.184308829330398],"Karlshamn":[56.20205058,14.848484096031353],"Sölvesborg":[56.040729400000004,14.665707734894966],"Svalöv":[55.94154362,13.119523040246985],"Staffanstorp":[55.63468291,13.226501664356432],"Burlöv":[55.641,13.076],"Vellinge":[55.484780640000004,13.059115701865219],"Östra Göinge":[56.26268852,14.144104420142426],"Örkelljunga":[56.31435784999999,13.342459317830414],"Bjuv":[56.0839109,12.978282099324671],"Kävlinge":[55.82342844,13.07829282696165],"Lomma":[55.672,13.068],"Svedala":[55.507,13.235],"Skurup":[55.50189588,13.550650002329933],"Sjöbo":[55.62886504,13.749940768779156],"Hörby":[55.86841408,13.733069184829688],"Höör":[55.99957989,13.516078411977356],"Tomelilla":[55.598224200000004,14.046242296004442],"Bromölla":[56.09005192,14.505293831555214],"Osby":[56.46125971,14.209157373276149],"Perstorp":[56.20925144,13.362420904528456],"Klippan":[56.07717527,13.330694784844002],"Åstorp":[56.1354093,12.966216804329257],"Båstad":[56.42134674,12.801743064906894],"Malmö":[55.605,13.004],"Lund":[55.705,13.192],"Landskrona":[55.8955662,12.90533836080504],"Helsingborg":[56.13196679,12.722260109408634],"Höganäs":[56.2200478,12.659343977178523],"Eslöv":[55.839,13.303],"Ystad":[55.44326003,13.889960772087544],"Trelleborg":[55.39634453,13.248647408321741],"Kristianstad":[56.0294,14.1567],"Simrishamn":[55.54668256,14.246494307186818],"Ängelholm":[56.32786444,13.004980455379988],"Hässleholm":[56.18803525,13.717427078905192],"Hylte":[56.979867,13.263822329046818],"Halmstad":[56.78891046,12.973949413658524],"Laholm":[56.437975429999995,13.19211583294868],"Falkenberg":[56.933593169999995,12.63424555119705],"Varberg":[57.27151558,12.464741766285623],"Kungsbacka":[57.4840329,12.149400323862283],"Härryda":[57.64275794,12.316386242966187],"Partille":[57.725806399999996,12.139945151132054],"Öckerö":[57.70167636,11.665106785112496],"Stenungsund":[58.0628962,11.946165216537839],"Tjörn":[58.0285368,11.65299060591289],"Orust":[58.15395856,11.630474599135145],"Sotenäs":[58.4070774,11.354106075159791],"Munkedal":[58.52367812,11.663823527534884],"Tanum":[58.78344112,11.443784723098787],"Dals-Ed":[58.94976796,11.876777517546785],"Färgelanda":[58.730067299999995,12.011852097003022],"Ale":[57.99704416,12.267042044368566],"Lerum":[57.7794596,12.344939848440081],"Vårgårda":[58.00829432,12.758478667801064],"Bollebygd":[57.73771585,12.57907278089986],"Grästorp":[58.3008531,12.655031049101066],"Essunga":[58.20547476,12.689695057141481],"Karlsborg":[58.68071781,14.486475904278532],"Gullspång":[58.921167749999995,14.154745877583466],"Tranemo":[57.54396234,13.416370411668517],"Bengtsfors":[59.17086494,12.166354763887242],"Mellerud":[58.63378808,12.41605988212539],"Lilla Edet":[58.102699959999995,12.187201440010028],"Mark":[57.52592819,12.623206718486909],"Svenljunga":[57.30591777,13.030212542961173],"Herrljunga":[58.058096230000004,13.087353667895943],"Vara":[58.27340438,13.109672808354919],"Götene":[58.56552595,13.505935861791828],"Tibro":[58.43687858,14.186097615522261],"Töreboda":[58.61297851,14.116369217551005],"Göteborg":[57.79999604,12.030879684483198],"Mölndal":[57.5997848,12.141790195053897],"Kungälv":[57.960645219999996,11.951990839030824],"Lysekil":[58.3735679,11.520145385609796],"Uddevalla":[58.33396576,11.854340985068893],"Strömstad":[59.00380652,11.292686869805966],"Vänersborg":[58.52355383,12.303022736057498],"Trollhättan":[58.210813,12.351383792694477],"Alingsås":[58.105860220000004,12.567063111907022],"Borås":[57.736818549999995,12.966664880285116],"Ulricehamn":[57.84860744,13.426402181256643],"Åmål":[59.07943108,12.592688810099606],"Mariestad":[58.78976995,13.908919585295454],"Lidköping":[58.43940436,13.01395601160631],"Skara":[58.378651250000004,13.450403085096633],"Skövde":[58.50168872,13.8773462877413],"Hjo":[58.2750479,14.126244748339747],"Tidaholm":[58.142296,13.915368991819236],"Falköping":[58.1178927,13.46721687247287],"Kil":[59.55750794,13.183492283793235],"Eda":[59.816815500000004,12.185392356027481],"Torsby":[60.347615260000005,13.013683108704326],"Storfors":[59.55489184,14.246416676889678],"Hammarö":[59.342029159999996,13.520015939658828],"Munkfors":[59.85090538,13.486506117196],"Forshaga":[59.75314878,13.518421856000252],"Grums":[59.4637471,12.997239085931573],"Årjäng":[59.4351456,12.115719580562356],"Sunne":[60.031242920000004,12.953523688720004],"Karlstad":[59.45148169,13.584081375729559],"Kristinehamn":[59.34305807,14.076653408418867],"Filipstad":[59.77406866,14.10522537751988],"Hagfors":[60.16445722,13.585332155936133],"Arvika":[59.61764626,12.672107107587998],"Säffle":[59.22446896,12.810075283850333],"Lekeberg":[59.17839425,14.808862705394809],"Laxå":[58.96012372,14.51425586410679],"Hallsberg":[59.03737096,15.087355248631987],"Degerfors":[59.25250308,14.449320499989792],"Hällefors":[59.7546386,14.656258183977748],"Ljusnarsberg":[59.98441108,14.981557958635918],"Örebro":[59.3448274,15.201649117419683],"Kumla":[59.1092138,15.09616030545489],"Askersund":[58.89825818,14.978962707344923],"Karlskoga":[59.33886529,14.553503216771535],"Nora":[59.55358975,14.915094710379504],"Lindesberg":[59.707823399999995,15.240230272287882],"Skinnskatteberg":[59.83366378,15.678737507282456],"Surahammar":[59.75696544,16.138411343420906],"Kungsör":[59.42831855,16.06730009464995],"Hallstahammar":[59.62733256,16.19658180763028],"Norberg":[60.073716000000005,15.93984989807656],"Västerås":[59.662962050000004,16.57613289403585],"Sala":[59.94091542,16.445776506541456],"Fagersta":[59.9528635,15.88595153423753],"Köping":[59.54705223,15.897265432014962],"Arboga":[59.413591600000004,15.787073330870271],"Vansbro":[60.42037452,14.266375836170946],"Malung-Sälen":[60.85711715,13.466351858575731],"Gagnef":[60.52991566,14.907241309379042],"Leksand":[60.68620202,14.88952815419939],"Rättvik":[60.974860619999994,15.2828208969445],"Orsa":[61.45806118,14.686322165048848],"Älvdalen":[61.6507732,13.09135620420049],"Smedjebacken":[60.029930560000004,15.41118739833502],"Mora":[61.057481859999996,14.2094580678897],"Falun":[60.758149450000005,15.847849904814861],"Borlänge":[60.4665686,15.406973521751407],"Säter":[60.29724752,15.498335140978728],"Hedemora":[60.299580739999996,16.053280529037185],"Avesta":[60.19826754,16.3421100043469],"Ludvika":[60.206337149999996,14.70720180635449],"Ockelbo":[60.99175778,16.519212217711146],"Hofors":[60.51695136,16.421574912370286],"Ovanåker":[61.512005880000004,15.673931957209293],"Nordanstig":[62.131191869999995,16.97668995894172],"Ljusdal":[61.6659066,15.534880354185738],"Gävle":[60.74163008,17.094646452763428],"Sandviken":[60.61410615,16.57267408324209],"Söderhamn":[61.08912263,16.86134927055544],"Bollnäs":[61.19784643,16.40149978225],"Hudiksvall":[61.844655149999994,16.834178615632982],"Ånge":[62.53475462,15.637727155639572],"Timrå":[62.7322178,17.18766702479747],"Härnösand":[62.74295976,17.765656030111614],"Sundsvall":[62.308765480000005,16.893936566230757],"Kramfors":[62.99006325,17.88458160429478],"Sollefteå":[63.2103014,17.280253417127827],"Örnsköldsvik":[63.54492915,18.234594561275514],"Ragunda":[63.171419799999995,15.969818568926517],"Bräcke":[62.80409966,15.600154964780184],"Krokom":[63.9313631,14.132921615691448],"Strömsund":[64.06764162,15.79890009507698],"Åre":[63.14188966,13.173199619180828],"Berg":[62.83578633,13.263713696759798],"Härjedalen":[62.1742652,14.14720406593126],"Östersund":[63.32392056,15.090397920035539],"Nordmaling":[63.791869240000004,19.320644345369473],"Bjurholm":[63.899925849999995,18.981771024176524],"Vindeln":[64.40656240000001,19.530048308502863],"Robertsfors":[64.27542677,20.77114178711431],"Norsjö":[64.98490348,19.399671185336103],"Malå":[65.251935,18.72550355455973],"Storuman":[65.58276208,15.517578014049153],"Sorsele":[65.83351634,16.40882005804923],"Dorotea":[64.37632158,16.32312998622892],"Vännäs":[64.00911169,19.678366115616335],"Vilhelmina":[65.1298284,15.379860419085464],"Åsele":[64.07974942999999,17.794779670567465],"Umeå":[63.8258,20.263],"Lycksele":[64.7747878,18.458208097991243],"Skellefteå":[65.06185872,20.62738714404266],"Arvidsjaur":[65.56021316,19.189170897928264],"Arjeplog":[66.53809604,17.063658801042614],"Jokkmokk":[67.1156584,18.098573112785935],"Överkalix":[66.41895184,22.542522528764913],"Kalix":[65.9192308,23.029532468061426],"Övertorneå":[66.60592918,23.48008404526879],"Pajala":[67.4136857,22.905067568617255],"Gällivare":[67.37427538,20.401413189779774],"Älvsbyn":[65.66687085,20.769335154196582],"Luleå":[65.68494812,21.84719337698339],"Piteå":[65.43392573999999,20.80671580647929],"Boden":[66.12441638,21.293193420542934],"Haparanda":[66.01684294,23.704367470916115],"Kiruna":[68.03852498,20.55848156057884]};
let liveMap=null,mapMarkers=[],mapSerial=0,mapLoadPromise=null,mapChooseMunicipality=null;
// Förenklade kommunpolygoner (290 kommuner). Endast för kartvisning, aldrig för att bevisa ärendets plats.
// Denna fil levereras lokalt ihop med webbplatsen vid driftsättning. I fristående HTML-förhandsvisning
// och om lokal fil saknas används samma versionslåsta utvecklingskopia på GitHub.
let municipalityPolygonPromise=null;
function loadMunicipalityPolygons(){
 if(municipalityPolygonPromise)return municipalityPolygonPromise;
 municipalityPolygonPromise=(async()=>{
  let data;
  if(location.protocol==='file:')data=JSON.parse(document.getElementById('municipality-boundaries').textContent);
  else{
   const response=await fetch('municipality-boundaries.geojson',{cache:'no-cache'});if(!response.ok)throw Error('Kommungränser kunde inte läsas');
   const buffer=await response.arrayBuffer();if(buffer.byteLength>2000000)throw Error('För stor gränsfil');
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
   if(digest!=="b1a19d06344fe8a96676a77bba7d4ecc1b86698a741e2c01d1806bd887860816")throw Error('Kommungränsernas kontrollsumma stämmer inte');data=JSON.parse(new TextDecoder().decode(buffer));
  }
  if(data.type!=='FeatureCollection'||data.features?.length!==290)throw Error('Fel kommungränser');
  const names=new Set(),codes=new Set();
  for(const f of data.features){const p=f.properties,g=f.geometry;if(!p||!Object.hasOwn(anchors,p.municipality)||names.has(p.municipality)||!/^\d{4}$/.test(p.code)||codes.has(p.code)||!['Polygon','MultiPolygon'].includes(g?.type))throw Error('Felaktig kommunidentitet');names.add(p.municipality);codes.add(p.code);}
  return data;
 })().catch(error=>{municipalityPolygonPromise=null;throw error;});return municipalityPolygonPromise;
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
 <div class="map-layout"><section class="map-panel"><div class="real-map-shell"><div id="realMap" role="region" aria-label="Interaktiv karta över Sverige och filtrerade ärenden"></div><div id="mapNotice" class="map-status-overlay">Karttjänsten laddas. Kartan behöver internetanslutning.</div></div><div class="map-legend">Kartdata © OpenStreetMap / OpenFreeMap. Blå markör = kommun med ett eller flera ärenden. Markören ligger vid en ungefärlig kommunpunkt. Kommungränser: SCB, förenklat översiktsunderlag, inte för exakta gränsanalyser.</div></section><aside class="map-info" id="geoAside" aria-live="polite"></aside></div>`;
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
  const comparison=window.StorningsradarnComparison.select(f);hasComparison=comparison.comparable;newSinceIds=comparison.ids;if(!hasComparison)newOnly=false;
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