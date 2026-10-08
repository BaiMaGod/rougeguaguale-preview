import {SYMBOLS, ROUND_TARGETS, createTicket, shuffledPlate, scoutCell, activateCell, calculateScore, settleTicket, rowClues, type Ticket, type SymbolKey} from './rules.js';
import {createBuild, rewardOptions, applyReward, grantRoundCopper, skipReward, shopOffer, buyStamp, buyUpgrade, availableUpgrades, legalReprint, getStamp, upgradePrice, buildSummary, type BasicSymbol, type Build, type RewardOption} from './build.js';
import {ScratchLayer} from './scratch.js';
import {applyTicketChoice,bossForRound,BOSSES,ticketCandidates,ticketDefinition,type TicketId} from './tickets.js';

declare const Laya: any;
const W=750,H=1334;
const BOARD={x:88,y:417,cell:136,gap:10};
const C={bg:'#101629',panel:'#1d2944',paper:'#f6e7c7',gold:'#ffcc72',muted:'#aabbd4',mint:'#66e8b7',pink:'#fb8faa',text:'#fff8e8'};
const root=document.getElementById('game-root') as HTMLDivElement;
const foilRoot=document.getElementById('scratch-root') as HTMLDivElement;
const error=document.getElementById('load-error') as HTMLElement;
const foil=new ScratchLayer(foilRoot);
interface RunState {seed:string;bank:number;round:number;ticketIndex:number;ticket:Ticket;committed:boolean;riskArmed:boolean;done:boolean;build:Build;phase:'ticket'|'ticket-choice'|'reward'|'shop'|'ended';offers:string[];}
const urlSeed=new URLSearchParams(location.search).get('seed');
const makeSeed=()=>urlSeed || 'foil-'+Math.floor(Date.now()/1000);
const state:RunState={seed:makeSeed(),bank:0,round:0,ticketIndex:1,
  ticket:createTicket('initial'),committed:false,riskArmed:false,done:false,build:createBuild(),phase:'ticket',offers:[]};
