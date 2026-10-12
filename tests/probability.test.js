import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CARDS,AMOUNT_POOL_VERSION,AMOUNT_SUSPENSE_VERSION,AMOUNT_DECOYS} from '../build/idiom/config.js';
import {ticketOdds} from '../build/idiom/probability.js';
import {zeroLevels,growthModel,TECHS,MILESTONES,COSTS} from '../build/idiom/growth.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {revealCell,resolveTicket} from '../build/idiom/resolver.js';
import {newGame,restoreGame,serializeGame,purchaseTicket,settleActive} from '../build/idiom/wallet.js';

test('一五一十新票实际频率为5元20%、10元10%、总中奖30%',()=>{
 for(const levels of [undefined,zeroLevels()]){
  const n=60000,counts={0:0,5:0,10:0};
  for(let i=0;i<n;i++){
   const value=createIdiomTicket('T01','odds-'+i,'n',levels).committedLayout[0].value;
   counts[value==='5'||value==='10'?value:0]++;
  }
  assert.ok(Math.abs(counts[5]/n-.20)<.006);
  assert.ok(Math.abs(counts[10]/n-.10)<.006);
  assert.ok(Math.abs((counts[5]+counts[10])/n-.30)<.006);
 }
 assert.equal(ticketOdds('T01').summary,'中奖 30%');
 assert.equal(ticketOdds('T01').details,'5元 20% · 10元 10%');
 assert.ok(Math.abs(growthModel('T01',zeroLevels()).rtp-1)<1e-10);
});
test('18种卡都有公开概率，选择与收手概率按完整条件计算',()=>{
 for(const c of CARDS){const o=ticketOdds(c.id);assert.ok(o.winChance>0&&o.winChance<1);assert.match(o.summary,/%/);}
 assert.ok(Math.abs(ticketOdds('T09').winChance-1/6)<1e-10);
 assert.ok(Math.abs(ticketOdds('T13').winChance-.08)<1e-10);
 assert.ok(Math.abs(ticketOdds('T17').winChance-.008)<1e-10);
 assert.equal(ticketOdds('T18').winChance,.006);
 assert.equal(ticketOdds('T18').details,'恶魔 15% · 凡间 84.4%');
 assert.equal(ticketOdds('T11').summary,'首步收手 82%');
 assert.match(ticketOdds('T11').details,/82% \/ 59.04% \/ 32.47%/);
});
test('分档展示为每张票的中奖概率，随成长更新并合计等于总概率',()=>{
 for(const level of [0,5,10])for(const id of ['T01','T14']){
  const l={luck:level,jackpot:level,bonus:level,scratch:level},m=growthModel(id,l),odds=ticketOdds(id,l);
  const displayed=[...odds.details.matchAll(/ ([\d.]+)%/g)].map(x=>Number(x[1])/100);
  assert.ok(Math.abs(displayed.reduce((a,b)=>a+b,0)-m.winChance)<.0002);
 }
 assert.notEqual(ticketOdds('T01',{...zeroLevels(),luck:10}).summary,ticketOdds('T01').summary);
});
const legacy=JSON.parse(readFileSync(new URL('./fixtures/amount-legacy.json',import.meta.url)));
test('更新前真实存档的无奖、小奖、大奖及成长奖金均原样恢复',()=>{
 for(const c of legacy){
  const s=restoreGame(JSON.stringify(c.save));
  assert.deepEqual(s.active,c.save.active);
  assert.equal(resolveTicket(revealCell(s.active,0)).prize.toString(),c.prize);
  assert.deepEqual(restoreGame(serializeGame(s)).active,s.active);
  const next=purchaseTicket(settleActive({...s,active:revealCell(s.active,0)}),'T01');
  assert.ok(next.active.prizeTableVersion.includes(AMOUNT_POOL_VERSION));
  assert.equal(ticketOdds('T01',zeroLevels(),s.active.prizeTableVersion).details,'5元 22% · 10元 7%');
 }
});
test('旧票版本兼容仍拒绝修改票面和伪造版本',()=>{
 for(const mutate of [s=>s.active.committedLayout[0].value='999',s=>s.active.prizeTableVersion='forged-pool']){
  const s=structuredClone(legacy[0].save);mutate(s);assert.throws(()=>restoreGame(JSON.stringify(s)));
 }
});
test('50、100、500是未中奖数字，只允许5和10领奖',()=>{
 const seen=new Set();
 for(let i=0;i<1500;i++){
  const t=createIdiomTicket('T01','decoy:'+i,'n'),c=t.committedLayout[0],r=resolveTicket(revealCell(t,0));
  if(AMOUNT_DECOYS.includes(Number(c.value))){seen.add(Number(c.value));assert.equal(c.kind,'number');assert.equal(r.status,'lost');assert.equal(r.prize,0n);}
  else{assert.ok(c.value==='5'||c.value==='10');assert.equal(r.status,'won');assert.equal(r.prize,BigInt(c.value));}
 }
 assert.deepEqual([...seen].sort((a,b)=>a-b),[50,100,500]);
 for(const value of ['0','1','15','50','100','500','1000']){
  const t={...createIdiomTicket('T01','negative','n'),committedLayout:[{kind:'money',value}]};
  assert.equal(resolveTicket(revealCell(t,0)).prize,0n);
 }
});
test('加入悬念数字不改变同种子中奖结果、成长奖金或随机舍入',()=>{
 for(const level of [0,5,10])for(let i=0;i<2000;i++){
  const levels=level?{luck:level,jackpot:level,bonus:level,scratch:level}:undefined,seed='preserve:'+level+':'+i;
  const previous=createIdiomTicket('T01',seed,'n',levels,undefined,levels?'v3.1-growth-draft-1:'+AMOUNT_POOL_VERSION:AMOUNT_POOL_VERSION);
  const current=createIdiomTicket('T01',seed,'n',levels);
  assert.equal(current.bonusRoll,previous.bonusRoll);
  assert.equal(resolveTicket(revealCell(current,0)).prize,resolveTicket(revealCell(previous,0)).prize);
  if(previous.committedLayout[0].value!=='0')assert.deepEqual(current.committedLayout,previous.committedLayout);
 }
});
test('上一版20%/10%的已购票保持原票面和奖金，新票才出现悬念数字',()=>{
 const fixtures=JSON.parse(readFileSync(new URL('./fixtures/amount-before-suspense.json',import.meta.url)));
 for(const f of fixtures){
  const earned=MILESTONES.reduce((s,m)=>s+m.points,0),spent=4*COSTS.slice(0,f.level).reduce((s,c)=>s+c,0);
  const state={...newGame('restore-v2'),active:f.ticket,bought:1,cash:1000n,peak:1000n,
   progression:{points:earned-spent,earned,levels:Object.fromEntries(TECHS.map(t=>[t,f.level])),claimed:MILESTONES.map(m=>m.id)}};
  const restored=restoreGame(serializeGame(state));
  assert.deepEqual(restored.active,f.ticket);
  assert.equal(resolveTicket(revealCell(restored.active,0)).prize.toString(),f.prize);
  const next=purchaseTicket(settleActive({...restored,active:revealCell(restored.active,0)}),'T01');
  assert.ok(next.active.prizeTableVersion.includes(AMOUNT_SUSPENSE_VERSION));
 }
});
