function renderTraining(){
  const templates=strengthTemplates(),next=nextPlannedWorkout(),active=state.activeSession;
  const cards=['A','B','C'].map(k=>renderTemplateCard(k,templates[k])).join('');
  const extras=state.workouts.filter(w=>!['Silový tréning'].includes(safeJson(w.payload).type));
  const content=`
    <header class="home-header"><h1>Tréning</h1></header>
    <button class="start-workout" id="main-start">${active?'POKRAČOVAŤ V TRÉNINGU':'ZAČAŤ TRÉNING'}</button>
    ${next&&!active?`<div class="today-line"><span>Najbližšie</span><b>${h(safeJson(next.w.payload).title||'')}</b></div>`:''}
    <div class="section-bar"><h2>MOJE TRÉNINGY</h2></div>
    <div class="template-strip" id="template-strip">${cards}</div>
    <div class="section-bar"><h2>KONDÍCIA A MOBILITA</h2></div>
    <div class="simple-list">${extras.map(w=>{const p=safeJson(w.payload);return `<div class="simple-row"><div><b>${h(p.title||p.type)}</b><span>${h(p.durationRange||p.instructions||'')}</span></div></div>`}).join('')}</div>`;
  app.innerHTML=shell(content,'training');bindNav();
  document.getElementById('main-start').onclick=()=>{
    if(active)return updateUrl('#/active');
    const day=new Date().getDay(),key=day===2?'A':day===4?'B':day===6?'C':null;
    if(key&&templates[key])startWorkout(key,templates[key]);else document.getElementById('template-strip')?.scrollIntoView({behavior:'smooth',block:'center'});
  };
  document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>{const key=b.dataset.template,w=templates[key];if(w)startWorkout(key,w);});
}
function renderTemplateCard(key,w){
  const names=templateShortList(w);
  return `<button class="template-card" data-template="${key}" ${w?'':'disabled'}><div class="template-card-top"><strong>${key}</strong>${icon('dots')}</div><div class="template-exercises">${names.length?names.slice(0,6).map(x=>`<span>${h(x)}</span>`).join(''):'<span>Nie je v pláne</span>'}</div></button>`;
}

