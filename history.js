function historyEntries(){
  const normalized=state.sessions.filter(s=>s.status==='completed');
  const normalizedDates=new Set(normalized.map(s=>s.recorded_date));
  const legacy=Object.entries(legacyGroups()).filter(([date])=>!normalizedDates.has(date)).map(([date,rows])=>({legacy:true,id:`legacy:${date}`,recorded_date:date,rows,payload:{title:'Tréning · historický záznam'}}));
  return [...normalized,...legacy].sort((a,b)=>String(b.recorded_date).localeCompare(String(a.recorded_date)));
}
function renderHistory(){
  const entries=historyEntries();
  const content=`<header class="page-title"><h1>História</h1></header><div class="history-list">${entries.length?entries.map(renderHistoryItem).join(''):'<div class="empty-card">Zatiaľ tu nie je žiadny dokončený tréning.</div>'}</div>`;
  app.innerHTML=shell(content,'history');bindNav();document.querySelectorAll('[data-session]').forEach(b=>b.onclick=()=>updateUrl(`#/session/${encodeURIComponent(b.dataset.session)}`));
}
function renderHistoryItem(s){
  const d=shortDate(s.recorded_date),p=safeJson(s.payload),stats=s.legacy?legacyDayStats(s.rows||[]):sessionStats(s.id),partial=s.legacy||isPartialSession(s)||String(p.source||'').includes('import');
  return `<button class="history-item" data-session="${h(s.id)}"><div class="history-date"><b>${d.day}</b><span>${h(d.month)}</span></div><div class="history-main"><strong>${h(p.title||'Silový tréning')}</strong><span>${stats.workingSets?`${stats.workingSets} sérií`:''}${partial?' · čiastočný/historický záznam':''}</span></div><div class="history-tonnage"><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b><span>tonáž</span></div></button>`;
}
function renderSessionDetail(id){
  if(id.startsWith('legacy:'))return renderLegacySession(id.slice(7));
  const s=state.sessions.find(x=>x.id===id);if(!s)return updateUrl('#/history');
  const p=safeJson(s.payload),stats=sessionStats(id),exs=state.sessionExercises.filter(x=>x.session_id===id).sort((a,b)=>a.ordinal-b.ordinal),partial=isPartialSession(s)||String(p.source||'').includes('import');
  const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(s.recorded_date)}</span><h1>${h(p.title||'Tréning')}</h1>${partial?'<em>čiastočný záznam</em>':''}</div></div>
    <div class="stats-row"><div><span>Tonáž</span><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b></div><div><span>Série</span><b>${stats.workingSets}</b></div><div><span>Opakovania</span><b>${stats.reps}</b></div></div>
    <div class="session-card">${exs.map(ex=>renderSessionExercise(ex,id)).join('')}</div>`;
  app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();document.querySelectorAll('[data-exercise-key]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.exerciseKey)}`));
}
function renderSessionExercise(ex,sessionId){
  const p=safeJson(ex.payload),sets=state.sets.filter(s=>s.session_id===sessionId&&s.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal);
  return `<div class="session-exercise"><button data-exercise-key="${h(ex.exercise_key)}"><strong>${h(exerciseName(p,ex.exercise_key))}</strong>${exerciseSkName(p)&&exerciseSkName(p)!==exerciseName(p,ex.exercise_key)?`<span>${h(exerciseSkName(p))}</span>`:''}</button><div class="set-pills">${sets.map(s=>{const label=`${SET_TYPE_LABEL[s.set_type||'working']||'S'}${s.ordinal}`;return `<span class="${(s.set_type||'working')==='warmup'?'warmup':''}">${h(label)} · ${fmtNumber(s.weight)} × ${fmtNumber(s.reps,0)}${s.complete?'':' · nedokončené'}</span>`}).join('')}</div></div>`;
}
function renderLegacySession(date){
  const rows=(legacyGroups()[date]||[]).filter(r=>validExerciseName(r.exercise_name)),stats=legacyDayStats(rows);
  const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(date)}</span><h1>Historický tréning</h1><em>čiastočný záznam</em></div></div>
    <div class="stats-row"><div><span>Tonáž</span><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b></div><div><span>Série</span><b>${stats.workingSets}</b></div><div><span>Opakovania</span><b>${stats.reps}</b></div></div>
    <div class="session-card">${rows.map(r=>`<div class="session-exercise"><button data-legacy-id="${h(r.exercise_id)}"><strong>${h(r.exercise_name)}</strong></button><div class="set-pills">${(r.reps||[]).map((rep,i)=>`<span>S${i+1} · ${r.weight_kg!=null?`${fmtNumber(r.weight_kg)} × `:''}${fmtNumber(rep,0)}</span>`).join('')||`<span>${h(r.raw_entry||'Historický údaj')}</span>`}</div></div>`).join('')}</div>`;
  app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();document.querySelectorAll('[data-legacy-id]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent('legacy:'+b.dataset.legacyId)}`));
}

