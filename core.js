const SUPABASE_URL='https://nragtrsgbvrnmbwlowoi.supabase.co';
const SUPABASE_KEY='sb_publishable_Y9GtqKdB0pD-KQItwiu4Mw_ANXeA1Da';
const CLIENT_ID='david';
const APP_VERSION='3.3.0';
const AUTH_STORAGE_KEY='sb-nragtrsgbvrnmbwlowoi-auth-token';

function parseStoredSession(raw){
  if(!raw) return null;
  try{
    let text=raw;
    if(text.startsWith('base64-')) text=decodeURIComponent(escape(atob(text.slice(7))));
    const parsed=JSON.parse(text);
    const s=parsed?.access_token?parsed:parsed?.currentSession?.access_token?parsed.currentSession:null;
    return s?.access_token?s:null;
  }catch{return null;}
}
function createSupabaseLite(baseUrl,apiKey){
  const listeners=new Set();
  let session=parseStoredSession(localStorage.getItem(AUTH_STORAGE_KEY));
  function writeSession(next){session=next||null;try{session?localStorage.setItem(AUTH_STORAGE_KEY,JSON.stringify(session)):localStorage.removeItem(AUTH_STORAGE_KEY);}catch{}}
  function notify(event){for(const cb of listeners){try{cb(event,session);}catch(e){console.error(e);}}}
  function normalizeSession(payload){if(!payload?.access_token)return null;return {...payload,expires_at:payload.expires_at||Math.floor(Date.now()/1000)+Number(payload.expires_in||3600)};}
  async function authRequest(path,body,token){
    const headers={'apikey':apiKey,'Content-Type':'application/json'};if(token)headers.Authorization=`Bearer ${token}`;
    const res=await fetch(`${baseUrl}${path}`,{method:'POST',headers,body:body===undefined?undefined:JSON.stringify(body)});
    let data=null;try{data=await res.json();}catch{}
    if(!res.ok)return{data:null,error:{message:data?.msg||data?.message||data?.error_description||data?.error||`HTTP ${res.status}`}};
    return{data,error:null};
  }
  async function ensureSession(){
    session=session||parseStoredSession(localStorage.getItem(AUTH_STORAGE_KEY));
    if(!session)return null;
    if(Number(session.expires_at||0)>Math.floor(Date.now()/1000)+45)return session;
    if(!session.refresh_token)return session;
    const r=await authRequest('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token});
    if(r.error||!r.data?.access_token){writeSession(null);notify('SIGNED_OUT');return null;}
    const next=normalizeSession(r.data);writeSession(next);notify('TOKEN_REFRESHED');return next;
  }
  async function restFetch(table,q){
    const current=await ensureSession();
    const params=new URLSearchParams();
    if(q.selectCols)params.set('select',q.selectCols);
    for(const [col,val] of q.filters)params.append(col,`eq.${val}`);
    if(q.orderBy)params.set('order',`${q.orderBy.column}.${q.orderBy.ascending?'asc':'desc'}`);
    if(q.limitValue!=null)params.set('limit',String(q.limitValue));
    const headers={'apikey':apiKey,'Authorization':`Bearer ${current?.access_token||apiKey}`,'Content-Type':'application/json','Accept':'application/json'};
    if(q.method!=='GET')headers.Prefer='return=minimal';
    const res=await fetch(`${baseUrl}/rest/v1/${encodeURIComponent(table)}${params.toString()?'?'+params.toString():''}`,{method:q.method,headers,body:q.body==null?undefined:JSON.stringify(q.body)});
    let data=null;if(res.status!==204){try{data=await res.json();}catch{}}
    if(!res.ok)return{data:null,error:{message:data?.message||data?.hint||data?.details||`HTTP ${res.status}`}};
    return{data,error:null};
  }
  class Query{
    constructor(table){this.table=table;this.method='GET';this.body=null;this.selectCols='*';this.filters=[];this.orderBy=null;this.limitValue=null;}
    select(cols='*'){this.selectCols=cols;return this;}
    insert(body){this.method='POST';this.body=body;this.selectCols=null;return this;}
    update(body){this.method='PATCH';this.body=body;this.selectCols=null;return this;}
    delete(){this.method='DELETE';this.selectCols=null;return this;}
    eq(c,v){this.filters.push([c,String(v)]);return this;}
    order(c,o={}){this.orderBy={column:c,ascending:o.ascending!==false};return this;}
    limit(v){this.limitValue=v;return this;}
    then(resolve,reject){return restFetch(this.table,this).then(resolve,reject);}
  }
  return{
    auth:{
      async getSession(){const s=await ensureSession();return{data:{session:s},error:null};},
      onAuthStateChange(cb){listeners.add(cb);return{data:{subscription:{unsubscribe(){listeners.delete(cb);}}}};},
      async signInWithPassword({email,password}){const r=await authRequest('/auth/v1/token?grant_type=password',{email,password});if(r.error)return{data:{session:null,user:null},error:r.error};const s=normalizeSession(r.data);writeSession(s);notify('SIGNED_IN');return{data:{session:s,user:s.user},error:null};},
      async signOut(){const token=session?.access_token;if(token){try{await authRequest('/auth/v1/logout',undefined,token);}catch{}}writeSession(null);notify('SIGNED_OUT');return{error:null};}
    },
    from(table){return new Query(table);}
  };
}
const supabase=createSupabaseLite(SUPABASE_URL,SUPABASE_KEY);

const app=document.getElementById('app');
const toastRoot=document.getElementById('toast-root');
const state={user:null,loading:true,plan:null,workouts:[],planExercises:[],sessions:[],sessionExercises:[],sets:[],legacyLogs:[],measurements:[],activeSession:null,activeExercises:[],activeSets:[],timer:loadTimer(),timerTick:null,saveTimers:new Map(),progressSearch:'',progressTab:'exercises',chartMetric:'maxWeight',finishOpen:false,online:navigator.onLine,routineChecks:{},routineNote:'',routineDuration:'',editExerciseOpen:false};

const SET_TYPE_ORDER=['working','warmup','failure','drop'];
const SET_TYPE_LABEL={working:'S',warmup:'WU',failure:'F',drop:'D'};
const SET_TYPE_TITLE={working:'Pracovná séria',warmup:'Warm-up',failure:'Do zlyhania',drop:'Drop set'};
const LEGACY_ALIASES={
  'low-incline-dumbbell-press':['a2'],
  'cable-fly':['a5'],
  'cable-lateral-raise':['a3c'],
  'rope-triceps-pushdown':['a4'],
  'lat-pulldown':['c1pull'],
  'one-arm-dumbbell-row':['b2','legacy_one_arm_row'],
  'reverse-dumbbell-fly':['c3rev'],
  'dumbbell-lateral-raise':['b2lat'],
  'hammer-curl':['b5curl'],
  'preacher-curl':['c4pre'],
  'bulgarian-split-squat':['b7split'],
  'romanian-deadlift':['c6rdl'],
  'incline-dumbbell-curl':['c5inc']
};

function h(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function n(v,f=null){const x=Number(v);return Number.isFinite(x)?x:f;}
function safeJson(v,f={}){return v&&typeof v==='object'?v:f;}
function fmtNumber(v,max=1){const x=n(v);return x===null?'—':x.toLocaleString('sk-SK',{maximumFractionDigits:max});}
function todayIso(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function isoDate(d){return new Date(`${d}T12:00:00`).toLocaleDateString('sk-SK',{day:'numeric',month:'long',year:'numeric'});}
function shortDate(d){const x=new Date(`${d}T12:00:00`);return{day:x.getDate(),month:x.toLocaleDateString('sk-SK',{month:'short'}).replace('.','')};}
function slugify(v=''){return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)||`exercise-${Date.now()}`;}
function route(){return location.hash||'#/training';}
function updateUrl(hash){if(location.hash!==hash)location.hash=hash;else renderRoute();}
function exerciseName(p,key=''){return p?.englishName||p?.name||key||'Cvik';}
function exerciseSkName(p){return p?.name||'';}
function validExerciseName(name){const s=String(name||'').trim();return !!s&&!/názov nebol v exporte/i.test(s)&&!/^([abc]\d+\s*[·:-]|unknown|neznámy cvik)/i.test(s);}
function toast(message,type='ok',ms=2600){const el=document.createElement('div');el.className=`toast ${type==='error'?'error':''}`;el.textContent=message;toastRoot.innerHTML='';toastRoot.appendChild(el);setTimeout(()=>el.remove(),ms);}
function icon(name){const paths={training:'<path d="M5 8v8M2.5 10v4M19 8v8M21.5 10v4M5 12h14"/>',history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',progress:'<path d="M4 18l5-6 4 3 7-9"/><path d="M15 6h5v5"/>',profile:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',back:'<path d="m15 18-6-6 6-6"/>',dots:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'};return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name]||''}</svg>`;}

function nav(active){const items=[['training','Tréning'],['history','História'],['progress','Progres'],['profile','Profil']];return `<nav class="bottom-nav"><div class="nav-inner">${items.map(([k,l])=>`<button class="nav-btn ${active===k?'active':''}" data-nav="${k}">${icon(k)}<span>${l}</span></button>`).join('')}</div></nav>`;}
function shell(content,active){return `<main class="shell"><section class="view">${content}</section>${nav(active)}</main>`;}
function bindNav(){document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>updateUrl(`#/${b.dataset.nav}`));}

function loadTimer(){try{return JSON.parse(localStorage.getItem('training_rest_timer')||'null');}catch{return null;}}
function persistTimer(){state.timer?localStorage.setItem('training_rest_timer',JSON.stringify(state.timer)):localStorage.removeItem('training_rest_timer');}
function timerRemaining(){return state.timer?Math.max(0,Math.ceil((state.timer.endsAt-Date.now())/1000)):0;}
function startRest(seconds,label){const s=Math.max(0,n(seconds,0));if(!s)return;state.timer={endsAt:Date.now()+s*1000,label};persistTimer();renderTimerOnly();ensureTimerTick();}
function changeRest(delta){if(!state.timer)return;state.timer.endsAt=Math.max(Date.now(),state.timer.endsAt+delta*1000);persistTimer();renderTimerOnly();}
function skipRest(){state.timer=null;persistTimer();renderTimerOnly();}
function ensureTimerTick(){clearInterval(state.timerTick);state.timerTick=setInterval(()=>{if(!state.timer)return clearInterval(state.timerTick);if(timerRemaining()<=0){try{navigator.vibrate?.([100,50,100]);}catch{}state.timer=null;persistTimer();}renderTimerOnly();},500);}
function renderTimerOnly(){const bar=document.getElementById('timer-bar');if(!bar)return;if(!state.timer||timerRemaining()<=0){bar.classList.remove('on');return;}bar.classList.add('on');bar.querySelector('.timer-count').textContent=`${Math.floor(timerRemaining()/60)}:${String(timerRemaining()%60).padStart(2,'0')}`;const l=bar.querySelector('.timer-exercise');if(l)l.textContent=state.timer.label||'Pauza';}

function estimate1RM(weight,reps){const w=n(weight,0),r=n(reps,0);if(w<=0||r<=0||r>15)return null;return w*(1+r/30);}
function loadFactorFromPayload(p){return Math.max(1,n(p?.loadCount,1))*Math.max(1,n(p?.sides,1));}
function setTonnage(set,exercise){if((set.set_type||'working')==='warmup'||!set.complete)return 0;const w=n(set.weight,0),r=n(set.reps,0);if(w<=0||r<=0)return 0;return w*r*loadFactorFromPayload(safeJson(exercise?.payload));}
function legacyFactor(row){const text=`${row.exercise_name||''} ${row.raw_entry||''}`.toLowerCase();return /jednoruč|dumbbell|\/ruč|na ruku|\/strana|na stranu/.test(text)?2:1;}
function legacyTonnage(row){const w=n(row.weight_kg,0),reps=Array.isArray(row.reps)?row.reps.map(x=>n(x,0)).filter(Boolean):[];if(w<=0||!reps.length)return 0;return w*reps.reduce((a,b)=>a+b,0)*legacyFactor(row);}
function sessionStats(sessionId){const exs=state.sessionExercises.filter(e=>e.session_id===sessionId);let tonnage=0,workingSets=0,reps=0;for(const ex of exs){for(const s of state.sets.filter(x=>x.session_id===sessionId&&x.exercise_id===ex.id)){if(s.complete&&(s.set_type||'working')!=='warmup'){workingSets++;reps+=n(s.reps,0);tonnage+=setTonnage(s,ex);}}}return{tonnage,workingSets,reps};}
function legacyDayStats(rows){return{tonnage:rows.reduce((a,r)=>a+legacyTonnage(r),0),workingSets:rows.reduce((a,r)=>a+(Array.isArray(r.reps)?r.reps.length:0),0),reps:rows.reduce((a,r)=>a+(Array.isArray(r.reps)?r.reps.reduce((x,y)=>x+n(y,0),0):0),0)};}
function isPartialSession(s){const p=safeJson(s.payload);return p.partial===true||p.dataQuality==='partial';}
function legacyGroups(){const g={};for(const row of state.legacyLogs){if(!row.performed_on)continue;(g[row.performed_on]??=[]).push(row);}return g;}

function strengthTemplates(){const s=state.workouts.filter(w=>safeJson(w.payload).type==='Silový tréning');const A=s.find(w=>/^Tréning A\b/i.test(safeJson(w.payload).title||''));const B=s.find(w=>/^Tréning B\b/i.test(safeJson(w.payload).title||''));const Cs=s.filter(w=>/^Tréning C\b/i.test(safeJson(w.payload).title||''));let C=Cs[0];if(Cs.length>1){const prior=state.sessions.find(x=>x.status==='completed'&&safeJson(x.payload).template==='C');const last=safeJson(prior?.payload).workoutId;C=Cs.find(x=>x.id!==last)||Cs[0];}return{A,B,C};}
function templateExercises(w){return w?state.planExercises.filter(x=>x.workout_id===w.id).filter(x=>validExerciseName(exerciseName(safeJson(x.payload),x.exercise_key))).sort((a,b)=>a.ordinal-b.ordinal):[];}
function templateShortList(w){return templateExercises(w).map(x=>exerciseName(safeJson(x.payload),x.exercise_key));}
function nextPlannedWorkout(){if(!state.workouts.length)return null;const day=new Date().getDay();let best=null;for(const w of state.workouts){const p=safeJson(w.payload),d=n(p.day,null);if(d===null)continue;let delta=(d-day+7)%7;if(!best||delta<best.delta||(delta===best.delta&&w.ordinal<best.w.ordinal))best={w,delta};}return best;}

async function init(){
  window.addEventListener('hashchange',renderRoute);window.addEventListener('online',()=>{state.online=true;});window.addEventListener('offline',()=>{state.online=false;});
  const {data:{session}}=await supabase.auth.getSession();state.user=session?.user||null;
  supabase.auth.onAuthStateChange((_event,s)=>{state.user=s?.user||null;if(state.user)loadCore();else renderLogin();});
  if(!state.user){state.loading=false;return renderLogin();}
  await loadCore();ensureTimerTick();
  if(!location.hash)location.hash='#/training';else renderRoute();
}
function renderLogin(){
  app.innerHTML=`<div class="login-page"><form class="login-card" id="login-form"><div class="brand-mark">DV</div><h1>Tréning</h1><p>Prihlás sa do svojho tréningového logu.</p><label>E-mail<input id="email" type="email" autocomplete="email" required></label><label>Heslo<input id="password" type="password" autocomplete="current-password" required></label><button class="btn-primary" type="submit">PRIHLÁSIŤ SA</button><div class="form-error" id="login-error"></div></form></div>`;
  document.getElementById('login-form').onsubmit=async e=>{e.preventDefault();const btn=e.currentTarget.querySelector('button');btn.disabled=true;btn.textContent='PRIHLASUJEM…';const r=await supabase.auth.signInWithPassword({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value});if(r.error){document.getElementById('login-error').textContent=r.error.message||'Prihlásenie sa nepodarilo.';btn.disabled=false;btn.textContent='PRIHLÁSIŤ SA';}};
}
async function loadCore(showLoading=true){
  if(!state.user)return;if(showLoading){state.loading=true;app.innerHTML='<div class="boot"><div class="boot-spinner"></div><div>Načítavam dáta…</div></div>';}
  try{
    const uid=state.user.id;
    const [plansR,sessionsR,sessionExR,setsR,logsR,measureR]=await Promise.all([
      supabase.from('trainer_hub_plans').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID),
      supabase.from('trainer_hub_workout_sessions').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID).order('recorded_date',{ascending:false}).limit(300),
      supabase.from('trainer_hub_session_exercises').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID).limit(4000),
      supabase.from('trainer_hub_workout_sets').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID).limit(8000),
      supabase.from('workout_logs').select('*').eq('user_id',uid).order('performed_on',{ascending:false}).limit(3000),
      supabase.from('body_measurements').select('*').eq('user_id',uid).order('measured_on',{ascending:true}).limit(500)
    ]);
    for(const r of [plansR,sessionsR,sessionExR,setsR,logsR,measureR])if(r.error)throw new Error(r.error.message);
    state.plan=(plansR.data||[]).filter(p=>safeJson(p.payload).status==='active').sort((a,b)=>String(safeJson(b.payload).createdAt||'').localeCompare(String(safeJson(a.payload).createdAt||'')))[0]||null;
    state.sessions=sessionsR.data||[];state.sessionExercises=(sessionExR.data||[]).filter(x=>validExerciseName(exerciseName(safeJson(x.payload),x.exercise_key)));state.sets=setsR.data||[];state.legacyLogs=(logsR.data||[]).filter(x=>validExerciseName(x.exercise_name));state.measurements=measureR.data||[];
    if(state.plan){const [wR,eR]=await Promise.all([supabase.from('trainer_hub_workouts').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).order('ordinal'),supabase.from('trainer_hub_workout_exercises').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).order('ordinal')]);if(wR.error)throw new Error(wR.error.message);if(eR.error)throw new Error(eR.error.message);state.workouts=wR.data||[];state.planExercises=(eR.data||[]).filter(x=>validExerciseName(exerciseName(safeJson(x.payload),x.exercise_key)));}else{state.workouts=[];state.planExercises=[];}
    const active=state.sessions.find(s=>s.status==='active');setActive(active||null);state.loading=false;renderRoute();
  }catch(e){console.error(e);state.loading=false;window.__showBootError(e.message||String(e));}
}
function setActive(s){state.activeSession=s;if(!s){state.activeExercises=[];state.activeSets=[];return;}state.activeExercises=state.sessionExercises.filter(x=>x.session_id===s.id).sort((a,b)=>a.ordinal-b.ordinal);state.activeSets=state.sets.filter(x=>x.session_id===s.id).sort((a,b)=>a.ordinal-b.ordinal);}
function renderRoute(){if(!state.user)return renderLogin();if(state.loading)return;const r=route();if(r==='#/active')return renderActive();if(r.startsWith('#/routine/'))return renderRoutineDetail(decodeURIComponent(r.split('/').slice(2).join('/')));if(r.startsWith('#/exercise/'))return renderExerciseDetail(decodeURIComponent(r.split('/').slice(2).join('/')));if(r.startsWith('#/session/'))return renderSessionDetail(decodeURIComponent(r.split('/').slice(2).join('/')));if(r.startsWith('#/history'))return renderHistory();if(r.startsWith('#/progress'))return renderProgress();if(r.startsWith('#/profile'))return renderProfile();return renderTraining();}
