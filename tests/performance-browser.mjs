import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});

 await page.evaluate(async()=>{
  const {makeProject,node,addNode}=await import('/IntroGenerator/src/model.js');
  const p=makeProject();p.duration=2;p.profile.sampleFPS=30;p.nodes[0].time.end=2;p.nodes[0].time.duration=2;
  for(let i=0;i<160;i++){
   const n=node('shape','Perf shape '+i);n.data.shape='rectangle';n.data.params.width=24;n.data.params.height=16;n.transform.position=[(i%16-7.5)*28,(Math.floor(i/16)-4.5)*28,0];n.time.end=2;n.time.duration=2;addNode(p,n);
  }
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('IntroGenerator',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 });
 await page.reload();
 await page.waitForFunction(()=>window.__IG?.state?.compiled&&window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:120000});
 await page.locator('#layers .name').filter({hasText:'Perf shape 159'}).click();

 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');
 const profile=async fn=>{await cdp.send('Profiler.start');const result=await fn();const {profile}=await cdp.send('Profiler.stop');const nodes=new Map(profile.nodes.map(n=>[n.id,n])),totals=new Map();for(let i=0;i<(profile.samples?.length||0);i++){const n=nodes.get(profile.samples[i]),ms=(profile.timeDeltas?.[i]||0)/1000;if(!n)continue;const file=(n.callFrame.url||'').split('/').at(-1)||'(native)',key=(n.callFrame.functionName||'(anonymous)')+'@'+file;totals.set(key,(totals.get(key)||0)+ms)}return {result,top:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,ms])=>({name,ms:+ms.toFixed(3)}))}};

 const editor=await profile(()=>page.evaluate(()=>{
  const input=document.querySelector('#inspector input[aria-label="X"]');if(!input)throw Error('performance editor input missing');
  const start=performance.now();window.__PERF_EDITOR_START=start;input.value=String(Number(input.value)+1);input.dispatchEvent(new Event('change',{bubbles:true}));return {syncMs:performance.now()-start,revision:window.__IG.state.revision};
 }));
 await page.waitForFunction(revision=>window.__IG.state.compiledRevision===revision,editor.result.revision,{timeout:120000});
 const editorTotal=await page.evaluate(()=>performance.now()-window.__PERF_EDITOR_START);

 const compileProfile=await profile(()=>page.evaluate(async()=>{
  const source=structuredClone(window.__IG.state.p),start=performance.now(),compiled=await window.__IG.compile(source);window.__PERF_COMPILED=compiled;return {ms:performance.now()-start,commands:compiled.report.commands,assets:compiled.report.assets};
 }));
 const runtimeProfile=await profile(()=>page.evaluate(()=>{
  const compiled=window.__PERF_COMPILED,canvas=document.createElement('canvas');canvas.width=960;canvas.height=720;const runtime=new window.__IG.Runtime(compiled);runtime.draw(canvas,0);const frames=180,start=performance.now();for(let i=0;i<frames;i++)runtime.draw(canvas,(i%60)/30);const ms=performance.now()-start;return {ms,frames,perFrameMs:ms/frames,commands:compiled.report.commands};
 }));

 const out={editor:{syncMs:+editor.result.syncMs.toFixed(3),totalMs:+editorTotal.toFixed(3),top:editor.top},compiler:{...compileProfile.result,ms:+compileProfile.result.ms.toFixed(3),top:compileProfile.top},runtime:{...runtimeProfile.result,ms:+runtimeProfile.result.ms.toFixed(3),perFrameMs:+runtimeProfile.result.perFrameMs.toFixed(4),top:runtimeProfile.top}};
 console.log('PERF_AUDIT '+JSON.stringify(out));
 if(!Number.isFinite(out.editor.syncMs)||!Number.isFinite(out.compiler.ms)||!Number.isFinite(out.runtime.perFrameMs))throw Error('performance audit produced invalid measurements');
}finally{await browser.close()}
