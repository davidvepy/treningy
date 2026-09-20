function renderTraining(){
  clearInterval(state.elapsedTick);
  const templates=strengthTemplates(), next=nextPlannedWorkout(), active=state.activeSession;
  const mobility=state.workouts.filter(w=>['Zone 2','Mobilita','Hokej','Beh'].includes(safeJson(w.payload).type));
  const content=`<div class="page-head compact"><div><div class="eyebrow">Tréning</div><h1>${active?'Pokračuj v tréningu':'Čo ideš dnes?'}</h1></div><div class="sync-pill ${state.online?'':'offline'}" id="sync-pill"><i class="sync-dot"></i><span>${state.online?'online':'offline'}</span></div></div>
  <button class="primary start-hero" id="main-start">${active?'POKRAČOVAŤ':'ZAČAŤ TRÉNING'}</button>
  <div class="section-title"><h2>Silové tréningy</h2><span>A / B / C</span></div>
  <div class="templates strong-templates">${['A','B','C'].map(k=>{const w=templates[k];return `<button class="template" data-template="${k}" ${!w?'disabled':''}><strong>${k}</strong><small>${h(templateSubtitle(w))}</small></button>`}).join('')}</div>
  ${next?`<div class="section-title"><h2>Najbližšie</h2><span>${next.delta===0?'dnes':next.delta===1?'zajtra':`o ${next.delta} dni`}</span></div><button class="feed-item next-card" data-workout="${h(next.w.id)}"><div class="feed-main"><h3>${h(safeJson(next.w.payload).title)}</h3><p>${h(safeJson(next.w.payload).instructions||safeJson(next.w.payload).durationRange||safeJson(next.w.payload).type||'')}</p></div></button>`:''}
  <div class="section-title"><h2>Kondícia & mobilita</h2><span>${mobility.length}</span></div><div class="mini-list">${mobility.map(w=>`<div class="mini-row"><div><b>${h(safeJson(w.payload).title)}</b><small>${h(safeJson(w.payload).instructions||safeJson(w.payload).durationRange||'')}</small></div></div>`).join('')}</div>`;
  app.innerHTML=shell(content,'training');bindNav();
  document.getElementById('main-start').onclick=()=>{
    if(active)return updateUrl('#/active');
    const day=new Date().getDay(),key=day===2?'A':day===4?'B':day===6?'C':null;
    if(key&&templates[key])startWorkout(key,templates[key]);else toast('Vyber tréning A, B alebo C.');
  };
  document.querySelectorAll('[data-template]').forEach(b=>b.onclick=()=>{const k=b.dataset.template;if(templates[k])startWorkout(k,templates[k]);});
  renderSyncState();
}
function renderSyncState(){const pill=document.getElementById('sync-pill');if(!pill)return;pill.classList.toggle('offline',!state.online);const s=pill.querySelector('span');if(s)s.textContent=state.online?'online':'offline';}

