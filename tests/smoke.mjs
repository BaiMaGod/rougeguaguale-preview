import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',err=>errors.push(err.message));
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
  await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
  try {
    await page.waitForFunction(()=>window.Laya?.stage?.numChildren>0,null,{timeout:10000});
  } catch (e) {
    console.error('BOOT DIAGNOSTICS',JSON.stringify({
      errors,
      panel:await page.locator('#load-error').textContent(),
      panelHidden:await page.locator('#load-error').getAttribute('hidden'),
      state:await page.evaluate(()=>({laya:typeof window.Laya,stage:window.Laya?.stage?.numChildren,gameCanvas:document.querySelectorAll('canvas').length,gameRoot:document.querySelector('#game-root')?.innerHTML.slice(0,350)}))
    },null,2));
    throw e;
  }
  const foils=page.locator('#scratch-root canvas');
  await page.waitForFunction(()=>document.querySelectorAll('#scratch-root canvas').length===16);
  assert.equal(await foils.count(),16,'16 foil cells must be drawn');
  const box=await foils.first().boundingBox();
  assert.ok(box,'first scratch cell bounding box');
  for(let i=0;i<9;i++){
    if(await foils.count()===15)break;
    const y=box.y+box.height*(.08+i*.105);
    await page.mouse.move(box.x+box.width*.05,y);
    await page.mouse.down();
    await page.mouse.move(box.x+box.width*.95,y,{steps:12});
    await page.mouse.up();
  }
  assert.equal(await foils.count(),15,'scratching foil must reveal one LayaAir cell');
  assert.deepEqual(errors,[],'there should be no browser JS errors');
  await page.screenshot({path:'scratch-smoke.png'});
  console.log('BROWSER SMOKE PASS: 16 foil cells; pointer dragging reveals a cell; no JS errors');
} finally {await browser.close();}