/* ===== v3.3 routine history overrides ===== */
function renderHistoryItem(s){
  const d=shortDate(s.recorded_date),p=safeJson(s.payload);
  if(!s.legacy&&p.sessionType==='routine')return `<button class="history-item routine-history" data-session="${h(s.id)}"><div class="history-date"><b>${d.day}</b><span>${h(d.month)}</span></div><div class="history-main"><strong>${h(p.title||p.type||'Aktivita')}</strong><span>${h(p.type||'Kondícia / mobilita')}${p.durationMinutes?` · ${fmtNumber(p.durationMinutes,0)} min`:''}</span></div><div class="history-tonnage"><b>✓</b><span>hotovo</span></div></button>`;
  const stats=s.legacy?legacyDayStats(s.rows||[]):sessionStats(s.id),partial=s.legacy||isPartialSession(s)||String(p.source||'').includes('import');
  return `<button class="history-item" data-session="${h(s.id)}"><div class="history-date"><b>${d.day}</b><span>${h(d.month)}</span></div><div class="history-main"><strong>${h(p.title||'Silový tréning')}</strong><span>${stats.workingSets?`${stats.workingSets} sérií`:''}${partial?' · čiastočný/historický záznam':''}</span></div><div class="history-tonnage"><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b><span>tonáž</span></div></button>`;
}
function renderSessionDetail(id){
  if(id.startsWith('legacy:'))return renderLegacySession(id.slice(7));
  const s=state.sessions.find(x=>x.id===id);if(!s)return updateUrl('#/history');
  const p=safeJson(s.payload);
  if(p.sessionType==='routine'){
    const completed=Object.values(safeJson(p.checklist)).filter(Boolean).length,total=Object.keys(safeJson(p.checklist)).length;
    const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(s.recorded_date)}</span><h1>${h(p.title||p.type||'Aktivita')}</h1></div></div><div class="stats-row"><div><span>Typ</span><b>${h(p.type||'Aktivita')}</b></div><div><span>Trvanie</span><b>${p.durationMinutes?`${fmtNumber(p.durationMinutes,0)} min`:'—'}</b></div><div><span>Checklist</span><b>${total?`${completed}/${total}`:'—'}</b></div></div>${p.note?`<div class="info-note">${h(p.note)}</div>`:''}`;
    app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();return;
  }
  const stats=sessionStats(id),exs=state.sessionExercises.filter(x=>x.session_id===id).sort((a,b)=>a.ordinal-b.ordinal),partial=isPartialSession(s)||String(p.source||'').includes('import');
  const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(s.recorded_date)}</span><h1>${h(p.title||'Tréning')}</h1>${partial?'<em>čiastočný záznam</em>':''}</div></div><div class="stats-row"><div><span>Tonáž</span><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b></div><div><span>Série</span><b>${stats.workingSets}</b></div><div><span>Opakovania</span><b>${stats.reps}</b></div></div><div class="session-card">${exs.map(ex=>renderSessionExercise(ex,id)).join('')}</div>`;
  app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();document.querySelectorAll('[data-exercise-key]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.exerciseKey)}`));
}


/* ===== v3.4 history exercise name editing ===== */
function historyDisplayName(ex){
  const p=safeJson(ex?.payload);
  return p.historyDisplayName||exerciseName(p,ex?.exercise_key||'');
}
function renderSessionExercise(ex,sessionId){
  const p=safeJson(ex.payload),sets=state.sets.filter(s=>s.session_id===sessionId&&s.exercise_id===ex.id).sort((a,b)=>a.ordinal-b.ordinal),display=historyDisplayName(ex),editorKey=`norm:${sessionId}:${ex.id}`;
  return `<div class="session-exercise"><div class="history-exercise-head"><button class="history-exercise-link" data-exercise-key="${h(ex.exercise_key)}"><strong>${h(display)}</strong>${!p.historyDisplayName&&exerciseSkName(p)&&exerciseSkName(p)!==exerciseName(p,ex.exercise_key)?`<span>${h(exerciseSkName(p))}</span>`:''}</button><button class="history-edit-btn" type="button" data-history-edit-normalized data-session-id="${h(sessionId)}" data-ex-id="${h(ex.id)}">Upraviť</button></div><div class="history-name-editor" data-history-editor="${h(editorKey)}"><input class="history-name-input" value="${h(display)}" maxlength="100"><button class="history-name-save" type="button" data-history-save-normalized data-session-id="${h(sessionId)}" data-ex-id="${h(ex.id)}">Uložiť</button><button class="history-name-cancel" type="button" data-history-cancel>Zrušiť</button></div><div class="set-pills">${sets.map(s=>{const label=`${SET_TYPE_LABEL[s.set_type||'working']||'S'}${s.ordinal}`;return `<span class="${(s.set_type||'working')==='warmup'?'warmup':''}">${h(label)} · ${fmtNumber(s.weight)} × ${fmtNumber(s.reps,0)}${s.complete?'':' · nedokončené'}</span>`}).join('')}</div></div>`;
}
function renderLegacySession(date){
  const rows=(legacyGroups()[date]||[]).filter(r=>validExerciseName(r.exercise_name)),stats=legacyDayStats(rows);
  const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(date)}</span><h1>Historický tréning</h1><em>čiastočný záznam</em></div></div><div class="stats-row"><div><span>Tonáž</span><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b></div><div><span>Série</span><b>${stats.workingSets}</b></div><div><span>Opakovania</span><b>${stats.reps}</b></div></div><div class="session-card">${rows.map(r=>{const editorKey=`legacy:${r.id}`;return `<div class="session-exercise"><div class="history-exercise-head"><button class="history-exercise-link" data-legacy-id="${h(r.exercise_id)}"><strong>${h(r.exercise_name)}</strong></button><button class="history-edit-btn" type="button" data-history-edit-legacy="${h(r.id)}">Upraviť</button></div><div class="history-name-editor" data-history-editor="${h(editorKey)}"><input class="history-name-input" value="${h(r.exercise_name)}" maxlength="100"><button class="history-name-save" type="button" data-history-save-legacy="${h(r.id)}">Uložiť</button><button class="history-name-cancel" type="button" data-history-cancel>Zrušiť</button></div><div class="set-pills">${(r.reps||[]).map((rep,i)=>`<span>S${i+1} · ${r.weight_kg!=null?`${fmtNumber(r.weight_kg)} × `:''}${fmtNumber(rep,0)}</span>`).join('')||`<span>${h(r.raw_entry||'Historický údaj')}</span>`}</div></div>`}).join('')}</div>`;
  app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();document.querySelectorAll('[data-legacy-id]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent('legacy:'+b.dataset.legacyId)}`));bindHistoryNameEditors();
}
function bindHistoryNameEditors(){
  document.querySelectorAll('[data-history-edit-normalized]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openHistoryNameEditor(`norm:${b.dataset.sessionId}:${b.dataset.exId}`);});
  document.querySelectorAll('[data-history-edit-legacy]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();openHistoryNameEditor(`legacy:${b.dataset.historyEditLegacy}`);});
  document.querySelectorAll('[data-history-cancel]').forEach(b=>b.onclick=e=>{e.preventDefault();b.closest('.history-name-editor')?.classList.remove('open');});
  document.querySelectorAll('[data-history-save-normalized]').forEach(b=>b.onclick=()=>saveNormalizedHistoryName(b.dataset.sessionId,b.dataset.exId,b.closest('.history-name-editor')?.querySelector('input')?.value));
  document.querySelectorAll('[data-history-save-legacy]').forEach(b=>b.onclick=()=>saveLegacyHistoryName(b.dataset.historySaveLegacy,b.closest('.history-name-editor')?.querySelector('input')?.value));
  document.querySelectorAll('.history-name-input').forEach(i=>i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();i.nextElementSibling?.click();}if(e.key==='Escape')i.closest('.history-name-editor')?.classList.remove('open');});
}
function openHistoryNameEditor(key){
  document.querySelectorAll('.history-name-editor.open').forEach(x=>x.classList.remove('open'));
  const el=document.querySelector(`[data-history-editor="${CSS.escape(key)}"]`);if(!el)return;el.classList.add('open');const input=el.querySelector('input');input?.focus();input?.select();
}
async function saveNormalizedHistoryName(sessionId,exId,value){
  const name=String(value||'').trim();if(!name)return toast('Názov nemôže byť prázdny.','error');
  const ex=state.sessionExercises.find(x=>x.session_id===sessionId&&x.id===exId);if(!ex)return;
  const payload={...safeJson(ex.payload),historyDisplayName:name};
  const r=await supabase.from('trainer_hub_session_exercises').update({payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',sessionId).eq('id',exId);
  if(r.error)return toast('Názov sa nepodarilo uložiť.','error');ex.payload=payload;toast('Názov v histórii uložený.');renderSessionDetail(sessionId);
}
async function saveLegacyHistoryName(rowId,value){
  const name=String(value||'').trim();if(!name)return toast('Názov nemôže byť prázdny.','error');
  const row=state.legacyLogs.find(x=>String(x.id)===String(rowId));if(!row)return;
  const r=await supabase.from('workout_logs').update({exercise_name:name}).eq('user_id',state.user.id).eq('id',row.id);
  if(r.error)return toast('Názov sa nepodarilo uložiť.','error');row.exercise_name=name;toast('Názov v histórii uložený.');renderLegacySession(row.performed_on);
}
function renderSessionDetail(id){
  if(id.startsWith('legacy:'))return renderLegacySession(id.slice(7));
  const s=state.sessions.find(x=>x.id===id);if(!s)return updateUrl('#/history');
  const p=safeJson(s.payload);
  if(p.sessionType==='routine'){
    const completed=Object.values(safeJson(p.checklist)).filter(Boolean).length,total=Object.keys(safeJson(p.checklist)).length;
    const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(s.recorded_date)}</span><h1>${h(p.title||p.type||'Aktivita')}</h1></div></div><div class="stats-row"><div><span>Typ</span><b>${h(p.type||'Aktivita')}</b></div><div><span>Trvanie</span><b>${p.durationMinutes?`${fmtNumber(p.durationMinutes,0)} min`:'—'}</b></div><div><span>Checklist</span><b>${total?`${completed}/${total}`:'—'}</b></div></div>${p.note?`<div class="info-note">${h(p.note)}</div>`:''}`;
    app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();return;
  }
  const stats=sessionStats(id),exs=state.sessionExercises.filter(x=>x.session_id===id).sort((a,b)=>a.ordinal-b.ordinal),partial=isPartialSession(s)||String(p.source||'').includes('import');
  const content=`<div class="detail-header"><button class="back-button" id="back">${icon('back')}</button><div><span>${isoDate(s.recorded_date)}</span><h1>${h(p.title||'Tréning')}</h1>${partial?'<em>čiastočný záznam</em>':''}</div></div><div class="stats-row"><div><span>Tonáž</span><b>${stats.tonnage?`${fmtNumber(stats.tonnage/1000,2)} t`:'—'}</b></div><div><span>Série</span><b>${stats.workingSets}</b></div><div><span>Opakovania</span><b>${stats.reps}</b></div></div><div class="session-card">${exs.map(ex=>renderSessionExercise(ex,id)).join('')}</div>`;
  app.innerHTML=shell(content,'history');bindNav();document.getElementById('back').onclick=()=>history.back();document.querySelectorAll('[data-exercise-key]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.exerciseKey)}`));bindHistoryNameEditors();
}
