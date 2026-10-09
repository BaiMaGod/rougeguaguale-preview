import assert from 'node:assert/strict';
import {CARDS,BASE_WIN_CHANCE,AMOUNT_POOL,CASHOUT_SAFETY,CASHOUT_REWARDS,LEDGER_POOL,DESTINY_POOL,DRAGON_EYE_TICKET_CHANCE} from '../build/idiom/config.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {resolveTicket,resolveBaseTicket,revealCell,cashOut} from '../build/idiom/resolver.js';
import {growthModel,zeroLevels} from '../build/idiom/growth.js';
const samples=Number(process.env.IDIOM_SAMPLES??100000);
assert.ok(Number.isSafeInteger(samples)&&samples>=10000);
function finish(t,mode,stopAt=3){
 const indices=mode==='ladder'?[0,5,10]:mode==='mines'?[0,1,2]:mode==='eye'||mode==='destiny'?[0]:Array.from({length:t.committedLayout.length},(_,i)=>i);
 for(const i of indices){if(resolveTicket(t).status!=='playing')break;t=revealCell(t,i);
  if(mode==='cashout'&&t.revealed.length===stopAt&&resolveTicket(t).status==='playing'){t=cashOut(t);break;}}
 return {...resolveTicket(t),basePrize:resolveBaseTicket(t).prize};
}
const output=[];
for(const def of CARDS){
 let payout=0n,wins=0,devils=0,sumSquared=0;
 for(let i=0;i<samples;i++){
  const r=finish(createIdiomTicket(def.id,'balance-'+def.id+'-'+i,'simulation-'+i),def.mode);
  payout+=r.prize;if(r.prize>0n)wins++;if(r.status==='bankrupt')devils++;
  const ratio=Number(r.prize)/Number(def.price);sumSquared+=ratio*ratio;
 }
 let theory=BASE_WIN_CHANCE[def.id]*Number(def.headlinePrize)/Number(def.price);
 if(def.id==='T01')theory=AMOUNT_POOL.reduce((s,t)=>s+t.chance*Number(t.prize),0)/Number(def.price);
 if(def.id==='T09')theory=(6/10)*(5/9)*(4/8)*5;
 if(def.id==='T11')theory=CASHOUT_SAFETY.slice(0,3).reduce((s,v)=>s*v,1)*Number(CASHOUT_REWARDS.slice(0,3).reduce((s,v)=>s+v,0n))/Number(def.price);
 if(def.id==='T13')theory=DRAGON_EYE_TICKET_CHANCE/3*10;
 if(def.id==='T14')theory=LEDGER_POOL.reduce((s,v)=>s+v.chance*Number(v.prize),0)/Number(def.price);
 if(def.id==='T17')theory=.2**3*100;
 if(def.id==='T18')theory=DESTINY_POOL.heaven*100;
 const rtp=Number(payout)/Number(def.price)/samples;
 const se=Math.sqrt(Math.max(0,sumSquared/samples-rtp*rtp)/samples);
 assert.ok(Math.abs(rtp-theory)<=6*se+.005,`${def.id}: RTP ${rtp} differs from ${theory}`);
 assert.ok(theory<1,`${def.id} base prize pool returns >=100%`);
 if(def.id==='T18')assert.ok(Math.abs(devils/samples-DESTINY_POOL.devil)<.01);
 output.push({id:def.id,name:def.name,samples,winRate:wins/samples,rtp,theory,bankruptcyRate:devils/samples});
}
const stopStrategies=[];
for(let stopAt=1;stopAt<=6;stopAt++){
 let payout=0n;for(let i=0;i<samples;i++)payout+=finish(createIdiomTicket('T11','stop-'+i,'s'+i),'cashout',stopAt).prize;
 const theory=CASHOUT_SAFETY.slice(0,stopAt).reduce((s,v)=>s*v,1)*Number(CASHOUT_REWARDS.slice(0,stopAt).reduce((s,v)=>s+v,0n))/300000;
 assert.ok(theory<1);stopStrategies.push({stopAt,rtp:Number(payout)/300000/samples,theory});
}
const growth=[];
for(const level of [5,10]){
 const levels={luck:level,jackpot:level,bonus:level,scratch:level};
 for(const def of CARDS){
  const model=growthModel(def.id,levels);let payout=0n,wins=0,devils=0,sumSquared=0;const tierCounts={};
  let stopAt=3,theory=model.rtp;
  if(def.mode==='cashout'){
   const returns=model.safety.map((_,i)=>model.safety.slice(0,i+1).reduce((s,p)=>s*p,1)*Number(CASHOUT_REWARDS.slice(0,i+1).reduce((s,p)=>s+p,0n))/Number(def.price)*model.bonusBps/10000);
   stopAt=returns.indexOf(Math.max(...returns))+1;
  }
  for(let i=0;i<samples;i++){
   const r=finish(createIdiomTicket(def.id,'growth-balance-'+def.id+'-'+i,'g'+i,levels),def.mode,stopAt);
   payout+=r.prize;if(r.prize>0n)wins++;if(r.status==='bankrupt')devils++;
   tierCounts[r.basePrize.toString()]=(tierCounts[r.basePrize.toString()]??0)+1;
   const ratio=Number(r.prize)/Number(def.price);sumSquared+=ratio*ratio;
  }
  const rtp=Number(payout)/Number(def.price)/samples,se=Math.sqrt(Math.max(0,sumSquared/samples-rtp*rtp)/samples);
  // Integer currency rounds down at payout; at most 1 currency unit per ticket.
  assert.ok(Math.abs(rtp-theory)<=6*se+.005+1/Number(def.price),`${def.id} Lv.${level} RTP ${rtp} differs from ${theory}`);
  assert.ok(theory<=.98+1e-10);
  const expectedWin=def.id==='T09'?1/6:def.id==='T17'?.008:def.id==='T18'?.006:def.id==='T13'?model.winChance/3:def.id==='T11'?model.safety.slice(0,stopAt).reduce((s,p)=>s*p,1):model.winChance;
  assert.ok(Math.abs(wins/samples-expectedWin)<6*Math.sqrt(expectedWin*(1-expectedWin)/samples)+.001,def.id+' growth win frequency');
  if(model.tiers.length){
   const pool=def.id==='T01'?AMOUNT_POOL:LEDGER_POOL;
   pool.forEach((tier,i)=>{const p=model.winChance*model.tiers[i],actual=(tierCounts[tier.prize.toString()]??0)/samples;
    assert.ok(Math.abs(actual-p)<6*Math.sqrt(p*(1-p)/samples)+.001,def.id+' growth tier '+i);});
  }
  if(def.id==='T18')assert.ok(Math.abs(devils/samples-DESTINY_POOL.devil)<.01);
  const base=growthModel(def.id,zeroLevels());assert.ok(model.winChance>=base.winChance-1e-10);
  growth.push({id:def.id,level,samples,stopAt: def.mode==='cashout'?stopAt:undefined,winRate:wins/samples,rtp,theory,
   effectScale:model.factor,bonusMultiplier:model.bonusBps/10000,tierCounts,bankruptcyRate:devils/samples});
 }
}
console.log(JSON.stringify({poolVersion:'v3.1-growth-draft-1',samplesPerCard:samples,totalTickets:samples*60,cards:output,stopStrategies,growth,
 notes:['Base, mid and max growth pools tested. Positive cash RTP capped at 98% for every card and every blind cashout stopping policy. Integer rounding may lower actual return.','T18 RTP excludes cash lost to bankruptcy; devil chance stays 15%. Recovery grants, automation throughput and reincarnation require separate phase balancing.']},null,2));
