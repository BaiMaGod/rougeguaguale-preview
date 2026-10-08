import {INITIAL_PLATE, SYMBOLS, type SymbolKey} from './rules.js';
import type {ItemId} from './items.js';

export type BasicSymbol=Exclude<SymbolKey,'ink'>;
export type RewardKind='stamp'|'upgrade'|'reprint';
export interface StampDef {id:string;name:string;description:string;price:number;tag:string;}
export const STAMPS:readonly StampDef[]=[
 {id:'R01',name:'星星签',description:'每枚已刮出的星星基础分 +4',price:6,tag:'同色'},
 {id:'R09',name:'铜尺',description:'每条有效横线或竖线基础分 +16',price:6,tag:'连线'},
 {id:'R41',name:'彩墨盒',description:'激活至少 4 种自然符号，基础分 +20',price:6,tag:'杂彩'},
 {id:'R02',name:'三枚一组',description:'每组三响额外基础分 +12',price:6,tag:'同色'},
 {id:'R10',name:'角标',description:'每个已刮开的非墨团角格基础分 +8',price:6,tag:'连线'},
 {id:'R33',name:'宝石底座',description:'每枚已刮出的宝石基础分 +6',price:6,tag:'宝石'},
 {id:'R08',name:'满堂星火',description:'本票至少3组三响时 X×2.00',price:16,tag:'三响'},
 {id:'R16',name:'经纬印刷机',description:'至少一条横线和一条竖线时 X×1.80',price:16,tag:'几何'},
 {id:'R23',name:'留白的价值',description:'正常收手尚余2次常规刮力时 X×1.40',price:10,tag:'早收手'}
];
export interface Build {
  plate:SymbolKey[];levels:Record<BasicSymbol,number>;
  stamps:string[];copper:number;shopServiceUsed:boolean;items:ItemId[];
}
export interface RewardOption {kind:RewardKind;id:string;symbol?:BasicSymbol;stamp?:StampDef;}
export interface ShopOffer {stampIds:string[];}
export function seededNumber(seed:string):number{
 let h=2166136261>>>0;
 for(let i=0;i<seed.length;i++){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}
 return h>>>0;
}
function rotated<T>(values:readonly T[],seed:string):T[]{
 if(!values.length)return [];
 const result=[...values];let s=seededNumber(seed);
 for(let i=result.length-1;i>0;i--){s=(Math.imul(s,1664525)+1013904223)>>>0;const j=s%(i+1);[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
export function createBuild():Build{
 return {plate:[...INITIAL_PLATE],
  levels:{star:0,bell:0,leaf:0,gear:0,gem:0},
  stamps:[],items:[],copper:6,shopServiceUsed:false};
}
export function copyBuild(b:Build):Build{
 return {...b,plate:[...b.plate],levels:{...b.levels},stamps:[...b.stamps],items:[...(b.items??[])]};
}
export function getStamp(id:string):StampDef {
 const stamp=STAMPS.find(s=>s.id===id);
 if(!stamp)throw new Error('未知印章 '+id);
 return stamp;
}
export function typeCount(b:Build,type:BasicSymbol):number{return b.plate.filter(s=>s===type).length;}
export function canUpgrade(b:Build,type:BasicSymbol):boolean{return b.levels[type]<3 && typeCount(b,type)>0;}
export function availableUpgrades(b:Build):BasicSymbol[]{
 return (Object.keys(b.levels) as BasicSymbol[]).filter(type=>canUpgrade(b,type));
}
export function legalReprint(b:Build,sourceIndices:number[],target:BasicSymbol):boolean{
 if(sourceIndices.length!==2 || new Set(sourceIndices).size!==2 || !(target in b.levels))return false;
 if(sourceIndices.some(i=>!Number.isInteger(i)||i<0||i>=16||b.plate[i]==='ink'))return false;
 const after=b.plate.map((s,i)=>sourceIndices.includes(i)?target:s);
 return after.filter(s=>s===target).length<=8 &&
  after.filter(s=>s==='ink').length>=1 && after.length===16;
}
export function rewardOptions(b:Build,round:number,seed:string):RewardOption[]{
 const stamps=round===0?STAMPS.filter(s=>['R01','R09','R41'].includes(s.id)):STAMPS.filter(s=>round>=6||s.price===6);
 const available=rotated(stamps.filter(s=>!b.stamps.includes(s.id)),seed+':stamp');
 const upgrades=rotated(availableUpgrades(b),seed+':upgrade');
 const options:RewardOption[]=[];
 if(available.length && b.stamps.length<6)options.push({kind:'stamp',id:'stamp-'+round,stamp:available[0]});
 if(upgrades.length)options.push({kind:'upgrade',id:'upgrade-'+round,symbol:upgrades[0]});
 if(b.plate.filter(s=>s!=='ink').length>=2)options.push({kind:'reprint',id:'reprint-'+round});
 return options;
}
export function applyReward(b:Build,reward:RewardOption,sourceIndices:number[]=[],target?:BasicSymbol):Build{
 const result=copyBuild(b);
 if(reward.kind==='stamp'){
  if(!reward.stamp)throw new Error('印章不存在');
  if(result.stamps.includes(reward.stamp.id)||result.stamps.length>=6)throw new Error('没有空闲印章位');
  getStamp(reward.stamp.id);result.stamps.push(reward.stamp.id);
 }else if(reward.kind==='upgrade'){
  if(!reward.symbol||!canUpgrade(result,reward.symbol))throw new Error('升版不可用');
  result.levels[reward.symbol]++;
 }else{
  if(!target||!legalReprint(result,sourceIndices,target))throw new Error('重印配置非法');
  for(const index of sourceIndices)result.plate[index]=target;
 }
 return result;
}
export function roundCopper(round:number,ticketsUsed:number):number{
 if(round<0||round>8||ticketsUsed<1||ticketsUsed>3)throw new Error('无效轮次');
 if(round===8)return 0;
 const base=[6,6,10,6,6,10,6,6][round];
 return base+Math.min(4,(3-ticketsUsed)*2);
}
export function grantRoundCopper(b:Build,round:number,ticketsUsed:number):Build{
 const out=copyBuild(b);out.copper+=roundCopper(round,ticketsUsed);out.shopServiceUsed=false;return out;
}
export function skipReward(b:Build):Build{const out=copyBuild(b);out.copper+=2;return out;}
export function shopOffer(b:Build,round:number,seed:string):ShopOffer{
 return {stampIds:rotated(STAMPS.filter(s=>!b.stamps.includes(s.id)&&(round>=6||s.price===6)),seed+':shop:'+round).slice(0,3).map(s=>s.id)};
}
export function buyStamp(b:Build,stampId:string):Build{
 const stamp=getStamp(stampId);
 if(b.stamps.includes(stampId)||b.stamps.length>=6)throw new Error('印章槽已满或重复');
 if(b.copper<stamp.price)throw new Error('铜券不足');
 const out=copyBuild(b);out.copper-=stamp.price;out.stamps.push(stampId);return out;
}
export function upgradePrice(b:Build,type:BasicSymbol):number{
 if(!canUpgrade(b,type))throw new Error('升版已达上限');
 return [5,7,9][b.levels[type]];
}
export function buyUpgrade(b:Build,type:BasicSymbol):Build{
 if(b.shopServiceUsed)throw new Error('本间商店已经购买过印版服务');
 const price=upgradePrice(b,type);
 if(b.copper<price)throw new Error('铜券不足');
 const out=copyBuild(b);out.levels[type]++;out.copper-=price;out.shopServiceUsed=true;return out;
}
export function upgradeLabel(b:Build,type:BasicSymbol):string{
 return SYMBOLS[type].name+' Lv.'+b.levels[type]+' → '+(b.levels[type]+1);
}
export function buildSummary(b:Build):string{
 const boosted=(Object.keys(b.levels) as BasicSymbol[]).filter(type=>b.levels[type]>0).map(type=>SYMBOLS[type].name+'+'+(b.levels[type]*4));
 return b.stamps.length+'枚印章 · '+(boosted.join(' / ')||'印版未升级');
}
