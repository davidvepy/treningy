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
  const working=prev.sets.filter(s=>(s.set_type||'working')!=='warmup'&&s.complete!==false&&n(s.weight,null)!==null).sort((a,b)=>n(a.ordinal,0)-n(b.ordinal,0));
  return n(working.at(-1)?.weight,planned);
}

function renderProfile(){
  const content=`<header class="page-title"><h1>Profil</h1></header>
    <div class="profile-card"><div><span>Prihlásený účet</span><b>${h(state.user.email||'Dávid')}</b></div><button id="logout">Odhlásiť</button></div>

    <div class="section-bar"><h2>TRÉNINGOVÝ PLÁN</h2></div>
    <div class="plan-editor-entry">
      <div><b>Upraviť A / B / C</b><span>Váhy, série, opakovania, pauzy a poradie.</span></div>
      <button id="open-plan-editor">Upraviť plán</button>
    </div>

    <div class="section-bar"><h2>AKO TRÉNOVAŤ</h2></div>
    <div class="help-list">
      <details><summary>Ako fungujú supersety</summary><p>Dva cviky ideš po sebe bez plnej pauzy. Pauzu odpočítavaj až po druhom cviku páru.</p></details>
      <details><summary>Keď máš len 35 minút</summary><p>Nechaj hlavné pracovné cviky a skráť doplnkový objem. Rozcvičku a technicky náročný prvý cvik nevyhadzuj.</p></details>
      <details><summary>Ako voliť váhu</summary><p>Vyber záťaž, s ktorou spravíš cieľový rozsah opakovaní čistou technikou bez bolestivej kompenzácie.</p></details>
      <details><summary>Kedy pridať váhu</summary><p>Váhu zvyšuješ ty podľa RIR, techniky a výkonu. Ak ju počas tréningu zmeníš, aplikácia si zapamätá poslednú dokončenú pracovnú váhu a pri ďalšom tréningu ju použije ako východiskovú.</p></details>
      <details><summary>Týždenný objem</summary><p>Tonáž a počet sérií sleduj ako trend. Nie sú samy osebe skóre kvality tréningu.</p></details>
    </div>
    <div class="app-info"><span>Tréning v${APP_VERSION} · editor plánu 3.6</span><p>Dáta sú uložené v Supabase. Úprava plánu nemení starú históriu tréningov.</p></div>`;
  app.innerHTML=shell(content,'profile');
  bindNav();
  document.getElementById('logout').onclick=()=>supabase.auth.signOut();
  document.getElementById('open-plan-editor').onclick=()=>renderPlanEditor('A');
}

function planTemplateByKey(key){return strengthTemplates()[key]||null;}
function planRowsForWorkout(workout){
  return workout?state.planExercises.filter(x=>x.workout_id===workout.id).filter(x=>validExerciseName(exerciseName(safeJson(x.payload),x.exercise_key))).sort((a,b)=>a.ordinal-b.ordinal):[];
}

