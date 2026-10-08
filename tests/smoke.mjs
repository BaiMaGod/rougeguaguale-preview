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
  await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
  assert.equal(await page.locator('.work-card').count(),3);
  await page.getByRole('button',{name:'选择 街角经典'}).click();
  assert.equal(await page.locator('#workshop-overlay.open').count(),0);
  const foils=page.locator('#scratch-root canvas[data-index]');
  await page.waitForFunction(()=>document.querySelectorAll('#scratch-root canvas[data-index]').length===16);
  assert.equal(await foils.count(),16,'16 foil cells must be drawn');
  // Silver coat must be visibly textured, not a flat CSS-looking gradient.
  const texture=await foils.first().evaluate(canvas=>{
    const ctx=canvas.getContext('2d');
    const colors=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    const samples=new Set();
    for(let n=0;n<120;n++){
      const x=(n*31)%canvas.width, y=(n*43)%canvas.height;
      samples.add(colors[(y*canvas.width+x)*4]);
    }
    return {variation:samples.size,material:canvas.dataset.material};
  });
  assert.equal(texture.material,'silver-grain-v2');
  assert.ok(texture.variation>35,'silver coating must have fine material grain');
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
  const particleCount=await page.locator('#foil-particles').getAttribute('data-emissions');
  assert.ok(Number(particleCount)>30,'scratching must generate directional silver particle flakes');
  // Scratching a second foil partly, then updating UI, must not clear the progress.
  const second=foils.first();
  const secondBox=await second.boundingBox();
  assert.ok(secondBox);
  await page.mouse.move(secondBox.x+secondBox.width*.07,secondBox.y+secondBox.height*.5);
  await page.mouse.down();
  await page.mouse.move(secondBox.x+secondBox.width*.94,secondBox.y+secondBox.height*.5,{steps:13});
  await page.mouse.up();
  const partial=Number(await second.getAttribute('data-coverage'));
  assert.ok(partial>.04&&partial<.52,'partial silver coating should remain on screen');
  const hintRoot=await page.locator('#game-root').boundingBox();
  const hintScale=hintRoot.width/750;
  await page.mouse.click(hintRoot.x+535*hintScale,hintRoot.y+1205*hintScale);
  const retained=Number(await page.locator('#scratch-root canvas[data-index="1"]').getAttribute('data-coverage'));
  assert.ok(Math.abs(partial-retained)<.001,'UI updates must preserve partially erased foil');

  // A scratched symbol should be bankable and the next ticket should fully reset its foil.
  const rootRect=await page.locator('#game-root').boundingBox();
  assert.ok(rootRect,'game viewport');
  const s=rootRect.width/750;
  await page.mouse.click(rootRect.x+205*s,rootRect.y+1205*s);
  await page.waitForFunction(()=>
    [...document.querySelectorAll('#scratch-root canvas[data-index]')].length===15 &&
    [...document.querySelectorAll('#scratch-root canvas[data-index]')].every(el=>el.style.pointerEvents==='none'),null,{timeout:5000});
  await page.mouse.click(rootRect.x+375*s,rootRect.y+1285*s);
  await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
  await page.getByRole('button',{name:'选择 街角经典'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('#scratch-root canvas[data-index]').length===16,null,{timeout:5000});
  assert.deepEqual(errors,[],'there should be no browser JS errors');
  await page.screenshot({path:'scratch-smoke.png'});
  console.log('BROWSER SMOKE PASS: metallic grain; silver flakes; real dragging; partial stroke preserved; collect/next; no JS errors');
} finally {await browser.close();}
