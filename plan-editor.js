/* Tréning v3.7 – editable full weekly plan, manual load progression */

function previousEntryForKey(key,excludeSessionId=null){
  const normalized=[];
  for(const ex of state.sessionExercises.filter(x=>x.exercise_key===key&&x.session_id!==excludeSessionId)){
    const session=state.sessions.find(s=>s.id===ex.session_id&&s.status==='completed');
    if(!session)continue;
    const sets=state.sets.filter(x=>x.session_id===session.id&&x.exercise_id===ex.id&&x.complete&&(x.set_type||'working')!=='warmup').sort((a,b)=>a.ordinal-b.ordinal);
    if(!sets.length)continue;
    const sp=safeJson(session.payload);
    const timestamp=new Date(sp.finishedAt||`${session.recorded_date}T23:59:59`).getTime();
    normalized.push({date:session.recorded_date,timestamp,sets,source:'normalized',exercise:ex,session});
  }
  normalized.sort((a,b)=>b.timestamp-a.timestamp);

  const legacy=legacyRowsForExerciseKey(key).sort((a,b)=>String(b.performed_on).localeCompare(String(a.performed_on)))[0];
  const legacyEntry=legacy?{
    date:legacy.performed_on,
    timestamp:new Date(`${legacy.performed_on}T12:00:00`).getTime(),
    sets:(legacy.reps||[]).map((r,i)=>({ordinal:i+1,weight:n(legacy.weight_kg,0),reps:n(r,0),complete:true,set_type:'working'})),
    source:'legacy',row:legacy
  }:null;

  const norm=normalized[0]||null;
  if(!norm)return legacyEntry;
  if(!legacyEntry)return norm;
  return legacyEntry.timestamp>norm.timestamp?legacyEntry:norm;
}

function suggestWorkoutWeight(exPayload,key){
  const planned=n(exPayload.weight,0);
  const prev=previousEntryForKey(key);
  if(!prev?.sets?.length)return planned;

  // If the user manually changed the plan after the last workout, that manual value wins.
  const updatedAt=exPayload.weightUpdatedAt?new Date(exPayload.weightUpdatedAt).getTime():0;
  if(updatedAt&&prev.timestamp&&updatedAt>prev.timestamp)return planned;

  // No automatic progression. Remember the last actually completed working-set weight.
  const working=prev.sets.filter(s=>(s.set_type||'working')==='working'&&s.complete!==false&&n(s.weight,null)!==null).sort((a,b)=>n(a.ordinal,0)-n(b.ordinal,0));
  return n(working.at(-1)?.weight,planned);
}

function planTemplateByKey(key){return strengthTemplates()[key]||null;}
function planRowsForWorkout(workout){
  return workout?state.planExercises.filter(x=>x.workout_id===workout.id).filter(x=>validExerciseName(exerciseName(safeJson(x.payload),x.exercise_key))).sort((a,b)=>n(a.ordinal,999)-n(b.ordinal,999)||String(a.id).localeCompare(String(b.id))):[];
}

async function persistPlanOrder(workoutId,orderedRows){
  let ok=true;
  for(let i=0;i<orderedRows.length;i++){
    const row=orderedRows[i],ordinal=i+1;
    if(n(row.ordinal,0)===ordinal)continue;
    const r=await supabase.from('trainer_hub_workout_exercises').update({ordinal})
      .eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id)
      .eq('workout_id',workoutId).eq('id',row.id);
    if(r.error){ok=false;toast(`Poradie sa nepodarilo uložiť: ${r.error.message}`,'error',4200);break;}
    row.ordinal=ordinal;
  }
  return ok;
}

async function normalizePlanOrdinals(workoutId){
  const rows=state.planExercises.filter(x=>x.workout_id===workoutId).sort((a,b)=>n(a.ordinal,999)-n(b.ordinal,999)||String(a.id).localeCompare(String(b.id)));
  return persistPlanOrder(workoutId,rows);
}

function renderPlanEditor(selected='A'){
  const workout=planTemplateByKey(selected);
  const rows=planRowsForWorkout(workout);
  const wp=safeJson(workout?.payload);
  const activeNotice=state.activeSession?'<div class="plan-editor-notice">Máš otvorený tréning. Zmeny plánu sa použijú až pri ďalšom novom tréningu.</div>':'';
  const content=`
    <div class="plan-editor-header">
      <button class="back-button" id="plan-editor-back">${icon('back')}</button>
      <div><span>TRÉNINGOVÝ PLÁN</span><h1>Upraviť plán</h1></div>
    </div>
    ${activeNotice}
    <div class="plan-tabs">${['A','B','C'].map(k=>`<button class="${k===selected?'active':''}" data-plan-tab="${k}">${k}</button>`).join('')}</div>
    <div class="plan-editor-summary"><b>Tréning ${selected}</b><span>Všetky zmeny ukladáš priamo do aktívneho plánu. Váhu meníš manuálne; aplikácia ju sama nezvyšuje.</span></div>
    ${workout?`<div class="plan-workout-meta" data-plan-workout-meta data-workout-id="${h(workout.id)}">
      <div class="plan-field full"><label>Názov tréningu<input id="plan-workout-title" value="${h(wp.title||`Tréning ${selected}`)}"></label></div>
      <button class="plan-save-one" id="plan-save-workout-title">Uložiť názov</button>
    </div>`:''}
    <div class="plan-editor-list">${rows.length?rows.map((row,i)=>renderPlanExerciseEditor(row,i+1,rows.length)).join(''):'<div class="empty-card">Tento tréning nemá žiadne pracovné cviky.</div>'}</div>
    <button class="plan-add-exercise" id="plan-add-exercise">+ PRIDAŤ CVIK</button>
    ${rows.length?'<button class="plan-save-all" id="plan-save-all">ULOŽIŤ VŠETKY ZMENY</button>':''}`;

  app.innerHTML=shell(content,'profile');
  bindNav();
  document.getElementById('plan-editor-back').onclick=renderFullPlanOverview;
  document.querySelectorAll('[data-plan-tab]').forEach(b=>b.onclick=()=>renderPlanEditor(b.dataset.planTab));
  document.querySelectorAll('[data-plan-save]').forEach(b=>b.onclick=()=>savePlanExerciseCard(b.closest('[data-plan-card]'),true));
  document.querySelectorAll('[data-plan-move]').forEach(b=>b.onclick=()=>movePlanExercise(b.closest('[data-plan-card]'),b.dataset.planMove,selected));
  document.querySelectorAll('[data-plan-delete]').forEach(b=>b.onclick=()=>deletePlanExercise(b.closest('[data-plan-card]'),selected));
  const add=document.getElementById('plan-add-exercise');if(add)add.onclick=()=>showAddExerciseForm(workout,selected);
  const titleBtn=document.getElementById('plan-save-workout-title');if(titleBtn)titleBtn.onclick=()=>saveStrengthWorkoutTitle(workout,titleBtn);
  const all=document.getElementById('plan-save-all');if(all)all.onclick=()=>saveAllPlanChanges(all,workout);
}

