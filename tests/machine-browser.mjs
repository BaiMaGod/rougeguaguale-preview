import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {newGame,serializeGame,SAVE_KEY} from '../build/idiom/wallet.js';
import {buyMachine,configureMachine,enqueueMachine,startMachine,advanceMachine,defaultPolicy} from '../build/idiom/machine.js';
import {resolveTicket,revealCell} from '../build/idiom/resolver.js';
const base=resolve('.'),evidence=resolve('qa-evidence');await mkdir(evidence,{recursive:true});
const server=createServer(async(req,res)=>{try{const p=resolve(base,'.'+new URL(req.url,'http://localhost').pathname);if(!p.startsWith(base+'/')&&p!==base)throw Error('path');
 const file=p===base?resolve(base,'index.html'):p;res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]??'application/octet-stream');res.end(await readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});const errors=[],checks=[];
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),page=await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>!!document.querySelector('#game-root')?.dataset.screen);
const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')));
async function install(s){await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:SAVE_KEY,raw:serializeGame(s)});await page.reload();await ready();}
const click=name=>page.locator(`[data-machine-action="${name}"]`).click();
async function shot(name){await page.locator('.idiom-catalog').evaluate(e=>e.scrollTop=0);await page.screenshot({path:resolve(evidence,name+'.jpg'),type:'jpeg',quality:85});}
try{
 await page.goto(url);await ready();await install({...newGame('ui-machine'),cash:1000n,peak:1000n,unlockedCount:18});
 await page.getByRole('button',{name:'自动机器',exact:true}).click();await page.getByRole('button',{name:'购买初级机 · 20元',exact:true}).click();
 assert.equal((await saved()).cash,'980');await page.getByRole('button',{name:'升级到中级机 · 30元',exact:true}).click();assert.equal((await saved()).cash,'950');
 assert.equal(await page.locator('select[name=card] option').count(),17);assert.equal(await page.locator('select[name=card] option[value=T18]').count(),0);checks.push('Purchase/upgrade fees and T18 safety lock');
 await page.locator('[name=autoBuy]').check();await page.locator('[name=autoClaim]').check();await page.locator('[name=reserve]').fill('20');await page.locator('[name=budget]').fill('6');await page.locator('[name=limit]').fill('3');await page.locator('[name=quantity]').fill('2');
 await click('enqueue');assert.equal((await saved()).machine.queue.length,2);await click('start');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).machine.job?.elapsedMs>=400);await click('pause');
 const paused=await saved();await page.waitForTimeout(300);assert.deepEqual((await saved()).machine.job,paused.machine.job);assert.equal(paused.machine.sessionSpent,'2');
 await shot('machine-paused');await click('clear');const cleared=await saved();assert.equal(cleared.machine.queue.length,0);assert.equal(cleared.cash,paused.cash);assert.equal(cleared.active.nonce,paused.active.nonce);
 await page.locator('[name=autoBuy]').uncheck();await click('settings');await page.reload();await ready();
 const restored=await saved();assert.equal(restored.machine.running,false);assert.equal(restored.active.nonce,paused.active.nonce);assert.equal(restored.cash,paused.cash);
 assert.deepEqual(restored.active.committedLayout,paused.active.committedLayout);await click('start');
 await page.waitForFunction(()=>{const m=JSON.parse(localStorage.getItem('idiom-run-v31-base')).machine;return m.processed===1&&!m.running;});checks.push('Pause, cancel only unpaid tasks, restore paid ticket and finish once');
 await click('reset');await page.locator('[name=autoBuy]').check();await page.locator('[name=limit]').fill('20');await page.locator('[name=reserve]').fill('0');await click('settings');await click('start');
 await page.waitForFunction(()=>{const m=JSON.parse(localStorage.getItem('idiom-run-v31-base')).machine;return m.processed===4&&!m.running;},null,{timeout:25000});
 const bounded=await saved();assert.equal(bounded.machine.sessionSpent,'6');assert.equal(bounded.machine.sessionBought,3);assert.match(bounded.machine.message,/预算/);checks.push('Auto buy/claim stops exactly at ticket-fee budget');
 await shot('machine-budget-stop');
 await click('reset');await page.locator('[name=reserve]').fill(bounded.cash);await click('settings');await click('start');
 await page.waitForFunction(()=>!JSON.parse(localStorage.getItem('idiom-run-v31-base')).machine.running);assert.equal((await saved()).cash,bounded.cash);assert.match((await saved()).machine.message,/保留线/);checks.push('Reserve line stops without deducting cash');
 let winning;
 for(let i=0;i<100;i++){let s={...newGame('machine-claim'+i),cash:10000n,peak:10000n};for(let l=0;l<4;l++)s=buyMachine(s);
  s=configureMachine(s,{autoBuy:false,autoClaim:false,repeatCard:'T01',policy:defaultPolicy(),reserve:0n,budget:10n,limit:2});s=advanceMachine(startMachine(enqueueMachine(s,'T01')),100);
  if(resolveTicket(revealCell(s.active,0)).status==='won'){winning=s;break;}}
 await install(winning);await click('start');await page.waitForSelector('[data-machine-action=claim]');const unclaimed=await saved();assert.equal(unclaimed.cash,winning.cash.toString());
 await click('claim');const claimed=await saved();assert.equal(claimed.machine.processed,1);assert.equal(BigInt(claimed.cash),winning.cash+BigInt(claimed.machine.log[0].prize));
 await page.reload();await ready();assert.equal((await saved()).cash,claimed.cash);assert.equal(await page.locator('[data-machine-action=claim]').count(),0);checks.push('Manual machine claim credits once and survives reload');
 // A second page shares the origin and storage but cannot obtain the writer lock.
 const other=await context.newPage();await other.goto(url);await other.waitForFunction(()=>!!document.querySelector('#game-root')?.dataset.screen);
 assert.equal(await other.locator('#game-root').getAttribute('data-read-only'),'true');const before=await saved();
 await other.getByRole('button',{name:'自动机器',exact:true}).click();await other.locator('[data-machine-action=start]').click();assert.equal((await saved()).cash,before.cash);assert.equal((await saved()).machine.running,false);
 await other.close();checks.push('Second page is read-only and cannot buy or run machines');
 await install(winning);await click('start');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).machine.running);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));});
 const hidden=await saved();assert.equal(hidden.machine.running,false);await page.waitForTimeout(500);assert.deepEqual((await saved()).machine.job,hidden.machine.job);
 await page.reload();await ready();assert.equal((await saved()).machine.running,false);checks.push('Background visibility pauses, with no offline catch-up');
 let jackpot;
 for(let i=0;i<10000;i++){let s={...newGame('machine-headline'+i),cash:1000000000n,peak:1000000000n,unlockedCount:18};for(let l=0;l<4;l++)s=buyMachine(s);
  s=configureMachine(s,{autoBuy:false,autoClaim:true,repeatCard:'T16',policy:defaultPolicy(),reserve:0n,budget:10000000n,limit:1});s=advanceMachine(startMachine(enqueueMachine(s,'T16')),100);
  let t=s.active;for(const n of [0,1,2])t=revealCell(t,n);if(resolveTicket(t).status==='won'){jackpot=s;break;}}
 await install(jackpot);await click('start');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).machine.processed===1);
 assert.match(await page.locator('.machine-jackpot').textContent(),/三心二亿 · 2亿元/);await page.reload();await ready();await page.getByRole('button',{name:'自动机器',exact:true}).click();
 assert.match(await page.locator('.machine-jackpot').textContent(),/三心二亿 · 2亿元/);await shot('machine-jackpot');checks.push('Auto claimed jackpot remains prominent and survives reload');
 for(const view of [{width:360,height:640},{width:844,height:390},{width:1280,height:900}]){
  await page.setViewportSize(view);const b=await page.locator('#game-root').boundingBox();assert.ok(b.x>=-1&&b.y>=-1&&b.x+b.width<=view.width+1&&b.y+b.height<=view.height+1);
  const nav=await page.locator('.idiom-top').boundingBox();assert.ok(nav.width<=b.width);await shot('machine-'+view.width+'x'+view.height);
 }checks.push('Machine controls in three viewport sizes');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({machineChecks:checks.length,checks,pageErrors:errors},null,2));
}finally{await browser.close();server.closeAllConnections();server.close();}
