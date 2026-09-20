function renderTraining(){
  clearInterval(state.elapsedTick);
  const templates=strengthTemplates(), next=nextPlannedWorkout();
  const active=state.activeSession;
  const content=`<div class="page-head"><div><div class="eyebrow">Tréningový tracker</div><h1>Dnes ide o výkon.</h1><p>${state.plan?h(safeJson(state.plan.payload).title):'Aktívny plán sa nenašiel.'}</p></div><div class="sync-pill ${state.online?'':'offline'}" id="sync-pill"><i class="sync-dot"></i><span>${state.online?'online':'offline'}</span></div></div>
  <div class="card hero"><h2 class="hero-title">${active?'Rozcvičené? Pokračuj.':'Pripravený začať?'}</h2><p class="hero-copy">${active?`${h(safeJson(active.payload).title||'Aktívny tréning')} je stále otvorený.`:'Jedným tapom spustíš dnešný silový tréning. Všetky série zostanú na jednej obrazovke.'}</p><button class="primary" id="main-start">${active?'POKRAČOVAŤ V TRÉNINGU':'ZAČAŤ TRÉNING'}</button></div>
  <div class="section-title" id="templates-title"><h2>Templates</h2><span>A / B / C</span></div>
  <div class="templates">${['A','B','C'].map(k=>{const w=templates[k];return `<button class="template" data-template="${k}" ${!w?'disabled':''}><strong>${k}</strong><small>${h(templateSubtitle(w))}</small></button>`}).join('')}</div>
  <div class="section-title"><h2>Najbližší plán</h2><span>${next?(next.delta===0?'dnes':next.delta===1?'zajtra':`o ${next.delta} dni`):''}</span></div>
  ${next?`<div class="card next-card"><div class="next-badge">${workoutBadge(next.w)}</div><div><h3>${h(safeJson(next.w.payload).title)}</h3><p>${h(safeJson(next.w.payload).instructions||safeJson(next.w.payload).objective||safeJson(next.w.payload).type||'')}</p></div></div>`:`<div class="card empty">V aktívnom pláne nie je naplánovaná jednotka.</div>`}
  <div class="section-title"><h2>Posledný tréning</h2><span>${state.sessions.filter(s=>s.status==='completed').length} uložených</span></div>${renderLastSessionCard()}`;
  app.innerHTML=shell(content,'training'); bindNav();
  document.getElementById('main-start').onclick=()=>{
    if(active) return updateUrl('#/active');
    const jsDay=new Date().getDay(); const key=jsDay===2?'A':jsDay===4?'B':jsDay===6?'C':null;
    if(key && templates[key]) startWorkout(key,templates[key]);
    else { document.getElementById('templates-title').scrollIntoView({behavior:'smooth',block:'center'}); toast('Vyber A, B alebo C.'); }
  };
  document.querySelectorAll('[data-template]').forEach(btn=>btn.onclick=()=>{const k=btn.dataset.template;if(templates[k])startWorkout(k,templates[k]);});
  document.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>updateUrl(`#/session/${encodeURIComponent(b.dataset.session)}`));
  renderSyncState();
}
function renderLastSessionCard(){
  const s=state.sessions.find(x=>x.status==='completed'); if(!s) return '<div class="card empty">Zatiaľ bez dokončeného tréningu.</div>';
  const st=sessionStats(s.id); return `<button class="feed-item" style="width:100%" data-session="${h(s.id)}"><div class="feed-date"><div><b>${shortDate(s.recorded_date).day}</b><span>${h(shortDate(s.recorded_date).month)}</span></div></div><div class="feed-main"><h3>${h(safeJson(s.payload).title||'Silový tréning')}</h3><p>${st.workingSets} pracovných sérií · ${formatDuration(sessionDuration(s))}</p></div><div class="feed-metric"><b>${fmtNumber(st.tonnage/1000,2)} t</b><span>tonáž</span></div></button>`;
}
function renderSyncState(){
  const pill=document.getElementById('sync-pill'); if(!pill)return; pill.classList.toggle('offline',!state.online); const s=pill.querySelector('span'); if(s)s.textContent=state.online?'online':'offline';
}

