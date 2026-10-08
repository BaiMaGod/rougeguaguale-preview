import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createBuild} from '../build/build.js';
import {createTicket,calculateScore} from '../build/rules.js';
import {bossForRound,BOSSES} from '../build/tickets.js';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
async function load(ticket,build,round=1,phase='ticket',seed='v07-ui'){
 const fixture={version:4,seed,round,bank:0,ticketIndex:1,ticket,
  committed:false,riskArmed:false,done:false,build,phase,offers:[]};
 await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
 await page.evaluate(v=>localStorage.setItem('foil-run-v4',JSON.stringify(v)),fixture);
 await page.reload();
 await page.waitForFunction(()=>window.Laya?.stage?.numChildren>0);
}
async function openBag(){
 const rect=await page.locator('#game-root').boundingBox();
 assert.ok(rect);
 await page.mouse.click(rect.x+190*rect.width/750,rect.y+1280*rect.height/1334);
 await page.getByRole('heading',{name:'🧰 随身工具包'}).waitFor();
}
try{
 const build=createBuild();build.items=['I04','I09'];
 await load(createTicket('v07-first'),build);
 await openBag();
 await page.getByRole('button',{name:'使用 透光尺'}).click();
 await page.getByRole('button',{name:'第 2 行'}).click();
 let intermediate=await read();
 assert.deepEqual(intermediate.build.items,['I04','I09'],'choosing a target must not spend item before confirmation');
 await page.getByRole('button',{name:'返回工具列表'}).click();
 intermediate=await read();
 assert.equal(intermediate.ticket.itemsUsed,0,'cancellation must not consume charges');
 await page.getByRole('button',{name:'使用 透光尺'}).click();
 await page.getByRole('button',{name:'第 2 行'}).click();
 await page.getByRole('button',{name:'确认使用 透光尺'}).click();
 let run=await read();
 assert.equal(run.ticket.itemsUsed,1);
 assert.deepEqual(run.build.items,['I09']);
 for(let i=4;i<8;i++)assert.equal(run.ticket.cells[i].state,'scouted');
 assert.equal(await page.locator('#workshop-overlay.open').count(),0);
 await openBag();
 await page.getByRole('button',{name:'使用 批注贴纸'}).click();
 await page.getByRole('button',{name:/A1 · 未刮/}).click();
 await page.getByRole('button',{name:'确认使用 批注贴纸'}).click();
 run=await read();
 assert.equal(run.ticket.annotatedCell,0);
 assert.equal(run.ticket.cells[0].state,'scouted');
 assert.equal(run.ticket.itemsUsed,2);
 assert.equal(run.build.items.length,0);
 await page.reload();
 run=await read();
 assert.equal(run.ticket.annotatedCell,0);
 assert.equal(run.ticket.itemsUsed,2);
 console.log('TARGETED TOOL UI PASS: row reveal, cancel without spend, annotate hidden cell, persist after reload');

 const sb=createBuild();sb.items=['I08','I05'];
 const ticket=createTicket('v07-swap');
 ticket.cells[1].symbol='bell';
 ticket.cells[0].state='active';ticket.cells[1].state='active';
 ticket.activatedOrder=[0,1];ticket.regularRemaining=6;
 await load(ticket,sb);
 await openBag();
 await page.getByRole('button',{name:'使用 活字镊子'}).click();
 await page.getByRole('button',{name:/A1 · 星星/}).click();
 await page.getByRole('button',{name:/B1 · 铃铛/}).click();
 await page.getByRole('button',{name:'确认使用 活字镊子'}).click();
 run=await read();
 assert.equal(run.ticket.itemsUsed,1);
 assert.equal(run.ticket.cells[0].symbol,'bell');
 assert.equal(run.ticket.cells[1].symbol,'star');
 assert.equal(run.ticket.activatedOrder.length,2);
 assert.equal(run.build.items[0],'I05');
 await openBag();
 await page.getByRole('button',{name:'使用 彩墨补充包'}).click();
 await page.getByRole('button',{name:/★ 星星/}).click();
 await page.getByRole('button',{name:'确认使用 彩墨补充包'}).click();
 run=await read();
 assert.equal(run.ticket.inkColor,'star');
 assert.equal(run.build.items.length,0);
 assert.equal(run.ticket.itemsUsed,2);
 assert.deepEqual(errors,[]);
 console.log('TARGETED BUILD UI PASS: choose two revealed cells, swap, choose natural symbol to boost');

 const bossSeed='v07-final';
 const boss=bossForRound(8,bossSeed);
 assert.ok(['B07','B08','B09'].includes(boss));
 await load(createTicket('v07-final'),createBuild(),8,'ticket-choice',bossSeed);
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 await page.getByText('首领 '+BOSSES[boss].name,{exact:false}).waitFor();
 await page.getByRole('button',{name:'选择 街角经典'}).click();
 run=await read();
 assert.equal(run.ticket.bossId,boss);
 if(boss==='B09'){assert.equal(run.ticket.regularRemaining,7);assert.equal(run.ticket.scoutRemaining,3);}
 else assert.equal(run.ticket.regularRemaining,8);
 assert.deepEqual(errors,[]);
 console.log('FINAL BOSS UI PASS: boss publicly announced, third-act rules applied before scratching');
}finally{await browser.close();}
