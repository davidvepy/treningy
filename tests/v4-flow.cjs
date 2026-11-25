const fs=require('fs'),assert=require('assert/strict'),{chromium,webkit}=require('playwright'),plans=require('./fixtures/abc-v4.json');
(async()=>{
 const browser=process.env.TEST_WEBKIT?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROME_PATH});
 // WebKit covers the Safari engine when installed; Chrome covers desktop and narrow iPhone layouts.
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 fs.writeFileSync('/tmp/trening-v4.html','<!doctype html><div id="app"></div><div id="toast-root"></div>');await page.goto('file:///tmp/trening-v4.html');
 const common={owner_id:'test',client_id:'david',plan_id:'test-plan'};
 let db={trainer_hub_plans:[{...common,id:'test-plan',payload:{status:'active',trainingBlock:{reviewFrom:'2027-01-06',reviewBy:'2027-01-20'}}}],trainer_hub_workouts:plans.map((w,i)=>({...common,id:w.id,ordinal:i+1,payload:w.payload})),trainer_hub_workout_exercises:plans.flatMap(w=>w.exercises.map(e=>({...common,...e,workout_id:w.id}))),trainer_hub_workout_sessions:[],trainer_hub_session_exercises:[],trainer_hub_workout_sets:[]};
 async function install(){
  for(const f of ['styles.css','plan-editor.css','mobile.css'])await page.addStyleTag({content:fs.readFileSync(f,'utf8')});
  for(const f of ['core.js','sync.js','supersets.js','program-review.js','attendance.js','session-meta.js','training.js','history.js','volume.js','progress.js','measurement-fix.js','profile.js','plan-editor.js','status-fix.js','history-tonnage-fix.js','quick-edit.js','progression.js','mobile.js'])await page.addScriptTag({content:fs.readFileSync(f,'utf8')});
  await page.evaluate(db=>{
   window.testDatabase=db;window.testNetwork=true;state.user={id:'test'};supabase.auth.getSession=async()=>({data:{session:{user:state.user}}});state.loading=false;window.__showBootError=m=>{throw Error(m);};
   supabase.from=table=>{let method='select',body,filters=[];const q={select(){return q;},order(){return q;},limit(){return q;},range(){return q;},eq(k,v){filters.push([k,v]);return q;},insert(v){method='insert';body=v;return q;},update(v){method='update';body=v;return q;},delete(){method='delete';return q;},then(resolve,reject){if(!testNetwork)return Promise.resolve({error:{message:'offline'}}).then(resolve,reject);const rows=testDatabase[table]||=[];let matched=rows.filter(r=>filters.every(([k,v])=>r[k]===v));if(method==='insert'){matched=structuredClone(Array.isArray(body)?body:[body]);rows.push(...matched);}if(method==='update')matched.forEach(r=>Object.assign(r,structuredClone(body)));if(method==='delete')testDatabase[table]=rows.filter(r=>!matched.includes(r));return Promise.resolve({data:structuredClone(matched),error:null}).then(resolve,reject);}};return q;};
  },db);await page.evaluate(()=>loadCore(false));
 }
 await install();
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:844});
  for(const w of plans){
   await page.evaluate(async id=>{await startWorkout(id,state.workouts.find(w=>w.id===id));renderActive();},w.id);
   assert.equal(await page.locator('[data-ramp]').count(),8);
   // First RAMP tick survives an offline reload using the local draft.
   await page.evaluate(()=>{testNetwork=false;});await page.locator('[data-ramp]').first().check();
   db=await page.evaluate(()=>testDatabase);await page.reload();await install();await page.evaluate(()=>renderActive());assert.equal(await page.locator('[data-ramp]').first().isChecked(),true);
   await page.evaluate(()=>{testNetwork=true;});
   for(const box of await page.locator('[data-ramp]').all())await box.check();
   assert.equal(await page.locator('.ramp-card').getAttribute('open'),null);await page.evaluate(()=>flushRampChecks());
   // Save one set, reload the whole page and confirm next set and rest persist.
   await page.evaluate(async()=>{const id=nextIncompleteSet().set_id;await saveSetField(id,'rir','2');await toggleSetComplete(id);if(!await flushWorkoutChanges())throw Error('Flush failed');});
   const expectedNext=await page.evaluate(()=>nextIncompleteSet().set_id),restBefore=await page.evaluate(()=>timerRemaining());db=await page.evaluate(()=>testDatabase);await page.reload();await install();await page.evaluate(()=>renderActive());assert.equal(await page.evaluate(()=>nextIncompleteSet().set_id),expectedNext);if(restBefore>0)assert(Math.abs((await page.evaluate(()=>timerRemaining()))-restBefore)<10);
   assert.equal(await page.locator('[data-ramp]:checked').count(),8);
   const steps=await page.evaluate(async()=>{let count=0;while(nextIncompleteSet()){const entry=nextIncompleteSet(),row=state.activeSets.find(s=>s.id===entry.set_id);await saveSetField(row.id,'rir','2');await toggleSetComplete(row.id);const expected=entry.roundEnd&&entry.round<entry.rounds-1?entry.restSeconds:0;if(expected===0&&state.timer)throw Error('Unexpected rest '+entry.set_id);if(expected>0&&Math.abs(timerRemaining()-expected)>1)throw Error('Wrong rest '+entry.set_id);skipRest();if(++count>200)throw Error('Loop');}if(!await flushWorkoutChanges())throw Error('Save failed');return count;});assert(steps>15);
   assert.equal(await page.evaluate(()=>state.timer),null);
   assert.equal(await page.evaluate(()=>sessionStats(state.activeSession.id).workingSets),w.exercises.reduce((sum,e)=>sum+e.payload.sets,0));
   assert.equal(await page.locator('.active-content .tolerance-note,.active-content .exercise-side-hint,.active-content img,.active-content video').count(),0);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Active overflow '+width);
   await page.screenshot({path:`/tmp/trening-v4-${w.id}-${width}.png`,fullPage:true});
   await page.evaluate(()=>finishWorkoutV33());assert.equal(await page.evaluate(()=>state.activeSession),null);db=await page.evaluate(()=>testDatabase);
  }
 }
 // All non-strength activities get independent persistent marks, even on a shared day.
 await page.evaluate(()=>{for(const [i,type]of ['Thai box','Hokej','Beh','Zone 2','Mobilita','Regenerácia','Vlastná aktivita'].entries()){const w={owner_id:'test',client_id:'david',plan_id:'test-plan',id:'activity'+i,ordinal:i+4,payload:{type,title:type,days:[i===1?5:4]}};state.workouts.push(w);testDatabase.trainer_hub_workouts.push(structuredClone(w));}renderTraining();});
 assert.equal(await page.locator('.program-review').count(),0);
 for(const button of await page.locator('[data-attendance]').all()){await button.click();} // DOM re-render requires fresh locators below.
 db=await page.evaluate(()=>testDatabase);await page.reload();await install();await page.evaluate(()=>renderTraining());
 assert.equal(await page.locator('[data-attendance][aria-pressed="true"]').count(),7);
 const rowsBefore=await page.evaluate(()=>testDatabase.trainer_hub_workout_sessions.length);
 await page.locator('[data-attendance]').first().click();assert.equal(await page.locator('[data-attendance][aria-pressed="true"]').count(),6);
 await page.locator('[data-attendance]').first().click();assert.equal(await page.evaluate(()=>testDatabase.trainer_hub_workout_sessions.length),rowsBefore);
 await page.evaluate(()=>{state.progressTab='review';renderProgress();});assert.equal(await page.locator('.program-review').count(),1);
 assert.deepEqual(errors,[]);await browser.close();console.log('A/B/C complete on mobile and desktop; RAMP/offline reload, sets, pairs/triples, timers, history and all activity marks passed.');
})().catch(e=>{console.error(e);process.exit(1)});
