const fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME_PATH?{executablePath:process.env.PLAYWRIGHT_CHROME_PATH}:{})});
 const page=await browser.newPage();
 fs.writeFileSync('/tmp/trening-layout.html','<!doctype html><title>Layout test</title>');
 await page.goto('file:///tmp/trening-layout.html');
 await page.setContent('<div id="app"></div><div id="toast-root"></div>');
 for(const file of ['styles.css','plan-editor.css','mobile.css'])await page.addStyleTag({content:fs.readFileSync(file,'utf8')});
 for(const file of ['core.js','training.js','plan-editor.js','status-fix.js','mobile.js'])await page.addScriptTag({content:fs.readFileSync(file,'utf8')});
 await page.evaluate(()=>{
 state.user={id:'test',email:'test@example.com'};state.loading=false;state.plan={id:'test-plan'};
 state.workouts=[{id:'test',ordinal:1,payload:{title:'Tréning A · prsia, ramená a triceps',type:'Silový tréning',days:[2],durationRange:'45–60 min',ramp:[{name:'Príprava',items:[{name:'Chôdza',dose:'5 min'}]}]}}];
 state.planExercises=['Low Incline Dumbbell Press','Cable Lateral Raise','Rope Triceps Pushdown'].map((name,i)=>({id:'e'+i,workout_id:'test',exercise_key:'e'+i,ordinal:i+1,payload:{name,englishName:name,sets:3,weight:20,repMin:8,repMax:12,restSeconds:90,rirMin:1,rirMax:2}}));
 });
 for(const width of [320,375,390,430]){
  await page.setViewportSize({width,height:844});await page.evaluate(()=>renderWorkoutPreview('test'));
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);if(overflow)throw new Error(`Preview overflows at ${width}`);
  if(width===390)await page.screenshot({path:'/tmp/trening-preview.png',fullPage:true});
  await page.evaluate(()=>renderStrengthUnitEditor('test'));
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Editor overflows at ${width}`);
 }
 await browser.close();console.log('Preview and editor fit 320, 375, 390 and 430 px.');
})().catch(e=>{console.error(e);process.exit(1)});
