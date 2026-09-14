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

 const regression=await page.evaluate(async()=>{
  const project=window.__IG.state.p,compiled=window.__PERF_COMPILED;
  const {legacyValidationView}=await import('/IntroGenerator/src/easing-stack.js');
  const {AssetStore,digest,utf8}=await import('/IntroGenerator/src/assets.js');
  const {trs,mul,point,clamp,rad}=await import('/IntroGenerator/src/math.js');
  const median=values=>{const v=[...values].sort((a,b)=>a-b);return v[Math.floor(v.length/2)]};
  const timed=fn=>{const start=performance.now();fn();return performance.now()-start};
  const compare=(legacy,optimized,batches=7)=>{legacy();optimized();const old=[],now=[];for(let i=0;i<batches;i++){if(i%2){now.push(timed(optimized));old.push(timed(legacy))}else{old.push(timed(legacy));now.push(timed(optimized))}}const legacyMs=median(old),optimizedMs=median(now);return {legacyMs:+legacyMs.toFixed(3),optimizedMs:+optimizedMs.toFixed(3),ratio:+(optimizedMs/legacyMs).toFixed(3)}};

  const oldValidationView=p=>{const copy=structuredClone(p);copy.format='IGAUTHOR/1.3';for(const track of copy.tracks||[])for(const key of track.keys||[])key.ease={kind:'linear'};return copy};
  const oldView=oldValidationView(project),newView=legacyValidationView(project);
  if(JSON.stringify(oldView)!==JSON.stringify(newView))throw Error('optimized validation view changed semantics');
  const validation=compare(()=>{for(let i=0;i<80;i++)oldValidationView(project)},()=>{for(let i=0;i<80;i++)legacyValidationView(project)});

  const body='<g fill="#66ccff"><rect x="-12" y="-8" width="24" height="16"/></g>',bounds=[-17,-13,34,26],iterations=3000;
  const legacyAsset=()=>{const map=new Map();for(let i=0;i<iterations;i++){let [x,y,w,h]=bounds;w=Math.max(1,w);h=Math.max(1,h);const cx=-x,cy=y+h,text=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g transform="translate(${cx} ${cy}) scale(1 -1)">${body}</g></svg>`,key=digest(text);if(map.has(key))continue;map.set(key,1);utf8(text)}};
  const optimizedAsset=()=>{const store=new AssetStore(project);let id=0;for(let i=0;i<iterations;i++)id=store.put(body,bounds,false);if(id!==1||store.items.length!==1)throw Error('optimized AssetStore duplicate identity changed')};
  const asset=compare(legacyAsset,optimizedAsset);

  const L=compiled.lists,runtime=new window.__IG.Runtime(compiled);
  const legacyProgram=(id,t,index=0,particle=0)=>{const p=id-1,r=new Float64Array(L.P_REGS[p]+1);for(let pc=L.P_FIRST[p]-1,end=pc+L.P_COUNT[p];pc<end;pc++){const op=L.O_CODE[pc],d=L.O_DST[pc],imm=L.O_IMM[pc],first=L.O_FIRST[pc]-1,count=L.O_COUNT[pc],args=L.OA_SLOT.slice(first,first+count),a=args.map(i=>r[i]);let v;switch(op){case 0:v=imm;break;case 1:v=imm===0?t:imm===1?index:particle;break;case 4:v=a[0];break;case 5:v=a[0]+a[1];break;case 6:v=a[0]-a[1];break;case 7:v=a[0]*a[1];break;case 8:v=a[0]/a[1];break;case 9:v=Math.min(...a);break;case 10:v=Math.max(...a);break;case 11:v=a[0]**a[1];break;case 12:v=Math.abs(a[0]);break;case 13:v=Math.floor(a[0]);break;case 14:v=Math.sqrt(a[0]);break;case 15:v=+Math.sin(rad(a[0])).toFixed(10);break;case 16:v=+Math.cos(rad(a[0])).toFixed(10);break;case 17:v=Math.atan2(a[0],a[1])*180/Math.PI;break;case 18:v=((a[0]%a[1])+a[1])%a[1];break;case 19:v=+(a[0]<a[1]);break;case 20:v=+(a[0]<=a[1]);break;case 21:v=+(a[0]===a[1]);break;case 22:v=a[0]?a[1]:a[2];break;case 23:v=runtime.track(imm,a[0]);break;case 24:r.set(trs(...a),d);continue;case 25:r.set(mul([...r.slice(args[0],args[0]+6)],[...r.slice(args[1],args[1]+6)]),d);continue;case 26:r.set(point([...r.slice(args[0],args[0]+6)],a.slice(1)),d);continue;default:throw Error('legacy runtime unsupported opcode '+op)}if(!Number.isFinite(v))throw Error('legacy runtime numeric error');r[d]=v}return [...r.slice(L.P_OUTPUT[p],L.P_OUTPUT[p]+L.P_OUTCOUNT[p])]};
  const programCount=L.P_FIRST.length;
  for(let id=1;id<=programCount;id++){const a=legacyProgram(id,.5),b=runtime.program(id,.5);if(a.length!==b.length||a.some((v,i)=>Math.abs(v-b[i])>1e-10))throw Error('optimized Runtime.program changed output for program '+id)}
  const rounds=40,legacyPrograms=()=>{for(let r=0;r<rounds;r++)for(let id=1;id<=programCount;id++)legacyProgram(id,.5)},optimizedPrograms=()=>{for(let r=0;r<rounds;r++)for(let id=1;id<=programCount;id++)runtime.program(id,.5)};
  const runtimeProgram=compare(legacyPrograms,optimizedPrograms);
  return {validation,asset,runtimeProgram,programCount};
 });
 console.log('PERF_REGRESSION '+JSON.stringify(regression));
 if(regression.validation.ratio>=.6)throw Error('legacy validation optimization regressed: '+JSON.stringify(regression.validation));
 if(regression.asset.ratio>=.7)throw Error('AssetStore duplicate optimization regressed: '+JSON.stringify(regression.asset));
 if(regression.runtimeProgram.ratio>=.9)throw Error('Runtime.program optimization regressed: '+JSON.stringify(regression.runtimeProgram));
}finally{await browser.close()}
