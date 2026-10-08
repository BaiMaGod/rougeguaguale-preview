import test from 'node:test';
import assert from 'node:assert/strict';
import {INITIAL_PLATE,createTicket,activateCell,calculateScore,scoutCell} from '../build/rules.js';
import {createBuild} from '../build/build.js';
import {buyItem,useItem,ITEMS,itemOffer} from '../build/items.js';
import {applyTicketChoice,bossForRound,BOSSES} from '../build/tickets.js';
const plate=[...INITIAL_PLATE];
function bag(...ids){const b=createBuild();b.items=ids;return b;}
function spend(id,t= createTicket('t',plate),target={}){
 return useItem(bag(id),t,id,target);
}
test('all twelve shop tool ids produce valid seeded offers even with high-bit hashes',()=>{
 assert.equal(ITEMS.length,12);
 const found=new Set();
 for(let i=0;i<1000;i++){
  const id=itemOffer('any-seed-'+i,i%8);
  assert.ok(ITEMS.some(tool=>tool.id===id));
  found.add(id);
 }
 assert.equal(found.size,12);
});
test('I04 selects exact row and reveals hidden only, preserving resource charges',()=>{
 let t=createTicket('row',plate);
 t=scoutCell(t,0);t=activateCell(t,4);
 const res=spend('I04',t,{row:1});
 assert.equal(res.ticket.cells[4].state,'active');
 for(let i=5;i<8;i++)assert.equal(res.ticket.cells[i].state,'scouted');
 assert.equal(res.ticket.cells[0].state,'scouted');
 assert.equal(res.ticket.scoutRemaining,t.scoutRemaining);
 assert.equal(res.ticket.activatedOrder.length,1);
 assert.throws(()=>spend('I04',t,{row:5}));
 assert.deepEqual(bag('I04').items,['I04']);
});
test('I05 inks one natural symbol with +6 per instance (old and future activations)',()=>{
 let t=createTicket('paint',plate);t=activateCell(t,0);t=activateCell(t,4);
 const before=calculateScore(t).breakdown.symbolBase;
 const r=spend('I05',t,{symbol:'star'});
 assert.equal(calculateScore(r.ticket).breakdown.symbolBase-before,6);
 const more=activateCell(r.ticket,1);
 assert.equal(calculateScore(more).breakdown.symbolBase-calculateScore(activateCell(t,1)).breakdown.symbolBase,12);
 assert.throws(()=>spend('I05',t,{symbol:'ink'}));
});
test('I08 swaps activated natural symbols and keeps revealed/activation states',()=>{
 const layout=['star','bell',...plate.slice(2)];
 let t=createTicket('swap',layout);
 t=activateCell(t,0);t=activateCell(t,1);
 const swapped=spend('I08',t,{cell:0,second:1}).ticket;
 assert.equal(swapped.cells[0].symbol,'bell');
 assert.equal(swapped.cells[1].symbol,'star');
 assert.deepEqual(swapped.activatedOrder,[0,1]);
 assert.equal(swapped.cells[0].state,'active');
 assert.throws(()=>spend('I08',t,{cell:0,second:0}));
 assert.throws(()=>spend('I08',t,{cell:0,second:2}));
});
test('I09 annotation reveals chosen hidden cell and rewards only activated natural +12',()=>{
 let t=createTicket('note',plate);
 const noted=spend('I09',t,{cell:0}).ticket;
 assert.equal(noted.cells[0].state,'scouted');
 assert.equal(noted.scoutRemaining,1);
 assert.equal(calculateScore(noted).B,0);
 const before=calculateScore(activateCell(t,0));
 const after=calculateScore(activateCell(noted,0));
 assert.equal(after.B-before.B,12);
 assert.throws(()=>spend('I09',noted,{cell:0}));
 const noteInk=spend('I09',t,{cell:14}).ticket;
 assert.equal(calculateScore(activateCell(noteInk,14)).breakdown.symbolBase,0);
});
test('I10 prevents only next ink pressure; I11 halves future extra M cost',()=>{
 let t=spend('I10').ticket;
 t=activateCell(t,0);t=activateCell(t,14);assert.equal(t.pressure,0);
 assert.equal(t.inkGuard,false);
 t=activateCell(t,15);assert.equal(t.pressure,1);
 const layout=['star','star','star','star','star','bell','leaf','gem','gear','gear','ink','ink','bell','leaf','bell','gem'];
 let normal=createTicket('extra',layout),discount=createTicket('extra',layout);
 discount=spend('I11',discount).ticket;
 for(let i=0;i<8;i++){normal=activateCell(normal,i);discount=activateCell(discount,i);}
 normal=activateCell(normal,8,{extra:true});
 discount=activateCell(discount,8,{extra:true});
 assert.equal(normal.extraPenaltyTotal,.25);
 assert.equal(discount.extraPenaltyTotal,.125);
 assert.equal(Number((calculateScore(discount).M-calculateScore(normal).M).toFixed(3)),.125);
 assert.throws(()=>spend('I11',discount));
});
test('I12 waits for first natural and captures one instance base including plate level',()=>{
 const b=createBuild();b.levels.star=2;
 let t=spend('I12',createTicket('echo',plate)).ticket;
 t=activateCell(t,14,{build:b});
 assert.equal(t.echoPending,true);
 t=activateCell(t,0,{build:b});
 assert.equal(t.echoPending,false);
 assert.equal(t.echoBonus,18);
 const calc=calculateScore(t,{build:b});
 assert.equal(calc.B-calculateScore({...t,echoBonus:0},{build:b}).B,18);
});
test('B07 lowers M with floor, B08 caps top eligible stamp, B09 consumes one regular scratch',()=>{
 const t=createTicket('boss',plate);
 assert.equal(applyTicketChoice(t,'T01','B09',true).regularRemaining,7);
 assert.equal(applyTicketChoice(t,'T01','B09',true).scoutRemaining,3);
 assert.equal(applyTicketChoice(t,'T01','B09',false).scoutRemaining,1);
 const a=calculateScore(activateCell(t,0));
 const b=calculateScore({...activateCell(t,0),bossId:'B07'});
 assert.equal(b.M,.5);
 assert.ok(a.M>b.M);
 let rows=createTicket('gold',['star','star','star','star','bell','leaf','gear','gem','leaf','gem','ink','ink','bell','leaf','gear','gem']);
 const build=createBuild();build.stamps=['R16','R23'];
 for(const i of [0,1,2,3,4,8,12])rows=activateCell(rows,i);
 const raw=calculateScore(rows,{build});
 const capped=calculateScore({...rows,bossId:'B08'},{build});
 assert.equal(raw.X,1.8);
 assert.equal(capped.X,1.5);
 assert.equal(bossForRound(8,'boss-final'),bossForRound(8,'boss-final'));
 assert.ok(['B07','B08','B09'].includes(bossForRound(8,'boss-final')));
 assert.equal(bossForRound(7,'boss-final'),undefined);
 assert.equal(Object.keys(BOSSES).length,9);
});
