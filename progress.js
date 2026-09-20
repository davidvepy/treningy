function reverseAliasMap(){const map={};for(const [key,ids] of Object.entries(LEGACY_ALIASES))for(const id of ids)map[id]=key;return map;}
function allExerciseCatalog(){
  const map=new Map();
  const add=(key,p,source)=>{const name=exerciseName(p,key);if(!validExerciseName(name))return;if(!map.has(key))map.set(key,{key,name,sk:exerciseSkName(p),payload:p,source});else if(source==='plan'){const x=map.get(key);x.name=name;x.sk=exerciseSkName(p);x.payload=p;x.source=source;}};
  for(const ex of state.planExercises)add(ex.exercise_key,safeJson(ex.payload),'plan');
  for(const ex of state.sessionExercises)add(ex.exercise_key,safeJson(ex.payload),'session');
  const reverse=reverseAliasMap();
  for(const row of state.legacyLogs){if(!validExerciseName(row.exercise_name))continue;const canonical=reverse[row.exercise_id];if(canonical){if(!map.has(canonical))map.set(canonical,{key:canonical,name:row.exercise_name,sk:'',payload:{},source:'legacy'});}else{const key=`legacy:${row.exercise_id}`;if(!map.has(key))map.set(key,{key,name:row.exercise_name,sk:'',payload:{},source:'legacy'});}}
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'sk'));
}
function legacyIdsForKey(key){if(key.startsWith('legacy:'))return[key.slice(7)];return LEGACY_ALIASES[key]||[];}
function exerciseHistoryPoints(key){
  const byDate=new Map();
  for(const ex of state.sessionExercises.filter(x=>x.exercise_key===key)){
    const s=state.sessions.find(x=>x.id===ex.session_id&&x.status==='completed');if(!s)continue;
    const sets=state.sets.filter(st=>st.session_id===s.id&&st.exercise_id===ex.id&&st.complete&&(st.set_type||'working')!=='warmup');if(!sets.length)continue;
    const point={date:s.recorded_date,source:'normalized',sets,maxWeight:Math.max(0,...sets.map(x=>n(x.weight,0))),est1RM:Math.max(0,...sets.map(x=>estimate1RM(x.weight,x.reps)||0)),tonnage:sets.reduce((a,x)=>a+setTonnage(x,ex),0),reps:sets.reduce((a,x)=>a+n(x.reps,0),0),partial:isPartialSession(s)};
    byDate.set(point.date,point);
  }
  const ids=new Set(legacyIdsForKey(key));
  const grouped={};for(const row of state.legacyLogs.filter(r=>ids.has(r.exercise_id)))(grouped[row.performed_on]??=[]).push(row);
  for(const [date,rows] of Object.entries(grouped)){
    if(byDate.has(date))continue;
    let maxWeight=0,est=0,tonnage=0,reps=0;const sets=[];
    for(const row of rows){const w=n(row.weight_kg,0);maxWeight=Math.max(maxWeight,w);tonnage+=legacyTonnage(row);for(const r of row.reps||[]){const rr=n(r,0);reps+=rr;est=Math.max(est,estimate1RM(w,rr)||0);sets.push({weight:w,reps:rr,complete:true,set_type:'working'});}}
    byDate.set(date,{date,source:'legacy',sets,maxWeight,est1RM:est,tonnage,reps,partial:true});
  }
  return [...byDate.values()].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function latestExerciseDef(key){const active=state.activeExercises.find(x=>x.exercise_key===key);if(active)return active;const plan=state.planExercises.find(x=>x.exercise_key===key);if(plan)return plan;return [...state.sessionExercises].reverse().find(x=>x.exercise_key===key)||null;}

function renderProgress(){
  const tabs=[['exercises','Cviky'],['tonnage','Tonáž'],['body','Telo']];
  let body='';if(state.progressTab==='tonnage')body=renderTonnageProgress();else if(state.progressTab==='body')body=renderBodyProgress();else body=renderExerciseProgressList();
  const content=`<header class="page-title"><h1>Progres</h1></header><div class="subtabs">${tabs.map(([k,l])=>`<button data-progress-tab="${k}" class="${state.progressTab===k?'active':''}">${l}</button>`).join('')}</div>${body}`;
  app.innerHTML=shell(content,'progress');bindNav();document.querySelectorAll('[data-progress-tab]').forEach(b=>b.onclick=()=>{state.progressTab=b.dataset.progressTab;renderProgress();});bindProgressBody();
}
function renderExerciseProgressList(){
  const all=allExerciseCatalog(),q=state.progressSearch.toLowerCase(),items=all.filter(x=>`${x.name} ${x.sk}`.toLowerCase().includes(q));
  return `<div class="search-wrap"><input id="exercise-search" placeholder="Hľadať cvik" value="${h(state.progressSearch)}"></div><div class="progress-exercises">${items.map(x=>{const pts=exerciseHistoryPoints(x.key),last=pts.at(-1),best=Math.max(0,...pts.map(p=>p.maxWeight||0));return `<button data-progress-key="${h(x.key)}"><div><strong>${h(x.name)}</strong>${x.sk&&x.sk!==x.name?`<span>${h(x.sk)}</span>`:''}</div><div><b>${best?`${fmtNumber(best)} kg`:'—'}</b><span>${last?`${pts.length} tréningov`:'bez histórie'}</span></div></button>`}).join('')}</div>`;
}
function workoutTonnageEntries(){
  const normalized=state.sessions.filter(s=>s.status==='completed').map(s=>{const p=safeJson(s.payload),st=sessionStats(s.id);return{date:s.recorded_date,title:p.title||'Tréning',tonnage:st.tonnage,sets:st.workingSets,partial:isPartialSession(s)||String(p.source||'').includes('import')};});
  const dates=new Set(normalized.map(x=>x.date));const legacy=Object.entries(legacyGroups()).filter(([d])=>!dates.has(d)).map(([date,rows])=>{const st=legacyDayStats(rows);return{date,title:'Historický tréning',tonnage:st.tonnage,sets:st.workingSets,partial:true};});
  return[...normalized,...legacy].sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function renderTonnageProgress(){const pts=workoutTonnageEntries();return `<div class="info-note">Tonáž = externá záťaž × opakovania. Warm-up a bodyweight sa nezapočítavajú. Je to objem práce, nie skóre kvality tréningu.</div><div class="chart-card light"><canvas id="tonnage-chart"></canvas></div><div class="tonnage-list">${[...pts].reverse().map(x=>`<div><span>${isoDate(x.date)}${x.partial?' · čiastočný záznam':''}</span><strong>${x.tonnage?`${fmtNumber(x.tonnage/1000,2)} t`:'—'}</strong><small>${x.sets} sérií</small></div>`).join('')||'<div class="empty-card">Zatiaľ bez tonáže.</div>'}</div>`;}
function renderBodyProgress(){const rows=[...state.measurements].sort((a,b)=>String(b.measured_on).localeCompare(String(a.measured_on))),latest=rows[0];return `<div class="body-summary">${latest?`<div><span>Hmotnosť</span><b>${fmtNumber(latest.weight_kg)} kg</b></div><div><span>Pás</span><b>${fmtNumber(latest.waist_cm)} cm</b></div>`:'<div><span>Merania</span><b>—</b></div>'}</div><form class="measurement-form" id="measurement-form"><input id="m-date" type="date" value="${todayIso()}" required><input id="m-weight" type="number" step="0.1" inputmode="decimal" placeholder="Hmotnosť kg" required><input id="m-waist" type="number" step="0.1" inputmode="decimal" placeholder="Pás cm" required><button type="submit">ULOŽIŤ MERANIE</button></form><div class="measurement-list">${rows.map(m=>`<div><span>${isoDate(m.measured_on)}</span><b>${fmtNumber(m.weight_kg)} kg</b><b>${fmtNumber(m.waist_cm)} cm</b></div>`).join('')}</div>`;}
function bindProgressBody(){
  const search=document.getElementById('exercise-search');if(search)search.oninput=e=>{state.progressSearch=e.target.value;renderProgress();setTimeout(()=>{const x=document.getElementById('exercise-search');x?.focus();x?.setSelectionRange(x.value.length,x.value.length);},0);};
  document.querySelectorAll('[data-progress-key]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.progressKey)}`));
  if(state.progressTab==='tonnage')drawTonnageChart(workoutTonnageEntries());
  const form=document.getElementById('measurement-form');if(form)form.onsubmit=saveMeasurement;
}
async function saveMeasurement(e){e.preventDefault();const date=document.getElementById('m-date').value,weight=n(document.getElementById('m-weight').value),waist=n(document.getElementById('m-waist').value);if(!date||weight===null||waist===null)return;const existing=state.measurements.find(x=>x.measured_on===date);let r;if(existing)r=await supabase.from('body_measurements').update({weight_kg:weight,waist_cm:waist}).eq('user_id',state.user.id).eq('id',existing.id);else r=await supabase.from('body_measurements').insert({id:Date.now(),user_id:state.user.id,measured_on:date,weight_kg:weight,waist_cm:waist});if(r.error)return toast('Meranie sa nepodarilo uložiť.','error');toast('Meranie uložené.');await loadCore(false);state.progressTab='body';renderProgress();}

function renderExerciseDetail(idOrKey){
  let activeEx=state.activeExercises.find(x=>x.id===idOrKey),key=activeEx?.exercise_key||idOrKey;const catalog=allExerciseCatalog().find(x=>x.key===key);let def=activeEx||latestExerciseDef(key);const p=safeJson(def?.payload),name=activeEx?exerciseName(p,key):(catalog?.name||exerciseName(p,key));if(!validExerciseName(name))return updateUrl('#/progress');
  const pts=exerciseHistoryPoints(key),bestWeight=Math.max(0,...pts.map(x=>x.maxWeight||0)),best1rm=Math.max(0,...pts.map(x=>x.est1RM||0)),latest=pts.at(-1),alts=parseAlternatives(p.alternative||''),muscles=def?musclesFor(p.pattern,p.englishName||p.name):[];
  const technique=def?`<div class="detail-section"><h2>Technika</h2>${techniqueCards(p,muscles)}</div>`:`<div class="info-note">Toto je historický cvik zo starého tréningového logu. Technický popis k nemu ešte nie je priradený.</div>`;
  const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${h(exerciseSkName(p)||'Detail cviku')}</span><h1>${h(name)}</h1></div></div>
    ${def?`<div class="exercise-prescription"><span>${h(p.sets??'—')}×${h(p.repMin??'?')}${p.repMax&&p.repMax!==p.repMin?`–${h(p.repMax)}`:''}</span><span>${fmtNumber(p.weight)} kg</span><span>pauza ${h(restLabel(p))}</span></div>`:''}
    <div class="stats-row"><div><span>Najvyššia váha</span><b>${bestWeight?`${fmtNumber(bestWeight)} kg`:'—'}</b></div><div><span>Odhad 1RM</span><b>${best1rm?`${fmtNumber(best1rm)} kg`:'—'}</b></div><div><span>Tréningy</span><b>${pts.length}</b></div></div>
    <div class="metric-tabs"><button data-metric="maxWeight" class="${state.chartMetric==='maxWeight'?'active':''}">Pracovná váha</button><button data-metric="est1RM" class="${state.chartMetric==='est1RM'?'active':''}">Odhad 1RM</button></div>
    <div class="chart-card light"><canvas id="exercise-chart"></canvas><p>1RM je orientačný odhad podľa Epleyho vzorca. Pri sériách nad 15 opakovaní ho nepočítame.</p></div>
    ${technique}
    ${alts.length?`<div class="detail-section"><h2>Alternatívy</h2><div class="alternative-list">${alts.map(a=>`<div><b>${h(a.name)}</b><span>${h(a.detail)}</span></div>`).join('')}</div></div>`:''}
    <div class="detail-section"><h2>História</h2><div class="exercise-history-list">${[...pts].reverse().map(x=>`<div><span>${isoDate(x.date)}${x.partial?' · historický/čiastočný':''}</span><b>${x.maxWeight?`${fmtNumber(x.maxWeight)} kg`:'—'}</b><small>${x.est1RM?`1RM ≈ ${fmtNumber(x.est1RM)} kg`:'1RM bez odhadu'}</small></div>`).join('')||'<div class="empty-card">Zatiaľ bez výkonu.</div>'}</div></div>`;
  app.innerHTML=shell(content,activeEx?'training':'progress');bindNav();document.getElementById('back').onclick=()=>history.back();document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{state.chartMetric=b.dataset.metric;renderExerciseDetail(idOrKey);});drawExerciseChart(pts,state.chartMetric);
}
function restLabel(p){const a=n(p.restMinSeconds,null),b=n(p.restSeconds,null);return a&&b&&a!==b?`${a}–${b} s`:`${b||a||0} s`;}
function techniqueCards(p,muscles){const how=Array.isArray(p.how)?p.how:[];return `<div class="tech-list"><div><b>Setup</b><p>${h(how[0]||'Nastav stabilnú pozíciu a kontrolovaný rozsah.')}</p></div><div><b>Vykonanie</b><p>${h(how.slice(1).join(' ')||'Pohyb veď kontrolovane bez švihu.')}</p></div><div><b>Čo cítiť</b><p>${h(muscles.length?muscles.join(' · '):'Cieľovú svalovú skupinu bez ostrej kĺbovej bolesti.')}</p></div><div><b>Častá chyba</b><p>${h(p.mistake||'Strata kontroly alebo kompenzácia trupom.')}</p></div></div>`;}
function musclesFor(pattern,name=''){const p=String(pattern||'').toLowerCase(),x=String(name).toLowerCase();if(p==='horizontal_push'||/press|fly|pec/.test(x))return['Hrudník','predný delt','triceps'];if(p==='vertical_pull'||/pulldown|pull-up/.test(x))return['Široký sval chrbta','biceps','horný chrbát'];if(p==='horizontal_pull'||/row/.test(x))return['Stred chrbta','latissimus','zadný delt','biceps'];if(p==='hinge'||/deadlift|rdl/.test(x))return['Hamstringy','sedacie svaly','vzpriamovače'];if(p==='squat'||/squat/.test(x))return['Kvadricepsy','sedacie svaly','adduktory'];if(/lateral raise/.test(x))return['Bočný delt'];if(/curl/.test(x))return['Biceps','brachialis'];if(/pushdown|triceps/.test(x))return['Triceps'];return[];}
function drawLineChart(canvasId,points,metric,labelFormatter){const canvas=document.getElementById(canvasId);if(!canvas)return;const rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,rect.width*dpr);canvas.height=Math.max(1,rect.height*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);const W=rect.width,H=rect.height,pad={l:42,r:12,t:16,b:28};c.clearRect(0,0,W,H);const valid=points.filter(p=>n(p[metric],0)>0);if(!valid.length){c.fillStyle='#7b8190';c.font='12px system-ui';c.fillText('Zatiaľ bez dát.',12,28);return;}const vals=valid.map(p=>n(p[metric],0)),min0=Math.min(...vals),max0=Math.max(...vals),spread=Math.max(1,max0-min0),min=Math.max(0,min0-spread*.18),max=max0+spread*.18;c.strokeStyle='#e7e9ee';c.lineWidth=1;for(let i=0;i<4;i++){const y=pad.t+(H-pad.t-pad.b)*i/3;c.beginPath();c.moveTo(pad.l,y);c.lineTo(W-pad.r,y);c.stroke();c.fillStyle='#8a8f9c';c.font='10px system-ui';c.textAlign='right';c.fillText(labelFormatter(max-(max-min)*i/3),pad.l-6,y+3);}const xy=valid.map((p,i)=>({x:valid.length===1?(pad.l+W-pad.r)/2:pad.l+(W-pad.l-pad.r)*i/(valid.length-1),y:pad.t+(H-pad.t-pad.b)*(1-(n(p[metric],0)-min)/(max-min||1)),p}));c.strokeStyle='#1677ff';c.lineWidth=2.5;c.beginPath();xy.forEach((pt,i)=>i?c.lineTo(pt.x,pt.y):c.moveTo(pt.x,pt.y));c.stroke();c.fillStyle='#1677ff';for(const pt of xy){c.beginPath();c.arc(pt.x,pt.y,3.5,0,Math.PI*2);c.fill();}c.fillStyle='#8a8f9c';c.font='9px system-ui';c.textAlign='center';const labels=xy.length<=5?xy:xy.filter((_,i)=>i===0||i===xy.length-1||i===Math.floor((xy.length-1)/2));for(const pt of labels)c.fillText(new Date(`${pt.p.date}T12:00:00`).toLocaleDateString('sk-SK',{day:'numeric',month:'numeric'}),pt.x,H-7);}
function drawExerciseChart(points,metric){drawLineChart('exercise-chart',points,metric,v=>`${fmtNumber(v)} kg`);}
function drawTonnageChart(points){drawLineChart('tonnage-chart',points,'tonnage',v=>`${fmtNumber(v/1000,1)} t`);}

/* ===== v3.3 progress + exercise editor overrides ===== */
function renderExerciseProgressList(){
  const all=allExerciseCatalog(),q=state.progressSearch.toLowerCase();
  return `<div class="search-wrap modern-search"><span>⌕</span><input id="exercise-search" placeholder="Hľadať cvik" value="${h(state.progressSearch)}"></div><div class="progress-exercises" id="progress-exercise-list">${all.map(x=>{const pts=exerciseHistoryPoints(x.key),last=pts.at(-1),best=Math.max(0,...pts.map(p=>p.maxWeight||0)),search=`${x.name} ${x.sk}`.toLowerCase(),hidden=q&&!search.includes(q);return `<button data-progress-key="${h(x.key)}" data-search-text="${h(search)}" style="${hidden?'display:none':''}"><div><strong>${h(x.name)}</strong>${x.sk&&x.sk!==x.name?`<span>${h(x.sk)}</span>`:''}</div><div><b>${best?`${fmtNumber(best)} kg`:'—'}</b><span>${last?`${pts.length} záznamov`:'bez histórie'}</span></div></button>`}).join('')}</div>`;
}
function bindProgressBody(){
  const search=document.getElementById('exercise-search');if(search)search.oninput=e=>{state.progressSearch=e.target.value;const q=state.progressSearch.toLowerCase();document.querySelectorAll('#progress-exercise-list [data-search-text]').forEach(b=>{b.style.display=!q||b.dataset.searchText.includes(q)?'':'none';});};
  document.querySelectorAll('[data-progress-key]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.progressKey)}`));
  if(state.progressTab==='tonnage')drawTonnageChart(workoutTonnageEntries());
  const form=document.getElementById('measurement-form');if(form)form.onsubmit=saveMeasurement;
}
function editorPlanRow(key,activeEx){
  const ep=safeJson(activeEx?.payload);
  if(ep.templateExerciseId&&ep.templateWorkoutId){const x=state.planExercises.find(r=>r.id===ep.templateExerciseId&&r.workout_id===ep.templateWorkoutId);if(x)return x;}
  return state.planExercises.find(r=>r.exercise_key===key)||null;
}
function renderExerciseDetail(idOrKey){
  const activeEx=state.activeExercises.find(x=>x.id===idOrKey)||null;
  const key=activeEx?.exercise_key||idOrKey;
  const catalog=allExerciseCatalog().find(x=>x.key===key)||null;
  const def=activeEx||latestExerciseDef(key)||catalog;
  const p=safeJson(def?.payload),name=activeEx?exerciseName(p,key):(catalog?.name||exerciseName(p,key));
  if(!validExerciseName(name)){app.innerHTML=shell('<div class="empty-card">Tento cvik nemá platný názov.</div>','progress');bindNav();return;}
  const pts=exerciseHistoryPoints(key),bestWeight=Math.max(0,...pts.map(x=>x.maxWeight||0)),best1rm=Math.max(0,...pts.map(x=>x.est1RM||0)),alts=parseAlternatives(p.alternative||''),muscles=def?.payload?musclesFor(p.pattern,p.englishName||p.name):[];
  const planRow=editorPlanRow(key,activeEx),editable=!!planRow;
  const technique=def?.payload?`<div class="detail-section"><h2>Technika</h2>${techniqueCards(p,muscles)}</div>`:`<div class="info-note">Historický cvik bez priradeného technického popisu.</div>`;
  const editor=editable?`<div class="detail-section"><div class="detail-section-title"><h2>Upraviť cvik</h2><button id="toggle-exercise-edit">${state.editExerciseOpen?'Zavrieť':'Upraviť'}</button></div><form class="exercise-editor ${state.editExerciseOpen?'open':''}" id="exercise-editor"><label>Slovenský názov<input id="edit-name-sk" value="${h(p.name||'')}"></label><label>Anglický názov<input id="edit-name-en" value="${h(p.englishName||'')}"></label><div class="editor-grid"><label>Série<input id="edit-sets" type="number" min="1" value="${h(p.sets??3)}"></label><label>Od reps<input id="edit-rep-min" type="number" min="1" value="${h(p.repMin??8)}"></label><label>Do reps<input id="edit-rep-max" type="number" min="1" value="${h(p.repMax??10)}"></label><label>Váha kg<input id="edit-weight" type="number" step="0.25" value="${h(p.weight??0)}"></label><label>Pauza s<input id="edit-rest" type="number" min="0" value="${h(p.restSeconds??p.restMinSeconds??90)}"></label></div><button type="submit">ULOŽIŤ ZMENY</button></form></div>`:'';
  const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${h(exerciseSkName(p)||'Detail cviku')}</span><h1>${h(name)}</h1></div></div>
    ${def?.payload?`<div class="exercise-prescription"><span>${h(p.sets??'—')}×${h(p.repMin??'?')}${p.repMax&&p.repMax!==p.repMin?`–${h(p.repMax)}`:''}</span><span>${fmtNumber(p.weight)} kg</span><span>pauza ${h(restLabel(p))}</span></div>`:''}
    <div class="stats-row"><div><span>Najvyššia váha</span><b>${bestWeight?`${fmtNumber(bestWeight)} kg`:'—'}</b></div><div><span>Odhad 1RM</span><b>${best1rm?`${fmtNumber(best1rm)} kg`:'—'}</b></div><div><span>Záznamy</span><b>${pts.length}</b></div></div>
    <div class="metric-tabs"><button data-metric="maxWeight" class="${state.chartMetric==='maxWeight'?'active':''}">Pracovná váha</button><button data-metric="est1RM" class="${state.chartMetric==='est1RM'?'active':''}">Odhad 1RM</button></div>
    <div class="chart-card light"><canvas id="exercise-chart"></canvas><p>1RM je orientačný odhad podľa Epleyho vzorca. Pri sériách nad 15 opakovaní ho nepočítame.</p></div>
    ${editor}${technique}
    ${alts.length?`<div class="detail-section"><h2>Alternatívy</h2><div class="alternative-list">${alts.map(a=>`<div><b>${h(a.name)}</b><span>${h(a.detail)}</span></div>`).join('')}</div></div>`:''}
    <div class="detail-section"><h2>História</h2><div class="exercise-history-list">${[...pts].reverse().map(x=>`<div><span>${isoDate(x.date)}${x.partial?' · historický/čiastočný':''}</span><b>${x.maxWeight?`${fmtNumber(x.maxWeight)} kg`:'—'}</b><small>${x.est1RM?`1RM ≈ ${fmtNumber(x.est1RM)} kg`:'1RM bez odhadu'}</small></div>`).join('')||'<div class="empty-card">Zatiaľ bez výkonu.</div>'}</div></div>`;
  app.innerHTML=shell(content,activeEx?'training':'progress');bindNav();document.getElementById('back').onclick=()=>history.back();
  document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{state.chartMetric=b.dataset.metric;renderExerciseDetail(idOrKey);});
  const toggle=document.getElementById('toggle-exercise-edit');if(toggle)toggle.onclick=()=>{state.editExerciseOpen=!state.editExerciseOpen;renderExerciseDetail(idOrKey);};
  const form=document.getElementById('exercise-editor');if(form)form.onsubmit=e=>saveExerciseEdits(e,key,activeEx,planRow,idOrKey);
  requestAnimationFrame(()=>drawExerciseChart(pts,state.chartMetric));
}
async function saveExerciseEdits(e,key,activeEx,planRow,idOrKey){
  e.preventDefault();if(!planRow)return;
  const current={...safeJson(planRow.payload)};
  const next={...current,name:document.getElementById('edit-name-sk').value.trim()||current.name,englishName:document.getElementById('edit-name-en').value.trim()||current.englishName,sets:n(document.getElementById('edit-sets').value,current.sets),repMin:n(document.getElementById('edit-rep-min').value,current.repMin),repMax:n(document.getElementById('edit-rep-max').value,current.repMax),weight:n(document.getElementById('edit-weight').value,current.weight),restSeconds:n(document.getElementById('edit-rest').value,current.restSeconds)};
  let r=await supabase.from('trainer_hub_workout_exercises').update({payload:next}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',planRow.workout_id).eq('id',planRow.id);
  if(r.error)return toast('Cvik sa nepodarilo upraviť.','error');
  planRow.payload=next;
  if(activeEx){const activePayload={...safeJson(activeEx.payload),...next,templateExerciseId:safeJson(activeEx.payload).templateExerciseId,templateWorkoutId:safeJson(activeEx.payload).templateWorkoutId};r=await supabase.from('trainer_hub_session_exercises').update({payload:activePayload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',activeEx.session_id).eq('id',activeEx.id);if(!r.error){activeEx.payload=activePayload;await reconcileActiveSetCount(activeEx,n(next.sets,3));}}
  state.editExerciseOpen=false;toast('Cvik upravený v pláne.');renderExerciseDetail(idOrKey);
}
async function reconcileActiveSetCount(ex,target){
  let rows=state.activeSets.filter(x=>x.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal);
  while(rows.length<target){const last=rows.at(-1),row={owner_id:state.user.id,client_id:CLIENT_ID,session_id:ex.session_id,exercise_id:ex.id,id:`set-${rows.length+1}-${crypto.randomUUID().slice(0,8)}`,ordinal:rows.length+1,weight:n(last?.weight,n(safeJson(ex.payload).weight,0)),reps:n(last?.reps,n(safeJson(ex.payload).repMin,8)),rir:null,complete:false,set_type:'working',completed_at:null};const r=await supabase.from('trainer_hub_workout_sets').insert(row);if(r.error)break;state.sets.push(row);state.activeSets.push(row);rows.push(row);}
  while(rows.length>target){const row=rows.at(-1);if(row.complete)break;const r=await supabase.from('trainer_hub_workout_sets').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',row.session_id).eq('exercise_id',row.exercise_id).eq('id',row.id);if(r.error)break;state.sets=state.sets.filter(x=>x.id!==row.id);state.activeSets=state.activeSets.filter(x=>x.id!==row.id);rows.pop();}
}
