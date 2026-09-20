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
