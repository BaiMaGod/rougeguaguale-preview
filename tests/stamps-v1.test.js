import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicket,scoutCell,activateCell,calculateScore,settleTicket,INITIAL_PLATE} from '../build/rules.js';
import {createBuild,STAMPS,shopPrice,buyStamp,buyUpgrade,grantRoundCopper} from '../build/build.js';
import {buyItem} from '../build/items.js';
import {swapTicket} from '../build/tickets.js';
const standard=[...INITIAL_PLATE];
const ticket=(cells=standard)=>createTicket('stamp-v1',[...cells]);
const build=(...stamps)=>{const b=createBuild();b.stamps=stamps;return b;};
const reveal=(t,indices,b)=>indices.reduce((cur,i)=>activateCell(cur,i,{build:b}),t);
const diff=(t,b)=>calculateScore(t,{build:b}).B-calculateScore(t).B;
test('all 48 stamps have unique IDs and exact 24/18/6 price rarity tiers',()=>{
 assert.equal(STAMPS.length,48);
 assert.equal(new Set(STAMPS.map(x=>x.id)).size,48);
 for(let n=1;n<=48;n++)assert.ok(STAMPS.some(x=>x.id==='R'+String(n).padStart(2,'0')));
 assert.deepEqual([6,10,16].map(price=>STAMPS.filter(x=>x.price===price).length),[24,18,6]);
});
test('R05 maximal single natural triple grants .25 per group and R07 echoes largest actual instance',()=>{
 const layout=['star','star','star','bell',...standard.slice(4)];
 const t=reveal(ticket(layout),[0,1,2]);
 assert.equal(Number((calculateScore(t,{build:build('R05')}).M-calculateScore(t).M).toFixed(2)),.25);
 assert.equal(diff(t,build('R07')),10);
 assert.equal(diff(t,build('R07','R37')),20);
});
test('R12 crossing B12 and R13 parallel lines M+.5',()=>{
 let t=reveal(ticket(),[0,1,2,3,4,8,12]);
 assert.equal(diff(t,build('R12')),12);
 t=reveal(ticket(),[0,1,2,3,4,5,6,7]);
 assert.equal(Number((calculateScore(t,{build:build('R13')}).M-calculateScore(t).M).toFixed(2)),.5);
});
test('R14 free stamp exchange independent of T09 and legal only on nonink revealed cells',()=>{
 const l=['gear','star',...standard.slice(2)];
 const t=reveal(ticket(l),[0,1]);
 const first=swapTicket(t,0,1,'stamp');
 assert.equal(first.cells[0].symbol,'star');
 assert.equal(first.stampSwapUsed,true);
 assert.throws(()=>swapTicket(first,0,1,'stamp'));
 assert.equal(first.freeSwapUsed,undefined);
});
test('R15 counts unique orthogonally adjacent gears at M+.15 per pair',()=>{
 const l=['gear','gear',...standard.slice(2)];
 const t=reveal(ticket(l),[0,1]);
 assert.equal(Number((calculateScore(t,{build:build('R15')}).M-calculateScore(t).M).toFixed(2)),.15);
});
test('R18 pre-scout B+8 per natural and R21 activates at three',()=>{
 let t=ticket();t.scoutRemaining=3;
 for(const i of [0,1,2])t=scoutCell(t,i);
 t=reveal(t,[0,1,2]);
 assert.deepEqual(t.prescoutedIndices,[0,1,2]);
 assert.equal(diff(t,build('R18')),24);
 assert.equal(Number((calculateScore(t,{build:build('R21')}).M-calculateScore(t).M).toFixed(2)),.5);
});
test('R24 6-7 activations with three pre-scouts, no ink, multiplies X1.8',()=>{
 let t=ticket();t.scoutRemaining=3;
 for(const i of [0,1,2])t=scoutCell(t,i);
 t=reveal(t,[0,1,2,3,4,5]);
 assert.equal(calculateScore(t,{build:build('R24')}).X,1.8);
 t=activateCell(t,6);
 assert.equal(calculateScore(t,{build:build('R24')}).X,1.8);
 t=activateCell(t,7);
 assert.equal(calculateScore(t,{build:build('R24')}).X,1);
});
test('R26 captures positive pressure before leaf activation and R31 awards each activated ink',()=>{
 const l=['ink','leaf',...standard.slice(2)];
 let t=activateCell(ticket(l),0);
 t=activateCell(t,1,{build:build('R26')});
 assert.deepEqual(t.leafPressureIndices,[1]);
 assert.equal(diff(t,build('R26')),10);
 assert.equal(diff(t,build('R31')),18);
});
test('R29 safety absorbs first accident and cannot fire again',()=>{
 const l=['ink','ink','ink',...standard.slice(3)];
 let t=ticket(l);t.pressure=2;const b=build('R29');
 t=activateCell(t,0,{build:b});
 assert.equal(t.pressure,2);assert.equal(t.safetyUsed,true);assert.equal(t.status,'active');
 t=activateCell(t,1,{build:b});assert.equal(t.status,'accident');
});
test('R30 only adds B30 if last revealed cell is a natural extra scratch',()=>{
 let t=ticket();t=reveal(t,[0,1,2,3,4,5,6,7]);
 const extra=activateCell(t,8,{extra:true});
 assert.equal(diff(extra,build('R30')),30);
 const after=activateCell(extra,9,{extra:true});
 assert.equal(diff(after,build('R30')),30);
});
test('R32 critical normal settlement after extra with P2 doubles X',()=>{
 let t=ticket();t=reveal(t,[0,1,2,3,4,5,6,7]);
 t=activateCell(t,8,{extra:true});t.pressure=2;
 assert.equal(calculateScore(t,{build:build('R32')}).X,2);
 assert.equal(calculateScore({...t,status:'accident'},{build:build('R32')}).X,1);
});
test('R35 gem spark repeats first echo, R37 copies historical echoes without recursion',()=>{
 const l=['gem','spark','star','spark',...standard.slice(4)];
 const b=build('R35');
 let t=reveal(ticket(l),[0,1,2,3],b);
 assert.deepEqual(t.echoValues,[20,20,10]);
 assert.equal(t.echoCount,3);
 assert.equal(calculateScore(t,{build:build('R37')}).B-calculateScore(t).B,40);
 assert.equal(calculateScore(t,{build:build('R34','R37')}).B-calculateScore(t).B,40+5*6);
});
test('R36 rewards activation numbers 3, 6 and 9, R38 last natural echo',()=>{
 let t=ticket();t.regularRemaining=9;t=reveal(t,[0,1,2,3,4,5,6,7,8]);
 assert.equal(diff(t,build('R36')),30);
 assert.equal(diff(t,build('R38')),6);
 assert.equal(calculateScore(t,{build:build('R38','R34')}).B-calculateScore(t).B,12);
});
test('R39 neighboring gem and spark gives .2 M, R40 requires 4 total echoes',()=>{
 const l=['spark','gem',...standard.slice(2)];
 const t=reveal(ticket(l),[0,1]);
 assert.equal(Number((calculateScore(t,{build:build('R39')}).M-calculateScore(t).M).toFixed(2)),.2);
 const four={...t,echoCount:4,echoBonus:40,echoValues:[10,10,10,10]};
 assert.equal(calculateScore(four,{build:build('R40')}).X,1.75);
});
test('R47 discount is single use across item, stamp and upgrade, resets next shop',()=>{
 const b=build('R47');b.copper=25;
 assert.equal(shopPrice(b,6),4);
 const afterItem=buyItem(b,'I02');
 assert.equal(afterItem.copper,24);
 assert.equal(shopPrice(afterItem,6),6);
 const afterStamp=buyStamp(afterItem,'R01');
 assert.equal(afterStamp.copper,18);
 const next=grantRoundCopper(afterStamp,0,3);
 assert.equal(next.shopDiscountUsed,false);
 assert.equal(shopPrice(next,5),3);
 const upgraded=buyUpgrade(next,'gem');
 assert.equal(upgraded.copper,next.copper-3);
});
