import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createBuild,grantRoundCopper} from '../build/build.js';
import {createTicket} from '../build/rules.js';
import {bossForRound,BOSSES} from '../build/tickets.js';

function fixture(){
 const ticket=createTicket('fixture-first');
 ticket.cells[0].state='active';
 ticket.activatedOrder=[0];
 ticket.status='settled';
 ticket.settled=true;
 ticket.finalScore=280;
 const build=grantRoundCopper(createBuild(),0,3);
 return {version:4,seed:'fixture-workshop',round:0,bank:280,ticketIndex:3,
   ticket,committed:true,riskArmed:false,done:false,build,phase:'reward',offers:[]};
}
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
try{
 const snapshot=fixture();
 await page.addInitScript(value=>{
   if(!sessionStorage.getItem('fixture-loaded')){
     localStorage.setItem('foil-run-v4',JSON.stringify(value));
     sessionStorage.setItem('fixture-loaded','1');
   }
 },snapshot);
 await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
 await page.locator('#workshop-overlay.open').waitFor();
 await page.getByText('本轮过关！三选一改造').waitFor();
 const rewardCards=page.locator('.work-card');
 assert.equal(await rewardCards.count(),3,'there must be three reward categories');
 await page.getByRole('button',{name:'装备这枚印章'}).click();
 await page.getByRole('heading',{name:'工坊商店'}).waitFor();
 let run=await page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
 assert.equal(run.phase,'shop');
 assert.equal(run.build.stamps.length,1,'stamp must be owned after selection');
 assert.equal(run.build.copper,12,'first round should add 6 copper to initial 6');
 const buy=page.getByRole('button',{name:'购买印章'}).first();
 await buy.click();
 run=await page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
 assert.equal(run.build.stamps.length,2,'shop purchase must add a distinct stamp');
 assert.equal(run.build.copper,6);
 const upgrade=page.locator('button[data-action^="upgrade-"]:not([disabled])').first();
 assert.ok(await upgrade.count(),'affordable plate upgrade should exist');
 await upgrade.click();
 run=await page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
 assert.equal(run.build.copper,1,'paid upgrade must cost 5 copper');
 assert.equal(run.build.shopServiceUsed,true);
 assert.equal(Object.values(run.build.levels).reduce((a,b)=>a+b,0),1);
 await page.getByRole('button',{name:/离开商店，进入第 2 轮/}).click();
 run=await page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
 assert.equal(run.round,1,'next round should begin');
 assert.equal(run.ticketIndex,1);
 assert.equal(run.bank,0,'round points must reset');
 assert.equal(run.build.stamps.length,2,'stamps must persist to next round');
 assert.equal(run.ticket.cells.length,16);
 assert.equal(await page.locator('#scratch-root canvas[data-index]').count(),16);
 assert.equal(await page.locator('#workshop-overlay.open').count(),1);
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 assert.equal(await page.locator('.work-card').count(),3);
 await page.getByRole('button',{name:'选择 街角经典'}).click();
 assert.equal(await page.locator('#workshop-overlay.open').count(),0);
 assert.deepEqual(errors,[]);

 // Reload from the same browser local storage and verify state resumes correctly.
 await page.reload();
 await page.waitForFunction(()=>document.querySelectorAll('#scratch-root canvas[data-index]').length===16);
 run=await page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
 assert.equal(run.round,1);
 assert.equal(run.build.stamps.length,2);
 console.log('PROGRESSION UI PASS: reward choice, copper store, purchase, paid plate upgrade, next round, save/restore');
 const bossSeed='fixture-boss-ui';
 const bossId=bossForRound(2,bossSeed);
 assert.ok(bossId);
 await page.evaluate(data=>{
   localStorage.setItem('foil-run-v4',JSON.stringify(data));
 },{version:4,seed:bossSeed,round:2,bank:0,ticketIndex:1,
   ticket:createTicket('boss-round'),committed:false,riskArmed:false,
   done:false,build:createBuild(),phase:'ticket-choice',offers:[]});
 await page.reload();
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 await page.getByText('首领 '+BOSSES[bossId].name,{exact:false}).waitFor();
 await page.getByRole('button',{name:'选择 街角经典'}).click();
 const bossState=await page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
 assert.equal(bossState.ticket.bossId,bossId);
 assert.equal(bossState.ticket.ticketType,'T01');
 assert.equal(bossState.ticket.pressure,bossId==='B01'?1:0);
 assert.equal(await page.locator('#workshop-overlay.open').count(),0);
 assert.deepEqual(errors,[]);
 console.log('BOSS UI PASS: first-act boss visible before selection, modifier attached, play enabled');
}finally{await browser.close();}
