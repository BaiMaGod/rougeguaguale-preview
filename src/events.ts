import {copyBuild,canUpgrade,legalReprint,getStamp,type BasicSymbol,type Build} from './build.js';
import {SYMBOLS} from './rules.js';
import type {ItemId} from './items.js';

export type EventId='E01'|'E02'|'E03'|'E04'|'E05'|'E06'|'E07'|'E08'|'E09'|'E10'|'E11'|'E12';
export type EventChoice='A'|'B';
export interface EventDef{id:EventId;name:string;a:string;b:string;}
export const EVENTS:readonly EventDef[]=[
 {id:'E01',name:'旧印版摊',a:'花4铜券，指定一个符号升版一级',b:'花3铜券获得显影液'},
 {id:'E02',name:'钟楼学徒',a:'免费把印版前两枚星星改成铃铛',b:'获得2铜券'},
 {id:'E03',name:'温室园丁',a:'免费把印版前两枚非叶片自然符号改成叶片',b:'免费获得冷风瓶'},
 {id:'E04',name:'珠宝鉴定',a:'花5铜券将前两枚非宝石自然符号改为宝石',b:'免费获得批注贴纸'},
 {id:'E05',name:'机械义卖',a:'花4铜券购买润滑油印章',b:'免费获得活字镊子'},
 {id:'E06',name:'夜间天文台',a:'免费把两枚非月亮自然符号变成月亮',b:'免费获得显影液'},
 {id:'E07',name:'余墨换物',a:'指定回收一枚已拥有印章，回收价之外额外获得3铜券',b:'获得1铜券'},
 {id:'E08',name:'烫金试印',a:'花2铜券获得烫金缎带',b:'免费获得铜铃绳'},
 {id:'E09',name:'年轻画师',a:'把两枚不同自然类型分别改为太阳与金库',b:'获得2铜券'},
 {id:'E10',name:'失物招领',a:'免费获得新刮片',b:'免费获得透光尺'},
 {id:'E11',name:'复印室',a:'把两枚非火花自然符号免费重印为火花',b:'免费获得复写纸'},
 {id:'E12',name:'开放工坊',a:'免费指定一个符号升版',b:'免费把前两枚可选自然符号重印为指定类型'}
];
function hash(seed:string):number{
 let h=2166136261>>>0;for(const c of seed){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return h>>>0;
}
/** One different seeded event after rounds 2 and 5, by zero-indexed round. */
export function eventForRound(round:number,seed:string):EventDef|undefined{
 if(round!==1&&round!==4)return;
 const index=hash(seed+':workshop-events')%EVENTS.length;
 const offset=1+(hash(seed+':workshop-offset')%(EVENTS.length-1));
 return EVENTS[round===1?index:(index+offset)%EVENTS.length];
}
function sources(build:Build,target:BasicSymbol,only?:BasicSymbol):number[]{
 return build.plate.map((sym,i)=>({sym,i})).filter(x=>
  SYMBOLS[x.sym].natural&&(only?x.sym===only:x.sym!==target)
 ).slice(0,2).map(x=>x.i);
}
function canChange(build:Build,target:BasicSymbol,only?:BasicSymbol):boolean{
 const src=sources(build,target,only);
 return src.length===2&&legalReprint(build,src,target);
}
function inventorySpace(build:Build):boolean{return build.items.length<2;}
function pairOfDifferentNaturals(build:Build):number[]{
 const candidates=build.plate.map((sym,i)=>({sym,i})).filter(x=>SYMBOLS[x.sym].natural&&x.sym!=='sun'&&x.sym!=='vault');
 const one=candidates[0];
 const two=candidates.find(x=>x.sym!==one?.sym);
 return one&&two?[one.i,two.i]:[];
}
function canPaintPair(build:Build):boolean{
 const pair=pairOfDifferentNaturals(build);
 if(pair.length!==2)return false;
 const copy=build.plate.slice();
 copy[pair[0]]='sun';copy[pair[1]]='vault';
 return copy.filter(s=>s==='sun').length<=8&&copy.filter(s=>s==='vault').length<=8;
}
export function eventNeedsStamp(event:EventId,choice:EventChoice):boolean{
 return event==='E07'&&choice==='A';
}
export function eventAvailable(event:EventId,choice:EventChoice,build:Build,target?:BasicSymbol,stampId?:string):boolean{
 if(!EVENTS.some(e=>e.id===event))return false;
 if(event==='E01')return choice==='A'
  ?build.copper>=4&&!!target&&canUpgrade(build,target)
  :build.copper>=3&&inventorySpace(build);
 if(event==='E02')return choice==='A'?canChange(build,'bell','star'):true;
 if(event==='E03')return choice==='A'?canChange(build,'leaf'):inventorySpace(build);
 if(event==='E04')return choice==='A'?build.copper>=5&&canChange(build,'gem'):inventorySpace(build);
 if(event==='E05')return choice==='A'?build.copper>=4&&
   build.stamps.length<6&&!build.stamps.includes('R11'):inventorySpace(build);
 if(event==='E06')return choice==='A'?canChange(build,'moon'):inventorySpace(build);
 if(event==='E07')return choice==='A'?!!stampId&&build.stamps.includes(stampId):true;
 if(event==='E08')return choice==='A'?build.copper>=2&&inventorySpace(build):inventorySpace(build);
 if(event==='E09')return choice==='A'?canPaintPair(build):true;
 if(event==='E10')return inventorySpace(build);
 if(event==='E11')return choice==='A'?canChange(build,'spark'):inventorySpace(build);
 if(event==='E12')return choice==='A'
  ?!!target&&canUpgrade(build,target):!!target&&canChange(build,target);
 return false;
}
export function applyEvent(build:Build,event:EventId,choice:EventChoice,target?:BasicSymbol,stampId?:string):Build{
 if(!eventAvailable(event,choice,build,target,stampId))throw new Error('此事件选项当前不可用，未消耗资源');
 const next=copyBuild(build);
 const put=(id:ItemId)=>{next.items.push(id);};
 const transform=(type:BasicSymbol,source?:BasicSymbol)=>{
  for(const index of sources(next,type,source))next.plate[index]=type;
 };
 switch(event){
  case 'E01': if(choice==='A'){next.copper-=4;next.levels[target!]++;}else{next.copper-=3;put('I02');}break;
  case 'E02': if(choice==='A')transform('bell','star');else next.copper+=2;break;
  case 'E03': if(choice==='A')transform('leaf');else put('I01');break;
  case 'E04': if(choice==='A'){next.copper-=5;transform('gem');}else put('I09');break;
  case 'E05': if(choice==='A'){next.copper-=4;next.stamps.push('R11');}else put('I08');break;
  case 'E06':if(choice==='A')transform('moon');else put('I02');break;
  case 'E07':if(choice==='A'){
    const stamp=getStamp(stampId!);
    next.stamps=next.stamps.filter(id=>id!==stampId);
    next.copper+=Math.floor(stamp.price/2)+3;
   }else next.copper+=1;
   break;
  case 'E08': if(choice==='A'){next.copper-=2;put('I07');}else put('I06');break;
  case 'E09': if(choice==='A'){
    const pair=pairOfDifferentNaturals(next);
    next.plate[pair[0]]='sun';next.plate[pair[1]]='vault';
   }else next.copper+=2;
   break;
  case 'E10': put(choice==='A'?'I03':'I04');break;
  case 'E11':if(choice==='A')transform('spark');else put('I12');break;
  case 'E12': if(choice==='A')next.levels[target!]++;else transform(target!);break;
 }
 return next;
}
export function eventNeedsTarget(event:EventId,choice:EventChoice):boolean{
 return (event==='E01'&&choice==='A')||(event==='E12');
}