interface HitZone {x:number;y:number;w:number;h:number;run:()=>void;}
let hitZones:HitZone[]=[];
let pressedZone:HitZone|null=null;
function findZone(e:PointerEvent):HitZone|null{
  if(state.phase!=='ticket')return null;
  const b=root.getBoundingClientRect();
  if(b.width<=0||b.height<=0)return null;
  const x=(e.clientX-b.left)*W/b.width,y=(e.clientY-b.top)*H/b.height;
  for(let i=hitZones.length-1;i>=0;i--){
    const z=hitZones[i];
    if(x>=z.x&&x<=z.x+z.w&&y>=z.y&&y<=z.y+z.h)return z;
  }
  return null;
}
function attachPointerButtons():void{
  document.addEventListener('pointerdown',(event)=>{pressedZone=findZone(event);},true);
  document.addEventListener('pointerup',(event)=>{
    const released=findZone(event);
    if(released && released===pressedZone){pressedZone=null;released.run();}
    else pressedZone=null;
  },true);
  document.addEventListener('pointercancel',()=>{pressedZone=null;},true);
}
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
  if(!disabled) hitZones.push({x,y,w,h,run:onClick});
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
  foil.clear();
  const ticketSeed=state.seed+':r'+(state.round+1)+':t'+state.ticketIndex;
  state.ticket=createTicket(ticketSeed,shuffledPlate(ticketSeed,state.build.plate));
  state.committed=false;state.riskArmed=false;state.done=false;state.phase='ticket-choice';
  message='先从三张候选票中选一张，然后再刮开银层。';
  draw();renderWorkshop();saveRun();
}
function reset():void{
  state.seed='foil-'+Math.floor(Date.now()/1000);state.round=0;state.bank=0;state.ticketIndex=1;state.build=createBuild();state.offers=[];
  history.replaceState(null,'',location.pathname+'?seed='+encodeURIComponent(state.seed));
  newTicket();
}
function finishTicket(accident=false):void{
  if(state.committed)return;
  state.ticket=settleTicket(state.ticket,state.build);
  state.committed=true;state.riskArmed=false;
  const gain=state.ticket.finalScore??0;
  state.bank+=gain;
  const target=ROUND_TARGETS[state.round];
  const success=state.bank>=target;
  state.done=(!success && state.ticketIndex>=3)||(success && state.round>=8);
  if(success){
    message='第 '+(state.round+1)+' 轮过关！获得 '+gain+' 分。';
    sound('gain');
    if(state.round<8){
      state.build=grantRoundCopper(state.build,state.round,state.ticketIndex);
      state.phase='reward';
    }else state.phase='ended';
  }else if(state.ticketIndex>=3){
    state.phase='ended';
    message='本轮未达标：'+state.bank+'/'+target+' 分。查看构筑后重新开始。';
  }else{
    message=(accident?'爆票！':'稳稳收下！')+' 获得 '+gain+' 分，点击下一张继续。';
  }
  saveRun();
}
function onScratch(index:number):void{
  if(state.committed||state.phase!=='ticket')return;
  if(state.ticket.regularRemaining<=0 && !state.riskArmed){draw();return;}
  const old=state.ticket;
  try{
    state.ticket=activateCell(old,index,{extra:old.regularRemaining<=0});
    const symbol=state.ticket.cells[index].symbol;
    const score=calculateScore(state.ticket,{build:state.build});
    message=SYMBOLS[symbol].name+'！当前可收 '+score.score+' 分'+(state.ticket.pressure?' · 压力 '+state.ticket.pressure+'/3':'');
    state.riskArmed=false;
    if(state.ticket.status==='accident')finishTicket(true);
    draw();renderWorkshop();saveRun();
    flash(index,symbol);
    if(symbol==='ink'||state.ticket.status==='accident') sound('bad');
    else if(symbol==='gem') sound('gain');
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
  draw();saveRun();
}
function next():void{
  if(!state.committed)return;
  if(state.phase==='ended'){reset();return;}
  if(state.phase!=='ticket')return;
  state.ticketIndex++;newTicket();
}

const workshop=document.createElement('div');
workshop.id='workshop-overlay';
root.appendChild(workshop);
let reprintSelection:number[]=[];
let reprintTarget:BasicSymbol='star';
let inReprint=false;
const stampLine=(id:string):string=>{
  const d=getStamp(id);
  return '<b>'+d.name+'</b><small>'+d.id+' · '+d.tag+' · '+d.description+'</small>';
};
function saveRun():void{
  try{
    localStorage.setItem('foil-run-v4',JSON.stringify({version:4,...state}));
  }catch{/* private browsing may disable storage */}
}
function loadRun():boolean{
  // Explicit seed starts a deterministic fresh run, unless it matches the active save.
  try{
    const raw=localStorage.getItem('foil-run-v4');
    if(!raw)return false;
    const b=JSON.parse(raw);
    if(b.version!==4||!b.build||!b.ticket||!Array.isArray(b.build.plate)||b.build.plate.length!==16)return false;
    if(!Array.isArray(b.ticket.cells)||b.ticket.cells.length!==16||!Array.isArray(b.build.stamps))return false;
    if(!['ticket','ticket-choice','reward','shop','ended'].includes(b.phase)||b.round<0||b.round>8||b.ticketIndex<1||b.ticketIndex>3)return false;
    if(urlSeed&&urlSeed!==b.seed)return false;
    Object.assign(state,{seed:b.seed,round:b.round,bank:b.bank,ticketIndex:b.ticketIndex,
      ticket:b.ticket,committed:b.committed,riskArmed:b.riskArmed,done:b.done,
      build:b.build,phase:b.phase,offers:b.offers||[]});
    return true;
  }catch{return false;}
}
function escapeHtml(s:string):string {
  return s.replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch));
}
function actionButton(title:string,action:string,disabled=false,secondary=false):string{
  return '<button class="work-btn '+(secondary?'work-secondary':'')+'" data-action="'+action+'"'+(disabled?' disabled':'')+'>'+title+'</button>';
}
function renderWorkshop():void{
  if(state.phase==='ticket'){
    workshop.classList.remove('open');workshop.replaceChildren();return;
  }
  workshop.classList.add('open');
  const b=state.build;
  const header='<div class="work-top"><b>✦ 好运工坊</b><span>第 '+(state.round+1)+'/9 轮 · 🪙 '+b.copper+' 铜券</span></div>';
  let content='';
  if(state.phase==='ticket-choice'){
    const boss=bossForRound(state.round,state.seed);
    const candidates=ticketCandidates(state.seed,state.round,state.ticketIndex,b.plate);
    const bossText=boss?'<div class="work-boss"><b>⚠ 首领 '+BOSSES[boss].name+'</b><p>'+BOSSES[boss].effect+'</p></div>':'';
    const cards=candidates.map((d,i)=>
      '<div class="work-card"><div class="work-card-title">'+(i+1)+' · '+d.name+
      '</div><p>'+d.effect+'</p><small>构筑方向：'+d.strategy+'</small>'+
      actionButton('选择 '+d.name,'ticket-'+d.id)+'</div>').join('');
    content='<h2>选择本张刮刮乐</h2><p>第 '+(state.round+1)+' 轮 · 第 '+state.ticketIndex+'/3 张 · 三种票共用同一套16枚印版，不会暗中换中奖池。</p>'+
      bossText+'<div class="work-cards">'+cards+'</div>'+
      '<p>选票后立即锁定布局；不同票型的刮力、压力和计分各不相同。</p>';
  }else if(state.phase==='reward'){
    const options=rewardOptions(b,state.round,state.seed+':reward:'+state.round);
    if(inReprint){
      const choices=(Object.keys(b.levels) as BasicSymbol[]).map(type=>
        actionButton(SYMBOLS[type].name+' ('+b.plate.filter(s=>s===type).length+'/8)',
         'target-'+type,false,reprintTarget!==type)).join('');
      const cells=b.plate.map((sym,i)=>{
        const selected=reprintSelection.includes(i);
        return '<button class="work-cell '+(selected?'selected':'')+'" '+(sym==='ink'?'disabled':'')+
        ' data-action="cell-'+i+'">'+(i+1)+'. '+SYMBOLS[sym].icon+' '+SYMBOLS[sym].name+'</button>';
      }).join('');
      const legal=legalReprint(b,reprintSelection,reprintTarget);
      content='<h2>选择两枚重印</h2><p>改成同一种符号，印版始终保留16枚、至少1枚墨团。先选择目标，再选2个旧实例。</p>'+
       '<div class="work-options">'+choices+'</div><div class="work-grid">'+cells+'</div>'+
       '<p>当前目标：'+SYMBOLS[reprintTarget].name+'；已选 '+reprintSelection.length+'/2</p>'+
       actionButton('确定重印','reprint-confirm',!legal)+
       actionButton('返回三选一','reprint-back',false,true);
    }else{
      const cards=options.map(o=>{
        if(o.kind==='stamp'&&o.stamp)return '<div class="work-card"><div class="work-card-title">① 印章 · '+escapeHtml(o.stamp.name)+'</div><p>'+escapeHtml(o.stamp.description)+'</p>'+actionButton('装备这枚印章','reward-stamp')+'</div>';
        if(o.kind==='upgrade'&&o.symbol)return '<div class="work-card"><div class="work-card-title">② 升版 · '+SYMBOLS[o.symbol].name+'</div><p>本局永久提升该符号基础分 +4；当前 Lv.'+b.levels[o.symbol]+'/3。</p>'+actionButton('升级'+SYMBOLS[o.symbol].name,'reward-upgrade')+'</div>';
        return '<div class="work-card"><div class="work-card-title">③ 重印 · 调整符号配比</div><p>任选两枚非墨团，变为选定的自然符号，便于定向形成构筑。</p>'+actionButton('挑选重印实例','reprint-open')+'</div>';
      }).join('');
      content='<h2>本轮过关！三选一改造</h2><p>本轮 '+state.bank+' / '+ROUND_TARGETS[state.round]+' 分 · 已奖励铜券。只能选择其中一项。</p>'+
        '<div class="work-cards">'+cards+'</div>'+actionButton('跳过，改领 2 铜券','reward-skip',false,true);
    }
  }else if(state.phase==='shop'){
    const offers=state.offers.map(id=>{
      const d=getStamp(id),owned=b.stamps.includes(id);
      return '<div class="work-card">'+stampLine(id)+
      '<p>售价 '+d.price+' 铜券</p>'+
      actionButton(owned?'已经购买':'购买印章','buy-'+id,owned||b.copper<d.price||b.stamps.length>=6)+'</div>';
    }).join('');
    const upgrades=availableUpgrades(b).map(type=>{
      const price=upgradePrice(b,type);
      return actionButton('升 '+SYMBOLS[type].name+' (+4) · '+price+'券','upgrade-'+type,
        b.shopServiceUsed||b.copper<price,true);
    }).join('');
    content='<h2>工坊商店</h2><p>已装备 '+b.stamps.length+'/6 枚印章。当前构筑：'+buildSummary(b)+'</p>'+
     '<div class="work-cards">'+(offers||'<p>本次无新印章</p>')+'</div>'+
     '<h3>升版服务（每店最多购买一次）</h3><div class="work-options">'+upgrades+'</div>'+
     actionButton('离开商店，进入第 '+(state.round+2)+' 轮','shop-next');
  }else{
    const won=state.bank>=ROUND_TARGETS[state.round];
    content='<h2>'+(won?'旅程通关！':'本轮挑战失败')+'</h2><p>第 '+(state.round+1)+' 轮 · '+state.bank+' / '+ROUND_TARGETS[state.round]+' 分</p>'+
      '<p>构筑：'+buildSummary(b)+' · 铜券 '+b.copper+'</p>'+
      '<p>'+(won?'你完成了全部九轮基础计分挑战。':'现有基础内容的目标仍待平衡调优。')+'</p>'+
      actionButton('重新开始旅程','run-reset');
  }
  workshop.innerHTML='<div class="work-panel">'+header+content+'</div>';
  workshop.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach(el=>{
    el.addEventListener('click',()=>handleWorkshopAction(el.dataset.action||''));
  });
}
function rewardChosen(option:RewardOption,source:number[]=[],target?:BasicSymbol):void{
  try{
    state.build=applyReward(state.build,option,source,target);
    state.phase='shop';inReprint=false;reprintSelection=[];
    state.offers=shopOffer(state.build,state.round,state.seed).stampIds;
    message='改造完成！可以在商店继续强化。';
    draw();renderWorkshop();saveRun();
  }catch(e){showWorkshopError(e);}
}
function showWorkshopError(e:unknown):void{
  const panel=workshop.querySelector('.work-panel');
  if(panel){const p=document.createElement('p');p.className='work-error';p.textContent=e instanceof Error?e.message:'操作失败';panel.appendChild(p);}
}
function handleWorkshopAction(action:string):void{
  const b=state.build;
  if(action==='run-reset'){inReprint=false;reset();return;}
  if(state.phase==='ticket-choice'&&action.startsWith('ticket-')){
    const id=action.slice('ticket-'.length) as TicketId;
    const candidates=ticketCandidates(state.seed,state.round,state.ticketIndex,b.plate);
    if(!candidates.some(candidate=>candidate.id===id))return;
    try{
      state.ticket=applyTicketChoice(state.ticket,id,bossForRound(state.round,state.seed));
      state.phase='ticket';
      message='已选 '+ticketDefinition(id).name+'：'+ticketDefinition(id).effect;
      draw();renderWorkshop();saveRun();
    }catch(e){showWorkshopError(e);}
    return;
  }
  if(state.phase==='reward'){
    const options=rewardOptions(b,state.round,state.seed+':reward:'+state.round);
    if(action==='reward-skip'){
      state.build=skipReward(b);state.phase='shop';inReprint=false;
      state.offers=shopOffer(state.build,state.round,state.seed).stampIds;
      draw();renderWorkshop();saveRun();return;
    }
    if(action==='reprint-open'){inReprint=true;reprintSelection=[];renderWorkshop();return;}
    if(action==='reprint-back'){inReprint=false;reprintSelection=[];renderWorkshop();return;}
    if(action.startsWith('target-')){
      reprintTarget=action.slice(7) as BasicSymbol;renderWorkshop();return;
    }
    if(action.startsWith('cell-')){
      const index=Number(action.slice(5));
      if(b.plate[index]==='ink'||!Number.isInteger(index)||index<0||index>=16)return;
      if(reprintSelection.includes(index))reprintSelection=reprintSelection.filter(i=>i!==index);
      else if(reprintSelection.length<2)reprintSelection.push(index);
      renderWorkshop();return;
    }
    if(action==='reprint-confirm'){
      const option=options.find(o=>o.kind==='reprint');
      if(option)rewardChosen(option,reprintSelection,reprintTarget);
      return;
    }
    if(action==='reward-stamp'||action==='reward-upgrade'){
      const option=options.find(o=>o.kind===(action==='reward-stamp'?'stamp':'upgrade'));
      if(option)rewardChosen(option);
      return;
    }
  }
  if(state.phase==='shop'){
    try{
      if(action==='shop-next'){
        state.round++;state.ticketIndex=1;state.bank=0;state.offers=[];
        message='欢迎来到新的灯箱！';newTicket();return;
      }
      if(action.startsWith('buy-')){
        const id=action.slice(4);
        if(!state.offers.includes(id))return;
        state.build=buyStamp(b,id);
      }else if(action.startsWith('upgrade-')){
        const type=action.slice(8) as BasicSymbol;
        if(!availableUpgrades(b).includes(type))return;
        state.build=buyUpgrade(b,type);
      }else return;
      draw();renderWorkshop();saveRun();
    }catch(e){showWorkshopError(e);}
  }
}

