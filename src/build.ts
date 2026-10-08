import {INITIAL_PLATE, SYMBOLS, type SymbolKey, type NaturalSymbol} from './rules.js';
import type {ItemId} from './items.js';

export type BasicSymbol=NaturalSymbol;
export type ReprintSymbol=BasicSymbol|'prism';
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
 {id:'R23',name:'留白的价值',description:'正常收手尚余2次常规刮力时 X×1.40',price:10,tag:'早收手'},
 {id:'R03',name:'双份油墨',description:'每种恰好激活2枚的自然图案 B+8',price:6,tag:'同色'},
 {id:'R04',name:'合唱铃',description:'至少激活3枚铃铛时 M+0.40',price:6,tag:'同色'},
 {id:'R11',name:'润滑油',description:'相邻已激活齿轮每枚 B+8',price:6,tag:'几何'},
 {id:'R17',name:'小放大镜',description:'开票时免费显影+1',price:6,tag:'显影'},
 {id:'R19',name:'空白边',description:'剩余常规刮力每次 B+8，最多24',price:6,tag:'早收手'},
 {id:'R20',name:'月牙夹',description:'7格内收手 M+0.25，并解锁月相票',price:6,tag:'早收手'},
 {id:'R25',name:'排气阀',description:'本票首个墨团不会增加压力',price:6,tag:'控压'},
 {id:'R27',name:'耐热铜币',description:'每次追加刮开的倍率代价减0.10',price:6,tag:'控压'},
 {id:'R28',name:'警戒红线',description:'正常结算压力恰为2时 M+0.40',price:6,tag:'控压'},
 {id:'R44',name:'零钱夹',description:'开票持有至少10铜券则基础分+15',price:6,tag:'经济'},
 {id:'R45',name:'五色封条',description:'激活5类自然符号时 M+0.50',price:10,tag:'杂彩'},
 {id:'R06',name:'棱镜夹',description:'每枚激活棱镜额外 B+8',price:10,tag:'同色'},
 {id:'R22',name:'夜间批注',description:'每枚激活月亮 B+10',price:10,tag:'显影'},
 {id:'R34',name:'余音纸',description:'每次非零回声额外 B+6',price:6,tag:'回声'},
 {id:'R42',name:'太阳贴',description:'每枚激活太阳额外 B+6',price:6,tag:'杂彩'},
 {id:'R46',name:'收藏家的票根',description:'5种自然符号且无墨团的正常票 X×1.30',price:10,tag:'杂彩'},
 {id:'R48',name:'万花印记',description:'激活6种自然符号时 X×1.80',price:16,tag:'杂彩'},
 {id:'R05',name:'同色滚轴',description:'最多三响的单类型，每组三响 M+0.25',price:10,tag:'同色'},
 {id:'R07',name:'复写徽记',description:'每种形成三响的自然类型，复制该类型最高的激活基础分一次',price:10,tag:'回声'},
 {id:'R12',name:'交叉订书钉',description:'每个同时属于完整横、竖线的格子 B+12',price:6,tag:'几何'},
 {id:'R13',name:'平行导轨',description:'至少两条同方向有效连线 M+0.50',price:10,tag:'几何'},
 {id:'R14',name:'活字滑轨',description:'每张票免费交换两枚已激活的非墨团格一次',price:10,tag:'几何'},
 {id:'R15',name:'联轴器',description:'相邻齿轮每对 M+0.15，最多 M+0.60',price:10,tag:'几何'},
 {id:'R18',name:'先见之笔',description:'每枚在激活前曾显影的自然符号 B+8',price:6,tag:'显影'},
 {id:'R21',name:'精密取样',description:'至少3枚先显影的自然符号被激活时 M+0.50',price:10,tag:'显影'},
 {id:'R24',name:'明月总图',description:'激活6–7格、至少3格先显影且未刮墨团时 X×1.80',price:16,tag:'显影'},
 {id:'R26',name:'叶脉纸',description:'激活叶片前压力大于0时，该叶片 B+10',price:6,tag:'控压'},
 {id:'R29',name:'安全卡扣',description:'每票首次即将爆票时防护一次，使压力回到2',price:10,tag:'控压'},
 {id:'R30',name:'最后一刮',description:'末次激活来自冒刮且是自然符号 B+30',price:10,tag:'冒刮'},
 {id:'R31',name:'墨渍回收',description:'每枚已激活墨团 B+18',price:10,tag:'控压'},
 {id:'R32',name:'临界奇迹',description:'曾冒刮且正常结算、压力恰好2时 X×2.00',price:16,tag:'冒刮'},
 {id:'R35',name:'导火线',description:'首枚火花回声若来自宝石，再追加相同回声一次',price:6,tag:'回声'},
 {id:'R36',name:'节拍器',description:'第3、6、9次激活自然符号各 B+10',price:6,tag:'回声'},
 {id:'R37',name:'复印轮',description:'前两次非零回声各复制一次，不递归',price:10,tag:'回声'},
 {id:'R38',name:'末尾签名',description:'正常结算时回声最后一枚自然符号一次',price:10,tag:'回声'},
 {id:'R39',name:'火花长列',description:'相邻火花和宝石每对 M+0.20，最多 M+0.60',price:10,tag:'回声'},
 {id:'R40',name:'总编的批复',description:'至少4次非零回声时 X×1.75',price:16,tag:'回声'},
 {id:'R43',name:'节约章',description:'每轮有正常收手剩余刮力时，轮后额外+1铜券',price:6,tag:'经济'},
 {id:'R47',name:'精打细算',description:'每店首次购买商品减2铜券，最低1铜券',price:10,tag:'经济'}
];
export interface Build {
  plate:SymbolKey[];levels:Record<BasicSymbol,number>;
  stamps:string[];copper:number;shopServiceUsed:boolean;shopDiscountUsed?:boolean;items:ItemId[];
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
  levels:{star:0,bell:0,leaf:0,gear:0,gem:0,key:0,spark:0,sun:0,moon:0,vault:0},
  stamps:[],items:[],copper:6,shopServiceUsed:false,shopDiscountUsed:false};
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
export function legalReprint(b:Build,sourceIndices:number[],target:ReprintSymbol):boolean{
 if(sourceIndices.length!==2 || new Set(sourceIndices).size!==2 || !(target in b.levels || target==='prism'))return false;
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
export function applyReward(b:Build,reward:RewardOption,sourceIndices:number[]=[],target?:ReprintSymbol):Build{
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
 const out=copyBuild(b);out.copper+=roundCopper(round,ticketsUsed);out.shopServiceUsed=false;out.shopDiscountUsed=false;return out;
}
export function skipReward(b:Build):Build{const out=copyBuild(b);out.copper+=2;return out;}
export function shopOffer(b:Build,round:number,seed:string):ShopOffer{
 return {stampIds:rotated(STAMPS.filter(s=>!b.stamps.includes(s.id)&&(round>=6||s.price===6)),seed+':shop:'+round).slice(0,3).map(s=>s.id)};
}
/** A single R47 discounted purchase per store, with no deferred or negative costs. */
export function shopPrice(b:Build,base:number):number{
 return b.stamps.includes('R47')&&!b.shopDiscountUsed?Math.max(1,base-2):base;
}
export function buyStamp(b:Build,stampId:string):Build{
 const stamp=getStamp(stampId);
 if(b.stamps.includes(stampId)||b.stamps.length>=6)throw new Error('印章槽已满或重复');
 const cost=shopPrice(b,stamp.price);
 if(b.copper<cost)throw new Error('铜券不足');
 const out=copyBuild(b);out.copper-=cost;out.stamps.push(stampId);
 if(cost!==stamp.price)out.shopDiscountUsed=true;
 return out;
}
export function upgradePrice(b:Build,type:BasicSymbol):number{
 if(!canUpgrade(b,type))throw new Error('升版已达上限');
 return [5,7,9][b.levels[type]];
}
export function buyUpgrade(b:Build,type:BasicSymbol):Build{
 if(b.shopServiceUsed)throw new Error('本间商店已经购买过印版服务');
 const price=upgradePrice(b,type);
 const cost=shopPrice(b,price);
 if(b.copper<cost)throw new Error('铜券不足');
 const out=copyBuild(b);out.levels[type]++;out.copper-=cost;out.shopServiceUsed=true;
 if(cost!==price)out.shopDiscountUsed=true;
 return out;
}
export function upgradeLabel(b:Build,type:BasicSymbol):string{
 return SYMBOLS[type].name+' Lv.'+b.levels[type]+' → '+(b.levels[type]+1);
}
export function buildSummary(b:Build):string{
 const boosted=(Object.keys(b.levels) as BasicSymbol[]).filter(type=>b.levels[type]>0).map(type=>SYMBOLS[type].name+'+'+(b.levels[type]*4));
 return b.stamps.length+'枚印章 · '+(boosted.join(' / ')||'印版未升级');
}