async function startWorkout(templateKey,workout){
  if(state.activeSession){toast('Najprv dokonči otvorený tréning.');return updateUrl('#/active');}
  const uid=state.user.id,p=safeJson(workout.payload),planEx=state.planExercises.filter(x=>x.workout_id===workout.id).sort((a,b)=>a.ordinal-b.ordinal);
  if(!planEx.length)return toast('Template nemá pracovné cviky.','error');
  const id=`session-${Date.now()}-${crypto.randomUUID().slice(0,8)}`,startedAt=new Date().toISOString(),previousMap=buildPreviousMap();
  const session={owner_id:uid,client_id:CLIENT_ID,id,recorded_date:todayIso(),status:'active',payload:{id,date:todayIso(),status:'active',title:p.title||`Tréning ${templateKey}`,type:'Silový tréning',template:templateKey,workoutId:workout.id,planId:state.plan?.id||null,startedAt,source:'tracker_v3',version:'3.0',ramp:p.ramp||[],rampChecks:{},partial:false}};
  const sessionExercises=planEx.map((ex,index)=>{
    const ep={...safeJson(ex.payload)},sid=`ex-${index+1}-${slugify(ep.exerciseKey||ex.exercise_key).slice(0,30)}`,suggestion=suggestNextWeight(ex.exercise_key,ep,previousMap[ex.exercise_key]);
    ep.weight=suggestion.weight;ep.suggestedReason=suggestion.reason;ep.note='';ep.pain=0;ep.replacedFrom=null;ep.templateExerciseId=ex.id;ep.templateWorkoutId=workout.id;
    return {owner_id:uid,client_id:CLIENT_ID,session_id:id,id:sid,ordinal:index+1,exercise_key:ex.exercise_key,payload:ep};
  });
  const sets=[];
  for(const ex of sessionExercises){const ep=safeJson(ex.payload),prev=previousMap[ex.exercise_key]?.sets||[];for(let i=1;i<=n(ep.sets,3);i++){const ps=prev[i-1];sets.push({owner_id:uid,client_id:CLIENT_ID,session_id:id,exercise_id:ex.id,id:`set-${i}-${crypto.randomUUID().slice(0,8)}`,ordinal:i,weight:n(ps?.weight,n(ep.weight,0)),reps:n(ps?.reps,n(ep.repMin,8)),rir:n(ps?.rir,n(ep.rirMax,n(ep.rirMin,2))),complete:false,set_type:'working',completed_at:null});}}
  let r=await supabase.from('trainer_hub_workout_sessions').insert(session);if(r.error)return toast(`Tréning sa nepodarilo spustiť: ${r.error.message}`,'error',4500);
  r=await supabase.from('trainer_hub_session_exercises').insert(sessionExercises);if(r.error)return toast(`Cviky sa nepodarilo uložiť: ${r.error.message}`,'error',4500);
  r=await supabase.from('trainer_hub_workout_sets').insert(sets);if(r.error)return toast(`Série sa nepodarilo uložiť: ${r.error.message}`,'error',4500);
  state.sessions.unshift(session);state.sessionExercises.push(...sessionExercises);state.sets.push(...sets);setActiveFromCore(session);updateUrl('#/active');
}

function buildPreviousMap(excludeSessionId=null){
  const sessions=[...state.sessions].filter(s=>s.status==='completed'&&s.id!==excludeSessionId).sort((a,b)=>String(b.recorded_date).localeCompare(String(a.recorded_date))),map={};
  for(const s of sessions){for(const ex of state.sessionExercises.filter(x=>x.session_id===s.id)){if(map[ex.exercise_key])continue;const sets=state.sets.filter(x=>x.session_id===s.id&&x.exercise_id===ex.id&&x.complete!==false).sort((a,b)=>a.ordinal-b.ordinal);if(sets.length)map[ex.exercise_key]={session:s,exercise:ex,sets};}}
  return map;
}
function suggestNextWeight(key,ep,prev){
  const planned=n(ep.weight,0),step=n(ep.step,0);if(!prev?.sets?.length)return{weight:planned,reason:'plán'};
  const pp=safeJson(prev.exercise.payload),pain=n(pp.pain,0),note=String(pp.note||'').toLowerCase(),work=prev.sets.filter(s=>(s.set_type||'working')==='working').slice(0,n(ep.sets,prev.sets.length)),last=n(work[0]?.weight,planned);
  if(work.length<n(ep.sets,work.length)||pain>=3||/boles|pich|technik/.test(note))return{weight:last,reason:'ponechať'};
  const top=work.every(s=>n(s.reps,0)>=n(ep.repMax,999)),rirOk=work.every(s=>n(s.rir,99)>=n(ep.rirMin,0)&&n(s.rir,99)<=n(ep.rirMax,99));
  return top&&rirOk&&step>0?{weight:last+step,reason:'double progression'}:{weight:last,reason:'ponechať'};
}

