function allExerciseKeys(){
  const map=new Map();
  for(const ex of state.sessionExercises){const p=safeJson(ex.payload);if(!map.has(ex.exercise_key))map.set(ex.exercise_key,{key:ex.exercise_key,name:p.englishName||p.name||'Neznámy cvik',sk:p.name||''});}
  for(const ex of state.planExercises){const p=safeJson(ex.payload);if(!map.has(ex.exercise_key))map.set(ex.exercise_key,{key:ex.exercise_key,name:p.englishName||p.name||'Neznámy cvik',sk:p.name||''});}
  return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'sk'));
}
function renderProgress(){
  const exercises=allExerciseKeys().filter(x=>`${x.name} ${x.sk}`.toLowerCase().includes(state.progressSearch.toLowerCase()));
  const lastM=state.measurements.at(-1),firstM=state.measurements[0];
  const content=`<div class="page-head"><div><div class="eyebrow">Progres</div><h1>Výkon, nie ego.</h1><p>Váha, odhad 1RM, tonáž a opakovania. Tonáž je trend, nie skóre kvality tréningu.</p></div></div><div class="metric-grid"><div class="metric-card"><span>Hmotnosť</span><b>${lastM?`${fmtNumber(lastM.weight_kg)} kg`:'—'}</b></div><div class="metric-card"><span>Pás</span><b>${lastM?`${fmtNumber(lastM.waist_cm)} cm`:'—'}</b></div><div class="metric-card"><span>Δ váha</span><b>${lastM&&firstM?`${fmtNumber(n(lastM.weight_kg)-n(firstM.weight_kg))} kg`:'—'}</b></div><div class="metric-card"><span>Tréningy</span><b>${state.sessions.filter(s=>s.status==='completed').length}</b></div></div><div class="section-title"><h2>Cviky</h2><span>${exercises.length}</span></div><div class="search"><input id="exercise-search" class="text-input" placeholder="Hľadať cvik…" value="${h(state.progressSearch)}"></div><div class="exercise-list">${exercises.map(x=>`<button data-progress-key="${h(x.key)}"><b>${h(x.name)}</b><span>${h(x.sk)}</span></button>`).join('')}</div>`;
  app.innerHTML=shell(content,'progress');bindNav();document.getElementById('exercise-search').oninput=e=>{state.progressSearch=e.target.value;renderProgress();setTimeout(()=>{const el=document.getElementById('exercise-search');el?.focus();el?.setSelectionRange(el.value.length,el.value.length);},0);};document.querySelectorAll('[data-progress-key]').forEach(b=>b.onclick=()=>updateUrl(`#/exercise/${encodeURIComponent(b.dataset.progressKey)}`));
}

