export function seededRandom(seed:string):()=>number {
 let h=2166136261;for(const c of seed){h=Math.imul(h^c.charCodeAt(0),16777619);}
 return ()=>{h+=0x6D2B79F5;let t=Math.imul(h^h>>>15,1|h);t^=t+Math.imul(t^t>>>7,61|t);return ((t^t>>>14)>>>0)/4294967296;};
}
