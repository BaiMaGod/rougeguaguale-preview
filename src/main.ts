import {SYMBOLS, ROUND_TARGETS, createTicket, scoutCell, activateCell, calculateScore, settleTicket, rowClues, type Ticket, type SymbolKey} from './rules.js';
import {ScratchLayer} from './scratch.js';

declare const Laya: any;
const W=750,H=1334;
const BOARD={x:88,y:417,cell:136,gap:10};
const C={bg:'#101629',panel:'#1d2944',paper:'#f6e7c7',gold:'#ffcc72',muted:'#aabbd4',mint:'#66e8b7',pink:'#fb8faa',text:'#fff8e8'};
const root=document.getElementById('game-root') as HTMLDivElement;
const foilRoot=document.getElementById('scratch-root') as HTMLDivElement;
const error=document.getElementById('load-error') as HTMLElement;
const foil=new ScratchLayer(foilRoot);
interface RunState {seed:string;bank:number;round:number;ticketIndex:number;ticket:Ticket;committed:boolean;riskArmed:boolean;done:boolean;}
const urlSeed=new URLSearchParams(location.search).get('seed');
const makeSeed=()=>urlSeed || 'foil-'+Math.floor(Date.now()/1000);
const state:RunState={seed:makeSeed(),bank:0,round:0,ticketIndex:1,
  ticket:createTicket('initial'),committed:false,riskArmed:false,done:false};
