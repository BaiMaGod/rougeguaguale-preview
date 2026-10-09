import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../build/idiom/config.js';
import {newGame,purchaseTicket,settleActive,scratchCell,serializeGame,restoreGame,loadGame,upgradeTech,SAVE_KEY} from '../build/idiom/wallet.js';
import {TECHS,MILESTONES,COSTS} from '../build/idiom/growth.js';
import {resolveTicket,revealCell,cashOut} from '../build/idiom/resolver.js';
import {machineOrder,defaultPolicy} from '../build/idiom/machine-state.js';
import {buyMachine,configureMachine,enqueueMachine,clearMachineQueue,pauseMachine,resetMachineSession,startMachine,advanceMachine,claimMachine,MACHINE_LEVELS} from '../build/idiom/machine.js';
function setup(seed='machine',level=2){let s={...newGame(seed),cash:10000000000000n,peak:10000000000000n,unlockedCount:18};for(let i=0;i<level;i++)s=buyMachine(s);
 return configureMachine(s,{autoBuy:false,autoClaim:level>=2,repeatCard:'T01',policy:defaultPolicy(),reserve:0n,budget:1000000000000n,limit:100});}
function finishManual(s,id,policy){s=purchaseTicket(s,id);let t=s.active;const order=machineOrder(id,t.nonce,policy);
 for(const i of order){if(resolveTicket(t).status!=='playing')break;t=revealCell(t,i);const r=resolveTicket(t);
  if(id==='T11'&&r.status==='playing'&&(t.revealed.length>=policy.steps||policy.cashoutMode==='target'&&r.accrued>=policy.target))t=cashOut(t);}
 return settleActive({...s,active:t});
}
function runOne(s){const processed=s.machine.processed;s=startMachine(s);
 for(let i=0;i<100;i++){s=advanceMachine(s,100);if(s.machine.processed>processed||s.machine.job?.elapsedMs===MACHINE_LEVELS[s.machine.level].ms&&!s.machine.running)break;}return s;
}
for(const def of CARDS.filter(c=>c.id!=='T18'))test(def.id+' 自动与手刮同种子、同选择、同结算',()=>{
 const outcomes=new Set();for(let n=0;n<10000&&(n<30||outcomes.size<2);n++){
  const before=setup('parity-'+def.id+n,4),manual=finishManual(before,def.id,before.machine.policy),auto=runOne(enqueueMachine(before,def.id));
  assert.equal(auto.machine.processed,1);assert.equal(auto.cash,manual.cash);assert.deepEqual(auto.active,manual.active);
  assert.deepEqual(auto.stats,manual.stats);assert.deepEqual(auto.progression,manual.progression);assert.deepEqual(auto.history,manual.history);
  assert.equal(auto.machine.totalSpent,def.price);assert.equal(auto.machine.totalWon,auto.history[0].prize);
  outcomes.add(auto.history[0].status);
 }
 assert.deepEqual(outcomes,new Set(['won','lost']));
});
test('四级售价、队列容量、处理时长与初级权限',()=>{
 let s={...newGame('levels'),cash:10000n,peak:10000n};
 for(let l=1;l<=4;l++){const cash=s.cash;s=buyMachine(s);assert.equal(cash-s.cash,MACHINE_LEVELS[l].cost);
  s=enqueueMachine(s,'T01',MACHINE_LEVELS[l].capacity);assert.throws(()=>enqueueMachine(s,'T01'));s=clearMachineQueue(s);}
 assert.throws(()=>buyMachine(s));assert.equal(s.machine.investment,3350n);
 const first=setup('first',1);assert.throws(()=>configureMachine(first,{...first.machine,autoBuy:true}));assert.throws(()=>configureMachine(first,{...first.machine,autoClaim:true}));
 for(let l=1;l<=4;l++){
  const start=setup('duration',l),s=startMachine(enqueueMachine(start,'T01'));let progressed=s;
  for(let ms=0;ms<MACHINE_LEVELS[l].ms-100;ms+=100)progressed=advanceMachine(progressed,100);
  assert.equal(progressed.machine.processed,0);progressed=advanceMachine(progressed,100);
  assert.ok(progressed.machine.processed===1||progressed.machine.job.elapsedMs===MACHINE_LEVELS[l].ms);
 }
});
test('永久成长与自动结算一致，处理中的票保留购买时科技快照',()=>{
 const earned=MILESTONES.reduce((sum,m)=>sum+m.points,0);
 for(const level of [5,10])for(const def of CARDS.filter(c=>c.id!=='T18'))for(let n=0;n<20;n++){
  const before={...setup('grown-'+level+def.id+n,4),progression:{points:earned-4*COSTS.slice(0,level).reduce((sum,c)=>sum+c,0),earned,levels:Object.fromEntries(TECHS.map(t=>[t,level])),claimed:MILESTONES.map(m=>m.id)}};
  const manual=finishManual(before,def.id,before.machine.policy),auto=runOne(enqueueMachine(before,def.id));
  assert.equal(auto.cash,manual.cash);assert.deepEqual(auto.active,manual.active);assert.deepEqual(auto.progression,manual.progression);
 }
 let s=setup('upgrade-during-job',4);s={...s,progression:{points:earned,earned,levels:Object.fromEntries(TECHS.map(t=>[t,0])),claimed:MILESTONES.map(m=>m.id)}};
 s=advanceMachine(startMachine(enqueueMachine(s,'T01',2)),100);const ticket=s.active;
 s=upgradeTech(s,'bonus');assert.deepEqual(s.active,ticket);
 for(let n=0;n<16;n++)s=advanceMachine(s,100);assert.equal(s.machine.processed,2);assert.equal(s.active.growth.bonus,1);
});
test('有未完成手刮票时不能启动或购票，机器升级不会改动该票',()=>{
 const manual=purchaseTicket(setup('manual-first'),'T01'),queued=enqueueMachine(manual,'T01');
 assert.throws(()=>startMachine(queued));assert.deepEqual(buyMachine(queued).active,manual.active);
 const protectedState=advanceMachine({...queued,machine:{...queued.machine,running:true}},100);
 assert.equal(protectedState.machine.running,false);assert.equal(protectedState.cash,queued.cash);assert.deepEqual(protectedState.active,queued.active);
});
test('预算、保留线、购票张数分别阻止多扣费，中奖不能重置预算',()=>{
 const base=setup('caps');
 for(const [patch,expected] of [[{budget:1n},'预算'],[{reserve:base.cash-1n},'保留线']]){
  const s=advanceMachine(startMachine(enqueueMachine(configureMachine(base,{...base.machine,...patch}),'T01')),100);
  assert.equal(s.cash,base.cash);assert.equal(s.bought,0);assert.equal(s.machine.queue.length,1);assert.equal(s.machine.running,false);assert.match(s.machine.message,new RegExp(expected));
 }
 let s=configureMachine(base,{...base.machine,autoBuy:true,budget:6n,limit:3});s=startMachine(s);
 for(let i=0;i<130;i++)s=advanceMachine(s,100);assert.equal(s.machine.purchased,3);assert.equal(s.machine.sessionSpent,6n);assert.equal(s.machine.running,false);
 assert.equal(s.machine.totalWon,s.machine.log.reduce((sum,r)=>sum+r.prize,0n));assert.throws(()=>configureMachine(s,{...s.machine,budget:5n}));
 const reset=resetMachineSession(s);assert.equal(reset.machine.sessionSpent,0n);assert.equal(reset.machine.totalSpent,6n);
});
test('暂停不推进，清队列只取消待购任务，已购票不会退款',()=>{
 let s=startMachine(enqueueMachine(setup('pause'), 'T01',3));s=advanceMachine(s,1000);const cash=s.cash,t=s.active,j=s.machine.job;
 s=clearMachineQueue(pauseMachine(s));assert.equal(s.cash,cash);assert.equal(s.active,t);assert.deepEqual(s.machine.job,j);assert.equal(s.machine.queue.length,0);
 assert.deepEqual(advanceMachine(s,1000),s);assert.throws(()=>resetMachineSession(s));assert.throws(()=>buyMachine(s));
 assert.throws(()=>purchaseTicket(s,'T01'));assert.throws(()=>scratchCell(s,0));assert.throws(()=>settleActive(s));
 s=startMachine(s);for(let i=0;i<50;i++)s=advanceMachine(s,100);assert.equal(s.machine.processed,1);assert.equal(s.machine.purchased,1);
});
test('刷新保留原票、策略、扣款和进度，暂停恢复不重抽或重复领奖',()=>{
 let s=startMachine(enqueueMachine(setup('refresh',4),'T14',2));s=advanceMachine(s,300);
 const restored=restoreGame(serializeGame(s));assert.equal(restored.machine.running,false);assert.deepEqual(restored.active,s.active);assert.deepEqual(restored.machine.job,s.machine.job);assert.equal(restored.cash,s.cash);
 let resumed=startMachine(restored);for(let i=0;i<30;i++)resumed=advanceMachine(resumed,100);
 assert.equal(resumed.machine.processed,2);const stable=restoreGame(serializeGame(resumed));assert.deepEqual(advanceMachine(stable,1000),stable);assert.equal(stable.cash,resumed.cash);
});
test('初级机中奖等待人工领取；领取一次后继续且重复领取被拒绝',()=>{
 let s;for(let i=0;i<100;i++){s=runOne(enqueueMachine(setup('claim'+i,1),'T01',2));if(resolveTicket(s.active).status==='won')break;}
 assert.equal(s.machine.running,false);assert.equal(s.machine.processed,0);const prize=resolveTicket(s.active).prize,cash=s.cash;
 assert.throws(()=>startMachine(s));const paid=claimMachine(s);assert.equal(paid.cash,cash+prize);assert.equal(paid.machine.running,true);assert.equal(paid.machine.processed,1);
 assert.throws(()=>claimMachine(paid));
});
test('止盈只根据已揭晓金额，阈值与最大步数均受约束',()=>{
 for(const policy of [{...defaultPolicy(),cashoutMode:'target',target:100000n,steps:6},{...defaultPolicy(),steps:1},{...defaultPolicy(),steps:6}]){
  for(let i=0;i<50;i++){const before=configureMachine(setup('stop'+i,4),{...setup().machine,policy}),manual=finishManual(before,'T11',policy),auto=runOne(enqueueMachine(before,'T11'));
   assert.deepEqual(auto.active,manual.active);assert.equal(auto.cash,manual.cash);if(policy.target===100000n&&auto.history[0].prize)assert.equal(auto.active.revealed.length,1);}
 }
});
test('天梯随机或预设序列盲选，队列策略不随设置变化',()=>{
 const policy={...defaultPolicy(),ladderMode:'preset',gates:[4,2,1]},before=configureMachine(setup('gates',4),{...setup().machine,policy});
 let s=enqueueMachine(before,'T17');s=configureMachine(s,{...s.machine,policy:defaultPolicy()});s=startMachine(s);s=advanceMachine(s,100);
 assert.deepEqual(s.machine.job.order,[4,7,11]);assert.deepEqual(s.machine.job.policy.gates,[4,2,1]);
 const order=machineOrder('T17','same',defaultPolicy());assert.deepEqual(machineOrder('T17','same',defaultPolicy()),order);
 assert.throws(()=>configureMachine(before,{...before.machine,policy:{...policy,gates:[5,0,0]}}));
});
test('T18拒绝排队与自动补票；手动恶魔暂停机器并保留永久成长',()=>{
 const s=setup('risk',4);assert.throws(()=>enqueueMachine(s,'T18'));assert.throws(()=>configureMachine(s,{...s.machine,repeatCard:'T18'}));assert.throws(()=>machineOrder('T18','risk',defaultPolicy()));
 let devil;for(let i=0;i<100;i++){devil=purchaseTicket({...s,runSeed:'devil'+i},'T18',true);devil={...devil,active:revealCell(devil.active,0)};if(resolveTicket(devil.active).status==='bankrupt')break;}
 const paid=settleActive({...devil,machine:{...devil.machine,running:true}});assert.equal(paid.cash,0n);assert.equal(paid.machine.running,false);assert.deepEqual(paid.progression.levels,s.progression.levels);
});
test('旧成长档迁移、损坏机器记录被拒绝并保留原文本',()=>{
 const old={...newGame('migration'),version:32};delete old.machine;const raw=serializeGame(old),map=new Map([[SAVE_KEY,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const migrated=loadGame(storage,'unused').state;assert.equal(migrated.version,33);assert.equal(migrated.machine.level,0);assert.deepEqual(migrated.progression,old.progression);assert.equal(map.get('idiom-v32-growth-backup'),raw);
 const job=advanceMachine(startMachine(enqueueMachine(setup('corruption'),'T01')),100);
 for(const mutation of [r=>r.machine.job.nonce='wrong',r=>r.machine.job.order=[9],r=>r.machine.sessionSpent='99999999999999',r=>r.machine.job.elapsedMs=9999,r=>r.machine.repeatCard='T18',r=>r.machine.purchased=7]){
  const r=JSON.parse(serializeGame(job));mutation(r);assert.throws(()=>restoreGame(JSON.stringify(r)));
 }
 assert.throws(()=>advanceMachine(job,999999));assert.throws(()=>advanceMachine(job,-1));
});
