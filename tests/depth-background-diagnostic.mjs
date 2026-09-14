import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});
 await page.waitForSelector('#add-type option[value="depth"]',{state:'attached',timeout:10000});
 await page.locator('#add-type').selectOption('depth');
 await page.locator('#add').click();
 await page.waitForFunction(()=>{const s=window.__IG?.state,n=s?.p?.nodes.find(x=>x.id===s.id);return n?.type==='repeater'&&n.name==='Depth zoom background'},undefined,{timeout:10000});
 await page.waitForSelector('[data-depth-background-controls]',{timeout:10000});
 const before=await page.evaluate(()=>({revision:window.__IG.state.revision,compiledRevision:window.__IG.state.compiledRevision,save:document.querySelector('#save-state')?.textContent,preview:document.querySelector('#preview-tag')?.textContent,status:document.querySelector('#status')?.textContent,busy:!document.querySelector('#busy')?.hidden}));
 const input=page.getByLabel('模様の拡大速度',{exact:true});await input.fill('.65');await input.press('Tab');
 let settled=true;
 try{await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision&&document.querySelector('#save-state')?.textContent==='保存済み',undefined,{timeout:15000})}catch{settled=false}
 const after=await page.evaluate(()=>{const s=window.__IG.state,n=s.p.nodes.find(x=>x.id===s.id);return {revision:s.revision,compiledRevision:s.compiledRevision,save:document.querySelector('#save-state')?.textContent,preview:document.querySelector('#preview-tag')?.textContent,status:document.querySelector('#status')?.textContent,busy:!document.querySelector('#busy')?.hidden,selected:n&&{id:n.id,type:n.type,name:n.name},value:document.querySelector('[aria-label="模様の拡大速度"]')?.value,abort:s.abort?{aborted:s.abort.signal.aborted}:null}});
 after.errors=errors;
 console.log('PDF_F16_DIAGNOSTIC '+JSON.stringify({before,after,settled}));
 if(!settled)throw Error('PDF-F16 did not settle: '+JSON.stringify(after));
}finally{await browser.close()}
