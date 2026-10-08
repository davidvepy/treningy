const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function fixture(){
  const elements=new Map();
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{isConnected:true,disabled:false});return elements.get(id);}};
  const w={id:'strength',payload:{title:'Tréning A',type:'Silový tréning'}};
  const context={document,state:{workouts:[w],activeSession:null},safeJson:x=>x||{},templateExercises:()=>[],h:String,icon:()=>'',workoutDaysLabel:()=>'',shell:x=>x,app:{},bindNav(){},updateUrl(hash){context.hash=hash;},openWorkoutUnitEditor(){},strengthLabelForWorkout:()=> 'A',async startWorkout(){context.starts++;},starts:0};
  vm.createContext(context);vm.runInContext(fs.readFileSync('mobile.js','utf8'),context);
  return {context,elements,w};
}
test('preview never starts a workout; explicit start creates it once',async()=>{
  const {context,elements}=fixture();context.renderWorkoutPreview('strength');assert.equal(context.starts,0);assert.match(context.app.innerHTML,/NÁHĽAD/);
  await elements.get('preview-start').onclick({currentTarget:elements.get('preview-start')});assert.equal(context.starts,1);
});
test('preview returns home without a write and handles missing workout',()=>{
  const {context,elements}=fixture();context.renderWorkoutPreview('strength');elements.get('preview-back').onclick();assert.equal(context.hash,'#/training');assert.equal(context.starts,0);
  context.renderWorkoutPreview('missing');assert.equal(context.hash,'#/training');
});
test('existing session remains intact when previewing another workout',async()=>{
  const {context,elements}=fixture();context.state.activeSession={id:'ongoing'};context.renderWorkoutPreview('strength');await elements.get('preview-start').onclick({currentTarget:elements.get('preview-start')});assert.equal(context.hash,'#/active');assert.equal(context.starts,0);assert.equal(context.state.activeSession.id,'ongoing');
});
test('routine preview opens logging explicitly without starting strength session',async()=>{
  const {context,elements,w}=fixture();w.payload.type='Mobilita';context.renderWorkoutPreview(w.id);await elements.get('preview-start').onclick({currentTarget:elements.get('preview-start')});assert.equal(context.hash,'#/routine/strength');assert.equal(context.starts,0);
});
test('home launch selects preview rather than creating a session',()=>{
  const {context}=fixture();vm.runInContext(fs.readFileSync('training.js','utf8'),context);context.launchWorkoutUnit({id:'home C'});assert.equal(context.hash,'#/preview/home%20C');assert.equal(context.starts,0);
});
