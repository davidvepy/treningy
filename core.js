var supabase;
const SUPABASE_URL = 'https://nragtrsgbvrnmbwlowoi.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Y9GtqKdB0pD-KQItwiu4Mw_ANXeA1Da';
const CLIENT_ID = 'david';
const APP_VERSION = '2.0.0';
const __supabaseReady = import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm').then(({createClient}) => {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
});

const app = document.getElementById('app');
const toastRoot = document.getElementById('toast-root');

const state = {
  user: null,
  loading: true,
  plan: null,
  workouts: [],
  planExercises: [],
  sessions: [],
  sessionExercises: [],
  sets: [],
  legacyLogs: [],
  measurements: [],
  activeSession: null,
  activeExercises: [],
  activeSets: [],
  timer: loadTimer(),
  elapsedTick: null,
  timerTick: null,
  chartMetric: 'maxWeight',
  progressSearch: '',
  online: navigator.onLine,
  saveTimers: new Map(),
  noteOpen: new Set()
};

const SET_TYPE_ORDER = ['working','warmup','failure','drop'];
const SET_TYPE_LABEL = { working:'W', warmup:'WU', failure:'F', drop:'D' };
const SET_TYPE_TITLE = { working:'Pracovná', warmup:'Warm-up', failure:'Do zlyhania', drop:'Drop set' };

