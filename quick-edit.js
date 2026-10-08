function parseQuickEdit(text){
  const normalized=String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const rules=[[/^(?:nastav\s+)?(?:vsetkym cvikom\s+)?pauz[auy]\s+(?:na\s+)?(\d+)\s*(?:s|sekund|sekundy)?\.?$/,'restSeconds','Pauza'],[/^(?:nastav\s+)?(?:vsetkym cvikom\s+)?(?:serie|pocet serii)\s+(?:na\s+)?(\d+)\.?$/,'sets','Série'],[/^(?:nastav\s+)?(?:vsetkym cvikom\s+)?vah[auy]\s+(?:na\s+)?(\d+(?:[.,]\d+)?)\s*(?:kg)?\.?$/,'weight','Váha']];
  for(const [pattern,field,label] of rules){const m=normalized.match(pattern);if(!m)continue;const value=Number(m[1].replace(',','.'));if(value<0||(field==='sets'&&(value<1||value>30))||(field==='restSeconds'&&value>3600))return null;return{field,value,label};}return null;
}
function quickEditHtml(){return `<details class="preview-panel"><summary>Rýchla úprava vetou</summary><label class="quick-edit-label">Čo chceš zmeniť?<input id="quick-edit-text" placeholder="Nastav pauzu na 90 sekúnd"></label><p>Podporované: pauza, počet sérií a váha pre všetky cviky v jednotke.</p><button class="quick-edit-button" id="quick-edit-preview">Pripraviť zmenu</button><div id="quick-edit-result" role="status"></div></details>`;}
function bindQuickEdit(){
  document.getElementById('quick-edit-preview').onclick=()=>{
    const proposal=parseQuickEdit(document.getElementById('quick-edit-text').value),result=document.getElementById('quick-edit-result');
    if(!proposal){result.textContent='Skús napr. „Nastav pauzu na 90 sekúnd“, „Série 3“ alebo „Váha 20 kg“.';return;}
    const inputs=[...document.querySelectorAll(`[data-plan-field="${proposal.field}"]`)];
    result.innerHTML=`<p>${h(proposal.label)} → ${h(proposal.value)} · ${inputs.length} cvikov. Zmena sa pripraví v editore; následne uložíš celú jednotku.</p><button class="quick-edit-button" id="quick-edit-apply">Vyplniť polia</button>`;
    document.getElementById('quick-edit-apply').onclick=()=>{document.getElementById('bulk-field').value=proposal.field;document.getElementById('bulk-value').value=proposal.value;document.getElementById('bulk-apply').click();result.textContent='Polia sú vyplnené. Pred uložením ich môžeš vrátiť cez Hromadná úprava cvikov.';};
  };
}