async function startWorkout(templateKey,workout){
  if(state.activeSession){ toast('Najprv dokonči otvorený tréning.'); return updateUrl('#/active'); }
  const uid=state.user.id, p=safeJson(workout.payload), planEx=state.planExercises.filter(x=>x.workout_id===workout.id).sort((a,b)=>a.ordinal-b.ordinal);
  if(!planEx.length) return toast('Template nemá pracovné cviky.','error');
  toast('Zakladám tréning…');
  const id=`session-${Date.now()}-${crypto.randomUUID().slice(0,8)}`, startedAt=new Date().toISOString();
  const session={owner_id:uid,client_id:CLIENT_ID,id,recorded_date:todayIso(),status:'active',payload:{id,date:todayIso(),status:'active',title:p.title||`Tréning ${templateKey}`,type:'Silový tréning',template:templateKey,workoutId:workout.id,planId:state.plan?.id||null,startedAt,source:'tracker_v2',version:APP_VERSION,ramp:p.ramp||[],rampChecks:{}}};
  const previousMap=buildPreviousMap(id);
  const sessionExercises=planEx.map((ex,index)=>{
    const ep={...safeJson(ex.payload)}; const sid=`ex-${index+1}-${slugify(ep.exerciseKey||ex.exercise_key).slice(0,30)}`;
    const suggestion=suggestNextWeight(ex.exercise_key,ep,previousMap[ex.exercise_key]);
    ep.weight=suggestion.weight;
    ep.suggestedReason=suggestion.reason;
    ep.note=''; ep.pain=0; ep.replacedFrom=null;
    return {owner_id:uid,client_id:CLIENT_ID,session_id:id,id:sid,ordinal:index+1,exercise_key:ex.exercise_key,payload:ep};
  });
  const sets=[];
  for(const ex of sessionExercises){
    const ep=safeJson(ex.payload), prev=previousMap[ex.exercise_key]?.sets||[];
    for(let i=1;i<=n(ep.sets,3);i++){
      const ps=prev[i-1];
      sets.push({owner_id:uid,client_id:CLIENT_ID,session_id:id,exercise_id:ex.id,id:`set-${i}-${crypto.randomUUID().slice(0,8)}`,ordinal:i,weight:n(ps?.weight,n(ep.weight,0)),reps:n(ps?.reps,n(ep.repMin,8)),rir:n(ps?.rir,n(ep.rirMax,n(ep.rirMin,2))),complete:false,set_type:'working',completed_at:null});
    }
  }
  const sr=await supabase.from('trainer_hub_workout_sessions').insert(session); if(sr.error) return toast(`Tréning sa nepodarilo spustiť: ${sr.error.message}`,'error',4500);
  const er=await supabase.from('trainer_hub_session_exercises').insert(sessionExercises); if(er.error) return toast(`Cviky sa nepodarilo uložiť: ${er.error.message}`,'error',4500);
  const wr=await supabase.from('trainer_hub_workout_sets').insert(sets); if(wr.error) return toast(`Série sa nepodarilo uložiť: ${wr.error.message}`,'error',4500);
  state.sessions.unshift(session); state.sessionExercises.push(...sessionExercises); state.sets.push(...sets); setActiveFromCore(session); updateUrl('#/active');
}

