import test from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_PLATE,createTicket,shuffledPlate,scoutCell,activateCell,calculateScore,settleTicket} from '../build/rules.js';
test('initial plate distribution',()=>{
 const counts=Object.fromEntries([...new Set(INITIAL_PLATE)].map(key=>[key,INITIAL_PLATE.filter(x=>x===key).length]));
 assert.deepEqual(counts,{star:4,bell:3,leaf:3,gear:2,gem:2,ink:2});
});
test('seeded shuffle deterministic',()=>{
 assert.deepEqual(shuffledPlate('same-seed'),shuffledPlate('same-seed'));
 assert.notDeepEqual(shuffledPlate('same-seed'),shuffledPlate('other-seed'));
});
test('scout does not cost regular scratching',()=>{
 const next=scoutCell(createTicket('test'),0);
 assert.equal(next.scoutRemaining,0);assert.equal(next.regularRemaining,8);assert.equal(next.activatedOrder.length,0);
});
test('extra leaf at pressure 2 prevents accident',()=>{
 const first=['leaf',...INITIAL_PLATE.slice(1)],t=createTicket('leaf',first);
 t.regularRemaining=0;t.pressure=2;
 const next=activateCell(t,0,{extra:true});
 assert.equal(next.pressure,2);assert.equal(next.status,'active');
});
test('extra star at pressure 2 causes accident',()=>{
 const first=['star',...INITIAL_PLATE.slice(1)],t=createTicket('star',first);
 t.regularRemaining=0;t.pressure=2;
 const next=activateCell(t,0,{extra:true});
 assert.equal(next.status,'accident');
 assert.equal(next.finalScore,Math.floor(calculateScore(next,{accident:true}).B*.4));
});
test('document example equals 217',()=>{
 const layout=['star','bell','star','leaf','gem','gear','ink','star','bell','leaf','gear','gem','star','ink','leaf','bell'];
 let t=createTicket('appendix-a',layout);
 for(const i of [0,1,2,3,4,7,9,12])t=activateCell(t,i);
 const s=calculateScore(t);
 assert.equal(s.B,140);assert.equal(s.M,1.55);assert.equal(s.score,217);
 assert.equal(settleTicket(t).finalScore,217);
});