function renderPlanExerciseEditor(row,index,total){
  const p=safeJson(row.payload);
  const rest=n(p.restSeconds,n(p.restMinSeconds,90));
  return `<article class="plan-edit-card" data-plan-card data-row-id="${h(row.id)}" data-workout-id="${h(row.workout_id)}">
    <div class="plan-edit-title">
      <div class="plan-number">${index}</div>
      <div><strong>${h(exerciseName(p,row.exercise_key))}</strong><span>${h(exerciseSkName(p)||'')}</span></div>
      <div class="plan-order-actions">
        <button data-plan-move="up" ${index===1?'disabled':''}>↑</button>
        <button data-plan-move="down" ${index===total?'disabled':''}>↓</button>
      </div>
    </div>
    <div class="plan-grid">
      <div class="plan-field"><label>Váha (kg)<input data-plan-field="weight" type="number" inputmode="decimal" step="0.25" value="${h(p.weight??0)}"></label></div>
      <div class="plan-field"><label>Série<input data-plan-field="sets" type="number" inputmode="numeric" min="1" step="1" value="${h(p.sets??3)}"></label></div>
      <div class="plan-field"><label>Opak. od<input data-plan-field="repMin" type="number" inputmode="numeric" min="1" step="1" value="${h(p.repMin??8)}"></label></div>
      <div class="plan-field"><label>Opak. do<input data-plan-field="repMax" type="number" inputmode="numeric" min="1" step="1" value="${h(p.repMax??p.repMin??8)}"></label></div>
      <div class="plan-field"><label>RIR od<input data-plan-field="rirMin" type="number" inputmode="numeric" min="0" max="10" step="1" value="${h(p.rirMin??'')}"></label></div>
      <div class="plan-field"><label>RIR do<input data-plan-field="rirMax" type="number" inputmode="numeric" min="0" max="10" step="1" value="${h(p.rirMax??p.rirMin??'')}"></label></div>
      <div class="plan-field"><label>Pauza (s)<input data-plan-field="restSeconds" type="number" inputmode="numeric" min="0" step="5" value="${h(rest)}"></label></div>
    </div>
    <details class="plan-advanced">
      <summary>Ďalšie nastavenia</summary>
      <label class="progression-enable"><input type="checkbox" data-plan-field="progressionEnabled" ${p.progressionEnabled===true?'checked':''}> Navrhovať zvýšenie váhy podľa výkonu</label>
      <div class="plan-field full"><label>Krok zvýšenia (kg)<input data-plan-field="progressionStep" type="number" min="0.25" step="0.25" value="${h(p.progressionStep??1)}"></label></div>
      <p class="preview-hint">Návrh sa ukáže až po splnení všetkých sérií na hornej hranici opakovaní so zaznamenanou rezervou RIR. Váhu zmeníš prijatím návrhu v náhľade.</p>
    <div class="plan-field full"><label>Slovenský názov<input data-plan-field="name" value="${h(p.name||'')}"></label></div>
    <div class="plan-field full"><label>Anglický názov<input data-plan-field="englishName" value="${h(p.englishName||'')}"></label></div>
      <div class="plan-field full"><label>Poznámka<textarea data-plan-field="note" rows="3">${h(p.note||'')}</textarea></label></div>
      <div class="plan-field full"><label>Progres / cieľ<textarea data-plan-field="progression" rows="3">${h(p.progression||'')}</textarea></label></div>
      <div class="plan-field full"><label>Alternatíva<textarea data-plan-field="alternative" rows="3">${h(p.alternative||'')}</textarea></label></div>
    </details>
    <div class="plan-card-actions"><button class="plan-delete" data-plan-delete>Odstrániť</button><button class="plan-save-one" data-plan-save>Uložiť cvik</button></div>
  </article>`;
}

function getPlanRowFromCard(card){return state.planExercises.find(x=>x.id===card.dataset.rowId&&x.workout_id===card.dataset.workoutId)||null;}

async function savePlanExerciseCard(card,showToast=false){
  if(!card)return false;
  const row=getPlanRowFromCard(card);if(!row)return false;
  const old=safeJson(row.payload),val=name=>card.querySelector(`[data-plan-field="${name}"]`),next={...old};
  next.name=val('name')?.value.trim()||old.name||'';
  next.englishName=val('englishName')?.value.trim()||old.englishName||next.name;
  const newWeight=Math.max(0,n(val('weight')?.value,n(old.weight,0)));
  if(newWeight!==n(old.weight,0))next.weightUpdatedAt=new Date().toISOString();
  next.weight=newWeight;
  next.sets=Math.max(1,Math.round(n(val('sets')?.value,n(old.sets,3))));
  next.repMin=Math.max(1,Math.round(n(val('repMin')?.value,n(old.repMin,8))));
  next.repMax=Math.max(next.repMin,Math.round(n(val('repMax')?.value,n(old.repMax,next.repMin))));
  const rirMinRaw=val('rirMin')?.value.trim(),rirMaxRaw=val('rirMax')?.value.trim();
  if(rirMinRaw!=='')next.rirMin=Math.max(0,Math.round(n(rirMinRaw,0)));else delete next.rirMin;
  if(rirMaxRaw!=='')next.rirMax=Math.max(next.rirMin??0,Math.round(n(rirMaxRaw,next.rirMin??0)));else if(next.rirMin!=null)next.rirMax=next.rirMin;else delete next.rirMax;
  next.restSeconds=Math.max(0,Math.round(n(val('restSeconds')?.value,n(old.restSeconds,n(old.restMinSeconds,90)))));
  next.restMinSeconds=Math.min(next.restSeconds,Math.max(0,n(old.restMinSeconds,next.restSeconds)));
  next.note=val('note')?.value.trim()||'';
  next.progression=val('progression')?.value.trim()||'';
  next.alternative=val('alternative')?.value.trim()||'';
  next.autoProgress=false;
  next.progressionEnabled=val('progressionEnabled')?.checked===true;
  next.progressionStep=Math.max(0.25,n(val('progressionStep')?.value,n(old.progressionStep,1)));

  const r=await supabase.from('trainer_hub_workout_exercises').update({payload:next})
    .eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id)
    .eq('workout_id',row.workout_id).eq('id',row.id);
  if(r.error){toast(`Cvik sa neuložil: ${r.error.message}`,'error',4200);return false;}
  row.payload=next;
  if(showToast)toast('Cvik uložený.');
  return true;
}

