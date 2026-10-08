import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createBuild} from '../build/build.js';
import {createTicket,ROUND_TARGETS,CHALLENGE_TARGETS} from '../build/rules.js';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('foil-run-v4')));
async function load(obj){
 await page.goto('http://127.0.0.1:18080/',{waitUntil:'load'});
 await page.evaluate(value=>localStorage.setItem('foil-run-v4',JSON.stringify(value)),obj);
 await page.reload();
 await page.waitForFunction(()=>window.Laya?.stage?.numChildren>0);
}
const make=(difficulty)=>({
 version:4,seed:'mode-v1',round:0,bank:0,ticketIndex:1,
 ticket:createTicket('mode-v1'),committed:false,riskArmed:false,
 done:false,build:createBuild(),phase:'ticket-choice',offers:[],
 ...(difficulty?{difficulty}:{})
});
try{
 await load(make('standard'));
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 await page.getByRole('button',{name:'高难挑战'}).click();
 let s=await read();
 assert.equal(s.difficulty,'challenge');
 assert.equal(s.bank,0);assert.equal(s.ticketIndex,1);
 await page.getByRole('button',{name:'普通委托'}).click();
 s=await read();
 assert.equal(s.difficulty,'standard');
 await page.getByRole('button',{name:'选择 街角经典'}).click();
 s=await read();
 assert.equal(s.phase,'ticket');
 assert.equal(s.difficulty,'standard');
 assert.equal(ROUND_TARGETS[8],1300);
 assert.equal(CHALLENGE_TARGETS[8],5400);
 await page.reload();
 s=await read();
 assert.equal(s.difficulty,'standard');
 console.log('STANDARD MODE UI PASS: challenge toggle and ordinary commission choice persist');

 await load(make(undefined));
 await page.getByRole('heading',{name:'选择本张刮刮乐'}).waitFor();
 await page.getByRole('button',{name:'选择 街角经典'}).click();
 s=await read();
 assert.equal(s.difficulty,'challenge','legacy saved progress must retain original hard targets');
 console.log('LEGACY MODE UI PASS: old saved runs keep former commission rules');
 assert.deepEqual(errors,[]);
}finally{await browser.close();}
