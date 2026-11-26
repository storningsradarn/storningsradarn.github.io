/* V6.5: read-only coverage information. No collection, storage or new data requests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.StorningsradarnCoverage=api;})(globalThis,()=>{
'use strict';
const labels={complete:'Komplett kontrollerad',incomplete:'Ofullständig kontroll',failed:'Misslyckad hämtning',outside:'Ej automatiserad',unknown:'Okänd kontrollstatus'};
const muniLabels={complete:'Minst en komplett källa',incomplete:'Ingen komplett källa – delvis bevakad',failed:'Alla kopplade hämtningar misslyckades',outside:'Ingen automatisk källa – känd referens',unregistered:'Ingen registrerad kommunkoppling',unknown:'Kan inte bedömas'};
const order=['complete','incomplete','failed','outside','unregistered','unknown'];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sort=(a,b)=>a.localeCompare(b,'sv');
const validStates=new Set(['complete','incomplete','failed']);
function parseCatalog(raw){
 if(typeof raw!=='string')throw Error('Källkatalogen saknas.');
 const rows=raw.split('\n').filter(Boolean).map(line=>{const [id,name,scope,reason,url,...rest]=line.split('\t');if(rest.length||!/^K\d{3}$/.test(id)||!name||!scope||!reason||!url)throw Error('Fel i källkatalogen.');return {id,name,municipalities:scope.split('|'),reason,url,state:'outside'};});
 if(new Set(rows.map(s=>s.id)).size!==rows.length)throw Error('Dubblett i källkatalogen.');return rows;
}
function build(contract,manifest,feed,raw){
 const counties=contract['x-municipality-counties'],registry=contract['x-source-registry'];
 const health=new Map((manifest?.source_health||[]).map(s=>[s.id,s]));
 const metadata=new Map((feed?.sources||[]).map(s=>[s.id,s]));
 const active=Object.entries(registry).map(([id,r])=>{
  const f=metadata.get(id),s=health.get(id),scope=f?.source_area?.municipalities;
  const municipalities=[...new Set((Array.isArray(scope)?scope:[]).filter(n=>Object.hasOwn(counties,n)))];
  const state=validStates.has(s?.state)?s.state:'unknown';
  const reason={complete:'Kontrollen av den registrerade källan slutfördes.',incomplete:'Källan kunde bara kontrolleras delvis. Närmare orsak saknas i webbexporten.',failed:'Kontrollen misslyckades. Webbexporten skiljer inte mellan exempelvis nätfel och åtkomstbegränsning.',unknown:'Ingen kontrollstatus tillgänglig.'}[state];
  return {id,name:r.name,url:f?.url||'',municipalities,state,reason,lastSuccess:s?.last_success_at||null,checked:s?.checked_at||null,accepted:f?.counts?.accepted??null,scopeKnown:Array.isArray(scope)&&scope.every(n=>Object.hasOwn(counties,n))};
 });
 const outside=parseCatalog(raw).filter(s=>!Object.hasOwn(registry,s.id)).map(s=>({...s,municipalities:[...new Set(s.municipalities.filter(n=>Object.hasOwn(counties,n)))]}));
 const all=[...active,...outside];
 const ready=!!manifest&&!!feed&&active.every(s=>s.scopeKnown&&s.state!=='unknown');
 const byMuni=new Map(Object.keys(counties).map(name=>[name,[]]));
 for(const s of all)for(const n of s.municipalities)byMuni.get(n).push(s);
 const municipalities=[...byMuni].map(([name,linked])=>{
  const automatic=linked.filter(s=>s.state!=='outside');
  const state=!ready?'unknown':automatic.some(s=>s.state==='complete')?'complete':automatic.some(s=>s.state==='incomplete')?'incomplete':automatic.length&&automatic.every(s=>s.state==='failed')?'failed':automatic.length?'unknown':linked.length?'outside':'unregistered';
  return {name,county:counties[name],state,linked};
 }).sort((a,b)=>sort(a.county,b.county)||sort(a.name,b.name));
 const municipalCounts=Object.fromEntries(order.map(k=>[k,municipalities.filter(m=>m.state===k).length]));
 const sourceCounts=Object.fromEntries(Object.keys(labels).map(k=>[k,all.filter(s=>s.state===k).length]));
 return {ready,municipalities,sources:all.sort((a,b)=>sort(a.name,b.name)||sort(a.id,b.id)),municipalCounts,sourceCounts,counties};
}
function safeLink(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&![...u.searchParams.keys()].some(k=>/token|password|secret|api.?key|signature|authorization/i.test(k))?u.href:'';}catch{return '';}}
function link(s){const href=safeLink(s.url);return href?`<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`:esc(s.name);}
const date=v=>v&&Number.isFinite(Date.parse(v))?new Intl.DateTimeFormat('sv-SE',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Stockholm'}).format(new Date(v)):'–';
const statePill=(state,label)=>`<span class="cv-pill cv-${esc(state)}">${esc(label)}</span>`;
const filterState={county:'all',query:'',showAll:false};
function render({main,contract,manifest,feed,catalog}){
 let data;try{data=build(contract,manifest,feed,catalog);}catch{main.innerHTML='<div class="soft-note">Bevakningsinformationen kunde inte läsas. Övriga flikar påverkas inte.</div>';return;}
 const {municipalities,sources,municipalCounts,sourceCounts,counties}=data;
 const card=(label,n)=>`<div class="cv-card"><strong>${n}</strong><span>${esc(label)}</span></div>`;
 const options=[...new Set(Object.values(counties))].sort(sort);
 main.innerHTML=`<section id="coverageInfo"><style>
 #coverageInfo .cv-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px;margin:10px 0 16px}#coverageInfo .cv-card{background:#fff;border:1px solid #d6e3ef;border-radius:10px;padding:12px}#coverageInfo .cv-card strong{display:block;font-size:25px;color:#15395d}#coverageInfo .cv-card span{color:#466683;font-size:12px}#coverageInfo .cv-controls{display:flex;gap:14px;align-items:end;flex-wrap:wrap;background:#fff;border:1px solid #d6e3ef;border-radius:10px;padding:12px;margin:14px 0}#coverageInfo .cv-controls label{display:grid;gap:4px;font-size:12px;color:#466683}#coverageInfo .cv-controls input:not([type=checkbox]),#coverageInfo .cv-controls select{border:1px solid #cbdbea;border-radius:8px;padding:8px;max-width:100%}#coverageInfo .cv-controls label:last-child{display:flex;align-items:center;min-height:36px}#coverageInfo .cv-table-wrap{overflow:auto;background:#fff;border:1px solid #d6e3ef;border-radius:12px;margin-bottom:20px}#coverageInfo table{border-collapse:collapse;width:100%;text-align:left;font-size:13px}#coverageInfo th,#coverageInfo td{border-bottom:1px solid #e5edf4;padding:10px;vertical-align:top}#coverageInfo th{background:#e8f3ff;color:#15395d}#coverageInfo td small{display:block;color:#617287}#coverageInfo .cv-pill{display:inline-block;border-radius:8px;padding:3px 7px;font-size:12px;font-weight:650;background:#edf1f5;color:#46586b}#coverageInfo .cv-complete{background:#e2f6f1;color:#185c42}#coverageInfo .cv-incomplete{background:#fff2d8;color:#80530a}#coverageInfo .cv-failed,#coverageInfo .cv-unregistered{background:#ffeded;color:#8d3030}#coverageInfo summary{cursor:pointer;color:#085dbd}#coverageInfo details ul{margin:6px 0;padding-left:18px}#coverageInfo h2{font-size:18px;margin:14px 0 6px}
 </style><div class="soft-note"><b>Bevakningsluckor – vad Störningsradarn inte kan se.</b><p>Kommunanknytning bygger på källornas registrerade bevakningsområden, inte på antal händelser. En komplett kontroll av en källa betyder inte att hela kommunen eller alla störningstyper är täckta. Noll godkända träffar betyder inte att källan är otillgänglig.</p><p>Senaste validerade kontroll: ${esc(date(manifest?.last_attempt_at))}. Ej automatiserade källor hämtas från det befintliga källregistret (v1.9); de är inte nytestade här. Elbolag ingår inte i bevakningsuppdraget.</p>${data.ready?'':'<p><b>Kommunernas täckning kan inte bedömas ännu – fullständiga geografiska källuppgifter saknas.</b></p>'}</div>
 <h2>Kommuner · hela Sverige (${municipalities.length})</h2><div class="cv-cards">${order.filter(k=>k!=='unknown'||municipalCounts[k]).map(k=>card(muniLabels[k],municipalCounts[k])).join('')}</div>
 <h2>Källor · registrerade källor, inte antal aktörer</h2><div class="cv-cards">${Object.keys(labels).filter(k=>k!=='unknown'||sourceCounts[k]).map(k=>card(labels[k],sourceCounts[k])).join('')}</div>
 <div class="cv-controls"><label>Län<select id="cvCounty"><option value="all">Alla län</option>${options.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select></label><label>Sök kommun eller källa<input id="cvQuery" type="search" placeholder="Kommun, källnamn eller ID"></label><label><input id="cvAll" type="checkbox"> Visa även komplett kontrollerade</label></div>
 <h2>Kommuner <span id="cvMunicipalCount" class="subnote"></span></h2><div class="cv-table-wrap"><table><thead><tr><th>Kommun / län</th><th>Bevakningsstatus</th><th>Kopplade källor</th></tr></thead><tbody id="cvMunicipalRows"></tbody></table></div>
 <h2>Källor <span id="cvSourceCount" class="subnote"></span></h2><div class="cv-table-wrap"><table><thead><tr><th>Källa / originaladress</th><th>Registrerat område</th><th>Status och anledning</th><th>Senast lyckad kontroll / försök</th></tr></thead><tbody id="cvSourceRows"></tbody></table></div></section>`;
 const find=id=>main.querySelector('#'+id);
 const county=find('cvCounty'),query=find('cvQuery'),showAll=find('cvAll');
 county.value=options.includes(filterState.county)?filterState.county:'all';query.value=filterState.query;showAll.checked=filterState.showAll;
 function refresh(){
  filterState.county=county.value;filterState.query=query.value;filterState.showAll=showAll.checked;
  const q=query.value.trim().toLocaleLowerCase('sv'),matches=values=>values.join(' ').toLocaleLowerCase('sv').includes(q),inCounty=c=>county.value==='all'||c===county.value;
  const ms=municipalities.filter(m=>(showAll.checked||m.state!=='complete')&&inCounty(m.county)&&matches([m.name,m.county,...m.linked.flatMap(s=>[s.name,s.id])]));
  const ss=sources.filter(s=>(showAll.checked||s.state!=='complete')&&(county.value==='all'||s.municipalities.some(n=>inCounty(counties[n])))&&matches([s.name,s.id,...s.municipalities,...s.municipalities.map(n=>counties[n])]));
  find('cvMunicipalCount').textContent=`– ${ms.length} visas`;find('cvSourceCount').textContent=`– ${ss.length} visas`;
  find('cvMunicipalRows').innerHTML=ms.map(m=>`<tr><td><b>${esc(m.name)}</b><small>${esc(m.county)}</small></td><td>${statePill(m.state,muniLabels[m.state])}</td><td>${m.linked.length?`<details><summary>${m.linked.length} registrerade · ${m.linked.filter(s=>s.state==='complete').length} kompletta</summary><ul>${m.linked.map(s=>`<li>${link(s)} (${esc(s.id)}) – ${esc(labels[s.state])}</li>`).join('')}</ul></details>`:'Ingen i det aktuella registret'}</td></tr>`).join('')||'<tr><td colspan="3">Inga kommuner matchar urvalet.</td></tr>';
  find('cvSourceRows').innerHTML=ss.map(s=>`<tr><td><b>${link(s)}</b><small>${esc(s.id)}</small></td><td>${esc(s.municipalities.join(', ')||'Ej angivet')}</td><td>${statePill(s.state,labels[s.state])}<small>${esc(s.reason)}${s.state==='complete'&&s.accepted!==null?` Godkända träffar: ${s.accepted}.`:''}</small></td><td>${s.state==='outside'?'Ingår inte i ordinarie körning':`${esc(date(s.lastSuccess))}<small>Försök: ${esc(date(s.checked))}</small>`}</td></tr>`).join('')||'<tr><td colspan="4">Inga källor matchar urvalet.</td></tr>';
 }
 county.addEventListener('change',refresh);query.addEventListener('input',refresh);showAll.addEventListener('change',refresh);refresh();
}
return {parseCatalog,build,render,safeLink};
});
