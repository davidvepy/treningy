/* Review signals never change the prescribed workload or rest periods. */
function workoutTimingReview(workoutId,sessions){
  const recent=sessions.filter(s=>s.status==='completed'&&safeJson(s.payload).workoutId===workoutId)
    .map(s=>({session:s,seconds:safeJson(s.payload).durationSeconds??workoutElapsedSeconds(s)}))
    .filter(x=>Number.isFinite(x.seconds)&&x.seconds>0)
    .sort((a,b)=>String(b.session.recorded_date).localeCompare(String(a.session.recorded_date))||String(safeJson(b.session.payload).finishedAt||'').localeCompare(String(safeJson(a.session.payload).finishedAt||''))).slice(0,3);
  const over=recent.filter(x=>x.seconds>3000).length;
  return {count:recent.length,over,warn:over>=2};
}
function reviewFeedback(s){
  const saved=safeJson(s.payload).feedback||{};
  try{return {...saved,...JSON.parse(localStorage.getItem(`training-feedback:${state.user.id}:${s.id}`)||'{}')};}catch{return saved;}
}
function saveReviewFeedback(field,value){
  const s=state.activeSession;if(!s||!['fatigue','recovery'].includes(field))return;
  const f=reviewFeedback(s);if(value==='')delete f[field];else if(/^[1-5]$/.test(value))f[field]=Number(value);else return;
  try{localStorage.setItem(`training-feedback:${state.user.id}:${s.id}`,JSON.stringify(f));}catch{toast('Hodnotenie sa nepodarilo uložiť do zariadenia.','error');}
}
function renderReviewFeedback(s){
  const f=reviewFeedback(s);
  return `<div class="review-feedback"><b>Ako sa cítiš? <small>Voliteľné</small></b>${[['recovery','Regenerácia pred tréningom','1 slabá · 5 výborná'],['fatigue','Únava po tréningu','1 nízka · 5 vysoká']].map(([key,label,hint])=>`<label>${label}<select data-review-feedback="${key}" aria-label="${label}"><option value="">Nehodnotené</option>${[1,2,3,4,5].map(v=>`<option value="${v}" ${f[key]===v?'selected':''}>${v}</option>`).join('')}</select><small>${hint}</small></label>`).join('')}</div>`;
}
function renderSessionFeedback(s){const f=safeJson(s.payload).feedback||{};return f.fatigue||f.recovery?`<p class="session-time">${f.recovery?`Regenerácia pred tréningom: ${h(f.recovery)}/5 · `:''}${f.fatigue?`Únava po tréningu: ${h(f.fatigue)}/5`:''}</p>`:'';}
function renderProgramReview(workoutId){
  const plan=safeJson(state.plan?.payload),block=plan.trainingBlock;if(!block)return '';
  const workouts=state.workouts.filter(w=>safeJson(w.payload).type==='Silový tréning'&&(!workoutId||w.id===workoutId));
  const alerts=workouts.map(w=>{const t=workoutTimingReview(w.id,state.sessions);return t.warn?`<p class="tolerance-note">${h(safeJson(w.payload).title)}: ${t.over} z posledných ${t.count} meraných tréningov presiahli 50 minút. Skontroluj čas presunov a priebeh tréningu. Predpísané pauzy ostávajú zachované.</p>`:'';}).join('');
  const recent=state.sessions.filter(s=>s.status==='completed'&&workouts.some(w=>w.id===safeJson(s.payload).workoutId)).sort((a,b)=>String(b.recorded_date).localeCompare(String(a.recorded_date))).slice(0,3);
  const feedback=recent.map(s=>safeJson(s.payload).feedback||{}),fatigue=feedback.filter(f=>f.fatigue>=4).length,recovery=feedback.filter(f=>f.recovery&&f.recovery<=2).length;
  const date=todayIso(),due=date>=block.reviewFrom;
  return `<details class="preview-panel program-review" ${alerts||due||fatigue>=2||recovery>=2?'open':''}><summary>Plán A/B/C · 6–8 týždňov</summary><p>Kontrola plánu ${h(block.reviewFrom)} až ${h(block.reviewBy)}. ${due?'Je čas vyhodnotiť výkon, únavu a regeneráciu.':'Zachovaj plán a priebežne sleduj výkon, únavu a regeneráciu.'}</p>${alerts}${fatigue>=2||recovery>=2?'<p class="tolerance-note">Opakovane zaznamenaná vysoká únava alebo slabá regenerácia. Pri kontrole plánu zohľadni aj Thai box a piatkový hokej.</p>':''}<p>Výkon porovnaj v časti <a href="#/progress">Progres</a> spolu s váhami, opakovaniami a RIR v histórii. Záťaž a pauzy sa nemenia automaticky.</p></details>`;
}