function buildPreviousMap(excludeSessionId=null){
  const completedIds=new Set(state.sessions.filter(s=>s.status==='completed'&&s.id!==excludeSessionId).sort((a,b)=>String(b.recorded_date).localeCompare(String(a.recorded_date))).map(s=>s.id));
  const orderedSessions=[...state.sessions].filter(s=>completedIds.has(s.id)).sort((a,b)=>String(b.recorded_date).localeCompare(String(a.recorded_date)));
  const map={};
  for(const s of orderedSessions){
    for(const ex of state.sessionExercises.filter(x=>x.session_id===s.id)){
      if(map[ex.exercise_key]) continue;
      const sets=state.sets.filter(x=>x.session_id===s.id&&x.exercise_id===ex.id&&x.complete!==false).sort((a,b)=>a.ordinal-b.ordinal);
      if(sets.length) map[ex.exercise_key]={session:s,exercise:ex,sets};
    }
  }
  return map;
}
function suggestNextWeight(key,ep,prevEntry){
  const planned=n(ep.weight,0), step=n(ep.step,0);
  if(!prevEntry?.sets?.length) return {weight:planned,reason:'Plánovaná pracovná váha'};
  const prevEp=safeJson(prevEntry.exercise.payload), pain=n(prevEp.pain,0), note=String(prevEp.note||'').toLowerCase();
  const targetSets=n(ep.sets,prevEntry.sets.length), work=prevEntry.sets.filter(s=>(s.set_type||'working')==='working').slice(0,targetSets);
  const lastWeight=n(work[0]?.weight,planned);
  if(work.length<targetSets) return {weight:lastWeight,reason:'Zostáva, chýbali pracovné série'};
  if(pain>=3 || /boles|pich|technik/.test(note)) return {weight:lastWeight,reason:'Bez navýšenia, poznámka/bolesť'};
  const rirMin=n(ep.rirMin,null), rirMax=n(ep.rirMax,null), repMax=n(ep.repMax,null);
  const rirKnown=work.every(s=>n(s.rir,null)!==null);
  const top=repMax!==null && work.every(s=>n(s.reps,0)>=repMax);
  const rirOk=rirKnown && work.every(s=>{const r=n(s.rir);return (rirMin===null||r>=rirMin)&&(rirMax===null||r<=rirMax);});
  if(top&&rirOk&&step>0) return {weight:lastWeight+step,reason:`Double progression: splnený vrch rozsahu → +${fmtNumber(step)} kg`};
  return {weight:lastWeight,reason:top&&!rirOk?'Opakovania splnené, RIR ešte nie':'Zostáva, najprv doplň opakovania'};
}

