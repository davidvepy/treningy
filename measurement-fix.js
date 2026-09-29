/* Tréning v4.1 – body measurement save fix */
function parseMeasurementNumber(value){
  if(value===null||value===undefined)return null;
  const normalized=String(value).trim().replace(/\s+/g,'').replace(',','.');
  if(!normalized)return null;
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:null;
}

saveMeasurement=async function(e){
  e.preventDefault();
  const form=e.currentTarget||document.getElementById('measurement-form');
  const button=form?.querySelector('button[type="submit"]');
  const date=document.getElementById('m-date')?.value||'';
  const weight=parseMeasurementNumber(document.getElementById('m-weight')?.value);
  const waist=parseMeasurementNumber(document.getElementById('m-waist')?.value);

  if(!date)return toast('Vyber dátum merania.','error');
  if(weight===null||weight<30||weight>300)return toast('Skontroluj hmotnosť. Môžeš použiť 90,4 aj 90.4.','error',4200);
  if(waist===null||waist<40||waist>250)return toast('Skontroluj obvod pásu. Môžeš použiť 95,5 aj 95.5.','error',4200);

  if(button){button.disabled=true;button.textContent='UKLADÁM…';}
  try{
    const existing=state.measurements.find(x=>x.measured_on===date);
    let r;
    if(existing){
      r=await supabase.from('body_measurements')
        .update({weight_kg:weight,waist_cm:waist,owner_id:state.user.id,client_id:CLIENT_ID})
        .eq('user_id',state.user.id)
        .eq('owner_id',state.user.id)
        .eq('id',existing.id);
    }else{
      r=await supabase.from('body_measurements').insert({
        id:Date.now(),
        user_id:state.user.id,
        owner_id:state.user.id,
        client_id:CLIENT_ID,
        measured_on:date,
        weight_kg:weight,
        waist_cm:waist
      });
    }
    if(r.error)throw new Error(r.error.message||'Supabase odmietol zápis.');
    toast('Meranie uložené.');
    await loadCore(false);
    state.progressTab='body';
    renderProgress();
  }catch(err){
    console.error('Measurement save failed',err);
    toast(`Meranie sa nepodarilo uložiť: ${err.message||err}`,'error',6000);
    if(button){button.disabled=false;button.textContent='ULOŽIŤ MERANIE';}
  }
};
