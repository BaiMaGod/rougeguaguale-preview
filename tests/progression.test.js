import test from 'node:test';
import assert from 'node:assert/strict';
import {createTicket,shuffledPlate,activateCell,calculateScore,settleTicket,INITIAL_PLATE} from '../build/rules.js';
import {createBuild,rewardOptions,applyReward,grantRoundCopper,skipReward,shopOffer,buyStamp,buyUpgrade,roundCopper,legalReprint,canUpgrade,STAMPS,upgradePrice} from '../build/build.js';

test('round-1 reward is exactly stamp, upgradable symbol, and reprint',()=>{
 const b=createBuild();
 const rewards=rewardOptions(b,0,'fixed-run');
 assert.deepEqual(rewards.map(x=>x.kind),['stamp','upgrade','reprint']);
 assert.ok(['R01','R09','R41'].includes(rewards[0].stamp.id));
 assert.deepEqual(rewardOptions(b,0,'fixed-run'),rewards);
});
test('first free stamp actually improves settlement score',()=>{
 let b=createBuild();
 const gift={kind:'stamp',id:'gift',stamp:STAMPS.find(x=>x.id==='R01')};
 b=applyReward(b,gift);
 let ticket=createTicket('test-stamp',[
  'star','star','star','star','bell','bell','bell','leaf',
  'leaf','leaf','gear','gear','gem','gem','ink','ink'
 ]);
 for(const i of [0,1,2,3,4,5,7,12])ticket=activateCell(ticket,i);
 const bare=calculateScore(ticket);
 const boosted=calculateScore(ticket,{build:b});
 assert.equal(boosted.B-bare.B,16);
 assert.equal(settleTicket(ticket,b).finalScore,boosted.score);
 assert.ok(boosted.score>bare.score);
});
test('upgrading star carries onto randomized next ticket and grants +4 each active star',()=>{
 let b=createBuild();
 b=applyReward(b,{kind:'upgrade',id:'up',symbol:'star'});
 const seed='run:r2:t1';
 const shuffled=shuffledPlate(seed,b.plate);
 assert.deepEqual(shuffledPlate(seed,b.plate),shuffled);
 let t=createTicket(seed,shuffled);
 for(const c of t.cells.filter(x=>x.symbol==='star'))t=activateCell(t,c.index);
 assert.equal(calculateScore(t,{build:b}).B-calculateScore(t).B,16);
 b=applyReward(b,{kind:'upgrade',id:'up2',symbol:'star'});
 b=applyReward(b,{kind:'upgrade',id:'up3',symbol:'star'});
 assert.equal(canUpgrade(b,'star'),false);
 assert.throws(()=>applyReward(b,{kind:'upgrade',id:'up4',symbol:'star'}));
});
test('reprint changes exactly two non-ink instances and respects maximum 8 and ink safety',()=>{
 const b=createBuild();
 assert.equal(legalReprint(b,[4,5],'star'),true);
 const edited=applyReward(b,{kind:'reprint',id:'reprint'},[4,5],'star');
 assert.equal(edited.plate.length,16);
 assert.equal(edited.plate.filter(s=>s==='star').length,6);
 assert.equal(edited.plate.filter(s=>s==='ink').length,2);
 assert.equal(b.plate[4],'bell');
 assert.equal(legalReprint(b,[14,0],'star'),false);
 assert.equal(legalReprint(edited,[6,7],'star'),true);
 const capped=applyReward(edited,{kind:'reprint',id:'reprint2'},[6,7],'star');
 assert.equal(legalReprint(capped,[8,9],'star'),false);
 assert.throws(()=>applyReward(capped,{kind:'reprint',id:'oops'},[8,9],'star'));
});
test('round economy awards coupons for spare tickets only once',()=>{
 assert.equal(roundCopper(0,3),6);
 assert.equal(roundCopper(0,1),10);
 assert.equal(roundCopper(2,2),12);
 assert.equal(roundCopper(8,1),0);
 let b=createBuild();
 b=grantRoundCopper(b,0,2);
 assert.equal(b.copper,14);
 b=skipReward(b);
 assert.equal(b.copper,16);
});
test('shop display deterministic, prevents duplicates and unaffordable buys',()=>{
 let b=createBuild();
 const reward=rewardOptions(b,0,'my-seed')[0];
 b=applyReward(b,reward);
 const offer=shopOffer(b,0,'my-seed');
 assert.deepEqual(shopOffer(b,0,'my-seed'),offer);
 assert.equal(new Set(offer.stampIds).size,offer.stampIds.length);
 assert.ok(offer.stampIds.every(id=>!b.stamps.includes(id)));
 b=grantRoundCopper(b,0,3);
 const first=offer.stampIds[0];
 const before=b.copper;
 b=buyStamp(b,first);
 assert.equal(b.copper,before-6);
 assert.throws(()=>buyStamp(b,first));
 const type='gem';
 const price=upgradePrice(b,type);
 assert.equal(price,5);
 b=buyUpgrade(b,type);
 assert.equal(b.levels.gem,1);
 assert.equal(b.shopServiceUsed,true);
 assert.throws(()=>buyUpgrade(b,type));
});
test('initial symbol plate always 16 and fixed non-ink/ink split',()=>{
 const b=createBuild();
 assert.deepEqual(b.plate,INITIAL_PLATE);
 assert.equal(b.plate.length,16);
 assert.equal(b.plate.filter(x=>x==='ink').length,2);
});
