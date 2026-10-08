import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createBuild} from '../build/build.js';
import {createTicket,activateCell,INITIAL_PLATE} from '../build/rules.js';
import {itemOffer,itemDef} from '../build/items.js';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',e=>{if(e.type()==='error')errors.push(e.text());});
async function load(fixture){
 await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
 await page.evaluate(v=>localStorage.setItem('foil-run-v4',JSON.stringify(v)),fixture);
 await page.reload();
 await page.waitForFunction(()=>window.Laya?.stage?.numChildren>0);
}
async function clickBoard(x,y){
 const r=await page.locator('#game-root').boundingBox();
 assert.ok(r);
 await page.mouse.click(r.x+x*r.width/750,r.y+y*r.height/1334);
}
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
const fixture=(build,ticket,phase='ticket',round=0)=>({
 version:4,seed:'stamp-v1-ui',round,bank:0,ticketIndex:1,ticket,
 committed:phase!=='ticket',riskArmed:false,done:false,
 build,phase,offers:[],itemPurchased:false
});
try{
 const b=createBuild();b.stamps=['R14'];
 const t=createTicket('stamp-R14',['star','gear',...INITIAL_PLATE.slice(2)]);
 t.cells[0].state='active';t.cells[1].state='active';
 t.activatedOrder=[0,1];t.regularRemaining=6;
 await load(fixture(b,t));
 await clickBoard(150,1283);
 await page.getByRole('heading',{name:/活字滑轨 · 印章换位/}).waitFor();
 await page.getByRole('button',{name:/A1 · 星星/}).click();
 await page.getByRole('button',{name:/B1 · 齿轮/}).click();
 await page.getByRole('button',{name:'确认换位'}).click();
 let state=await saved();
 assert.equal(state.ticket.cells[0].symbol,'gear');
 assert.equal(state.ticket.cells[1].symbol,'star');
 assert.equal(state.ticket.stampSwapUsed,true);
 assert.equal(state.ticket.regularRemaining,6);
 await page.reload();
 state=await saved();assert.equal(state.ticket.stampSwapUsed,true);
 console.log('STAMP R14 UI PASS: stamp-only swap works and persists independently of ticket');

 const shop=createBuild();shop.stamps=['R47'];shop.copper=15;
 const sh=fixture(shop,createTicket('shop-stamp'),'shop',1);
 sh.offers=['R01'];
 await load(sh);
 await page.getByRole('heading',{name:'工坊商店'}).waitFor();
 await page.getByText('售价 4 铜券',{exact:false}).waitFor();
 await page.getByRole('button',{name:'购买印章'}).click();
 state=await saved();
 assert.equal(state.build.copper,11);
 assert.equal(state.build.shopDiscountUsed,true);
 assert.deepEqual(state.build.stamps,['R47','R01']);
 const tool=itemDef(itemOffer('stamp-v1-ui',1));
 await page.getByRole('button',{name:'购买 '+tool.name}).click();
 state=await saved();
 assert.equal(state.build.copper,11-tool.price);
 assert.deepEqual(state.build.items,[tool.id]);
 console.log('STAMP R47 UI PASS: 2-coupon discount applies only to first shop purchase');

 const conserve=createBuild();conserve.stamps=['R43'];
 let ticket=createTicket('saving-ticket');
 for(const i of [0,1,2,3,4,5])ticket=activateCell(ticket,i,{build:conserve});
 const saving=fixture(conserve,ticket);
 saving.bank=280;
 await load(saving);
 await clickBoard(180,1205);
 state=await saved();
 assert.equal(state.phase,'reward');
 assert.equal(state.build.copper,17);
 assert.equal(state.roundConserved,true);
 console.log('STAMP R43 UI PASS: clean early stop earns exactly one extra copper on round clear');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
