// A session owns its exercise snapshots; template changes never rewrite a running workout.
function trainingBlocks(exercises){
  const blocks=[];
  for(const ex of [...exercises].sort((a,b)=>a.ordinal-b.ordinal)){
    const p=ex.payload||{},kind=p.trainingBlock==='core'?'core':p.superset?'superset':'single',key=kind==='core'?'core':kind==='superset'?p.superset:`single:${ex.id}`;
    const previous=blocks.at(-1);
    if(previous?.key===key)previous.exercises.push(ex);else blocks.push({key,kind,exercises:[ex]});
  }
  return blocks;
}
function exerciseSets(sets,id){return sets.filter(s=>s.exercise_id===id).sort((a,b)=>a.ordinal-b.ordinal);}
function executionSequence(exercises,sets){
  const result=[];
  for(const block of trainingBlocks(exercises)){
    for(const ex of block.exercises)for(const set of exerciseSets(sets,ex.id).filter(s=>s.set_type==='warmup'))result.push({exercise_id:ex.id,set_id:set.id,block:block.key,warmup:true,restSeconds:ex.payload?.warmupRestSeconds??60});
    const work=block.exercises.map(ex=>({ex,sets:exerciseSets(sets,ex.id).filter(s=>s.set_type!=='warmup')}));
    const rounds=Math.max(0,...work.map(x=>x.sets.length));
    for(let round=0;round<rounds;round++){
      const members=work.filter(x=>x.sets[round]);
      for(let i=0;i<members.length;i++){
        const {ex,sets:rows}=members[i],p=ex.payload||{},paired=block.kind==='superset'&&members.length>1;
        result.push({exercise_id:ex.id,set_id:rows[round].id,block:block.key,round,rounds,paired,roundEnd:i===members.length-1,restSeconds:i===members.length-1?(paired?p.roundRestSeconds??p.restSeconds??90:p.soloRestSeconds??p.restSeconds??90):0});
      }
    }
  }
  return result;
}
function nextExecutionSet(exercises,sets){const sequence=executionSequence(exercises,sets),byId=new Map(sets.map(s=>[s.id,s]));return sequence.find(x=>!byId.get(x.set_id)?.complete)||null;}
function restAfterCompletion(exercises,sets,id){
  const sequence=executionSequence(exercises,sets),entry=sequence.find(x=>x.set_id===id);if(!entry)return null;
  if(entry.warmup)return {seconds:entry.restSeconds,label:'Pauza po rozcvičovacej sérii'};
  const round=sequence.filter(x=>!x.warmup&&x.block===entry.block&&x.round===entry.round),byId=new Map(sets.map(s=>[s.id,s]));
  if(!round.every(x=>byId.get(x.set_id)?.complete))return {seconds:0,label:'Presun na ďalší cvik · 15–30 s'};
  if(entry.round===entry.rounds-1)return {seconds:0,label:'Blok dokončený'};
  return {seconds:round.at(-1).restSeconds,label:entry.paired?`${entry.block} · pauza po kole ${entry.round+1}`:'Pauza po sérii'};
}
function renderTrainingBlocks(exercises,renderExercise){
  return trainingBlocks(exercises).map(block=>{
    const p=block.exercises[0]?.payload||{},title=block.kind==='superset'?block.key:block.kind==='core'?'CORE FINISHER':'SAMOSTATNÝ CVIK';
    const hint=block.kind==='superset'?`Striedaj cviky po sérii · presun 15–30 s · spoločná pauza ${p.roundRestSeconds??p.restSeconds??90} s. Zostávajúca nepárna séria sa dokončí samostatne.`:block.kind==='core'?'Záverečný blok · obe strany dokonči pred pauzou.':'';
    return `<section class="training-block ${block.kind}" data-training-block="${h(block.key)}"><header><b>${h(title)}</b>${hint&&!state.activeSession?`<p>${h(hint)}</p>`:''}</header>${block.exercises.map((ex,i)=>renderExercise(ex,i)).join('')}</section>`;
  }).join('');
}
function weightLabel(p,weight){if(weight==null||weight==='')return 'Váhu nastavíš ty';return `${fmtNumber(weight)} kg${p.loadMode==='bodyweight'?' prídavná záťaž':''}`;}
function workoutElapsedSeconds(session,now=Date.now()){
  const p=session?.payload||{};if(session?.status==='completed'&&!p.finishedAt)return null;const raw=p.startedAt||(String(session?.id||'').match(/^session-(\d{13})-/)?.[1]);
  const start=/^\d+$/.test(String(raw))?Number(raw):Date.parse(raw);if(!Number.isFinite(start))return null;
  const end=p.finishedAt?Date.parse(p.finishedAt):now;return Math.max(0,Math.floor((end-start)/1000));
}
function clockText(seconds){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
function sessionTimeSummary(session){const seconds=session.payload?.durationSeconds??workoutElapsedSeconds(session);return seconds==null?'':`<p class="preview-hint">Trvanie: <strong>${clockText(seconds)}</strong> · cieľ ${clockText(session.payload?.targetDurationSeconds||3000)}</p>`;}
function renderWorkoutClock(){
  const elapsed=workoutElapsedSeconds(state.activeSession),target=state.activeSession?.payload?.targetDurationSeconds||3000;
  const el=document.getElementById('workout-elapsed');if(el)el.textContent=elapsed==null?'—':clockText(elapsed);
  const goal=document.getElementById('workout-time-goal');if(goal)goal.textContent=elapsed!=null&&elapsed>target?`Po cieli +${clockText(elapsed-target)}`:`Cieľ ${clockText(target)} · vrátane rozcvičky a páuz`;
}
function advanceWorkoutFocus(){
  const next=nextIncompleteSet();if(!next)return;
  requestAnimationFrame(()=>{const card=document.querySelector(`[data-exercise-card="${CSS.escape(next.exercise_id)}"]`);if(!card)return;const header=document.querySelector('.active-header'),timer=document.getElementById('timer-bar');card.style.scrollMarginTop=`${(header?.offsetHeight||66)+(timer?.classList.contains('on')?timer.offsetHeight:0)+12}px`;card.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});});
}
function renderNextExercise(){const next=nextIncompleteSet();if(!next)return '<div class="next-execution">Všetky série sú hotové. Tréning môžeš dokončiť cez Možnosti.</div>';const ex=state.activeExercises.find(x=>x.id===next.exercise_id);return `<div class="next-execution"><b>Teraz: ${h(exerciseName(ex?.payload,ex?.exercise_key))}</b><span>${next.warmup?'Rozcvičovacia séria':`${next.block.startsWith('SS')?`${h(next.block)} · `:''}kolo ${next.round+1}/${next.rounds}`}${ex?.payload?.sides>1?' · obe strany pred presunom':''}</span></div>`;}

if(typeof window!=='undefined')window.setInterval(renderWorkoutClock,1000);