function exerciseHistory(key){
  const points=[];
  for(const ex of state.sessionExercises.filter(x=>x.exercise_key===key)){
    const s=state.sessions.find(x=>x.id===ex.session_id);if(!s||s.status!=='completed')continue;
    const sets=state.sets.filter(st=>st.session_id===ex.session_id&&st.exercise_id===ex.id&&st.complete&&st.set_type!=='warmup');if(!sets.length)continue;
    points.push({date:s.recorded_date,session:s,exercise:ex,sets,maxWeight:Math.max(...sets.map(x=>n(x.weight,0))),est1RM:Math.max(...sets.map(x=>e1rm(x.weight,x.reps))),tonnage:sets.reduce((a,x)=>a+setTonnage(x,ex),0),reps:sets.reduce((a,x)=>a+n(x.reps,0),0)});
  }
  return points.sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
function latestExerciseDef(key){
  const active=state.activeExercises.find(x=>x.exercise_key===key);if(active)return active;
  const pe=state.planExercises.find(x=>x.exercise_key===key);if(pe)return pe;
  return [...state.sessionExercises].reverse().find(x=>x.exercise_key===key)||null;
}
function renderExerciseDetail(idOrKey){
  let ex=state.activeExercises.find(x=>x.id===idOrKey); const activeContext=!!ex; const key=ex?.exercise_key||idOrKey; if(!ex)ex=latestExerciseDef(key);
  if(!ex)return updateUrl('#/progress'); const ep=safeJson(ex.payload),historyPts=exerciseHistory(key),latest=historyPts.at(-1),metrics={maxWeight:latest?.maxWeight||0,est1RM:latest?.est1RM||0,tonnage:latest?.tonnage||0,reps:latest?.reps||0};
  const alternatives=parseAlternatives(ep.alternative||'');
  const muscles=musclesFor(ep.pattern,ep.englishName||ep.name);
  const content=`<div class="detail-head"><button class="back-btn" id="back">${icon('back')}</button><div><div class="eyebrow">${h(ep.name||'Cvik')}</div><h1>${h(ep.englishName||ep.name||'Cvik')}</h1><p>${h(muscles.join(' · '))}</p></div></div><div class="prescription" style="padding:0 0 10px"><span class="chip">${h(ep.sets??'—')}×${h(ep.repMin??'?')}${ep.repMax&&ep.repMax!==ep.repMin?`–${h(ep.repMax)}`:''}</span><span class="chip">RIR ${h(ep.rirMin??'—')}${ep.rirMax&&ep.rirMax!==ep.rirMin?`–${h(ep.rirMax)}`:''}</span><span class="chip accent">${fmtNumber(ep.weight)} kg</span><span class="chip">${h(restLabel(ep))}</span></div>
  <div class="card"><div class="detail-section"><h2>Technika</h2><div class="tech-grid">${techniqueCards(ep,muscles)}</div></div><div class="detail-section"><h2>Progresia</h2><p>${h(ep.progression||'Najprv pridávaj kvalitné opakovania v cieľovom RIR, až potom záťaž.')}</p></div>${activeContext&&alternatives.length?`<button class="secondary" style="width:100%;margin-top:12px" id="replace-toggle">NAHRADIŤ CVIK</button><div class="replace-list" id="replace-list">${alternatives.map((a,i)=>`<button class="alt-btn" data-alt="${i}"><b>${h(a.name)}</b><small>${h(a.detail)}</small></button>`).join('')}</div>`:''}</div>
  <div class="section-title"><h2>História výkonu</h2><span>${historyPts.length} tréningov</span></div><div class="metric-grid"><div class="metric-card"><span>Max váha</span><b>${metrics.maxWeight?`${fmtNumber(metrics.maxWeight)} kg`:'—'}</b></div><div class="metric-card"><span>Odhad 1RM</span><b>${metrics.est1RM?`${fmtNumber(metrics.est1RM)} kg`:'—'}</b></div><div class="metric-card"><span>Tonáž</span><b>${metrics.tonnage?`${fmtNumber(metrics.tonnage/1000,2)} t`:'—'}</b></div><div class="metric-card"><span>Reps</span><b>${metrics.reps||'—'}</b></div></div><div class="chart-card"><div class="metric-switch">${[['maxWeight','Najvyššia váha'],['est1RM','Odhad 1RM'],['tonnage','Tonáž'],['reps','Opakovania']].map(([k,l])=>`<button data-metric="${k}" class="${state.chartMetric===k?'active':''}">${l}</button>`).join('')}</div><div class="chart-wrap"><canvas id="progress-chart"></canvas></div><p class="chart-note">Odhad 1RM používa Epleyho vzorec: váha × (1 + reps / 30). Pri vysokom počte opakovaní ho neber ako presné maximum.</p></div>`;
  app.innerHTML=shell(content,activeContext?'training':'progress');bindNav();document.getElementById('back').onclick=()=>history.back();document.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{state.chartMetric=b.dataset.metric;renderExerciseDetail(idOrKey);});drawChart(historyPts,state.chartMetric);
  if(activeContext&&alternatives.length){document.getElementById('replace-toggle').onclick=()=>document.getElementById('replace-list').classList.toggle('open');document.querySelectorAll('[data-alt]').forEach(b=>b.onclick=()=>replaceExercise(ex,alternatives[n(b.dataset.alt,0)]));}
}
function techniqueCards(ep,muscles){
  const how=Array.isArray(ep.how)?ep.how:[];const breathing=how.find(x=>/nadých|dych|spevni|brace/i.test(x))||(/press|squat|deadlift|row|pulldown/i.test(ep.englishName||'')?'Pred pracovným opakovaním vytvor stabilný trup. Pri náročnej fáze drž oporu a vydýchni po prekonaní najťažšieho bodu.':'Dýchaj plynulo, výdych smeruj do náročnej fázy pohybu.');
  return `<div class="tech-card"><b>Setup</b><p>${h(how[0]||'Nastav stabilnú pozíciu a rozsah, v ktorom máš kontrolu.')}</p></div><div class="tech-card"><b>Vykonanie</b><p>${h(how.slice(1).join(' ')||how[0]||'Pohyb veď kontrolovane bez švihu.')}</p></div><div class="tech-card"><b>Dýchanie / brace</b><p>${h(breathing)}</p></div><div class="tech-card"><b>Čo máš cítiť</b><p>${h(muscles.length?`Primárne ${muscles.join(', ').toLowerCase()}, nie kĺbovú bolesť.`:'Cieľovú svalovú skupinu, nie ostrú kĺbovú bolesť.')}</p></div><div class="tech-card"><b>Najčastejšia chyba</b><p>${h(ep.mistake||'Strata kontroly rozsahu alebo kompenzácia trupom.')}</p></div>`;
}
function musclesFor(pattern,name=''){
  const p=String(pattern||'').toLowerCase(),nme=String(name).toLowerCase();
  if(p==='horizontal_push'||/press|fly|pec/.test(nme))return['Hrudník','predný delt','triceps'];
  if(p==='vertical_pull'||/pulldown|pull-up/.test(nme))return['Široký sval chrbta','biceps','horný chrbát'];
  if(p==='horizontal_pull'||/row/.test(nme))return['Stred chrbta','latissimus','zadný delt','biceps'];
  if(p==='hinge'||/deadlift|rdl/.test(nme))return['Hamstringy','sedacie svaly','vzpriamovače trupu'];
  if(p==='squat'||/squat|leg press/.test(nme))return['Kvadricepsy','sedacie svaly','adduktory'];
  if(p==='unilateral')return['Kvadricepsy','sedacie svaly','stabilizátory bedra'];
  if(/lateral raise/.test(nme))return['Bočný delt'];
  if(/curl/.test(nme))return['Biceps','brachialis'];
  if(/triceps|pushdown/.test(nme))return['Triceps'];
  if(/reverse fly/.test(nme))return['Zadný delt','horný chrbát'];
  return['Cieľové svaly cviku'];
}
function parseAlternatives(text){
  if(!text)return[];const chunks=String(text).split(/\s+(?:Alebo|Ak nie je lavička:)\s+/i).map(x=>x.replace(/^\.|\.$/g,'').trim()).filter(Boolean);
  return chunks.map(c=>{const first=c.split(',')[0].trim();const parts=first.split('·').map(x=>x.trim());return{name:parts[1]||parts[0],sk:parts[0],english:parts[1]||'',detail:c,weight:n((c.match(/([0-9]+(?:[,.][0-9]+)?)\s*kg/i)||[])[1]?.replace(',','.'),null)};});
}
async function replaceExercise(ex,alt){
  const oldKey=ex.exercise_key,old=safeJson(ex.payload),newKey=slugify(alt.english||alt.sk||alt.name),payload={...old,name:alt.sk||alt.name,englishName:alt.english||alt.name,exerciseKey:newKey,weight:alt.weight??old.weight,replacedFrom:oldKey,alternative:''};
  const {error}=await supabase.from('trainer_hub_session_exercises').update({exercise_key:newKey,payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',ex.session_id).eq('id',ex.id);
  if(error)return toast('Nahradenie cviku sa nepodarilo.','error');ex.exercise_key=newKey;ex.payload=payload;toast(`Cvik nahradený: ${alt.name}`);updateUrl('#/active');
}
function drawChart(points,metric){
  const canvas=document.getElementById('progress-chart');if(!canvas)return;const box=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;canvas.width=Math.max(1,box.width*dpr);canvas.height=Math.max(1,box.height*dpr);const c=canvas.getContext('2d');c.scale(dpr,dpr);const W=box.width,H=box.height,pad={l:42,r:12,t:18,b:28};c.clearRect(0,0,W,H);
  if(!points.length){c.fillStyle='#93a4ba';c.font='12px system-ui';c.fillText('Zatiaľ bez dát.',16,36);return;}
  const vals=points.map(x=>n(x[metric],0)),min0=Math.min(...vals),max0=Math.max(...vals),spread=Math.max(1,max0-min0),min=Math.max(0,min0-spread*.15),max=max0+spread*.15;
  c.strokeStyle='rgba(148,163,184,.16)';c.lineWidth=1;for(let i=0;i<4;i++){const y=pad.t+(H-pad.t-pad.b)*(i/3);c.beginPath();c.moveTo(pad.l,y);c.lineTo(W-pad.r,y);c.stroke();}
  c.fillStyle='#7f92aa';c.font='10px system-ui';c.textAlign='right';for(let i=0;i<4;i++){const v=max-(max-min)*(i/3);c.fillText(metric==='tonnage'?fmtNumber(v/1000,1):fmtNumber(v,1),pad.l-7,pad.t+(H-pad.t-pad.b)*(i/3)+3);}
  const xy=points.map((p,i)=>({x:points.length===1?(pad.l+W-pad.r)/2:pad.l+(W-pad.l-pad.r)*(i/(points.length-1)),y:pad.t+(H-pad.t-pad.b)*(1-(n(p[metric],0)-min)/(max-min||1)),p}));
  c.strokeStyle='#8cf2c3';c.lineWidth=2.5;c.beginPath();xy.forEach((pt,i)=>i?c.lineTo(pt.x,pt.y):c.moveTo(pt.x,pt.y));c.stroke();
  c.fillStyle='#8cf2c3';for(const pt of xy){c.beginPath();c.arc(pt.x,pt.y,4,0,Math.PI*2);c.fill();}
  c.fillStyle='#7f92aa';c.font='9px system-ui';c.textAlign='center';const labels=xy.length<=5?xy:xy.filter((_,i)=>i===0||i===xy.length-1||i===Math.floor((xy.length-1)/2));for(const pt of labels)c.fillText(new Date(`${pt.p.date}T12:00:00`).toLocaleDateString('sk-SK',{day:'numeric',month:'numeric'}),pt.x,H-8);
}

