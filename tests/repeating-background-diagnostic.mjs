import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});
 await page.locator('#add-type').selectOption('scroll');
 await page.locator('#add').click();
 await page.waitForFunction(()=>{const s=window.__IG?.state,n=s?.p?.nodes.find(n=>n.id===s.id);return n?.type==='repeater'&&n.data.mode==='lattice'},undefined,{timeout:30000});
 const result=await page.evaluate(async()=>{
  const S=window.__IG.state;
  S.abort?.abort();
  const controller=new AbortController();
  let progress=0;
  const started=performance.now();
  try{
   const compiled=await Promise.race([
    window.__IG.compile(structuredClone(S.p),p=>progress=p,controller.signal).then(value=>({kind:'done',value})),
    new Promise(resolve=>setTimeout(()=>{controller.abort();resolve({kind:'timeout'})},15000))
   ]);
   if(compiled.kind==='done')return {kind:'done',elapsed:performance.now()-started,progress,report:compiled.value.report,status:document.querySelector('#status')?.textContent||'',preview:document.querySelector('#preview-tag')?.textContent||''};
   return {kind:'timeout',elapsed:performance.now()-started,progress,status:document.querySelector('#status')?.textContent||'',preview:document.querySelector('#preview-tag')?.textContent||''};
  }catch(error){return {kind:'error',elapsed:performance.now()-started,progress,error:error?.message||String(error),status:document.querySelector('#status')?.textContent||'',preview:document.querySelector('#preview-tag')?.textContent||''}}
 });
 console.log('PDF-F15 diagnostic',result);
 if(result.kind!=='done')throw Error('PDF-F15 diagnostic '+JSON.stringify(result));
}finally{
 await browser.close();
}
