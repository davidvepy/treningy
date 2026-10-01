/* v4.5 – edit/delete completed workouts + explicit tonnage rules */
(function(){
  const css=document.createElement('style');
  css.textContent=`
    .history-session-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 12px}
    .history-session-actions button{height:42px;border-radius:11px;font-size:11px;font-weight:900}
    .history-edit-session{border:1px solid #cbdceb;background:#f7fbff;color:#245f93}
    .history-delete-session{border:1px solid #efcaca;background:#fff7f7;color:#a63c3c}
    .history-editor-card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:13px;margin-bottom:10px}
    .history-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .history-editor-field{display:block;font-size:9px;font-weight:850;color:#6a7280;text-transform:uppercase;letter-spacing:.04em}
    .history-editor-field.full{grid-column:1/-1}
    .history-editor-field input,.history-editor-field textarea,.history-set-edit select,.history-set-edit input,.tonnage-config select,.tonnage-config input{width:100%;border:1px solid #dfe4ea;border-radius:9px;background:#fff;color:#17283e;padding:9px 10px;margin-top:5px;font:inherit;outline:none}
    .history-edit-exercise{background:#fff;border:1px solid var(--line);border-radius:13px;margin:10px 0;overflow:hidden}
    .history-edit-exercise-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:12px}
    .history-edit-exercise-head strong{display:block;font-size:13px}.history-edit-exercise-head small{display:block;color:var(--muted);font-size:9px;margin-top:3px}
    .history-remove-exercise{border:0;background:#fff1f1;color:#a84242;border-radius:8px;padding:7px 9px;font-size:9px;font-weight:850}
    .history-set-edit{display:grid;grid-template-columns:58px minmax(62px,1fr) minmax(62px,1fr) 42px;gap:6px;align-items:center;padding:7px 10px;border-top:1px solid var(--line2)}
    .history-set-edit select,.history-set-edit input{height:36px;margin:0;padding:0 6px;text-align:center;font-size:11px}
    .history-set-delete{width:36px;height:36px;border:0;border-radius:8px;background:#fff1f1;color:#af4141;font-weight:900}
    .history-add-set{margin:9px 10px 11px;height:36px;border:1px dashed #a9bed2;background:#f8fbfe;color:#39698f;border-radius:9px;font-size:10px;font-weight:850}
    .history-editor-actions{position:sticky;bottom:calc(var(--nav) + var(--safe-bottom) + 5px);z-index:20;display:grid;grid-template-columns:1fr 1.4fr;gap:8px;padding:9px;background:rgba(246,247,249,.94);backdrop-filter:blur(12px);border-radius:13px}
    .history-editor-actions button{height:45px;border-radius:10px;font-size:11px;font-weight:900}
    .history-edit-cancel{border:1px solid var(--line);background:#fff;color:#59616d}.history-edit-save{border:0;background:#17283e;color:#fff}
    .tonnage-config{border-top:1px solid #e8eef4;margin-top:10px;padding-top:10px}
    .tonnage-config summary{cursor:pointer;font-size:10px;font-weight:900;color:#3d6384}
    .tonnage-config-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}
    .tonnage-check{display:flex;gap:8px;align-items:center;padding:9px;border:1px solid #e1e7ed;border-radius:9px;font-size:10px;font-weight:750}
    .tonnage-check input{width:18px;height:18px;margin:0}
    .load-hint{display:block;color:#597289;font-size:9px;margin-top:4px}
    @media(max-width:430px){.history-set-edit{grid-template-columns:52px 1fr 1fr 38px}.history-session-actions{grid-template-columns:1fr}}
  `;
  document.head.appendChild(css);

  window.loadFactorFromPayload=function(p){
    p=safeJson(p);
    const loadType=p.loadType||p.load_type;
    const explicit=!!loadType || p.unilateral!=null || p.repsPerSide!=null || p.reps_per_side!=null;
    if(!explicit) return Math.max(1,n(p.loadCount,1))*Math.max(1,n(p.sides,1));
    const loadCount=(loadType==='per_hand'||loadType==='per_implement') ? Math.max(1,n(p.loadCount,2)) : Math.max(1,n(p.loadCount,1));
    const unilateral=p.unilateral===true||p.unilateral==='true';
    const repsPerSide=p.repsPerSide===true||p.reps_per_side===true||p.repsPerSide==='true'||p.reps_per_side==='true';
    const sideCount=unilateral&&repsPerSide?Math.max(1,n(p.sides,2)):1;
    return loadCount*sideCount;
  };

  const baseRenderExerciseCard=window.renderExerciseCard;
  if(typeof baseRenderExerciseCard==='function'){
    window.renderExerciseCard=function(ex,isNext,nextSetId){
      let html=baseRenderExerciseCard(ex,isNext,nextSetId);
      const p=safeJson(ex.payload);
      const perHand=(p.loadType||p.load_type)==='per_hand';
      const perSide=(p.unilateral===true||p.unilateral==='true')&&(p.repsPerSide===true||p.reps_per_side===true||p.repsPerSide==='true'||p.reps_per_side==='true');
      if(perHand) html=html.replace(/(Východisková <b>[^<]+) kg(<\/b>)/,'$1 kg / ruka$2');
      if(perSide) html=html.replace(/(Cieľ <b>[^<]+)(<\/b>)/,'$1 / noha$2');
      return html;
    };
  }

  const baseRenderPlanExerciseEditor=window.renderPlanExerciseEditor;
  if(typeof baseRenderPlanExerciseEditor==='function'){
    window.renderPlanExerciseEditor=function(row,index,total){
      let html=baseRenderPlanExerciseEditor(row,index,total);
      const p=safeJson(row.payload);
      const loadType=p.loadType||p.load_type||(n(p.loadCount,1)>1?'per_hand':'total');
      const loadCount=Math.max(1,n(p.loadCount,loadType==='per_hand'?2:1));
      const unilateral=p.unilateral===true||p.unilateral==='true'||n(p.sides,1)>1;
      const repsPerSide=p.repsPerSide===true||p.reps_per_side===true||p.repsPerSide==='true'||p.reps_per_side==='true'||n(p.sides,1)>1;
      const sides=Math.max(1,n(p.sides,unilateral?2:1));
      const block=`<details class="tonnage-config"><summary>Výpočet tonáže</summary><span class="load-hint">Nastav, čo znamená jedno číslo KG a REPS pri tomto cviku.</span><div class="tonnage-config-grid">
        <div class="plan-field"><label>Typ záťaže<select data-tonnage-field="loadType"><option value="total" ${loadType==='total'?'selected':''}>Celková záťaž</option><option value="per_hand" ${loadType==='per_hand'?'selected':''}>Váha na ruku / kus</option></select></label></div>
        <div class="plan-field"><label>Počet závaží<input data-tonnage-field="loadCount" type="number" inputmode="numeric" min="1" max="4" value="${h(loadCount)}"></label></div>
        <label class="tonnage-check"><input data-tonnage-field="unilateral" type="checkbox" ${unilateral?'checked':''}>Unilaterálny cvik</label>
        <label class="tonnage-check"><input data-tonnage-field="repsPerSide" type="checkbox" ${repsPerSide?'checked':''}>REPS sú na každú stranu</label>
        <div class="plan-field"><label>Počet strán<input data-tonnage-field="sides" type="number" inputmode="numeric" min="1" max="2" value="${h(sides)}"></label></div>
      </div></details>`;
      return html.replace('<div class="plan-card-actions">',block+'<div class="plan-card-actions">');
    };
  }

  const baseSavePlanExerciseCard=window.savePlanExerciseCard;
  if(typeof baseSavePlanExerciseCard==='function'){
    window.savePlanExerciseCard=async function(card,showToast=false){
      const ok=await baseSavePlanExerciseCard(card,false);
      if(!ok)return false;
      const row=getPlanRowFromCard(card);if(!row)return false;
      const p={...safeJson(row.payload)},q=name=>card.querySelector(`[data-tonnage-field="${name}"]`);
      const type=q('loadType')?.value||p.loadType||p.load_type||'total';
      p.loadType=type;
      p.loadCount=Math.max(1,Math.round(n(q('loadCount')?.value,type==='per_hand'?2:1)));
      p.unilateral=!!q('unilateral')?.checked;
      p.repsPerSide=!!q('repsPerSide')?.checked;
      p.sides=p.unilateral&&p.repsPerSide?Math.max(1,Math.round(n(q('sides')?.value,2))):1;
      p.weightUnitLabel=type==='per_hand'?'kg / ruka':'kg';
      p.repUnitLabel=p.unilateral&&p.repsPerSide?'/ noha':'';
      const r=await supabase.from('trainer_hub_workout_exercises').update({payload:p}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',row.workout_id).eq('id',row.id);
      if(r.error){toast(`Nastavenie tonáže sa neuložilo: ${r.error.message}`,'error',4500);return false;}
      row.payload=p;if(showToast)toast('Cvik uložený.');return true;
    };
  }

  function parseDecimal(v,f=0){const x=Number(String(v??'').trim().replace(',','.'));return Number.isFinite(x)?x:f;}
  function setTypeOptions(type){return SET_TYPE_ORDER.map(x=>`<option value="${x}" ${x===(type||'working')?'selected':''}>${SET_TYPE_TITLE[x]||x}</option>`).join('');}
  function histExerciseName(ex){return typeof historyDisplayName==='function'?historyDisplayName(ex):exerciseName(safeJson(ex.payload),ex.exercise_key);}
  function histExerciseMeta(ex){
    const p=safeJson(ex.payload),parts=[];
    if((p.loadType||p.load_type)==='per_hand')parts.push('kg / ruka');
    if((p.unilateral===true||p.unilateral==='true')&&(p.repsPerSide===true||p.reps_per_side===true||p.repsPerSide==='true'||p.reps_per_side==='true'))parts.push('reps / noha');
    return parts.join(' · ');
  }

  function renderStrengthCompleted(s){
    const id=s.id,p=safeJson(s.payload),stats=sessionStats(id),exs=state.sessionExercises.filter(x=>x.session_id===id).sort((a,b)=>a.ordinal-b.ordinal),partial=isPartialSession(s)||String(p.source||'').includes('import');
    const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(s.recorded_date)}</span><h1>${h(p.title||'Tréning')}</h1>${partial?'<em>čiastočný záznam</em>':''}</div></div>
      <div class="stats-row"><div><span>Tonáž</span><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b></div><div><span>Série</span><b>${stats.workingSets}</b></div><div><span>Opakovania</span><b>${stats.reps}</b></div></div>
      <div class="history-session-actions"><button class="history-edit-session" id="history-edit-session">UPRAVIŤ TRÉNING</button><button class="history-delete-session" id="history-delete-session">ZMAZAŤ TRÉNING</button></div>
      <div class="session-card">${exs.map(ex=>renderSessionExercise(ex,id)).join('')}</div>`;
    app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();
    document.getElementById('history-edit-session').onclick=()=>renderHistoryEditor(id);
    document.getElementById('history-delete-session').onclick=()=>deleteCompletedSession(id);
    document.querySelectorAll('[data-exercise-key]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.exerciseKey)}`));
    if(typeof bindHistoryNameEditors==='function')bindHistoryNameEditors();
  }

  function renderHistoryEditor(id){
    const s=state.sessions.find(x=>x.id===id);if(!s)return updateUrl('#/history');
    const p=safeJson(s.payload),exs=state.sessionExercises.filter(x=>x.session_id===id).sort((a,b)=>a.ordinal-b.ordinal);
    const content=`<div class="detail-header"><button class="back-button" id="hist-edit-back">${icon('back')}</button><div><span>ÚPRAVA HISTÓRIE</span><h1>Upraviť tréning</h1></div></div>
      <div class="history-editor-card"><div class="history-editor-grid"><label class="history-editor-field"><span>Dátum</span><input id="hist-edit-date" type="date" value="${h(s.recorded_date)}"></label><label class="history-editor-field full"><span>Názov tréningu</span><input id="hist-edit-title" value="${h(p.title||'Tréning')}"></label></div></div>
      <div>${exs.map(ex=>renderHistoryExerciseEditor(ex,id)).join('')}</div>
      <div class="history-editor-actions"><button class="history-edit-cancel" id="hist-edit-cancel">ZRUŠIŤ</button><button class="history-edit-save" id="hist-edit-save">ULOŽIŤ ZMENY</button></div>`;
    app.innerHTML=shell(content,'history');bindNav();
    document.getElementById('hist-edit-back').onclick=()=>renderStrengthCompleted(s);document.getElementById('hist-edit-cancel').onclick=()=>renderStrengthCompleted(s);document.getElementById('hist-edit-save').onclick=()=>saveHistoryEditor(id);
    document.querySelectorAll('[data-hist-set-delete]').forEach(b=>b.onclick=()=>deleteHistorySet(id,b.dataset.histSetDelete));
    document.querySelectorAll('[data-hist-add-set]').forEach(b=>b.onclick=()=>addHistorySet(id,b.dataset.histAddSet));
    document.querySelectorAll('[data-hist-remove-ex]').forEach(b=>b.onclick=()=>removeHistoryExercise(id,b.dataset.histRemoveEx));
  }

  function renderHistoryExerciseEditor(ex,sessionId){
    const sets=state.sets.filter(s=>s.session_id===sessionId&&s.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal);
    return `<section class="history-edit-exercise"><div class="history-edit-exercise-head"><div><strong>${h(histExerciseName(ex))}</strong>${histExerciseMeta(ex)?`<small>${h(histExerciseMeta(ex))}</small>`:''}</div><button class="history-remove-exercise" type="button" data-hist-remove-ex="${h(ex.id)}">Odstrániť cvik</button></div>
      ${sets.map(set=>`<div class="history-set-edit" data-hist-set="${h(set.id)}"><select data-hist-set-field="set_type">${setTypeOptions(set.set_type)}</select><input data-hist-set-field="weight" type="text" inputmode="decimal" value="${h(fmtNumber(set.weight,2))}" aria-label="KG"><input data-hist-set-field="reps" type="number" inputmode="numeric" min="0" step="1" value="${h(n(set.reps,0))}" aria-label="REPS"><button class="history-set-delete" type="button" data-hist-set-delete="${h(set.id)}">×</button></div>`).join('')}
      <button class="history-add-set" type="button" data-hist-add-set="${h(ex.id)}">+ PRIDAŤ SÉRIU</button></section>`;
  }

  async function saveHistoryEditor(id){
    const s=state.sessions.find(x=>x.id===id);if(!s)return;
    const date=document.getElementById('hist-edit-date')?.value||s.recorded_date,title=document.getElementById('hist-edit-title')?.value.trim()||safeJson(s.payload).title||'Tréning';
    const payload={...safeJson(s.payload),title,editedAt:new Date().toISOString(),editedManually:true};
    const btn=document.getElementById('hist-edit-save');if(btn){btn.disabled=true;btn.textContent='UKLADÁM…';}
    let r=await supabase.from('trainer_hub_workout_sessions').update({recorded_date:date,payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',id);
    if(r.error){if(btn){btn.disabled=false;btn.textContent='ULOŽIŤ ZMENY';}return toast(`Tréning sa neuložil: ${r.error.message}`,'error',5000);}
    for(const el of document.querySelectorAll('[data-hist-set]')){
      const set=state.sets.find(x=>x.session_id===id&&x.id===el.dataset.histSet);if(!set)continue;
      const weight=parseDecimal(el.querySelector('[data-hist-set-field="weight"]')?.value,n(set.weight,0)),reps=Math.max(0,Math.round(n(el.querySelector('[data-hist-set-field="reps"]')?.value,n(set.reps,0)))),setType=el.querySelector('[data-hist-set-field="set_type"]')?.value||set.set_type||'working';
      r=await supabase.from('trainer_hub_workout_sets').update({weight,reps,set_type:setType,complete:true,updated_at:new Date().toISOString()}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',id).eq('exercise_id',set.exercise_id).eq('id',set.id);
      if(r.error){if(btn){btn.disabled=false;btn.textContent='ULOŽIŤ ZMENY';}return toast(`Séria sa neuložila: ${r.error.message}`,'error',5000);}
      Object.assign(set,{weight,reps,set_type:setType,complete:true});
    }
    s.recorded_date=date;s.payload=payload;toast('Dokončený tréning bol upravený.');renderStrengthCompleted(s);
  }

  async function addHistorySet(sessionId,exerciseId){
    const ex=state.sessionExercises.find(x=>x.session_id===sessionId&&x.id===exerciseId);if(!ex)return;
    const rows=state.sets.filter(x=>x.session_id===sessionId&&x.exercise_id===exerciseId).sort((a,b)=>a.ordinal-b.ordinal),last=rows.at(-1),ep=safeJson(ex.payload);
    const row={owner_id:state.user.id,client_id:CLIENT_ID,session_id:sessionId,exercise_id:exerciseId,id:`set-edit-${Date.now()}-${crypto.randomUUID().slice(0,6)}`,ordinal:rows.length+1,weight:n(last?.weight,n(ep.weight,0)),reps:n(last?.reps,n(ep.repMin,8)),rir:null,complete:true,set_type:'working',completed_at:new Date().toISOString()};
    const r=await supabase.from('trainer_hub_workout_sets').insert(row);if(r.error)return toast(`Sériu sa nepodarilo pridať: ${r.error.message}`,'error',4500);
    state.sets.push(row);renderHistoryEditor(sessionId);
  }

  async function deleteHistorySet(sessionId,setId){
    const set=state.sets.find(x=>x.session_id===sessionId&&x.id===setId);if(!set)return;
    const r=await supabase.from('trainer_hub_workout_sets').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',sessionId).eq('exercise_id',set.exercise_id).eq('id',setId);
    if(r.error)return toast(`Sériu sa nepodarilo zmazať: ${r.error.message}`,'error',4500);
    state.sets=state.sets.filter(x=>x.id!==setId);renderHistoryEditor(sessionId);
  }

  async function removeHistoryExercise(sessionId,exerciseId){
    const ex=state.sessionExercises.find(x=>x.session_id===sessionId&&x.id===exerciseId);if(!ex)return;
    if(!confirm(`Odstrániť „${histExerciseName(ex)}“ iba z tohto historického tréningu?`))return;
    let r=await supabase.from('trainer_hub_workout_sets').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',sessionId).eq('exercise_id',exerciseId);
    if(r.error)return toast(`Série sa nepodarilo zmazať: ${r.error.message}`,'error',4500);
    r=await supabase.from('trainer_hub_session_exercises').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',sessionId).eq('id',exerciseId);
    if(r.error)return toast(`Cvik sa nepodarilo zmazať: ${r.error.message}`,'error',4500);
    state.sets=state.sets.filter(x=>!(x.session_id===sessionId&&x.exercise_id===exerciseId));state.sessionExercises=state.sessionExercises.filter(x=>!(x.session_id===sessionId&&x.id===exerciseId));renderHistoryEditor(sessionId);
  }

  async function deleteCompletedSession(id){
    const s=state.sessions.find(x=>x.id===id);if(!s)return;const p=safeJson(s.payload);
    if(!confirm(`Naozaj zmazať dokončený tréning „${p.title||'Tréning'}“ z ${isoDate(s.recorded_date)}?\n\nZmaže sa iba tento historický záznam.`))return;
    let r=await supabase.from('trainer_hub_workout_sets').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',id);if(r.error)return toast(`Série sa nepodarilo zmazať: ${r.error.message}`,'error',5000);
    r=await supabase.from('trainer_hub_session_exercises').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',id);if(r.error)return toast(`Cviky sa nepodarilo zmazať: ${r.error.message}`,'error',5000);
    r=await supabase.from('trainer_hub_workout_sessions').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',id);if(r.error)return toast(`Tréning sa nepodarilo zmazať: ${r.error.message}`,'error',5000);
    state.sets=state.sets.filter(x=>x.session_id!==id);state.sessionExercises=state.sessionExercises.filter(x=>x.session_id!==id);state.sessions=state.sessions.filter(x=>x.id!==id);toast('Tréning bol zmazaný.');updateUrl('#/history');
  }


  function renderRoutineCompleted(s){
    const p=safeJson(s.payload);
    const completed=Object.values(safeJson(p.checklist)).filter(Boolean).length,total=Object.keys(safeJson(p.checklist)).length;
    const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(s.recorded_date)}</span><h1>${h(p.title||p.type||'Aktivita')}</h1></div></div>
      <div class="stats-row"><div><span>Typ</span><b>${h(p.type||'Aktivita')}</b></div><div><span>Trvanie</span><b>${p.durationMinutes?`${fmtNumber(p.durationMinutes,0)} min`:'—'}</b></div><div><span>Checklist</span><b>${total?`${completed}/${total}`:'—'}</b></div></div>
      ${p.note?`<div class="info-note">${h(p.note)}</div>`:''}
      <div class="history-session-actions"><button class="history-edit-session" id="routine-history-edit">UPRAVIŤ AKTIVITU</button><button class="history-delete-session" id="routine-history-delete">ZMAZAŤ AKTIVITU</button></div>`;
    app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();
    document.getElementById('routine-history-edit').onclick=()=>renderRoutineHistoryEditor(s.id);
    document.getElementById('routine-history-delete').onclick=()=>deleteCompletedSession(s.id);
  }

  function renderRoutineHistoryEditor(id){
    const s=state.sessions.find(x=>x.id===id);if(!s)return;
    const p=safeJson(s.payload);
    const content=`<div class="detail-header"><button class="back-button" id="routine-edit-back">${icon('back')}</button><div><span>ÚPRAVA HISTÓRIE</span><h1>Upraviť aktivitu</h1></div></div>
      <div class="history-editor-card"><div class="history-editor-grid">
        <label class="history-editor-field"><span>Dátum</span><input id="routine-hist-date" type="date" value="${h(s.recorded_date)}"></label>
        <label class="history-editor-field"><span>Trvanie (min)</span><input id="routine-hist-duration" type="number" inputmode="numeric" min="0" value="${h(p.durationMinutes||'')}"></label>
        <label class="history-editor-field full"><span>Názov</span><input id="routine-hist-title" value="${h(p.title||p.type||'Aktivita')}"></label>
        <label class="history-editor-field full"><span>Poznámka</span><textarea id="routine-hist-note" rows="4">${h(p.note||'')}</textarea></label>
      </div></div>
      <div class="history-editor-actions"><button class="history-edit-cancel" id="routine-hist-cancel">ZRUŠIŤ</button><button class="history-edit-save" id="routine-hist-save">ULOŽIŤ ZMENY</button></div>`;
    app.innerHTML=shell(content,'history');bindNav();
    document.getElementById('routine-edit-back').onclick=()=>renderRoutineCompleted(s);
    document.getElementById('routine-hist-cancel').onclick=()=>renderRoutineCompleted(s);
    document.getElementById('routine-hist-save').onclick=async()=>{
      const date=document.getElementById('routine-hist-date').value||s.recorded_date;
      const next={...p,
        title:document.getElementById('routine-hist-title').value.trim()||p.title||p.type||'Aktivita',
        durationMinutes:Math.max(0,Math.round(n(document.getElementById('routine-hist-duration').value,p.durationMinutes||0))),
        note:document.getElementById('routine-hist-note').value.trim(),
        editedAt:new Date().toISOString(),editedManually:true
      };
      const r=await supabase.from('trainer_hub_workout_sessions').update({recorded_date:date,payload:next}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('id',id);
      if(r.error)return toast(`Aktivita sa neuložila: ${r.error.message}`,'error',5000);
      s.recorded_date=date;s.payload=next;toast('Aktivita bola upravená.');renderRoutineCompleted(s);
    };
  }

  const baseRenderSessionDetail=window.renderSessionDetail;
  window.renderSessionDetail=function(id){
    if(String(id).startsWith('legacy:'))return baseRenderSessionDetail(id);
    const s=state.sessions.find(x=>x.id===id);if(!s)return updateUrl('#/history');
    if(s.status!=='completed')return baseRenderSessionDetail(id);
    const p=safeJson(s.payload);
    if(p.sessionType==='routine')return renderRoutineCompleted(s);
    return renderStrengthCompleted(s);
  };
})();
