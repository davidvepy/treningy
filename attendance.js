// A stable row per workout and date makes repeated taps and retries idempotent.
const attendanceWrites=new Map();
function activityAttendance(workoutId,date){return state.sessions.filter(s=>s.recorded_date===date&&safeJson(s.payload).workoutId===workoutId&&['completed','skipped'].includes(s.status)).sort((a,b)=>String(safeJson(b.payload).attendanceUpdatedAt||safeJson(b.payload).finishedAt||safeJson(b.payload).createdAt||'').localeCompare(String(safeJson(a.payload).attendanceUpdatedAt||safeJson(a.payload).finishedAt||safeJson(a.payload).createdAt||'')))[0]||null;}
async function saveActivityAttendance(w,date,completed,details={}){
  if(!w||safeJson(w.payload).type==='Silový tréning'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const lock=`${state.user.id}:${w.id}:${date}`;if(attendanceWrites.has(lock))return attendanceWrites.get(lock);
  const task=(async()=>{
    const existing=activityAttendance(w.id,date),wp=safeJson(w.payload),now=new Date().toISOString(),id=existing?.id||`attendance-${date}-${w.id}`;
    const payload={...safeJson(existing?.payload),...details,id,date,workoutId:w.id,planId:state.plan?.id,title:wp.title||wp.type,type:wp.type,sessionType:'routine',status:completed?'completed':'skipped',attendanceCancelled:!completed,attendanceUpdatedAt:now,finishedAt:now,partial:false};
    const row={owner_id:state.user.id,client_id:CLIENT_ID,id,recorded_date:date,status:payload.status,payload};
    let r=existing?await supabase.from('trainer_hub_workout_sessions').update({status:row.status,payload}).eq('owner_id',row.owner_id).eq('client_id',CLIENT_ID).eq('id',id).select('id'):await supabase.from('trainer_hub_workout_sessions').insert(row).select('id');
    // Another tab may already have inserted the deterministic row.
    if(!existing&&r.error){const found=await supabase.from('trainer_hub_workout_sessions').select('id').eq('owner_id',row.owner_id).eq('client_id',CLIENT_ID).eq('id',id);if(found.data?.length)r=await supabase.from('trainer_hub_workout_sessions').update({status:row.status,payload}).eq('owner_id',row.owner_id).eq('client_id',CLIENT_ID).eq('id',id).select('id');}
    if(r.error||!r.data?.length){toast('Stav sa nepodarilo uložiť. Skús to znova po pripojení.','error');return false;}
    if(existing)Object.assign(existing,row);else state.sessions.push(row);
    toast(completed?'Aktivita označená ako absolvovaná.':'Označenie absolvovania zrušené.');return true;
  })();attendanceWrites.set(lock,task);try{return await task;}finally{attendanceWrites.delete(lock);}
}
async function toggleActivityAttendance(w,date){const previous=activityAttendance(w.id,date),completed=previous?.status!=='completed'||safeJson(previous.payload).attendanceCancelled;if(await saveActivityAttendance(w,date,completed))renderTraining();}