function h(value=''){
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
}
function n(value, fallback=null){
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}
function fmtNumber(value, max=1){
  const x=n(value);
  if(x===null) return '—';
  return x.toLocaleString('sk-SK',{maximumFractionDigits:max});
}
function todayIso(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function isoDate(d){
  const x = typeof d === 'string' ? new Date(`${d}T12:00:00`) : d;
  return x.toLocaleDateString('sk-SK',{day:'numeric',month:'short',year:'numeric'});
}
function shortDate(d){
  const x = new Date(`${d}T12:00:00`);
  return {day:x.getDate(), month:x.toLocaleDateString('sk-SK',{month:'short'}).replace('.','')};
}
function formatDuration(seconds){
  if(!Number.isFinite(seconds) || seconds<=0) return '—';
  const m=Math.round(seconds/60);
  if(m<60) return `${m} min`;
  return `${Math.floor(m/60)} h ${m%60} min`;
}
function elapsedText(startedAt){
  if(!startedAt) return '00:00';
  const s=Math.max(0,Math.floor((Date.now()-new Date(startedAt).getTime())/1000));
  const hh=Math.floor(s/3600), mm=Math.floor((s%3600)/60), ss=s%60;
  return hh ? `${hh}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}` : `${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}
function slugify(v=''){
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72) || `exercise-${Date.now()}`;
}
function uniq(arr){ return [...new Set(arr)]; }
function icon(name){
  const paths={
    training:'<path d="M6 7v10M3 10v4M18 7v10M21 10v4M6 12h12"/>',
    history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
    progress:'<path d="M4 19V9M10 19V5M16 19v-7M22 19V3"/>',
    profile:'<path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/>',
    back:'<path d="m15 18-6-6 6-6"/>',
    chevron:'<path d="m9 18 6-6-6-6"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${paths[name]||''}</svg>`;
}
function toast(message,type='ok',ms=2600){
  const el=document.createElement('div');
  el.className=`toast ${type==='error'?'error':''}`;
  el.textContent=message;
  toastRoot.innerHTML=''; toastRoot.appendChild(el);
  setTimeout(()=>{ if(el.parentNode) el.remove(); },ms);
}
function safeJson(v,fallback={}){ return v && typeof v==='object' ? v : fallback; }
function updateUrl(hash){ if(location.hash!==hash) location.hash=hash; else renderRoute(); }
function route(){ return location.hash || '#/training'; }

function loadTimer(){
  try{ return JSON.parse(localStorage.getItem('training_rest_timer')||'null'); }catch{return null;}
}
function persistTimer(){
  if(state.timer) localStorage.setItem('training_rest_timer',JSON.stringify(state.timer));
  else localStorage.removeItem('training_rest_timer');
}
function startRest(seconds,label){
  const s=Math.max(0,n(seconds,0));
  if(!s) return;
  state.timer={endsAt:Date.now()+s*1000,label}; persistTimer(); renderTimerOnly(); ensureTimerTick();
}
function changeRest(delta){
  if(!state.timer) return;
  state.timer.endsAt=Math.max(Date.now(),state.timer.endsAt+delta*1000); persistTimer(); renderTimerOnly();
}
function skipRest(){ state.timer=null; persistTimer(); renderTimerOnly(); }
function timerRemaining(){ return state.timer ? Math.max(0,Math.ceil((state.timer.endsAt-Date.now())/1000)) : 0; }
function ensureTimerTick(){
  clearInterval(state.timerTick);
  state.timerTick=setInterval(()=>{
    if(!state.timer) return clearInterval(state.timerTick);
    const left=timerRemaining();
    if(left<=0){
      try{ navigator.vibrate?.([120,60,120]); }catch{}
      beep(); state.timer=null; persistTimer();
    }
    renderTimerOnly();
  },500);
}
function beep(){
  try{ const C=window.AudioContext||window.webkitAudioContext; if(!C)return; const c=new C(),o=c.createOscillator(),g=c.createGain(); o.frequency.value=740; g.gain.value=.04; o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.12); }catch{}
}
function renderTimerOnly(){
  const bar=document.getElementById('timer-bar'); if(!bar) return;
  if(!state.timer){ bar.classList.remove('on'); return; }
  const left=timerRemaining();
  if(left<=0){ bar.classList.remove('on'); return; }
  bar.classList.add('on');
  const count=bar.querySelector('.count'); if(count) count.textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`;
  const label=bar.querySelector('[data-timer-label]'); if(label) label.textContent=state.timer.label||'Prestávka';
}

function nav(active){
  const items=[['training','Tréning'],['history','História'],['progress','Progres'],['profile','Profil']];
  return `<nav class="bottom-nav"><div class="nav-inner">${items.map(([key,label])=>`<button class="nav-btn ${active===key?'active':''}" data-nav="${key}">${icon(key)}<span>${label}</span></button>`).join('')}</div></nav>`;
}
function shell(content,active){ return `<main class="shell"><section class="view">${content}</section>${nav(active)}</main>`; }
function bindNav(){ document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>updateUrl(`#/${b.dataset.nav}`)); }

async function init(){
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./sw.js'); }catch(e){ console.warn('SW',e); } }
  window.addEventListener('hashchange',renderRoute);
  window.addEventListener('online',()=>{state.online=true; renderSyncState(); loadCore(false);});
  window.addEventListener('offline',()=>{state.online=false; renderSyncState();});
  const {data:{session}}=await supabase.auth.getSession();
  state.user=session?.user||null;
  supabase.auth.onAuthStateChange((_event,session)=>{
    state.user=session?.user||null;
    if(state.user) loadCore(); else renderLogin();
  });
  if(!state.user){ state.loading=false; return renderLogin(); }
  await loadCore();
  if(!location.hash) location.hash='#/training'; else renderRoute();
  ensureTimerTick();
}

function renderLogin(){
  clearIntervals();
  app.innerHTML=`<div class="login-wrap"><form id="login-form" class="login-card">
    <div class="logo">DV</div><h1>Tréning</h1><p>Prihlás sa do svojho tréningového logu.</p>
    <label class="field"><span>E-mail</span><input class="text-input" id="email" type="email" autocomplete="email" required></label>
    <label class="field"><span>Heslo</span><input class="text-input" id="password" type="password" autocomplete="current-password" required></label>
    <button class="primary" type="submit">PRIHLÁSIŤ SA</button><div id="login-error" class="error-text"></div>
  </form></div>`;
  document.getElementById('login-form').onsubmit=async e=>{
    e.preventDefault(); const btn=e.currentTarget.querySelector('button'); btn.disabled=true; btn.textContent='PRIHLASUJEM…';
    const email=document.getElementById('email').value.trim(), password=document.getElementById('password').value;
    const {error}=await supabase.auth.signInWithPassword({email,password});
    if(error){document.getElementById('login-error').textContent='Prihlásenie sa nepodarilo. Skontroluj údaje.';btn.disabled=false;btn.textContent='PRIHLÁSIŤ SA';}
  };
}

async function loadCore(showLoading=true){
  if(!state.user) return;
  if(showLoading){ state.loading=true; app.innerHTML='<div class="loading"><div><div class="spinner"></div>Načítavam tréningy…</div></div>'; }
  try{
    const uid=state.user.id;
    const [plansR,sessionsR,sessionExR,setsR,logsR,measureR]=await Promise.all([
      supabase.from('trainer_hub_plans').select('*').eq('client_id',CLIENT_ID).eq('owner_id',uid),
      supabase.from('trainer_hub_workout_sessions').select('*').eq('client_id',CLIENT_ID).eq('owner_id',uid).order('recorded_date',{ascending:false}).limit(300),
      supabase.from('trainer_hub_session_exercises').select('*').eq('client_id',CLIENT_ID).eq('owner_id',uid).limit(4000),
      supabase.from('trainer_hub_workout_sets').select('*').eq('client_id',CLIENT_ID).eq('owner_id',uid).limit(8000),
      supabase.from('workout_logs').select('*').eq('user_id',uid).order('performed_on',{ascending:false}).limit(2000),
      supabase.from('body_measurements').select('*').eq('user_id',uid).order('measured_on',{ascending:true}).limit(500)
    ]);
    for(const r of [plansR,sessionsR,sessionExR,setsR,logsR,measureR]) if(r.error) throw r.error;
    state.plan=(plansR.data||[]).filter(p=>safeJson(p.payload).status==='active').sort((a,b)=>String(safeJson(b.payload).createdAt||'').localeCompare(String(safeJson(a.payload).createdAt||'')))[0]||null;
    state.sessions=sessionsR.data||[]; state.sessionExercises=sessionExR.data||[]; state.sets=setsR.data||[]; state.legacyLogs=logsR.data||[]; state.measurements=measureR.data||[];
    if(state.plan){
      const [wR,weR]=await Promise.all([
        supabase.from('trainer_hub_workouts').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).order('ordinal'),
        supabase.from('trainer_hub_workout_exercises').select('*').eq('owner_id',uid).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).order('ordinal')
      ]);
      if(wR.error) throw wR.error; if(weR.error) throw weR.error;
      state.workouts=wR.data||[]; state.planExercises=weR.data||[];
    } else { state.workouts=[]; state.planExercises=[]; }
    const active=state.sessions.find(s=>s.status==='active');
    setActiveFromCore(active||null);
    state.loading=false; renderRoute();
  }catch(e){
    console.error(e); state.loading=false;
    app.innerHTML=`<div class="login-wrap"><div class="login-card"><h1>Nepodarilo sa načítať dáta</h1><p>${h(e.message||e)}</p><button class="primary" id="retry">SKÚSIŤ ZNOVA</button></div></div>`;
    document.getElementById('retry').onclick=()=>loadCore();
  }
}
function setActiveFromCore(session){
  state.activeSession=session;
  if(!session){state.activeExercises=[];state.activeSets=[];return;}
  state.activeExercises=state.sessionExercises.filter(x=>x.session_id===session.id).sort((a,b)=>a.ordinal-b.ordinal);
  state.activeSets=state.sets.filter(x=>x.session_id===session.id).sort((a,b)=>a.ordinal-b.ordinal);
}
function clearIntervals(){ clearInterval(state.elapsedTick); clearInterval(state.timerTick); }