function renderActive(){
  const s=state.activeSession;if(!s)return updateUrl('#/training');clearInterval(state.elapsedTick);
  const p=safeJson(s.payload),previous=buildPreviousMap(s.id),next=nextIncomplete();
  app.innerHTML=`<main class="active-shell"><header class="active-top"><div class="active-row"><div class="active-title"><strong>${h(shortWorkoutTitle(p.title))}</strong><span id="elapsed">${elapsedText(p.startedAt)}</span></div><button class="finish-btn" id="finish-workout">Dokončiť</button></div><div class="timer-bar ${state.timer?'on':''}" id="timer-bar"><div class="timer-label"><b class="count">0:00</b><small data-timer-label>${h(state.timer?.label||'Prestávka')}</small></div><div class="timer-actions"><button id="minus-rest">−30</button><button id="plus-rest">+30</button><button id="skip-rest">Preskočiť</button></div></div></header>
  <section class="active-body">${renderRamp(p)}${state.activeExercises.map(ex=>renderExerciseCard(ex,previous[ex.exercise_key],next?.exercise_id===ex.id,next?.set_id)).join('')}</section></main>`;
  bindActive();renderTimerOnly();ensureTimerTick();state.elapsedTick=setInterval(()=>{const el=document.getElementById('elapsed');if(el)el.textContent=elapsedText(p.startedAt);},1000);
}
function shortWorkoutTitle(title=''){return String(title).replace(/ ·.*$/,'');}
function renderRamp(p){
  const ramp=Array.isArray(p.ramp)?p.ramp:[];if(!ramp.length)return'';const checks=safeJson(p.rampChecks),total=ramp.reduce((a,g)=>a+(g.items||[]).length,0),done=Object.values(checks).filter(Boolean).length,complete=total>0&&done>=total;
  return `<details class="card ramp" ${complete?'':'open'}><summary><b>RAMP</b><span>${complete?'hotovo':`${done}/${total}`} · bez tonáže</span></summary><div class="ramp-grid">${ramp.map((g,gi)=>`<div class="ramp-group"><div class="ramp-code"><b>${h(g.code)}</b><span>${h(g.name)}</span></div>${(g.items||[]).map((item,ii)=>{const key=`${gi}-${ii}`;return `<label class="ramp-item"><input type="checkbox" data-ramp="${key}" ${checks[key]?'checked':''}><p>${h(item.name)}<small>${h(item.dose||'')}</small></p></label>`}).join('')}</div>`).join('')}</div></details>`;
}
function renderExerciseCard(ex,prev,isNext,nextSetId){
  const ep=safeJson(ex.payload),sets=state.activeSets.filter(s=>s.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal),target=`${sets.filter(s=>(s.set_type||'working')!=='warmup').length}×${ep.repMin||'?'}${ep.repMax&&ep.repMax!==ep.repMin?`–${ep.repMax}`:''}`,rir=ep.rirMin!=null?(ep.rirMax!=null&&ep.rirMax!==ep.rirMin?`${ep.rirMin}–${ep.rirMax}`:`${ep.rirMin}`):'—';
  return `<article class="exercise-card ${isNext?'next':''}" data-exercise-card="${h(ex.id)}"><div class="exercise-head"><button class="exercise-name" data-exercise-detail="${h(ex.id)}"><strong>${h(ep.englishName||ep.name||'Cvik')}</strong><span>${h(ep.name||'')}</span></button><button class="exercise-menu-btn" data-menu="${h(ex.id)}">•••</button></div>
  <div class="prescription compact"><span>Cieľ <b>${h(target)}</b></span><span>RIR <b>${h(rir)}</b></span><span>Odporúčanie <b>${fmtNumber(ep.weight)} kg</b></span></div>
  <div class="exercise-menu" data-menu-panel="${h(ex.id)}"><button data-action="replace" data-ex="${h(ex.id)}">Nahradiť cvik</button><button data-action="add" data-ex="${h(ex.id)}">Pridať sériu</button><button data-action="remove" data-ex="${h(ex.id)}">Odobrať sériu</button><button data-action="detail" data-ex="${h(ex.id)}">Detail cviku</button></div>
  <div class="replace-panel" data-replace-panel="${h(ex.id)}"></div>
  <div class="set-table-wrap"><table class="set-table"><thead><tr><th>SET</th><th>MINULE</th><th>KG</th><th>REPS</th><th>RIR</th><th>✓</th></tr></thead><tbody>${sets.map((s,i)=>renderSetRow(s,prev?.sets?.[i],nextSetId===s.id)).join('')}</tbody></table></div></article>`;
}
function renderSetRow(s,prev,isNext){
  const prevText=prev?`${fmtNumber(prev.weight)}×${fmtNumber(prev.reps,0)}${n(prev.rir,null)!=null?` @${fmtNumber(prev.rir,0)}`:''}`:'—',t=s.set_type||'working';
  return `<tr class="${s.complete?'done':''} ${isNext?'next-set':''} ${t==='warmup'?'warmup-row':''}" data-set-row="${h(s.id)}"><td><button class="set-type" data-set-type="${h(s.id)}" title="${h(SET_TYPE_TITLE[t])}">${h(SET_TYPE_LABEL[t])}${s.ordinal}</button></td><td class="previous">${h(prevText)}</td><td><input data-set-field="weight" data-set-id="${h(s.id)}" type="number" inputmode="decimal" step="0.25" value="${h(s.weight??'')}"></td><td><input data-set-field="reps" data-set-id="${h(s.id)}" type="number" inputmode="numeric" step="1" value="${h(s.reps??'')}"></td><td><select data-set-field="rir" data-set-id="${h(s.id)}"><option value="0" ${n(s.rir)===0?'selected':''}>0</option><option value="1" ${n(s.rir)===1?'selected':''}>1</option><option value="2" ${n(s.rir)===2?'selected':''}>2</option><option value="3" ${n(s.rir)===3?'selected':''}>3</option><option value="4" ${n(s.rir)>=4?'selected':''}>4+</option></select></td><td><button class="complete-set ${s.complete?'checked':''}" data-complete-set="${h(s.id)}">${s.complete?'✓':''}</button></td></tr>`;
}
function restSecondsFor(ep){return n(ep.restSeconds,n(ep.restMinSeconds,90));}

