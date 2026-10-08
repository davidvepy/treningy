// Read-only workout previews. Creating a session always requires an explicit start.
function renderWorkoutPreview(workoutId){
  const w=state.workouts.find(x=>x.id===workoutId);
  if(!w)return updateUrl('#/training');
  const p=safeJson(w.payload),strength=p.type==='Silový tréning',rows=templateExercises(w);
  const routines=Array.isArray(p.after)?p.after:[];
  app.innerHTML=shell(`<div class="preview-page"><header class="detail-header"><button class="back-button" id="preview-back" aria-label="Späť na tréningy">${icon('back')}</button><div><span>NÁHĽAD · ${h(p.type||'Tréning')}</span><h1>${h(p.title||'Tréning')}</h1><em>${h(workoutDaysLabel(p))}</em></div></header><p class="preview-hint">Pozri si plán. Tréning začne až po stlačení tlačidla dole.</p><div class="preview-summary"><b>${strength?`${rows.length} cvikov`:`${routines.length} bodov`}</b><span>${h(p.durationRange||(p.duration?`${p.duration} min`:''))}</span></div>${p.objective?`<p>${h(p.objective)}</p>`:''}${p.instructions?`<details class="preview-panel"><summary>Pokyny</summary><p>${h(p.instructions)}</p></details>`:''}${Array.isArray(p.ramp)&&p.ramp.length?`<details class="preview-panel"><summary>Rozcvička</summary>${p.ramp.map(g=>`<h3>${h(g.name||g.code)}</h3>${(g.items||[]).map(x=>`<p>${h(x.name)} <span>${h(x.dose)}</span></p>`).join('')}`).join('')}</details>`:''}<div class="preview-exercises">${strength?rows.map((row,i)=>{const ep=safeJson(row.payload),previous=previousEntryForKey(row.exercise_key);return `<details class="preview-panel"><summary><span class="preview-index">${i+1}</span><div><b>${h(exerciseName(ep,row.exercise_key))}</b><small>${h(ep.sets||3)} série · ${h(ep.repMin||8)}–${h(ep.repMax||ep.repMin||8)} opak. · ${h(fmtNumber(suggestWorkoutWeight(ep,row.exercise_key)))} kg</small></div></summary><p>Pauza ${h(restSecondsFor(ep))} s${ep.rirMin!=null?` · RIR ${h(ep.rirMin)}–${h(ep.rirMax??ep.rirMin)}`:''}</p>${previous?`<p>Naposledy: ${h(previous.sets.map(s=>`${fmtNumber(s.weight)} × ${fmtNumber(s.reps,0)}`).join(' · '))}</p>`:''}${ep.note?`<p>${h(ep.note)}</p>`:''}${ep.alternative?`<p>Alternatíva: ${h(ep.alternative)}</p>`:''}</details>`;}).join(''):routines.map((x,i)=>`<details class="preview-panel"><summary><span class="preview-index">${i+1}</span><div><b>${h(x.name)}</b><small>${h(x.dose||'')}</small></div></summary>${Array.isArray(x.how)?x.how.map(t=>`<p>${h(t)}</p>`).join(''):''}${x.why?`<p>${h(x.why)}</p>`:''}</details>`).join('')}</div><div class="preview-tools"><button id="preview-edit">Upraviť plán</button><button id="preview-copy">Vytvoriť kópiu</button></div><div class="preview-start"><button class="btn-primary" id="preview-start">${state.activeSession?'Pokračovať v rozpracovanom tréningu':strength?'Začať tento tréning':'Otvoriť zapisovanie'}</button></div></div>`,'training');
  bindNav();document.getElementById('preview-back').onclick=()=>updateUrl('#/training');
  document.getElementById('preview-edit').onclick=()=>openWorkoutUnitEditor(w.id);
  document.getElementById('preview-copy').onclick=()=>duplicateWorkoutUnit(w);
  document.getElementById('preview-start').onclick=async e=>{
    if(state.activeSession)return updateUrl('#/active');
    if(!strength)return updateUrl(`#/routine/${encodeURIComponent(w.id)}`);
    const b=e.currentTarget;b.disabled=true;b.textContent='Spúšťam…';
    try{await startWorkout(strengthLabelForWorkout(w),w);}catch(err){toast(err.message||'Tréning sa nepodarilo spustiť.','error');}
    finally{if(b.isConnected){b.disabled=false;b.textContent='Začať tento tréning';}}
  };
}

