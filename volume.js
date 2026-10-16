const MUSCLE_GROUPS={chest:'Hrudník',back:'Chrbát',side_delts:'Bočné delty',rear_delts:'Zadné delty',biceps:'Biceps',triceps:'Triceps',quads:'Kvadricepsy',hamstrings:'Hamstringy',glutes:'Sedacie svaly',calves:'Lýtka',core:'Core',front_delts:'Predné delty',other:'Nezaradené'};
function primaryMuscleGroup(payload={},key=''){
  if(Object.hasOwn(MUSCLE_GROUPS,payload.primary_muscle_group))return payload.primary_muscle_group;
  const name=`${key} ${payload.englishName||payload.name||''}`.toLowerCase().replace(/[_-]/g,' ');
  if(/reverse.*fly|rear.*delt|face pull/.test(name))return 'rear_delts';
  if(/lateral raise|side.*raise/.test(name))return 'side_delts';
  if(/curl/.test(name)&&!/leg curl/.test(name))return 'biceps';
  if(/pushdown|push down|triceps|tricep/.test(name))return 'triceps';
  if(/squat|lunge|leg press|leg extension/.test(name))return 'quads';
  if(/romanian|\brdl\b|leg curl|hamstring/.test(name))return 'hamstrings';
  if(/pulldown|pull down|\brow\b|pull up|chin up|deadlift/.test(name))return 'back';
  if(/chest|incline.*press|bench.*press|push up|cable fly/.test(name))return 'chest';
  if(/hip thrust|glute bridge/.test(name))return 'glutes';
  if(/calf|calves/.test(name))return 'calves';
  if(/plank|dead bug|bird dog|crunch|sit up|pallof/.test(name))return 'core';
  if(/shoulder press|overhead press|front raise/.test(name))return 'front_delts';
  const libraryMap={chest:'chest',lats:'back','middle back':'back','lower back':'back',biceps:'biceps',triceps:'triceps',quadriceps:'quads',hamstrings:'hamstrings',glutes:'glutes',calves:'calves',abdominals:'core'};
  return libraryMap[payload.primaryMuscles?.[0]]||'other';
}
function muscleOptions(selected){return Object.entries(MUSCLE_GROUPS).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}</option>`).join('');}
function shiftIsoDay(iso,days){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function bratislavaToday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bratislava',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());return ['year','month','day'].map(t=>parts.find(x=>x.type===t).value).join('-');}
function weekStart(iso){const day=new Date(`${iso}T12:00:00Z`).getUTCDay();return shiftIsoDay(iso,-((day+6)%7));}
function computeWeeklyVolume(data,today){
  const start=weekStart(today),earliest=shiftIsoDay(start,-28),end=shiftIsoDay(start,7),weeks={};
  for(let i=0;i<5;i++){const week=shiftIsoDay(start,-7*i);weeks[week]=Object.fromEntries(Object.keys(MUSCLE_GROUPS).map(g=>[g,{sets:0,sessions:new Set()}]));}
  const sessions=new Map(data.sessions.filter(s=>s.status==='completed'&&s.recorded_date>=earliest&&s.recorded_date<end&&s.recorded_date<=today).map(s=>[s.id,s]));
  const exercises=new Map(data.sessionExercises.map(e=>[`${e.session_id}/${e.id}`,e]));
  const counted=new Set();
  for(const set of data.sets){
    if(!set.complete||!['working','failure','drop'].includes(set.set_type||'working'))continue;
    const session=sessions.get(set.session_id),exercise=exercises.get(`${set.session_id}/${set.exercise_id}`);
    if(!session||!exercise||exercise.payload?.skippedInSession)continue;
    const id=`${set.session_id}/${set.exercise_id}/${set.id}`;if(counted.has(id))continue;counted.add(id);
    const group=primaryMuscleGroup(exercise.payload||{},exercise.exercise_key),bucket=weeks[weekStart(session.recorded_date)]?.[group];if(!bucket)continue;
    bucket.sets++;bucket.sessions.add(session.id);
  }
  const last=shiftIsoDay(start,-7),prior=[1,2,3,4].map(i=>weeks[shiftIsoDay(start,-7*i)]);
  return {start,rows:Object.keys(MUSCLE_GROUPS).map(group=>({group,current:weeks[start][group].sets,currentSessions:weeks[start][group].sessions.size,last:weeks[last][group].sets,lastSessions:weeks[last][group].sessions.size,average:prior.reduce((a,w)=>a+w[group].sets,0)/4,averageSessions:prior.reduce((a,w)=>a+w[group].sessions.size,0)/4}))};
}
function renderWeeklyVolume(){
  const owner=state.user?.id,key=weekStart(bratislavaToday());
  if(!state.volumeData||state.volumeData.owner!==owner||state.volumeData.week!==key){if(!state.volumeLoading)void loadWeeklyVolumeData();return '<p class="preview-hint" role="status">Načítavam dokončené série za päť týždňov…</p>'; }
  if(state.volumeData.error)return `<p class="preview-hint" role="alert">${h(state.volumeData.error)}</p><button class="quick-edit-button" id="volume-retry">Skúsiť znova</button>`;
  const report=computeWeeklyVolume(state.volumeData,bratislavaToday()),mode=state.volumePeriod||'current',field=mode==='last'?'last':mode==='average'?'average':'current',sessionField=mode==='last'?'lastSessions':mode==='average'?'averageSessions':'currentSessions';
  const rows=report.rows.filter(r=>!['other','glutes','calves','core','front_delts'].includes(r.group)||r.current||r.last||r.average),max=Math.max(1,...rows.map(r=>r[field]));
  const date=mode==='last'?shiftIsoDay(report.start,-7):report.start;
  return `<div class="volume-periods">${[['current','Tento týždeň'],['last','Minulý týždeň'],['average','Priemer 4 týždňov']].map(([key,label])=>`<button data-volume-period="${key}" class="${mode===key?'active':''}">${label}</button>`).join('')}</div><p class="preview-hint">${mode==='average'?`Štyri dokončené týždne: ${isoDate(shiftIsoDay(report.start,-28))} – ${isoDate(shiftIsoDay(report.start,-1))}`:`${isoDate(date)} – ${isoDate(shiftIsoDay(date,6))}`}</p><div class="volume-list">${rows.map(r=>`<article class="volume-card"><div><strong>${MUSCLE_GROUPS[r.group]}</strong><b>${fmtNumber(r[field],2)} sérií</b></div><div class="volume-track" aria-hidden="true"><span style="width:${100*r[field]/max}%"></span></div><small>${fmtNumber(r[sessionField],2)} tréningov partie${mode==='average'?' / týždeň v priemere':''}</small></article>`).join('')}</div><p class="preview-hint">Iba dokončené priame pracovné série zo skutočne dokončených tréningov. Bez sekundárnych svalov, warm-up a vynechaných či nedokončených sérií. Série do zlyhania a drop série sa počítajú raz, strany a počet činiek počet sérií nenásobia. Staré importy bez potvrdenia dokončenia nie sú zahrnuté. Nejde o hodnotenie dostatočnosti objemu.</p>`;
}
function bindWeeklyVolume(){const retry=document.getElementById('volume-retry');if(retry)retry.onclick=()=>{state.volumeData=null;renderProgress();};document.querySelectorAll('[data-volume-period]').forEach(b=>b.onclick=()=>{state.volumePeriod=b.dataset.volumePeriod;renderProgress();});}

async function loadWeeklyVolumeData(){
  const owner=state.user?.id;if(!owner||state.volumeLoading)return;
  const week=weekStart(bratislavaToday());state.volumeLoading=true;
  const scoped=table=>supabase.from(table).select('*').eq('owner_id',owner).eq('client_id',CLIENT_ID);
  async function pages(make){const all=[];for(let offset=0;;offset+=500){const r=await make().range(offset,offset+499);if(r.error)throw new Error(r.error.message);all.push(...(r.data||[]));if((r.data||[]).length<500)return all;}}
  try{
    const sessions=await pages(()=>scoped('trainer_hub_workout_sessions').eq('status','completed').gte('recorded_date',shiftIsoDay(week,-28)).lt('recorded_date',shiftIsoDay(week,7)).order('id'));
    const sessionExercises=[],sets=[];
    for(let i=0;i<sessions.length;i+=40){const ids=sessions.slice(i,i+40).map(s=>s.id);const [e,s]=await Promise.all([pages(()=>scoped('trainer_hub_session_exercises').in('session_id',ids).order('session_id').order('id')),pages(()=>scoped('trainer_hub_workout_sets').in('session_id',ids).order('session_id').order('exercise_id').order('id'))]);sessionExercises.push(...e);sets.push(...s);}
    if(state.user?.id===owner)state.volumeData={owner,week,sessions,sessionExercises,sets};
  }catch(e){if(state.user?.id===owner)state.volumeData={owner,week,error:`Týždenný objem sa nepodarilo načítať: ${e.message}`};}
  finally{state.volumeLoading=false;if(state.user?.id===owner&&state.progressTab==='volume')renderProgress();}
}
