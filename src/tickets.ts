import type {SymbolKey,Ticket} from './rules.js';
import type {Build} from './build.js';

export type TicketId='T01'|'T02'|'T03'|'T04'|'T05'|'T06'|'T07'|'T08'|'T09'|'T10'|'T11'|'T12';
export type BossId='B01'|'B02'|'B03'|'B04'|'B05'|'B06'|'B07'|'B08'|'B09';
export interface TicketDef {id:TicketId;name:string;effect:string;strategy:string;}
export const TICKET_TYPES:readonly TicketDef[]=[
 {id:'T01',name:'街角经典',effect:'刮开至少 6 格，基础分 +10',strategy:'入门稳定'},
 {id:'T02',name:'横街长票',effect:'横向完整连线 +40，纵向仅 +12',strategy:'追求横排'},
 {id:'T03',name:'竖井长票',effect:'纵向完整连线 +40，横向仅 +12',strategy:'追求纵列'},
 {id:'T04',name:'三响庆典',effect:'每组三响 B +35，M +0.10',strategy:'同色成组'},
 {id:'T05',name:'万花筒',effect:'凑齐四种符号 M +0.60；三响 B 仅 +10',strategy:'多种搭配'},
 {id:'T06',name:'齿轮轨道',effect:'齿轮邻接每对加分提升至 12；不发基础连线分',strategy:'齿轮专精'},
 {id:'T07',name:'深印票',effect:'免费刮力 +1；开票压力 +1',strategy:'冒险多刮'},
 {id:'T08',name:'薄纸票',effect:'免费刮力 -1；每个自然符号基础分 +4',strategy:'精准高分'},
 {id:'T09',name:'折返票',effect:'本票免费交换两枚已激活自然符号一次',strategy:'交换构筑'},
 {id:'T10',name:'月相票',effect:'激活不超过7格 X×1.40，否则 X×0.80',strategy:'提前收手'},
 {id:'T11',name:'压轴票',effect:'前7格自然基础分 -3，第8格自然符号 B+60',strategy:'第八格爆发'},
 {id:'T12',name:'满版票',effect:'免费刮力 +2；不可加刮；连线 B +16；M -0.20',strategy:'大范围刮开'}
];
export const BOSSES:Readonly<Record<BossId,{name:string;effect:string}>>={
 B01:{name:'潮湿印辊',effect:'每张票开场压力 +1'},
 B02:{name:'钉角管理员',effect:'四个角格的符号自身基础分变为 0，组合与能力保留'},
 B03:{name:'哑钟巡游者',effect:'每枚铃铛的基础 M 加数从 0.10 降至 0.05'},
 B04:{name:'弯尺总管',effect:'每张票所有连线基础分和印章连线加分合计减半'},
 B05:{name:'吃墨蜗牛',effect:'前两枚激活的自然符号自身基础分为 0'},
 B06:{name:'雾面玻璃匠',effect:'只显示第 1 行线索；每张票免费显影 +1'},
 B07:{name:'星光税务官',effect:'本票 M 额外 -0.75（仍遵守 M 最低 0.50）'},
 B08:{name:'褪金收藏家',effect:'满足条件的最大一枚印章 X 倍率上限 ×1.50'},
 B09:{name:'断墨巨像',effect:'每张票常规刮力 -1；本轮第一张票显影额外 +2'}
};
function hash(text:string):number{
 let h=2166136261>>>0;
 for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
 return h>>>0;
}
export function bossForRound(round:number,seed:string):BossId|undefined{
 if(round===2)return (['B01','B02','B03'] as const)[hash(seed+':first-act-boss')%3];
 if(round===5)return (['B04','B05','B06'] as const)[hash(seed+':second-act-boss')%3];
 if(round===8)return (['B07','B08','B09'] as const)[hash(seed+':third-act-boss')%3];
 return undefined;
}
export function ticketDefinition(id:TicketId):TicketDef{
 const result=TICKET_TYPES.find(type=>type.id===id);
 if(!result)throw new Error('无效票型 '+id);
 return result;
}
export function ticketCandidates(seed:string,round:number,number:number,plate:readonly SymbolKey[],stamps:readonly string[]=[]):TicketDef[]{
 const extra=TICKET_TYPES.filter(type=>type.id!=='T01'&&
   (type.id!=='T06'||plate.filter(sym=>sym==='gear').length>=2)&&
   (type.id!=='T10'||plate.includes('moon')||stamps.includes('R20')||stamps.includes('R23')));
 let x=hash(seed+':tickets:'+round+':'+number);
 const shuffled=[...extra];
 for(let i=shuffled.length-1;i>0;i--){
   x=(Math.imul(x,1664525)+1013904223)>>>0;
   const j=x%(i+1);
   [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
 }
 return [ticketDefinition('T01'),...shuffled.slice(0,2)];
}
export function applyTicketChoice(ticket:Ticket,id:TicketId,bossId?:BossId,firstInRound=false):Ticket{
 ticketDefinition(id);
 if(ticket.activatedOrder.length||ticket.settled||ticket.status!=='active'||
    ticket.cells.some(c=>c.state!=='hidden'))throw new Error('已刮开的票不能更换票型');
 const next={...ticket,cells:ticket.cells.map(c=>({...c})),activatedOrder:[...ticket.activatedOrder]};
 next.ticketType=id;
 next.bossId=bossId;
 next.regularRemaining=8+(id==='T07'?1:id==='T08'?-1:id==='T12'?2:0)-(bossId==='B09'?1:0);
 next.extraRemaining=id==='T12'?0:2;
 next.pressure=(id==='T07'?1:0)+(bossId==='B01'?1:0);
 if(bossId==='B06')next.scoutRemaining+=1;
 if(bossId==='B09'&&firstInRound)next.scoutRemaining+=2;
 return next;
}

/** Free exchange on T09; independent of the paid I08 consumable. */
export function swapTicket(ticket:Ticket,first:number,second:number,source:'ticket'|'stamp'='ticket',build?:Build):Ticket{
 if(ticket.status!=='active'||ticket.settled)throw new Error('本票已经结算');
 if(source==='ticket'&&(ticket.ticketType!=='T09'||ticket.freeSwapUsed))throw new Error('本票没有剩余免费交换');
 if(source==='stamp'&&!build?.stamps.includes('R14'))throw new Error('未装备活字滑轨印章');
 if(source==='stamp'&&ticket.stampSwapUsed)throw new Error('本票印章交换已用');
 if(first===second||![first,second].every(i=>
  Number.isInteger(i)&&i>=0&&i<16&&ticket.cells[i].state==='active'&&ticket.cells[i].symbol!=='ink'
 ))throw new Error('只能交换两个不同的已激活非墨团格');
 const cells=ticket.cells.map(c=>({...c}));
 [cells[first].symbol,cells[second].symbol]=[cells[second].symbol,cells[first].symbol];
 return {...ticket,cells,freeSwapUsed:source==='ticket'?true:ticket.freeSwapUsed,
  stampSwapUsed:source==='stamp'?true:ticket.stampSwapUsed};
}
