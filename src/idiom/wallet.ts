import {CARDS,cardDefinition,type CardId} from './config.js';
import {createIdiomTicket,type TicketInstance} from './generator.js';
import {cashOut,chooseCell,revealCell,resolveTicket,resolveBaseTicket} from './resolver.js';
import {newProgression,awardMilestones,restoreProgression,upgradeProgression,type Progression,type Tech} from './growth.js';
import {newMachine,restoreMachine,type MachineState} from './machine-state.js';
export interface CardStats {played:number;won:number;best:bigint;bestBase?:bigint;}
export interface Receipt {nonce:string;cardId:CardId;prize:bigint;status:string;}
export interface GameState {
 version:33;runSeed:string;cash:bigint;peak:bigint;bought:number;progression:Progression;machine:MachineState;
 unlockedCount:number;active:TicketInstance|null;stats:Record<string,CardStats>;
 history:Receipt[];lastRecovery:number;recoveryCount:number;
}
export const SAVE_KEY='idiom-run-v31-base';
export const LEGACY_KEY='foil-run-v4';
export function newGame(seed:string):GameState {
 return {version:33,runSeed:seed,cash:60n,peak:60n,bought:0,unlockedCount:1,active:null,stats:{},history:[],lastRecovery:0,recoveryCount:0,machine:newMachine(),
  progression:awardMilestones(newProgression(),1,60n,{})};
}
export function upgradeTech(state:GameState,tech:Tech):GameState {
 return {...state,progression:upgradeProgression(state.progression,tech)};
}
function unlock(state:GameState):GameState {
 let count=state.unlockedCount;
 while(count<CARDS.length&&(state.stats[CARDS[count-1].id]?.played??0)>=3&&state.peak>=CARDS[count].price*2n)count++;
 return {...state,unlockedCount:count};
}
export function purchaseTicket(state:GameState,id:CardId,confirmRisk=false,actor:'manual'|'machine'='manual'):GameState {
 if(actor==='manual'&&(state.machine.running||state.machine.job))throw new Error('先暂停并完成机器票，再手动买票');
 const def=cardDefinition(id);
 if(state.active&&!state.active.settled)throw new Error('请先完成并领取当前票');
 if(CARDS.indexOf(def)>=state.unlockedCount)throw new Error('这张卡尚未解锁');
 if(state.cash<def.price)throw new Error('现金不足，可以先刮低价卡');
 if(id==='T18'&&!confirmRisk)throw new Error('购买前需确认恶魔破产风险');
 const bought=state.bought+1,nonce=state.runSeed+':'+bought;
 const levels=state.progression.levels;
 const active=createIdiomTicket(id,nonce+':'+id,nonce,Object.values(levels).some(l=>l>0)?levels:undefined);
 return {...state,bought,cash:state.cash-def.price,active};
}
export function startScratch(state:GameState,index:number):GameState {
 if(state.machine.job)throw new Error('当前票正在由机器处理');
 if(!state.active)throw new Error('请先购买一张票');
 return {...state,active:chooseCell(state.active,index)};
}
export function scratchCell(state:GameState,index:number):GameState {
 if(state.machine.job)throw new Error('当前票正在由机器处理');
 if(!state.active)throw new Error('请先购买一张票');
 return {...state,active:revealCell(state.active,index)};
}
export function stopAndCollect(state:GameState):GameState {
 if(!state.active)throw new Error('没有可收手的票');
 return settleActive({...state,active:cashOut(state.active)});
}
export function settleActive(state:GameState,actor:'manual'|'machine'='manual'):GameState {
 if(state.machine.job&&actor==='manual')throw new Error('请在机器界面领取当前票');
 const t=state.active;if(!t||t.settled)return state;
 const resolution=resolveTicket(t);if(resolution.status==='playing')throw new Error('这张票还未完成');
 const previous=state.stats[t.cardId]??{played:0,won:0,best:0n};
 const basePrize=resolveBaseTicket(t).prize;
 const stats={...state.stats,[t.cardId]:{played:previous.played+1,won:previous.won+(resolution.prize>0n?1:0),best:resolution.prize>previous.best?resolution.prize:previous.best,
  bestBase:basePrize>(previous.bestBase??previous.best)?basePrize:(previous.bestBase??previous.best)}};
 const cash=resolution.status==='bankrupt'?0n:state.cash+resolution.prize;
 // One immutable snapshot contains both receipt and balance. Replays cannot pay twice.
 const next=unlock({...state,cash,peak:cash>state.peak?cash:state.peak,stats,active:{...t,settled:true},
  history:[{nonce:t.nonce,cardId:t.cardId,prize:resolution.prize,status:resolution.status},...state.history].slice(0,100)});
 return {...next,...(resolution.status==='bankrupt'?{machine:{...state.machine,running:false,message:'恶魔降临，机器已暂停，永久成长保留'}}:{}),progression:awardMilestones(next.progression,next.unlockedCount,next.peak,
  Object.fromEntries(Object.entries(stats).map(([id,s])=>[id,{won:s.won,best:s.bestBase??s.best}])))};
}
export function recoveryCash(state:GameState,now:number):GameState {
 if(state.cash>=2n||state.active&&!state.active.settled)throw new Error('现金不足2元且没有待刮票时，可领取恢复金');
 if(state.lastRecovery&&now-state.lastRecovery<60000)throw new Error('恢复金每60秒可领取一次');
 return {...state,cash:20n,lastRecovery:now,recoveryCount:state.recoveryCount+1};
}
export function serializeGame(state:GameState):string {
 return JSON.stringify(state,(_key,value)=>typeof value==='bigint'?value.toString():value);
}
function amount(value:unknown):bigint {
 if(typeof value!=='string'||!/^\d+$/.test(value)||value.length>60)throw new Error('存档金额无效');return BigInt(value);
}
function count(value:unknown):number {
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new Error('存档计数无效');return value;
}
export function restoreGame(raw:string):GameState {
 const saved=JSON.parse(raw);
 if(![31,32,33].includes(saved.version)||typeof saved.runSeed!=='string'||saved.runSeed.length>200)throw new Error('存档版本不兼容');
 const fresh=newGame(saved.runSeed),cash=amount(saved.cash),peak=amount(saved.peak);
 if(peak<cash)throw new Error('历史金额无效');
 const unlockedCount=count(saved.unlockedCount);if(unlockedCount<1||unlockedCount>18)throw new Error('解锁进度无效');
 const stats:Record<string,CardStats>={};
 for(const [id,data] of Object.entries(saved.stats??{})){
  cardDefinition(id);const s=data as CardStats;const played=count(s.played),won=count(s.won);
  if(won>played)throw new Error('中奖记录无效');stats[id]={played,won,best:amount(s.best),...(s.bestBase!==undefined?{bestBase:amount(s.bestBase)}:{})};
 }
 const history:Receipt[]=(saved.history??[]).map((r:Receipt)=>{
  cardDefinition(r.cardId);if(typeof r.nonce!=='string'||!['won','lost','bankrupt'].includes(r.status))throw new Error('结算日志无效');
  return {...r,prize:amount(r.prize)};
 });
 if(history.length>100||new Set(history.map(r=>r.nonce)).size!==history.length)throw new Error('结算日志重复');
 let active:TicketInstance|null=null;
 if(saved.active){
  const t=saved.active as TicketInstance;
  cardDefinition(t.cardId);if(typeof t.nonce!=='string'||typeof t.rngSeed!=='string'||typeof t.settled!=='boolean'||typeof t.cashout!=='boolean')throw new Error('票据无效');
  if(saved.version===31&&t.growth)throw new Error('旧版票据字段无效');
  active=createIdiomTicket(t.cardId,t.rngSeed,t.nonce,t.growth);
  if(t.prizeTableVersion!==active.prizeTableVersion||t.bonusRoll!==active.bonusRoll||JSON.stringify(t.committedLayout)!==JSON.stringify(active.committedLayout))throw new Error('开奖数据已损坏，原存档已保留');
  if(!Array.isArray(t.revealed)||!Array.isArray(t.choices)||new Set(t.revealed).size!==t.revealed.length)throw new Error('揭晓记录无效');
  for(const index of t.revealed)active=revealCell(active,index);
  for(const index of t.choices)if(!active.revealed.includes(index))active=chooseCell(active,index);
  if(JSON.stringify(t.choices)!==JSON.stringify(active.choices))throw new Error('选择记录无效');
  if(t.cashout)active=cashOut(active);
  if(t.settled){if(resolveTicket(active).status==='playing'||!history.some(r=>r.nonce===t.nonce))throw new Error('结算记录无效');active={...active,settled:true};}
 }
 const progression=saved.version>=32?restoreProgression(saved.progression):awardMilestones(newProgression(),unlockedCount,peak,stats);
 const machine=saved.version===33?restoreMachine(saved.machine,active,unlockedCount):newMachine();
 return {...fresh,cash,peak,bought:count(saved.bought),unlockedCount,stats,history,active,progression,machine,
  lastRecovery:count(saved.lastRecovery),recoveryCount:count(saved.recoveryCount)};
}
/** Keep old data verbatim. A corrupt V3.1 save must never be overwritten silently. */
export function loadGame(storage:Pick<Storage,'getItem'|'setItem'>,seed:string):{state:GameState;legacy:boolean} {
 const legacy=storage.getItem(LEGACY_KEY);
 if(legacy&&!storage.getItem('idiom-legacy-v4-backup'))storage.setItem('idiom-legacy-v4-backup',legacy);
 const raw=storage.getItem(SAVE_KEY);
 if(raw&&JSON.parse(raw).version===31&&!storage.getItem('idiom-v31-base-backup'))storage.setItem('idiom-v31-base-backup',raw);
 if(raw&&JSON.parse(raw).version===32&&!storage.getItem('idiom-v32-growth-backup'))storage.setItem('idiom-v32-growth-backup',raw);
 return {state:raw?restoreGame(raw):newGame(seed),legacy:!!legacy};
}