function renderPlanEditor(selected='A'){
  const workout=planTemplateByKey(selected);
  const rows=planRowsForWorkout(workout);
  const activeNotice=state.activeSession?'<div class="plan-editor-notice">Máš otvorený tréning. Zmeny plánu sa použijú až pri ďalšom novom tréningu.</div>':'';
  const content=`
    <div class="plan-editor-header">
      <button class="back-button" id="plan-editor-back">${icon('back')}</button>
      <div><span>TRÉNINGOVÝ PLÁN</span><h1>Upraviť plán</h1></div>
    </div>
    ${activeNotice}
    <div class="plan-tabs">${['A','B','C'].map(k=>`<button class="${k===selected?'active':''}" data-plan-tab="${k}">${k}</button>`).join('')}</div>
    <div class="plan-editor-summary"><b>${h(safeJson(workout?.payload).title||`Tréning ${selected}`)}</b><span>Váhu meníš ručne podľa RIR. Aplikácia nič automaticky nezvyšuje; pri ďalšom tréningu použije poslednú dokončenú pracovnú váhu, pokiaľ si medzitým ručne nezmenil váhu v pláne.</span></div>
    <div class="plan-editor-list">${rows.length?rows.map((row,i)=>renderPlanExerciseEditor(row,i+1,rows.length)).join(''):'<div class="empty-card">Tento tréning nemá žiadne pracovné cviky.</div>'}</div>
    <button class="plan-add-exercise" id="plan-add-exercise">+ PRIDAŤ CVIK</button>
    ${rows.length?'<button class="plan-save-all" id="plan-save-all">ULOŽIŤ VŠETKY ZMENY</button>':''}`;

  app.innerHTML=shell(content,'profile');
  bindNav();
  document.getElementById('plan-editor-back').onclick=renderProfile;
  document.querySelectorAll('[data-plan-tab]').forEach(b=>b.onclick=()=>renderPlanEditor(b.dataset.planTab));
  document.querySelectorAll('[data-plan-save]').forEach(b=>b.onclick=()=>savePlanExerciseCard(b.closest('[data-plan-card]'),true));
  document.querySelectorAll('[data-plan-move]').forEach(b=>b.onclick=()=>movePlanExercise(b.closest('[data-plan-card]'),b.dataset.planMove,selected));
  document.querySelectorAll('[data-plan-delete]').forEach(b=>b.onclick=()=>deletePlanExercise(b.closest('[data-plan-card]'),selected));
  document.getElementById('plan-add-exercise').onclick=()=>showAddExerciseForm(workout,selected);
  const all=document.getElementById('plan-save-all');
  if(all)all.onclick=()=>saveAllPlanChanges(all);
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
    <div class="plan-field full"><label>Slovenský názov<input data-plan-field="name" value="${h(p.name||'')}"></label></div>
    <div class="plan-field full"><label>Anglický názov<input data-plan-field="englishName" value="${h(p.englishName||'')}"></label></div>
    <div class="plan-grid">
      <div class="plan-field"><label>Váha (kg)<input data-plan-field="weight" type="number" inputmode="decimal" step="0.25" value="${h(p.weight??0)}"></label></div>
      <div class="plan-field"><label>Série<input data-plan-field="sets" type="number" inputmode="numeric" min="1" step="1" value="${h(p.sets??3)}"></label></div>
      <div class="plan-field"><label>Opak. od<input data-plan-field="repMin" type="number" inputmode="numeric" min="1" step="1" value="${h(p.repMin??8)}"></label></div>
      <div class="plan-field"><label>Opak. do<input data-plan-field="repMax" type="number" inputmode="numeric" min="1" step="1" value="${h(p.repMax??p.repMin??8)}"></label></div>
      <div class="plan-field"><label>Pauza (s)<input data-plan-field="restSeconds" type="number" inputmode="numeric" min="0" step="5" value="${h(rest)}"></label></div>
    </div>
    <div class="plan-card-actions"><button class="plan-delete" data-plan-delete>Odstrániť</button><button class="plan-save-one" data-plan-save>Uložiť cvik</button></div>
  </article>`;
}

function getPlanRowFromCard(card){return state.planExercises.find(x=>x.id===card.dataset.rowId&&x.workout_id===card.dataset.workoutId)||null;}

async function savePlanExerciseCard(card,showToast=false){
  if(!card)return false;
  const row=getPlanRowFromCard(card);
  if(!row)return false;
  const old=safeJson(row.payload);
  const val=name=>card.querySelector(`[data-plan-field="${name}"]`);
  const next={...old};
  next.name=val('name').value.trim()||old.name||'';
  next.englishName=val('englishName').value.trim()||old.englishName||next.name;
  const newWeight=Math.max(0,n(val('weight').value,n(old.weight,0)));
  if(newWeight!==n(old.weight,0))next.weightUpdatedAt=new Date().toISOString();
  next.weight=newWeight;
  next.sets=Math.max(1,Math.round(n(val('sets').value,n(old.sets,3))));
  next.repMin=Math.max(1,Math.round(n(val('repMin').value,n(old.repMin,8))));
  next.repMax=Math.max(next.repMin,Math.round(n(val('repMax').value,n(old.repMax,next.repMin))));
  next.restSeconds=Math.max(0,Math.round(n(val('restSeconds').value,n(old.restSeconds,n(old.restMinSeconds,90)))));
  next.restMinSeconds=Math.min(next.restSeconds,Math.max(0,n(old.restMinSeconds,next.restSeconds)));
  next.autoProgress=false;

  const r=await supabase.from('trainer_hub_workout_exercises').update({payload:next})
    .eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id)
    .eq('workout_id',row.workout_id).eq('id',row.id);
  if(r.error){toast(`Cvik sa neuložil: ${r.error.message}`,'error',4200);return false;}
  row.payload=next;
  if(showToast)toast('Cvik uložený.');
  return true;
}

async function saveAllPlanChanges(button){
  const cards=[...document.querySelectorAll('[data-plan-card]')];
  if(!cards.length)return;
  button.disabled=true;
  const oldText=button.textContent;
  button.textContent='UKLADÁM…';
  let ok=true;
  for(const card of cards){if(!(await savePlanExerciseCard(card,false))){ok=false;break;}}
  button.disabled=false;
  button.textContent=oldText;
  if(ok)toast('Celý tréningový plán je uložený.');
}

async function movePlanExercise(card,direction,selected){
  const row=getPlanRowFromCard(card);if(!row)return;
  const workout=planTemplateByKey(selected);const rows=planRowsForWorkout(workout);
  const i=rows.findIndex(x=>x.id===row.id);const j=direction==='up'?i-1:i+1;
  if(i<0||j<0||j>=rows.length)return;
  const other=rows[j],a=row.ordinal,b=other.ordinal;
  const r1=await supabase.from('trainer_hub_workout_exercises').update({ordinal:b}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',row.workout_id).eq('id',row.id);
  if(r1.error)return toast('Poradie sa nepodarilo zmeniť.','error');
  const r2=await supabase.from('trainer_hub_workout_exercises').update({ordinal:a}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',other.workout_id).eq('id',other.id);
  if(r2.error)return toast('Poradie sa nepodarilo zmeniť.','error');
  row.ordinal=b;other.ordinal=a;renderPlanEditor(selected);
}

async function deletePlanExercise(card,selected){
  const row=getPlanRowFromCard(card);if(!row)return;
  if(!confirm(`Odstrániť ${exerciseName(safeJson(row.payload),row.exercise_key)} z tréningového plánu? História zostane zachovaná.`))return;
  const r=await supabase.from('trainer_hub_workout_exercises').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',row.workout_id).eq('id',row.id);
  if(r.error)return toast('Cvik sa nepodarilo odstrániť.','error');
  state.planExercises=state.planExercises.filter(x=>x!==row);
  toast('Cvik odstránený z plánu.');renderPlanEditor(selected);
}

function showAddExerciseForm(workout,selected){
  if(!workout)return;
  const host=document.querySelector('.plan-editor-list');if(!host)return;
  if(document.getElementById('plan-new-card'))return document.getElementById('plan-new-name')?.focus();
  const box=document.createElement('article');box.className='plan-edit-card new';box.id='plan-new-card';
  box.innerHTML=`<div class="plan-edit-title"><div class="plan-number">+</div><div><strong>Nový cvik</strong><span>Pridá sa iba do tréningu ${selected}</span></div></div>
    <div class="plan-field full"><label>Slovenský názov<input id="plan-new-name" placeholder="Napr. Príťah na kladke"></label></div>
    <div class="plan-field full"><label>Anglický názov<input id="plan-new-english" placeholder="Seated Cable Row"></label></div>
    <div class="plan-grid">
      <div class="plan-field"><label>Váha (kg)<input id="plan-new-weight" type="number" inputmode="decimal" step="0.25" value="0"></label></div>
      <div class="plan-field"><label>Série<input id="plan-new-sets" type="number" min="1" value="3"></label></div>
      <div class="plan-field"><label>Opak. od<input id="plan-new-min" type="number" min="1" value="8"></label></div>
      <div class="plan-field"><label>Opak. do<input id="plan-new-max" type="number" min="1" value="12"></label></div>
      <div class="plan-field"><label>Pauza (s)<input id="plan-new-rest" type="number" min="0" step="5" value="90"></label></div>
    </div>
    <div class="plan-card-actions"><button class="plan-delete" id="plan-new-cancel">Zrušiť</button><button class="plan-save-one" id="plan-new-save">Pridať cvik</button></div>`;
  host.appendChild(box);
  document.getElementById('plan-new-cancel').onclick=()=>box.remove();
  document.getElementById('plan-new-save').onclick=()=>addPlanExercise(workout,selected,box);
  document.getElementById('plan-new-name').focus();
}

async function addPlanExercise(workout,selected,box){
  const name=document.getElementById('plan-new-name').value.trim();
  const english=document.getElementById('plan-new-english').value.trim();
  if(!name&&!english)return toast('Zadaj názov cviku.','error');
  const rows=planRowsForWorkout(workout);const ordinal=(rows.at(-1)?.ordinal||0)+1;
  const key=slugify(english||name);const id=`custom-${Date.now()}-${key.slice(0,24)}`;
  const payload={name:name||english,englishName:english||name,exerciseKey:key,weight:Math.max(0,n(document.getElementById('plan-new-weight').value,0)),sets:Math.max(1,Math.round(n(document.getElementById('plan-new-sets').value,3))),repMin:Math.max(1,Math.round(n(document.getElementById('plan-new-min').value,8))),repMax:Math.max(1,Math.round(n(document.getElementById('plan-new-max').value,12))),restSeconds:Math.max(0,Math.round(n(document.getElementById('plan-new-rest').value,90))),autoProgress:false,weightUpdatedAt:new Date().toISOString(),loadCount:1,sides:1};
  payload.repMax=Math.max(payload.repMin,payload.repMax);
  const row={owner_id:state.user.id,client_id:CLIENT_ID,plan_id:state.plan.id,workout_id:workout.id,id,ordinal,exercise_key:key,payload};
  const r=await supabase.from('trainer_hub_workout_exercises').insert(row);
  if(r.error)return toast(`Cvik sa nepodarilo pridať: ${r.error.message}`,'error',4200);
  state.planExercises.push(row);toast('Cvik pridaný do plánu.');renderPlanEditor(selected);
}

/* ===== v3.7 – full weekly plan editor (strength + running/mobility/routines) ===== */
function renderProfile(){
  const content=`<header class="page-title"><h1>Profil</h1></header>
    <div class="profile-card"><div><span>Prihlásený účet</span><b>${h(state.user.email||'Dávid')}</b></div><button id="logout">Odhlásiť</button></div>

    <div class="section-bar"><h2>TRÉNINGOVÝ PLÁN</h2></div>
    <div class="plan-editor-entry full-plan-entry">
      <div><b>Upraviť celý týždeň</b><span>Silové A/B/C, Zone 2, beh, mobilita, regenerácia aj hokej.</span></div>
      <button id="open-full-plan-editor">Upraviť plán</button>
    </div>

    <div class="section-bar"><h2>AKO TRÉNOVAŤ</h2></div>
    <div class="help-list">
      <details><summary>Ako fungujú supersety</summary><p>Dva cviky ideš po sebe bez plnej pauzy. Pauzu odpočítavaj až po druhom cviku páru.</p></details>
      <details><summary>Keď máš len 35 minút</summary><p>Nechaj hlavné pracovné cviky a skráť doplnkový objem. Rozcvičku a technicky náročný prvý cvik nevyhadzuj.</p></details>
      <details><summary>Ako voliť váhu</summary><p>Vyber záťaž, s ktorou spravíš cieľový rozsah opakovaní čistou technikou bez bolestivej kompenzácie.</p></details>
      <details><summary>Kedy pridať váhu</summary><p>Váhu zvyšuješ ty podľa RIR, techniky a výkonu. Ak ju počas tréningu zmeníš, aplikácia si zapamätá poslednú dokončenú pracovnú váhu a pri ďalšom tréningu ju použije ako východiskovú.</p></details>
      <details><summary>Týždenný objem</summary><p>Tonáž a počet sérií sleduj ako trend. Nie sú samy osebe skóre kvality tréningu.</p></details>
    </div>
    <div class="app-info"><span>Tréning v${APP_VERSION} · editor celého týždňa</span><p>Dáta sú uložené v Supabase. Úprava plánu nemení starú históriu tréningov.</p></div>`;
  app.innerHTML=shell(content,'profile');
  bindNav();
  document.getElementById('logout').onclick=()=>supabase.auth.signOut();
  document.getElementById('open-full-plan-editor').onclick=renderFullPlanOverview;
}

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
function renderFullPlanOverview(){
  const templates=strengthTemplates();
  const routines=routinePlanRows();
  const content=`
    <div class="plan-editor-header">
      <button class="back-button" id="full-plan-back">${icon('back')}</button>
      <div><span>TRÉNINGOVÝ PLÁN</span><h1>Upraviť celý týždeň</h1></div>
    </div>
    ${state.activeSession?'<div class="plan-editor-notice">Máš otvorený tréning. Zmeny plánu sa použijú až pri ďalšom novom tréningu.</div>':''}
    <div class="plan-editor-summary"><b>Všetko na jednom mieste</b><span>Silové tréningy upravuješ po cvikoch. Pri Zone 2, behoch, mobilite a ďalších aktivitách môžeš meniť názov, deň, trvanie, tep, inštrukcie aj checklist.</span></div>

    <div class="section-bar plan-section-bar"><h2>SILOVÉ TRÉNINGY</h2></div>
    <div class="full-plan-strength-grid">${['A','B','C'].map(k=>{
      const w=templates[k],p=safeJson(w?.payload),count=planRowsForWorkout(w).length;
      return `<button class="full-plan-tile strength" data-edit-strength="${k}" ${w?'':'disabled'}><span>TRÉNING ${k}</span><strong>${h(p.title||`Tréning ${k}`)}</strong><small>${count} cvikov · váhy, série, reps, pauzy</small><i>›</i></button>`;
    }).join('')}</div>

    <div class="section-bar plan-section-bar"><h2>KONDÍCIA, MOBILITA A OSTATNÉ</h2></div>
    <div class="full-plan-routine-list">${routines.length?routines.map(renderRoutineOverviewCard).join(''):'<div class="empty-card">V pláne nie sú ďalšie tréningy.</div>'}</div>`;
  app.innerHTML=shell(content,'profile');
  bindNav();
  document.getElementById('full-plan-back').onclick=renderProfile;
  document.querySelectorAll('[data-edit-strength]').forEach(b=>b.onclick=()=>renderPlanEditor(b.dataset.editStrength));
  document.querySelectorAll('[data-edit-routine]').forEach(b=>b.onclick=()=>renderRoutinePlanEditor(b.dataset.editRoutine));
}
function renderRoutineOverviewCard(w){
  const p=safeJson(w.payload),after=Array.isArray(p.after)?p.after:[];
  const meta=[p.type,p.durationRange,p.heartRateLow&&p.heartRateHigh?`${p.heartRateLow}–${p.heartRateHigh} bpm`:null,after.length?`${after.length} bodov`:null].filter(Boolean).join(' · ');
  return `<button class="full-plan-tile routine" data-edit-routine="${h(w.id)}"><span>${h(planDayLabel(p.day))}</span><strong>${h(p.title||p.type||'Tréning')}</strong><small>${h(meta||'Upraviť detaily')}</small><i>›</i></button>`;
}

function renderRoutinePlanEditor(workoutId){
  const w=state.workouts.find(x=>x.id===workoutId);
  if(!w)return renderFullPlanOverview();
  const p=safeJson(w.payload),items=Array.isArray(p.after)?p.after:[];
  const content=`
    <div class="plan-editor-header">
      <button class="back-button" id="routine-plan-back">${icon('back')}</button>
      <div><span>${h(planDayLabel(p.day).toUpperCase())}</span><h1>${h(p.title||p.type||'Tréning')}</h1></div>
    </div>
    <div class="routine-plan-card" data-routine-plan-card data-workout-id="${h(w.id)}">
      <div class="plan-grid routine-main-grid">
        <div class="plan-field full-span"><label>Názov tréningu<input data-routine-field="title" value="${h(p.title||'')}"></label></div>
        <div class="plan-field"><label>Deň<select data-routine-field="day">${[1,2,3,4,5,6,0].map(d=>`<option value="${d}" ${n(p.day,0)===d?'selected':''}>${planDayLabel(d)}</option>`).join('')}</select></label></div>
        <div class="plan-field"><label>Typ<input data-routine-field="type" value="${h(p.type||'')}"></label></div>
        <div class="plan-field full-span"><label>Trvanie<input data-routine-field="durationRange" placeholder="napr. 35–45 min" value="${h(p.durationRange||'')}"></label></div>
        <div class="plan-field"><label>Tep od<input data-routine-field="heartRateLow" type="number" inputmode="numeric" placeholder="—" value="${h(p.heartRateLow??'')}"></label></div>
        <div class="plan-field"><label>Tep do<input data-routine-field="heartRateHigh" type="number" inputmode="numeric" placeholder="—" value="${h(p.heartRateHigh??'')}"></label></div>
        <div class="plan-field full-span"><label>Inštrukcie<textarea data-routine-field="instructions" rows="5" placeholder="Popis tréningu…">${h(p.instructions||'')}</textarea></label></div>
      </div>

      <div class="routine-editor-heading"><div><span>CHECKLIST / CVIKY</span><b>Jednotlivé body tréningu</b></div><button id="routine-add-item">+ Pridať</button></div>
      <div class="routine-edit-items" id="routine-edit-items">${items.map((item,i)=>renderRoutineEditItem(item,i)).join('')}</div>
      <button class="plan-save-all routine-save" id="routine-save-plan">ULOŽIŤ TRÉNING</button>
    </div>`;
  app.innerHTML=shell(content,'profile');
  bindNav();
  document.getElementById('routine-plan-back').onclick=renderFullPlanOverview;
  document.getElementById('routine-add-item').onclick=()=>addRoutineEditItem();
  document.getElementById('routine-save-plan').onclick=()=>saveRoutinePlan(w);
  bindRoutineEditItemActions();
}
function renderRoutineEditItem(item={},index=0){
  const how=Array.isArray(item.how)?item.how.join('\n'):String(item.how||'');
  return `<article class="routine-edit-item" data-routine-item>
    <div class="routine-item-head"><span>${index+1}</span><b>${h(item.name||'Nový bod')}</b><div><button type="button" data-routine-up>↑</button><button type="button" data-routine-down>↓</button><button type="button" data-routine-remove>×</button></div></div>
    <div class="plan-field full"><label>Názov<input data-routine-item-field="name" value="${h(item.name||'')}"></label></div>
    <div class="plan-field full"><label>Dávka / trvanie<input data-routine-item-field="dose" placeholder="napr. 2×6/strana" value="${h(item.dose||'')}"></label></div>
    <div class="plan-field full"><label>Technika / poznámka<textarea data-routine-item-field="how" rows="3" placeholder="Voliteľné">${h(how)}</textarea></label></div>
  </article>`;
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
async function saveRoutinePlan(w){
  const card=document.querySelector('[data-routine-plan-card]');if(!card)return;
  const get=name=>card.querySelector(`[data-routine-field="${name}"]`);
  const old=safeJson(w.payload),next={...old};
  next.title=get('title').value.trim()||old.title||old.type||'Tréning';
  next.day=n(get('day').value,n(old.day,0));
  next.type=get('type').value.trim()||old.type||'Tréning';
  next.durationRange=get('durationRange').value.trim();
  const low=get('heartRateLow').value.trim(),high=get('heartRateHigh').value.trim();
  if(low)next.heartRateLow=Math.max(0,Math.round(n(low,0)));else delete next.heartRateLow;
  if(high)next.heartRateHigh=Math.max(0,Math.round(n(high,0)));else delete next.heartRateHigh;
  next.instructions=get('instructions').value.trim();
  next.after=[...card.querySelectorAll('[data-routine-item]')].map(item=>{
    const f=name=>item.querySelector(`[data-routine-item-field="${name}"]`);
    const how=f('how').value.split(/\n+/).map(x=>x.trim()).filter(Boolean);
    return {name:f('name').value.trim(),dose:f('dose').value.trim(),how,working:false};
  }).filter(x=>x.name);
  const btn=document.getElementById('routine-save-plan');btn.disabled=true;btn.textContent='UKLADÁM…';
  const r=await supabase.from('trainer_hub_workouts').update({payload:next})
    .eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('id',w.id);
  btn.disabled=false;btn.textContent='ULOŽIŤ TRÉNING';
  if(r.error)return toast(`Tréning sa nepodarilo uložiť: ${r.error.message}`,'error',4500);
  w.payload=next;toast('Tréningový plán uložený.');renderRoutinePlanEditor(w.id);
}