function renderRoute(){
  if(!state.user) return renderLogin();
  if(state.loading) return;
  const r=route();
  if(r==='#/active') return renderActive();
  if(r.startsWith('#/exercise/')) return renderExerciseDetail(decodeURIComponent(r.split('/').slice(2).join('/')));
  if(r.startsWith('#/session/')) return renderSessionDetail(decodeURIComponent(r.split('/').slice(2).join('/')));
  if(r.startsWith('#/history')) return renderHistory();
  if(r.startsWith('#/progress')) return renderProgress();
  if(r.startsWith('#/profile')) return renderProfile();
  return renderTraining();
}

function strengthTemplates(){
  const strength=state.workouts.filter(w=>safeJson(w.payload).type==='Silový tréning');
  const A=strength.find(w=>/^Tréning A\b/i.test(safeJson(w.payload).title||''));
  const B=strength.find(w=>/^Tréning B\b/i.test(safeJson(w.payload).title||''));
  const Cs=strength.filter(w=>/^Tréning C\b/i.test(safeJson(w.payload).title||''));
  let C=Cs[0];
  if(Cs.length>1){
    const prior=state.sessions.find(s=>s.status==='completed' && safeJson(s.payload).template==='C');
    const lastId=safeJson(prior?.payload).workoutId;
    C=Cs.find(x=>x.id!==lastId)||Cs[0];
  }
  return {A,B,C};
}
function nextPlannedWorkout(){
  if(!state.workouts.length) return null;
  const jsDay=new Date().getDay();
  let best=null;
  for(const w of state.workouts){
    const p=safeJson(w.payload); const day=n(p.day,null); if(day===null) continue;
    let delta=(day-jsDay+7)%7;
    if(delta===0 && new Date().getHours()>=22) delta=7;
    if(!best || delta<best.delta || (delta===best.delta && w.ordinal<best.w.ordinal)) best={w,delta};
  }
  return best;
}
function templateSubtitle(w){
  if(!w) return 'Nie je v pláne';
  const ex=state.planExercises.filter(x=>x.workout_id===w.id).sort((a,b)=>a.ordinal-b.ordinal);
  if(!ex.length) return 'Bez pracovných cvikov';
  return ex.slice(0,2).map(x=>safeJson(x.payload).englishName||safeJson(x.payload).name).join(' · ');
}
function workoutBadge(w){
  const p=safeJson(w?.payload),type=String(p.type||'').toLowerCase(),title=String(p.title||'').toLowerCase();
  if(type.includes('hokej')||title.includes('hokej')) return '🏒';
  if(type.includes('zone')||type.includes('beh')||title.includes('zone')||title.includes('beh')||title.includes('fartlek')) return '🏃';
  if(type.includes('mobil')||title.includes('regener')||title.includes('mobil')) return '🧘';
  return '🏋️';
}