function bulkPlanControls(){return `<details class="preview-panel bulk-plan"><summary>Hromadná úprava cvikov</summary><label>Parameter<select id="bulk-field"><option value="restSeconds">Pauza (s)</option><option value="sets">Počet sérií</option><option value="weight">Váha (kg)</option><option value="repMin">Opakovania od</option><option value="repMax">Opakovania do</option></select></label><label>Nová hodnota<input id="bulk-value" type="number" inputmode="decimal" min="0" step="0.25"></label><p>Zmení polia všetkých cvikov v tejto jednotke. Do databázy sa uložia tlačidlom Uložiť celú jednotku.</p><div class="preview-tools"><button id="bulk-apply">Vyplniť polia</button><button id="bulk-undo" disabled>Vrátiť vyplnenie</button></div></details>`;}
function bindBulkPlanControls(){
  let before=[];
  document.getElementById('bulk-apply').onclick=()=>{
    const field=document.getElementById('bulk-field').value,raw=document.getElementById('bulk-value').value,value=Number(raw);
    if(!raw||!Number.isFinite(value)||value<0||(['sets','repMin','repMax'].includes(field)&&(!Number.isInteger(value)||value<1)))return toast('Zadaj platnú hodnotu.','error');
    const inputs=[...document.querySelectorAll(`[data-plan-field="${field}"]`)];
    before=inputs.map(input=>({input,value:input.value}));inputs.forEach(input=>{input.value=value;});document.getElementById('bulk-undo').disabled=false;toast('Polia vyplnené. Skontroluj ich a ulož jednotku.');
  };
  document.getElementById('bulk-undo').onclick=e=>{before.forEach(x=>{if(x.input.isConnected)x.input.value=x.value;});before=[];e.currentTarget.disabled=true;};
}

async function duplicateWorkoutUnit(w){
  const button=document.getElementById('preview-copy');if(button.disabled)return;button.disabled=true;
  const id=`workout-${crypto.randomUUID()}`,payload=JSON.parse(JSON.stringify(safeJson(w.payload)));
  payload.id=id;payload.title=`${payload.title||'Tréning'} · kópia`;payload.day=null;payload.days=[];
  const row={owner_id:state.user.id,client_id:CLIENT_ID,plan_id:state.plan.id,id,ordinal:Math.max(0,...state.workouts.map(x=>n(x.ordinal,0)))+1,payload};
  const children=templateExercises(w).map(x=>({...x,id:`exercise-${crypto.randomUUID()}`,workout_id:id}));
  try{
    let r=await supabase.from('trainer_hub_workouts').insert(row);if(r.error)throw new Error(r.error.message);
    if(children.length){r=await supabase.from('trainer_hub_workout_exercises').insert(children);if(r.error){const cleanup=await supabase.from('trainer_hub_workouts').delete().eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('id',id);throw new Error(cleanup.error?'Kópia zostala bez cvikov. Obnov aplikáciu a skontroluj ju.':r.error.message);}}
    state.workouts.push(row);state.planExercises.push(...children);toast('Kópia vytvorená bez priradeného dňa.');updateUrl(`#/preview/${encodeURIComponent(id)}`);
  }catch(err){toast(`Kópia sa nepodarila: ${err.message}`,'error',5000);}finally{if(button.isConnected)button.disabled=false;}
}

let exerciseLibraryCache=null;
async function showExerciseLibrary(w){
  showAddExerciseFormV39(w);const card=document.getElementById('plan-new-card');if(!card)return;
  if(card.querySelector('#library-search'))return;
  const box=document.createElement('div');box.className='exercise-library-search';box.innerHTML='<label>Vybrať z knižnice<input id="library-search" type="search" placeholder="Napr. dumbbell, squat…" autocomplete="off"></label><div id="library-results" role="status">Načítavam knižnicu…</div>';card.prepend(box);
  try{
    if(!exerciseLibraryCache){const r=await supabase.from('trainer_hub_exercises').select('id,payload').order('id').limit(1000);if(r.error)throw new Error(r.error.message);exerciseLibraryCache=r.data||[];}
    const input=box.querySelector('input'),results=box.querySelector('#library-results');
    function search(){const q=input.value.trim().toLowerCase();const matches=q?exerciseLibraryCache.filter(x=>`${x.id} ${safeJson(x.payload).name} ${safeJson(x.payload).equipment}`.toLowerCase().includes(q)).slice(0,12):[];results.innerHTML=q?(matches.length?matches.map(x=>`<button type="button" data-library-id="${h(x.id)}"><b>${h(safeJson(x.payload).name||x.id)}</b><small>${h(safeJson(x.payload).equipment||'')}</small></button>`).join(''):'Žiadny výsledok. Názov môžeš zadať ručne.'):'Vyhľadaj cvik alebo vyplň názov ručne.';results.querySelectorAll('button').forEach(b=>b.onclick=()=>{const item=exerciseLibraryCache.find(x=>x.id===b.dataset.libraryId),p=safeJson(item.payload);document.getElementById('plan-new-name').value=p.name||item.id;document.getElementById('plan-new-english').value=p.name||item.id;input.value=p.name||item.id;results.innerHTML='Názov doplnený. Nastav váhu, série a opakovania.';});}
    input.oninput=search;search();input.focus();
  }catch(err){box.querySelector('#library-results').textContent='Knižnica sa nenačítala. Cvik môžeš vyplniť ručne.';}
}
