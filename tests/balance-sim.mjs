/** Reproducible balance harness. No use of real-money mechanics. */
import {createBuild,applyReward,grantRoundCopper,rewardOptions,shopOffer,buyStamp,buyUpgrade,availableUpgrades} from '../build/build.js';
import {createTicket,shuffledPlate,activateCell,settleTicket,rowClues,ROUND_TARGETS,SYMBOLS} from '../build/rules.js';
import {bossForRound,ticketCandidates,applyTicketChoice} from '../build/tickets.js';
function seeded(seed){
 let x=2166136261>>>0;
 for(const c of seed){x^=c.charCodeAt(0);x=Math.imul(x,16777619);}
 return ()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
}
function choose(t,policy,rng){
 const possible=t.cells.filter(c=>c.state!=='active');
 if(policy==='random')return possible[Math.floor(rng()*possible.length)].index;
 if(policy==='rows')return possible[0].index;
 const clues=rowClues(t);
 let choices=possible.map(c=>{
  const row=Math.floor(c.index/4);
  const line=t.cells.filter(v=>Math.floor(v.index/4)===row&&v.state==='active').length;
  const scout=c.state==='scouted';
  // The following mode is an explicit upper bound, not a realizable player.
  if(policy==='oracle')return {index:c.index,points:({gem:70,moon:55,star:45,leaf:30,gear:28,bell:25,key:28,spark:25,sun:45,vault:20,prism:5,ink:-999}[c.symbol])+
    line*8+rng()};
  return {index:c.index,points:(scout?(c.symbol==='ink'?-1000:75):0)+clues[row].count*12+
    line*14+rng()*10};
 }).sort((a,b)=>b.points-a.points);
 return choices[0].index;
}
function simulate(policy,seed,regime='auto'){
 const rng=seeded(seed+':choice');
 let b=createBuild();
 if(regime==='fully-boosted'){
  for(const sym of Object.keys(b.levels))b.levels[sym]=3;
  b.stamps=['R01','R02','R09','R33','R04','R23'];
 }
 const passed=[],scores=[];
 for(let round=0;round<9;round++){
  let total=0;const ticketScores=[];
  for(let serial=1;serial<=3;serial++){
   const ticketSeed=seed+':r'+(round+1)+':t'+serial;
   let t=createTicket(ticketSeed,shuffledPlate(ticketSeed,b.plate));
   const boss=bossForRound(round,seed);
   const candidates=ticketCandidates(seed,round,serial,b.plate,b.stamps);
   const picked=candidates.find(d=>d.id==='T04'&&b.plate.filter(s=>s==='star').length>=6)
       ||candidates.find(d=>d.id==='T05')||candidates[0];
   t=applyTicketChoice(t,picked.id,boss,serial===1);
   if(b.stamps.includes('R17'))t.scoutRemaining++;
   t.openCopper=b.copper;
   if(policy==='clue'&&t.scoutRemaining){
    for(let i=0;i<t.scoutRemaining;i++){
     const hidden=t.cells.filter(c=>c.state==='hidden');
     if(!hidden.length)break;
     const chosen=hidden[Math.floor(rng()*hidden.length)];
     // equivalent to scoutCell but without importing browser UI
     const index=chosen.index;t.cells[index].state='scouted';
    }
   }
   const maxActions=Math.min(8,t.regularRemaining);
   for(let step=0;step<maxActions&&t.status==='active';step++){
    const i=choose(t,policy,rng);
    t=activateCell(t,i,{build:b});
   }
   t=settleTicket(t,b);
   const points=t.finalScore??0;
   ticketScores.push(points);total+=points;
   if(total>=ROUND_TARGETS[round])break;
  }
  passed.push(total>=ROUND_TARGETS[round]);
  scores.push({round:round+1,target:ROUND_TARGETS[round],points:total,tickets:ticketScores});
  if(!passed.at(-1))break;
  if(round===8)break;
  if(regime==='auto'){
   b=grantRoundCopper(b,round,scores.at(-1).tickets.length);
   const rewards=rewardOptions(b,round,seed+':reward:'+round);
   const preferred=rewards.find(x=>x.kind==='stamp'&&b.stamps.length<6)||
       rewards.find(x=>x.kind==='upgrade');
   if(preferred)b=applyReward(b,preferred);
   const offered=shopOffer(b,round,seed).stampIds;
   const afford=offered.find(id=>{try{const next=buyStamp(b,id);return next.copper>=0;}catch{return false;}});
   if(afford&&b.stamps.length<6)b=buyStamp(b,afford);
   else if(!b.shopServiceUsed){
    for(const sym of availableUpgrades(b)){
     try{b=buyUpgrade(b,sym);break;}catch{}
    }
   }
  }
 }
 return {passed,scores,furthest:scores.length};
}
const N=Number(process.env.BALANCE_RUNS??80);
if(!Number.isInteger(N)||N<1||N>1000)throw Error('BALANCE_RUNS must be 1..1000');
const policies=['rows','random','clue','oracle'];
const results=[];
for(const regime of ['auto','fully-boosted']){
 for(const policy of policies){
  const passes=Array(9).fill(0),entered=Array(9).fill(0),average=Array(9).fill(0);
  let complete=0;
  for(let n=0;n<N;n++){
   const game=simulate(policy,'balance-'+n,regime);
   for(let i=0;i<game.scores.length;i++){
    entered[i]++;average[i]+=game.scores[i].points;
    if(game.passed[i])passes[i]++;
   }
   if(game.passed.length===9&&game.passed.every(Boolean))complete++;
  }
  results.push({build:regime,policy,runs:N,wins:complete,winRate:complete/N,
    stages:passes.map((p,i)=>({round:i+1,entered:entered[i],passed:p,
      passRateConditional:entered[i]?+(p/entered[i]).toFixed(3):null,
      averageScoreEntered:entered[i]?Math.round(average[i]/entered[i]):null,target:ROUND_TARGETS[i]}))});
 }
}
console.log('BALANCE_SIMULATION_START');
console.log(JSON.stringify(results,null,2));
console.log('BALANCE_SIMULATION_END');
