const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('progression.js','utf8'),ctx);
const p={progressionEnabled:true,progressionStep:1,sets:3,repMax:12,rirMin:2};
function previous(){return{source:'normalized',timestamp:10,session:{payload:{}},sets:[0,1,2].map((_,i)=>({complete:true,set_type:'working',weight:20,reps:12,rir:i===2?2:null}))};}
test('eligible completed workout proposes configured step',()=>assert.equal(ctx.evaluateProgression(p,previous()).weight,21));
test('suggestions require explicit opt-in and final-set RIR',()=>{assert.equal(ctx.evaluateProgression({...p,progressionEnabled:false},previous()),null);const x=previous();x.sets[2].rir=null;assert.equal(ctx.evaluateProgression(p,x),null);});
test('partial, mixed weights and missing sets never propose progression',()=>{for(const change of [x=>x.session.payload.partial=true,x=>x.sets.pop(),x=>x.sets[1].weight=18,x=>x.sets[0].reps=11,x=>x.sets[2].rir=1]){const x=previous();change(x);assert.equal(ctx.evaluateProgression(p,x),null);}});
test('manual changes after workout suppress suggestion',()=>assert.equal(ctx.evaluateProgression({...p,weightUpdatedAt:new Date(20).toISOString()},previous()),null));
