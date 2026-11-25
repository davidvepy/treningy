function rampDraftKey(s){return `training-ramp:${state.user.id}:${s.id}`;}
function rampChecksFor(s){try{return {...safeJson(s.payload).rampChecks,...JSON.parse(localStorage.getItem(rampDraftKey(s))||'{}')};}catch{return safeJson(s.payload).rampChecks||{};}}
let rampWrite=Promise.resolve();
function flushRampChecks(){
  const s=state.activeSession;if(!s)return Promise.resolve(true);const owner=state.user.id,key=rampDraftKey(s);
  rampWrite=rampWrite.catch(()=>false).then(async()=>{
    if(state.user?.id!==owner)return false;let draft;try{draft=localStorage.getItem(key);}catch{return false;}if(!draft)return true;
    const payload={...safeJson(s.payload),rampChecks:rampChecksFor(s)},r=await supabase.from('trainer_hub_workout_sessions').update({payload}).eq('owner_id',owner).eq('client_id',CLIENT_ID).eq('id',s.id).select('id');
    if(r.error||!r.data?.length)return false;s.payload=payload;
    if(localStorage.getItem(key)===draft)localStorage.removeItem(key);return true;
  });return rampWrite;
}
async function saveRampCheck(key,checked){
  const s=state.activeSession;if(!s)return;try{localStorage.setItem(rampDraftKey(s),JSON.stringify({...rampChecksFor(s),[key]:checked}));}catch{return toast('Rozcvička sa nepodarila uložiť do zariadenia.','error');}
  const boxes=[...document.querySelectorAll('[data-ramp]')];if(boxes.length&&boxes.every(x=>x.checked))document.querySelector('.ramp-card')?.removeAttribute('open');
  if(!(await flushRampChecks()))toast('Rozcvička je uložená v zariadení a čaká na pripojenie.');
}
function trainingHistoryKey(ex){
  const links=safeJson(state.plan?.payload).historyLinks||[];
  return links.find(l=>l.from===ex.exercise_key&&l.sessionIds?.includes(ex.session_id))?.to||ex.exercise_key;
}
async function setExerciseConcern(id,field){
  if(!['pain','techniqueIssue'].includes(field))return;const ex=state.activeExercises.find(x=>x.id===id);if(!ex)return;
  const payload={...safeJson(ex.payload),[field]:!safeJson(ex.payload)[field]},r=await supabase.from('trainer_hub_session_exercises').update({payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('session_id',ex.session_id).eq('id',ex.id).select('id');
  if(r.error||!r.data?.length)return toast('Hodnotenie cviku sa nepodarilo uložiť.','error');ex.payload=payload;renderActive();
}

if(typeof window!=='undefined')window.addEventListener('online',()=>{void flushRampChecks();});
