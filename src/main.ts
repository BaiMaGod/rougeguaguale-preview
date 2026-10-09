import {CARDS,cardDefinition,formatMoney,DRAFT_PROBABILITIES,type CardId} from './idiom/config.js';
import {canScratch,resolveTicket} from './idiom/resolver.js';
import {newGame,loadGame,purchaseTicket,startScratch,scratchCell,settleActive,stopAndCollect,recoveryCash,serializeGame,SAVE_KEY,type GameState} from './idiom/wallet.js';
import {ScratchLayer} from './scratch.js';
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
let scene:any,screen:'catalog'|'ticket'|'records'='catalog',riskDialog=false;
let notice='',legacyFound=false;
const controls=document.createElement('div');controls.id='idiom-controls';root.appendChild(controls);
const money=(n:bigint)=>formatMoney(n)+'元';
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
 if(qa)return;
 try{localStorage.setItem(SAVE_KEY,serializeGame(state));}
 catch{notice='当前浏览器无法保存进度，本次游戏仍可继续。';}
}
function update(action:(s:GameState)=>GameState,resetFoil=false):void {
 try{const next=action(state);if(resetFoil)foil.clear();state=next;notice='';save();render();}
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
 if(state.active?.nonce!==nonce||state.active.settled)return;
 update(s=>{
  const next=scratchCell(s,index),r=resolveTicket(next.active!);
  tone(r.status==='won'?'win':r.status==='lost'||r.status==='bankrupt'?'lose':'reveal');
  return r.status==='lost'||r.status==='bankrupt'?settleActive(next):next;
 });
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
 panel(42,225,666,908,'#080d1744',32);panel(34,210,682,908,C.paper,32,'#cfb07d');
 panel(34,210,682,166,def.color,30);panel(34,295,682,82,def.color,0);
 text(65,225,def.id+'  /  成语刮刮卡',22,C.ink,580);
 text(65,267,def.name,51,C.ink,580,'left',true);
 text(65,333,'票价 '+money(def.price)+'     最高 '+money(def.headlinePrize),22,C.ink,620);
 text(66,390,def.rule,25,C.ink,618,'center',true);
 const hint=text(66,430,def.hint,19,'#6c6d6c',618,'center');hint.wordWrap=true;hint.height=55;
 if(def.mode==='multiply')text(336,691,'×',38,C.ink,78,'center',true);
 if(def.mode==='compare')text(336,691,'VS',29,C.ink,78,'center',true);
 if(def.mode==='sum')text(100,970,'目标 100  ·  当前 '+r.accrued.toString(),24,C.ink,550,'center',true);
 if(def.mode==='ledger')text(80,1023,'累计 '+money(r.accrued)+'  /  目标 300万',22,C.ink,590,'center',true);
 if(def.mode==='mines')text(90,530,'3次安全即中奖  ·  4枚雷 / 10格',24,C.ink,570,'center',true);
 if(def.mode==='cashout')text(80,1023,'已累计 '+money(r.accrued)+'  ·  可随时收手',24,C.ink,590,'center',true);
 if(def.mode==='ladder')text(88,480,'从最下层开始，每层只能选1门',22,C.ink,574,'center',true);
 for(const slot of slots(t.cardId)){
  const c=t.committedLayout[slot.index],open=t.revealed.includes(slot.index),allowed=canScratch(t,slot.index),dim=!open&&!allowed;
  panel(slot.x-5,slot.y-5,slot.size+10,slot.size+10,open?(c.kind==='bomb'||c.kind==='devil'?'#e9b1a6':'#d2dfc1'):'#e0d2b4',18,'#c4ad7f');
  const color=c.kind==='bomb'||c.kind==='devil'?'#953f3b':c.kind==='heart'||c.kind==='heaven'?'#a77918':C.ink;
  text(slot.x,slot.y+slot.size*.33,cellLabel(c),slot.size<=105?32:slot.size<200?34:48,color,slot.size,'center',true);
  text(slot.x-10,slot.y+slot.size+7,slot.label,18,C.ink,slot.size+20,'center');
  if(!open&&!t.settled){
   const nonce=t.nonce;
   foil.add({...slot,onFinished:i=>onReveal(i,nonce),canStart:()=>state.active?.nonce===nonce&&canScratch(state.active,slot.index),
    onStarted:i=>update(s=>startScratch(s,i)),shape:slot.heart?'heart':undefined});
   foil.setCellEnabled(slot.index,allowed);
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
  p(b,def.rule,'idiom-rule');p(b,'最高 '+money(def.headlinePrize),'idiom-prize');
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
 p(scroll,'永久成长与自动刮卡机将在基础卡验收后接入。');
 if(legacyFound){p(scroll,'旧版进度已保留，可以继续访问历史版本。');const a=document.createElement('a');a.href='./legacy.html';a.textContent='打开旧版4×4玩法';a.className='idiom-legacy';scroll.appendChild(a);}
}
function renderControls():void {
 const scrollTop=controls.querySelector('.idiom-catalog')?.scrollTop??0;controls.replaceChildren();
 const top=box('idiom-top');controls.appendChild(top);
 top.append(actionButton('成语卡册',()=>{screen='catalog';riskDialog=false;render();},false,screen==='catalog'?'active':'secondary'));
 top.append(actionButton('当前刮卡',()=>{screen='ticket';render();},!state.active,screen==='ticket'?'active':'secondary'));
 top.append(actionButton('刮奖记录',()=>{screen='records';render();},false,screen==='records'?'active':'secondary'));
 if(screen==='catalog')renderCatalog();else if(screen==='records')renderRecords();
 const footer=box('idiom-footer');controls.appendChild(footer);
 if(screen==='ticket'&&state.active){
  const t=state.active,r=resolveTicket(t),def=cardDefinition(t.cardId);p(footer,notice||r.message,'idiom-message');
  if(t.settled){
   if(state.cash>=def.price)footer.append(actionButton('再买一张 · '+money(def.price),()=>{selected=t.cardId;buy();}));
   else if(state.cash>=2n)footer.append(actionButton('换一张低价卡',()=>{selected='T01';screen='catalog';render();}));
  }
  else if(r.status==='won')footer.append(actionButton('领取 '+money(r.prize),()=>update(settleActive)));
  else if(def.mode==='cashout')footer.append(actionButton('现在收手 · '+money(r.accrued),()=>update(stopAndCollect),r.accrued===0n));
  else p(footer,'手指来回擦掉银层，抬手揭晓；选择类卡一旦开始刮就锁定选择。','idiom-tip');
 }else if(screen==='catalog'){
  const def=cardDefinition(selected),locked=CARDS.indexOf(def)>=state.unlockedCount;
  p(footer,notice||def.name+' · '+DRAFT_PROBABILITIES[def.id]+'（测试配置）','idiom-message');
  const pending=!!state.active&&!state.active.settled;
  footer.append(actionButton(pending?'继续未完成的卡':locked?'尚未解锁':`买 ${def.name} · ${money(def.price)}`,
   ()=>pending?(screen='ticket',render()):buy(),!pending&&(locked||state.cash<def.price)));
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
 text(50,30,'好运工坊',37,C.paper,350,'left',true);text(430,40,qa?'QA试玩 · 独立测试':'成语卡基础版 V3.1',20,C.gold,267,'right');
 text(50,89,'现金  '+money(state.cash),33,C.gold,640,'left',true);text(50,142,'已解锁 '+state.unlockedCount+'/18  ·  买票后结果固定',21,C.muted,640);
 if(screen==='ticket')ticketView();renderControls();foil.endFrame();if(screen!=='ticket'||riskDialog)foil.setEnabled(false);
 root.dataset.screen=screen;root.dataset.cash=state.cash.toString();root.dataset.qa=String(qa);
}
async function boot():Promise<void> {
 sizeToWindow();window.addEventListener('resize',sizeToWindow);if(typeof Laya==='undefined')throw new Error('LayaAir 3.4 引擎未加载');
 await Laya.init(W,H);Laya.stage.scaleMode=Laya.Stage.SCALE_NOSCALE;Laya.stage.screenMode=Laya.Stage.SCREEN_NONE;Laya.stage.bgColor=C.bg;
 const canvas=Laya.Browser.mainCanvas.source as HTMLCanvasElement;root.insertBefore(canvas,foilRoot);canvas.style.cssText='position:absolute;left:0;top:0;width:750px;height:1334px;';
 scene=new Laya.Sprite();Laya.stage.addChild(scene);
 if(qa){state=newGame('qa-'+crypto.randomUUID());state.cash=2000000000000n;state.peak=state.cash;state.unlockedCount=18;}
 else{const loaded=loadGame(localStorage,crypto.randomUUID());state=loaded.state;legacyFound=loaded.legacy;}
 if(state.active){selected=state.active.cardId;screen='ticket';}render();save();
}
void boot().catch((e:unknown)=>{console.error('Game boot failed',e);loadError.textContent='启动失败：'+(e instanceof Error?e.message:String(e))+'。原存档未覆盖。';loadError.hidden=false;});
