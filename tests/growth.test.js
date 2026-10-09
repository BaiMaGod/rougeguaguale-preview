import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,DESTINY_POOL} from '../build/idiom/config.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {resolveTicket,resolveBaseTicket,revealCell,cashOut} from '../build/idiom/resolver.js';
import {newGame,purchaseTicket,upgradeTech,settleActive,serializeGame,restoreGame,loadGame,SAVE_KEY} from '../build/idiom/wallet.js';
import {TECHS,MILESTONES,COSTS,newProgression,zeroLevels,growthModel,scratchTool,awardMilestones,restoreProgression,upgradeProgression,GROWTH_VERSION} from '../build/idiom/growth.js';
function richProgression(level=0){
 const earned=MILESTONES.reduce((s,m)=>s+m.points,0),spent=4*COSTS.slice(0,level).reduce((s,c)=>s+c,0);
 return {points:earned-spent,earned,levels:Object.fromEntries(TECHS.map(t=>[t,level])),claimed:MILESTONES.map(m=>m.id)};
}
function finish(t,stopAt=3){
 const mode=CARDS.find(c=>c.id===t.cardId).mode;
 const indices=mode==='ladder'?[0,5,10]:mode==='mines'?[0,1,2]:mode==='eye'||mode==='destiny'?[0]:t.committedLayout.map((_,i)=>i);
 for(const i of indices){if(resolveTicket(t).status!=='playing')break;t=revealCell(t,i);
  if(mode==='cashout'&&t.revealed.length===stopAt&&resolveTicket(t).status==='playing'){t=cashOut(t);break;}}
 return t;
}
function fixture(id,status,levels){for(let i=0;i<100000;i++){const t=finish(createIdiomTicket(id,'growth-'+id+i,'n'+i,levels));if(resolveTicket(t).status===status)return t;}throw Error('fixture');}
test('一次性福运里程碑可补领，重复便宜票与恢复金不能刷点',()=>{
 const p=newGame('milestone').progression;assert.equal(p.points,1);
 const stats={T01:{won:1,best:10n}};const awarded=awardMilestones(p,2,1000n,stats);
 assert.equal(awarded.points,14);assert.deepEqual(awardMilestones(awarded,2,1000n,stats),awarded);
 assert.deepEqual(restoreProgression(awarded),awarded);
});
test('科技扣点、满级、负数与账本一致性',()=>{
 let p=richProgression();for(let i=0;i<10;i++)p=upgradeProgression(p,'scratch');
 assert.equal(p.points,p.earned-81);assert.throws(()=>upgradeProgression(p,'scratch'));
 assert.throws(()=>upgradeProgression(newProgression(),'luck'));assert.throws(()=>upgradeProgression(p,'other'));
 for(const patch of [{points:p.points+1},{earned:p.earned+1},{claimed:['unlock:T01','unlock:T01']},{levels:{...p.levels,luck:11}}])assert.throws(()=>restoreProgression({...p,...patch}));
});
test('幸运与条件大奖分开，奖金不修改中奖权重',()=>{
 for(const id of ['T01','T14']){
  const base=growthModel(id,zeroLevels()),luck=growthModel(id,{...zeroLevels(),luck:10}),jackpot=growthModel(id,{...zeroLevels(),jackpot:10}),bonus=growthModel(id,{...zeroLevels(),bonus:10});
  assert.ok(luck.winChance>base.winChance);assert.deepEqual(luck.tiers,base.tiers);
  assert.equal(jackpot.winChance,base.winChance);assert.ok(jackpot.tiers.at(-1)>base.tiers.at(-1));
  assert.equal(bonus.winChance,base.winChance);assert.deepEqual(bonus.tiers,base.tiers);assert.ok(bonus.bonusBps>10000);
 }
});
test('经济上限逐级释放，5级和10级仍有可测差异；小额奖金不丢失增益',()=>{
 for(const def of CARDS){
  const mid=growthModel(def.id,richProgression(5).levels),max=growthModel(def.id,richProgression(10).levels);
  if(!['T17','T18'].includes(def.id))assert.ok(max.rtp>mid.rtp,def.id);
 }
 let extra=0;for(let i=0;i<10000;i++){
  const t=finish(createIdiomTicket('T01','small-bonus'+i,'b'+i,{...zeroLevels(),bonus:10}));
  if(resolveTicket(t).prize>resolveBaseTicket(t).prize)extra++;
 }
 assert.ok(extra>50,'Sub-unit bonus must sometimes pay one currency unit');
});
for(const def of CARDS){
 test(def.id+' 成长奖池有界、旧种子不变、新票快照可恢复',()=>{
  const old=createIdiomTicket(def.id,'old-'+def.id,'old');
  for(const level of [0,5,10]){
   const levels=Object.fromEntries(TECHS.map(t=>[t,level])),m=growthModel(def.id,levels);
   assert.ok(m.rtp<=.98+1e-10);assert.ok(m.winChance>=0&&m.winChance<1);assert.ok(m.bonusBps>=10000);
   if(m.tiers.length)assert.ok(Math.abs(m.tiers.reduce((a,b)=>a+b,0)-1)<1e-10);
   assert.ok(m.safety.every(p=>p>0&&p<1));
   const s={...newGame('snapshot'),cash:2000000000000n,peak:2000000000000n,unlockedCount:18,progression:richProgression(level)};
   const bought=purchaseTicket(s,def.id,true),saved=restoreGame(serializeGame(bought));
   assert.deepEqual(saved.active,bought.active);
   assert.deepEqual(createIdiomTicket(def.id,bought.active.rngSeed,bought.active.nonce,bought.active.growth),bought.active);
   assert.deepEqual(createIdiomTicket(def.id,'old-'+def.id,'old'),old);
  }
 });
}
test('升级中途不影响旧票金额、布局、工具；新票获得新科技',()=>{
 let s={...newGame('mid-ticket'),progression:richProgression()};s=purchaseTicket(s,'T01');
 const t=s.active;for(const tech of TECHS)s=upgradeTech(s,tech);
 assert.equal(s.active,t);assert.deepEqual(restoreGame(serializeGame(s)).active,t);
 s=settleActive({...s,active:finish(t)});const next=purchaseTicket(s,'T01');
 assert.equal(next.active.prizeTableVersion,GROWTH_VERSION);assert.deepEqual(next.active.growth,{luck:1,jackpot:1,bonus:1,scratch:1});
});
test('V3.1旧存档完整迁移并补领，保留原始备份和待刮票',()=>{
 const t=createIdiomTicket('T01','migration','legacy');const s={...newGame('legacy'),version:31,active:t,stats:{T01:{played:3,won:1,best:10n}},unlockedCount:2,peak:1000n};
 delete s.progression;const raw=serializeGame(s),map=new Map([[SAVE_KEY,raw]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const migrated=loadGame(storage,'unused').state;
 assert.equal(migrated.version,32);assert.equal(migrated.progression.points,14);assert.deepEqual(migrated.active,t);
 assert.equal(map.get('idiom-v31-base-backup'),raw);assert.deepEqual(restoreGame(serializeGame(migrated)),migrated);
 assert.deepEqual(loadGame(storage,'unused').state.progression,migrated.progression);
});
test('篡改升级等级、快照与开奖版本被拒绝',()=>{
 const s=purchaseTicket({...newGame('tamper'),progression:richProgression(5)},'T01');
 for(const field of ['version','levels','layout']){
  const raw=JSON.parse(serializeGame(s));
  if(field==='version')raw.active.prizeTableVersion='unknown';
  if(field==='levels')raw.active.growth.luck=-1;
  if(field==='layout')raw.active.committedLayout[0].value='999';
  assert.throws(()=>restoreGame(JSON.stringify(raw)));
 }
});
test('成长奖励只结算一次，头奖里程碑按基础奖而非倍率判断',()=>{
 const t=fixture('T11','won',{...zeroLevels(),bonus:10});let s={...newGame('payout'),cash:1000000n,peak:1000000n,active:t};
 const r=resolveTicket(t),base=resolveBaseTicket(t);assert.ok(r.prize>base.prize);
 s=settleActive(s);assert.equal(s.cash,1000000n+r.prize);assert.deepEqual(settleActive(s),s);
 assert.equal(s.progression.claimed.includes('jackpot:T11'),base.prize>=3000000n);
 assert.deepEqual(restoreGame(serializeGame(s)),s);
});
test('恶魔清零现金但保留永久资产；固定头奖、扫雷与云门结构不变',()=>{
 const levels=richProgression(10).levels,t=fixture('T18','bankrupt',levels),s={...newGame('devil'),progression:richProgression(10),cash:100000000000n,peak:100000000000n,unlockedCount:18,active:t};
 const paid=settleActive(s);assert.equal(paid.cash,0n);assert.deepEqual(paid.progression,s.progression);
 for(const id of ['T15','T16','T17','T18'])assert.equal(resolveTicket(fixture(id,'won',levels)).prize,CARDS.find(c=>c.id===id).headlinePrize);
 for(let i=0;i<100;i++){
  const seed='structure'+i;
  for(const id of ['T09','T17','T18'])assert.deepEqual(createIdiomTicket(id,seed,'s',levels).committedLayout,createIdiomTicket(id,seed,'s').committedLayout);
 }
 assert.equal(DESTINY_POOL.devil,.15);
});
test('四档工具面积与宽度一致，最高级仍须真实刮擦',()=>{
 assert.deepEqual([0,3,6,9].map(l=>scratchTool(l).name),['铜币','银币','金币','神币']);
 for(let l=0;l<=10;l++){const t=scratchTool(l);assert.ok(Math.abs(t.width*t.width/900-t.area)<1e-10);assert.equal(t.area,1+.15*l);}
});
