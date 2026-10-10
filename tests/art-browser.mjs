import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
const base=resolve('.'),out=resolve('qa-evidence/art-v34');await mkdir(out,{recursive:true});
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.webp':'image/webp'};
const server=createServer(async(req,res)=>{try{let path=resolve(base,'.'+new URL(req.url,'http://localhost').pathname);if(path===base)path=resolve(base,'index.html');assert.ok(path.startsWith(base+'/'));res.setHeader('Content-Type',mime[extname(path)]??'application/octet-stream');res.end(await readFile(path));}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const url='http://127.0.0.1:'+server.address().port,results=[],errors=[];
const browser=await chromium.launch({args:['--no-sandbox','--enable-unsafe-swiftshader']});
async function exercise(b,profile){
 const context=await b.newContext({...profile.options}),page=await context.newPage();
 page.on('pageerror',e=>errors.push(profile.name+': '+e.message));page.on('console',m=>{if(m.type()==='error')errors.push(profile.name+': '+m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(profile.name+': HTTP '+r.status()+' '+r.url());});page.on('requestfailed',r=>errors.push(profile.name+': '+r.failure()?.errorText+' '+r.url()));
 await page.goto(url);await page.waitForFunction(()=>document.querySelector('#game-root')?.dataset.screen==='catalog');
 assert.equal(await page.locator('#load-error').isVisible(),false);
 if(profile.fallback)assert.equal(await page.locator('#game-root').getAttribute('data-renderer'),'canvas2d');
 const art=await page.evaluate(async()=>Promise.all(['lottery-counter-v34.webp','ticket-vignette-v34.webp'].map(n=>new Promise(ok=>{const i=new Image();i.onload=()=>ok(i.naturalWidth>0);i.onerror=()=>ok(false);i.src='./assets/'+n;}))));assert.deepEqual(art,[true,true]);
 await page.screenshot({path:resolve(out,profile.name+'-catalog.png')});
 await page.getByRole('button',{name:'买 一五一十 · 2元',exact:true}).click();assert.equal(await page.locator('#game-root').getAttribute('data-cash'),'58');
 const foil=page.locator('canvas[data-index="0"]'),box=await foil.boundingBox();assert.ok(box&&box.width>60,'Foil remains usable');
 assert.equal(await foil.evaluate(e=>e.getRootNode().querySelector('.idiom-ticket-stage').contains(e)),true);
 await page.screenshot({path:resolve(out,profile.name+'-ticket.png')});
 const designSize=await foil.evaluate(e=>parseFloat(e.style.width));const step=box.width*20/designSize;
 if(profile.options.hasTouch){
  const cdp=await context.newCDPSession(page),send=(type,x,y)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x,y,radiusX:2,radiusY:2,force:1}]});
  await send('touchStart',box.x+box.width*.12,box.y+box.height*.12);
  for(let row=0,y=box.y+box.height*.12;y<box.y+box.height*.9;y+=step,row++){await send('touchMove',box.x+box.width*(row%2?.9:.1),y);await send('touchMove',box.x+box.width*(row%2?.1:.9),y);}await send('touchEnd',0,0);
 }else{
  await page.mouse.move(box.x+box.width*.12,box.y+box.height*.12);await page.mouse.down();
  for(let row=0,y=box.y+box.height*.12;y<box.y+box.height*.9;y+=step,row++){await page.mouse.move(box.x+box.width*(row%2?.9:.1),y);await page.mouse.move(box.x+box.width*(row%2?.1:.9),y);}await page.mouse.up();
 }
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('idiom-run-v31-base')).active.revealed.length===1);
 assert.ok(Number(await page.locator('#foil-particles').getAttribute('data-emissions'))>0);
 if(await page.getByRole('button',{name:/^领取 /}).isVisible())await page.getByRole('button',{name:/^领取 /}).click();
 assert.equal(await page.locator('#game-root').getAttribute('data-settled'),'true');
 await page.screenshot({path:resolve(out,profile.name+'-result.png')});
 await page.getByRole('button',{name:/再买一张/}).click();assert.equal(await page.locator('#game-root').getAttribute('data-settled'),'false');assert.equal(await page.locator('canvas[data-index]').count(),1);
 const priorCash=await page.locator('#game-root').getAttribute('data-cash');await page.reload();await page.waitForFunction(()=>document.querySelector('#game-root')?.dataset.screen==='ticket');assert.equal(await page.locator('#game-root').getAttribute('data-cash'),priorCash);
 for(const [name,button] of [['growth','永久成长'],['machine','自动机器'],['records','刮奖记录']]){await page.getByRole('button',{name:button,exact:true}).click();await page.screenshot({path:resolve(out,profile.name+'-'+name+'.png')});assert.equal(await page.locator('.idiom-catalog').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);}
 const nav=await page.locator('.idiom-top').boundingBox(),footer=await page.locator('.idiom-footer').boundingBox();assert.ok(footer.y+footer.height<=nav.y+1||footer.y>=nav.y+nav.height-1,'Footer must not obstruct navigation');
 const p95=await page.evaluate(()=>new Promise(ok=>{let last=performance.now();const times=[];function sample(t){times.push(t-last);last=t;if(times.length<180)requestAnimationFrame(sample);else ok(times.sort((a,b)=>a-b)[Math.floor(times.length*.95)]);}requestAnimationFrame(sample);}));assert.ok(p95<40,'Frame p95 '+p95+'ms exceeds budget');
 results.push({profile:profile.name,renderer:await page.locator('#game-root').getAttribute('data-renderer'),purchase:true,realScratch:true,settlement:true,replay:true,reload:true,assets:true,p95});
 await context.close();
}
try{
 for(const profile of [{name:'desktop',options:{viewport:{width:1440,height:900},deviceScaleFactor:1}},{name:'mobile',options:{viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}},{name:'narrow',options:{viewport:{width:320,height:640},deviceScaleFactor:2,isMobile:true,hasTouch:true}}])await exercise(browser,profile);
 const fallback=await chromium.launch({args:['--no-sandbox','--disable-webgl']});try{await exercise(fallback,{name:'canvas-fallback',fallback:true,options:{viewport:{width:1440,height:900}}});}finally{await fallback.close();}
 assert.deepEqual(errors,[]);await writeFile(resolve(out,'report.json'),JSON.stringify({results,errors},null,2));console.log('ART_QA_REPORT '+JSON.stringify({results,errors}));
 for(const name of ['desktop-catalog','desktop-ticket','mobile-ticket'])console.log('ART_QA_IMAGE '+name+' '+(await readFile(resolve(out,name+'.png'))).toString('base64'));
}finally{await browser.close();server.closeAllConnections();await new Promise(ok=>server.close(ok));}