function draw():void{
  hitZones=[];scene.removeChildren();foil.beginFrame();
  scene.graphics.clear();scene.graphics.drawRect(0,0,W,H,C.bg);
  // Warm floating decoration outside play surface.
  const aura=new Laya.Sprite();aura.graphics.drawCircle(0,0,260,'#202c4a');
  aura.alpha=.45;aura.pos(685,0);scene.addChild(aura);
  txt(scene,48,34,'✦  刮 出 奇 迹',48,C.gold,510,'left',true);
  txt(scene,48,96,'LUCK WORKSHOP · 肉鸽成长版',20,'#bec9dc',580);
  txt(scene,48,126,'第 '+(state.round+1)+'/9 轮 · 🪙 铜券 '+state.build.copper+' · '+buildSummary(state.build),18,C.mint,670);
  btn(scene,568,45,144,60,'重开', '#c2cee0',()=>reset());
  rect(scene,48,158,654,100,24,'#202d4a','#36466c');
  txt(scene,70,165,'本轮进度',20,C.muted,185);
  txt(scene,70,195,state.bank+' / '+ROUND_TARGETS[state.round],44,C.gold,340,'left',true);
  txt(scene,507,169,'第 '+state.ticketIndex+' / 3 张',28,C.text,175,'center',true);
  txt(scene,511,207,'目标 '+ROUND_TARGETS[state.round]+' 分',20,C.muted,175,'center');
  rect(scene,48,276,654,734,24,C.paper,'#c6a67a');
  txt(scene,83,287,'✦  '+ticketDefinition(state.ticket.ticketType).name,37,'#5a3c2b',450,'left',true);
  txt(scene,490,297,'4 × 4 幸运票',21,'#91714f',175,'right',true);
  txt(scene,87,343,'线索：'+rowClues(state.ticket).map((s,i)=>(i+1)+'行'+s.label).slice(0,2).join('  ·  '),18,'#78614e',583);
  txt(scene,87,376,state.ticket.bossId?'首领：'+BOSSES[state.ticket.bossId].effect:'票型：'+ticketDefinition(state.ticket.ticketType).effect,19,'#845e45',590);
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
  const score=calculateScore(state.ticket,{build:state.build}),canCash=!state.committed&&state.ticket.activatedOrder.length>0;
  btn(scene,48,1170,317,68,state.committed?'已结算':'💰 收下 '+score.score+' 分',
    '#ffcc75',()=>{if(!canCash)return;finishTicket();draw();renderWorkshop();},!canCash);
  const canHint=!state.committed&&state.ticket.scoutRemaining>0;
  btn(scene,385,1170,317,68,canHint?'👁 免费偷看 1 格':'偷看已用完',
    '#83d8d3',hint,!canHint);
  if(state.committed){
    btn(scene,48,1251,654,66,state.done?'重新挑战':state.phase==='reward'?'领取轮后奖励':state.phase==='shop'?'工坊商店':'下一张票 →','#88e5b3',state.phase==='ticket'||state.phase==='ended'?next:renderWorkshop);
  }else if(state.ticket.regularRemaining===0 && state.ticket.extraRemaining>0){
    btn(scene,48,1251,654,66,state.riskArmed?'已开启冒险，继续刮银层':'⚠ 冒险再刮（压力 +1）',
      '#f0a8a2',()=>{state.riskArmed=true;message='风险已开启！继续刮开一个银色格。';draw();});
  }else{
    rect(scene,48,1251,654,66,18,'#263550');
    txt(scene,48,1260,'先选择票型，再按该票的免费刮力决定是否加刮',22,C.muted,654,'center');
  }
  foil.endFrame();
  foil.setEnabled(state.phase==='ticket'&&!state.committed&&(state.ticket.regularRemaining>0||state.riskArmed));
}
async function boot():Promise<void>{
  sizeToWindow();window.addEventListener('resize',sizeToWindow);attachPointerButtons();
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
  if(loadRun()){draw();renderWorkshop();}
  else newTicket();
}
void boot().catch((e:unknown)=>{
  console.error('Game boot failed',e);
  error.textContent='启动失败：'+(e instanceof Error?e.message:String(e));
  error.hidden=false;
});
