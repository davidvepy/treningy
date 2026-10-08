// Durable, owner-scoped patches. Only existing sets are queued; creating a session requires a connection.
class SetPatchQueue{
  constructor(storage,owner,send,changed=()=>{}){this.storage=storage;this.owner=owner;this.send=send;this.changed=changed;this.running=null;this.error=null;this.items=this.read();}
  key(){return `training-set-patches-v1:${this.owner}`;}
  read(){const raw=this.storage.getItem(this.key());if(!raw)return [];const data=JSON.parse(raw);if(!Array.isArray(data))throw new Error('Fronta uloženia je poškodená.');return data;}
  persist(items){this.storage.setItem(this.key(),JSON.stringify(items));this.items=items;this.changed();}
  put(row,patch){const key=`${row.session_id}/${row.exercise_id}/${row.id}`,old=this.items.find(x=>x.key===key),next={key,session_id:row.session_id,exercise_id:row.exercise_id,id:row.id,patch:{...old?.patch,...patch},revision:crypto.randomUUID()};this.persist([...this.items.filter(x=>x.key!==key),next]);}
  flush(){if(this.running)return this.running;this.running=this.drain().finally(()=>{this.running=null;this.changed();});return this.running;}
  async drain(){this.error=null;while(this.items.length){const item=this.items[0];try{await this.send(item,this.owner);const latest=this.items.find(x=>x.key===item.key);if(latest?.revision===item.revision)this.persist(this.items.filter(x=>x.key!==item.key));}catch(e){this.error=e.message||'Uloženie zlyhalo.';this.changed();return false;}}return true;}
}
let setPatchQueue=null;
function currentSetQueue(){
  const owner=state.user?.id;if(!owner)return null;
  if(setPatchQueue?.owner===owner)return setPatchQueue;
  setPatchQueue=new SetPatchQueue(localStorage,owner,async(item,expectedOwner)=>{
    if(state.user?.id!==expectedOwner)throw new Error('Prihlás sa pôvodným účtom.');
    const session=await supabase.auth.getSession();if(session.data.session?.user?.id!==expectedOwner)throw new Error('Prihlásenie sa zmenilo.');
    if(!navigator.onLine)throw new Error('Čakám na internet.');
    const r=await supabase.from('trainer_hub_workout_sets').update({...item.patch,updated_at:new Date().toISOString()}).eq('owner_id',expectedOwner).eq('client_id',CLIENT_ID).eq('session_id',item.session_id).eq('exercise_id',item.exercise_id).eq('id',item.id).select('id');
    if(r.error)throw new Error(r.error.message);if(r.data?.length!==1)throw new Error('Databáza nepotvrdila sériu.');
  },renderSaveStatus);return setPatchQueue;
}
function renderSaveStatus(){
  const el=document.getElementById('save-status');if(!el)return;
  const q=setPatchQueue?.owner===state.user?.id?setPatchQueue:null;
  const pending=q?.items.length||0;el.textContent=pending?`${navigator.onLine?'Čaká na uloženie':'Uložené v tomto zariadení'} · ${pending} ${pending===1?'séria':'sérií'}`:'Všetky série uložené';el.classList.toggle('pending',!!pending);
  if(q?.error)el.title=q.error;
}
function queueSetPatch(row,patch){
  try{const q=currentSetQueue();if(!q)throw new Error('Nie si prihlásený.');q.put(row,patch);Object.assign(row,patch);const canonical=state.sets.find(s=>s.id===row.id&&s.session_id===row.session_id&&s.exercise_id===row.exercise_id);if(canonical)Object.assign(canonical,patch);void q.flush();return true;}
  catch(e){toast(`Zmena sa neuložila do zariadenia: ${e.message}`,'error',5000);return false;}
}
async function flushWorkoutChanges(){
  try{const q=currentSetQueue();if(!q)return false;const ok=await q.flush();if(!ok)toast('Série čakajú na synchronizáciu. Pripoj sa na internet a skús znova.','error',4500);return ok;}catch(e){toast(e.message,'error');return false;}
}
function restoreQueuedSets(){
  const q=currentSetQueue();if(!q)return;for(const item of q.items){const row=state.sets.find(s=>s.id===item.id&&s.session_id===item.session_id&&s.exercise_id===item.exercise_id);if(row)Object.assign(row,item.patch);}void q.flush();
}
window.addEventListener('online',()=>{try{void currentSetQueue()?.flush();}catch(e){toast(e.message,'error');}renderSaveStatus();});
window.addEventListener('offline',renderSaveStatus);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){renderTimerOnly();try{void currentSetQueue()?.flush();}catch(e){toast(e.message,'error');}}});
setInterval(()=>{if(state.user&&navigator.onLine&&setPatchQueue?.items.length)void setPatchQueue.flush();},15000);