function legacyRowsForExerciseKey(key){
  const ids=new Set(LEGACY_ALIASES[key]||[]);
  if(key.startsWith('legacy:'))ids.add(key.slice(7));
  return state.legacyLogs.filter(r=>ids.has(r.exercise_id));
}
function previousEntryForKey(key,excludeSessionId=null){
  const normalized=[];
  for(const ex of state.sessionExercises.filter(x=>x.exercise_key===key&&x.session_id!==excludeSessionId)){
    const session=state.sessions.find(s=>s.id===ex.session_id&&s.status==='completed');if(!session)continue;
    const sets=state.sets.filter(x=>x.session_id===session.id&&x.exercise_id===ex.id&&x.complete&&(x.set_type||'working')!=='warmup').sort((a,b)=>a.ordinal-b.ordinal);
    if(sets.length)normalized.push({date:session.recorded_date,sets,source:'normalized',exercise:ex});
  }
  normalized.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  const legacy=legacyRowsForExerciseKey(key).sort((a,b)=>String(b.performed_on).localeCompare(String(a.performed_on)))[0];
  const legacyEntry=legacy?{date:legacy.performed_on,sets:(legacy.reps||[]).map((r,i)=>({ordinal:i+1,weight:n(legacy.weight_kg,0),reps:n(r,0),complete:true,set_type:'working'})),source:'legacy',row:legacy}:null;
  const norm=normalized[0]||null;
  if(!norm)return legacyEntry;if(!legacyEntry)return norm;return String(legacyEntry.date)>String(norm.date)?legacyEntry:norm;
}
function suggestWorkoutWeight(exPayload,key){
  const planned=n(exPayload.weight,0),prev=previousEntryForKey(key);
  if(!prev?.sets?.length)return planned;
  const updatedAt=exPayload.weightUpdatedAt?new Date(exPayload.weightUpdatedAt).getTime():0;
  const prevTime=n(prev.timestamp, prev.date?new Date(`${prev.date}T23:59:59`).getTime():0);
  if(updatedAt&&prevTime&&updatedAt>prevTime)return planned;
  const working=prev.sets.filter(s=>(s.set_type||'working')!=='warmup'&&s.complete!==false&&n(s.weight,null)!==null).sort((a,b)=>n(a.ordinal,0)-n(b.ordinal,0));
  return n(working.at(-1)?.weight,planned);
}
async function startWorkout(templateKey,workout){
  if(state.activeSession){toast('Máš otvorený tréning.');return updateUrl('#/active');}
  const planEx=templateExercises(workout);if(!planEx.length)return toast('Tréning nemá pracovné cviky.','error');
  const uid=state.user.id,p=safeJson(workout.payload),id=`session-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
  const session={owner_id:uid,client_id:CLIENT_ID,id,recorded_date:todayIso(),status:'active',payload:{id,date:todayIso(),status:'active',title:p.title||`Tréning ${templateKey}`,template:templateKey,workoutId:workout.id,planId:state.plan?.id||null,source:'tracker_v32',version:APP_VERSION,ramp:p.ramp||[],rampChecks:{},partial:false}};
  const exercises=planEx.map((row,i)=>{const ep={...safeJson(row.payload)};ep.weight=suggestWorkoutWeight(ep,row.exercise_key);ep.templateExerciseId=row.id;ep.templateWorkoutId=workout.id;return{owner_id:uid,client_id:CLIENT_ID,session_id:id,id:`ex-${i+1}-${slugify(row.exercise_key).slice(0,28)}`,ordinal:i+1,exercise_key:row.exercise_key,payload:ep};});
  const sets=[];for(const ex of exercises){const ep=safeJson(ex.payload),prev=previousEntryForKey(ex.exercise_key);for(let i=1;i<=n(ep.sets,3);i++){const ps=prev?.sets?.[i-1];sets.push({owner_id:uid,client_id:CLIENT_ID,session_id:id,exercise_id:ex.id,id:`set-${i}-${crypto.randomUUID().slice(0,8)}`,ordinal:i,weight:n(ep.weight,0),reps:n(ps?.reps,n(ep.repMin,8)),rir:null,complete:false,set_type:'working',completed_at:null});}}
  let r=await supabase.from('trainer_hub_workout_sessions').insert(session);if(r.error)return toast(r.error.message,'error',4500);
  r=await supabase.from('trainer_hub_session_exercises').insert(exercises);if(r.error)return toast(r.error.message,'error',4500);
  r=await supabase.from('trainer_hub_workout_sets').insert(sets);if(r.error)return toast(r.error.message,'error',4500);
  state.sessions.unshift(session);state.sessionExercises.push(...exercises);state.sets.push(...sets);setActive(session);updateUrl('#/active');
}

function renderActive(){
  const s=state.activeSession;if(!s)return updateUrl('#/training');
  const p=safeJson(s.payload),next=nextIncompleteSet();
  app.innerHTML=`<main class="active-page"><header class="active-header"><div><b>${h(String(p.title||'Tréning').replace(/ ·.*$/,''))}</b></div><button id="finish-toggle">Ukončiť</button></header>
  <div class="finish-panel ${state.finishOpen?'open':''}" id="finish-panel"><b>Ukončiť tréning?</b><span>Nedokončené série sa uložia ako čiastočný záznam.</span><div><button class="finish-cancel" id="finish-cancel">Pokračovať</button><button class="finish-confirm" id="finish-confirm">Ukončiť a uložiť</button></div></div>
  <div class="timer-bar ${state.timer?'on':''}" id="timer-bar"><div><strong class="timer-count">0:00</strong><span class="timer-exercise">Pauza</span></div><div><button id="rest-minus">−30</button><button id="rest-plus">+30</button><button id="rest-skip">Preskočiť</button></div></div>
  <section class="active-content">${renderRamp(p)}${state.activeExercises.map(ex=>renderExerciseCard(ex,next?.exercise_id===ex.id,next?.set_id)).join('')}</section></main>`;
  bindActive();renderTimerOnly();ensureTimerTick();
}
function renderRamp(p){
  const ramp=Array.isArray(p.ramp)?p.ramp:[];if(!ramp.length)return'';const checks=safeJson(p.rampChecks),total=ramp.reduce((a,g)=>a+(g.items||[]).length,0),done=Object.values(checks).filter(Boolean).length,complete=total>0&&done>=total;
  return `<details class="ramp-card" ${complete?'':'open'}><summary><div><b>RAMP</b><span>${complete?'Hotovo':`${done}/${total}`}</span></div><span>Rozcvička</span></summary><div class="ramp-body">${ramp.map((g,gi)=>`<div class="ramp-group"><div class="ramp-title"><b>${h(g.code)}</b><span>${h(g.name)}</span></div>${(g.items||[]).map((item,ii)=>{const key=`${gi}-${ii}`;return `<label><input type="checkbox" data-ramp="${key}" ${checks[key]?'checked':''}><span><b>${h(item.name)}</b><small>${h(item.dose||'')}</small></span></label>`}).join('')}</div>`).join('')}</div></details>`;
}
function renderExerciseCard(ex,isNext,nextSetId){
  const ep=safeJson(ex.payload),sets=state.activeSets.filter(s=>s.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal),prev=previousEntryForKey(ex.exercise_key,ex.session_id);
  return `<article class="exercise-card ${isNext?'next-exercise':''}"><div class="exercise-card-head"><button class="exercise-title" data-detail="${h(ex.id)}"><strong>${h(exerciseName(ep,ex.exercise_key))}</strong>${exerciseSkName(ep)&&exerciseSkName(ep)!==exerciseName(ep,ex.exercise_key)?`<span>${h(exerciseSkName(ep))}</span>`:''}</button><button class="exercise-dots" data-menu="${h(ex.id)}">${icon('dots')}</button></div>
  <div class="exercise-target"><span>Cieľ <b>${sets.filter(x=>(x.set_type||'working')!=='warmup').length}×${h(ep.repMin??'?')}${ep.repMax&&ep.repMax!==ep.repMin?`–${h(ep.repMax)}`:''}</b></span><span>Východisková <b>${fmtNumber(ep.weight)} kg</b></span></div>
  <div class="exercise-menu" data-menu-panel="${h(ex.id)}"><button data-action="replace" data-ex="${h(ex.id)}">Nahradiť cvik</button><button data-action="add" data-ex="${h(ex.id)}">Pridať sériu</button><button data-action="remove" data-ex="${h(ex.id)}">Odobrať sériu</button><button data-action="detail" data-ex="${h(ex.id)}">Detail cviku</button></div><div class="replace-panel" data-replace-panel="${h(ex.id)}"></div>
  <table class="set-table"><thead><tr><th>SET</th><th>MINULE</th><th>KG</th><th>REPS</th><th>HOTOVO</th></tr></thead><tbody>${sets.map((set,i)=>renderSetRow(set,prev?.sets?.[i],nextSetId===set.id)).join('')}</tbody></table></article>`;
}
function renderSetRow(s,prev,isNext){const type=s.set_type||'working',label=`${SET_TYPE_LABEL[type]||'S'}${s.ordinal}`,prevText=prev&&n(prev.reps,0)>0?`${fmtNumber(prev.weight)} × ${fmtNumber(prev.reps,0)}`:'—';return `<tr class="${s.complete?'done':''} ${isNext?'next-set':''} ${type==='warmup'?'warmup':''}"><td><button class="set-kind" data-set-type="${h(s.id)}">${h(label)}</button></td><td class="previous-cell">${h(prevText)}</td><td><input data-set-field="weight" data-set-id="${h(s.id)}" type="number" inputmode="decimal" step="0.25" value="${h(s.weight??'')}"></td><td><input data-set-field="reps" data-set-id="${h(s.id)}" type="number" inputmode="numeric" step="1" value="${h(s.reps??'')}"></td><td><button class="set-done ${s.complete?'checked':''}" data-complete="${h(s.id)}">${s.complete?'✓':''}</button></td></tr>`;}
function restSecondsFor(ep){return n(ep.restSeconds,n(ep.restMinSeconds,90));}
function bindActive(){
  document.getElementById('finish-toggle').onclick=()=>{state.finishOpen=!state.finishOpen;document.getElementById('finish-panel').classList.toggle('open',state.finishOpen);};
  document.getElementById('finish-cancel').onclick=()=>{state.finishOpen=false;document.getElementById('finish-panel').classList.remove('open');};document.getElementById('finish-confirm').onclick=finishWorkout;
  document.getElementById('rest-minus').onclick=()=>changeRest(-30);document.getElementById('rest-plus').onclick=()=>changeRest(30);document.getElementById('rest-skip').onclick=skipRest;
  document.querySelectorAll('[data-ramp]').forEach(x=>x.onchange=()=>saveRampCheck(x.dataset.ramp,x.checked));
  document.querySelectorAll('[data-set-field]').forEach(x=>{x.onchange=()=>saveSetField(x.dataset.setId,x.dataset.setField,x.value);x.onblur=()=>saveSetField(x.dataset.setId,x.dataset.setField,x.value);});
  document.querySelectorAll('[data-complete]').forEach(x=>x.onclick=()=>toggleSetComplete(x.dataset.complete));document.querySelectorAll('[data-set-type]').forEach(x=>x.onclick=()=>cycleSetType(x.dataset.setType));
  document.querySelectorAll('[data-detail]').forEach(x=>x.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(x.dataset.detail)}`));
  document.querySelectorAll('[data-menu]').forEach(x=>x.onclick=()=>{const p=document.querySelector(`[data-menu-panel="${CSS.escape(x.dataset.menu)}"]`);document.querySelectorAll('.exercise-menu.open').forEach(y=>{if(y!==p)y.classList.remove('open')});p?.classList.toggle('open');});
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>handleExerciseAction(x.dataset.action,x.dataset.ex));
}
async function saveRampCheck(key,checked){const s=state.activeSession,p={...safeJson(s.payload),rampChecks:{...safeJson(safeJson(s.payload).rampChecks),[key]:checked}};s.payload=p;await supabase.from('trainer_hub_workout_sessions').update({payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);const boxes=[...document.querySelectorAll('[data-ramp]')];if(boxes.length&&boxes.every(x=>x.checked)){const d=document.querySelector('.ramp-card');if(d)setTimeout(()=>d.open=false,180);}}
async function saveSetField(id,field,value){const row=state.activeSets.find(x=>x.id===id);if(!row)return;const v=n(value,null);if(v===null)return;row[field]=v;clearTimeout(state.saveTimers.get(`${id}:${field}`));state.saveTimers.set(`${id}:${field}`,setTimeout(async()=>{const r=await supabase.from('trainer_hub_workout_sets').update({[field]:v,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',row.session_id).eq('exercise_id',row.exercise_id).eq('id',row.id);if(r.error)toast('Zmena sa neuložila.','error');},180));}
async function toggleSetComplete(id){const row=state.activeSets.find(x=>x.id===id);if(!row)return;row.complete=!row.complete;row.completed_at=row.complete?new Date().toISOString():null;const r=await supabase.from('trainer_hub_workout_sets').update({complete:row.complete,completed_at:row.completed_at,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',row.session_id).eq('exercise_id',row.exercise_id).eq('id',row.id);if(r.error){row.complete=!row.complete;return toast('Séria sa neuložila.','error');}if(row.complete){const ex=state.activeExercises.find(x=>x.id===row.exercise_id),ep=safeJson(ex?.payload);startRest(restSecondsFor(ep),exerciseName(ep,ex?.exercise_key));}renderActive();}
async function cycleSetType(id){const row=state.activeSets.find(x=>x.id===id);if(!row)return;const i=SET_TYPE_ORDER.indexOf(row.set_type||'working');row.set_type=SET_TYPE_ORDER[(i+1)%SET_TYPE_ORDER.length];await supabase.from('trainer_hub_workout_sets').update({set_type:row.set_type,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',row.session_id).eq('exercise_id',row.exercise_id).eq('id',row.id);renderActive();}
function nextIncompleteSet(){for(const ex of state.activeExercises){const s=state.activeSets.filter(x=>x.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal).find(x=>!x.complete);if(s)return{exercise_id:ex.id,set_id:s.id};}return null;}

async function handleExerciseAction(action,id){const ex=state.activeExercises.find(x=>x.id===id);if(!ex)return;document.querySelector(`[data-menu-panel="${CSS.escape(id)}"]`)?.classList.remove('open');if(action==='detail')return updateUrl(`#/exercise/${encodeURIComponent(id)}`);if(action==='add')return addSet(ex);if(action==='remove')return removeSet(ex);if(action==='replace')return showReplacementPanel(ex);}
async function addSet(ex){const rows=state.activeSets.filter(x=>x.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal),last=rows.at(-1),row={owner_id:state.user.id,client_id:CLIENT_ID,session_id:ex.session_id,exercise_id:ex.id,id:`set-${rows.length+1}-${crypto.randomUUID().slice(0,8)}`,ordinal:(last?.ordinal||0)+1,weight:n(last?.weight,n(safeJson(ex.payload).weight,0)),reps:n(last?.reps,n(safeJson(ex.payload).repMin,8)),rir:null,complete:false,set_type:'working',completed_at:null};const r=await supabase.from('trainer_hub_workout_sets').insert(row);if(r.error)return toast('Sériu sa nepodarilo pridať.','error');state.sets.push(row);state.activeSets.push(row);renderActive();}
async function removeSet(ex){const rows=state.activeSets.filter(x=>x.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal);if(rows.length<=1)return toast('Aspoň jedna séria musí zostať.');const row=rows.at(-1),r=await supabase.from('trainer_hub_workout_sets').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',row.session_id).eq('exercise_id',row.exercise_id).eq('id',row.id);if(r.error)return toast('Sériu sa nepodarilo odobrať.','error');state.sets=state.sets.filter(x=>x.id!==row.id);state.activeSets=state.activeSets.filter(x=>x.id!==row.id);renderActive();}
function parseAlternatives(text){if(!text)return[];return String(text).split(/\s+(?:Alebo|Ak nie je lavička:)\s+/i).map(c=>c.replace(/^\.|\.$/g,'').trim()).filter(Boolean).map(c=>{const first=c.split(',')[0].trim(),parts=first.split('·').map(x=>x.trim());return{name:parts[1]||parts[0],sk:parts[0],english:parts[1]||'',detail:c,weight:n((c.match(/([0-9]+(?:[,.][0-9]+)?)\s*kg/i)||[])[1]?.replace(',','.'),null)};});}
function showReplacementPanel(ex){const alts=parseAlternatives(safeJson(ex.payload).alternative||''),panel=document.querySelector(`[data-replace-panel="${CSS.escape(ex.id)}"]`);if(!panel)return;if(!alts.length){panel.innerHTML='<div class="replace-empty">Pre tento cvik nie je priradená alternatíva.</div>';panel.classList.add('open');return;}panel.innerHTML=alts.map((a,i)=>`<div class="replace-item"><b>${h(a.name)}</b><small>${h(a.detail)}</small><div><button data-replace-today="${i}">Iba dnes</button><button data-replace-plan="${i}">Natrvalo</button></div></div>`).join('');panel.classList.add('open');panel.querySelectorAll('[data-replace-today]').forEach(b=>b.onclick=()=>applyReplacement(ex,alts[n(b.dataset.replaceToday,0)],false));panel.querySelectorAll('[data-replace-plan]').forEach(b=>b.onclick=()=>applyReplacement(ex,alts[n(b.dataset.replacePlan,0)],true));}
async function applyReplacement(ex,alt,permanent){const oldKey=ex.exercise_key,old={...safeJson(ex.payload)},newKey=slugify(alt.english||alt.sk||alt.name),payload={...old,name:alt.sk||alt.name,englishName:alt.english||alt.name,exerciseKey:newKey,weight:alt.weight??old.weight,replacedFrom:oldKey};let r=await supabase.from('trainer_hub_session_exercises').update({exercise_key:newKey,payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',ex.session_id).eq('id',ex.id);if(r.error)return toast('Nahradenie sa nepodarilo.','error');if(permanent){const planRow=state.planExercises.find(x=>x.workout_id===old.templateWorkoutId&&x.id===old.templateExerciseId)||state.planExercises.find(x=>x.workout_id===old.templateWorkoutId&&x.exercise_key===oldKey);if(planRow){const pp={...safeJson(planRow.payload),name:payload.name,englishName:payload.englishName,exerciseKey:newKey,weight:payload.weight};r=await supabase.from('trainer_hub_workout_exercises').update({exercise_key:newKey,payload:pp}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',planRow.workout_id).eq('id',planRow.id);if(!r.error){planRow.exercise_key=newKey;planRow.payload=pp;}}}ex.exercise_key=newKey;ex.payload=payload;toast(permanent?'Cvik zmenený aj v pláne.':'Cvik nahradený iba dnes.');renderActive();}

async function finishWorkout(){const s=state.activeSession;if(!s)return;const incomplete=state.activeSets.some(x=>!x.complete&&(x.set_type||'working')!=='warmup'),p={...safeJson(s.payload),status:'completed',finishedAt:new Date().toISOString(),partial:incomplete,dataQuality:incomplete?'partial':'complete'};const r=await supabase.from('trainer_hub_workout_sessions').update({status:'completed',payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);if(r.error)return toast('Tréning sa nepodarilo ukončiť.','error');s.status='completed';s.payload=p;state.finishOpen=false;setActive(null);skipRest();await loadCore(false);updateUrl('#/history');}

/* ===== v3.3 UX overrides ===== */
function routineIcon(type=''){
  const t=String(type).toLowerCase();
  if(t.includes('zone')||t.includes('beh'))return '↗';
  if(t.includes('hokej'))return '◉';
  if(t.includes('mobil'))return '◇';
  return '•';
}
function renderTraining(){
  const templates=strengthTemplates(),next=nextPlannedWorkout(),active=state.activeSession;
  const strength=['A','B','C'].map(k=>renderTemplateCardV33(k,templates[k])).join('');
  const extras=state.workouts.filter(w=>safeJson(w.payload).type!=='Silový tréning').sort((a,b)=>a.ordinal-b.ordinal);
  const today=next?.w, tp=safeJson(today?.payload);
  const content=`
    <header class="home-top"><div><span>TRÉNINGOVÝ HUB</span><h1>Ahoj, Dávid</h1></div><div class="status-dot ${state.online?'':'offline'}"></div></header>
    <section class="workout-hero ${active?'active':''}">
      <div class="hero-kicker">${active?'ROZPRACOVANÝ TRÉNING':'DNES / NAJBLIŽŠIE'}</div>
      <h2>${h(active?safeJson(active.payload).title:(tp?.title||'Vyber si tréning'))}</h2>
      <p>${active?'Série máš priebežne uložené. Môžeš pokračovať presne tam, kde si skončil.':h(tp?.durationRange||tp?.instructions||'Silový tréning, mobilita alebo kondícia podľa plánu.')}</p>
      <button id="main-start">${active?'POKRAČOVAŤ':'ZAČAŤ TRÉNING'}</button>
    </section>
    <div class="section-heading"><div><span>SILA</span><h2>Moje tréningy</h2></div></div>
    <div class="strength-grid" id="template-strip">${strength}</div>
    <div class="section-heading"><div><span>KONDÍCIA & REGENERÁCIA</span><h2>Beh, Zone 2 a mobilita</h2></div></div>
    <div class="routine-list">${extras.map(renderRoutineCard).join('')}</div>`;
  app.innerHTML=shell(content,'training');bindNav();
  document.getElementById('main-start').onclick=()=>{
    if(active)return updateUrl('#/active');
    const day=new Date().getDay(),key=day===2?'A':day===4?'B':day===6?'C':null;
    if(key&&templates[key])return startWorkout(key,templates[key]);
    document.getElementById('template-strip')?.scrollIntoView({behavior:'smooth',block:'center'});
  };
  document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>{const w=templates[b.dataset.template];if(w)startWorkout(b.dataset.template,w);});
  document.querySelectorAll('[data-routine]').forEach(b=>b.onclick=()=>updateUrl(`#/routine/${encodeURIComponent(b.dataset.routine)}`));
}
function renderTemplateCardV33(key,w){
  const names=templateShortList(w),p=safeJson(w?.payload);
  return `<button class="strength-card" data-template="${key}" ${w?'':'disabled'}><div class="strength-badge">${key}</div><div class="strength-copy"><strong>${h(String(p.title||`Tréning ${key}`).replace(/ ·.*$/,''))}</strong><span>${h(names.slice(0,3).join(' · ')||'Nie je v pláne')}</span></div><div class="card-arrow">›</div></button>`;
}
function renderRoutineCard(w){
  const p=safeJson(w.payload),type=p.type||'Tréning';
  return `<button class="routine-card" data-routine="${h(w.id)}"><div class="routine-icon">${routineIcon(type)}</div><div><strong>${h(p.title||type)}</strong><span>${h(p.durationRange||p.instructions||type)}</span></div><div class="card-arrow">›</div></button>`;
}

function renderActive(){
  const s=state.activeSession;if(!s)return updateUrl('#/training');
  const p=safeJson(s.payload),next=nextIncompleteSet();
  app.innerHTML=`<main class="active-page"><header class="active-header"><div><span>AKTÍVNY TRÉNING</span><b>${h(String(p.title||'Tréning').replace(/ ·.*$/,''))}</b></div><button id="finish-toggle">Možnosti</button></header>
  <div class="workout-actions ${state.finishOpen?'open':''}" id="finish-panel">
    <div class="action-sheet-title"><b>Čo chceš urobiť?</b><span>Hotové série sa ukladajú priebežne.</span></div>
    <button id="finish-cancel"><b>Pokračovať v tréningu</b><span>Vrátiť sa k sériám</span></button>
    <button id="save-exit"><b>Uložiť a zavrieť</b><span>Tréning zostane rozpracovaný</span></button>
    <button id="finish-confirm" class="action-primary"><b>Dokončiť a uložiť</b><span>Zapísať do histórie ako hotový/čiastočný</span></button>
    <button id="discard-workout" class="action-danger"><b>Ukončiť bez uloženia</b><span>Vymaže túto rozpracovanú session</span></button>
  </div>
  <div class="timer-bar ${state.timer?'on':''}" id="timer-bar"><div><strong class="timer-count">0:00</strong><span class="timer-exercise">Pauza</span></div><div><button id="rest-minus">−30</button><button id="rest-plus">+30</button><button id="rest-skip">Preskočiť</button></div></div>
  <section class="active-content">${renderRamp(p)}${state.activeExercises.map(ex=>renderExerciseCard(ex,next?.exercise_id===ex.id,next?.set_id)).join('')}</section></main>`;
  bindActive();renderTimerOnly();ensureTimerTick();
}
function bindActive(){
  document.getElementById('finish-toggle').onclick=()=>{state.finishOpen=!state.finishOpen;document.getElementById('finish-panel').classList.toggle('open',state.finishOpen);};
  document.getElementById('finish-cancel').onclick=()=>{state.finishOpen=false;document.getElementById('finish-panel').classList.remove('open');};
  document.getElementById('save-exit').onclick=saveWorkoutAndExit;
  document.getElementById('finish-confirm').onclick=finishWorkoutV33;
  document.getElementById('discard-workout').onclick=discardWorkout;
  document.getElementById('rest-minus').onclick=()=>changeRest(-30);document.getElementById('rest-plus').onclick=()=>changeRest(30);document.getElementById('rest-skip').onclick=skipRest;
  document.querySelectorAll('[data-ramp]').forEach(x=>x.onchange=()=>saveRampCheck(x.dataset.ramp,x.checked));
  document.querySelectorAll('[data-set-field]').forEach(x=>{x.onchange=()=>saveSetField(x.dataset.setId,x.dataset.setField,x.value);x.onblur=()=>saveSetField(x.dataset.setId,x.dataset.setField,x.value);});
  document.querySelectorAll('[data-complete]').forEach(x=>x.onclick=()=>toggleSetComplete(x.dataset.complete));document.querySelectorAll('[data-set-type]').forEach(x=>x.onclick=()=>cycleSetType(x.dataset.setType));
  document.querySelectorAll('[data-detail]').forEach(x=>x.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(x.dataset.detail)}`));
  document.querySelectorAll('[data-menu]').forEach(x=>x.onclick=()=>{const p=document.querySelector(`[data-menu-panel="${CSS.escape(x.dataset.menu)}"]`);document.querySelectorAll('.exercise-menu.open').forEach(y=>{if(y!==p)y.classList.remove('open')});p?.classList.toggle('open');});
  document.querySelectorAll('[data-action]').forEach(x=>x.onclick=()=>handleExerciseAction(x.dataset.action,x.dataset.ex));
}
async function saveWorkoutAndExit(){
  const s=state.activeSession;if(!s)return;
  const p={...safeJson(s.payload),savedAt:new Date().toISOString(),status:'active'};
  const r=await supabase.from('trainer_hub_workout_sessions').update({payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);
  if(r.error)return toast('Tréning sa nepodarilo uložiť.','error');
  s.payload=p;state.finishOpen=false;skipRest();toast('Tréning uložený. Môžeš sa k nemu vrátiť.');updateUrl('#/training');
}
async function finishWorkoutV33(){
  const s=state.activeSession;if(!s)return;
  const incomplete=state.activeSets.some(x=>!x.complete&&(x.set_type||'working')!=='warmup');
  const p={...safeJson(s.payload),status:'completed',finishedAt:new Date().toISOString(),partial:incomplete,dataQuality:incomplete?'partial':'complete'};
  const r=await supabase.from('trainer_hub_workout_sessions').update({status:'completed',payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);
  if(r.error)return toast('Tréning sa nepodarilo dokončiť.','error');
  s.status='completed';s.payload=p;state.finishOpen=false;setActive(null);skipRest();await loadCore(false);toast('Tréning uložený. Ďalší štart bude čistý.');updateUrl('#/training');
}
async function discardWorkout(){
  const s=state.activeSession;if(!s)return;
  if(!confirm('Naozaj ukončiť tréning bez uloženia? Táto rozpracovaná session sa vymaže.'))return;
  let r=await supabase.from('trainer_hub_workout_sets').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.id);if(r.error)return toast('Série sa nepodarilo vymazať.','error');
  r=await supabase.from('trainer_hub_session_exercises').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.id);if(r.error)return toast('Cviky sa nepodarilo vymazať.','error');
  r=await supabase.from('trainer_hub_workout_sessions').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);if(r.error)return toast('Session sa nepodarilo vymazať.','error');
  state.sets=state.sets.filter(x=>x.session_id!==s.id);state.sessionExercises=state.sessionExercises.filter(x=>x.session_id!==s.id);state.sessions=state.sessions.filter(x=>x.id!==s.id);state.finishOpen=false;setActive(null);skipRest();toast('Rozpracovaný tréning bol zahodený.');updateUrl('#/training');
}

function renderRoutineDetail(workoutId){
  const w=state.workouts.find(x=>x.id===workoutId);if(!w)return updateUrl('#/training');
  const p=safeJson(w.payload),after=Array.isArray(p.after)?p.after:[],isZone=String(p.type||'').includes('Zone');
  const checks=state.routineChecks[workoutId]||{};
  const content=`<div class="routine-detail"><div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${h(p.type||'Tréning')}</span><h1>${h(p.title||'Tréning')}</h1></div></div>
    <div class="routine-summary">${p.durationRange?`<div><span>Trvanie</span><b>${h(p.durationRange)}</b></div>`:''}${isZone&&p.heartRateLow?`<div><span>Tep</span><b>${h(p.heartRateLow)}–${h(p.heartRateHigh)} bpm</b></div>`:''}</div>
    ${p.instructions?`<div class="routine-instructions">${h(p.instructions)}</div>`:''}
    ${after.length?`<div class="routine-checklist">${after.map((x,i)=>`<label><input type="checkbox" data-routine-check="${i}" ${checks[i]?'checked':''}><div><b>${h(x.name)}</b><span>${h(x.dose||'')}</span>${Array.isArray(x.how)&&x.how.length?`<small>${h(x.how.join(' '))}</small>`:''}</div></label>`).join('')}</div>`:''}
    <div class="routine-log-card"><label>Reálne trvanie (min)<input id="routine-duration" type="number" inputmode="numeric" min="0" placeholder="voliteľné" value="${h(state.routineDuration||'')}"></label><label>Poznámka<textarea id="routine-note" placeholder="voliteľné">${h(state.routineNote||'')}</textarea></label><button id="routine-complete">ULOŽIŤ AKO HOTOVÉ</button></div>
  </div>`;
  app.innerHTML=shell(content,'training');bindNav();document.getElementById('back').onclick=()=>history.back();
  document.querySelectorAll('[data-routine-check]').forEach(x=>x.onchange=()=>{const c=state.routineChecks[workoutId]||{};c[x.dataset.routineCheck]=x.checked;state.routineChecks[workoutId]=c;});
  document.getElementById('routine-duration').oninput=e=>state.routineDuration=e.target.value;document.getElementById('routine-note').oninput=e=>state.routineNote=e.target.value;
  document.getElementById('routine-complete').onclick=()=>completeRoutine(w);
}
async function completeRoutine(w){
  const p=safeJson(w.payload),id=`routine-${Date.now()}-${crypto.randomUUID().slice(0,8)}`,checks=state.routineChecks[w.id]||{};
  const session={owner_id:state.user.id,client_id:CLIENT_ID,id,recorded_date:todayIso(),status:'completed',payload:{id,date:todayIso(),status:'completed',title:p.title||p.type||'Tréning',type:p.type||'Tréning',sessionType:'routine',workoutId:w.id,planId:state.plan?.id||null,source:'tracker_v33',version:APP_VERSION,durationMinutes:state.routineDuration? n(state.routineDuration,null):null,note:state.routineNote||'',checklist:checks,partial:false,finishedAt:new Date().toISOString()}};
  const r=await supabase.from('trainer_hub_workout_sessions').insert(session);if(r.error)return toast('Aktivitu sa nepodarilo uložiť.','error');
  state.sessions.unshift(session);state.routineChecks[w.id]={};state.routineDuration='';state.routineNote='';toast('Aktivita uložená.');updateUrl('#/history');
}

/* ===== v3.3.1 weekly home refinement ===== */
function renderTraining(){
  const templates=strengthTemplates(),next=nextPlannedWorkout(),active=state.activeSession,today=new Date().getDay();
  const tp=safeJson(next?.w?.payload);
  const order=[1,2,3,4,5,6,0],labels={1:'PONDELOK',2:'UTOROK',3:'STREDA',4:'ŠTVRTOK',5:'PIATOK',6:'SOBOTA',0:'NEDEĽA'};
  const weekRows=order.map(day=>{
    let ws=state.workouts.filter(w=>n(safeJson(w.payload).day,null)===day).sort((a,b)=>a.ordinal-b.ordinal);if(day===6){const c=templates.C;ws=ws.filter(w=>safeJson(w.payload).type!=='Silový tréning'||w.id===c?.id);}
    return `<div class="week-row ${day===today?'today':''}"><div class="week-day"><b>${labels[day]}</b>${day===today?'<span>DNES</span>':''}</div><div class="week-items">${ws.length?ws.map(w=>renderWeekWorkout(w)).join(''):'<div class="week-empty">Voľno / ľahká regenerácia</div>'}</div></div>`;
  }).join('');
  const content=`<header class="home-top"><div><span>TRÉNINGOVÝ HUB</span><h1>Týždenný plán</h1></div><div class="status-dot ${state.online?'':'offline'}"></div></header>
    <section class="workout-hero ${active?'active':''}"><div class="hero-kicker">${active?'ROZPRACOVANÝ TRÉNING':'DNES / NAJBLIŽŠIE'}</div><h2>${h(active?safeJson(active.payload).title:(tp?.title||'Vyber si tréning'))}</h2><p>${active?'Série máš priebežne uložené. Môžeš pokračovať presne tam, kde si skončil.':h(tp?.durationRange||tp?.instructions||'Týždeň máš pokope na jednej obrazovke.')}</p><button id="main-start">${active?'POKRAČOVAŤ':'ZAČAŤ TRÉNING'}</button></section>
    <div class="quick-start"><span>Rýchly štart</span><div>${['A','B','C'].map(k=>`<button data-template="${k}" ${templates[k]?'':'disabled'}>${k}</button>`).join('')}</div></div>
    <div class="section-heading week-heading"><div><span>PLÁN</span><h2>Tento týždeň</h2></div></div><div class="week-plan">${weekRows}</div>`;
  app.innerHTML=shell(content,'training');bindNav();
  document.getElementById('main-start').onclick=()=>{if(active)return updateUrl('#/active');const day=new Date().getDay(),key=day===2?'A':day===4?'B':day===6?'C':null;if(key&&templates[key])return startWorkout(key,templates[key]);document.querySelector('.quick-start')?.scrollIntoView({behavior:'smooth',block:'center'});};
  document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>{const w=templates[b.dataset.template];if(w)startWorkout(b.dataset.template,w);});
  document.querySelectorAll('[data-week-workout]').forEach(b=>b.onclick=()=>{const w=state.workouts.find(x=>x.id===b.dataset.weekWorkout);if(!w)return;const p=safeJson(w.payload);if(p.type==='Silový tréning'){const m=String(p.title||'').match(/^Tréning\s+([ABC])/i);const key=m?.[1]?.toUpperCase();if(key)return startWorkout(key,w);}updateUrl(`#/routine/${encodeURIComponent(w.id)}`);});
}
function renderWeekWorkout(w){
  const p=safeJson(w.payload),type=p.type||'Tréning';
  return `<button class="week-workout" data-week-workout="${h(w.id)}"><div><strong>${h(String(p.title||type).replace(/^(Pondelok|Utorok|Streda|Štvrtok|Piatok|Sobota|Nedeľa)\s*·\s*/i,''))}</strong><span>${h(p.durationRange||p.objective||p.instructions||type)}</span></div><em>${p.type==='Silový tréning'?'SILA':h(type)}</em><i>›</i></button>`;
}
