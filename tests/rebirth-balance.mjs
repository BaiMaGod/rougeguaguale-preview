import assert from 'node:assert/strict';
import {CARDS,CASHOUT_REWARDS} from '../build/idiom/config.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {resolveTicket,revealCell,cashOut} from '../build/idiom/resolver.js';
import {growthModel} from '../build/idiom/growth.js';
import {spendBoost} from '../build/idiom/run-build.js';
import {newGame,serializeGame,restoreGame} from '../build/idiom/wallet.js';
import {rebirthPreview,performRebirth} from '../build/idiom/rebirth.js';
const samples=Number(process.env.REBIRTH_SAMPLES??10000);assert.ok(Number.isSafeInteger(samples)&&samples>=10000);
const rows=[];let totalTickets=0;
function finish(t,stop=3,useHint=false){
 const mode=CARDS.find(c=>c.id===t.cardId).mode;
 const order=mode==='mines'?(useHint?[t.publicSafeIndex,...Array.from({length:10},(_,i)=>i).filter(i=>i!==t.publicSafeIndex)].slice(0,3):[0,1,2]):Array.from({length:t.committedLayout.length},(_,i)=>i);
 for(const i of order){if(resolveTicket(t).status!=='playing')break;t=revealCell(t,i);if(mode==='cashout'&&t.revealed.length===stop&&resolveTicket(t).status==='playing'){t=cashOut(t);break;}}
 return resolveTicket(t);
}
function sample(boost,card,level,stop=3,useHint=false){
 const levels={luck:level,jackpot:level,bonus:level,scratch:level},model=growthModel(card,levels),def=CARDS.find(c=>c.id===card);
 let payout=0n,basePayout=0n,square=0,wins=0,max=0n;
 for(let i=0;i<samples;i++){
  const seed=`rebirth-balance:${boost}:${card}:${level}:${i}`,base=createIdiomTicket(card,seed,'b'+i,levels),ticket=createIdiomTicket(card,seed,'b'+i,levels,boost);
  const r=finish(ticket,stop,useHint),b=finish(base,stop);totalTickets+=2;
  assert.ok(r.prize>=b.prize,boost+' should not lower the same-seed ticket payout');
  if(boost==='hands'||boost==='hint'&&!useHint)assert.equal(r.prize,b.prize);
  if(boost==='hint'){assert.equal(ticket.committedLayout.filter(c=>c.kind==='bomb').length,4);assert.equal(ticket.committedLayout[ticket.publicSafeIndex].kind,'safe');assert.deepEqual(ticket.committedLayout,base.committedLayout);}
  if(boost==='rise')assert.ok(r.prize<=3000n);
  if(boost==='guard')assert.ok(r.prize<=CASHOUT_REWARDS.slice(0,stop).reduce((a,b)=>a+b,0n)*BigInt(model.bonusBps)/10000n+1n);
  payout+=r.prize;basePayout+=b.prize;if(r.prize>0n)wins++;if(r.prize>max)max=r.prize;const ratio=Number(r.prize)/Number(def.price);square+=ratio*ratio;
 }
 let theory=model.rtp;
 if(boost==='lucky')theory=(model.winChance+(1-model.winChance)*Array.from({length:7},(_,i)=>2/(i+2)).reduce((a,b)=>a+b,0)/7)*Number(def.headlinePrize)/Number(def.price)*model.bonusBps/10000;
 if(boost==='rise')theory=model.winChance*3000/Number(def.price);
 if(boost==='hint'&&useHint)theory=(5/9)*(4/8)*Number(def.headlinePrize)/Number(def.price)*model.bonusBps/10000;
 if(boost==='guard')theory=CASHOUT_REWARDS.slice(0,stop).reduce((sum,v,i)=>sum+Number(v)*model.safety.slice(0,i+1).reduce((a,b)=>a*b,1),0)/Number(def.price)*model.bonusBps/10000;
 const rtp=Number(payout)/Number(def.price)/samples,se=Math.sqrt(Math.max(0,square/samples-rtp*rtp)/samples);
 assert.ok(Math.abs(rtp-theory)<=6*se+.01+1/Number(def.price),`${boost}/${card}/Lv${level}/stop${stop}: ${rtp} vs ${theory}`);
 rows.push({boost,card,level,stop:boost==='guard'?stop:undefined,publicHint:boost==='hint'?useHint:undefined,samples,winRate:wins/samples,rtp,theory,baseRtp:Number(basePayout)/Number(def.price)/samples,maxPrize:max.toString()});
}
for(const level of [0,5,10]){
 sample('lucky','T04',level);sample('rise','T05',level);sample('hint','T09',level);sample('hint','T09',level,3,true);
 for(let stop=1;stop<=6;stop++)sample('guard','T11',level,stop);
 for(const card of CARDS.slice(0,8))sample('hands',card.id,level);
}
for(const [id,card] of [['lucky','T04'],['rise','T05'],['hint','T09'],['guard','T11'],['hands','T01']]){
 let build={stocks:[{id,used:0}],claimed:[],choices:[],pending:null,speedCredits:0};
 for(let i=0;i<3;i++){const r=spendBoost(build,card);assert.equal(r.boost,id);build=r.build;}
 const fourth=spendBoost(build,card);assert.equal(fourth.boost,undefined);assert.equal(fourth.build,build);
 assert.deepEqual(createIdiomTicket(card,'exhausted','n',undefined,fourth.boost),createIdiomTicket(card,'exhausted','n'));
}
let run=newGame('rebirth-repeat-balance');for(let cycle=0;cycle<100;cycle++){
 assert.equal(rebirthPreview(run).eligible,false);const stats=Object.fromEntries(CARDS.slice(0,4).map(c=>[c.id,{played:3,won:0,best:0n}]));
 run={...run,cash:1000n,peak:1000n,unlockedCount:4,bought:12,runStats:stats,stats:Object.fromEntries(Object.entries(stats).map(([id,s])=>[id,{...s,played:3*(cycle+1)}]))};
 const q=rebirthPreview(run);assert.equal(q.gain,cycle===0?8:2);run=performRebirth(run,q.token);run=restoreGame(serializeGame(run));assert.equal(run.cash,60n);assert.equal(run.bought,0);assert.deepEqual(run.runStats,{});
}
assert.equal(run.rebirth.totalPoints,206);assert.equal(run.rebirth.records.length,50);
console.log(JSON.stringify({version:'v3.1-run-boost-1',samples,totalTickets,rows,repeatRebirth:{cycles:100,totalPoints:run.rebirth.totalPoints,retainedReceipts:run.rebirth.records.length},notes:['Run bonuses may temporarily exceed 100% RTP but apply to at most three matching purchased tickets each. Exhaustion restores the unchanged permanent-growth pool capped at 98%.','Public hints choose uniformly among safe cells using an independent seeded draw; machine policies stay blind. Guard returns only the subtotal visible before the first bomb.','Rebirth requires current-run tier, wealth peak and settled tickets again. First milestones pay once; equal-progress repeats pay two points. This is a configured prototype, not a long-term economy acceptance.']},null,2));