async function saveStrengthWorkoutTitle(workout,button){
  if(!workout)return false;
  const input=document.getElementById('plan-workout-title');if(!input)return false;
  const old=safeJson(workout.payload),next={...old,title:input.value.trim()||old.title||'Tréning'};
  const before=button?.textContent;if(button){button.disabled=true;button.textContent='UKLADÁM…';}
  const r=await supabase.from('trainer_hub_workouts').update({payload:next})
    .eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('id',workout.id);
  if(button){button.disabled=false;button.textContent=before||'Uložiť názov';}
  if(r.error){toast(`Názov sa neuložil: ${r.error.message}`,'error',4200);return false;}
  workout.payload=next;toast('Názov tréningu uložený.');return true;
}

async function saveAllPlanChanges(button,workout){
  const cards=[...document.querySelectorAll('[data-plan-card]')];if(!cards.length)return;
  button.disabled=true;const oldText=button.textContent;button.textContent='UKLADÁM…';let ok=true;
  for(const card of cards){if(!(await savePlanExerciseCard(card,false))){ok=false;break;}}
  if(ok&&workout){
    const input=document.getElementById('plan-workout-title');
    if(input){const old=safeJson(workout.payload),next={...old,title:input.value.trim()||old.title||'Tréning'};const r=await supabase.from('trainer_hub_workouts').update({payload:next}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('id',workout.id);if(r.error)ok=false;else workout.payload=next;}
    if(ok)ok=await normalizePlanOrdinals(workout.id);
  }
  button.disabled=false;button.textContent=oldText;if(ok){toast('Celý tréningový plán je uložený.');renderPlanEditor(safeJson(workout?.payload).title?.match(/^Tréning\s+([ABC])\b/i)?.[1]?.toUpperCase()||'A');}
}

async function movePlanExercise(card,direction,selected){
  const row=getPlanRowFromCard(card);if(!row)return;
  const workout=planTemplateByKey(selected),rows=planRowsForWorkout(workout),i=rows.findIndex(x=>x.id===row.id),j=direction==='up'?i-1:i+1;
  if(i<0||j<0||j>=rows.length)return;
  [rows[i],rows[j]]=[rows[j],rows[i]];
  if(await persistPlanOrder(workout.id,rows))renderPlanEditor(selected);
}

async function deletePlanExercise(card,selected){
  const row=getPlanRowFromCard(card);if(!row)return;
  if(!confirm(`Odstrániť ${exerciseName(safeJson(row.payload),row.exercise_key)} z tréningového plánu? História zostane zachovaná.`))return;
  const r=await supabase.from('trainer_hub_workout_exercises').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',row.workout_id).eq('id',row.id);
  if(r.error)return toast(`Cvik sa nepodarilo odstrániť: ${r.error.message}`,'error',4200);
  state.planExercises=state.planExercises.filter(x=>!(x.id===row.id&&x.workout_id===row.workout_id));
  await normalizePlanOrdinals(row.workout_id);toast('Cvik odstránený z plánu.');renderPlanEditor(selected);
}

function showAddExerciseForm(workout,selected){
  if(!workout)return;
  const host=document.querySelector('.plan-editor-list');if(!host)return;
  if(document.getElementById('plan-new-card'))return document.getElementById('plan-new-name')?.focus();
  const nextNumber=planRowsForWorkout(workout).length+1;
  const box=document.createElement('article');box.className='plan-edit-card new';box.id='plan-new-card';
  box.innerHTML=`<div class="plan-edit-title"><div class="plan-number">${nextNumber}</div><div><strong>Nový cvik</strong><span>Po pridaní sa okamžite uloží do tréningu ${selected}</span></div></div>
    <div class="plan-field full"><label>Slovenský názov<input id="plan-new-name" placeholder="Napr. Bicepsový zdvih na kladke"></label></div>
    <div class="plan-field full"><label>Anglický názov<input id="plan-new-english" placeholder="Cable Curl"></label></div>
    <div class="plan-grid">
      <div class="plan-field"><label>Váha (kg)<input id="plan-new-weight" type="number" inputmode="decimal" step="0.25" value="0"></label></div>
      <div class="plan-field"><label>Série<input id="plan-new-sets" type="number" min="1" value="3"></label></div>
      <div class="plan-field"><label>Opak. od<input id="plan-new-min" type="number" min="1" value="8"></label></div>
      <div class="plan-field"><label>Opak. do<input id="plan-new-max" type="number" min="1" value="12"></label></div>
      <div class="plan-field"><label>RIR od<input id="plan-new-rir-min" type="number" min="0" max="10" value="1"></label></div>
      <div class="plan-field"><label>RIR do<input id="plan-new-rir-max" type="number" min="0" max="10" value="2"></label></div>
      <div class="plan-field"><label>Pauza (s)<input id="plan-new-rest" type="number" min="0" step="5" value="90"></label></div>
    </div>
    <div class="plan-card-actions"><button class="plan-delete" id="plan-new-cancel">Zrušiť</button><button class="plan-save-one" id="plan-new-save">PRIDAŤ A ULOŽIŤ</button></div>`;
  host.appendChild(box);
  document.getElementById('plan-new-cancel').onclick=()=>box.remove();
  document.getElementById('plan-new-save').onclick=()=>addPlanExercise(workout,selected,box);
  document.getElementById('plan-new-name').focus();
}

async function addPlanExercise(workout,selected,box){
  const name=document.getElementById('plan-new-name').value.trim(),english=document.getElementById('plan-new-english').value.trim();
  if(!name&&!english)return toast('Zadaj názov cviku.','error');
  const baseKey=slugify(english||name),existing=planRowsForWorkout(workout).find(x=>x.exercise_key===baseKey);
  if(existing)return toast('Tento cvik už v tréningu existuje. Uprav existujúcu kartu alebo zvoľ iný názov.','error',4200);
  const rows=planRowsForWorkout(workout),ordinal=rows.length+1,key=baseKey;
  const uuid=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`),id=`custom-${uuid}`;
  const rirMin=Math.max(0,Math.round(n(document.getElementById('plan-new-rir-min').value,1))),rirMax=Math.max(rirMin,Math.round(n(document.getElementById('plan-new-rir-max').value,rirMin)));
  const payload={name:name||english,englishName:english||name,exerciseKey:key,weight:Math.max(0,n(document.getElementById('plan-new-weight').value,0)),sets:Math.max(1,Math.round(n(document.getElementById('plan-new-sets').value,3))),repMin:Math.max(1,Math.round(n(document.getElementById('plan-new-min').value,8))),repMax:Math.max(1,Math.round(n(document.getElementById('plan-new-max').value,12))),rirMin,rirMax,restSeconds:Math.max(0,Math.round(n(document.getElementById('plan-new-rest').value,90))),autoProgress:false,weightUpdatedAt:new Date().toISOString(),loadCount:1,sides:1,pattern:'custom',repUnit:'reps'};
  payload.repMax=Math.max(payload.repMin,payload.repMax);payload.restMinSeconds=payload.restSeconds;
  const row={owner_id:state.user.id,client_id:CLIENT_ID,plan_id:state.plan.id,workout_id:workout.id,id,ordinal,exercise_key:key,payload};
  const btn=document.getElementById('plan-new-save');if(btn){btn.disabled=true;btn.textContent='UKLADÁM…';}
  const r=await supabase.from('trainer_hub_workout_exercises').insert(row);
  if(r.error){if(btn){btn.disabled=false;btn.textContent='PRIDAŤ A ULOŽIŤ';}return toast(`Cvik sa nepodarilo pridať: ${r.error.message}`,'error',5200);}
  const verify=await supabase.from('trainer_hub_workout_exercises').select('*').eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',workout.id).eq('id',id).limit(1);
  if(verify.error||!verify.data?.length){if(btn){btn.disabled=false;btn.textContent='PRIDAŤ A ULOŽIŤ';}return toast('Cvik sa síce odoslal, ale databáza ho nepotvrdila. Skús to znova.','error',5200);}
  state.planExercises.push(verify.data[0]);
  await normalizePlanOrdinals(workout.id);
  toast(`Cvik ${ordinal}. bol pridaný a uložený.`);renderPlanEditor(selected);
}

/* ===== v3.7 – full weekly plan editor (strength + running/mobility/routines) ===== */
function planDayLabel(day){
  return ({1:'Pondelok',2:'Utorok',3:'Streda',4:'Štvrtok',5:'Piatok',6:'Sobota',0:'Nedeľa'})[n(day,0)]||'Deň';
}
function routinePlanRows(){
  const order={1:1,2:2,3:3,4:4,5:5,6:6,0:7};
  return state.workouts.filter(w=>safeJson(w.payload).type!=='Silový tréning').sort((a,b)=>{
    const ad=n(safeJson(a.payload).day,0),bd=n(safeJson(b.payload).day,0);
    return (order[ad]||99)-(order[bd]||99)||n(a.ordinal,0)-n(b.ordinal,0);
  });
}
function renderRoutineOverviewCard(w){
  const p=safeJson(w.payload),after=Array.isArray(p.after)?p.after:[];
  const meta=[p.type,p.durationRange,p.heartRateLow&&p.heartRateHigh?`${p.heartRateLow}–${p.heartRateHigh} bpm`:null,after.length?`${after.length} bodov`:null].filter(Boolean).join(' · ');
  return `<button class="full-plan-tile routine" data-edit-routine="${h(w.id)}"><span>${h(planDayLabel(p.day))}</span><strong>${h(p.title||p.type||'Tréning')}</strong><small>${h(meta||'Upraviť detaily')}</small><i>›</i></button>`;
}

function bindRoutineEditItemActions(){
  document.querySelectorAll('[data-routine-remove]').forEach(b=>b.onclick=()=>{b.closest('[data-routine-item]')?.remove();refreshRoutineItemNumbers();});
  document.querySelectorAll('[data-routine-up]').forEach(b=>b.onclick=()=>{const item=b.closest('[data-routine-item]'),prev=item?.previousElementSibling;if(item&&prev){item.parentNode.insertBefore(item,prev);refreshRoutineItemNumbers();}});
  document.querySelectorAll('[data-routine-down]').forEach(b=>b.onclick=()=>{const item=b.closest('[data-routine-item]'),next=item?.nextElementSibling;if(item&&next){item.parentNode.insertBefore(next,item);refreshRoutineItemNumbers();}});
}
function refreshRoutineItemNumbers(){
  document.querySelectorAll('[data-routine-item]').forEach((item,i)=>{const nEl=item.querySelector('.routine-item-head>span'),b=item.querySelector('.routine-item-head>b'),name=item.querySelector('[data-routine-item-field="name"]');if(nEl)nEl.textContent=i+1;if(b)b.textContent=name?.value.trim()||'Nový bod';});
}
function addRoutineEditItem(){
  const host=document.getElementById('routine-edit-items');if(!host)return;
  const wrap=document.createElement('div');wrap.innerHTML=renderRoutineEditItem({},host.children.length);const item=wrap.firstElementChild;host.appendChild(item);bindRoutineEditItemActions();refreshRoutineItemNumbers();item.querySelector('[data-routine-item-field="name"]')?.focus();
}
function workoutDays(payload={}){
  const p=safeJson(payload),raw=Array.isArray(p.days)?p.days:(p.day===null||p.day===undefined||p.day===''?[]:[p.day]);
  return [...new Set(raw.map(x=>n(x,null)).filter(x=>x!==null&&x>=0&&x<=6))];
}
function workoutDaysLabel(payload={}){
  const days=workoutDays(payload);if(!days.length)return 'Nezaradené';
  const order=[1,2,3,4,5,6,0];return order.filter(d=>days.includes(d)).map(planDayLabel).join(' · ');
}
function schedulePickerHtml(payload={},prefix='unit-day'){
  const selected=new Set(workoutDays(payload));
  return `<div class="schedule-picker">${[1,2,3,4,5,6,0].map(d=>`<label><input type="checkbox" data-schedule-day value="${d}" ${selected.has(d)?'checked':''}><span>${['Ne','Po','Ut','St','Št','Pi','So'][d]}</span></label>`).join('')}</div>`;
}
function readScheduleDays(root=document){return [...root.querySelectorAll('[data-schedule-day]:checked')].map(x=>n(x.value,null)).filter(x=>x!==null);}
function applyDaysToPayload(payload,days){const next={...safeJson(payload),days:[...new Set(days)]};next.day=next.days.length===1?next.days[0]:null;return next;}
function workoutTypeOptions(selected=''){const types=['Silový tréning','Zone 2','Beh','Mobilita','Regenerácia','Hokej','Iné'];return types.map(t=>`<option value="${h(t)}" ${t===selected?'selected':''}>${h(t)}</option>`).join('');}
function strengthLabelForWorkout(w){const p=safeJson(w?.payload),m=String(p.title||'').match(/Tréning\s+([ABC])\b/i);return m?.[1]?.toUpperCase()||String(p.shortCode||'SILA');}

function renderProfile(){
  const content=`<header class="page-title"><h1>Profil</h1></header>
    <div class="profile-card"><div><span>Prihlásený účet</span><b>${h(state.user.email||'Dávid')}</b></div><button id="logout">Odhlásiť</button></div>
    <div class="section-bar"><h2>TRÉNINGOVÉ JEDNOTKY</h2></div>
    <div class="plan-editor-entry full-plan-entry"><div><b>Spravovať tréningy a rozvrh</b><span>Každý tréning je samostatná jednotka. Upravíš obsah, rozcvičku aj dni v týždni.</span></div><button id="open-full-plan-editor">Otvoriť builder</button></div>
    <div class="section-bar"><h2>AKO TRÉNOVAŤ</h2></div>
    <div class="help-list">
      <details><summary>Ako fungujú supersety</summary><p>Dva cviky ideš po sebe bez plnej pauzy. Pauzu odpočítavaj až po druhom cviku páru.</p></details>
      <details><summary>Keď máš len 35 minút</summary><p>Nechaj hlavné pracovné cviky a skráť doplnkový objem. Rozcvičku a technicky náročný prvý cvik nevyhadzuj.</p></details>
      <details><summary>Kedy pridať váhu</summary><p>Váhu riadiš ty podľa RIR, techniky a výkonu. Aplikácia nič automaticky nezvyšuje.</p></details>
    </div>
    <div class="app-info"><span>Tréning v${APP_VERSION}</span><p>Úprava tréningovej jednotky nemení starú históriu. Rozvrh je oddelený od obsahu tréningu.</p></div>`;
  app.innerHTML=shell(content,'profile');bindNav();
  document.getElementById('logout').onclick=()=>supabase.auth.signOut();
  document.getElementById('open-full-plan-editor').onclick=renderFullPlanOverview;
}

function sortedWorkoutUnits(){
  const order={1:1,2:2,3:3,4:4,5:5,6:6,0:7};
  return [...state.workouts].sort((a,b)=>{
    const ad=workoutDays(a.payload),bd=workoutDays(b.payload),aa=ad.length?Math.min(...ad.map(d=>order[d]||99)):99,bb=bd.length?Math.min(...bd.map(d=>order[d]||99)):99;
    return aa-bb||n(a.ordinal,0)-n(b.ordinal,0)||String(safeJson(a.payload).title||'').localeCompare(String(safeJson(b.payload).title||''),'sk');
  });
}
function renderWorkoutUnitTile(w){
  const p=safeJson(w.payload),isStrength=p.type==='Silový tréning',count=isStrength?planRowsForWorkout(w).length:(Array.isArray(p.after)?p.after.length:0);
  const meta=[p.type,workoutDaysLabel(p),p.durationRange,count?`${count} ${isStrength?'cvikov':'bodov'}`:null].filter(Boolean).join(' · ');
  return `<button class="full-plan-tile ${isStrength?'strength':'routine'}" data-edit-unit="${h(w.id)}"><span>${h(workoutDaysLabel(p))}</span><strong>${h(p.title||p.type||'Tréning')}</strong><small>${h(meta)}</small><i>›</i></button>`;
}
function renderFullPlanOverview(){
  const units=sortedWorkoutUnits();
  const content=`<div class="plan-editor-header"><button class="back-button" id="full-plan-back">${icon('back')}</button><div><span>TRÉNINGOVÝ BUILDER</span><h1>Tréningové jednotky</h1></div></div>
    ${state.activeSession?'<div class="plan-editor-notice">Máš otvorený tréning. Zmeny sa použijú až pri ďalšom novom tréningu.</div>':''}
    <div class="plan-editor-summary"><b>Obsah a rozvrh sú oddelené</b><span>Vytvoríš tréning, upravíš ho a následne ho priradíš na jeden alebo viac dní. Nezaradené jednotky ostávajú v knižnici.</span></div>
    <button class="plan-add-exercise workout-unit-create" id="create-workout-unit">+ NOVÁ TRÉNINGOVÁ JEDNOTKA</button>
    <div class="section-bar plan-section-bar"><h2>VŠETKY JEDNOTKY</h2></div>
    <div class="full-plan-routine-list">${units.length?units.map(renderWorkoutUnitTile).join(''):'<div class="empty-card">Zatiaľ nemáš žiadne tréningové jednotky.</div>'}</div>`;
  app.innerHTML=shell(content,'profile');bindNav();
  document.getElementById('full-plan-back').onclick=renderProfile;
  document.getElementById('create-workout-unit').onclick=renderNewWorkoutUnit;
  document.querySelectorAll('[data-edit-unit]').forEach(b=>b.onclick=()=>openWorkoutUnitEditor(b.dataset.editUnit));
}
function openWorkoutUnitEditor(workoutId){const w=state.workouts.find(x=>x.id===workoutId);if(!w)return renderFullPlanOverview();return safeJson(w.payload).type==='Silový tréning'?renderStrengthUnitEditor(workoutId):renderRoutinePlanEditor(workoutId);}

function renderNewWorkoutUnit(){
  const content=`<div class="plan-editor-header"><button class="back-button" id="new-unit-back">${icon('back')}</button><div><span>NOVÁ JEDNOTKA</span><h1>Vytvoriť tréning</h1></div></div>
    <div class="routine-plan-card" id="new-unit-card"><div class="plan-grid routine-main-grid">
      <div class="plan-field full-span"><label>Názov<input id="new-unit-title" placeholder="Napr. Upper Body 2"></label></div>
      <div class="plan-field full-span"><label>Typ<select id="new-unit-type">${workoutTypeOptions('Silový tréning')}</select></label></div>
    </div>
    <div class="routine-editor-heading"><div><span>ROZVRH</span><b>Naplánuj teraz alebo neskôr</b></div></div>${schedulePickerHtml({},'new-unit-day')}
    <button class="plan-save-all routine-save" id="new-unit-save">VYTVORIŤ JEDNOTKU</button></div>`;
  app.innerHTML=shell(content,'profile');bindNav();document.getElementById('new-unit-back').onclick=renderFullPlanOverview;document.getElementById('new-unit-save').onclick=createWorkoutUnit;
}
async function createWorkoutUnit(){
  const title=document.getElementById('new-unit-title').value.trim(),type=document.getElementById('new-unit-type').value;if(!title)return toast('Zadaj názov tréningu.','error');
  const days=readScheduleDays(document),id=`unit-${Date.now()}-${slugify(title).slice(0,28)}`,ordinal=Math.max(0,...state.workouts.map(x=>n(x.ordinal,0)))+1;
  let payload=applyDaysToPayload({title,type,durationRange:'',instructions:'',after:[],ramp:[],createdInApp:true},days);
  const row={owner_id:state.user.id,client_id:CLIENT_ID,plan_id:state.plan.id,id,ordinal,payload};
  const r=await supabase.from('trainer_hub_workouts').insert(row);if(r.error)return toast(`Tréning sa nevytvoril: ${r.error.message}`,'error',4500);
  state.workouts.push(row);toast('Tréningová jednotka vytvorená.');openWorkoutUnitEditor(id);
}

function renderStrengthUnitEditor(workoutId){
  const w=state.workouts.find(x=>x.id===workoutId);if(!w)return renderFullPlanOverview();const p=safeJson(w.payload),rows=planRowsForWorkout(w),ramp=Array.isArray(p.ramp)?p.ramp:[];
  const content=`<div class="plan-editor-header"><button class="back-button" id="strength-unit-back">${icon('back')}</button><div><span>SILOVÁ JEDNOTKA</span><h1>${h(p.title||'Silový tréning')}</h1></div></div>
    <div class="routine-plan-card strength-meta-card" data-strength-meta data-workout-id="${h(w.id)}"><div class="plan-grid routine-main-grid">
      <div class="plan-field full-span"><label>Názov tréningu<input data-strength-field="title" value="${h(p.title||'')}"></label></div>
    </div><div class="routine-editor-heading"><div><span>ROZVRH</span><b>Jeden alebo viac dní</b></div></div>${schedulePickerHtml(p,'strength-day')}</div>
    <div class="routine-editor-heading ramp-heading"><div><span>ROZCVIČKA</span><b>RAMP – všetko je editovateľné</b></div><button id="ramp-add-group">+ Skupina</button></div>
    <div class="ramp-editor" id="ramp-editor">${ramp.map((g,i)=>renderRampEditGroup(g,i)).join('')}</div>
    <div class="section-bar plan-section-bar"><h2>PRACOVNÉ CVIKY</h2></div>
    ${quickEditHtml()}${bulkPlanControls()}
    <div class="plan-editor-list">${rows.length?rows.map((row,i)=>renderPlanExerciseEditor(row,i+1,rows.length)).join(''):'<div class="empty-card">Táto jednotka zatiaľ nemá pracovné cviky.</div>'}</div>
    <button class="plan-add-exercise" id="unit-add-exercise">+ PRIDAŤ CVIK</button>
    <button class="plan-save-all" id="strength-unit-save">ULOŽIŤ CELÚ JEDNOTKU</button>
    <button class="unit-delete-button" id="delete-workout-unit">Odstrániť tréningovú jednotku</button>`;
  app.innerHTML=shell(content,'profile');bindNav();document.getElementById('strength-unit-back').onclick=renderFullPlanOverview;
  document.getElementById('ramp-add-group').onclick=addRampGroup;bindRampEditorActions();
  document.querySelectorAll('[data-plan-save]').forEach(b=>b.onclick=()=>savePlanExerciseCard(b.closest('[data-plan-card]'),true));
  document.querySelectorAll('[data-plan-move]').forEach(b=>b.onclick=()=>moveExerciseInWorkout(b.closest('[data-plan-card]'),b.dataset.planMove,w));
  document.querySelectorAll('[data-plan-delete]').forEach(b=>b.onclick=()=>deleteExerciseFromWorkout(b.closest('[data-plan-card]'),w));
  bindQuickEdit();bindBulkPlanControls();document.getElementById('unit-add-exercise').onclick=()=>showExerciseLibrary(w);
  document.getElementById('strength-unit-save').onclick=()=>saveStrengthUnit(w);
  document.getElementById('delete-workout-unit').onclick=()=>deleteWorkoutUnit(w);
}
function renderRampEditGroup(group={},index=0){
  const items=Array.isArray(group.items)?group.items:[];
  return `<article class="ramp-edit-group" data-ramp-group><div class="ramp-edit-group-head"><span>${index+1}</span><input data-ramp-group-code value="${h(group.code||'')}" placeholder="R"><input data-ramp-group-name value="${h(group.name||'')}" placeholder="Názov fázy"><div><button data-ramp-group-up>↑</button><button data-ramp-group-down>↓</button><button data-ramp-group-remove>×</button></div></div><div class="ramp-edit-items">${items.map((item,i)=>renderRampEditItem(item,i)).join('')}</div><button class="ramp-add-item" data-ramp-add-item>+ Pridať bod</button></article>`;
}
function renderRampEditItem(item={},index=0){return `<div class="ramp-edit-item" data-ramp-item><span>${index+1}</span><input data-ramp-item-name value="${h(item.name||'')}" placeholder="Cvik / aktivita"><input data-ramp-item-dose value="${h(item.dose||'')}" placeholder="Dávka"><div><button data-ramp-item-up>↑</button><button data-ramp-item-down>↓</button><button data-ramp-item-remove>×</button></div></div>`;}
function refreshRampNumbers(){document.querySelectorAll('[data-ramp-group]').forEach((g,gi)=>{const s=g.querySelector('.ramp-edit-group-head>span');if(s)s.textContent=gi+1;g.querySelectorAll('[data-ramp-item]').forEach((it,ii)=>{const nEl=it.querySelector(':scope>span');if(nEl)nEl.textContent=ii+1;});});}
function bindRampEditorActions(){
  document.querySelectorAll('[data-ramp-group-remove]').forEach(b=>b.onclick=()=>{b.closest('[data-ramp-group]')?.remove();refreshRampNumbers();});
  document.querySelectorAll('[data-ramp-group-up]').forEach(b=>b.onclick=()=>{const x=b.closest('[data-ramp-group]'),p=x?.previousElementSibling;if(x&&p){x.parentNode.insertBefore(x,p);refreshRampNumbers();}});
  document.querySelectorAll('[data-ramp-group-down]').forEach(b=>b.onclick=()=>{const x=b.closest('[data-ramp-group]'),nxt=x?.nextElementSibling;if(x&&nxt){x.parentNode.insertBefore(nxt,x);refreshRampNumbers();}});
  document.querySelectorAll('[data-ramp-add-item]').forEach(b=>b.onclick=()=>{const g=b.closest('[data-ramp-group]'),host=g?.querySelector('.ramp-edit-items');if(!host)return;const wrap=document.createElement('div');wrap.innerHTML=renderRampEditItem({},host.children.length);host.appendChild(wrap.firstElementChild);bindRampEditorActions();refreshRampNumbers();});
  document.querySelectorAll('[data-ramp-item-remove]').forEach(b=>b.onclick=()=>{b.closest('[data-ramp-item]')?.remove();refreshRampNumbers();});
  document.querySelectorAll('[data-ramp-item-up]').forEach(b=>b.onclick=()=>{const x=b.closest('[data-ramp-item]'),p=x?.previousElementSibling;if(x&&p){x.parentNode.insertBefore(x,p);refreshRampNumbers();}});
  document.querySelectorAll('[data-ramp-item-down]').forEach(b=>b.onclick=()=>{const x=b.closest('[data-ramp-item]'),nxt=x?.nextElementSibling;if(x&&nxt){x.parentNode.insertBefore(nxt,x);refreshRampNumbers();}});
}
function addRampGroup(){const host=document.getElementById('ramp-editor');if(!host)return;const wrap=document.createElement('div');wrap.innerHTML=renderRampEditGroup({code:'',name:'',items:[]},host.children.length);host.appendChild(wrap.firstElementChild);bindRampEditorActions();refreshRampNumbers();}
function readRampEditor(){return [...document.querySelectorAll('[data-ramp-group]')].map(g=>({code:g.querySelector('[data-ramp-group-code]')?.value.trim()||'',name:g.querySelector('[data-ramp-group-name]')?.value.trim()||'',items:[...g.querySelectorAll('[data-ramp-item]')].map(it=>({name:it.querySelector('[data-ramp-item-name]')?.value.trim()||'',dose:it.querySelector('[data-ramp-item-dose]')?.value.trim()||''})).filter(x=>x.name)})).filter(g=>g.name||g.code||g.items.length);}
async function saveStrengthUnit(w){
  const button=document.getElementById('strength-unit-save'),meta=document.querySelector('[data-strength-meta]');button.disabled=true;const oldText=button.textContent;button.textContent='UKLADÁM…';
  let ok=true;for(const card of [...document.querySelectorAll('[data-plan-card]')]){if(!(await savePlanExerciseCard(card,false))){ok=false;break;}}
  if(ok){let next={...safeJson(w.payload),title:meta.querySelector('[data-strength-field="title"]').value.trim()||safeJson(w.payload).title||'Silový tréning',type:'Silový tréning',ramp:readRampEditor()};next=applyDaysToPayload(next,readScheduleDays(meta));const r=await supabase.from('trainer_hub_workouts').update({payload:next}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('id',w.id);if(r.error){ok=false;toast(`Tréning sa neuložil: ${r.error.message}`,'error',4500);}else w.payload=next;}
  if(ok)await normalizeExerciseOrdinals(w.id);button.disabled=false;button.textContent=oldText;if(ok){toast('Celá tréningová jednotka uložená.');renderStrengthUnitEditor(w.id);}
}
async function normalizeExerciseOrdinals(workoutId){const rows=state.planExercises.filter(x=>x.workout_id===workoutId).sort((a,b)=>n(a.ordinal,0)-n(b.ordinal,0));for(let i=0;i<rows.length;i++){const wanted=i+1;if(n(rows[i].ordinal,0)===wanted)continue;const r=await supabase.from('trainer_hub_workout_exercises').update({ordinal:wanted}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',workoutId).eq('id',rows[i].id);if(!r.error)rows[i].ordinal=wanted;}return true;}
async function moveExerciseInWorkout(card,direction,w){const row=getPlanRowFromCard(card);if(!row)return;const rows=planRowsForWorkout(w),i=rows.findIndex(x=>x.id===row.id),j=direction==='up'?i-1:i+1;if(i<0||j<0||j>=rows.length)return;const other=rows[j],a=row.ordinal,b=other.ordinal;let r=await supabase.from('trainer_hub_workout_exercises').update({ordinal:b}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',w.id).eq('id',row.id);if(r.error)return toast('Poradie sa nepodarilo zmeniť.','error');r=await supabase.from('trainer_hub_workout_exercises').update({ordinal:a}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',w.id).eq('id',other.id);if(r.error)return toast('Poradie sa nepodarilo zmeniť.','error');row.ordinal=b;other.ordinal=a;await normalizeExerciseOrdinals(w.id);renderStrengthUnitEditor(w.id);}
async function deleteExerciseFromWorkout(card,w){const row=getPlanRowFromCard(card);if(!row)return;if(!confirm(`Odstrániť ${exerciseName(safeJson(row.payload),row.exercise_key)} z tejto jednotky? História zostane zachovaná.`))return;const r=await supabase.from('trainer_hub_workout_exercises').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',w.id).eq('id',row.id);if(r.error)return toast('Cvik sa nepodarilo odstrániť.','error');state.planExercises=state.planExercises.filter(x=>x!==row);await normalizeExerciseOrdinals(w.id);renderStrengthUnitEditor(w.id);}
function showAddExerciseFormV39(w){const host=document.querySelector('.plan-editor-list');if(!host)return;if(document.getElementById('plan-new-card'))return;const number=planRowsForWorkout(w).length+1,box=document.createElement('article');box.className='plan-edit-card new';box.id='plan-new-card';box.innerHTML=`<div class="plan-edit-title"><div class="plan-number">${number}</div><div><strong>Nový cvik</strong><span>Po uložení zostane v tejto jednotke</span></div></div><div class="plan-field full"><label>Slovenský názov<input id="plan-new-name"></label></div><div class="plan-field full"><label>Anglický názov<input id="plan-new-english"></label></div><div class="plan-grid"><div class="plan-field"><label>Váha<input id="plan-new-weight" type="number" step="0.25" value="0"></label></div><div class="plan-field"><label>Série<input id="plan-new-sets" type="number" min="1" value="3"></label></div><div class="plan-field"><label>Reps od<input id="plan-new-min" type="number" min="1" value="8"></label></div><div class="plan-field"><label>Reps do<input id="plan-new-max" type="number" min="1" value="12"></label></div><div class="plan-field"><label>RIR od<input id="plan-new-rir-min" type="number" min="0" value="1"></label></div><div class="plan-field"><label>RIR do<input id="plan-new-rir-max" type="number" min="0" value="2"></label></div><div class="plan-field"><label>Pauza (s)<input id="plan-new-rest" type="number" min="0" value="90"></label></div></div><div class="plan-card-actions"><button class="plan-delete" id="plan-new-cancel">Zrušiť</button><button class="plan-save-one" id="plan-new-save">Pridať a uložiť</button></div>`;host.appendChild(box);document.getElementById('plan-new-cancel').onclick=()=>box.remove();document.getElementById('plan-new-save').onclick=()=>addExerciseToWorkoutV39(w);document.getElementById('plan-new-name').focus();}
async function addExerciseToWorkoutV39(w){const name=document.getElementById('plan-new-name').value.trim(),english=document.getElementById('plan-new-english').value.trim();if(!name&&!english)return toast('Zadaj názov cviku.','error');const rows=planRowsForWorkout(w),ordinal=rows.length+1,key=slugify(english||name),id=`custom-${Date.now()}-${key.slice(0,28)}`,repMin=Math.max(1,Math.round(n(document.getElementById('plan-new-min').value,8))),repMax=Math.max(repMin,Math.round(n(document.getElementById('plan-new-max').value,12)));const payload={name:name||english,englishName:english||name,exerciseKey:key,weight:Math.max(0,n(document.getElementById('plan-new-weight').value,0)),sets:Math.max(1,Math.round(n(document.getElementById('plan-new-sets').value,3))),repMin,repMax,rirMin:Math.max(0,Math.round(n(document.getElementById('plan-new-rir-min').value,1))),rirMax:Math.max(0,Math.round(n(document.getElementById('plan-new-rir-max').value,2))),restSeconds:Math.max(0,Math.round(n(document.getElementById('plan-new-rest').value,90))),restMinSeconds:Math.max(0,Math.round(n(document.getElementById('plan-new-rest').value,90))),autoProgress:false,weightUpdatedAt:new Date().toISOString(),loadCount:1,sides:1};payload.rirMax=Math.max(payload.rirMin,payload.rirMax);const row={owner_id:state.user.id,client_id:CLIENT_ID,plan_id:state.plan.id,workout_id:w.id,id,ordinal,exercise_key:key,payload};let r=await supabase.from('trainer_hub_workout_exercises').insert(row);if(r.error)return toast(`Cvik sa nepodarilo pridať: ${r.error.message}`,'error',4500);const verify=await supabase.from('trainer_hub_workout_exercises').select('*').eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',w.id).eq('id',id).limit(1);if(verify.error||!verify.data?.length)return toast('Cvik bol odoslaný, ale databáza ho nepotvrdila.','error',4500);state.planExercises.push(verify.data[0]);await normalizeExerciseOrdinals(w.id);toast('Cvik je uložený v pláne.');renderStrengthUnitEditor(w.id);}

function renderRoutinePlanEditor(workoutId){
  const w=state.workouts.find(x=>x.id===workoutId);if(!w)return renderFullPlanOverview();const p=safeJson(w.payload),items=Array.isArray(p.after)?p.after:[];
  const content=`<div class="plan-editor-header"><button class="back-button" id="routine-plan-back">${icon('back')}</button><div><span>${h(p.type||'TRÉNING')}</span><h1>${h(p.title||p.type||'Tréning')}</h1></div></div><div class="routine-plan-card" data-routine-plan-card data-workout-id="${h(w.id)}"><div class="plan-grid routine-main-grid"><div class="plan-field full-span"><label>Názov tréningu<input data-routine-field="title" value="${h(p.title||'')}"></label></div><div class="plan-field"><label>Typ<select data-routine-field="type">${workoutTypeOptions(p.type||'Iné')}</select></label></div><div class="plan-field full-span"><label>Trvanie<input data-routine-field="durationRange" value="${h(p.durationRange||'')}"></label></div><div class="plan-field"><label>Tep od<input data-routine-field="heartRateLow" type="number" value="${h(p.heartRateLow??'')}"></label></div><div class="plan-field"><label>Tep do<input data-routine-field="heartRateHigh" type="number" value="${h(p.heartRateHigh??'')}"></label></div><div class="plan-field full-span"><label>Inštrukcie<textarea data-routine-field="instructions" rows="5">${h(p.instructions||'')}</textarea></label></div></div><div class="routine-editor-heading"><div><span>ROZVRH</span><b>Jeden alebo viac dní</b></div></div>${schedulePickerHtml(p,'routine-day')}<div class="routine-editor-heading"><div><span>CHECKLIST / CVIKY</span><b>Jednotlivé body tréningu</b></div><button id="routine-add-item">+ Pridať</button></div><div class="routine-edit-items" id="routine-edit-items">${items.map((item,i)=>renderRoutineEditItem(item,i)).join('')}</div><button class="plan-save-all routine-save" id="routine-save-plan">ULOŽIŤ JEDNOTKU</button><button class="unit-delete-button" id="delete-workout-unit">Odstrániť tréningovú jednotku</button></div>`;
  app.innerHTML=shell(content,'profile');bindNav();document.getElementById('routine-plan-back').onclick=renderFullPlanOverview;document.getElementById('routine-add-item').onclick=addRoutineEditItem;document.getElementById('routine-save-plan').onclick=()=>saveRoutinePlan(w);document.getElementById('delete-workout-unit').onclick=()=>deleteWorkoutUnit(w);bindRoutineEditItemActions();
}
function renderRoutineEditItem(item={},index=0){const how=Array.isArray(item.how)?item.how.join('\n'):String(item.how||'');return `<article class="routine-edit-item" data-routine-item><div class="routine-item-head"><span>${index+1}</span><b>${h(item.name||'Nový bod')}</b><div><button type="button" data-routine-up>↑</button><button type="button" data-routine-down>↓</button><button type="button" data-routine-remove>×</button></div></div><div class="plan-field full"><label>Názov<input data-routine-item-field="name" value="${h(item.name||'')}"></label></div><div class="plan-field full"><label>Dávka / trvanie<input data-routine-item-field="dose" value="${h(item.dose||'')}"></label></div><div class="plan-field full"><label>Technika<textarea data-routine-item-field="how" rows="3">${h(how)}</textarea></label></div><div class="plan-field full"><label>Prečo / účel<textarea data-routine-item-field="why" rows="3">${h(item.why||'')}</textarea></label></div></article>`;}
async function saveRoutinePlan(w){const card=document.querySelector('[data-routine-plan-card]');if(!card)return;const get=name=>card.querySelector(`[data-routine-field="${name}"]`),old=safeJson(w.payload);let next={...old,title:get('title').value.trim()||old.title||'Tréning',type:get('type').value.trim()||old.type||'Iné',durationRange:get('durationRange').value.trim(),instructions:get('instructions').value.trim()};const low=get('heartRateLow').value.trim(),high=get('heartRateHigh').value.trim();if(low)next.heartRateLow=n(low,null);else delete next.heartRateLow;if(high)next.heartRateHigh=n(high,null);else delete next.heartRateHigh;next.after=[...card.querySelectorAll('[data-routine-item]')].map(item=>{const v=name=>item.querySelector(`[data-routine-item-field="${name}"]`)?.value.trim()||'';return{name:v('name'),dose:v('dose'),how:v('how')?v('how').split('\n').map(x=>x.trim()).filter(Boolean):[],why:v('why')};}).filter(x=>x.name);next=applyDaysToPayload(next,readScheduleDays(card));const button=document.getElementById('routine-save-plan'),oldText=button.textContent;button.disabled=true;button.textContent='UKLADÁM…';const r=await supabase.from('trainer_hub_workouts').update({payload:next}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('id',w.id);button.disabled=false;button.textContent=oldText;if(r.error)return toast(`Tréning sa neuložil: ${r.error.message}`,'error',4500);w.payload=next;toast('Tréningová jednotka uložená.');renderRoutinePlanEditor(w.id);}
async function deleteWorkoutUnit(w){if(!confirm(`Odstrániť celú jednotku „${safeJson(w.payload).title||'Tréning'}“? Historické tréningy zostanú zachované.`))return;const children=state.planExercises.filter(x=>x.workout_id===w.id);for(const row of children){const r=await supabase.from('trainer_hub_workout_exercises').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',w.id).eq('id',row.id);if(r.error)return toast(`Cviky sa nepodarilo odstrániť: ${r.error.message}`,'error',4500);}const r=await supabase.from('trainer_hub_workouts').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('id',w.id);if(r.error)return toast(`Jednotka sa nepodarila odstrániť: ${r.error.message}`,'error',4500);state.planExercises=state.planExercises.filter(x=>x.workout_id!==w.id);state.workouts=state.workouts.filter(x=>x.id!==w.id);toast('Tréningová jednotka odstránená.');renderFullPlanOverview();}

function nextPlannedWorkout(){if(!state.workouts.length)return null;const today=new Date().getDay(),order=[0,1,2,3,4,5,6];let best=null;for(const w of state.workouts){for(const d of workoutDays(w.payload)){const delta=(d-today+7)%7;if(!best||delta<best.delta||(delta===best.delta&&n(w.ordinal,0)<n(best.w.ordinal,0)))best={w,delta,day:d};}}return best;}

