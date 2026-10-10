import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {CARDS} from '../build/idiom/config.js';
import {createIdiomTicket} from '../build/idiom/generator.js';
import {resolveTicket,revealCell,cashOut} from '../build/idiom/resolver.js';
import {newGame,serializeGame,SAVE_KEY} from '../build/idiom/wallet.js';
import {MILESTONES,TECHS,COSTS} from '../build/idiom/growth.js';
const base=resolve('.'),evidence=resolve('qa-evidence');await mkdir(evidence,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'};
const server=createServer(async(req,res)=>{
 try{const path=resolve(base,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!path.startsWith(base+'/')&&path!==base)throw new Error('Invalid path');
  const target=path===base?resolve(base,'index.html'):path,bytes=await readFile(target);
  res.setHeader('Content-Type',mime[extname(target)]??'application/octet-stream');res.end(bytes);
 }catch{res.statusCode=404;res.end('Not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const hardTimeout=setTimeout(()=>{
 console.error('Browser QA exceeded 12 minutes');process.exitCode=1;
 void browser.close();server.closeAllConnections();server.close();
},720000);
const errors=[],checks=[];
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
const page=await context.newPage();page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(15000);
page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE_ERROR',e.message);});
async function ready(){await page.waitForFunction(()=>!!document.querySelector('#game-root').dataset.screen,null,{timeout:15000});assert.equal(await page.locator('#load-error').isVisible(),false);}
async function shot(name){await page.screenshot({path:resolve(evidence,name+'.jpg'),type:'jpeg',quality:85});}
async function install(state){await page.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:SAVE_KEY,raw:serializeGame(state)});await page.reload();await ready();}
function finish(ticket){
 let t=ticket;const mode=CARDS.find(d=>d.id===t.cardId).mode;
 const indices=mode==='ladder'?[0,5,10]:mode==='mines'?[0,1,2]:mode==='eye'||mode==='destiny'?[0]:Array.from({length:t.committedLayout.length},(_,i)=>i);
 for(const i of indices){if(resolveTicket(t).status!=='playing')break;t=revealCell(t,i);
  if(mode==='cashout'&&t.revealed.length===3&&resolveTicket(t).status==='playing'){t=cashOut(t);break;}}
 return resolveTicket(t);
}
function fixture(id,status,growth){for(let i=0;i<100000;i++){const t=createIdiomTicket(id,'browser-'+id+'-'+i,'browser-'+i,growth);if(finish(t).status===status)return t;}throw new Error('No fixture');}
function stateFor(t){return {...newGame('browser'),cash:2000000000000n-CARDS.find(c=>c.id===t.cardId).price,peak:2000000000000n,unlockedCount:18,bought:1,active:t};}
const cdp=await context.newCDPSession(page);
async function touch(type,x,y){await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,radiusX:2,radiusY:2,force:1}]});}
async function scratch(index,partial=false){
 const cv=page.locator(`canvas[data-index="${index}"]`);const b=await cv.boundingBox();assert.ok(b,'Missing foil '+index);
 const startX=b.x+b.width*.5,startY=b.y+b.height*.3;
 await touch('touchStart',startX,startY);
 if(!partial){
  const designSize=await cv.evaluate(e=>parseFloat(e.style.width));
  const step=b.width*22/designSize;
  for(let row=0,y=b.y+b.height*.14;y<b.y+b.height*.9;y+=step,row++){
   await touch('touchMove',b.x+b.width*(row%2?.9:.1),y);await touch('touchMove',b.x+b.width*(row%2?.1:.9),y);
  }
 }
 await touch('touchEnd',startX,startY);
 if(!partial)await page.waitForFunction(i=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).active.revealed.includes(i),index,{timeout:5000});
}
function progression(level=0){const earned=MILESTONES.reduce((s,m)=>s+m.points,0);return {
 points:earned-4*COSTS.slice(0,level).reduce((a,b)=>a+b,0),earned,levels:Object.fromEntries(TECHS.map(t=>[t,level])),claimed:MILESTONES.map(m=>m.id)};}
