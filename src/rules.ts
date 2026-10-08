import type {Build} from './build.js';
import type {BossId,TicketId} from './tickets.js';
export type SymbolKey = 'star' | 'bell' | 'leaf' | 'gear' | 'gem' | 'ink';
export type CellState = 'hidden' | 'scouted' | 'active';
export type TicketStatus = 'active' | 'accident' | 'settled';

export interface Cell { index: number; symbol: SymbolKey; state: CellState; }
export interface Ticket {
  seed: string; ticketType: TicketId; bossId?:BossId; crafter: string; cells: Cell[];
  regularRemaining: number; extraRemaining: number; scoutRemaining: number;
  pressure: number; extraUsed: number; activatedOrder: number[];
  status: TicketStatus; finalScore: number | null; settled: boolean;
}
export interface ScoreResult {
  score: number; B: number; M: number; X: number; accident: boolean;
  breakdown: {
    activeCount: number; symbolBase: number; gearBase: number;
    tripleGroups: number; tripleBase: number; lineCount: number; lineBase: number;
    crafterBase: number; ticketBase: number; buildBonus:number; bellMultiplier: number;
    tripleMultiplier: number; varietyMultiplier: number; extraPenalty: number;
  };
}
export const SYMBOLS: Record<SymbolKey, { id:string; name:string; icon:string; base:number; natural:boolean; color:string }> = {
  star: {id:'S01', name:'星星', icon:'★', base:10, natural:true, color:'#f7bf4e'},
  bell: {id:'S02', name:'铃铛', icon:'♫', base:6, natural:true, color:'#e78ddd'},
  leaf: {id:'S03', name:'叶片', icon:'❧', base:6, natural:true, color:'#58d8ab'},
  gear: {id:'S04', name:'齿轮', icon:'⚙', base:8, natural:true, color:'#88b8e8'},
  gem:  {id:'S05', name:'宝石', icon:'◆', base:20, natural:true, color:'#85d2ff'},
  ink:  {id:'S06', name:'墨团', icon:'●', base:0, natural:false, color:'#928ba8'}
};
export const INITIAL_PLATE: SymbolKey[] = [
  'star','star','star','star','bell','bell','bell','leaf',
  'leaf','leaf','gear','gear','gem','gem','ink','ink'
];
export const ROUND_TARGETS = [280,440,650,950,1350,1900,2700,3800,5400];
function hashSeed(text: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h,16777619); }
  return h >>> 0;
}
function mulberry32(seed: number): () => number {
  return () => {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function shuffledPlate(seed: string, source:readonly SymbolKey[]=INITIAL_PLATE): SymbolKey[] {
  const random = mulberry32(hashSeed(String(seed)));
  const plate = [...source];
  for (let i=plate.length-1;i>0;i--) {
    const j = Math.floor(random()*(i+1));
    [plate[i],plate[j]] = [plate[j],plate[i]];
  }
  return plate;
}
export function createTicket(seed='demo-1', layoutOverride: SymbolKey[] | null=null): Ticket {
  const layout = layoutOverride ? [...layoutOverride] : shuffledPlate(seed);
  if (layout.length !== 16 || layout.some(s=>!SYMBOLS[s])) throw new Error('Invalid 16-cell plate.');
  return {
    seed:String(seed), ticketType:'T01', crafter:'C01',
    cells:layout.map((symbol,index)=>({index,symbol,state:'hidden' as CellState})),
    regularRemaining:8,extraRemaining:2,scoutRemaining:1,pressure:0,
    extraUsed:0,activatedOrder:[],status:'active',finalScore:null,settled:false
  };
}
export function cloneTicket(ticket: Ticket): Ticket {
  return {...ticket,cells:ticket.cells.map(c=>({...c})),activatedOrder:[...ticket.activatedOrder]};
}
function assertPlayable(ticket: Ticket): void {
  if (ticket.status!=='active' || ticket.settled) throw new Error('本张票已经结束');
}
export function scoutCell(ticket: Ticket,index: number): Ticket {
  assertPlayable(ticket);
  const next=cloneTicket(ticket);
  if(next.scoutRemaining<=0) throw new Error('免费偷看已用完');
  const cell=next.cells[index]; if(!cell) throw new Error('无效格子');
  if(cell.state!=='hidden') return next;
  cell.state='scouted'; next.scoutRemaining-=1;
  return next;
}
export function activateCell(ticket: Ticket,index: number,{extra=false}: {extra?:boolean}={}):Ticket {
  assertPlayable(ticket);
  const next=cloneTicket(ticket);
  const cell=next.cells[index]; if(!cell) throw new Error('无效格子');
  if(cell.state==='active') return next;
  if(extra){
    if(next.regularRemaining>0) throw new Error('免费次数尚未用完');
    if(next.extraRemaining<=0) throw new Error('额外刮开已用完');
    next.extraRemaining-=1;next.extraUsed+=1;next.pressure+=1;
  }else{
    if(next.regularRemaining<=0) throw new Error('免费刮开次数已用完');
    next.regularRemaining-=1;
  }
  cell.state='active';next.activatedOrder.push(index);
  if(cell.symbol==='leaf') next.pressure=Math.max(0,next.pressure-1);
  if(cell.symbol==='ink') next.pressure+=1;
  if(next.pressure>=3){next.status='accident';next.finalScore=calculateScore(next,{accident:true}).score;}
  return next;
}
export function rowClues(ticket:Ticket):{label:string;symbol:SymbolKey|null;count:number;tied:boolean}[]{
  const clues=[];
  for(let r=0;r<4;r++){
    const counts=new Map<SymbolKey,number>();
    for(let c=0;c<4;c++){
      const sym=ticket.cells[r*4+c].symbol;
      if(sym!=='ink') counts.set(sym,(counts.get(sym)??0)+1);
    }
    if(!counts.size){clues.push({symbol:null,count:0,tied:false,label:'无普通图案'});continue;}
    const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1] || SYMBOLS[a[0]].id.localeCompare(SYMBOLS[b[0]].id));
    const [symbol,count]=sorted[0];const tied=sorted.filter(e=>e[1]===count).length>1;
    clues.push({symbol,count,tied,label:SYMBOLS[symbol].name+' ×'+count+(tied?'（并列）':'')});
  }
  return clues;
}
function validLines(ticket:Ticket):number[][]{
  const lines:number[][]=[];
  for(let r=0;r<4;r++) lines.push([r*4,r*4+1,r*4+2,r*4+3]);
  for(let c=0;c<4;c++) lines.push([c,c+4,c+8,c+12]);
  return lines.filter(line=>line.every(i=>ticket.cells[i].state==='active' && ticket.cells[i].symbol!=='ink'));
}
function gearAdjacencyBonus(ticket:Ticket,perNeighbor=8):number{
  let bonus=0;const dirs=[[1,0],[-1,0],[0,1],[0,-1]];
  for(const cell of ticket.cells){
    if(cell.state!=='active'||cell.symbol!=='gear') continue;
    const r=Math.floor(cell.index/4),c=cell.index%4;let near=0;
    for(const [dy,dx] of dirs){
      const y=r+dy,x=c+dx;
      if(y<0||y>3||x<0||x>3) continue;
      const other=ticket.cells[y*4+x];
      if(other.state==='active' && other.symbol==='gear') near++;
    }
    bonus+=Math.min(2,near)*perNeighbor;
  }
  return bonus;
}
export function calculateScore(ticket:Ticket,{accident=ticket.status==='accident',build}:{accident?:boolean;build?:Build}={}):ScoreResult{
  const active=ticket.cells.filter(c=>c.state==='active');
  const counts=new Map<SymbolKey,number>();
  const type=ticket.ticketType||'T01';
  let symbolBase=0,bellMultiplier=0;
  for(const cell of active){
    const sym=cell.symbol,def=SYMBOLS[sym];
    let base=def.base+(sym!=='ink'?(build?.levels[sym]??0)*4:0);
    if(type==='T08' && sym!=='ink')base+=4;
    if(ticket.bossId==='B02' && [0,3,12,15].includes(cell.index))base=0;
    symbolBase+=base;
    if(sym!=='ink') counts.set(sym,(counts.get(sym)??0)+1);
    if(sym==='bell') bellMultiplier+=ticket.bossId==='B03'?.05:.10;
  }
  const tripleGroups=[...counts.values()].reduce((n,c)=>n+Math.floor(c/3),0);
  const tripleBase=tripleGroups*(type==='T04'?35:type==='T05'?10:20);
  const tripleMultiplier=tripleGroups*(type==='T04'?.10:.20);
  const lines=validLines(ticket);
  const lineCount=lines.length;
  let lineBase=0;
  for(const line of lines){
    const horizontal=line[1]-line[0]===1;
    if(type==='T02')lineBase+=horizontal?40:12;
    else if(type==='T03')lineBase+=horizontal?12:40;
    else if(type==='T06')lineBase+=0;
    else if(type==='T12')lineBase+=16;
    else lineBase+=24;
  }
  const gearBase=gearAdjacencyBonus(ticket,type==='T06'?12:8);
  const varietyMultiplier=[...counts.keys()].filter(k=>SYMBOLS[k].natural).length>=4?(type==='T05'?.60:.25):0;
  const crafterBase=(counts.get('star')??0)>0?8:0;
  const ticketBase=type==='T01'&&active.length>=6?10:0;
  const extraPenalty=ticket.extraUsed*.25;
  let buildBonus=0;
  if(build){
    const owned=new Set(build.stamps);
    if(owned.has('R01')) buildBonus+=(counts.get('star')??0)*4;
    if(owned.has('R09')) buildBonus+=lineCount*16;
    if(owned.has('R41') && counts.size>=4)buildBonus+=20;
    if(owned.has('R02'))buildBonus+=tripleGroups*12;
    if(owned.has('R10'))buildBonus+=active.filter(c=>c.symbol!=='ink'&&[0,3,12,15].includes(c.index)).length*8;
    if(owned.has('R33'))buildBonus+=(counts.get('gem')??0)*6;
  }
  const B=symbolBase+gearBase+tripleBase+lineBase+crafterBase+ticketBase+buildBonus;
  const M=Math.max(.5,1+bellMultiplier+tripleMultiplier+varietyMultiplier-extraPenalty-(type==='T12'?.20:0));
  const X=1;
  const score=accident?Math.floor(B*.40):Math.floor(B*M*X+1e-9);
  return {score,B,M,X,accident,breakdown:{
    activeCount:active.length,symbolBase,gearBase,tripleGroups,tripleBase,lineCount,
    lineBase,crafterBase,ticketBase,buildBonus,bellMultiplier,tripleMultiplier,
    varietyMultiplier,extraPenalty
  }};
}
export function settleTicket(ticket:Ticket,build?:Build):Ticket{
  if(ticket.settled) return cloneTicket(ticket);
  if(!ticket.activatedOrder.length) throw new Error('请先刮开至少一格');
  const next=cloneTicket(ticket),accident=next.status==='accident';
  next.finalScore=calculateScore(next,{accident,build}).score;
  next.status=accident?'accident':'settled';next.settled=true;
  return next;
}
