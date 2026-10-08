import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicket,activateCell,calculateScore,INITIAL_PLATE} from '../build/rules.js';
import {applyTicketChoice,ticketCandidates,bossForRound} from '../build/tickets.js';
const fixed=()=>createTicket('fixed',INITIAL_PLATE);
const click=(ticket,indices)=>indices.reduce((t,i)=>activateCell(t,i),ticket);
test('choice includes classic and two distinct seeded legal alternatives',()=>{
 for(let r=0;r<7;r++)for(let n=1;n<=3;n++){
  const a=ticketCandidates('my-run',r,n,INITIAL_PLATE);
  assert.equal(a.length,3);assert.equal(a[0].id,'T01');
  assert.equal(new Set(a.map(x=>x.id)).size,3);
  assert.deepEqual(a,ticketCandidates('my-run',r,n,INITIAL_PLATE));
 }
 const noGears=INITIAL_PLATE.map(s=>s==='gear'?'star':s);
 for(let n=1;n<12;n++)assert.ok(ticketCandidates('my-run',0,n,noGears).every(x=>x.id!=='T06'));
});
test('ticket selection adjusts resources and is locked once scratched or scouted',()=>{
 const deep=applyTicketChoice(fixed(),'T07');
 assert.equal(deep.regularRemaining,9);assert.equal(deep.pressure,1);
 const thin=applyTicketChoice(fixed(),'T08');
 assert.equal(thin.regularRemaining,7);
 const full=applyTicketChoice(fixed(),'T12');
 assert.equal(full.regularRemaining,10);assert.equal(full.extraRemaining,0);
 assert.throws(()=>applyTicketChoice(activateCell(fixed(),0),'T02'));
 const scouted=fixed();scouted.cells[0].state='scouted';
 assert.throws(()=>applyTicketChoice(scouted,'T04'));
});
test('horizontal versus vertical lines pay correctly',()=>{
 const layout=['star','star','star','star','bell','leaf','gear','gem','bell','leaf','gear','gem','bell','leaf','gear','gem'];
 for(const [id,rowBonus,colBonus] of [['T02',40,12],['T03',12,40]]){
  const row=click(applyTicketChoice(createTicket('row',layout),id),[0,1,2,3]);
  const col=click(applyTicketChoice(createTicket('col',layout),id),[0,4,8,12]);
  assert.equal(calculateScore(row).breakdown.lineBase,rowBonus);
  assert.equal(calculateScore(col).breakdown.lineBase,colBonus);
 }
});
test('triple and variety variants replace rather than stack base rules',()=>{
 const layout=['star','star','star','star','bell','leaf','gear','gem','bell','leaf','gear','gem','bell','leaf','gear','gem'];
 const indices=[0,1,2,4,5,6,7,8];
 const classic=calculateScore(click(createTicket('t',layout),indices));
 const festive=calculateScore(click(applyTicketChoice(createTicket('t',layout),'T04'),indices));
 const colorful=calculateScore(click(applyTicketChoice(createTicket('t',layout),'T05'),indices));
 assert.equal(classic.breakdown.tripleBase,20);
 assert.equal(festive.breakdown.tripleBase,35);
 assert.equal(festive.breakdown.tripleMultiplier,.10);
 assert.equal(colorful.breakdown.tripleBase,10);
 assert.equal(colorful.breakdown.varietyMultiplier,.60);
});
test('thin ticket gives +4 per natural, full-ticket has M penalty',()=>{
 const idx=[0,1,2];
 const a=calculateScore(click(fixed(),idx));
 const b=calculateScore(click(applyTicketChoice(fixed(),'T08'),idx));
 assert.equal(b.breakdown.symbolBase-a.breakdown.symbolBase,12);
 assert.equal(calculateScore(applyTicketChoice(fixed(),'T12')).M,.8);
});
test('gear track replaces adjacency value without basic line scores',()=>{
 const layout=['gear','gear','star','star','bell','leaf','gem','ink','bell','leaf','gem','ink','bell','leaf','star','star'];
 const a=calculateScore(click(createTicket('t',layout),[0,1]));
 const b=calculateScore(click(applyTicketChoice(createTicket('t',layout),'T06'),[0,1]));
 assert.equal(a.breakdown.gearBase,16);
 assert.equal(b.breakdown.gearBase,24);
});
test('first act boss modifiers change real pressure, corners and bell M',()=>{
 assert.equal(bossForRound(0,'seed'),undefined);
 assert.equal(bossForRound(2,'seed'),bossForRound(2,'seed'));
 assert.ok(['B01','B02','B03'].includes(bossForRound(2,'seed')));
 assert.equal(applyTicketChoice(fixed(),'T07','B01').pressure,2);
 const regular=calculateScore(click(applyTicketChoice(fixed(),'T01'),[0,1,4]));
 const corners=calculateScore(click(applyTicketChoice(fixed(),'T01','B02'),[0,1,4]));
 assert.equal(regular.breakdown.symbolBase-corners.breakdown.symbolBase,10);
 const normal=calculateScore(click(applyTicketChoice(fixed(),'T01'),[4,5]));
 const muted=calculateScore(click(applyTicketChoice(fixed(),'T01','B03'),[4,5]));
 assert.equal(Number((normal.breakdown.bellMultiplier-muted.breakdown.bellMultiplier).toFixed(2)),.10);
});
