import test from 'node:test';
import assert from 'node:assert/strict';
import {CARDS,cardDefinition,formatMoney} from '../build/idiom/config.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {resolveTicket,revealCell,chooseCell,canScratch,cashOut} from '../build/idiom/resolver.js';
import {newGame,purchaseTicket,scratchCell,settleActive,serializeGame,restoreGame,loadGame,SAVE_KEY,LEGACY_KEY,recoveryCash} from '../build/idiom/wallet.js';

export function blindFinish(ticket,stopAt=3){
 let t=ticket;const mode=cardDefinition(t.cardId).mode;
 const indices=mode==='ladder'?[0,5,10]:mode==='mines'?[0,1,2]:mode==='eye'||mode==='destiny'?[0]:Array.from({length:t.committedLayout.length},(_,i)=>i);
 for(const i of indices){
  if(resolveTicket(t).status!=='playing')break;
  t=revealCell(t,i);
  if(mode==='cashout'&&t.revealed.length===stopAt&&resolveTicket(t).status==='playing'){t=cashOut(t);break;}
 }
 return t;
}
const fixture=(id,kind)=>{
 for(let i=0;i<100000;i++){const t=createIdiomTicket(id,'rule-'+id+'-'+i,'fixture-'+i);if(resolveTicket(blindFinish(t)).status===kind)return t;}
 throw new Error('找不到测试票 '+id+' '+kind);
};
const stateFor=t=>({...newGame('test-run'),cash:2000000000000n,peak:2000000000000n,unlockedCount:18,bought:1,active:t});
for(const card of CARDS){
 const win=fixture(card.id,'won'),loss=fixture(card.id,'lost');
 test(card.id+' '+card.name+'：中奖与单次领奖',()=>{
  const completed=blindFinish(win),r=resolveTicket(completed);assert.equal(r.status,'won');assert.ok(r.prize>0n);assert.ok(r.prize<=card.headlinePrize);
  const before=stateFor(completed),paid=settleActive(before);assert.equal(paid.cash,before.cash+r.prize);
  assert.deepEqual(settleActive(paid),paid);assert.equal(paid.stats[card.id].played,1);
 });
 test(card.id+'：未中不返还票价',()=>{
  const completed=blindFinish(loss),r=resolveTicket(completed);assert.equal(r.prize,0n);assert.equal(r.status,'lost');
  assert.equal(settleActive(stateFor(completed)).cash,2000000000000n);
 });
 test(card.id+'：边界与重复揭晓',()=>{
  assert.throws(()=>revealCell(win,-1));assert.throws(()=>revealCell(win,card.cells));assert.throws(()=>revealCell(win,1.5));
  const opened=revealCell(win,0);assert.deepEqual(revealCell(opened,0),opened);
 });
 test(card.id+'：购票锁定，种子可复现',()=>{
  assert.deepEqual(createIdiomTicket(card.id,win.rngSeed,win.nonce),win);
  const s={...newGame('purchase'),cash:card.price*2n,peak:card.price*2n,unlockedCount:18};
  const bought=purchaseTicket(s,card.id,true);assert.equal(bought.cash,s.cash-card.price);
  assert.throws(()=>purchaseTicket(bought,card.id,true));assert.deepEqual(bought.active.committedLayout,createIdiomTicket(card.id,bought.active.rngSeed,bought.active.nonce).committedLayout);
 });
 test(card.id+'：刷新恢复不重抽、不重复到账',()=>{
  const opened=revealCell(win,0),saved=stateFor(opened);assert.deepEqual(restoreGame(serializeGame(saved)),saved);
  const paid=settleActive(stateFor(blindFinish(win))),restored=restoreGame(serializeGame(paid));
  assert.deepEqual(restored,paid);assert.equal(settleActive(restored).cash,paid.cash);
 });
}
const custom=(id,values,kinds=values.map(()=> 'number'))=>({...createIdiomTicket(id,'custom','custom'),committedLayout:values.map((value,i)=>({value:String(value),kind:kinds[i]}))});
test('严格边界：平局、相等台阶、逆序位置均无奖',()=>{
 for(const t of [custom('T04',[5,5]),custom('T05',[1,2,2]),custom('T08',[8,7])])assert.equal(resolveTicket(blindFinish(t)).status,'lost');
 assert.equal(resolveTicket(blindFinish(custom('T03',[3,7]))).prize,120n);
});
test('T06累计额只是判定；T14分档奖金',()=>{
 assert.equal(resolveTicket(blindFinish(custom('T06',[20,20,20,40]))).prize,5000n);
 assert.equal(resolveTicket(blindFinish(custom('T06',[20,20,20,39]))).prize,0n);
 for(const [total,prize] of [[2999999,0n],[3000000,4000000n],[6000000,8000000n],[10000000,20000000n]]){
  const t=custom('T14',[0,0,0,0,0,total],Array(6).fill('money'));assert.equal(resolveTicket(blindFinish(t)).prize,prize);
 }
});
test('T09选择一开始就锁定，不能预览多格避雷',()=>{
 const t=fixture('T09','won'),selected=chooseCell(t,0);assert.equal(canScratch(selected,1),false);
 assert.deepEqual(restoreGame(serializeGame(stateFor(selected))).active,selected);
 const safe=revealCell(selected,0);assert.equal(canScratch(safe,1),true);
 assert.equal(t.committedLayout.filter(c=>c.kind==='bomb').length,4);
});
test('T10只能沿上下左右道路连通，不能越行/对角跳跃',()=>{
 const kinds=['road','blocked','road','blocked','road','blocked','road','blocked','road'];
 assert.equal(resolveTicket(blindFinish(custom('T10',Array(9).fill('路'),kinds))).status,'lost');
});
test('T11只能按顺序刮，收手得累计额；炸弹不清空钱包',()=>{
 const t=custom('T11',[100000,'雷',0,0,0,0],['money','bomb','money','money','money','money']);
 assert.throws(()=>revealCell(t,1));const one=revealCell(t,0);
 assert.equal(resolveTicket(cashOut(one)).prize,100000n);
 const bomb=revealCell(one,1),paid=settleActive(stateFor(bomb));assert.equal(paid.cash,2000000000000n);
 assert.equal(resolveTicket(bomb).accrued,0n);assert.throws(()=>cashOut(bomb));
});
test('选择类只能刮一只眼/一扇门，恢复仍锁定',()=>{
 for(const id of ['T13','T18']){const t=createIdiomTicket(id,'choose-'+id,'choice'),selected=chooseCell(t,1);
  assert.equal(canScratch(selected,0),false);assert.equal(canScratch(selected,2),false);
  assert.deepEqual(restoreGame(serializeGame(stateFor(selected))).active,selected);
  assert.throws(()=>revealCell(selected,0));
 }
});
test('T17每层只选1门；不能提前刮高层',()=>{
 const t=fixture('T17','won');assert.throws(()=>revealCell(t,5));
 const selected=chooseCell(t,0);assert.equal(canScratch(selected,1),false);assert.equal(canScratch(selected,5),false);
 assert.deepEqual(restoreGame(serializeGame(stateFor(selected))).active,selected);
 const first=revealCell(selected,0);assert.equal(canScratch(first,5),true);
 assert.equal(resolveTicket(blindFinish(t)).prize,10000000000n);
});
test('T18恶魔清空本局剩余现金，保留图鉴、历史、解锁；可恢复',()=>{
 const devil=fixture('T18','bankrupt');const original={...stateFor(blindFinish(devil)),stats:{T01:{played:10,won:3,best:10n}}};
 const paid=settleActive(original);assert.equal(paid.cash,0n);assert.equal(paid.unlockedCount,18);assert.deepEqual(paid.stats.T01,original.stats.T01);
 assert.equal(paid.history[0].status,'bankrupt');assert.equal(restoreGame(serializeGame(paid)).cash,0n);
 assert.equal(recoveryCash(paid,100000).cash,20n);assert.equal(cardDefinition('T18').automationAllowedByDefault,false);
 assert.equal(resolveTicket(blindFinish(fixture('T18','won'))).prize,1000000000000n);
});
test('钱包拒绝负余额、未解锁购票、未确认高危票、未完成领奖',()=>{
 const s=newGame('guard');assert.throws(()=>purchaseTicket({...s,cash:1n},'T01'));
 assert.throws(()=>purchaseTicket(s,'T02'));assert.throws(()=>purchaseTicket({...s,cash:10000000000n,unlockedCount:18},'T18'));
 assert.throws(()=>settleActive(purchaseTicket(s,'T01')));
});
test('达到财富与前一卡3张要求才解锁；恢复金限频',()=>{
 let s=newGame('unlock');
 for(let i=0;i<3;i++)s=settleActive({...s,active:{...blindFinish(fixture('T01','lost')),nonce:'unique-'+i}});
 assert.equal(s.unlockedCount,2);
 const recovery=recoveryCash({...s,cash:0n},100000);assert.throws(()=>recoveryCash({...recovery,cash:0n},100001));
 assert.equal(recoveryCash({...recovery,cash:0n},160000).cash,20n);
});
test('大额存档用十进制字符串，无浮点误差；损坏存档拒绝读取',()=>{
 const huge={...newGame('big'),cash:900719925474099312345n,peak:900719925474099312345n};
 assert.equal(restoreGame(serializeGame(huge)).cash,huge.cash);assert.equal(formatMoney(1000000000000n),'1万亿');
 assert.throws(()=>restoreGame(serializeGame({...huge,cash:-1n})));
 const s=stateFor(createIdiomTicket('T01','seed','nonce'));s.active.committedLayout[0].value='999';assert.throws(()=>restoreGame(serializeGame(s)));
});
test('旧版存档隔离并留原始副本，损坏新版不静默覆盖',()=>{
 const old='{"version":4,"bank":1234}',map=new Map([[LEGACY_KEY,old]]),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
 const loaded=loadGame(storage,'migration');assert.equal(loaded.state.cash,60n);assert.equal(map.get(LEGACY_KEY),old);assert.equal(map.get('idiom-legacy-v4-backup'),old);
 map.set(SAVE_KEY,'broken');assert.throws(()=>loadGame(storage,'retry'));assert.equal(map.get(SAVE_KEY),'broken');assert.equal(map.get(LEGACY_KEY),old);
});
