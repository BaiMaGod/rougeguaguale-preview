import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS} from '../build/idiom/config.js';
import {newGame,purchaseTicket,settleActive,serializeGame,restoreGame,loadGame,upgradeTech,recoveryCash,SAVE_KEY} from '../build/idiom/wallet.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {resolveTicket,revealCell,cashOut} from '../build/idiom/resolver.js';
import {MILESTONES,TECHS,COSTS,awardMilestones,restoreProgression} from '../build/idiom/growth.js';
import {newRunBuild,offerDraft,publicSafeIndex,validBoost} from '../build/idiom/run-build.js';
import {rebirthPreview,performRebirth,chooseRunBoost} from '../build/idiom/rebirth.js';
import {buyMachine,configureMachine,enqueueMachine,startMachine,advanceMachine,pauseMachine,defaultPolicy} from '../build/idiom/machine.js';
import {machineOrder} from '../build/idiom/machine-state.js';
function eligible(seed='rebirth'){
 const stats=Object.fromEntries(CARDS.slice(0,4).map(c=>[c.id,{played:3,won:0,best:0n}]));
 let s={...newGame(seed),cash:1000n,peak:1000n,bought:12,unlockedCount:4,stats,runStats:structuredClone(stats)};
 return {...s,progression:awardMilestones(s.progression,4,s.peak,stats)};
}
function stocked(id,seed='stock',level=0){
 for(let attempt=0;attempt<100;attempt++){
  let s={...newGame(seed+':'+attempt),cash:10000000000000n,peak:10000000000000n,unlockedCount:18,bought:3,stats:{T01:{played:3,won:0,best:0n}},runStats:{T01:{played:3,won:0,best:0n}}};
  s={...s,runBuild:offerDraft(s.runBuild,s.runSeed,s.peak,3)};let selected=false;
  while(s.runBuild.pending){const choice=!selected&&s.runBuild.pending.options.includes(id)?id:null;if(choice)selected=true;s=chooseRunBoost(s,choice);}
  if(selected){if(level){const earned=MILESTONES.reduce((sum,m)=>sum+m.points,0);s.progression={points:earned-4*COSTS.slice(0,level).reduce((a,b)=>a+b,0),earned,levels:Object.fromEntries(TECHS.map(t=>[t,level])),claimed:MILESTONES.map(m=>m.id)};}return s;}
 }throw Error('stock fixture');
}
function finish(s,order){let t=s.active;for(const i of order??machineOrder(t.cardId,t.nonce,defaultPolicy())){if(resolveTicket(t).status!=='playing')break;t=revealCell(t,i);if(t.cardId==='T11'&&t.revealed.length>=3&&resolveTicket(t).status==='playing')t=cashOut(t);}return settleActive({...s,active:t});}
function skip(s){while(s.runBuild.pending)s=chooseRunBoost(s,null);return s;}
test('转生门槛按本局卡阶、峰值与结算张数，历史便宜票不代替本局进度',()=>{
 const s=eligible();assert.equal(rebirthPreview(s).eligible,true);assert.equal(rebirthPreview(s).gain,8);
 for(const patch of [{unlockedCount:3},{peak:999n,cash:999n},{runStats:{}},{runStats:{T01:{played:11,won:0,best:0n}}}])assert.equal(rebirthPreview({...s,...patch}).eligible,false);
 assert.equal(rebirthPreview({...newGame('cheap'),stats:{T01:{played:100000,won:1000,best:10n}},peak:1000n}).eligible,false);
});
test('转生预览变更、机器运行和重复确认不能重复领点',()=>{
 let s=eligible();s=buyMachine(buyMachine(s));s=enqueueMachine(s,'T01');const q=rebirthPreview(s);
 assert.throws(()=>performRebirth({...s,cash:s.cash-1n},q.token));assert.throws(()=>performRebirth(startMachine(s),q.token));
 const after=performRebirth(s,q.token);assert.throws(()=>performRebirth(after,q.token));assert.equal(after.progression.earned-s.progression.earned,8);assert.equal(after.rebirth.totalPoints,8);
 assert.deepEqual(restoreGame(serializeGame(after)),after);
});
test('付费票明确作废，机器队列与本局强化重置；科技、图鉴、账本和历史保留',()=>{
 let s=eligible('reset');s=upgradeTech(s,'bonus');s=buyMachine(buyMachine(s));s={...s,lastRecovery:123456,history:[{nonce:'old:1',cardId:'T01',prize:0n,status:'lost'}]};
 s={...s,runBuild:offerDraft(s.runBuild,s.runSeed,s.peak,12)};s=chooseRunBoost(s,'hands');s=skip(s);
 s=advanceMachine(startMachine(enqueueMachine(s,'T01',2)),100);s=pauseMachine(s);const active=s.active;
 const after=performRebirth(s,rebirthPreview(s).token);assert.equal(after.cash,60n);assert.equal(after.peak,60n);assert.equal(after.unlockedCount,1);assert.equal(after.bought,0);assert.equal(after.active,null);
 assert.deepEqual(after.runStats,{});assert.deepEqual(after.runBuild,newRunBuild());assert.equal(after.machine.level,0);assert.deepEqual(after.machine.queue,[]);
 assert.deepEqual(after.progression.levels,s.progression.levels);assert.deepEqual(after.progression.claimed,s.progression.claimed);assert.deepEqual(after.stats,s.stats);assert.deepEqual(after.history,s.history);assert.equal(after.lastRecovery,123456);
 assert.equal(after.rebirth.automationUnlocked,true);assert.equal(after.rebirth.bestTier,4);assert.equal(after.rebirth.records[0].discarded,active.nonce);
 assert.notEqual(after.runSeed,s.runSeed);assert.deepEqual(restoreGame(serializeGame(after)),after);
});
test('首次转生奖励只领一次，再达标只给小额基础奖励；历史统计不提前解锁新局',()=>{
 const before=eligible('repeat'),first=performRebirth(before,rebirthPreview(before).token);
 const secondReady={...first,cash:1000n,peak:1000n,unlockedCount:4,runStats:structuredClone(before.runStats),bought:12};
 const second=performRebirth(secondReady,rebirthPreview(secondReady).token);assert.equal(second.rebirth.records[0].gain,2);assert.equal(second.rebirth.totalPoints,10);assert.equal(second.progression.rebirthEarned,10);
 let fresh={...second,cash:1000n,peak:1000n};fresh=finish(purchaseTicket(fresh,'T01'));assert.equal(fresh.unlockedCount,1);assert.equal(fresh.runStats.T01.played,1);
 for(let i=0;i<2;i++)fresh=finish(purchaseTicket(fresh,'T01'));assert.equal(fresh.unlockedCount,2);assert.equal(fresh.runBuild.pending.event,'start');
 assert.deepEqual(restoreProgression(second.progression),second.progression);
});
test('恢复金不能绕过转生门槛，重开保留恢复金冷却',()=>{
 const s={...performRebirth(eligible('cooldown'),rebirthPreview(eligible('cooldown')).token),cash:0n,lastRecovery:100000};
 assert.throws(()=>recoveryCash(s,110000));assert.equal(recoveryCash(s,160000).cash,20n);assert.equal(rebirthPreview(recoveryCash(s,160000)).eligible,false);
});
test('自动化权限永久保留，下局初级机可用；未解锁与未购机不能伪造权限',()=>{
 let s=eligible('permission');s=buyMachine(buyMachine(s));s=performRebirth(s,rebirthPreview(s).token);s=buyMachine(s);
 s=configureMachine(s,{autoBuy:true,autoClaim:true,repeatCard:'T01',policy:defaultPolicy(),reserve:2n,budget:4n,limit:2});assert.equal(s.machine.level,1);assert.deepEqual(restoreGame(serializeGame(s)).machine,s.machine);
 assert.throws(()=>configureMachine(buyMachine(newGame('locked')),{...s.machine}));
 const raw=JSON.parse(serializeGame(s));raw.rebirth.automationUnlocked=false;assert.throws(()=>restoreGame(JSON.stringify(raw)));
});
test('31/32/33存档迁移保留原票、成长、付费队列与自动化权限，并备份机器旧档',()=>{
 let s={...newGame('migration'),cash:10000n,peak:10000n};s=buyMachine(buyMachine(s));s=advanceMachine(startMachine(enqueueMachine(s,'T01')),300);const old={...s,version:33};delete old.runStats;delete old.runBuild;delete old.rebirth;
 const raw=serializeGame(old),map=new Map([[SAVE_KEY,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const migrated=loadGame(storage,'unused').state;assert.equal(migrated.version,34);assert.equal(migrated.machine.running,false);assert.deepEqual(migrated.active,s.active);assert.deepEqual(migrated.machine.job,s.machine.job);assert.equal(migrated.rebirth.automationUnlocked,true);assert.equal(map.get('idiom-v33-machine-backup'),raw);
 assert.deepEqual(migrated.progression,s.progression);assert.equal(migrated.cash,s.cash);
});
test('损坏账本、强化候选、库存与安全提示不能恢复，原文本不被覆盖',()=>{
 let s=performRebirth(eligible('integrity'),rebirthPreview(eligible('integrity')).token);
 for(const mutate of [r=>r.rebirth.totalPoints++,r=>r.progression.rebirthEarned++,r=>r.rebirth.records[0].gain++,r=>r.rebirth.claimed.push('tier:18'),r=>r.runBuild.stocks=[{id:'hands',used:0}],r=>r.runStats={T01:{played:3,won:0,best:'0'}}]){const r=JSON.parse(serializeGame(s));mutate(r);assert.throws(()=>restoreGame(JSON.stringify(r)));}
 s=stocked('hint','safe-integrity');s=purchaseTicket(s,'T09');const r=JSON.parse(serializeGame(s));r.active.publicSafeIndex=(r.active.publicSafeIndex+1)%10;assert.throws(()=>restoreGame(JSON.stringify(r)));
 const early=JSON.parse(serializeGame(s));early.cash=early.peak='999';assert.throws(()=>restoreGame(JSON.stringify(early)));
 const uncharged=JSON.parse(serializeGame(s));uncharged.bought=3;assert.throws(()=>restoreGame(JSON.stringify(uncharged)));
 const broken='{"version":34}',map=new Map([[SAVE_KEY,broken]]);assert.throws(()=>loadGame({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},'unused'));assert.equal(map.get(SAVE_KEY),broken);
});
test('三选一在第3张结算触发，刷新候选不变；选择和跳过各只能完成一次',()=>{
 let s={...newGame('draft'),cash:100n,peak:100n};for(let i=0;i<3;i++)s=finish(purchaseTicket(s,'T01'));
 const p=s.runBuild.pending;assert.equal(p.options.length,3);assert.deepEqual(new Set(p.options),new Set(['hands','lucky','rise']));assert.deepEqual(restoreGame(serializeGame(s)).runBuild.pending,p);
 assert.throws(()=>purchaseTicket(s,'T01'));assert.throws(()=>chooseRunBoost(s,'hint'));const chosen=chooseRunBoost(s,p.options[0]);assert.equal(chosen.runBuild.stocks[0].used,0);assert.equal(chosen.runBuild.pending,null);assert.throws(()=>chooseRunBoost(chosen,p.options[1]));
 const skipped=chooseRunBoost(s,null);assert.equal(skipped.runBuild.stocks.length,0);assert.deepEqual(skipped.runBuild.claimed,['start']);assert.deepEqual(restoreGame(serializeGame(skipped)).runBuild,skipped.runBuild);
});
test('强化只影响购票后的3张兼容卡；旧票冻结且不匹配的卡不消耗次数',()=>{
 let s=stocked('lucky','charges');const old=purchaseTicket(newGame('old'),'T01').active;const withOld={...s,active:old};assert.deepEqual(withOld.active,old);
 s=finish(purchaseTicket(s,'T02'));assert.equal(s.runBuild.stocks[0].used,0);
 for(let n=0;n<3;n++){s=purchaseTicket(s,'T04');assert.equal(s.active.boost,'lucky');assert.equal(s.runBuild.stocks[0].used,n+1);assert.deepEqual(restoreGame(serializeGame(s)).active,s.active);s=finish(s);}
 s=purchaseTicket(s,'T04');assert.equal(s.active.boost,undefined);assert.deepEqual(s.active,createIdiomTicket('T04',s.active.rngSeed,s.active.nonce,s.active.growth));
});
test('幸运数字在开票时+2，能改变临界对局，隐藏布局后续不更换',()=>{
 let changed=0;for(let n=0;n<200;n++){const base=createIdiomTicket('T04','lucky'+n,'n'+n),boost=createIdiomTicket('T04','lucky'+n,'n'+n,undefined,'lucky');
  assert.equal(Number(boost.committedLayout[0].value),Number(base.committedLayout[0].value)+2);assert.deepEqual(boost.committedLayout[1],base.committedLayout[1]);
  const a=revealCell(revealCell(base,0),1),b=revealCell(revealCell(boost,0),1);if(resolveTicket(a).status==='lost'&&resolveTicket(b).status==='won')changed++;
 }assert.ok(changed>0);
});
test('连升三级翻倍但每票封顶3000；终极头奖和恶魔规则不能应用强化',()=>{
 for(const level of [0,5,10])for(let n=0;n<100;n++){const t=createIdiomTicket('T05','rise'+n,'n'+n,Object.fromEntries(TECHS.map(k=>[k,level])),'rise');let p=t;for(const i of [0,1,2])p=revealCell(p,i);const r=resolveTicket(p);assert.ok(r.prize<=3000n);if(r.status==='won')assert.equal(r.prize,3000n);}
 for(const card of ['T15','T16','T17','T18'])for(const id of ['lucky','rise','hint','guard','hands'])assert.throws(()=>createIdiomTicket(card,'forbidden','n',undefined,id));assert.throws(()=>validBoost('hands','T00'));
});
test('排雷专家只公开一格，四雷不变，仍需三次安全选择且刷新不重置提示',()=>{
 const s=purchaseTicket(stocked('hint','information'),'T09'),t=s.active,index=publicSafeIndex(t);assert.equal(t.committedLayout[index].kind,'safe');assert.equal(t.committedLayout.filter(c=>c.kind==='bomb').length,4);
 const one=revealCell(t,index);assert.equal(resolveTicket(one).status,'playing');assert.equal(one.revealed.length,1);assert.equal(publicSafeIndex(restoreGame(serializeGame({...s,active:one})).active),index);
 const bomb=t.committedLayout.findIndex(c=>c.kind==='bomb');assert.equal(resolveTicket(revealCell(one,bomb)).status,'lost');
});
test('保命符只保住首次雷前可见累积额并终止本票；第一格雷仍无奖',()=>{
 let found=false;for(let n=0;n<1000;n++){let t=createIdiomTicket('T11','guard'+n,'n'+n,undefined,'guard');if(t.committedLayout[0].kind==='money'&&t.committedLayout[1].kind==='bomb'){t=revealCell(revealCell(t,0),1);assert.equal(resolveTicket(t).prize,100000n);assert.equal(resolveTicket(t).status,'won');assert.throws(()=>revealCell(t,2));found=true;break;}}assert.equal(found,true);
 let foundFirst=false;for(let n=0;n<100;n++){let t=createIdiomTicket('T11','first-bomb'+n,'n'+n,undefined,'guard');if(t.committedLayout[0].kind==='bomb'){t=revealCell(t,0);assert.equal(resolveTicket(t).prize,0n);assert.equal(resolveTicket(t).status,'lost');foundFirst=true;break;}}assert.equal(foundFirst,true);
});
test('双手开工只扣手刮次数，结算一次授予一次加速；机器起票用一次且刷新不退还',()=>{
 let s=stocked('hands','speed');s=finish(purchaseTicket(s,'T01'));assert.equal(s.runBuild.speedCredits,1);assert.equal(settleActive(s).runBuild.speedCredits,1);
 s=buyMachine(buyMachine(s));s=configureMachine(s,{autoBuy:false,autoClaim:true,repeatCard:'T01',policy:defaultPolicy(),reserve:0n,budget:10n,limit:5});s=advanceMachine(startMachine(enqueueMachine(s,'T01')),100);
 assert.equal(s.active.boost,undefined);assert.equal(s.runBuild.stocks[0].used,1);assert.equal(s.machine.job.elapsedMs,600);assert.equal(s.runBuild.speedCredits,0);
 const restored=restoreGame(serializeGame(s));const resumed=advanceMachine(startMachine(restored),100);assert.equal(resumed.machine.job.elapsedMs,700);assert.equal(resumed.runBuild.speedCredits,0);
});
for(const [id,card] of [['lucky','T04'],['rise','T05'],['hint','T09'],['guard','T11']])test(id+' 强化手刮与机器同选择一致，基础/中/满级成长均可恢复',()=>{
 for(const level of [0,5,10])for(let n=0;n<30;n++){let s=stocked(id,'parity'+id+n,level);s=buyMachine(buyMachine(buyMachine(buyMachine(s))));s=configureMachine(s,{autoBuy:false,autoClaim:true,repeatCard:card,policy:defaultPolicy(),reserve:0n,budget:10000000n,limit:5});
  const manual=finish(purchaseTicket(s,card));let auto=startMachine(enqueueMachine(s,card));for(let n=0;n<8;n++)auto=advanceMachine(auto,100);
  assert.equal(auto.machine.processed,1);assert.equal(auto.cash,manual.cash);assert.deepEqual(auto.active,manual.active);assert.deepEqual(auto.progression,manual.progression);assert.deepEqual(restoreGame(serializeGame(auto)).active,auto.active);
 }
});
test('机器第3张结算后暂停等待三选一，预算与未付队列不变，选择后可继续',()=>{
 let s={...newGame('machine-draft'),cash:1000n,peak:1000n};for(let n=0;n<4;n++)s=buyMachine(s={...s,cash:10000n,peak:10000n});
 s=configureMachine(s,{autoBuy:false,autoClaim:true,repeatCard:'T01',policy:defaultPolicy(),reserve:0n,budget:20n,limit:10});s=startMachine(enqueueMachine(s,'T01',5));
 for(let n=0;n<24;n++)s=advanceMachine(s,100);assert.equal(s.machine.processed,3);assert.equal(s.machine.running,false);assert.equal(s.machine.sessionSpent,6n);assert.equal(s.machine.queue.length,2);assert.equal(s.runBuild.pending.event,'start');
 const unchanged=advanceMachine(s,1000);assert.equal(unchanged,s);s=skip(s);s=startMachine(s);for(let n=0;n<16;n++)s=advanceMachine(s,100);assert.equal(s.machine.processed,5);assert.equal(s.machine.sessionSpent,10n);
});
