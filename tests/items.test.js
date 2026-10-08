import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicket,activateCell,calculateScore,settleTicket,INITIAL_PLATE} from '../build/rules.js';
import {createBuild,grantRoundCopper} from '../build/build.js';
import {applyTicketChoice,bossForRound} from '../build/tickets.js';
import {ITEMS,itemOffer,buyItem,canUseItem,useItem} from '../build/items.js';

const base=()=>createTicket('items',INITIAL_PLATE);
test('store tool offers deterministic and inventory has a strict two-slot cap',()=>{
 assert.equal(ITEMS.length,5);
 assert.equal(itemOffer('seed',0),itemOffer('seed',0));
 for(let n=0;n<200;n++)assert.ok(ITEMS.some(x=>x.id===itemOffer('tool-seed-'+n,n%8)));
 let b=createBuild();
 b=grantRoundCopper(b,0,3);
 b=buyItem(b,'I02');
 assert.deepEqual(b.items,['I02']);
 assert.equal(b.copper,9);
 b=buyItem(b,'I02');
 assert.deepEqual(b.items,['I02','I02']);
 assert.throws(()=>buyItem(b,'I01'),/背包已满/);
 assert.equal(createBuild().items.length,0);
});
test('I01 cooling lowers pressure only when pressure is present; failed use never spends',()=>{
 let b=createBuild();b.items=['I01'];let t=base();
 assert.equal(canUseItem(t,'I01'),false);
 assert.throws(()=>useItem(b,t,'I01'));
 assert.equal(b.items.length,1);
 t=applyTicketChoice(base(),'T07');
 const res=useItem(b,t,'I01');
 assert.equal(res.ticket.pressure,0);
 assert.equal(res.ticket.itemsUsed,1);
 assert.equal(res.build.items.length,0);
 assert.equal(t.pressure,1);
});
test('I02 visibility and I03 scraper change ticket budgets, capped at 12',()=>{
 const build=createBuild();build.items=['I02','I03'];
 let res=useItem(build,base(),'I02');
 assert.equal(res.ticket.scoutRemaining,3);
 assert.deepEqual(res.build.items,['I03']);
 res=useItem(res.build,res.ticket,'I03');
 assert.equal(res.ticket.regularRemaining,9);
 assert.equal(res.ticket.itemsUsed,2);
 assert.equal(res.build.items.length,0);
 assert.throws(()=>useItem({...build,items:['I02']},res.ticket,'I02'),/无法/);
 let over=base();over.regularRemaining=12;
 assert.equal(canUseItem(over,'I03'),false);
});
test('I06 and I07 actually modify final scores, and a third tool cannot be applied',()=>{
 const build=createBuild();build.items=['I06','I07','I01'];
 let t=activateCell(base(),0);
 const raw=calculateScore(t);
 const a=useItem(build,t,'I06');
 const b=useItem(a.build,a.ticket,'I07');
 const score=calculateScore(b.ticket);
 assert.equal(Number((score.M-raw.M).toFixed(2)),.30);
 assert.equal(score.X,1.25);
 assert.equal(settleTicket(b.ticket).finalScore,score.score);
 assert.ok(score.score>raw.score);
 assert.equal(b.ticket.itemsUsed,2);
 assert.throws(()=>useItem(b.build,b.ticket,'I01'));
 const accident={...b.ticket,status:'accident'};
 assert.equal(calculateScore(accident,{accident:true}).score,Math.floor(calculateScore(accident).B*.4));
});
test('second act B04 halves base plus stamp line bonus once',()=>{
 const t=createTicket('r',INITIAL_PLATE);
 const stamp=createBuild();stamp.stamps=['R09'];
 const full=[0,1,2,3].reduce((cur,i)=>activateCell(cur,i),t);
 const regular=calculateScore(full,{build:stamp});
 const boss=calculateScore({...full,bossId:'B04'},{build:stamp});
 assert.equal(regular.breakdown.lineBase,40);
 assert.equal(boss.breakdown.lineBase,20);
 assert.equal(regular.B-boss.B,20);
});
test('second act B05 zeros first two natural instance bases, not ink or abilities',()=>{
 const ordinary=activateCell(activateCell(activateCell(base(),14),0),1);
 const rule=calculateScore(ordinary);
 const boss=calculateScore({...ordinary,bossId:'B05'});
 assert.equal(rule.breakdown.symbolBase-boss.breakdown.symbolBase,20);
 assert.deepEqual(ordinary.activatedOrder,[14,0,1]);
 assert.equal(rule.breakdown.tripleGroups,boss.breakdown.tripleGroups);
});
test('second act B06 adds scout, does not affect pressure, selects deterministic boss',()=>{
 assert.equal(bossForRound(5,'second-act'),bossForRound(5,'second-act'));
 assert.ok(['B04','B05','B06'].includes(bossForRound(5,'second-act')));
 assert.equal(bossForRound(4,'second-act'),undefined);
 const b=applyTicketChoice(base(),'T01','B06');
 assert.equal(b.scoutRemaining,2);
 assert.equal(b.pressure,0);
});