let scene:any;
let message='用手指在银色格子上来回擦，刮开超过一半即可揭晓。';
let toastText='',toastSerial=0;
let audio:AudioContext|null=null;
function sound(type:'scratch'|'gain'|'bad'):void{
  try{
    audio??=new AudioContext();
    if(audio.state==='suspended') void audio.resume();
    const o=audio.createOscillator(),v=audio.createGain(),t=audio.currentTime;
    o.type=type==='bad'?'sawtooth':'sine';
    o.frequency.setValueAtTime(type==='bad'?180:type==='gain'?680:470,t);
    o.frequency.exponentialRampToValueAtTime(type==='bad'?80:type==='gain'?920:620,t+.1);
    v.gain.setValueAtTime(.0001,t);v.gain.exponentialRampToValueAtTime(.095,t+.015);
    v.gain.exponentialRampToValueAtTime(.0001,t+.13);
    o.connect(v);v.connect(audio.destination);o.start(t);o.stop(t+.14);
  }catch{/* sound is optional */}
}
function sizeToWindow():void{
  const scale=Math.min(innerWidth/W,innerHeight/H);
  root.style.transform='scale('+scale+')';
  root.style.left=Math.round((innerWidth-W*scale)/2)+'px';
  root.style.top=Math.round((innerHeight-H*scale)/2)+'px';
}
function txt(parent:any,x:number,y:number,value:string,px=24,color=C.text,width=500,align='left',bold=false):any{
  const node=new Laya.Text();
  node.text=value;node.font='Microsoft YaHei';node.fontSize=px;node.color=color;
  node.bold=bold;node.width=width;node.height=px+20;node.align=align;node.valign='middle';
  node.pos(x,y);parent.addChild(node);return node;
}
function rect(parent:any,x:number,y:number,w:number,h:number,r:number,fill:string,line:string|null=null):any{
  const shape=new Laya.Sprite();
  shape.graphics.drawRoundRect(0,0,w,h,r,r,r,r,fill,line??fill,line?2:0);
  shape.size(w,h);shape.pos(x,y);parent.addChild(shape);return shape;
}
function btn(parent:any,x:number,y:number,w:number,h:number,title:string,fill:string,onClick:()=>void,disabled=false):void{
  const button=rect(parent,x,y,w,h,18,disabled?'#45516a':fill);
  button.mouseEnabled=!disabled;
  button.hitTestPrior=true;
  const hit=new Laya.HitArea();
  hit.hit.drawRect(0,0,w,h,'#ffffff');
  button.hitArea=hit;
  txt(button,0,7,title,27,disabled?'#a6adba':'#182238',w,'center',true);
  if(!disabled) button.on(Laya.Event.CLICK,null,onClick);
}
function flash(index:number,symbol:SymbolKey):void{
  const col=index%4,row=Math.floor(index/4);
  const x=BOARD.x+col*(BOARD.cell+BOARD.gap)+BOARD.cell/2;
  const y=BOARD.y+row*(BOARD.cell+BOARD.gap)+BOARD.cell/2;
  for(let i=0;i<10;i++){
    const p=new Laya.Sprite(),a=Math.PI*2*i/10;
    p.graphics.drawCircle(0,0,i%2?5:8,SYMBOLS[symbol].color);
    p.pos(x,y);scene.addChild(p);
    Laya.Tween.to(p,{x:x+Math.cos(a)*85,y:y+Math.sin(a)*80,alpha:0,scaleX:.4,scaleY:.4},400,null,Laya.Handler.create(null,()=>p.destroy()));
  }
}
function announce(text:string):void{message=text;toastText=text;toastSerial++;draw();}
function newTicket():void{
  state.ticket=createTicket(state.seed+':r'+(state.round+1)+':t'+state.ticketIndex);
  state.committed=false;state.riskArmed=false;state.done=false;
  message='按住银色格来回擦动；刮开超过一半才能揭晓！';
  draw();
}
function reset():void{
  state.seed='foil-'+Math.floor(Date.now()/1000);state.round=0;state.bank=0;state.ticketIndex=1;
  history.replaceState(null,'',location.pathname+'?seed='+encodeURIComponent(state.seed));
  newTicket();
}
function finishTicket(accident=false):void{
  if(state.committed)return;
  state.ticket=settleTicket(state.ticket);
  state.committed=true;state.riskArmed=false;
  const gain=state.ticket.finalScore??0;
  state.bank+=gain;
  const target=ROUND_TARGETS[state.round];
  state.done=state.bank>=target || state.ticketIndex>=3;
  if(state.bank>=target){
    message='过关！本轮共 '+state.bank+' 分，达到 '+target+' 分目标。';
    sound('gain');
  }else if(state.ticketIndex>=3){
    message='本轮结束：'+state.bank+'/'+target+' 分。再来一局试试不同位置！';
  }else{
    message=(accident?'爆票！':'稳稳收下！')+' 获得 '+gain+' 分，点击下一张继续。';
  }
}
function onScratch(index:number):void{
  if(state.committed)return;
  if(state.ticket.regularRemaining<=0 && !state.riskArmed){draw();return;}
  const old=state.ticket;
  try{
    state.ticket=activateCell(old,index,{extra:old.regularRemaining<=0});
    const symbol=state.ticket.cells[index].symbol;
    const score=calculateScore(state.ticket);
    message=SYMBOLS[symbol].name+'！当前可收 '+score.score+' 分'+(state.ticket.pressure?' · 压力 '+state.ticket.pressure+'/3':'');
    state.riskArmed=false;
    if(state.ticket.status==='accident')finishTicket(true);
    draw();
    flash(index,symbol);
    sound(symbol==='ink'||state.ticket.status==='accident'?'bad':'scratch');
  }catch(e){message=e instanceof Error?e.message:'操作失败';draw();}
}
function hint():void{
  if(state.committed||state.ticket.scoutRemaining<=0)return;
  const hidden=state.ticket.cells.filter(c=>c.state==='hidden');
  if(!hidden.length)return;
  // A single scout reveals one currently hidden symbol, not a paid scratch.
  const chosen=hidden[Math.floor(Math.random()*hidden.length)];
  state.ticket=scoutCell(state.ticket,chosen.index);
  message='免费显影：'+String.fromCharCode(65+chosen.index%4)+(Math.floor(chosen.index/4)+1)+' 是 '+SYMBOLS[chosen.symbol].name;
  draw();
}
function next():void{
  if(!state.committed)return;
  if(state.done){reset();return;}
  state.ticketIndex++;newTicket();
}
function draw():void{
  scene.removeChildren();foil.clear();
  scene.graphics.clear();scene.graphics.drawRect(0,0,W,H,C.bg);
  // Warm floating decoration outside play surface.
  const aura=new Laya.Sprite();aura.graphics.drawCircle(0,0,260,'#202c4a');
  aura.alpha=.45;aura.pos(685,0);scene.addChild(aura);
  txt(scene,48,34,'✦  刮 出 奇 迹',48,C.gold,510,'left',true);
  txt(scene,48,96,'LUCK WORKSHOP · 真正可以刮的好运票',20,'#bec9dc',580);
  btn(scene,568,45,144,60,'重开', '#c2cee0',()=>reset());
  rect(scene,48,158,654,100,24,'#202d4a','#36466c');
  txt(scene,70,165,'本轮进度',20,C.muted,185);
  txt(scene,70,195,state.bank+' / '+ROUND_TARGETS[state.round],44,C.gold,340,'left',true);
  txt(scene,507,169,'第 '+state.ticketIndex+' / 3 张',28,C.text,175,'center',true);
  txt(scene,511,207,'目标 '+ROUND_TARGETS[state.round]+' 分',20,C.muted,175,'center');
  rect(scene,48,276,654,734,24,C.paper,'#c6a67a');
  txt(scene,83,287,'✦  街角经典',37,'#5a3c2b',390,'left',true);
  txt(scene,490,297,'4 × 4 幸运票',21,'#91714f',175,'right',true);
  txt(scene,87,343,'线索：'+rowClues(state.ticket).map((s,i)=>(i+1)+'行'+s.label).slice(0,2).join('  ·  '),18,'#78614e',583);
  txt(scene,87,376,'操作：在银层上持续滑动刮开，不是点一下翻牌',20,'#845e45',590);
  state.ticket.cells.forEach((cell,index)=>{
    const col=index%4,row=Math.floor(index/4);
    const x=BOARD.x+col*(BOARD.cell+BOARD.gap),y=BOARD.y+row*(BOARD.cell+BOARD.gap);
    rect(scene,x,y,BOARD.cell,BOARD.cell,16,cell.state==='active'?'#fffaf0':'#fff5e4','#dbc5a3');
    // Underlying symbol stays rendered in LayaAir; Canvas2D foil is above it.
    rect(scene,x+14,y+14,BOARD.cell-28,BOARD.cell-28,50,SYMBOLS[cell.symbol].color);
    txt(scene,x,y+20,SYMBOLS[cell.symbol].icon,64,'#212b3d',BOARD.cell,'center',true);
    txt(scene,x,y+93,SYMBOLS[cell.symbol].name,22,'#273449',BOARD.cell,'center',true);
    if(cell.state!=='active'){
      foil.add({index,x,y,size:BOARD.cell,onFinished:onScratch});
      if(cell.state==='scouted')foil.reveal(index);
    }
  });
  txt(scene,88,1008,'★ 三个相同加分   ·   连满一行/列奖励   ·   墨团会增加压力',19,C.muted,585,'center');
  // Feedback and controls never overlap the scratchable surface.
  rect(scene,48,1045,654,55,14,'#1d2944');
  txt(scene,62,1049,'免费 '+state.ticket.regularRemaining+' 次   |   冒险 '+state.ticket.extraRemaining+' 次   |   压力 '+state.ticket.pressure+'/3',23,C.text,620,'center',true);
  txt(scene,48,1108,message,20,C.muted,654,'center');
  const score=calculateScore(state.ticket),canCash=!state.committed&&state.ticket.activatedOrder.length>0;
  btn(scene,48,1170,317,68,state.committed?'已结算':'💰 收下 '+score.score+' 分',
    '#ffcc75',()=>{if(!canCash)return;finishTicket();draw();},!canCash);
  const canHint=!state.committed&&state.ticket.scoutRemaining>0;
  btn(scene,385,1170,317,68,canHint?'👁 免费偷看 1 格':'偷看已用完',
    '#83d8d3',hint,!canHint);
  if(state.committed){
    btn(scene,48,1251,654,66,state.done?'重新挑战':'下一张票 →','#88e5b3',next);
  }else if(state.ticket.regularRemaining===0 && state.ticket.extraRemaining>0){
    btn(scene,48,1251,654,66,state.riskArmed?'已开启冒险，继续刮银层':'⚠ 冒险再刮（压力 +1）',
      '#f0a8a2',()=>{state.riskArmed=true;message='风险已开启！继续刮开一个银色格。';draw();});
  }else{
    rect(scene,48,1251,654,66,18,'#263550');
    txt(scene,48,1260,'刮够 8 格后可收手，或冒险多刮两格',22,C.muted,654,'center');
  }
  foil.setEnabled(!state.committed&&(state.ticket.regularRemaining>0||state.riskArmed));
}
async function boot():Promise<void>{
  sizeToWindow();window.addEventListener('resize',sizeToWindow);
  if(typeof Laya==='undefined')throw new Error('LayaAir 3.4 引擎未加载，请检查 libs 文件。');
  await Laya.init(W,H);
  Laya.stage.scaleMode=Laya.Stage.SCALE_NOSCALE;
  Laya.stage.screenMode=Laya.Stage.SCREEN_NONE;
  Laya.stage.bgColor=C.bg;
  // Keep WebGL renderer and DOM scratch canvases in one scaled coordinate space.
  const gameCanvas=(Laya.Browser.mainCanvas.source as HTMLCanvasElement);
  root.insertBefore(gameCanvas,foilRoot);
  gameCanvas.style.position='absolute';
  gameCanvas.style.left='0px';gameCanvas.style.top='0px';
  gameCanvas.style.width=W+'px';gameCanvas.style.height=H+'px';
  scene=new Laya.Sprite();Laya.stage.addChild(scene);
  newTicket();
}
void boot().catch((e:unknown)=>{
  console.error('Game boot failed',e);
  error.textContent='启动失败：'+(e instanceof Error?e.message:String(e));
  error.hidden=false;
});
