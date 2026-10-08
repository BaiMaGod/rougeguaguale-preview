import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createBuild} from '../build/build.js';
import {createTicket} from '../build/rules.js';
import {itemOffer} from '../build/items.js';
import {bossForRound,BOSSES} from '../build/tickets.js';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
async function restore(fixture){
 await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
 await page.evaluate(data=>localStorage.setItem('foil-run-v4',JSON.stringify(data)),fixture);
 await page.reload();
}
try{
 const build=createBuild();build.copper=12;
 let seed='tool-shop';
 for(let i=0;i<500&&itemOffer(seed,0)!=='I02';i++)seed='tool-shop-'+i;
 assert.equal(itemOffer(seed,0),'I02','a deterministic seed should offer scout fluid');
 await restore({version:4,seed,round:0,bank:280,ticketIndex:2,
   ticket:createTicket('tool-shop-1'),committed:true,riskArmed:false,
   done:false,build,phase:'shop',offers:[],itemPurchased:false});
 await page.getByRole('heading',{name:'工坊商店'}).waitFor();
 await page.getByRole('button',{name:'购买 显影液'}).click();
 let run=await saved();
 assert.deepEqual(run.build.items,['I02'],'purchased item should be saved in backpack');
 assert.equal(run.build.copper,9,'purchase must deduct 3 copper');
 assert.equal(run.itemPurchased,true,'cannot repeat buy in same store');
 assert.equal(await page.getByRole('button',{name:'本店已买过工具'}).isDisabled(),true);
 await page.getByRole('button',{name:/离开商店，进入第 2 轮/}).click();
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 await page.getByRole('button',{name:'选择 街角经典'}).click();
 run=await saved();assert.equal(run.round,1);
 assert.equal(run.ticket.scoutRemaining,1);
 const rect=await page.locator('#game-root').boundingBox();
 assert.ok(rect);
 await page.mouse.click(rect.x+190*rect.width/750,rect.y+1280*rect.height/1334);
 await page.getByRole('heading',{name:'🧰 随身工具包'}).waitFor();
 await page.getByRole('button',{name:'使用 显影液'}).click();
 run=await saved();
 assert.equal(run.ticket.scoutRemaining,3,'tool must grant two actual scout charges');
 assert.equal(run.ticket.itemsUsed,1);
 assert.deepEqual(run.build.items,[],'used tool must be consumed');
 assert.equal(await page.locator('#workshop-overlay.open').count(),0);
 assert.equal(await page.locator('#scratch-root canvas[data-index]').count(),16);
 await page.reload();
 run=await saved();
 assert.equal(run.ticket.scoutRemaining,3,'tool must survive reload');
 assert.equal(run.ticket.itemsUsed,1);
 console.log('TOOLS UI PASS: purchase, charge copper once, bag, use scout fluid, persist and resume');

 const seed2='act-two-fixture';
 const boss=bossForRound(5,seed2);assert.ok(boss);
 await page.evaluate(data=>localStorage.setItem('foil-run-v4',JSON.stringify(data)),{
  version:4,seed:seed2,round:5,bank:0,ticketIndex:1,
  ticket:createTicket('sixth-round'),committed:false,riskArmed:false,
  done:false,build:createBuild(),phase:'ticket-choice',offers:[]});
 await page.reload();
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 await page.getByText('首领 '+BOSSES[boss].name,{exact:false}).waitFor();
 await page.getByRole('button',{name:'选择 街角经典'}).click();
 run=await saved();
 assert.equal(run.ticket.bossId,boss);
 assert.equal(run.ticket.scoutRemaining,boss==='B06'?2:1);
 assert.equal(await page.locator('#workshop-overlay.open').count(),0);
 assert.deepEqual(errors,[],'no runtime errors across tool and boss workflows');
 console.log('SECOND BOSS UI PASS: announced before selection, applied to ticket, ready to scratch');
}finally{await browser.close();}
