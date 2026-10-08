import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicket,activateCell,calculateScore,scoutCell,SYMBOLS} from '../build/rules.js';
import {createBuild,applyReward,legalReprint,STAMPS} from '../build/build.js';
import {EVENTS,eventAvailable,eventForRound,applyEvent,eventNeedsStamp} from '../build/events.js';
import {ticketCandidates} from '../build/tickets.js';
const make=(symbols)=>createTicket('nine',[...symbols,...Array(16-symbols.length).fill('star')]);
const reveal=(ticket,positions,build)=>positions.reduce((t,i)=>activateCell(t,i,{build}),ticket);

test('twelve symbol entries include five new naturals and an unupgradable prism',()=>{
 assert.equal(Object.keys(SYMBOLS).length,12);
 const b=createBuild();
 for(const key of ['key','spark','sun','moon','vault'])assert.equal(b.levels[key],0);
 assert.equal(b.levels.prism,undefined);
 assert.equal(STAMPS.length,26);
});
test('first key gives scout once, repeat key does not grant more charges',()=>{
 let t=make(['key','key','gem','ink']);
 t=activateCell(t,0);assert.equal(t.scoutRemaining,2);
 t=activateCell(t,1);assert.equal(t.scoutRemaining,2);
 assert.equal(t.keyScoutUsed,true);
});
test('spark copies previous natural instance base with levels and never recurses from echo',()=>{
 const b=createBuild();b.levels.gem=2;
 let t=make(['gem','spark','spark','ink']);
 t=activateCell(t,0,{build:b});
 t=activateCell(t,1,{build:b});
 assert.equal(t.echoBonus,28);
 assert.equal(t.echoCount,1);
 t=activateCell(t,2,{build:b});
 assert.equal(t.echoBonus,34); // copies previous spark base 6, not its echo
 assert.equal(t.echoCount,2);
 assert.equal(calculateScore(t,{build:b}).breakdown.symbolBase,40);
});
test('sun adjacency B +4 for each orthogonally active natural neighbor',()=>{
 const layout=['sun','star','ink','star','gem','ink','ink','star','ink','ink','ink','ink','ink','ink','ink','ink'];
 let t=make(layout);
 t=reveal(t,[0,1,4]);
 const score=calculateScore(t);
 assert.equal(score.breakdown.gearBase,8);
 const fewer=calculateScore(reveal(make(layout),[0,1]));
 assert.equal(fewer.breakdown.gearBase,4);
});
test('moon multiplier only if at most 7 activated and vault depends on starting copper',()=>{
 let t=make(['moon','moon','moon','vault','star','star','star','star']);
 t.openCopper=10;t=reveal(t,[0,1,2,3]);
 assert.equal(Number(calculateScore(t).M.toFixed(2)),2.15);
 const poor=calculateScore({...t,openCopper:9});
 assert.equal(Number(poor.M.toFixed(2)),1.95);
 t=reveal(t,[4,5,6,7]);
 assert.equal(Number(calculateScore(t).M.toFixed(2)),1.60);
});
test('prism fills only triple groups and does not manufacture diversity or base',()=>{
 const t=make(['star','star','prism','ink','moon']);
 const score=calculateScore(reveal(t,[0,1,2]));
 assert.equal(score.breakdown.tripleGroups,1);
 assert.equal(score.breakdown.symbolBase,20);
 assert.equal(score.breakdown.varietyMultiplier,0);
 const b=createBuild();b.stamps=['R06'];
 assert.equal(calculateScore(reveal(t,[0,1,2]),{build:b}).B-score.B,8);
});
test('prism can be reprinted but is not upgradeable or a valid natural event ingredient',()=>{
 const b=createBuild();
 assert.equal(legalReprint(b,[0,1],'prism'),true);
 const out=applyReward(b,{kind:'reprint',id:'r'},[0,1],'prism');
 assert.equal(out.plate.filter(x=>x==='prism').length,2);
 assert.equal(out.plate.filter(x=>x==='ink').length,2);
 assert.equal(out.plate.length,16);
 assert.equal(out.levels.prism,undefined);
 assert.equal(eventAvailable('E02','A',out),true);
});
test('all twelve workshop events are unique and have distinct draws',()=>{
 assert.equal(EVENTS.length,12);
 assert.equal(new Set(EVENTS.map(x=>x.id)).size,12);
 for(let n=0;n<60;n++){
  const seed='v09-'+n;
  assert.notEqual(eventForRound(1,seed).id,eventForRound(4,seed).id);
 }
});
test('E06 and E11 forge moon and spark, no ink/prism overwritten',()=>{
 const b=createBuild();
 const a=applyEvent(b,'E06','A');
 assert.equal(a.plate.filter(x=>x==='moon').length,2);
 const c=applyEvent(b,'E11','A');
 assert.equal(c.plate.filter(x=>x==='spark').length,2);
 const d=applyEvent(b,'E06','B');
 assert.deepEqual(d.items,['I02']);
 const e=applyEvent(b,'E11','B');
 assert.deepEqual(e.items,['I12']);
 assert.equal(b.plate.filter(x=>x==='ink').length,2);
});
test('E09 draws sun/vault from two distinct types and can give copper alternative',()=>{
 const b=createBuild(),c=applyEvent(b,'E09','A');
 assert.equal(c.plate.filter(x=>x==='sun').length,1);
 assert.equal(c.plate.filter(x=>x==='vault').length,1);
 assert.equal(c.plate.filter(x=>x==='ink').length,2);
 assert.equal(c.plate.length,16);
 assert.equal(applyEvent(b,'E09','B').copper,8);
});
test('E07 stamp recycle calculates refund +3 and never consumes unselected equipment',()=>{
 const b=createBuild();b.stamps=['R01','R23','R16'];
 assert.equal(eventNeedsStamp('E07','A'),true);
 assert.equal(eventAvailable('E07','A',b,undefined),false);
 assert.throws(()=>applyEvent(b,'E07','A',undefined,'R22'),/不可用/);
 const c=applyEvent(b,'E07','A',undefined,'R16');
 assert.deepEqual(c.stamps,['R01','R23']);
 assert.equal(c.copper,17); // epic 16/2 plus 3
 assert.deepEqual(b.stamps,['R01','R23','R16']);
 assert.equal(applyEvent(b,'E07','B').copper,7);
});
test('new symbol stamps really affect score with different multipliers',()=>{
 const b=createBuild();b.stamps=['R22','R34','R42','R46','R48'];
 const layout=['sun','star','moon','vault','spark','gem','key','bell','leaf','ink'];
 const ticket=make(layout);ticket.regularRemaining=10;
 const t=reveal(ticket,[0,1,2,3,4,5,6,7,8],b);
 const a=calculateScore(t),c=calculateScore(t,{build:b});
 assert.ok(c.B>a.B);
 assert.ok(c.X>a.X);
 assert.ok(t.echoBonus>0);
});
test('moon symbol itself permits T10 ticket offer without early-stop stamp',()=>{
 const b=createBuild();b.plate[0]='moon';
 let found=false;
 for(let n=0;n<100;n++)found||=ticketCandidates('moon-run',1,n+1,b.plate,b.stamps).some(x=>x.id==='T10');
 assert.equal(found,true);
});
