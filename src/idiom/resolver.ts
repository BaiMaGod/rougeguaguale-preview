import {cardDefinition} from './config.js';
import type {TicketInstance} from './generator.js';
export interface Resolution {status:'playing'|'won'|'lost'|'bankrupt'; prize:bigint; accrued:bigint; message:string;}
export function resolveTicket(t:TicketInstance):Resolution {
 const def=cardDefinition(t.cardId),layout=t.committedLayout;
 const revealed=t.revealed.map(i=>layout[i]);
 const play=(message:string,accrued=0n):Resolution=>({status:'playing',prize:0n,accrued,message});
 const result=(win:boolean,message:string,prize=def.headlinePrize):Resolution=>({status:win?'won':'lost',prize:win?prize:0n,accrued:0n,message});
 const full=t.revealed.length===layout.length;
 const values=layout.map(c=>Number(c.value));
 switch(def.mode){
  case 'mines':if(revealed.some(c=>c.kind==='bomb'))return result(false,'踩雷了，本票失败');
   return revealed.length>=3?result(true,'连续3格安全！'):play(`已找到 ${revealed.length}/3 个安全格`);
  case 'cashout':{
   if(revealed.some(c=>c.kind==='bomb'))return result(false,'踩雷，本票累计奖金归零');
   const accrued=revealed.reduce((sum,c)=>sum+BigInt(c.value),0n);
   if(t.cashout||full)return result(accrued>0n,'已安全收手',accrued);
   return play('可以继续刮下一格，或现在收手',accrued);
  }
  case 'eye':if(!revealed.length)return play('选一只眼睛刮开');return result(revealed[0].kind==='eye',revealed[0].kind==='eye'?'点中真龙眼！':'不是龙眼，本票结束');
  case 'destiny':if(!revealed.length)return play('只能选择一扇命运之门');
   if(revealed[0].kind==='devil')return {status:'bankrupt',prize:0n,accrued:0n,message:'恶魔降临：本局现金清零'};
   return result(revealed[0].kind==='heaven',revealed[0].kind==='heaven'?'一念天堂，1万亿！':'凡间无奖，本票结束');
  case 'ladder':if(revealed.some(c=>c.kind!=='gate'))return result(false,'选错云门，本票结束');
   return revealed.length>=3?result(true,'登顶天宫，100亿！'):play(`已通过 ${revealed.length}/3 层，从下一层选1门`);
  case 'pair':{
   const pair=revealed.some((c,i)=>revealed.some((b,j)=>i!==j&&c.value===b.value));
   if(pair)return result(true,'两全其美，配对成功！');
   return full?result(false,'没有相同图案'):play('继续刮开寻找相同图案');
  }
  case 'sum':case 'ledger':{
   const total=revealed.reduce((sum,c)=>sum+BigInt(c.value),0n);
   if(!full)return play('已累计 '+total.toString()+'；继续刮开账目',total);
   if(def.mode==='sum')return result(total>=100n,total>=100n?'累计达标！':'未达到100');
   const prize=total>=10000000n?20000000n:total>=6000000n?8000000n:total>=3000000n?4000000n:0n;
   return result(prize>0n,prize?'万利目标达成！':'未达到300万',prize);
  }
  case 'path':{
   const visible=new Set(t.revealed.filter(i=>layout[i].kind==='road'));
   const queue=visible.has(0)?[0]:[],seen=new Set(queue);
   while(queue.length){const i=queue.shift()!;if(i===8)return result(true,'道路连通，宝箱打开！');
    const neighbors=[i-3,i+3,...(i%3?[i-1]:[]),...(i%3<2?[i+1]:[])];
    for(const n of neighbors)if(visible.has(n)&&!seen.has(n)){seen.add(n);queue.push(n);}
   }
   return full?result(false,'道路中断，无法到达宝箱'):play('起点在左上，宝箱在右下');
  }
 }
 if(!full)return play('继续刮开银层');
 switch(def.mode){
  case 'amount':return result(values[0]>0,values[0]?'刮出现金！':'本票未中奖',BigInt(layout[0].value));
  case 'multiply':return result(values[0]*values[1]===21,`${values[0]} × ${values[1]} = ${values[0]*values[1]}`);
  case 'compare':return result(values[0]>values[1],`我方 ${values[0]} ${values[0]>values[1]?'>':values[0]===values[1]?'=':'<'} 对手 ${values[1]}`);
  case 'rise':return result(values[0]<values[1]&&values[1]<values[2],values.join(' → '));
  case 'dice':return result(values[0]===6&&values[1]===6,`骰子 ${values[0]} + ${values[1]}`);
  case 'position':return result(values[0]===7&&values[1]===8,`上 ${values[0]} / 下 ${values[1]}`);
  case 'double':return result(layout[2].kind==='double',layout[2].kind==='double'?'同领两箱奖金！':'未触发同领区',BigInt(layout[0].value)+BigInt(layout[1].value));
  case 'heart':return result(layout[0].kind==='heart',layout[0].kind==='heart'?'金色真心，1亿！':'普通心，无奖');
  case 'hearts':return result(layout.every(c=>c.kind==='heart'),layout.every(c=>c.kind==='heart')?'三颗真心，2亿！':'真心组合未完成');
  default:throw new Error('不支持的票型');
 }
}
export function canScratch(t:TicketInstance,index:number):boolean {
 if(t.settled||!Number.isInteger(index)||index<0||index>=t.committedLayout.length||t.revealed.includes(index))return false;
 const mode=cardDefinition(t.cardId).mode,r=resolveTicket(t);
 if(r.status!=='playing'){
  // Non-decision tickets may finish revealing their already committed layout.
  return ['pair','path'].includes(mode)&&!t.cashout;
 }
 if(mode==='eye'||mode==='destiny')return !t.choices.length||t.choices[0]===index;
 if(mode==='mines')return t.choices.length===t.revealed.length||t.choices[t.revealed.length]===index;
 if(mode==='cashout')return index===t.revealed.length;
 if(mode==='ladder'){
  const row=t.revealed.length;if(Math.floor(index/5)!==row)return false;
  return t.choices[row]===undefined||t.choices[row]===index;
 }
 return true;
}
export function chooseCell(t:TicketInstance,index:number):TicketInstance {
 if(!canScratch(t,index))throw new Error('当前不能刮开这个区域');
 const mode=cardDefinition(t.cardId).mode;
 if(mode==='eye'||mode==='destiny'||mode==='ladder'||mode==='mines'){
  const choices=[...t.choices];choices[mode==='ladder'||mode==='mines'?t.revealed.length:0]=index;
  return {...t,choices};
 }
 return t;
}
export function revealCell(t:TicketInstance,index:number):TicketInstance {
 if(t.revealed.includes(index))return t;
 const chosen=chooseCell(t,index);
 return {...chosen,revealed:[...t.revealed,index]};
}
export function cashOut(t:TicketInstance):TicketInstance {
 if(cardDefinition(t.cardId).mode!=='cashout'||resolveTicket(t).status!=='playing'||!t.revealed.length)throw new Error('请先刮出奖金再收手');
 return {...t,cashout:true};
}
