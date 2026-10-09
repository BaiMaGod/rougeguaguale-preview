import assert from 'node:assert/strict';
import {CARDS} from '../build/idiom/config.js';
import {growthModel,zeroLevels} from '../build/idiom/growth.js';
import {newGame} from '../build/idiom/wallet.js';
import {buyMachine,configureMachine,startMachine,advanceMachine,MACHINE_LEVELS,defaultPolicy} from '../build/idiom/machine.js';
const samples=Number(process.env.MACHINE_SAMPLES??1000);assert.ok(Number.isInteger(samples)&&samples>=1000&&samples<=10000);
const rows=[];
for(const level of [1,2,3,4])for(const def of CARDS.filter(c=>c.id!=='T18')){
 let state={...newGame('throughput-'+level+'-'+def.id),cash:100000000000000n,peak:100000000000000n,unlockedCount:18};
 for(let i=0;i<level;i++)state=buyMachine(state);
 state=configureMachine(state,{autoBuy:level>=2,autoClaim:level>=2,repeatCard:def.id,policy:defaultPolicy(),reserve:1000n,budget:def.price*BigInt(samples),limit:samples});
 // Level 1 is fed explicitly in capacity-sized batches and manually claimed.
 const {enqueueMachine,claimMachine}=await import('../build/idiom/machine.js');
 let playedMs=0,payout=0n,sumSquared=0,lastProcessed=0;
 const step=Math.min(1000,MACHINE_LEVELS[level].ms);
 while(state.machine.processed<samples){
  if(!state.machine.running){
   if(state.machine.job){state=claimMachine(state,false);}
   if(level===1&&!state.machine.job&&state.machine.queue.length===0&&state.machine.processed<samples)state=enqueueMachine(state,def.id,Math.min(5,samples-state.machine.processed));
   if(state.machine.processed<samples)state=startMachine(state);
  }
  const before=state.machine.processed;if(state.machine.running){state=advanceMachine(state,step);playedMs+=step;}
  if(state.machine.processed>lastProcessed){const prize=state.machine.log[0].prize;payout+=prize;const r=Number(prize)/Number(def.price);sumSquared+=r*r;lastProcessed=state.machine.processed;}
  assert.ok(state.cash>=1000n&&state.machine.sessionSpent<=state.machine.budget);
 }
 const rtp=Number(payout)/Number(def.price)/samples,se=Math.sqrt(Math.max(0,sumSquared/samples-rtp*rtp)/samples);
 const m=growthModel(def.id,zeroLevels());let theory=m.rtp;
 if(def.id==='T11')theory=.82*.72*.55*500000/300000;
 assert.ok(Math.abs(rtp-theory)<=6*se+.03,def.id+' machine RTP');assert.equal(state.machine.sessionSpent,def.price*BigInt(samples));
 assert.equal(state.machine.purchased,samples);assert.equal(state.machine.processed,samples);
 // Manual claim is instantaneous in this simulator; machine processing still uses the configured duration.
 assert.equal(playedMs,MACHINE_LEVELS[level].ms*samples);
 rows.push({cardId:def.id,level,samples,rtp,theory,ticketsPerMinute:60000/MACHINE_LEVELS[level].ms,
  expectedCashPerMinute:Number(def.price)*(theory-1)*60000/MACHINE_LEVELS[level].ms});
}
console.log(JSON.stringify({totalTickets:samples*68,samplesPerCardAndLevel:samples,rows,notes:['Machine fees excluded from ticket net return. Higher levels accelerate the same negative-expectation pools. Budget/reserve/count stops remain mandatory.','Level 1 requires explicit queued tasks and human claim; human reaction time is excluded. No offline processing or T18 automation.']},null,2));
