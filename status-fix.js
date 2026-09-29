/* v4.4 – weekly attendance status UX */
(function(){
  const style=document.createElement('style');
  style.textContent=`
    .week-workout-wrap{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
    .week-more{width:38px;height:38px;border:1px solid #d7e0e9;background:#fff;color:#71849a;border-radius:11px;font-size:18px;font-weight:900;line-height:1;padding:0}
    .week-status{display:inline-flex;align-items:center;justify-content:center;min-height:34px;max-width:96px;padding:7px 9px;border-radius:999px;font-size:9px;font-weight:900;line-height:1.15;text-align:center;white-space:normal}
    .week-status.done{background:#edf9f3;color:#168756;border:1px solid #ccebdc}
    .week-status.skipped{background:#fff3f3;color:#a83d3d;border:1px solid #ebcece}
  `;
  document.head.appendChild(style);

  function localIsoDate(d){
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function dateForWeekDay(day){
    const now=new Date();
    const current=now.getDay();
    const mondayOffset=current===0?-6:1-current;
    const monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()+mondayOffset,12,0,0,0);
    const target=new Date(monday);
    target.setDate(monday.getDate()+(day===0?6:day-1));
    return localIsoDate(target);
  }
  function attendanceFor(workoutId,date){
    return state.sessions
      .filter(s=>s.recorded_date===date&&safeJson(s.payload).workoutId===workoutId&&['completed','skipped'].includes(s.status))
      .sort((a,b)=>String(safeJson(b.payload).finishedAt||safeJson(b.payload).createdAt||'').localeCompare(String(safeJson(a.payload).finishedAt||safeJson(a.payload).createdAt||'')))[0]||null;
  }

  window.showMissedWorkoutDialog=function(w,defaultDate){
    if(!w)return;
    closeMissedWorkoutDialog();
    const p=safeJson(w.payload),overlay=document.createElement('div'),date=defaultDate||todayIso();
    overlay.className='missed-workout-overlay';overlay.id='missed-workout-overlay';
    overlay.innerHTML=`<div class="missed-workout-modal"><div class="missed-modal-head"><div><span>NEABSOLVOVANÉ</span><h3>${h(p.title||p.type||'Tréning')}</h3></div><button type="button" id="missed-close">×</button></div><label>Dátum<input id="missed-date" type="date" value="${h(date)}"></label><label>Dôvod<textarea id="missed-reason" maxlength="280" rows="4" placeholder="Napr. bolesť chrbta, choroba, zlá regenerácia…"></textarea></label><div class="missed-help">Záznam sa uloží do Histórie, ale nebude sa počítať do tonáže, PR ani progresu.</div><div class="missed-actions"><button type="button" class="missed-cancel" id="missed-cancel">Zrušiť</button><button type="button" class="missed-save" id="missed-save">ULOŽIŤ AKO NEABSOLVOVANÉ</button></div></div>`;
    document.body.appendChild(overlay);
    document.getElementById('missed-close').onclick=closeMissedWorkoutDialog;
    document.getElementById('missed-cancel').onclick=closeMissedWorkoutDialog;
    overlay.onclick=e=>{if(e.target===overlay)closeMissedWorkoutDialog();};
    document.getElementById('missed-save').onclick=()=>saveMissedWorkout(w);
    setTimeout(()=>document.getElementById('missed-reason')?.focus(),30);
  };

  window.renderWeekWorkout=function(w,scheduledDay){
    const p=safeJson(w.payload),type=p.type||'Tréning',date=dateForWeekDay(scheduledDay),attendance=attendanceFor(w.id,date);
    let right='';
    if(attendance?.status==='completed') right='<span class="week-status done">✓ Absolvoval</span>';
    else if(attendance?.status==='skipped') right='<span class="week-status skipped">Neabsolvoval</span>';
    else right=`<button class="week-more" type="button" data-week-more="${h(w.id)}" data-week-date="${h(date)}" aria-label="Možnosti tréningu">•••</button>`;
    return `<div class="week-workout-wrap"><button class="week-workout" data-week-workout="${h(w.id)}"><div><strong>${h(String(p.title||type).replace(/^(Pondelok|Utorok|Streda|Štvrtok|Piatok|Sobota|Nedeľa)\s*·\s*/i,''))}</strong><span>${h(p.durationRange||p.objective||p.instructions||type)}</span></div><em>${p.type==='Silový tréning'?'SILA':h(type)}</em><i>›</i></button>${right}</div>`;
  };

  window.renderTraining=function(){
    const active=state.activeSession,today=new Date().getDay(),next=nextPlannedWorkout(),units=sortedWorkoutUnits();
    const order=[1,2,3,4,5,6,0],labels={1:'PO',2:'UT',3:'ST',4:'ŠT',5:'PI',6:'SO',0:'NE'};
    const weekRows=order.map(day=>{
      const ws=units.filter(w=>workoutDays(w.payload).includes(day));
      return `<div class="week-row ${day===today?'today':''}"><div class="week-day"><b>${labels[day]}</b>${day===today?'<span>DNES</span>':''}</div><div class="week-items">${ws.length?ws.map(w=>renderWeekWorkout(w,day)).join(''):'<div class="week-empty">Bez naplánovanej jednotky</div>'}</div></div>`;
    }).join('');
    const content=`<header class="home-header"><h1>Tréning</h1></header><button class="start-workout" id="main-start">${active?'POKRAČOVAŤ V TRÉNINGU':'ZAČAŤ TRÉNING'}</button>${next&&!active?`<div class="today-line"><span>Najbližšie</span><b>${h(safeJson(next.w.payload).title||'')}</b></div>`:''}<div class="section-bar"><h2>TÝŽDENNÝ PLÁN</h2></div><div class="week-plan">${weekRows}</div><div class="section-bar"><h2>TRÉNINGOVÉ JEDNOTKY</h2></div><div class="unit-library">${units.map(renderUnitLibraryCard).join('')}</div>`;
    app.innerHTML=shell(content,'training');bindNav();

    document.getElementById('main-start').onclick=()=>{
      if(active)return updateUrl('#/active');
      const todays=units.filter(w=>workoutDays(w.payload).includes(today));
      if(todays.length===1)return launchWorkoutUnit(todays[0]);
      if(todays.length>1)return document.querySelector('.week-row.today')?.scrollIntoView({behavior:'smooth',block:'center'});
      document.querySelector('.unit-library')?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    document.querySelectorAll('[data-week-workout]').forEach(b=>b.onclick=()=>launchWorkoutUnit(state.workouts.find(x=>x.id===b.dataset.weekWorkout)));
    document.querySelectorAll('[data-week-more]').forEach(b=>b.onclick=e=>{
      e.stopPropagation();
      showMissedWorkoutDialog(state.workouts.find(x=>x.id===b.dataset.weekMore),b.dataset.weekDate);
    });
    document.querySelectorAll('[data-unit-launch]').forEach(b=>b.onclick=()=>launchWorkoutUnit(state.workouts.find(x=>x.id===b.dataset.unitLaunch)));
  };
})();
