import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:940}});let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto('http://127.0.0.1:5173/IntroGenerator/');await page.waitForFunction(()=>window.__IG,{timeout:60000});
if(!await page.evaluate(()=>!!__IG.state.compiled))throw Error(await page.locator('#status').textContent());
const roundtrip=await page.evaluate(async()=>{const c=__IG.state.compiled, before=JSON.stringify(new __IG.Runtime(c).prepare(1.2));const sb3=await __IG.exportSB3(c);const imported=await __IG.importSB3(sb3.bytes);const after=JSON.stringify(new __IG.Runtime(imported).prepare(1.2));const strip=s=>JSON.stringify(JSON.parse(s).map(({nodeId,...x})=>x));if(strip(before)!==strip(after))throw Error('SB3 roundtrip changed frame');return {bytes:sb3.bytes.length,commands:c.report.commands}});console.log('roundtrip',roundtrip);
await page.locator('#play').click();await page.waitForTimeout(200);await page.locator('#play').click();
await page.getByRole('button',{name:'複製',exact:true}).click();await page.waitForFunction(()=>__IG.state.compiledRevision===__IG.state.revision,{timeout:60000});await page.locator('#undo').click();await page.waitForFunction(()=>__IG.state.compiledRevision===__IG.state.revision,{timeout:60000});

console.log(await page.evaluate(()=>({ready:!!__IG.state.compiled,revision:__IG.state.revision,tag:document.querySelector('#preview-tag').textContent,error:document.querySelector('#status').textContent,report:__IG.state.compiled?.report})));console.log('errors',errors);await page.screenshot({path:'artifacts/editor-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/editor-mobile.png',fullPage:true});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('Mobile horizontal overflow');await browser.close();if(errors.length)throw Error(errors.join('\n'));
