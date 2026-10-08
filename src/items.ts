import {cloneTicket,type Ticket} from './rules.js';
import {copyBuild,type Build} from './build.js';

export type ItemId='I01'|'I02'|'I03'|'I06'|'I07';
export interface ItemDef {id:ItemId;name:string;description:string;price:number;icon:string;}
export const ITEMS:readonly ItemDef[]=[
 {id:'I01',name:'冷风瓶',description:'压力降低 1（压力为 0 时不可使用）',price:3,icon:'❄'},
 {id:'I02',name:'显影液',description:'本张票免费显影机会 +2',price:3,icon:'👁'},
 {id:'I03',name:'新刮片',description:'本张票常规刮力 +1（常规总量上限 12）',price:4,icon:'✂'},
 {id:'I06',name:'铜铃绳',description:'本张票倍率 M +0.30',price:4,icon:'♫'},
 {id:'I07',name:'烫金缎带',description:'本张票正常结算独立倍率 X ×1.25',price:5,icon:'✦'}
];
export function itemDef(id:ItemId):ItemDef{
 const found=ITEMS.find(v=>v.id===id);
 if(!found)throw new Error('不存在的道具 '+id);
 return found;
}
export function itemOffer(seed:string,round:number):ItemId {
 let h=2166136261>>>0;
 for(const c of seed+':tools:'+round){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return ITEMS[(h>>>0)%ITEMS.length].id;
}
export function buyItem(build:Build,id:ItemId):Build {
 const def=itemDef(id);
 if((build.items??[]).length>=2)throw new Error('背包已满（最多2件）');
 if(build.copper<def.price)throw new Error('铜券不足');
 const b=copyBuild(build);
 b.copper-=def.price;
 b.items.push(id);
 return b;
}
export function canUseItem(ticket:Ticket,id:ItemId):boolean {
 if(ticket.status!=='active'||ticket.settled||((ticket.itemsUsed??0)>=2))return false;
 if(id==='I01')return ticket.pressure>0;
 if(id==='I02')return ticket.cells.some(c=>c.state==='hidden')||ticket.cells.some(c=>c.state==='scouted');
 if(id==='I03'){
  const normalUsed=ticket.activatedOrder.length-ticket.extraUsed;
  return normalUsed+ticket.regularRemaining<12;
 }
 return true;
}
export function useItem(build:Build,ticket:Ticket,id:ItemId):{build:Build;ticket:Ticket} {
 itemDef(id);
 if(!(build.items??[]).includes(id))throw new Error('背包没有该道具');
 if(!canUseItem(ticket,id))throw new Error('当前状态无法使用此道具');
 const next=cloneTicket(ticket), b=copyBuild(build);
 b.items.splice(b.items.indexOf(id),1);
 next.itemsUsed=(next.itemsUsed??0)+1;
 switch(id){
  case 'I01':next.pressure=Math.max(0,next.pressure-1);break;
  case 'I02':next.scoutRemaining+=2;break;
  case 'I03':next.regularRemaining++;break;
  case 'I06':next.itemMultiplier=(next.itemMultiplier??0)+.30;break;
  case 'I07':next.itemIndependent=(next.itemIndependent??1)*1.25;break;
 }
 return {build:b,ticket:next};
}