function bindActive(){
  document.getElementById('finish-workout').onclick=finishWorkout;
  document.getElementById('minus-rest').onclick=()=>changeRest(-30);document.getElementById('plus-rest').onclick=()=>changeRest(30);document.getElementById('skip-rest').onclick=skipRest;
  document.querySelectorAll('[data-ramp]').forEach(c=>c.onchange=()=>saveRampCheck(c.dataset.ramp,c.checked));
  document.querySelectorAll('[data-set-field]').forEach(el=>{el.onchange=()=>saveSetField(el.dataset.setId,el.dataset.setField,el.value);el.onblur=()=>saveSetField(el.dataset.setId,el.dataset.setField,el.value);});
  document.querySelectorAll('[data-complete-set]').forEach(b=>b.onclick=()=>toggleSetComplete(b.dataset.completeSet));
  document.querySelectorAll('[data-set-type]').forEach(b=>b.onclick=()=>cycleSetType(b.dataset.setType));
  document.querySelectorAll('[data-exercise-detail]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.exerciseDetail)}`));
  document.querySelectorAll('[data-menu]').forEach(b=>b.onclick=()=>{const p=document.querySelector(`[data-menu-panel="${CSS.escape(b.dataset.menu)}"]`);document.querySelectorAll('.exercise-menu.open').forEach(x=>{if(x!==p)x.classList.remove('open')});p?.classList.toggle('open');});
  document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>handleExerciseAction(b.dataset.action,b.dataset.ex));
}
async function saveRampCheck(key,checked){const s=state.activeSession,p={...safeJson(s.payload),rampChecks:{...safeJson(safeJson(s.payload).rampChecks),[key]:checked}};s.payload=p;await supabase.from('trainer_hub_workout_sessions').update({payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);const boxes=[...document.querySelectorAll('[data-ramp]')];if(boxes.length&&boxes.every(x=>x.checked)){const d=document.querySelector('details.ramp');if(d)setTimeout(()=>d.open=false,250);}}
async function saveSetField(id,field,value){const s=state.activeSets.find(x=>x.id===id);if(!s)return;const v=n(value,null);if(v===null)return;s[field]=v;clearTimeout(state.saveTimers.get(id+field));state.saveTimers.set(id+field,setTimeout(async()=>{const {error}=await supabase.from('trainer_hub_workout_sets').update({[field]:v,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.session_id).eq('exercise_id',s.exercise_id).eq('id',s.id);if(error)toast('Zmena sa neuložila.','error');},180));}
async function toggleSetComplete(id){const s=state.activeSets.find(x=>x.id===id);if(!s)return;s.complete=!s.complete;s.completed_at=s.complete?new Date().toISOString():null;const {error}=await supabase.from('trainer_hub_workout_sets').update({complete:s.complete,completed_at:s.completed_at,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.session_id).eq('exercise_id',s.exercise_id).eq('id',s.id);if(error){s.complete=!s.complete;return toast('Sériu sa nepodarilo uložiť.','error');}if(s.complete){const ex=state.activeExercises.find(x=>x.id===s.exercise_id),ep=safeJson(ex?.payload);startRest(restSecondsFor(ep),ep.englishName||ep.name||'Prestávka');}renderActive();}
async function cycleSetType(id){const s=state.activeSets.find(x=>x.id===id);if(!s)return;const i=SET_TYPE_ORDER.indexOf(s.set_type||'working');s.set_type=SET_TYPE_ORDER[(i+1)%SET_TYPE_ORDER.length];await supabase.from('trainer_hub_workout_sets').update({set_type:s.set_type,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',s.session_id).eq('exercise_id',s.exercise_id).eq('id',s.id);renderActive();}
function nextIncomplete(){for(const ex of state.activeExercises){const s=state.activeSets.filter(x=>x.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal).find(x=>!x.complete);if(s)return{exercise_id:ex.id,set_id:s.id};}return null;}

async function handleExerciseAction(action,exId){
  const ex=state.activeExercises.find(x=>x.id===exId);if(!ex)return;
  document.querySelector(`[data-menu-panel="${CSS.escape(exId)}"]`)?.classList.remove('open');
  if(action==='detail')return updateUrl(`#/exercise/${encodeURIComponent(exId)}`);
  if(action==='add')return addSet(ex);
  if(action==='remove')return removeSet(ex);
  if(action==='replace')return showReplacementPanel(ex);
}
async function addSet(ex){const sets=state.activeSets.filter(x=>x.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal),last=sets.at(-1),row={owner_id:state.user.id,client_id:CLIENT_ID,session_id:ex.session_id,exercise_id:ex.id,id:`set-${sets.length+1}-${crypto.randomUUID().slice(0,8)}`,ordinal:(last?.ordinal||0)+1,weight:n(last?.weight,n(safeJson(ex.payload).weight,0)),reps:n(last?.reps,n(safeJson(ex.payload).repMin,8)),rir:n(last?.rir,n(safeJson(ex.payload).rirMax,2)),complete:false,set_type:'working'};const{error}=await supabase.from('trainer_hub_workout_sets').insert(row);if(error)return toast('Sériu sa nepodarilo pridať.','error');state.sets.push(row);state.activeSets.push(row);renderActive();}
async function removeSet(ex){const sets=state.activeSets.filter(x=>x.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal);if(sets.length<=1)return toast('Aspoň jedna séria musí zostať.');const row=sets.at(-1);const{error}=await supabase.from('trainer_hub_workout_sets').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',row.session_id).eq('exercise_id',row.exercise_id).eq('id',row.id);if(error)return toast('Sériu sa nepodarilo odobrať.','error');state.sets=state.sets.filter(x=>x!==row);state.activeSets=state.activeSets.filter(x=>x!==row);renderActive();}
function showReplacementPanel(ex){const ep=safeJson(ex.payload),alts=parseAlternatives(ep.alternative||''),panel=document.querySelector(`[data-replace-panel="${CSS.escape(ex.id)}"]`);if(!panel)return;if(!alts.length){panel.innerHTML='<div class="inline-info">Pre tento cvik nie je priradená alternatíva.</div>';panel.classList.add('open');return;}panel.innerHTML=`<div class="replace-title">Nahradiť cvik</div>${alts.map((a,i)=>`<div class="replace-option"><b>${h(a.name)}</b><small>${h(a.detail)}</small><div><button data-replace-today="${i}">Iba dnes</button><button data-replace-plan="${i}">Natrvalo v pláne</button></div></div>`).join('')}`;panel.classList.add('open');panel.querySelectorAll('[data-replace-today]').forEach(b=>b.onclick=()=>applyReplacement(ex,alts[n(b.dataset.replaceToday)],false));panel.querySelectorAll('[data-replace-plan]').forEach(b=>b.onclick=()=>applyReplacement(ex,alts[n(b.dataset.replacePlan)],true));}
async function applyReplacement(ex,alt,permanent){
  const oldKey=ex.exercise_key,old={...safeJson(ex.payload)},newKey=slugify(alt.english||alt.sk||alt.name),payload={...old,name:alt.sk||alt.name,englishName:alt.english||alt.name,exerciseKey:newKey,weight:alt.weight??old.weight,replacedFrom:oldKey,alternative:permanent?old.alternative:''};
  let r=await supabase.from('trainer_hub_session_exercises').update({exercise_key:newKey,payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',ex.session_id).eq('id',ex.id);if(r.error)return toast('Nahradenie sa nepodarilo.','error');
  if(permanent){const planRow=state.planExercises.find(x=>x.workout_id===old.templateWorkoutId&&x.id===old.templateExerciseId)||state.planExercises.find(x=>x.workout_id===old.templateWorkoutId&&x.exercise_key===oldKey);if(planRow){const pp={...safeJson(planRow.payload),name:payload.name,englishName:payload.englishName,exerciseKey:newKey,weight:payload.weight};r=await supabase.from('trainer_hub_workout_exercises').update({exercise_key:newKey,payload:pp}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',planRow.workout_id).eq('id',planRow.id);if(!r.error){planRow.exercise_key=newKey;planRow.payload=pp;}}}
  ex.exercise_key=newKey;ex.payload=payload;toast(permanent?'Cvik zmenený aj v pláne.':'Cvik nahradený iba dnes.');renderActive();
}

async function finishWorkout(){
  const s=state.activeSession;if(!s)return;const incomplete=state.activeSets.filter(x=>!x.complete&&(x.set_type||'working')!=='warmup');const p={...safeJson(s.payload),status:'completed',finishedAt:new Date().toISOString(),partial:incomplete.length>0,dataQuality:incomplete.length>0?'partial':'complete'};
  p.prs=detectSessionPRs(s.id);const {error}=await supabase.from('trainer_hub_workout_sessions').update({status:'completed',payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',s.id);if(error)return toast('Tréning sa nepodarilo dokončiť.','error');s.status='completed';s.payload=p;state.activeSession=null;state.activeExercises=[];state.activeSets=[];skipRest();await loadCore(false);updateUrl('#/history');
}
function detectSessionPRs(sessionId){
  const out=[];for(const ex of state.sessionExercises.filter(x=>x.session_id===sessionId)){const cur=state.sets.filter(s=>s.session_id===sessionId&&s.exercise_id===ex.id&&s.complete&&s.set_type!=='warmup'),hist=exerciseHistory(ex.exercise_key).filter(x=>x.session.id!==sessionId);if(!cur.length)continue;const prior=hist.flatMap(x=>x.sets),maxW=Math.max(0,...prior.map(s=>n(s.weight,0))),maxE=Math.max(0,...prior.map(s=>e1rm(s.weight,s.reps))),maxSetTon=Math.max(0,...prior.map(s=>n(s.weight,0)*n(s.reps,0)));for(const s of cur){if(n(s.weight,0)>maxW)out.push({exerciseKey:ex.exercise_key,type:'weight',value:n(s.weight)});if(e1rm(s.weight,s.reps)>maxE)out.push({exerciseKey:ex.exercise_key,type:'e1rm',value:e1rm(s.weight,s.reps)});if(n(s.weight,0)*n(s.reps,0)>maxSetTon)out.push({exerciseKey:ex.exercise_key,type:'set_tonnage',value:n(s.weight,0)*n(s.reps,0)});} }
  return out;
}
