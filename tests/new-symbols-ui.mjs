import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createBuild} from '../build/build.js';
import {createTicket,calculateScore} from '../build/rules.js';
import {eventForRound} from '../build/events.js';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
async function load(fixture){
 await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
 await page.evaluate(v=>localStorage.setItem('foil-run-v4',JSON.stringify(v)),fixture);
 await page.reload();
 await page.waitForFunction(()=>window.Laya?.stage?.numChildren>0);
}
const fixture=(seed,round,phase,build=createBuild())=>({
 version:4,seed,round,bank:440,ticketIndex:1,
 ticket:createTicket('event-9'),committed:phase!=='ticket',
 riskArmed:false,done:false,build,phase,offers:[],itemPurchased:false
});
function eventSeed(id){
 for(let i=0;i<2000;i++){
  const seed='v09-event-'+id+'-'+i;
  if(eventForRound(1,seed)?.id===id)return seed;
 }
 throw Error('No event seed for '+id);
}
try{
 const e06=fixture(eventSeed('E06'),1,'event');
 await load(e06);
 await page.getByRole('heading',{name:/夜间天文台/}).waitFor();
 await page.getByRole('button',{name:'执行选择 A'}).click();
 let a=await state();
 assert.equal(a.phase,'shop');
 assert.equal(a.build.plate.filter(x=>x==='moon').length,2);
 assert.equal(a.build.plate.filter(x=>x==='ink').length,2);
 console.log('ASTRONOMY UI PASS: free moon engraving actually updates plate');

 const e09=fixture(eventSeed('E09'),1,'event');
 await load(e09);
 await page.getByRole('heading',{name:/年轻画师/}).waitFor();
 await page.getByRole('button',{name:'执行选择 A'}).click();
 a=await state();
 assert.equal(a.phase,'shop');
 assert.equal(a.build.plate.filter(x=>x==='sun').length,1);
 assert.equal(a.build.plate.filter(x=>x==='vault').length,1);
 console.log('PAINTER UI PASS: two different naturals become sun and vault');

 const e11=fixture(eventSeed('E11'),1,'event');
 await load(e11);
 await page.getByRole('heading',{name:/复印室/}).waitFor();
 await page.getByRole('button',{name:'执行选择 A'}).click();
 a=await state();
 assert.equal(a.phase,'shop');
 assert.equal(a.build.plate.filter(x=>x==='spark').length,2);
 console.log('COPY ROOM UI PASS: spark engraving actually changes plate');

 const stamped=createBuild();stamped.stamps=['R01','R16'];stamped.copper=9;
 await load(fixture(eventSeed('E07'),1,'event',stamped));
 await page.getByRole('heading',{name:/余墨换物/}).waitFor();
 await page.getByRole('button',{name:'选择目标后执行 A'}).click();
 await page.getByRole('heading',{name:/选择回收印章/}).waitFor();
 let current=await state();
 assert.deepEqual(current.build.stamps,['R01','R16']);
 await page.getByRole('button',{name:/经纬印刷机 · 回收 11 铜券/}).click();
 current=await state();
 assert.equal(current.build.copper,9,'selection alone must not spend or award currency');
 await page.getByRole('button',{name:'确认回收'}).click();
 current=await state();
 assert.deepEqual(current.build.stamps,['R01']);
 assert.equal(current.build.copper,20);
 console.log('STAMP RECYCLING UI PASS: explicit chosen epic stamp recycled for eleven copper');

 const b=createBuild();
 const reward=fixture('v09-prism',0,'reward',b);
 reward.ticket.status='settled';reward.ticket.settled=true;reward.ticket.finalScore=100;reward.committed=true;
 await load(reward);
 await page.getByRole('heading',{name:/本轮过关！三选一改造/}).waitFor();
 await page.getByRole('button',{name:'挑选重印实例'}).click();
 await page.getByRole('button',{name:/棱镜 \(0\/8\)/}).click();
 await page.getByRole('button',{name:/1\. .*星星/}).click();
 await page.getByRole('button',{name:/2\. .*星星/}).click();
 await page.getByRole('button',{name:'确定重印'}).click();
 current=await state();
 assert.equal(current.phase,'shop');
 assert.equal(current.build.plate.filter(x=>x==='prism').length,2);
 assert.equal(current.build.plate.filter(x=>x==='ink').length,2);
 await page.reload();
 current=await state();
 assert.equal(current.build.plate.filter(x=>x==='prism').length,2);
 assert.deepEqual(errors,[]);
 console.log('PRISM REPRINT UI PASS: user can reprint and persist 2 prisms while retaining ink');
}finally{await browser.close();}
