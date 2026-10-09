import {cardDefinition,BASE_WIN_CHANCE,AMOUNT_POOL,CASHOUT_SAFETY,CASHOUT_REWARDS,DRAGON_EYE_TICKET_CHANCE,LEDGER_POOL,DESTINY_POOL,type CardId} from './config.js';
export interface TicketCell { kind: 'number'|'symbol'|'money'|'safe'|'bomb'|'road'|'blocked'|'double'|'empty'|'eye'|'heart'|'gate'|'heaven'|'devil'|'earth'; value: string; }
export interface TicketInstance {
 cardId: CardId; nonce: string; rngSeed: string; prizeTableVersion: string;
 committedLayout: TicketCell[]; revealed: number[]; choices: number[];
 cashout: boolean; settled: boolean;
}
export function seededRandom(seed:string):()=>number {
 let h=2166136261;for(const c of seed){h=Math.imul(h^c.charCodeAt(0),16777619);}
 return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^h>>>15,1|h);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
}
export function createIdiomTicket(cardId:CardId,seed:string,nonce:string):TicketInstance {
 const def=cardDefinition(cardId),rng=seededRandom(seed);
 const wins=()=>rng()<BASE_WIN_CHANCE[cardId];
 const int=(min:number,max:number)=>min+Math.floor(rng()*(max-min+1));
 const cell=(kind:TicketCell['kind'],value:string|number|bigint):TicketCell=>({kind,value:String(value)});
 let layout:TicketCell[]=[];
 const numbers=(values:number[])=>values.map(n=>cell('number',n));
 switch(def.mode){
  case 'amount':{const r=rng();layout=[cell('money',r<AMOUNT_POOL[0].chance?AMOUNT_POOL[0].prize:r<AMOUNT_POOL[0].chance+AMOUNT_POOL[1].chance?AMOUNT_POOL[1].prize:0n)];break;}
  case 'pair':{const a=int(0,3),b=(a+int(1,3))%4,c=(b+1)%4;
   const icons=['福','玉','花','果'];const win=wins();
   const vals=win?[a,a,b]:[a,b,c===a?(c+1)%4:c];
   for(let i=vals.length-1;i>0;i--){const j=int(0,i);[vals[i],vals[j]]=[vals[j],vals[i]];}
   layout=vals.map(n=>cell('symbol',icons[n]));break;}
  case 'multiply':layout=numbers(wins()?(rng()<.5?[3,7]:[7,3]):[int(2,6),int(2,6)]);break;
  case 'compare':{const win=wins(),other=int(2,8);layout=numbers([win?int(other+1,12):int(1,other),other]);break;}
  case 'rise':{const win=wins(),a=int(1,4);layout=numbers(win?[a,a+int(1,3),a+7]:[a,a+4,a+int(0,4)]);break;}
  case 'sum':{const win=wins();const a=int(5,20),b=int(5,20),c=int(5,20);layout=numbers([a,b,c,win?100-a-b-c+int(0,20):int(0,30)]);break;}
  case 'dice':{const win=wins();layout=numbers(win?[6,6]:[int(1,6),int(1,5)]);break;}
  case 'position':layout=numbers(wins()?[7,8]:rng()<.5?[8,7]:[int(1,6),int(1,6)]);break;
  case 'mines':{
   layout=Array.from({length:10},(_,i)=>cell(i<4?'bomb':'safe',i<4?'雷':'安'));
   for(let i=9;i>0;i--){const j=int(0,i);[layout[i],layout[j]]=[layout[j],layout[i]];}break;
  }
  case 'path':{
   const win=wins();const path=rng()<.5?[0,1,2,5,8]:[0,3,6,7,8];
   layout=Array.from({length:9},(_,i)=>cell(path.includes(i)?'road':'blocked',path.includes(i)?'路':'岩'));
   if(!win){layout[path[2]]=cell('blocked','岩');}break;
  }
  case 'cashout':{
   layout=CASHOUT_REWARDS.map((value,i)=>rng()<CASHOUT_SAFETY[i]?cell('money',value):cell('bomb','雷'));break;
  }
  case 'double':{const win=wins();layout=[cell('money',2000000),cell('money',3000000),cell(win?'double':'empty',win?'同领':'无奖')];break;}
  case 'eye':{const eye=rng()<DRAGON_EYE_TICKET_CHANCE?int(0,2):-1;layout=Array.from({length:3},(_,i)=>cell(i===eye?'eye':'empty',i===eye?'真':'假'));break;}
  case 'ledger':{
   const r=rng();let cumulative=0,target=2000000;
   for(const tier of LEDGER_POOL){cumulative+=tier.chance;if(r<cumulative){target=tier.target;break;}}
   const base=Math.floor(target/6);layout=Array.from({length:6},(_,i)=>cell('money',i===5?target-base*5:base));break;
  }
  case 'heart':layout=[cell(wins()?'heart':'empty','心')];break;
  case 'hearts':{const win=wins();const miss=int(0,2);layout=Array.from({length:3},(_,i)=>cell(win||i!==miss?'heart':'empty','心'));break;}
  case 'ladder':{
   layout=Array.from({length:15},()=>cell('empty','落'));
   for(let row=0;row<3;row++)layout[row*5+int(0,4)]=cell('gate','升');break;
  }
  case 'destiny':layout=Array.from({length:3},()=>{const r=rng(),heaven=r<DESTINY_POOL.heaven,devil=r<DESTINY_POOL.heaven+DESTINY_POOL.devil;
   return cell(heaven?'heaven':devil?'devil':'earth',heaven?'天堂':devil?'恶魔':'凡间');});break;
 }
 return {cardId,nonce,rngSeed:seed,prizeTableVersion:def.prizeTableVersion,committedLayout:layout,revealed:[],choices:[],cashout:false,settled:false};
}
