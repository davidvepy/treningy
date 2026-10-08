// Suggestions follow an explicitly configured rule. They never change the plan automatically.
function evaluateProgression(payload,previous){
  const step=Number(payload.progressionStep),expected=Number(payload.sets),max=Number(payload.repMax),targetRir=Number(payload.rirMin);
  if(payload.progressionEnabled!==true||!(step>0)||!(expected>0)||!(max>0)||payload.rirMin==null||!Number.isFinite(targetRir)||!previous||previous.source!=='normalized')return null;
  const sp=previous.session?.payload||{};if(sp.partial||sp.dataQuality==='partial')return null;
  const sets=previous.sets.filter(s=>(s.set_type||'working')==='working'&&s.complete);
  if(sets.length!==expected||sets.some(s=>Number(s.reps)<max))return null;
  const last=sets.at(-1);if(last.rir==null||!Number.isFinite(Number(last.rir))||Number(last.rir)<targetRir)return null;
  const weight=Number(sets[0].weight);if(!(weight>0)||sets.some(s=>Number(s.weight)!==weight))return null;
  if(payload.weightUpdatedAt&&previous.timestamp&&new Date(payload.weightUpdatedAt).getTime()>previous.timestamp)return null;
  return {weight:Math.round((weight+step)*1000)/1000,reason:`Všetky ${expected} pracovné série dosiahli ${max} opakovaní a posledná séria mala rezervu aspoň ${targetRir}. Nastavený krok: ${step} kg.`};
}
function progressionProposal(row){return evaluateProgression(safeJson(row.payload),previousEntryForKey(row.exercise_key));}
async function acceptProgression(row){
  const proposal=progressionProposal(row);if(!proposal)return;
  const payload={...safeJson(row.payload),weight:proposal.weight,weightUpdatedAt:new Date().toISOString()};
  const r=await supabase.from('trainer_hub_workout_exercises').update({payload}).eq('owner_id',state.user.id).eq('client_id',CLIENT_ID).eq('plan_id',state.plan.id).eq('workout_id',row.workout_id).eq('id',row.id).select('id');
  if(r.error||r.data?.length!==1)return toast('Návrh sa nepodarilo uložiť.','error');
  row.payload=payload;toast('Navrhnutá váha prijatá pre ďalší tréning.');renderWorkoutPreview(row.workout_id);
}
