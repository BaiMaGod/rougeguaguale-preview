import {cardDefinition,type CardId} from './config.js';
import {cashOut,revealCell,resolveTicket} from './resolver.js';
import {purchaseTicket,settleActive,type GameState} from './wallet.js';
import {MACHINE_LEVELS,allowedMachineCard,validatePolicy,machineOrder,type MachineState,type MachinePolicy} from './machine-state.js';
export {MACHINE_LEVELS,defaultPolicy} from './machine-state.js';
export function machineOwnsTicket(s:GameState):boolean {return !!s.machine.job&&s.machine.job.nonce===s.active?.nonce;}
export function buyMachine(s:GameState):GameState {
 const m=s.machine;if(m.running||m.job)throw new Error('先暂停并完成当前机器票，再升级机器');
 if(m.level>=4)throw new Error('机器已满级');const cost=MACHINE_LEVELS[m.level+1].cost;
 if(s.cash<cost)throw new Error('现金不足以购买机器');
 return {...s,cash:s.cash-cost,rebirth:{...s.rebirth,automationUnlocked:s.rebirth.automationUnlocked||m.level+1>=2},machine:{...m,level:m.level+1,investment:m.investment+cost,message:'机器已就绪，先加入待购任务'}};
}
export interface MachineSettings {autoBuy:boolean;autoClaim:boolean;repeatCard:CardId;policy:MachinePolicy;reserve:bigint;budget:bigint;limit:number;}
export function configureMachine(s:GameState,c:MachineSettings):GameState {
 const m=s.machine;if(m.running)throw new Error('先暂停，再修改机器设置');
 if(typeof c.autoBuy!=='boolean'||typeof c.autoClaim!=='boolean'||(m.level<1||m.level<2&&!s.rebirth.automationUnlocked)&&(c.autoBuy||c.autoClaim))throw new Error('购入中级机器可永久解锁自动购票和领奖');
 const repeatCard=allowedMachineCard(c.repeatCard,s.unlockedCount),policy=validatePolicy(c.policy);
 if(typeof c.reserve!=='bigint'||c.reserve<0n||typeof c.budget!=='bigint'||c.budget<=0n||c.reserve.toString().length>60||c.budget.toString().length>60||c.budget<m.sessionSpent||!Number.isInteger(c.limit)||c.limit<1||c.limit>10000||c.limit<m.sessionBought)throw new Error('预算或连买上限无效，不能小于本轮已花费');
 return {...s,machine:{...m,autoBuy:c.autoBuy,autoClaim:c.autoClaim,repeatCard,policy,reserve:c.reserve,budget:c.budget,limit:c.limit,message:'设置已保存；队列与当前票的策略保持原样'}};
}
export function enqueueMachine(s:GameState,cardId:CardId,quantity=1):GameState {
 const m=s.machine;allowedMachineCard(cardId,s.unlockedCount);
 if(!m.level)throw new Error('请先购买机器');
 if(!Number.isInteger(quantity)||quantity<1||m.queue.length+quantity>MACHINE_LEVELS[m.level].capacity)throw new Error('队列容量不足');
 const queue=[...m.queue,...Array.from({length:quantity},()=>({cardId,policy:validatePolicy(m.policy)}))];
 return {...s,machine:{...m,queue,message:'已加入'+quantity+'个待购任务；开始处理时扣费'}};
}
export function clearMachineQueue(s:GameState):GameState {return {...s,machine:{...s.machine,running:false,queue:[],message:'待购任务已清空并暂停；已购票仍保留'}};}
export function pauseMachine(s:GameState,message='已暂停，原票和进度保留'):GameState {
 return {...s,machine:{...s.machine,running:false,message}};
}
export function resetMachineSession(s:GameState):GameState {
 if(s.machine.running||s.machine.job)throw new Error('先暂停并完成已购票，再开始新批次');
 return {...s,machine:{...s.machine,sessionSpent:0n,sessionBought:0,message:'新批次预算已就绪'}};
}
export function startMachine(s:GameState):GameState {
 const m=s.machine;if(!m.level)throw new Error('请先购买机器');
 if(s.active&&!s.active.settled&&!machineOwnsTicket(s))throw new Error('请先完成当前手刮票');
 if(!m.job&&s.runBuild.pending)throw new Error('先选择或跳过三选一强化');
 if(!m.job&&!m.queue.length&&!m.autoBuy)throw new Error('先加入任务，或开启自动购票');
 if(m.job&&m.job.elapsedMs===MACHINE_LEVELS[m.level].ms&&resolveTicket(s.active!).status==='won'&&!m.autoClaim)throw new Error('请先手动领取机器奖金');
 return {...s,machine:{...m,running:true,message:'正在处理'}};
}
function finishJob(s:GameState):GameState {
 const m=s.machine,j=m.job!,t=s.active!,r=resolveTicket(t);
 const paid=settleActive(s,'machine');
 return {...paid,machine:{...paid.machine,running:!paid.runBuild.pending&&m.running&&(m.queue.length>0||m.autoBuy),job:null,totalWon:m.totalWon+r.prize,processed:m.processed+1,
  log:[{nonce:j.nonce,cardId:j.cardId,cost:cardDefinition(j.cardId).price,prize:r.prize,status:r.status},...m.log].slice(0,50),message:r.prize>0n?'奖金已到账':'本票未中奖'}};
}
export function claimMachine(s:GameState,continueQueue=true):GameState {
 if(!machineOwnsTicket(s)||s.machine.job!.elapsedMs<MACHINE_LEVELS[s.machine.level].ms||resolveTicket(s.active!).status!=='won')throw new Error('机器票尚未完成');
 const paid=finishJob(s);return {...paid,machine:{...paid.machine,running:!paid.runBuild.pending&&continueQueue&&(paid.machine.queue.length>0||paid.machine.autoBuy)}};
}
/** Call only with time actually played in a visible page, not wall-clock time. */
export function advanceMachine(s:GameState,deltaMs:number):GameState {
 if(!Number.isInteger(deltaMs)||deltaMs<0||deltaMs>1000)throw new Error('机器时间步无效');
 if(!s.machine.running||!deltaMs)return s;
 let next=s,m=next.machine;
 if(!m.job){
  if(s.runBuild.pending)return pauseMachine(s,'等待选择本局强化，机器已暂停');
  if(s.active&&!s.active.settled)return pauseMachine(s,'有待完成的手刮票，机器已暂停');
  const task=m.queue[0]??(m.autoBuy?{cardId:m.repeatCard,policy:validatePolicy(m.policy)}:null);
  if(!task)return pauseMachine(s,'队列已完成');
  allowedMachineCard(task.cardId,s.unlockedCount);const cost=cardDefinition(task.cardId).price;
  if(m.sessionBought>=m.limit)return pauseMachine(s,'已达到本轮连买上限');
  if(m.sessionSpent+cost>m.budget)return pauseMachine(s,'本轮预算不足，已停止购票');
  if(s.cash<cost)return pauseMachine(s,'现金不足，已停止购票');
  if(s.cash-cost<m.reserve)return pauseMachine(s,'现金保留线已触发，停止购票');
  next=purchaseTicket(s,task.cardId,false,'machine');const t=next.active!;
  m={...m,queue:m.queue.length?m.queue.slice(1):m.queue,job:{...task,nonce:t.nonce,elapsedMs:0,order:machineOrder(task.cardId,t.nonce,task.policy)},
   sessionSpent:m.sessionSpent+cost,sessionBought:m.sessionBought+1,totalSpent:m.totalSpent+cost,purchased:m.purchased+1,message:'正在处理'};
  next={...next,machine:m};
 }
 const j=m.job!;if(!machineOwnsTicket(next))return pauseMachine(next,'机器票据关联异常，已暂停');
 const credit=next.runBuild.speedCredits>0&&j.elapsedMs===0?500:0;
 if(credit)next={...next,runBuild:{...next.runBuild,speedCredits:next.runBuild.speedCredits-1}};
 const duration=MACHINE_LEVELS[m.level].ms,elapsedMs=Math.min(duration,j.elapsedMs+deltaMs+credit),due=Math.floor(elapsedMs/duration*j.order.length);
 let t=next.active!;
 while(t.revealed.length<due&&resolveTicket(t).status==='playing'){
  t=revealCell(t,j.order[t.revealed.length]);const r=resolveTicket(t);
  if(cardDefinition(t.cardId).mode==='cashout'&&r.status==='playing'&&(t.revealed.length>=j.policy.steps||j.policy.cashoutMode==='target'&&r.accrued>=j.policy.target))t=cashOut(t);
 }
 next={...next,active:t,machine:{...m,job:{...j,elapsedMs}}};
 if(elapsedMs<duration)return next;
 const r=resolveTicket(t);if(r.status==='playing')return pauseMachine(next,'策略未完成票据，已暂停');
 if(r.status==='won'&&!m.autoClaim)return pauseMachine(next,'刮卡已完成，等待手动领奖');
 return finishJob(next);
}
