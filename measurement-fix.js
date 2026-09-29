/* Tréning v4.3 – final iOS/Supabase body measurement fix */
function parseMeasurementNumber(value){
  if(value===null||value===undefined)return null;
  const normalized=String(value).trim().replace(/\s+/g,'').replace(',','.');
  if(!normalized)return null;
  const parsed=Number(normalized);
  return Number.isFinite(parsed)?parsed:null;
}

renderBodyProgress=function(){
  const rows=[...state.measurements].sort((a,b)=>String(b.measured_on).localeCompare(String(a.measured_on)));
  const latest=rows[0];
  return `<div class="body-summary">${latest?`<div><span>Hmotnosť</span><b>${fmtNumber(latest.weight_kg)} kg</b></div><div><span>Pás</span><b>${fmtNumber(latest.waist_cm)} cm</b></div>`:'<div><span>Merania</span><b>—</b></div>'}</div>
    <form class="measurement-form" id="measurement-form" novalidate>
      <input id="m-date" type="date" value="${todayIso()}">
      <input id="m-weight" type="text" inputmode="decimal" autocomplete="off" placeholder="Hmotnosť kg">
      <input id="m-waist" type="text" inputmode="decimal" autocomplete="off" placeholder="Pás cm">
      <button type="submit">ULOŽIŤ MERANIE</button>
    </form>
    <div class="measurement-list">${rows.map(m=>`<div><span>${isoDate(m.measured_on)}</span><b>${fmtNumber(m.weight_kg)} kg</b><b>${fmtNumber(m.waist_cm)} cm</b></div>`).join('')}</div>`;
};

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
  }finally{
    if(button&&document.body.contains(button)){button.disabled=false;button.textContent='ULOŽIŤ MERANIE';}
  }
};
