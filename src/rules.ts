import type {Build} from './build.js';
import type {BossId,TicketId} from './tickets.js';
export type NaturalSymbol = 'star'|'bell'|'leaf'|'gear'|'gem'|'key'|'spark'|'sun'|'moon'|'vault';
export type SymbolKey = NaturalSymbol|'ink'|'prism';
export type CellState = 'hidden' | 'scouted' | 'active';
export type TicketStatus = 'active' | 'accident' | 'settled';

export interface Cell { index: number; symbol: SymbolKey; state: CellState; }
export interface Ticket {
  seed: string; ticketType: TicketId; bossId?:BossId; crafter: string; cells: Cell[];
  regularRemaining: number; extraRemaining: number; scoutRemaining: number;
  pressure: number; extraUsed: number; activatedOrder: number[];
  itemsUsed?:number;itemMultiplier?:number;itemIndependent?:number;
  inkColor?:Exclude<SymbolKey,'ink'>;annotatedCell?:number;inkGuard?:boolean;
  freeSwapUsed?:boolean;stampSwapUsed?:boolean;openCopper?:number;
  extraDiscount?:boolean;extraPenaltyTotal?:number;echoPending?:boolean;echoBonus?:number;
  echoCount?:number;keyScoutUsed?:boolean;
  echoValues?:number[];prescoutedIndices?:number[];leafPressureIndices?:number[];
  lastActivationExtra?:boolean;safetyUsed?:boolean;sparkSeen?:boolean;
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
  ink:  {id:'S06', name:'墨团', icon:'●', base:0, natural:false, color:'#928ba8'},
  key:  {id:'S07', name:'钥匙', icon:'⚿', base:4, natural:true, color:'#e8bd70'},
  spark:{id:'S08', name:'火花', icon:'✺', base:6, natural:true, color:'#ff9573'},
  prism:{id:'S09', name:'棱镜', icon:'◇', base:0, natural:false, color:'#b5a9f3'},
  sun:  {id:'S10', name:'太阳', icon:'☀', base:12, natural:true, color:'#ffc663'},
  moon: {id:'S11', name:'月亮', icon:'☾', base:14, natural:true, color:'#c4caff'},
  vault:{id:'S12', name:'金库', icon:'▣', base:5, natural:true, color:'#87ceaf'}
};
export const INITIAL_PLATE: SymbolKey[] = [
  'star','star','star','star','bell','bell','bell','leaf',
  'leaf','leaf','gear','gear','gem','gem','ink','ink'
];
export const CHALLENGE_TARGETS = [280,440,650,950,1350,1900,2700,3800,5400];
/** Standard commission curve, provisionally calibrated from seeded nine-round bot simulations. */
export const ROUND_TARGETS = [280,420,540,650,760,880,1010,1150,1300];
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
    extraUsed:0,itemsUsed:0,itemMultiplier:0,itemIndependent:1,extraPenaltyTotal:0,echoBonus:0,activatedOrder:[],status:'active',finalScore:null,settled:false
  };
}
export function cloneTicket(ticket: Ticket): Ticket {
  return {...ticket,cells:ticket.cells.map(c=>({...c})),activatedOrder:[...ticket.activatedOrder],
 echoValues:[...(ticket.echoValues??[])],prescoutedIndices:[...(ticket.prescoutedIndices??[])],leafPressureIndices:[...(ticket.leafPressureIndices??[])]};
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
export function activateCell(ticket: Ticket,index: number,{extra=false,build}: {extra?:boolean;build?:Build}={}):Ticket {
  assertPlayable(ticket);
  const next=cloneTicket(ticket);
  const cell=next.cells[index]; if(!cell) throw new Error('无效格子');
  if(cell.state==='active') return next;
  if(extra){
    if(next.regularRemaining>0) throw new Error('免费次数尚未用完');
    if(next.extraRemaining<=0) throw new Error('额外刮开已用完');
    next.extraRemaining-=1;next.extraUsed+=1;next.pressure+=1;
    next.extraPenaltyTotal=(next.extraPenaltyTotal??ticket.extraUsed*.25)+Math.max(0,.25-(build?.stamps.includes('R27')?.10:0))*(next.extraDiscount?.5:1);
  }else{
    if(next.regularRemaining<=0) throw new Error('免费刮开次数已用完');
    next.regularRemaining-=1;
  }
  if(cell.state==='scouted')next.prescoutedIndices!.push(index);
  cell.state='active';next.activatedOrder.push(index);next.lastActivationExtra=extra;
  const recordEcho=(points:number):void=>{
    if(points<=0||(next.echoCount??0)>=16)return;
    next.echoValues!.push(points);next.echoCount=(next.echoCount??0)+1;
    next.echoBonus=(next.echoBonus??0)+points;
  };
  if(cell.symbol==='leaf'){
    if(next.pressure>0&&build?.stamps.includes('R26'))next.leafPressureIndices!.push(index);
    next.pressure=Math.max(0,next.pressure-1);
  }
  if(cell.symbol==='key'&&!next.keyScoutUsed){
    next.scoutRemaining+=1;next.keyScoutUsed=true;
  }
  if(cell.symbol==='spark'){
    const prev=ticket.activatedOrder.slice().reverse().find(i=>SYMBOLS[ticket.cells[i].symbol].natural);
    if(prev!==undefined){
      const echo=symbolInstanceBase(ticket,prev,build);
      recordEcho(echo);
      if(!next.sparkSeen&&ticket.cells[prev].symbol==='gem'&&build?.stamps.includes('R35'))recordEcho(echo);
    }
    next.sparkSeen=true;
  }
  if(cell.symbol==='ink'){
    if(next.inkGuard)next.inkGuard=false;
    else if(!(build?.stamps.includes('R25')&&!ticket.activatedOrder.some(i=>ticket.cells[i].symbol==='ink')))next.pressure+=1;
  }
  if(next.echoPending&&cell.symbol!=='ink'){
    const echo=symbolInstanceBase(next,index,build);
    recordEcho(echo);
    next.echoPending=false;
  }
  if(next.pressure>=3){
    if(build?.stamps.includes('R29')&&!next.safetyUsed){
      next.pressure=2;next.safetyUsed=true;
    }else{
      next.status='accident';
      next.finalScore=calculateScore(next,{accident:true,build}).score;
    }
  }
  return next;
}
export function rowClues(ticket:Ticket):{label:string;symbol:SymbolKey|null;count:number;tied:boolean}[]{
  const clues=[];
  for(let r=0;r<4;r++){
    const counts=new Map<SymbolKey,number>();
    for(let c=0;c<4;c++){
      const sym=ticket.cells[r*4+c].symbol;
      if(SYMBOLS[sym].natural) counts.set(sym,(counts.get(sym)??0)+1);
    }
    if(!counts.size){clues.push({symbol:null,count:0,tied:false,label:'无普通图案'});continue;}
    const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1] || SYMBOLS[a[0]].id.localeCompare(SYMBOLS[b[0]].id));
    const [symbol,count]=sorted[0];const tied=sorted.filter(e=>e[1]===count).length>1;
    clues.push({symbol,count,tied,label:SYMBOLS[symbol].name+' ×'+count+(tied?'（并列）':'')});
  }
  return clues;
}
function symbolInstanceBase(ticket:Ticket,index:number,build?:Build):number{
  const cell=ticket.cells[index];
  const sym=cell.symbol;
  let base=SYMBOLS[sym].base+(SYMBOLS[sym].natural?(build?.levels[sym as NaturalSymbol]??0)*4:0);
  if(ticket.ticketType==='T08'&&SYMBOLS[sym].natural)base+=4;
  if(ticket.inkColor===sym)base+=6;
  if(ticket.ticketType==='T11'&&ticket.activatedOrder.indexOf(index)>=0&&ticket.activatedOrder.indexOf(index)<7&&SYMBOLS[sym].natural)base=Math.max(0,base-3);
  if(ticket.bossId==='B02'&&[0,3,12,15].includes(index))base=0;
  if(ticket.bossId==='B05'&&ticket.activatedOrder.filter(i=>ticket.cells[i].symbol!=='ink').slice(0,2).includes(index))base=0;
  return base;
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
function sunAdjacencyBonus(ticket:Ticket):number{
 let points=0;
 for(const cell of ticket.cells){
  if(cell.state!=='active'||cell.symbol!=='sun')continue;
  const row=Math.floor(cell.index/4),col=cell.index%4;
  for(const [dy,dx] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const y=row+dy,x=col+dx;
   if(y>=0&&y<4&&x>=0&&x<4){
    const other=ticket.cells[y*4+x];
    if(other.state==='active'&&SYMBOLS[other.symbol].natural)points+=4;
   }
  }
 }
 return points;
}
/** A prism only fills three-of-a-kind groups of already revealed natural symbols. */
function prismTriples(counts:Map<SymbolKey,number>,prisms:number):number{
 const values=[...counts.values()];
 if(!prisms||!values.length)return values.reduce((n,c)=>n+Math.floor(c/3),0);
 let dp=Array(prisms+1).fill(-Infinity);dp[0]=0;
 for(const count of values){
  const next=Array(prisms+1).fill(-Infinity);
  for(let used=0;used<=prisms;used++)for(let add=0;used+add<=prisms;add++){
   next[used+add]=Math.max(next[used+add],dp[used]+Math.floor((count+add)/3));
  }
  dp=next;
 }
 return Math.max(...dp);
}
/** Choose a deterministic prism allocation maximizing actual triple groups. */
function assignPrisms(counts:Map<SymbolKey,number>,prisms:number):Map<SymbolKey,number>{
 const keys=[...counts.keys()].sort((a,b)=>SYMBOLS[a].id.localeCompare(SYMBOLS[b].id));
 if(!keys.length)return new Map();
 let dp:Array<{groups:number;alloc:number[]}|null>=Array(prisms+1).fill(null);
 dp[0]={groups:0,alloc:[]};
 for(const key of keys){
  const next:Array<{groups:number;alloc:number[]}|null>=Array(prisms+1).fill(null);
  for(let used=0;used<=prisms;used++)if(dp[used]){
   for(let n=0;used+n<=prisms;n++){
    const candidate={groups:dp[used]!.groups+Math.floor(((counts.get(key)??0)+n)/3),
      alloc:[...dp[used]!.alloc,n]};
    if(!next[used+n]||candidate.groups>next[used+n]!.groups)next[used+n]=candidate;
   }
  }
  dp=next;
 }
 let best=dp[0]!;
 for(const choice of dp)if(choice&&choice.groups>best.groups)best=choice;
 return new Map(keys.map((key,i)=>[key,(counts.get(key)??0)+best.alloc[i]]));
}
function neighborPairs(ticket:Ticket,first:SymbolKey,second:SymbolKey):number{
 let count=0;
 for(const c of ticket.cells){
  if(c.state!=='active'||c.symbol!==first)continue;
  const r=Math.floor(c.index/4),col=c.index%4;
  for(const [dy,dx] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const y=r+dy,x=col+dx;
   if(y>=0&&y<4&&x>=0&&x<4){
    const other=ticket.cells[y*4+x];
    if(other.state==='active'&&other.symbol===second)count++;
   }
  }
 }
 return count;
}
export function calculateScore(ticket:Ticket,{accident=ticket.status==='accident',build}:{accident?:boolean;build?:Build}={}):ScoreResult{
  const active=ticket.cells.filter(c=>c.state==='active');
  const counts=new Map<SymbolKey,number>();
  const type=ticket.ticketType||'T01';
  let symbolBase=0,bellMultiplier=0;
  for(const cell of active){
    const sym=cell.symbol,def=SYMBOLS[sym];
    symbolBase+=symbolInstanceBase(ticket,cell.index,build);
    if(ticket.annotatedCell===cell.index && sym!=='ink')symbolBase+=12;
    if(def.natural) counts.set(sym,(counts.get(sym)??0)+1);
    if(sym==='bell') bellMultiplier+=ticket.bossId==='B03'?.05:.10;
  }
  const assigned=assignPrisms(counts,active.filter(c=>c.symbol==='prism').length);
  const tripleGroups=[...assigned.values()].reduce((sum,n)=>sum+Math.floor(n/3),0);
  const preScouted=(ticket.prescoutedIndices??[]).filter(i=>ticket.cells[i]?.state==='active'&&SYMBOLS[ticket.cells[i].symbol].natural);
  const normal=!accident;
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
  // B04 halves the sum of line B and line-based stamp B, without affecting
  // the number of lines, their triggers, or unrelated stamp bonuses.
  const lineStampBonus=build?.stamps.includes('R09')?lineCount*16:0;
  lineBase=ticket.bossId==='B04'
    ?Math.floor((lineBase+lineStampBonus)/2):lineBase+lineStampBonus;
  const gearBase=gearAdjacencyBonus(ticket,type==='T06'?12:8)+sunAdjacencyBonus(ticket);
  const varietyMultiplier=[...counts.keys()].filter(k=>SYMBOLS[k].natural).length>=4?(type==='T05'?.60:.25):0;
  const crafterBase=(counts.get('star')??0)>0?8:0;
  const ticketBase=type==='T01'&&active.length>=6?10:0;
  const extraPenalty=ticket.extraPenaltyTotal??ticket.extraUsed*.25;
  let buildBonus=0;
  if(type==='T11'&&active.length>=8&&ticket.cells[ticket.activatedOrder[7]]?.symbol!=='ink')buildBonus+=60;
  if(build){
    const owned=new Set(build.stamps);
    if(owned.has('R01')) buildBonus+=(counts.get('star')??0)*4;
    if(owned.has('R03'))buildBonus+=[...counts.values()].filter(n=>n===2).length*8;
    if(owned.has('R11')){
      buildBonus+=active.filter(c=>c.symbol==='gear'&&active.some(other=>other!==c&&other.symbol==='gear'&&
        Math.abs(Math.floor(other.index/4)-Math.floor(c.index/4))+Math.abs(other.index%4-c.index%4)===1)).length*8;
    }
    if(owned.has('R19')&&ticket.status!=='accident')buildBonus+=Math.min(3,ticket.regularRemaining)*8;
    if(owned.has('R44')&&(ticket.openCopper??0)>=10)buildBonus+=15;
    // R09 is included in lineBase so B04 can halve combined line rewards.
    if(owned.has('R41') && counts.size>=4)buildBonus+=20;
    if(owned.has('R02'))buildBonus+=tripleGroups*12;
    if(owned.has('R10'))buildBonus+=active.filter(c=>c.symbol!=='ink'&&[0,3,12,15].includes(c.index)).length*8;
    if(owned.has('R33'))buildBonus+=(counts.get('gem')??0)*6;
    if(owned.has('R06'))buildBonus+=active.filter(c=>c.symbol==='prism').length*8;
    if(owned.has('R22'))buildBonus+=(counts.get('moon')??0)*10;
    // R34 is applied after deriving all nonrecursive settlement echoes.
    if(owned.has('R42'))buildBonus+=(counts.get('sun')??0)*6;
    if(owned.has('R12')){
      const horizontal=new Set(lines.filter(line=>line[1]-line[0]===1).flat());
      const vertical=new Set(lines.filter(line=>line[1]-line[0]===4).flat());
      buildBonus+=[...horizontal].filter(i=>vertical.has(i)).length*12;
    }
    if(owned.has('R18'))buildBonus+=preScouted.length*8;
    if(owned.has('R26'))buildBonus+=(ticket.leafPressureIndices??[]).length*10;
    if(owned.has('R31'))buildBonus+=active.filter(c=>c.symbol==='ink').length*18;
    if(owned.has('R30')&&ticket.lastActivationExtra&&ticket.activatedOrder.length&&
      SYMBOLS[ticket.cells[ticket.activatedOrder[ticket.activatedOrder.length-1]].symbol].natural)buildBonus+=30;
    if(owned.has('R36')){
      for(const step of [3,6,9]){
        const index=ticket.activatedOrder[step-1];
        if(index!==undefined&&SYMBOLS[ticket.cells[index].symbol].natural)buildBonus+=10;
      }
    }
  }
  // Echoes generated during scratches are locked snapshots; settlement echoes
  // are derived without mutating the saved ticket, so previews remain idempotent.
  const historical=[...(ticket.echoValues??[])];
  const derived:number[]=[];
  if(build?.stamps.includes('R07')){
    for(const [sym,count] of assigned){
      if(count<3)continue;
      const relevant=active.filter(c=>c.symbol===sym);
      if(relevant.length)derived.push(Math.max(...relevant.map(c=>symbolInstanceBase(ticket,c.index,build))));
    }
  }
  if(build?.stamps.includes('R38')&&normal){
    const index=[...ticket.activatedOrder].reverse().find(i=>SYMBOLS[ticket.cells[i].symbol].natural);
    if(index!==undefined)derived.push(symbolInstanceBase(ticket,index,build));
  }
  const oldCount=ticket.echoCount??0;
  // Old V0.9 saves may have an aggregate echo tally but no per-source array.
  const available=Math.max(0,16-oldCount);
  const added=derived.filter(n=>n>0).slice(0,available);
  const allEchoes=[...historical,...added];
  const oldEchoB=ticket.echoBonus??0;
  const copied=build?.stamps.includes('R37')?allEchoes.slice(0,Math.min(2,16-allEchoes.length)):[];
  const echoCount=Math.min(16,oldCount+added.length+copied.length);
  const echoB=oldEchoB+added.reduce((a,b)=>a+b,0)+copied.reduce((a,b)=>a+b,0);
  if(build?.stamps.includes('R34'))buildBonus+=echoCount*6;
  const B=symbolBase+gearBase+tripleBase+lineBase+crafterBase+ticketBase+buildBonus+echoB;
  let stampMultiplier=0;
  if(build){
    if(build.stamps.includes('R04')&&(counts.get('bell')??0)>=3)stampMultiplier+=.40;
    if(build.stamps.includes('R20')&&active.length>0&&active.length<=7&&ticket.status!=='accident')stampMultiplier+=.25;
    if(build.stamps.includes('R28')&&ticket.pressure===2&&!accident)stampMultiplier+=.40;
    if(build.stamps.includes('R45')&&counts.size>=5)stampMultiplier+=.50;
    if(build.stamps.includes('R05')&&assigned.size)
      stampMultiplier+=Math.max(...[...assigned.values()].map(n=>Math.floor(n/3)))*.25;
    if(build.stamps.includes('R13')&&(
       lines.filter(line=>line[1]-line[0]===1).length>=2||
       lines.filter(line=>line[1]-line[0]===4).length>=2))stampMultiplier+=.50;
    if(build.stamps.includes('R15'))stampMultiplier+=Math.min(.60,neighborPairs(ticket,'gear','gear')*.075);
    if(build.stamps.includes('R21')&&preScouted.length>=3)stampMultiplier+=.50;
    if(build.stamps.includes('R39'))stampMultiplier+=Math.min(.60,neighborPairs(ticket,'spark','gem')*.20);
  }
  const moonMultiplier=active.length<=7?Math.min(.75,(counts.get('moon')??0)*.25):0;
  const vaultMultiplier=(ticket.openCopper??0)>=10?(counts.get('vault')??0)*.20:0;
  const M=Math.max(.5,1+bellMultiplier+tripleMultiplier+varietyMultiplier+moonMultiplier+vaultMultiplier+stampMultiplier-extraPenalty-(type==='T12'?.20:0)+(ticket.itemMultiplier??0)-(ticket.bossId==='B07'?.75:0));
  const stampX:number[]=[];
  if(build){
    if(build.stamps.includes('R08')&&tripleGroups>=3)stampX.push(2);
    if(build.stamps.includes('R16')&&lines.some(l=>l[1]-l[0]===1)&&lines.some(l=>l[1]-l[0]===4))stampX.push(1.8);
    if(build.stamps.includes('R23')&&ticket.regularRemaining>=2)stampX.push(1.4);
    if(build.stamps.includes('R46')&&counts.size>=5&&!active.some(c=>c.symbol==='ink')&&!accident)stampX.push(1.3);
    if(build.stamps.includes('R48')&&counts.size>=6)stampX.push(1.8);
    if(build.stamps.includes('R24')&&normal&&active.length>=6&&active.length<=7&&
       preScouted.length>=3&&!active.some(c=>c.symbol==='ink'))stampX.push(1.8);
    if(build.stamps.includes('R32')&&normal&&ticket.extraUsed>0&&ticket.pressure===2)stampX.push(2);
    if(build.stamps.includes('R40')&&echoCount>=4)stampX.push(1.75);
  }
  if(ticket.bossId==='B08'&&stampX.length){
    const top=stampX.indexOf(Math.max(...stampX));stampX[top]=Math.min(stampX[top],1.5);
  }
  const X=(ticket.itemIndependent??1)*(type==='T10'?(active.length<=7?1.4:.8):1)*stampX.reduce((result,value)=>result*value,1);
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
