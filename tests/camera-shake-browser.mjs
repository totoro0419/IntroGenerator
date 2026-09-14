import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const close=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 // UI reachability: a Camera gets a dedicated Shake panel without handwritten expressions.
 await page.getByLabel('追加する要素').selectOption('camera');await page.locator('#add').click();await page.waitForSelector('#camera-shake-panel');
 await page.getByRole('button',{name:'＋ Camera Shakeを追加'}).click();await page.waitForFunction(()=>document.querySelector('#camera-shake-panel input[aria-label="速さ (Hz)"]'));
 for(const [label,value] of [['移動 X 量 (px)','18'],['移動 Y 量 (px)','11'],['回転量 (°)','2.4'],['Zoom量 (0.03 = 3%)','.05'],['速さ (Hz)','7'],['開始 (秒)','.5'],['継続 (秒)','1.5'],['立上り (秒)','.2'],['収束 (秒)','.35']]){const input=page.getByLabel(label,{exact:true});await input.fill(value);await input.press('Tab')}
 await page.waitForFunction(()=>!document.querySelector('#busy:not([hidden])'),{timeout:60000});
 const ui=await page.evaluate(async()=>{const {cameraShakeConfig}=await import('/IntroGenerator/src/camera-shake.js');const s=__IG.state,n=s.p.nodes.find(n=>n.id===s.id);return {type:n?.type,cfg:cameraShakeConfig(s.p,n),revision:s.revision,compiledRevision:s.compiledRevision}});
 if(ui.type!=='camera'||!ui.cfg)throw Error('PDF-F11 Camera Shake UI did not create authoring data');
 for(const [key,value] of Object.entries({x:18,y:11,roll:2.4,zoom:.05,speed:7,start:.5,duration:1.5,attack:.2,decay:.35}))if(!close(ui.cfg[key],value))throw Error(`PDF-F11 UI value mismatch: ${key}=${ui.cfg[key]}`);
 if(ui.compiledRevision!==ui.revision)throw Error(`PDF-F11 UI edit did not compile: ${JSON.stringify(ui)}`);
 const result=await page.evaluate(async()=>{
  const {makeProject,node,addNode,animate,cloneNode}=await import('/IntroGenerator/src/model.js');
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');
  const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const {installCameraShake,cameraShakeConfig,cameraShakeParams}=await import('/IntroGenerator/src/camera-shake.js');
  const p=makeProject();p.duration=4;p.nodes[0].time.end=4;p.nodes[0].time.duration=4;
  const world=node('shape','Shake target');world.transform.position=[45,-20,0];addNode(p,world);
  const overlay=node('shape','Screen overlay');overlay.space='screen';overlay.transform.position=[90,65,0];addNode(p,overlay);
  const cam=node('camera','Shake camera');addNode(p,cam);animate(p,cam.transform.position,'0',[[0,0,'linear'],[3,120,'linear']]);animate(p,cam.transform,'rotation',[[0,0,'linear'],[3,12,'linear']]);animate(p,cam.data,'zoom',[[0,1,'linear'],[3,1.6,'linear']]);
  const config={x:18,y:11,roll:2.4,zoom:.05,speed:7,start:.5,duration:1.5,attack:.2,decay:.35};installCameraShake(p,cam,config);
  const cloneId=cloneNode(p,cam.id,p.root),clone=p.nodes.find(n=>n.id===cloneId),cloneConfig=cameraShakeConfig(p,clone);
  clone.enabled=false;
  const baseline=structuredClone(p),baseCam=baseline.nodes.find(n=>n.id===cam.id),baseParams=cameraShakeParams(baseline,baseCam);for(const k of ['x','y','roll','zoom'])baseParams[k].args[0]=0;
  const author=new AuthorEvaluator(p,new AssetStore(p)),baseAuthor=new AuthorEvaluator(baseline,new AssetStore(baseline));
  const sample=t=>({shake:author.camera(t),base:baseAuthor.camera(t)}),samples=[.25,.5,.72,.93,1.18,1.47,1.82,2.1].map(sample),sameA=author.camera(.93),sameB=author.camera(.93);
  const compiled=await __IG.compile(p),baseCompiled=await __IG.compile(baseline),runtime=new __IG.Runtime(compiled),baseRuntime=new __IG.Runtime(baseCompiled),pick=(rt,t,id)=>rt.prepare(t).find(x=>x.nodeId===id)?.v;
  const before={shake:pick(runtime,.25,world.id),base:pick(baseRuntime,.25,world.id)},active={shake:pick(runtime,1.18,world.id),base:pick(baseRuntime,1.18,world.id)},after={shake:pick(runtime,2.1,world.id),base:pick(baseRuntime,2.1,world.id)},overlayActive={shake:pick(runtime,1.18,overlay.id),base:pick(baseRuntime,1.18,overlay.id)},runtimeSame=[pick(runtime,.93,world.id),pick(runtime,.93,world.id)];
  const sb3=await __IG.exportSB3(compiled),imported=await __IG.importSB3(sb3.bytes),restored=imported.source.nodes.find(n=>n.id===cam.id),restoredConfig=cameraShakeConfig(imported.source,restored),importRuntime=new __IG.Runtime(imported),scratchEquivalent=[runtime.prepare(1.18).map(x=>x.v),importRuntime.prepare(1.18).map(x=>x.v)];
  return {config,cloneConfig,samples,sameA,sameB,before,active,after,overlayActive,runtimeSame,restoredConfig,scratchEquivalent,assets:compiled.report.assets,commands:compiled.report.commands};
 });
 const cameraKeys=['x','y','roll','zoom'];for(const k of cameraKeys)if(!close(result.cloneConfig[k],result.config[k]))throw Error(`PDF-F11 duplicate lost Shake ${k}`);
 const before=result.samples[0],start=result.samples[1],after=result.samples.at(-1);for(const [name,s] of [['before',before],['start',start],['after',after]])for(const key of ['x','y','roll','zoom'])if(!close(s.shake[key],s.base[key],1e-8))throw Error(`PDF-F11 ${name} window leaked into ${key}`);
 const activeSamples=result.samples.slice(2,-1),diff={x:0,y:0,roll:0,zoom:0};for(const s of activeSamples)for(const key of Object.keys(diff))diff[key]=Math.max(diff[key],Math.abs(s.shake[key]-s.base[key]));for(const [key,v] of Object.entries(diff))if(v<1e-4)throw Error(`PDF-F11 ${key} channel did not shake`);
 if(!close(result.sameA.x,result.sameB.x)||!close(result.sameA.y,result.sameB.y)||!close(result.sameA.roll,result.sameB.roll)||!close(result.sameA.zoom,result.sameB.zoom))throw Error('PDF-F11 seek is not deterministic');
 if(result.samples[3].base.x<=0||result.samples[3].base.roll<=0||result.samples[3].base.zoom<=1)throw Error('PDF-F11 baseline Camera animation was not layered under Shake');
 const equalVec=(a,b,e=1e-6)=>a&&b&&a.length===b.length&&a.every((v,i)=>close(v,b[i],e));if(!equalVec(result.before.shake,result.before.base)||!equalVec(result.after.shake,result.after.base))throw Error('PDF-F11 compiled window leaked outside Shake duration');if(equalVec(result.active.shake,result.active.base,1e-5))throw Error('PDF-F11 compiled World did not receive Shake');if(!equalVec(result.overlayActive.shake,result.overlayActive.base))throw Error('PDF-F11 moved Screen-fixed overlay');if(!equalVec(result.runtimeSame[0],result.runtimeSame[1]))throw Error('PDF-F11 Runtime seek changed Shake result');
 for(const [key,value] of Object.entries(result.config))if(!close(result.restoredConfig[key],value))throw Error(`PDF-F11 sb3 roundtrip lost ${key}`);if(JSON.stringify(result.scratchEquivalent[0])!==JSON.stringify(result.scratchEquivalent[1]))throw Error('PDF-F11 sb3 playback data differs after roundtrip');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('PDF-F11 Shake controls cause mobile horizontal overflow');if(errors.length)throw Error(errors.join('\n'));console.log({cameraShake:'PDF-F11 pass',diff,assets:result.assets,commands:result.commands});
}finally{await browser.close()}
