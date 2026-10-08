const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME_PATH?{executablePath:process.env.PLAYWRIGHT_CHROME_PATH}:{})});
 const page=await browser.newPage();
 fs.writeFileSync('/tmp/trening-layout.html','<!doctype html><title>Layout test</title>');
 await page.goto('file:///tmp/trening-layout.html');
 await page.setContent('<div id="app"></div><div id="toast-root"></div>');
 for(const file of ['styles.css','plan-editor.css','mobile.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
 for(const file of ['core.js','sync.js','training.js','history.js','progress.js','measurement-fix.js','profile.js','plan-editor.js','status-fix.js','history-tonnage-fix.js','quick-edit.js','progression.js','mobile.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{
 localStorage.clear();
 state.user={id:'test',email:'test@example.com'};state.loading=false;state.plan={id:'test-plan'};
 state.workouts=[{id:'test',ordinal:1,payload:{title:'Tréning A · prsia, ramená a triceps',type:'Silový tréning',days:[2],durationRange:'45–60 min',ramp:[{name:'Príprava',items:[{name:'Chôdza',dose:'5 min'}]}]}}];
 state.planExercises=['Low Incline Dumbbell Press','Cable Lateral Raise','Rope Triceps Pushdown'].map((name,i)=>({id:'e'+i,workout_id:'test',exercise_key:'e'+i,ordinal:i+1,payload:{name,englishName:name,sets:3,weight:20,repMin:8,repMax:12,restSeconds:90,rirMin:1,rirMax:2}}));
 });
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>{renderTraining();window.scrollTo(0,document.body.scrollHeight);renderWorkoutPreview('test');if(window.scrollY!==0)throw new Error('Preview retained previous scroll');});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error(`Preview overflows at ${width}`);
  if(width===390)await page.screenshot({path:'/tmp/trening-preview.png',fullPage:true});
  await page.evaluate(()=>renderStrengthUnitEditor('test'));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Editor overflows at ${width}`);
 }
 await page.evaluate(()=>{
  window.testNetwork=true;window.testDatabase={trainer_hub_workouts:structuredClone(state.workouts),trainer_hub_workout_exercises:structuredClone(state.planExercises),trainer_hub_exercises:[{id:'library-press',payload:{name:'Dumbbell Press',equipment:'dumbbell'}}]};
  supabase.auth.getSession=async()=>({data:{session:{user:state.user}}});
  supabase.from=table=>{
   let method='select',body,filters=[];const q={select(){return q;},order(){return q;},limit(){return q;},eq(k,v){filters.push([k,v]);return q;},insert(v){method='insert';body=v;return q;},update(v){method='update';body=v;return q;},delete(){method='delete';return q;},then(resolve,reject){
    if(!window.testNetwork)return Promise.resolve({data:null,error:{message:'offline'}}).then(resolve,reject);
    const rows=window.testDatabase[table]||=[];const matched=rows.filter(r=>filters.every(([k,v])=>r[k]===v));
    if(method==='insert')rows.push(...structuredClone(Array.isArray(body)?body:[body]));
    if(method==='update')matched.forEach(r=>Object.assign(r,structuredClone(body)));
    if(method==='delete')window.testDatabase[table]=rows.filter(r=>!matched.includes(r));
    return Promise.resolve({data:structuredClone(method==='select'?rows.filter(r=>filters.every(([k,v])=>r[k]===v)):matched),error:null}).then(resolve,reject);
   }};return q;
  };
  state.workouts.forEach(w=>Object.assign(w,{owner_id:'test',client_id:CLIENT_ID,plan_id:state.plan.id}));state.planExercises.forEach(e=>Object.assign(e,{owner_id:'test',client_id:CLIENT_ID,plan_id:state.plan.id}));
  renderStrengthUnitEditor('test');
 });
 await page.locator('.bulk-plan summary').click();await page.locator('#bulk-value').fill('120');await page.locator('#bulk-apply').click();
 if(await page.locator('[data-plan-field="restSeconds"]').first().inputValue()!=='120')throw new Error('Bulk edit failed');
 await page.locator('#bulk-undo').click();if(await page.locator('[data-plan-field="restSeconds"]').first().inputValue()!=='90')throw new Error('Undo failed');
 await page.locator('#unit-add-exercise').click();await page.locator('#library-search').fill('dumbbell');await page.locator('[data-library-id]').click();if(await page.locator('#plan-new-english').inputValue()!=='Dumbbell Press')throw new Error('Library selection failed');
 await page.evaluate(async()=>{renderWorkoutPreview('test');await duplicateWorkoutUnit(state.workouts[0]);if(state.workouts.length!==2||state.workouts[1].payload.days.length)throw new Error('Copy failed');});
 await page.evaluate(async()=>{await startWorkout('A',state.workouts[0]);renderActive();});
 for(const width of [320,375,390,430]){await page.setViewportSize({width,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Active workout overflows at ${width}`);}
 await page.evaluate(async()=>{window.testNetwork=false;const row=state.activeSets[0];await saveSetField(row.id,'weight','22');await currentSetQueue().flush();if(!currentSetQueue().items.length||row.weight!==22)throw new Error('Offline patch was lost');window.testNetwork=true;if(!(await flushWorkoutChanges()))throw new Error('Retry failed');if(currentSetQueue().items.length)throw new Error('Queue not drained');});
 await page.evaluate(()=>{renderHistory();renderProgress();renderProfile();});
 await browser.close();console.log('Preview and editor fit 320, 375, 390 and 430 px.');
})().catch(e=>{console.error(e);process.exit(1)});
