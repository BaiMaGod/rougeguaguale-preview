import test from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_PLATE,createTicket,activateCell,calculateScore,settleTicket} from '../build/rules.js';
import {createBuild,STAMPS} from '../build/build.js';
import {TICKET_TYPES,swapTicket,applyTicketChoice,ticketCandidates} from '../build/tickets.js';
import {EVENTS,eventForRound,eventAvailable,eventNeedsTarget,applyEvent} from '../build/events.js';
import {useItem} from '../build/items.js';

const plate=[...INITIAL_PLATE];
const reveal=(ticket,indices,build)=>indices.reduce((t,index)=>activateCell(t,index,{build}),ticket);

test('all 12 ticket types included, with T10 candidate gated by early-stop stamps',()=>{
 assert.equal(TICKET_TYPES.length,12);
 for(let n=1;n<300;n++){
  assert.ok(!ticketCandidates('no-moon',n%9,n,plate,[]).some(x=>x.id==='T10'));
 }
 let found=false;
 for(let n=1;n<100;n++)found ||=ticketCandidates('moon',n%9,n,plate,['R20']).some(x=>x.id==='T10');
 assert.equal(found,true);
});
test('T09 free reshuffle works once and does not consume I08, trigger scratch or modify history',()=>{
 const layout=['star','gear','bell','leaf',...plate.slice(4)];
 let ticket=applyTicketChoice(createTicket('swap',layout),'T09');
 ticket=reveal(ticket,[0,1]);
 const next=swapTicket(ticket,0,1);
 assert.equal(next.cells[0].symbol,'gear');
 assert.equal(next.cells[1].symbol,'star');
 assert.equal(next.regularRemaining,6);
 assert.deepEqual(next.activatedOrder,[0,1]);
 assert.ok(next.freeSwapUsed);
 assert.throws(()=>swapTicket(next,0,1),/免费交换/);
 assert.throws(()=>swapTicket(ticket,0,2),/已激活/);
 assert.throws(()=>swapTicket(createTicket('classic',layout),0,1));
});
test('T10 early stop has X1.40 at seven, X0.80 at eight',()=>{
 const layout=['star','star','star','star','bell','bell','bell','leaf','leaf','leaf','gear','gear','gem','gem','ink','ink'];
 let t=applyTicketChoice(createTicket('phase',layout),'T10');
 t=reveal(t,[0,1,2,3,4,5,6]);
 assert.equal(calculateScore(t).X,1.4);
 t=activateCell(t,7);
 assert.equal(calculateScore(t).X,.8);
});
test('T11 penalizes first seven natural instances but adds B60 for natural eighth only',()=>{
 const layout=['star','star','star','star','bell','bell','bell','leaf','leaf','leaf','gear','gear','gem','gem','ink','ink'];
 const indices=[0,1,2,3,4,5,6,7];
 const classic=calculateScore(reveal(createTicket('t',layout),indices));
 const finale=calculateScore(reveal(applyTicketChoice(createTicket('t',layout),'T11'),indices));
 assert.equal(finale.breakdown.symbolBase,classic.breakdown.symbolBase-21);
 assert.equal(finale.B-classic.B,29); // +60, -21, no classic +10
 const ink=calculateScore(reveal(applyTicketChoice(createTicket('t',layout),'T11'),[0,1,2,3,4,5,6,14]));
 const classicInk=calculateScore(reveal(createTicket('t',layout),[0,1,2,3,4,5,6,14]));
 assert.equal(ink.B-classicInk.B,-31);
});
test('two seeded events occur after rounds 2 and 5, no repeated event',()=>{
 for(let n=0;n<100;n++){
  const seed='event-'+n,one=eventForRound(1,seed),two=eventForRound(4,seed);
  assert.ok(one&&two&&one.id!==two.id);
  assert.equal(eventForRound(0,seed),undefined);
  assert.equal(eventForRound(8,seed),undefined);
 }
 assert.equal(EVENTS.length,12);
});
test('event choice A/B validated before changing build; event can be cancelled with no mutation',()=>{
 const base=createBuild(),original=structuredClone(base);
 assert.equal(eventNeedsTarget('E01','A'),true);
 assert.equal(eventAvailable('E01','A',base),false);
 assert.ok(eventAvailable('E01','A',base,'star'));
 const upgraded=applyEvent(base,'E01','A','star');
 assert.equal(upgraded.copper,2);
 assert.equal(upgraded.levels.star,1);
 assert.deepEqual(base,original);
 assert.throws(()=>applyEvent(base,'E01','A'),/不可用/);
 assert.equal(eventAvailable('E01','B',base),true);
 const item=applyEvent(base,'E01','B');
 assert.deepEqual(item.items,['I02']);
 assert.equal(item.copper,3);
});
test('event plate transformations preserve 16 and ink and respect cap',()=>{
 let b=createBuild();
 const bell=applyEvent(b,'E02','A');
 assert.equal(bell.plate.filter(x=>x==='bell').length,5);
 assert.equal(bell.plate.filter(x=>x==='star').length,2);
 const leaf=applyEvent(b,'E03','A');
 assert.equal(leaf.plate.filter(x=>x==='leaf').length,5);
 assert.equal(leaf.plate.filter(x=>x==='ink').length,2);
 const gem=applyEvent(b,'E04','A');
 assert.equal(gem.plate.filter(x=>x==='gem').length,4);
 assert.equal(gem.copper,1);
 assert.equal(gem.plate.length,16);
 b.copper=0;
 assert.throws(()=>applyEvent(b,'E04','A'));
});
test('event shop respects full bag, no duplicate stamp, and no negative coupons',()=>{
 let b=createBuild();
 b.items=['I01','I02'];
 assert.equal(eventAvailable('E10','A',b),false);
 assert.throws(()=>applyEvent(b,'E10','A'));
 b.items=[];
 const free=applyEvent(b,'E08','B');
 assert.deepEqual(free.items,['I06']);
 assert.equal(free.copper,6);
 const paid=applyEvent(b,'E05','A');
 assert.ok(paid.stamps.includes('R11'));
 assert.equal(paid.copper,2);
 assert.equal(eventAvailable('E05','A',paid),false);
 const raised=applyEvent(b,'E12','A','gem');
 assert.equal(raised.levels.gem,1);
 const repainted=applyEvent(b,'E12','B','star');
 assert.equal(repainted.plate.filter(x=>x==='star').length,6);
 assert.deepEqual(b.plate,plate);
});
test('new stamp synergies interact with real scoring and pressure, not just UI',()=>{
 const b=createBuild(); b.stamps=['R03','R04','R11','R19','R20','R25','R27','R44','R45'];
 const t=createTicket('mix',plate);
 let sample=reveal(t,[0,1,4,5,6,10,11,12],b);
 const bare=calculateScore(sample);
 const enhanced=calculateScore(sample,{build:b});
 assert.ok(enhanced.B>bare.B);
 assert.ok(enhanced.M>bare.M);
 const safe=activateCell(createTicket('safe',plate),14,{build:b});
 assert.equal(safe.pressure,0);
 const secondInk=activateCell(safe,15,{build:b});
 assert.equal(secondInk.pressure,1);
 let extra=createTicket('extra',plate);
 extra=reveal(extra,[0,1,2,3,4,5,6,7],b);
 extra=activateCell(extra,8,{extra:true,build:b});
 assert.equal(extra.extraPenaltyTotal,.15);
 const gloved=useItem({...b,items:['I11']},reveal(createTicket('extra2',plate),[0,1,2,3,4,5,6,7],b),'I11');
 const after=activateCell(gloved.ticket,8,{extra:true,build:b});
 assert.equal(after.extraPenaltyTotal,.075); // first R27 -0.10, then I11 half
 assert.equal(STAMPS.length,26);
});
test('seeded 16-cell distribution remains invariant across tickets and stage offers',()=>{
 for(let i=0;i<100;i++){
  const b=createBuild();const options=ticketCandidates('run-'+i,i%9,1,b.plate,b.stamps);
  assert.equal(options.length,3);
  assert.equal(new Set(options.map(x=>x.id)).size,3);
  assert.equal(b.plate.filter(x=>x==='ink').length,2);
  assert.ok(b.plate.every(Boolean));
 }
});
