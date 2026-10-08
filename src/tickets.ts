import type {SymbolKey,Ticket} from './rules.js';

export type TicketId='T01'|'T02'|'T03'|'T04'|'T05'|'T06'|'T07'|'T08'|'T12';
export type BossId='B01'|'B02'|'B03';
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
 {id:'T12',name:'满版票',effect:'免费刮力 +2；不可加刮；连线 B +16；M -0.20',strategy:'大范围刮开'}
];
export const BOSSES:Readonly<Record<BossId,{name:string;effect:string}>>={
 B01:{name:'潮湿印辊',effect:'每张票开场压力 +1'},
 B02:{name:'钉角管理员',effect:'四个角格的符号自身基础分变为 0，组合与能力保留'},
 B03:{name:'哑钟巡游者',effect:'每枚铃铛的基础 M 加数从 0.10 降至 0.05'}
};
function hash(text:string):number{
 let h=2166136261>>>0;
 for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
 return h>>>0;
}
export function bossForRound(round:number,seed:string):BossId|undefined{
 if(round!==2)return undefined;
 return (['B01','B02','B03'] as const)[hash(seed+':first-act-boss')%3];
}
export function ticketDefinition(id:TicketId):TicketDef{
 const result=TICKET_TYPES.find(type=>type.id===id);
 if(!result)throw new Error('无效票型 '+id);
 return result;
}
export function ticketCandidates(seed:string,round:number,number:number,plate:readonly SymbolKey[]):TicketDef[]{
 const extra=TICKET_TYPES.filter(type=>type.id!=='T01'&&
   (type.id!=='T06'||plate.filter(sym=>sym==='gear').length>=2));
 let x=hash(seed+':tickets:'+round+':'+number);
 const shuffled=[...extra];
 for(let i=shuffled.length-1;i>0;i--){
   x=(Math.imul(x,1664525)+1013904223)>>>0;
   const j=x%(i+1);
   [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
 }
 return [ticketDefinition('T01'),...shuffled.slice(0,2)];
}
export function applyTicketChoice(ticket:Ticket,id:TicketId,bossId?:BossId):Ticket{
 ticketDefinition(id);
 if(ticket.activatedOrder.length||ticket.settled||ticket.status!=='active'||
    ticket.cells.some(c=>c.state!=='hidden'))throw new Error('已刮开的票不能更换票型');
 const next={...ticket,cells:ticket.cells.map(c=>({...c})),activatedOrder:[...ticket.activatedOrder]};
 next.ticketType=id;
 next.bossId=bossId;
 next.regularRemaining=8+(id==='T07'?1:id==='T08'?-1:id==='T12'?2:0);
 next.extraRemaining=id==='T12'?0:2;
 next.pressure=(id==='T07'?1:0)+(bossId==='B01'?1:0);
 return next;
}
