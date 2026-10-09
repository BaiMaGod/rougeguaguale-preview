import assert from 'node:assert/strict';
import {CARDS,BASE_WIN_CHANCE,AMOUNT_POOL,CASHOUT_SAFETY,CASHOUT_REWARDS,LEDGER_POOL,DESTINY_POOL,DRAGON_EYE_TICKET_CHANCE} from '../build/idiom/config.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {resolveTicket,revealCell,cashOut} from '../build/idiom/resolver.js';
const samples=Number(process.env.IDIOM_SAMPLES??100000);
assert.ok(Number.isSafeInteger(samples)&&samples>=10000);
function finish(t,mode,stopAt=3){
 const indices=mode==='ladder'?[0,5,10]:mode==='mines'?[0,1,2]:mode==='eye'||mode==='destiny'?[0]:Array.from({length:t.committedLayout.length},(_,i)=>i);
 for(const i of indices){if(resolveTicket(t).status!=='playing')break;t=revealCell(t,i);
  if(mode==='cashout'&&t.revealed.length===stopAt&&resolveTicket(t).status==='playing'){t=cashOut(t);break;}}
 return resolveTicket(t);
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
console.log(JSON.stringify({poolVersion:'v3.1-base-draft-1',samplesPerCard:samples,totalTickets:samples*24,cards:output,stopStrategies,
 notes:['Only base prizes. Recovery grants, growth, machine throughput and long-term progression are not balanced here.','T18 RTP excludes cash lost to bankruptcy; actual net return depends on wallet balance.']},null,2));