try{
 console.log('QA started');
 await page.goto(url);await ready();assert.equal(await page.locator('.idiom-card').count(),18);
 const artImageWidth=await page.evaluate(async()=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth);img.onerror=()=>resolve(0);img.src='./assets/ticket-t01.svg';}));
 assert.ok(artImageWidth>0,'Card illustration SVG did not render in browser');
 const allArt=await page.evaluate(async()=>Promise.all(
  Array.from({length:18},(_,n)=>'T'+String(n+1).padStart(2,'0')).map(id=>
   new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(image.naturalWidth>0);
    image.onerror=()=>resolve(false);image.src='./assets/ticket-'+id.toLowerCase()+'.svg';})
  )
 ));
 assert.equal(allArt.filter(Boolean).length,18,'All 18 distinct card artworks must load');
 console.log('ALL_18_CARD_ART_OK',allArt.length);
 const artworkLayer=await page.locator('.idiom-card').first().evaluate(el=>getComputedStyle(el,'::after').backgroundImage);
 assert.match(artworkLayer,/ticket-t01\.svg/,'Card illustration background missing');console.log('CARD_ART_OK',artImageWidth);
 await shot('mobile-catalog');
 const gallery=await context.newPage();await gallery.goto(url+'/?qa=1');
 await gallery.waitForFunction(()=>document.querySelector('#game-root')?.dataset.screen==='catalog');
 for(const [name,top] of [['gallery-mid',950],['gallery-late',2200]]){
   await gallery.locator('.idiom-catalog').evaluate((el,y)=>{el.scrollTop=y;},top);
   await gallery.screenshot({path:resolve(evidence,name+'.jpg'),type:'jpeg',quality:80});
 }
 await gallery.close();
 await page.getByRole('button',{name:'买 一五一十 · 2元',exact:true}).click();
 assert.equal(await page.locator('#game-root').getAttribute('data-cash'),'58');assert.equal(await page.locator('canvas[data-index]').count(),1);
 await shot('mobile-first-ticket');await scratch(0);
 assert.equal(await page.locator('#foil-particles').getAttribute('data-emissions')==='0',false);checks.push('Real touch scratching, silver dust and purchase deduction');
 const choices=fixture('T13','won');await install(stateFor(choices));await scratch(0,true);
 const selected=await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).active);
 assert.deepEqual(selected.choices,[0]);assert.equal(selected.revealed.length,0);
 assert.equal(await page.locator('canvas[data-index="1"]').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
 await page.reload();await ready();const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).active);
 assert.deepEqual(restored.committedLayout,selected.committedLayout);assert.deepEqual(restored.choices,[0]);checks.push('Partial scratch locks choice and survives refresh');
 const legacy={...stateFor(fixture('T01','won')),version:31};delete legacy.progression;
 await install(legacy);const migrated=await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')));
 assert.equal(migrated.version,34);assert.ok(migrated.progression.points>0);assert.ok(await page.evaluate(()=>!!localStorage.getItem('idiom-v31-base-backup')));
 assert.deepEqual(migrated.active.committedLayout,legacy.active.committedLayout);checks.push('V3.1 migration grants milestones and preserves original ticket');
 const first={...newGame('first-award'),bought:1,active:fixture('T01','won')};await install(first);await scratch(0);await page.getByRole('button',{name:/^领取 /}).click();
 const points=await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).progression.points);assert.ok(points>=3);
 await page.reload();await ready();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).progression.points),points);checks.push('First win earns fortune once across reload');
 const pending={...stateFor(fixture('T01','won')),progression:progression()};await install(pending);
 const previous=await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).active);
 await page.getByRole('button',{name:'永久成长',exact:true}).click();
 for(const tech of TECHS)await page.locator(`[data-upgrade="${tech}"]`).click();
 const upgraded=await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')));
 assert.deepEqual(upgraded.active,previous);assert.deepEqual(upgraded.progression.levels,{luck:1,jackpot:1,bonus:1,scratch:1});
 assert.equal(upgraded.progression.points,pending.progression.points-4);
 await page.locator('.idiom-catalog').evaluate(e=>e.scrollTop=0);await shot('mobile-growth');
 await page.getByRole('button',{name:'当前刮卡',exact:true}).click();assert.equal(await page.locator('canvas[data-index="0"]').getAttribute('data-brush-width'),'30');
 await scratch(0);await page.getByRole('button',{name:/^领取 /}).click();await page.getByRole('button',{name:/再买一张/}).click();
 assert.ok(Number(await page.locator('canvas[data-index="0"]').getAttribute('data-brush-width'))>30);
 const fresh=await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).active);assert.deepEqual(fresh.growth,upgraded.progression.levels);
 await page.reload();await ready();assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).active),fresh);checks.push('Four technology upgrades debit fortune, freeze old ticket and apply to next purchase');
 for(const id of ['T01','T11','T14','T16']){
  const t=fixture(id,'won',progression(5).levels),def=CARDS.find(c=>c.id===id),s={...stateFor(t),progression:progression(5)};await install(s);
  assert.ok(Number(await page.locator('canvas[data-index="0"]').getAttribute('data-brush-width'))>30);
  const indices=Array.from({length:def.cells},(_,i)=>i);
  for(const i of indices){if(await page.locator('#game-root').getAttribute('data-status')!=='playing')break;await scratch(i);
   if(def.mode==='cashout'&&i===2){await page.getByRole('button',{name:/现在收手/}).click();break;}}
  if(await page.locator('#game-root').getAttribute('data-settled')!=='true')await page.getByRole('button',{name:/^领取 /}).click();
  assert.equal(await page.locator('#game-root').getAttribute('data-cash'),(s.cash+finish(t).prize).toString());
  await page.reload();await ready();assert.equal(await page.locator('#game-root').getAttribute('data-cash'),(s.cash+finish(t).prize).toString());
  await shot('growth-'+id);checks.push(id+' upgraded real scratch, prize and restore');
 }
 const cases=process.env.BROWSER_QUICK==='1'?CARDS.filter(d=>['T01','T09','T17','T18'].includes(d.id)):CARDS;
 for(const def of cases){
  console.log('QA card '+def.id+' started');
  const t=fixture(def.id,'won');await install(stateFor(t));await shot('mobile-'+def.id);
  const indices=def.mode==='ladder'?[0,5,10]:def.mode==='mines'?[0,1,2]:def.mode==='eye'||def.mode==='destiny'?[0]:Array.from({length:def.cells},(_,i)=>i);
  for(const i of indices){if(await page.locator('#game-root').getAttribute('data-status')!=='playing')break;await scratch(i);
   if(def.mode==='cashout'&&i===2){await page.getByRole('button',{name:/现在收手/}).click();break;}}
  assert.equal(await page.locator('#game-root').getAttribute('data-status'),'won',def.id+' did not win');
  assert.equal(await page.locator('.idiom-win-celebration').count(),1,'Win banner should appear');
  const prizeBar=await page.locator('.idiom-win-celebration').boundingBox();
  const navRow=await page.locator('.idiom-top').boundingBox();
  assert.ok(prizeBar&&navRow&&prizeBar.y+prizeBar.height<=navRow.y+1,def.id+' prize overlay blocks nav');
  if(await page.locator('#game-root').getAttribute('data-settled')!=='true')await page.getByRole('button',{name:/^领取 /}).click();
  const expected=stateFor(t).cash+finish(t).prize;assert.equal(await page.locator('#game-root').getAttribute('data-cash'),expected.toString(),def.id+' payout');
  await page.reload();await ready();assert.equal(await page.locator('#game-root').getAttribute('data-cash'),expected.toString());
  await shot('result-'+def.id);checks.push(def.id+' mobile purchase/reveal/collect/restore');console.log('QA card '+def.id+' passed');
 }
 const all={...newGame('risk'),cash:2000000000000n,peak:2000000000000n,unlockedCount:18};await install(all);
 await page.locator('.idiom-card[data-card-id="T18"]').click();await page.getByRole('button',{name:/买 一念天堂/}).click();
 assert.equal(await page.locator('#game-root').getAttribute('data-cash'),all.cash.toString());await shot('mobile-risk-confirmation');
 await page.getByRole('button',{name:'确认花100亿购买',exact:true}).click();assert.equal(await page.locator('#game-root').getAttribute('data-cash'),(all.cash-10000000000n).toString());checks.push('T18 explicit risk confirmation before purchase');
 const devil=fixture('T18','bankrupt');await install(stateFor(devil));await scratch(0);
 assert.equal(await page.locator('#game-root').getAttribute('data-cash'),'0');assert.equal(await page.locator('#game-root').getAttribute('data-status'),'bankrupt');
 const navBox=await page.locator('.idiom-top').boundingBox(),footerBox=await page.locator('.idiom-footer').boundingBox();
 assert.ok(footerBox.y>=navBox.y+navBox.height,'Bankruptcy footer covers navigation');
 await shot('mobile-bankrupt');await page.getByRole('button',{name:/领取20元恢复金/}).click();assert.equal(await page.locator('#game-root').getAttribute('data-cash'),'20');checks.push('T18 bankruptcy then recovery');
 await install(newGame('viewport'));
 for(const view of [{width:360,height:640},{width:844,height:390},{width:1280,height:900}]){
  await page.setViewportSize(view);await page.waitForTimeout(100);const b=await page.locator('#game-root').boundingBox();
  assert.ok(b.x>=-1&&b.y>=-1&&b.x+b.width<=view.width+1&&b.y+b.height<=view.height+1);
  await shot('catalog-'+view.width+'x'+view.height);checks.push('Viewport '+view.width+'x'+view.height);
 }
 await page.goto(url+'/legacy.html');await page.waitForTimeout(700);assert.equal(await page.locator('#load-error').isVisible(),false);await shot('legacy-preserved');checks.push('Historical mode boots');
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({checks:checks.length,results:checks,pageErrors:errors},null,2));
 // Small review screenshots also appear in the job log for restricted artifact clients.
 for(const name of ['mobile-catalog','gallery-mid','gallery-late','mobile-growth','growth-T14','mobile-T09','mobile-T17','mobile-bankrupt'])console.log('QA_IMAGE '+name+' '+(await readFile(resolve(evidence,name+'.jpg'))).toString('base64'));
}finally{clearTimeout(hardTimeout);await browser.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));}
