import {CARDS,cardDefinition,formatMoney,DRAFT_PROBABILITIES,type CardId} from './idiom/config.js';
import {canScratch,resolveTicket} from './idiom/resolver.js';
import {newGame,loadGame,purchaseTicket,startScratch,scratchCell,settleActive,stopAndCollect,recoveryCash,serializeGame,upgradeTech,SAVE_KEY,type GameState} from './idiom/wallet.js';
import {TECHS,TECH_INFO,COSTS,MILESTONES,growthModel,scratchTool,zeroLevels} from './idiom/growth.js';
import {ScratchLayer} from './scratch.js';
import {buyMachine,configureMachine,enqueueMachine,clearMachineQueue,pauseMachine,resetMachineSession,startMachine,advanceMachine,claimMachine,machineOwnsTicket,MACHINE_LEVELS} from './idiom/machine.js';
import type {TicketCell} from './idiom/generator.js';

declare const Laya:any;
const W=750,H=1334;
const C={bg:'#141c2c',paper:'#f6e9ca',ink:'#384254',gold:'#edc580',muted:'#a9b9cc'};
const root=document.getElementById('game-root') as HTMLDivElement;
const foilRoot=document.getElementById('scratch-root') as HTMLDivElement;
const loadError=document.getElementById('load-error')!;
const foil=new ScratchLayer(foilRoot);
const qa=new URLSearchParams(location.search).get('qa')==='1';
let state:GameState=newGame(crypto.randomUUID()),selected:CardId='T01';
let scene:any,screen:'catalog'|'ticket'|'records'|'growth'|'machine'='catalog',riskDialog=false;
let notice='',legacyFound=false;
let writer=qa,lastSaved='',releaseWriter:(()=>void)|undefined,lastTick=0;
const controls=document.createElement('div');controls.id='idiom-controls';root.appendChild(controls);
const money=(n:bigint)=>formatMoney(n)+'元';
const multiplier=(bps:number)=>(bps/10000).toFixed(4).replace(/0+$/,'').replace(/\.$/,'');
function sizeToWindow():void {
 const scale=Math.min(innerWidth/W,innerHeight/H);root.style.transform=`scale(${scale})`;
 root.style.left=Math.round((innerWidth-W*scale)/2)+'px';root.style.top=Math.round((innerHeight-H*scale)/2)+'px';
}
function text(x:number,y:number,value:string,size=26,color=C.paper,width=600,align='left',bold=false):any {
 const t=new Laya.Text();t.text=value;t.font='Microsoft YaHei';t.fontSize=size;t.color=color;
 t.width=width;t.height=size+20;t.align=align;t.valign='middle';t.bold=bold;t.pos(x,y);scene.addChild(t);return t;
}
function panel(x:number,y:number,w:number,h:number,color:string,r=24,line?:string):any {
 const s=new Laya.Sprite();s.graphics.drawRoundRect(0,0,w,h,r,r,r,r,color,line??color,line?2:0);
 s.pos(x,y);scene.addChild(s);return s;
}
function save():void {
 if(qa||!writer)return;
 try{lastSaved=serializeGame(state);localStorage.setItem(SAVE_KEY,lastSaved);}
 catch{state=pauseMachine(state,'无法保存进度，机器已暂停');notice='当前浏览器无法保存进度，机器已暂停。';}
}
function update(action:(s:GameState)=>GameState,resetFoil=false):void {
 if(!writer){notice='此页只读：另一个游戏页面正在操作，请先关闭它再刷新。';render();return;}
 try{const next=action(state),fortune=next.progression.earned-state.progression.earned;
  if(resetFoil)foil.clear();state=next;notice=fortune>0?'首次里程碑达成 · 获得 '+fortune+' 福运点':'';save();render();}
 catch(e){notice=e instanceof Error?e.message:String(e);render();}
}
function actionButton(title:string,action:()=>void,disabled=false,className=''):HTMLButtonElement {
 const b=document.createElement('button');b.type='button';b.className='idiom-btn '+className;b.textContent=title;
 b.disabled=disabled;b.addEventListener('click',action);return b;
}
function box(className:string):HTMLDivElement {const d=document.createElement('div');d.className=className;return d;}
function p(parent:HTMLElement,value:string,className=''):HTMLElement {
 const e=document.createElement('p');e.className=className;e.textContent=value;parent.appendChild(e);return e;
}
function tone(kind:'win'|'lose'|'reveal'):void {
 try{const ctx=new AudioContext(),g=ctx.createGain(),o=ctx.createOscillator(),t=ctx.currentTime;
  o.type='sine';o.frequency.setValueAtTime(kind==='lose'?190:kind==='win'?620:460,t);
  o.frequency.exponentialRampToValueAtTime(kind==='lose'?90:kind==='win'?930:540,t+.12);
  g.gain.setValueAtTime(.06,t);g.gain.exponentialRampToValueAtTime(.001,t+.18);
  o.connect(g);g.connect(ctx.destination);o.start();o.stop(t+.2);o.onended=()=>{void ctx.close();};
 }catch{/* Audio does not affect payouts. */}
}
function buy():void {
 if(selected==='T18'&&!riskDialog){riskDialog=true;render();return;}
 update(s=>purchaseTicket(s,selected,riskDialog),true);
 riskDialog=false;if(state.active?.cardId===selected&&!state.active.settled){screen='ticket';render();}
}
function onReveal(index:number,nonce:string):void {
 if(state.active?.nonce!==nonce||state.active.settled||machineOwnsTicket(state))return;
 update(s=>{
  const next=scratchCell(s,index),r=resolveTicket(next.active!);
  tone(r.status==='won'?'win':r.status==='lost'||r.status==='bankrupt'?'lose':'reveal');
  return r.status==='lost'||r.status==='bankrupt'?settleActive(next):next;
 });
}
function growthSummary(id:CardId,levels=state.progression.levels):string {
 const m=growthModel(id,levels),mode=cardDefinition(id).mode;
 const probability=(p:number)=>(p*100).toFixed(2)+'%';
 let pool=DRAFT_PROBABILITIES[id];
 if(m.winChance>0)pool=(mode==='eye'?'有真眼 '+probability(m.winChance)+' · 盲选中奖 '+probability(m.winChance/3):'中奖 '+probability(m.winChance));
 if(m.tiers.length)pool+=' · 中奖后最高档 '+probability(m.tiers.at(-1)!);
 if(mode==='cashout')pool='每步安全 '+m.safety.map(probability).join(' / ');
 return pool+' · 奖金 ×'+multiplier(m.bonusBps);
}
interface Slot {index:number;x:number;y:number;size:number;label:string;heart?:boolean;}
function slots(id:CardId):Slot[] {
 const mode=cardDefinition(id).mode;
 const row=(count:number,size=170,y=630):Slot[]=>Array.from({length:count},(_,index)=>({index,size,x:(W-count*size-(count-1)*28)/2+index*(size+28),y,label:`第${index+1}格`}));
 const grid=(count:number,columns:number,size:number,y:number,gap=26):Slot[]=>Array.from({length:count},(_,index)=>({index,size,x:(W-columns*size-(columns-1)*gap)/2+index%columns*(size+gap),y:y+Math.floor(index/columns)*(size+gap+35),label:`第${index+1}格`}));
 switch(mode){
  case 'amount':return [{index:0,x:240,y:590,size:270,label:'刮开金额'}];
  case 'heart':return [{index:0,x:235,y:580,size:280,label:'寻找金色真心',heart:true}];
  case 'pair':return row(3).map(s=>({...s,label:'福运图案'}));
  case 'multiply':return row(2,215).map(s=>({...s,label:s.index?'右侧数字':'左侧数字'}));
  case 'compare':return row(2,215).map(s=>({...s,label:s.index?'对手数字':'我方数字'}));
  case 'dice':return row(2,215).map(s=>({...s,label:`骰子${s.index+1}`}));
  case 'rise':return row(3,165).map(s=>({...s,y:775-s.index*92,label:`台阶${s.index+1}`}));
  case 'sum':return grid(4,2,190,485).map(s=>({...s,label:`第${s.index+1}笔金额`}));
  case 'position':return [{index:0,x:280,y:485,size:190,label:'上方'},{index:1,x:280,y:755,size:190,label:'下方'}];
  case 'mines':return grid(10,5,100,610,20).map(s=>({...s,label:`选${s.index+1}`}));
  case 'path':return grid(9,3,125,495,28).map(s=>({...s,label:s.index===0?'起点':s.index===8?'宝箱':'道路'}));
  case 'cashout':return grid(6,3,170,535).map(s=>({...s,label:`第${s.index+1}步`}));
  case 'ledger':return grid(6,3,170,535).map(s=>({...s,label:`账目${s.index+1}`}));
  case 'double':return row(3).map(s=>({...s,label:s.index===2?'同领区':`宝箱${s.index+1}`}));
  case 'eye':return row(3).map(s=>({...s,label:`龙眼${s.index+1}`}));
  case 'hearts':return row(3).map(s=>({...s,label:`真心${s.index+1}`,heart:true}));
  case 'destiny':return row(3).map(s=>({...s,label:`命运门${s.index+1}`}));
  case 'ladder':return grid(15,5,100,500,20).map(s=>({...s,y:900-Math.floor(s.index/5)*180,label:`${Math.floor(s.index/5)+1}层·${s.index%5+1}门`}));
 }
}
function cellLabel(c:TicketCell):string {
 if(c.kind==='money')return money(BigInt(c.value));
 if(c.kind==='heart')return '金心';if(c.kind==='empty'&&c.value==='心')return '普心';
 return c.value;
}
function ticketView():void {
 const t=state.active;if(!t)return;const def=cardDefinition(t.cardId),r=resolveTicket(t);
 const shownAccrued=def.mode==='sum'||def.mode==='ledger'?t.revealed.reduce((sum,i)=>sum+BigInt(t.committedLayout[i].value),0n):r.status==='won'?r.prize:r.accrued;
 panel(42,225,666,908,'#080d1744',32);panel(34,210,682,908,C.paper,32,'#cfb07d');
 panel(34,210,682,166,def.color,30);panel(34,295,682,82,def.color,0);
 text(65,225,def.id+'  /  成语刮刮卡',22,C.ink,580);
 text(65,267,def.name,51,C.ink,580,'left',true);
 text(65,333,'票价 '+money(def.price)+'     基础最高 '+money(def.headlinePrize),22,C.ink,620);
 text(66,390,def.rule,25,C.ink,618,'center',true);
 const tool=scratchTool(t.growth?.scratch??0),model=growthModel(t.cardId,t.growth??zeroLevels());
 const hint=text(66,430,def.hint+'\n'+tool.name+' Lv.'+(t.growth?.scratch??0)+' · 本票奖金 ×'+multiplier(model.bonusBps),19,'#6c6d6c',618,'center');hint.wordWrap=true;hint.height=55;
 if(def.mode==='multiply')text(336,691,'×',38,C.ink,78,'center',true);
 if(def.mode==='compare')text(336,691,'VS',29,C.ink,78,'center',true);
 if(def.mode==='sum')text(100,970,'目标 100  ·  当前 '+shownAccrued.toString(),24,C.ink,550,'center',true);
 if(def.mode==='ledger')text(80,1023,'累计 '+money(shownAccrued)+'  /  目标 300万',22,C.ink,590,'center',true);
 if(def.mode==='mines')text(90,530,'3次安全即中奖  ·  4枚雷 / 10格',24,C.ink,570,'center',true);
 if(def.mode==='cashout')text(80,1023,'已累计 '+money(shownAccrued)+'  ·  '+(t.settled?'本票已结算':'可随时收手'),24,C.ink,590,'center',true);
 if(def.mode==='ladder')text(88,480,'从最下层开始，每层只能选1门',22,C.ink,574,'center',true);
 for(const slot of slots(t.cardId)){
  const c=t.committedLayout[slot.index],open=t.revealed.includes(slot.index),allowed=canScratch(t,slot.index),dim=!open&&!allowed;
  panel(slot.x-5,slot.y-5,slot.size+10,slot.size+10,open?(c.kind==='bomb'||c.kind==='devil'?'#e9b1a6':'#d2dfc1'):'#e0d2b4',18,'#c4ad7f');
  const color=c.kind==='bomb'||c.kind==='devil'?'#953f3b':c.kind==='heart'||c.kind==='heaven'?'#a77918':C.ink;
  text(slot.x,slot.y+slot.size*.33,cellLabel(c),slot.size<=105?32:slot.size<200?34:48,color,slot.size,'center',true);
  text(slot.x-10,slot.y+slot.size+7,slot.label,18,C.ink,slot.size+20,'center');
  if(!open&&!t.settled){
   const nonce=t.nonce;
   foil.add({...slot,onFinished:i=>onReveal(i,nonce),canStart:()=>writer&&!machineOwnsTicket(state)&&state.active?.nonce===nonce&&canScratch(state.active,slot.index),
    onStarted:i=>update(s=>startScratch(s,i)),shape:slot.heart?'heart':undefined,brushWidth:tool.width});
   foil.setCellEnabled(slot.index,allowed&&writer&&!machineOwnsTicket(state));
   const canvas=foilRoot.querySelector<HTMLCanvasElement>(`canvas[data-index="${slot.index}"]`);
   if(canvas)canvas.style.filter=dim?'brightness(.78)':'none';
  }else if(!open){
   panel(slot.x,slot.y,slot.size,slot.size,'#aab1ba',16);text(slot.x,slot.y+slot.size*.3,'未选择',slot.size<120?20:28,'#596474',slot.size,'center');
  }
 }
 if(r.status!=='playing'){
  panel(64,1056,622,47,r.status==='won'?'#dfd9ad':r.status==='bankrupt'?'#e8b7a7':'#e4d9c1',12);
  text(76,1058,r.status==='won'?'中奖 '+money(r.prize)+(t.settled?' · 已到账':' · 待领取'):r.message,25,r.status==='bankrupt'?'#963f35':C.ink,598,'center',true);
 }
 root.dataset.card=t.cardId;root.dataset.status=r.status;root.dataset.settled=String(t.settled);
}
function renderCatalog():void {
 const scroll=box('idiom-catalog');controls.appendChild(scroll);
 const intro=box('idiom-intro');p(intro,'一张成语 · 一句规则','idiom-title');
 p(intro,'选一张卡，买票后在银层上来回刮。所有金额均为游戏内虚拟现金。');scroll.appendChild(intro);
 const grid=box('idiom-card-grid');scroll.appendChild(grid);
 CARDS.forEach((def,i)=>{
  const unlocked=i<state.unlockedCount,b=document.createElement('button');b.type='button';
  b.className='idiom-card'+(unlocked?'':' locked')+(def.id===selected?' selected':'');b.dataset.cardId=def.id;b.style.setProperty('--accent',def.color);
  p(b,def.id+' · '+(i<6?'入门':i<12?'发展':i<16?'冲刺':'终极'),'idiom-tier');p(b,def.name,'idiom-card-name');p(b,'票价 '+money(def.price),'idiom-price');
  p(b,def.rule,'idiom-rule');p(b,'基础最高 '+money(def.headlinePrize),'idiom-prize');
  p(b,unlocked?`已完成 ${state.stats[def.id]?.played??0} 张 · 中奖 ${state.stats[def.id]?.won??0} 次`:'解锁：前一卡完成3张 + 最高现金'+money(def.price*2n),'idiom-lock');
  b.addEventListener('click',()=>{selected=def.id;notice=unlocked?'':'这张卡尚未解锁，先完成前一卡与财富目标';render();});grid.appendChild(b);
 });
}
function renderRecords():void {
 const scroll=box('idiom-catalog');controls.appendChild(scroll);
 p(scroll,'刮奖记录','idiom-title');p(scroll,'本轮已购 '+state.bought+' 张 · 历史最高现金 '+money(state.peak));
 if(!state.history.length)p(scroll,'刮完第一张卡，记录会显示在这里。');
 for(const receipt of state.history){const d=box('idiom-receipt');p(d,cardDefinition(receipt.cardId).name+' · '+(receipt.status==='bankrupt'?'本局破产':receipt.prize>0n?'中奖 '+money(receipt.prize):'未中奖'));
  p(d,receipt.nonce.split(':').pop()+'号票 · 已结算','idiom-lock');scroll.appendChild(d);}
 p(scroll,'首次里程碑奖励福运点；可在「永久成长」升级，或在「自动机器」设置批次和策略。');
 if(legacyFound){p(scroll,'旧版进度已保留，可以继续访问历史版本。');const a=document.createElement('a');a.href='./legacy.html';a.textContent='打开旧版4×4玩法';a.className='idiom-legacy';scroll.appendChild(a);}
}
function renderGrowth():void {
 const scroll=box('idiom-catalog idiom-growth');controls.appendChild(scroll);
 const progression=state.progression;
 p(scroll,'永久成长','idiom-title');p(scroll,'可用 '+progression.points+' 福运点 · 累计获得 '+progression.earned+' 点','idiom-growth-balance');
 p(scroll,'升级只影响新购票。普通奖池的三项增益共同受98%理论返奖上限约束，按卡种折算；单奖档不受爆率影响。','idiom-lock');
 p(scroll,'奖金增益的不足1元部分，按比例随票锁定补足1元；刮开后不会重新计算。','idiom-lock');
 for(const tech of TECHS){
  const row=box('idiom-tech');row.dataset.tech=tech;const level=progression.levels[tech],info=TECH_INFO[tech];
  p(row,info.name+'  Lv.'+level+'/10','idiom-tech-name');p(row,info.description);
  const next=tech==='scratch'?scratchTool(Math.min(level+1,10)):null;
  if(next)p(row,'当前 '+scratchTool(level).name+' · 面积 ×'+scratchTool(level).area.toFixed(2)+(level<10?' → ×'+next.area.toFixed(2):''),'idiom-lock');
  const button=actionButton(level===10?'已满级':'升级 · '+COSTS[level]+' 福运点',()=>update(s=>upgradeTech(s,tech)),level===10||progression.points<COSTS[level]);
  button.dataset.upgrade=tech;row.appendChild(button);scroll.appendChild(row);
 }
 p(scroll,'下一张「'+cardDefinition(selected).name+'」','idiom-tech-name');p(scroll,growthSummary(selected),'idiom-pool');
 p(scroll,'扫雷保持4雷、天梯每层1个正确门；T15–T18固定头奖，恶魔概率始终15%。','idiom-lock');
 p(scroll,'福运里程碑 · '+progression.claimed.length+'/'+MILESTONES.length,'idiom-tech-name');
 p(scroll,'解锁首次卡种、首次中奖、首次头奖、财富数量级各奖励一次。旧版已达成进度会补领，恢复金不会重复刷点。','idiom-lock');
 for(const m of MILESTONES){const done=progression.claimed.includes(m.id);p(scroll,(done?'✓ ':'○ ')+m.label+'  +'+m.points+'点',done?'idiom-milestone done':'idiom-milestone');}
}
function renderMachine():void {
 const scroll=box('idiom-catalog idiom-machine');controls.appendChild(scroll);
 const m=state.machine,level=MACHINE_LEVELS[m.level],busy=m.running;
 p(scroll,'自动刮卡工坊','idiom-title');p(scroll,'现金购入机器，任务开始时才扣票价。切到后台或刷新会暂停，已购票继续保留。','idiom-lock');
 const summary=box('idiom-tech');scroll.appendChild(summary);
 p(summary,m.level?level.name+'机 Lv.'+m.level+' · '+level.ms/1000+'秒/张':'购入第一台刮卡机','idiom-tech-name');
 p(summary,'队列 '+m.queue.length+'/'+level.capacity+' · 已处理 '+m.processed+' 张 · 刮卡净收益 '+money(m.totalWon-m.totalSpent));
 p(summary,'机器投入 '+money(m.investment)+' · 与刮卡收益分开记录','idiom-lock');
 const latest=m.log[0],jackpot=m.log.find(r=>['T15','T16','T17'].includes(r.cardId)&&r.prize>0n);
 if(latest)p(summary,'最近一票 · '+cardDefinition(latest.cardId).name+' · '+(latest.prize?'到账 '+money(latest.prize):'未中奖'),'machine-result');
 if(jackpot)p(summary,'头奖记录 · '+cardDefinition(jackpot.cardId).name+' · '+money(jackpot.prize),'machine-jackpot');
 p(summary,'本轮 '+m.sessionBought+'/'+m.limit+' 张 · 票费 '+money(m.sessionSpent)+' / '+money(m.budget),'idiom-lock');
 const progress=document.createElement('progress');progress.id='machine-progress';progress.max=level.ms;progress.value=m.job?.elapsedMs??0;summary.appendChild(progress);
 p(summary,'','machine-job-text').id='machine-job-text';p(summary,m.message||'初级机手动填任务，中级机解锁自动购票与领奖。','idiom-message');
 if(m.level<4)summary.append(actionButton((m.level?'升级到'+MACHINE_LEVELS[m.level+1].name+'机':'购买初级机')+' · '+money(MACHINE_LEVELS[m.level+1].cost),()=>update(buyMachine),busy||!!m.job||state.cash<MACHINE_LEVELS[m.level+1].cost));
 const form=document.createElement('form');form.className='idiom-machine-form';scroll.appendChild(form);
 const field=(label:string,element:HTMLElement)=>{const row=document.createElement('label');row.textContent=label;row.appendChild(element);form.appendChild(row);};
 const input=(name:string,value:string,type='text')=>{const e=document.createElement('input');e.name=name;e.type=type;e.value=value;e.disabled=busy;e.inputMode=name==='gates'?'text':'numeric';return e;};
 const select=(name:string,choices:[string,string][],value:string)=>{const e=document.createElement('select');e.name=name;e.disabled=busy;for(const [v,t] of choices){const o=document.createElement('option');o.value=v;o.textContent=t;e.appendChild(o);}e.value=value;return e;};
 field('处理卡种',select('card',CARDS.slice(0,state.unlockedCount).filter(c=>c.automationAllowedByDefault).map(c=>[c.id,c.name+' · '+money(c.price)]),m.repeatCard));
 field('待购任务数量',input('quantity','1'));
 field('最低保留现金（元）',input('reserve',m.reserve.toString()));field('本轮票费预算（元）',input('budget',m.budget.toString()));field('本轮最多购票',input('limit',String(m.limit)));
 const check=(name:string,title:string,value:boolean)=>{const e=document.createElement('input');e.type='checkbox';e.name=name;e.checked=value;e.disabled=busy||m.level<2;field(title,e);};
 check('autoBuy','自动补票（中级起）',m.autoBuy);check('autoClaim','自动领奖（中级起）',m.autoClaim);
 field('见好就收策略',select('cashoutMode',[['steps','最多冒险N格'],['target','达到目标即收手']],m.policy.cashoutMode));
 field('最多冒险格数（1–6）',input('steps',String(m.policy.steps)));field('收手目标（元）',input('target',m.policy.target.toString()));
 field('天梯选门',select('ladderMode',[['random','每层随机盲选'],['preset','按预设序列选门']],m.policy.ladderMode));
 field('三层预设门号（1–5，用逗号分隔）',input('gates',m.policy.gates.map(g=>g+1).join(',')));
 const read=()=>{
  const data=new FormData(form),number=(name:string)=>{const v=String(data.get(name)??'');if(!/^\d+$/.test(v))throw new Error('请输入整数：'+name);return Number(v);};
  const amount=(name:string)=>{const v=String(data.get(name)??'');if(!/^\d{1,60}$/.test(v))throw new Error('请输入非负整数金额');return BigInt(v);};
  return {autoBuy:data.get('autoBuy')==='on',autoClaim:data.get('autoClaim')==='on',repeatCard:String(data.get('card')) as CardId,reserve:amount('reserve'),budget:amount('budget'),limit:number('limit'),
   policy:{cashoutMode:String(data.get('cashoutMode')) as 'steps'|'target',steps:number('steps'),target:amount('target'),ladderMode:String(data.get('ladderMode')) as 'random'|'preset',gates:String(data.get('gates')).split(/[,，]/).map(g=>/^\s*[1-5]\s*$/.test(g)?Number(g)-1:-1)}};
 };
 form.addEventListener('submit',e=>{e.preventDefault();update(s=>configureMachine(s,read()));});
 const saveSettings=actionButton('保存机器设置',()=>update(s=>configureMachine(s,read())),busy);saveSettings.dataset.machineAction='settings';form.appendChild(saveSettings);
 const enqueue=actionButton('加入待购队列',()=>update(s=>{const c=read();return enqueueMachine(configureMachine(s,c),c.repeatCard,Number(new FormData(form).get('quantity')));}),busy||!m.level);
 enqueue.dataset.machineAction='enqueue';form.appendChild(enqueue);
 p(scroll,'初级机只处理手动加入的任务；开启自动补票后，空队列会继续购买所选卡，仍受本轮预算、张数与保留线限制。','idiom-lock');
 p(scroll,'一念天堂不进入自动候选。止盈只根据已揭晓金额收手；天梯、龙眼与扫雷采用盲选。','idiom-lock');
 const clear=actionButton('清空待购任务',()=>update(clearMachineQueue),!m.queue.length,'secondary');clear.dataset.machineAction='clear';scroll.appendChild(clear);
 const reset=actionButton('重置本轮预算计数',()=>update(resetMachineSession),busy||!!m.job,'secondary');reset.dataset.machineAction='reset';scroll.appendChild(reset);
 p(scroll,'待购任务 '+m.queue.length+' 个','idiom-tech-name');
 if(m.queue.length)p(scroll,m.queue.slice(0,10).map(t=>cardDefinition(t.cardId).name).join(' → ')+(m.queue.length>10?' …':''));
 for(const r of m.log.slice(0,10)){const row=box('idiom-receipt');p(row,cardDefinition(r.cardId).name+' · '+(r.prize?'中奖 '+money(r.prize):'未中奖'));p(row,'票费 '+money(r.cost)+' · 净收益 '+money(r.prize-r.cost),'idiom-lock');scroll.appendChild(row);}
}
function updateMachineProgress():void {
 const m=state.machine,j=m.job,bar=document.getElementById('machine-progress') as HTMLProgressElement|null,label=document.getElementById('machine-job-text');
 if(bar){bar.max=MACHINE_LEVELS[m.level].ms;bar.value=j?.elapsedMs??0;}
 if(label)label.textContent=j?cardDefinition(j.cardId).name+' · 已揭晓 '+(state.active?.revealed.length??0)+'/'+j.order.length+' · '+Math.floor(j.elapsedMs/bar!.max*100)+'%':m.running?'准备购买下一张':'没有正在处理的票';
 root.dataset.machineRunning=String(m.running);root.dataset.machineProcessed=String(m.processed);
}
function renderControls():void {
 const scrollTop=controls.querySelector('.idiom-catalog')?.scrollTop??0;controls.replaceChildren();
 const top=box('idiom-top');controls.appendChild(top);
 top.append(actionButton('成语卡册',()=>{screen='catalog';riskDialog=false;render();},false,screen==='catalog'?'active':'secondary'));
 top.append(actionButton('当前刮卡',()=>{screen='ticket';render();},!state.active,screen==='ticket'?'active':'secondary'));
 top.append(actionButton('刮奖记录',()=>{screen='records';render();},false,screen==='records'?'active':'secondary'));
 top.append(actionButton('永久成长',()=>{screen='growth';riskDialog=false;render();},false,screen==='growth'?'active':'secondary'));
 top.append(actionButton('自动机器',()=>{screen='machine';riskDialog=false;render();},false,screen==='machine'?'active':'secondary'));
 if(screen==='catalog')renderCatalog();else if(screen==='records')renderRecords();else if(screen==='growth')renderGrowth();else if(screen==='machine')renderMachine();
 const footer=box('idiom-footer');controls.appendChild(footer);
 if(screen==='ticket'&&state.active){
  const t=state.active,r=resolveTicket(t),def=cardDefinition(t.cardId);p(footer,notice||r.message,'idiom-message');
  if(machineOwnsTicket(state))footer.append(actionButton('机器处理中的票 · 返回工坊',()=>{screen='machine';render();},false,'secondary'));
  else if(t.settled){
   if(state.cash>=def.price)footer.append(actionButton('再买一张 · '+money(def.price),()=>{selected=t.cardId;buy();}));
   else if(state.cash>=2n)footer.append(actionButton('换一张低价卡',()=>{selected='T01';screen='catalog';render();}));
  }
  else if(r.status==='won')footer.append(actionButton('领取 '+money(r.prize),()=>update(settleActive)));
  else if(def.mode==='cashout')footer.append(actionButton('现在收手 · '+money(r.accrued),()=>update(stopAndCollect),r.accrued===0n));
  else p(footer,'手指来回擦掉银层，抬手揭晓；选择类卡一旦开始刮就锁定选择。','idiom-tip');
 }else if(screen==='catalog'){
  const def=cardDefinition(selected),locked=CARDS.indexOf(def)>=state.unlockedCount;
  p(footer,notice||def.name+' · '+growthSummary(def.id)+'（测试配置）','idiom-message');
  const pending=!!state.active&&!state.active.settled;
  footer.append(actionButton(pending?'继续未完成的卡':locked?'尚未解锁':`买 ${def.name} · ${money(def.price)}`,
   ()=>pending?(screen='ticket',render()):buy(),!pending&&(locked||state.cash<def.price)));
 }else if(screen==='growth'){p(footer,notice||'可用 '+state.progression.points+' 福运点 · 新购票生效','idiom-message');footer.append(actionButton('返回卡册 · 选择下一张',()=>{screen='catalog';render();},false,'secondary'));}
 else if(screen==='machine'){
  const m=state.machine;const waiting=!!m.job&&m.job.elapsedMs===MACHINE_LEVELS[m.level].ms&&resolveTicket(state.active!).status==='won';
  p(footer,notice||m.message||'设置预算后，加入任务并开始','idiom-message');
  const button=actionButton(waiting?'手动领奖并继续':m.running?'暂停机器':'开始 / 继续队列',()=>update(s=>waiting?claimMachine(s):s.machine.running?pauseMachine(s):startMachine(s)),!m.level);
  button.dataset.machineAction=waiting?'claim':m.running?'pause':'start';footer.appendChild(button);
 }
 if(state.cash<2n&&(!state.active||state.active.settled))footer.append(actionButton('领取20元恢复金（每60秒一次）',()=>update(s=>recoveryCash(s,Date.now())),false,'secondary'));
 const scroller=controls.querySelector('.idiom-catalog');if(scroller)scroller.scrollTop=scrollTop;
 if(riskDialog){
  const veil=box('idiom-modal'),dialog=box('idiom-dialog');veil.appendChild(dialog);controls.appendChild(veil);
  p(dialog,'一念天堂 · 风险确认','idiom-title');p(dialog,'票价100亿元。只选一门；刮出天堂获得1万亿元，刮出恶魔立即清空本局全部剩余现金。永久成长、历史记录和图鉴保留。');
  p(dialog,DRAFT_PROBABILITIES.T18+'；每张票不保证有天堂（测试配置）。');
  dialog.append(actionButton('确认花100亿购买',buy,state.cash<10000000000n));dialog.append(actionButton('返回卡册',()=>{riskDialog=false;render();},false,'secondary'));
 }
}
function render():void {
 if(!scene)return;scene.destroyChildren();foil.beginFrame();
 panel(0,0,W,H,C.bg,0);panel(25,22,700,167,'#263246',27,'#526079');
 text(50,30,'好运工坊',37,C.paper,350,'left',true);text(430,40,qa?'QA试玩 · 独立测试':'自动机版 V3.1',20,C.gold,267,'right');
 text(50,89,'现金  '+money(state.cash),33,C.gold,640,'left',true);text(50,142,'已解锁 '+state.unlockedCount+'/18  ·  福运点 '+state.progression.points+'  ·  买票结果固定',21,C.muted,640);
 if(screen==='ticket')ticketView();renderControls();foil.endFrame();if(screen!=='ticket'||riskDialog)foil.setEnabled(false);
 root.dataset.screen=screen;root.dataset.cash=state.cash.toString();root.dataset.qa=String(qa);
 root.dataset.readOnly=String(!writer);
 updateMachineProgress();
}
async function acquireWriter():Promise<void> {
 if(qa){writer=true;return;}
 if(!navigator.locks){writer=true;return;}
 await new Promise<void>(ready=>{void navigator.locks.request('idiom-run-writer',{ifAvailable:true},async lock=>{
  writer=!!lock;if(!lock){notice='此页只读：另一个游戏页面正在操作。';ready();return;}
  const hold=new Promise<void>(done=>{releaseWriter=done;});ready();await hold;
 }).catch(()=>{writer=false;notice='无法取得存档操作权，请刷新重试。';ready();});});
}
function machineTick():void {
 const now=performance.now(),delta=Math.min(250,Math.max(0,Math.floor(now-lastTick)));lastTick=now;
 if(!writer||document.hidden||!state.machine.running)return;
 const previous=state;
 try{state=advanceMachine(state,delta);save();
  if(previous.machine.processed!==state.machine.processed)tone(state.machine.log[0]?.prize?'win':'lose');
  if(previous.active?.nonce!==state.active?.nonce)foil.clear();
  if(previous.active?.revealed.length!==state.active?.revealed.length||previous.active?.nonce!==state.active?.nonce||previous.machine.running!==state.machine.running||previous.machine.processed!==state.machine.processed)render();else updateMachineProgress();
 }catch(e){state=pauseMachine(state,e instanceof Error?e.message:String(e));save();render();}
}
async function boot():Promise<void> {
 await acquireWriter();
 sizeToWindow();window.addEventListener('resize',sizeToWindow);if(typeof Laya==='undefined')throw new Error('LayaAir 3.4 引擎未加载');
 await Laya.init(W,H);Laya.stage.scaleMode=Laya.Stage.SCALE_NOSCALE;Laya.stage.screenMode=Laya.Stage.SCREEN_NONE;Laya.stage.bgColor=C.bg;
 const canvas=Laya.Browser.mainCanvas.source as HTMLCanvasElement;root.insertBefore(canvas,foilRoot);canvas.style.cssText='position:absolute;left:0;top:0;width:750px;height:1334px;';
 scene=new Laya.Sprite();Laya.stage.addChild(scene);
 if(qa){state=newGame('qa-'+crypto.randomUUID());state.cash=2000000000000n;state.peak=state.cash;state.unlockedCount=18;}
 else{const loaded=loadGame(localStorage,crypto.randomUUID());state=loaded.state;legacyFound=loaded.legacy;}
 if(state.active){selected=state.active.cardId;screen='ticket';}render();save();
 if(state.machine.job||state.machine.queue.length){screen='machine';render();}
 lastTick=performance.now();window.setInterval(machineTick,100);
}
document.addEventListener('visibilitychange',()=>{lastTick=performance.now();if(document.hidden&&writer&&state.machine.running){state=pauseMachine(state,'页面已转入后台，机器暂停');save();render();}});
window.addEventListener('pagehide',()=>{if(writer&&state.machine.running&&localStorage.getItem(SAVE_KEY)===lastSaved){state=pauseMachine(state,'离开页面，机器已暂停');save();}releaseWriter?.();writer=false;});
window.addEventListener('pageshow',event=>{if(event.persisted)void acquireWriter().then(()=>{const loaded=loadGame(localStorage,state.runSeed);state=loaded.state;render();});});
window.addEventListener('storage',event=>{if(event.key===SAVE_KEY&&writer){state=pauseMachine(state,'另一个页面修改了存档，此页已暂停');writer=false;notice='存档已在其他页面更新，请刷新此页。';render();}});
void boot().catch((e:unknown)=>{console.error('Game boot failed',e);loadError.textContent='启动失败：'+(e instanceof Error?e.message:String(e))+'。原存档未覆盖。';loadError.hidden=false;});
