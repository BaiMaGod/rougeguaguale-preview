import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createBuild} from '../build/build.js';
import {createTicket} from '../build/rules.js';
import {eventForRound} from '../build/events.js';
import {ticketCandidates} from '../build/tickets.js';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
const save=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
async function load(fixture){
 await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
 await page.evaluate(obj=>localStorage.setItem('foil-run-v4',JSON.stringify(obj)),fixture);
 await page.reload();
 await page.waitForFunction(()=>window.Laya?.stage?.numChildren>0);
}
function fixture(seed='expansion-ui',round=1,phase='ticket'){
 const b=createBuild();
 return {version:4,seed,round,bank:0,ticketIndex:1,ticket:createTicket('fixture-expand'),
  committed:false,riskArmed:false,done:false,build:b,phase,offers:[],itemPurchased:false};
}
try{
 // T09 free reshuffle must be an independent UI path, not charge an I08 consumable.
 const swap=fixture('free-swap',1);
 swap.ticket.ticketType='T09';
 swap.ticket.cells[0].symbol='star';swap.ticket.cells[1].symbol='bell';
 swap.ticket.cells[0].state='active';swap.ticket.cells[1].state='active';
 swap.ticket.activatedOrder=[0,1];swap.ticket.regularRemaining=6;
 await load(swap);
 let rect=await page.locator('#game-root').boundingBox();
 await page.mouse.click(rect.x+147*rect.width/750,rect.y+1282*rect.height/1334);
 await page.getByRole('heading',{name:/折返票 · 免费换位/}).waitFor();
 await page.getByRole('button',{name:/A1 · 星星/}).click();
 await page.getByRole('button',{name:/B1 · 铃铛/}).click();
 await page.getByRole('button',{name:'确认换位'}).click();
 let run=await save();
 assert.equal(run.ticket.cells[0].symbol,'bell');
 assert.equal(run.ticket.cells[1].symbol,'star');
 assert.equal(run.ticket.freeSwapUsed,true);
 assert.equal(run.ticket.regularRemaining,6);
 assert.equal(run.build.items.length,0);
 await page.reload();
 run=await save();assert.equal(run.ticket.freeSwapUsed,true);
 console.log('T09 SWAP UI PASS: free exchange twice-selected natural cells; budget and save preserved');

 // Reward -> seeded event -> skip -> shop, then separate purchase event with targeting.
 let seed='event-seed';
 for(let n=0;n<1000&&eventForRound(1,seed)?.id!=='E01';n++)seed='event-seed-'+n;
 assert.equal(eventForRound(1,seed)?.id,'E01');
 const phase=fixture(seed,1,'reward');
 phase.bank=440;phase.ticket.status='settled';phase.ticket.settled=true;
 phase.ticket.cells[0].state='active';phase.ticket.activatedOrder=[0];
 phase.ticket.finalScore=440;phase.committed=true;
 await load(phase);
 await page.getByRole('heading',{name:/本轮过关！三选一改造/}).waitFor();
 await page.getByRole('button',{name:/跳过，改领 2 铜券/}).click();
 await page.getByRole('heading',{name:/旧印版摊/}).waitFor();
 run=await save();
 assert.equal(run.phase,'event');
 const before=run.build.copper;
 await page.getByRole('button',{name:'选择目标后执行 A'}).click();
 await page.getByRole('button',{name:/★ 星星 Lv.0/}).click();
 await page.getByRole('button',{name:'确定本次选择'}).click();
 run=await save();
 assert.equal(run.phase,'shop');
 assert.equal(run.build.levels.star,1);
 assert.equal(run.build.copper,before-4);
 console.log('EVENT UI PASS: reward enters E01, target selection deducts 4 copper and grants level');

 // Event B may be taken once; rejection of full backpack is validated by unit tests.
 let seed2='event-E02';
 for(let n=0;n<1000&&eventForRound(4,seed2)?.id!=='E02';n++)seed2='event-E02-'+n;
 assert.equal(eventForRound(4,seed2)?.id,'E02');
 const second=fixture(seed2,4,'event');
 await load(second);
 await page.getByRole('heading',{name:/钟楼学徒/}).waitFor();
 await page.getByRole('button',{name:'执行选择 A'}).click();
 run=await save();
 assert.equal(run.phase,'shop');
 assert.equal(run.build.plate.filter(x=>x==='star').length,2);
 assert.equal(run.build.plate.filter(x=>x==='bell').length,5);
 console.log('EVENT REPRINT UI PASS: E02 free conversion changes 16-instance plate');

 // T10 appears as a gated legitimate candidate and can be chosen.
 let moon='offer-moon';
 const moonBuild=createBuild();moonBuild.stamps=['R20'];
 for(let n=0;n<1000&&!ticketCandidates(moon,1,1,moonBuild.plate,moonBuild.stamps).some(x=>x.id==='T10');n++)moon='moon-seed-'+n;
 assert.ok(ticketCandidates(moon,1,1,moonBuild.plate,moonBuild.stamps).some(x=>x.id==='T10'));
 const offer=fixture(moon,1,'ticket-choice');offer.build=moonBuild;
 await load(offer);
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 await page.getByRole('button',{name:'选择 月相票'}).click();
 run=await save();
 assert.equal(run.ticket.ticketType,'T10');
 assert.equal(run.phase,'ticket');
 assert.deepEqual(errors,[]);
 console.log('T10 OFFER UI PASS: gated moon-phase ticket available and playable, no browser errors');
}finally{await browser.close();}