function renderActive(){
  const s=state.activeSession;
  if(!s) return updateUrl('#/training');
  clearInterval(state.elapsedTick);
  const p=safeJson(s.payload), previous=buildPreviousMap(s.id), next=nextIncomplete();
  app.innerHTML=`<main class="active-shell"><header class="active-top"><div class="active-row"><div class="active-title"><strong>${h(p.title||'Aktívny tréning')}</strong><span id="elapsed">${elapsedText(p.startedAt)}</span></div><button class="finish-btn" id="finish-workout">Dokončiť</button></div>
  <div class="timer-bar ${state.timer?'on':''}" id="timer-bar"><div class="timer-label"><b class="count">0:00</b><small data-timer-label>${h(state.timer?.label||'Prestávka')}</small></div><div class="timer-actions"><button id="minus-rest">−30</button><button id="plus-rest">+30</button><button id="skip-rest">Preskočiť</button></div></div></header>
  <section class="active-body">${renderRamp(p)}${state.activeExercises.map(ex=>renderExerciseCard(ex,previous[ex.exercise_key],next?.exercise_id===ex.id,next?.set_id)).join('')}</section></main>`;
  bindActive(); renderTimerOnly(); ensureTimerTick();
  state.elapsedTick=setInterval(()=>{const el=document.getElementById('elapsed');if(el)el.textContent=elapsedText(p.startedAt);},1000);
  const nextRow=document.querySelector('tr.next-set'); if(nextRow) setTimeout(()=>nextRow.scrollIntoView({behavior:'smooth',block:'center'}),120);
}
function renderRamp(p){
  const ramp=Array.isArray(p.ramp)?p.ramp:[]; if(!ramp.length)return'';
  const checks=safeJson(p.rampChecks);
  return `<details class="card ramp" open><summary>RAMP <span>nezapočítava sa do tonáže</span></summary><div class="ramp-grid">${ramp.map((g,gi)=>`<div class="ramp-group"><div class="ramp-code"><b>${h(g.code)}</b><span>${h(g.name)}</span></div>${(g.items||[]).map((item,ii)=>{const key=`${gi}-${ii}`;return `<label class="ramp-item"><input type="checkbox" data-ramp="${key}" ${checks[key]?'checked':''}><p>${h(item.name)}<small>${h(item.dose||'')}</small></p></label>`}).join('')}</div>`).join('')}</div></details>`;
}
function renderExerciseCard(ex,prev,isNext,nextSetId){
  const ep=safeJson(ex.payload), sets=state.activeSets.filter(s=>s.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal);
  const target=`${ep.sets||sets.length}×${ep.repMin||'?'}${ep.repMax&&ep.repMax!==ep.repMin?`–${ep.repMax}`:''}`;
  const rir=ep.rirMin!==undefined&&ep.rirMin!==null ? (ep.rirMax!==undefined&&ep.rirMax!==ep.rirMin?`${ep.rirMin}–${ep.rirMax}`:`${ep.rirMin}`) : '—';
  return `<article class="exercise-card ${isNext?'next':''}" data-exercise-card="${h(ex.id)}"><div class="exercise-head"><button class="exercise-name" data-exercise-detail="${h(ex.id)}"><strong>${h(ep.englishName||ep.name||ex.exercise_key)}</strong><span>${h(ep.name||'')}</span></button><span class="chev">›</span></div><div class="prescription"><span class="chip">${h(target)}</span><span class="chip">RIR ${h(rir)}</span><span class="chip accent">${fmtNumber(ep.weight)} kg</span><span class="chip">pauza ${h(restLabel(ep))}</span></div>${ep.suggestedReason?`<div class="suggestion"><b>Odporúčanie:</b> ${fmtNumber(ep.weight)} kg. ${h(ep.suggestedReason)}</div>`:''}
  <div class="set-table-wrap"><table class="set-table"><thead><tr><th>SET</th><th>Minule</th><th>KG</th><th>REPS</th><th>RIR</th><th>Hotovo</th></tr></thead><tbody>${sets.map((s,i)=>renderSetRow(s,prev?.sets?.[i],nextSetId===s.id)).join('')}</tbody></table></div>
  <div class="set-actions"><button data-add-set="${h(ex.id)}">+ Pridať sériu</button><button class="note-toggle" data-note-toggle="${h(ex.id)}">Poznámka / bolesť</button></div><div class="exercise-note-box ${state.noteOpen.has(ex.id)?'open':''}" data-note-box="${h(ex.id)}"><textarea class="note-input" data-ex-note="${h(ex.id)}" placeholder="Technika, bolesť, dôvod na nenavýšenie…">${h(ep.note||'')}</textarea><div class="pain-row"><label>Bolesť 0–10</label><input class="pain-input" data-ex-pain="${h(ex.id)}" type="number" inputmode="numeric" min="0" max="10" value="${h(ep.pain??0)}"></div></div></article>`;
}
function restLabel(ep){ const a=n(ep.restMinSeconds,null),b=n(ep.restSeconds,null); if(a&&b&&a!==b)return`${a}–${b}s`;return`${b||a||0}s`; }
function renderSetRow(s,prev,isNext){
  const t=s.set_type||'working';
  const prevText=prev?`${fmtNumber(prev.weight)}×${fmtNumber(prev.reps,0)}${n(prev.rir,null)!==null?` @${fmtNumber(prev.rir,0)}`:''}`:'—';
  return `<tr class="${s.complete?'done':''} ${isNext?'next-set':''}" data-set-row="${h(s.id)}"><td><button class="set-type ${t}" data-set-type="${h(s.id)}" title="${h(SET_TYPE_TITLE[t])}">${s.ordinal} · ${SET_TYPE_LABEL[t]}</button></td><td class="previous"><b>${h(prevText)}</b></td><td><input class="set-input" data-set-field="weight" data-set-id="${h(s.id)}" type="number" inputmode="decimal" step="0.25" value="${h(s.weight??'')}"></td><td><input class="set-input" data-set-field="reps" data-set-id="${h(s.id)}" type="number" inputmode="numeric" step="1" value="${h(s.reps??'')}"></td><td><select class="rir-select" data-set-field="rir" data-set-id="${h(s.id)}">${['','0','1','2','3','4'].map(v=>`<option value="${v}" ${String(s.rir??'')===v?'selected':''}>${v===''?'—':v==='4'?'4+':v}</option>`).join('')}</select></td><td><input class="complete-check" data-set-complete="${h(s.id)}" type="checkbox" ${s.complete?'checked':''} aria-label="Séria hotová"></td></tr>`;
}
function nextIncomplete(){
  for(const ex of state.activeExercises){const sets=state.activeSets.filter(s=>s.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal);const s=sets.find(x=>!x.complete);if(s)return{exercise_id:ex.id,set_id:s.id};}return null;
}
function bindActive(){
  document.getElementById('finish-workout').onclick=finishWorkout;
  document.getElementById('minus-rest').onclick=()=>changeRest(-30);document.getElementById('plus-rest').onclick=()=>changeRest(30);document.getElementById('skip-rest').onclick=skipRest;
  document.querySelectorAll('[data-exercise-detail]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.exerciseDetail)}`));
  document.querySelectorAll('[data-set-field]').forEach(el=>{
    const handler=()=>updateSetField(el.dataset.setId,el.dataset.setField,el.value);
    el.addEventListener('change',handler); el.addEventListener('blur',handler);
  });
  document.querySelectorAll('[data-set-complete]').forEach(el=>el.onchange=()=>toggleComplete(el.dataset.setComplete,el.checked));
  document.querySelectorAll('[data-set-type]').forEach(b=>b.onclick=()=>cycleSetType(b.dataset.setType));
  document.querySelectorAll('[data-add-set]').forEach(b=>b.onclick=()=>addSet(b.dataset.addSet));
  document.querySelectorAll('[data-note-toggle]').forEach(b=>b.onclick=()=>{const id=b.dataset.noteToggle;state.noteOpen.has(id)?state.noteOpen.delete(id):state.noteOpen.add(id);document.querySelector(`[data-note-box="${CSS.escape(id)}"]`)?.classList.toggle('open');});
  document.querySelectorAll('[data-ex-note]').forEach(el=>el.addEventListener('blur',()=>updateExercisePayload(el.dataset.exNote,{note:el.value})));
  document.querySelectorAll('[data-ex-pain]').forEach(el=>el.addEventListener('change',()=>updateExercisePayload(el.dataset.exPain,{pain:Math.min(10,Math.max(0,n(el.value,0)))})));
  document.querySelectorAll('[data-ramp]').forEach(el=>el.onchange=()=>updateRampCheck(el.dataset.ramp,el.checked));
}
function findActiveSet(id){ return state.activeSets.find(x=>x.id===id); }
function updateSetField(id,field,value){
  const s=findActiveSet(id); if(!s)return; const val=value===''?null:n(value,null); if(s[field]===val)return; s[field]=val; scheduleSetSave(s,{[field]:val});
}
function scheduleSetSave(s,patch){
  const key=`${s.session_id}:${s.exercise_id}:${s.id}`; clearTimeout(state.saveTimers.get(key));
  state.saveTimers.set(key,setTimeout(async()=>{
    const {error}=await supabase.from('trainer_hub_workout_sets').update({...patch,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.session_id).eq('exercise_id',s.exercise_id).eq('id',s.id);
    if(error) toast('Autosave série zlyhal.','error');
  },350));
}
async function toggleComplete(id,checked){
  const s=findActiveSet(id); if(!s)return; s.complete=checked;s.completed_at=checked?new Date().toISOString():null;
  const {error}=await supabase.from('trainer_hub_workout_sets').update({complete:checked,completed_at:s.completed_at,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.session_id).eq('exercise_id',s.exercise_id).eq('id',s.id);
  if(error){s.complete=!checked;toast('Sériu sa nepodarilo uložiť.','error');return renderActive();}
  if(checked){const ex=state.activeExercises.find(x=>x.id===s.exercise_id),ep=safeJson(ex?.payload);startRest(n(ep.restSeconds,0),ep.englishName||ep.name||'Prestávka');}
  renderActive();
}
async function cycleSetType(id){
  const s=findActiveSet(id); if(!s)return; const i=SET_TYPE_ORDER.indexOf(s.set_type||'working'); s.set_type=SET_TYPE_ORDER[(i+1)%SET_TYPE_ORDER.length];
  const {error}=await supabase.from('trainer_hub_workout_sets').update({set_type:s.set_type,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.session_id).eq('exercise_id',s.exercise_id).eq('id',s.id);
  if(error)toast('Typ série sa nepodarilo uložiť.','error'); renderActive();
}
async function addSet(exId){
  const ex=state.activeExercises.find(x=>x.id===exId);if(!ex)return;const rows=state.activeSets.filter(x=>x.exercise_id===exId).sort((a,b)=>a.ordinal-b.ordinal);const last=rows.at(-1),ordinal=(last?.ordinal||0)+1;
  const s={owner_id:state.user.id,client_id:CLIENT_ID,session_id:state.activeSession.id,exercise_id:exId,id:`set-${ordinal}-${crypto.randomUUID().slice(0,8)}`,ordinal,weight:last?.weight??n(safeJson(ex.payload).weight,0),reps:last?.reps??n(safeJson(ex.payload).repMin,8),rir:last?.rir??n(safeJson(ex.payload).rirMax,2),complete:false,set_type:'working',completed_at:null};
  const {error}=await supabase.from('trainer_hub_workout_sets').insert(s);if(error)return toast('Sériu sa nepodarilo pridať.','error');state.sets.push(s);state.activeSets.push(s);renderActive();
}
async function updateExercisePayload(exId,patch){
  const ex=state.activeExercises.find(x=>x.id===exId); if(!ex)return; ex.payload={...safeJson(ex.payload),...patch};
  const {error}=await supabase.from('trainer_hub_session_exercises').update({payload:ex.payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',ex.session_id).eq('id',ex.id);
  if(error)toast('Poznámku sa nepodarilo uložiť.','error');
}
async function updateRampCheck(key,value){
  const s=state.activeSession,p=safeJson(s.payload);p.rampChecks={...safeJson(p.rampChecks),[key]:value};s.payload=p;
  const {error}=await supabase.from('trainer_hub_workout_sessions').update({payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id); if(error)toast('RAMP sa nepodarilo uložiť.','error');
}

async function finishWorkout(){
  const s=state.activeSession;if(!s)return;
  const p=safeJson(s.payload), endedAt=new Date().toISOString(), durationSeconds=Math.max(1,Math.floor((new Date(endedAt)-new Date(p.startedAt||endedAt))/1000));
  const prs=detectPRsForSession(s.id); const stats=sessionStats(s.id);
  const nextPayload={...p,status:'completed',endedAt,durationSeconds,tonnage:stats.tonnage,workingSets:stats.workingSets,prs};
  const {error}=await supabase.from('trainer_hub_workout_sessions').update({status:'completed',payload:nextPayload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);
  if(error)return toast(`Dokončenie sa nepodarilo: ${error.message}`,'error',4500);
  s.status='completed';s.payload=nextPayload;state.activeSession=null;state.activeExercises=[];state.activeSets=[];skipRest();clearInterval(state.elapsedTick);toast(`Hotovo. ${stats.workingSets} pracovných sérií · ${fmtNumber(stats.tonnage/1000,2)} t`);updateUrl(`#/session/${encodeURIComponent(s.id)}`);
}

function loadFactor(ex){const p=safeJson(ex?.payload);return Math.max(1,n(p.loadCount,1))*Math.max(1,n(p.sides,1));}
function setTonnage(set,ex){if(!set||!ex||!set.complete||set.set_type==='warmup')return 0;const w=n(set.weight,0),r=n(set.reps,0);if(w<=0||r<=0)return 0;return w*r*loadFactor(ex);}
function e1rm(weight,reps){const w=n(weight,0),r=n(reps,0);return w>0&&r>0?w*(1+r/30):0;}
function sessionDuration(s){return n(safeJson(s.payload).durationSeconds,null);}
function sessionStats(id){
  const exs=state.sessionExercises.filter(x=>x.session_id===id), sets=state.sets.filter(x=>x.session_id===id&&x.complete!==false);
  let tonnage=0,workingSets=0,reps=0;
  for(const st of sets){const ex=exs.find(x=>x.id===st.exercise_id);if(st.set_type!=='warmup'){workingSets++;reps+=n(st.reps,0);}tonnage+=setTonnage(st,ex);}
  return{tonnage,workingSets,reps};
}
function detectPRsForSession(sessionId){
  const s=state.sessions.find(x=>x.id===sessionId),exs=state.sessionExercises.filter(x=>x.session_id===sessionId),out=[];
  for(const ex of exs){
    const current=state.sets.filter(x=>x.session_id===sessionId&&x.exercise_id===ex.id&&x.complete&&x.set_type!=='warmup');if(!current.length)continue;
    const pastEx=state.sessionExercises.filter(x=>x.exercise_key===ex.exercise_key&&x.session_id!==sessionId&&new Date(state.sessions.find(s=>s.id===x.session_id)?.recorded_date||0)<=new Date(s.recorded_date));
    const past=[];for(const pe of pastEx)past.push(...state.sets.filter(st=>st.session_id===pe.session_id&&st.exercise_id===pe.id&&st.complete&&st.set_type!=='warmup').map(st=>({st,ex:pe})));
    if(!past.length){out.push({exerciseKey:ex.exercise_key,type:'first',label:'Prvý záznam'});continue;}
    const curMaxW=Math.max(...current.map(x=>n(x.weight,0))),oldMaxW=Math.max(...past.map(x=>n(x.st.weight,0)));if(curMaxW>oldMaxW)out.push({exerciseKey:ex.exercise_key,type:'weight',label:'Najvyššia hmotnosť'});
    const curE=Math.max(...current.map(x=>e1rm(x.weight,x.reps))),oldE=Math.max(...past.map(x=>e1rm(x.st.weight,x.st.reps)));if(curE>oldE+.01)out.push({exerciseKey:ex.exercise_key,type:'e1rm',label:'Odhad 1RM'});
    const curSetT=Math.max(...current.map(x=>setTonnage(x,ex))),oldSetT=Math.max(...past.map(x=>setTonnage(x.st,x.ex)));if(curSetT>oldSetT+.01)out.push({exerciseKey:ex.exercise_key,type:'set_tonnage',label:'Tonáž série'});
    const curSess=current.reduce((a,x)=>a+setTonnage(x,ex),0);const bySession={};for(const x of past)bySession[x.st.session_id]=(bySession[x.st.session_id]||0)+setTonnage(x.st,x.ex);const oldSess=Math.max(0,...Object.values(bySession));if(curSess>oldSess+.01)out.push({exerciseKey:ex.exercise_key,type:'exercise_tonnage',label:'Tonáž cviku'});
    for(const c of current){const w=n(c.weight,0),rr=n(c.reps,0);const oldRep=Math.max(0,...past.filter(x=>Math.abs(n(x.st.weight,0)-w)<.001).map(x=>n(x.st.reps,0)));if(rr>oldRep) {out.push({exerciseKey:ex.exercise_key,type:'reps_at_weight',label:`Reps pri ${fmtNumber(w)} kg`});break;}}
  }
  return out;
}

