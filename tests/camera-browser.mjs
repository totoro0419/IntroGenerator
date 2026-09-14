import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const close=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});let errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 // UI reachability: Camera Pan/Rotation/Zoom must be directly editable with existing native controls.
 await page.getByLabel('追加する要素').selectOption('camera');await page.locator('#add').click();
 const transform=page.locator('#inspector details.section').filter({has:page.locator('summary',{hasText:'Transform'})}).first();
 const camera=page.locator('#inspector details.section').filter({has:page.locator('summary',{hasText:'Camera'})}).first();
 for(const [control,value] of [[transform.getByLabel('X',{exact:true}),'40'],[transform.getByLabel('Y',{exact:true}),'-20'],[transform.getByLabel('回転 °',{exact:true}),'30'],[camera.getByLabel('Zoom',{exact:true}),'2']]){await control.fill(value);await control.press('Tab')}
 await page.waitForFunction(()=>{const n=__IG.state.p.nodes.find(n=>n.id===__IG.state.id);return n?.type==='camera'&&n.transform.position[0]===40&&n.transform.position[1]===-20&&n.transform.rotation===30&&n.data.zoom===2},{timeout:10000});
 await page.waitForTimeout(500);await page.evaluate(()=>__IG.rebuild());
 const uiCompile=await page.evaluate(()=>({revision:__IG.state.revision,compiledRevision:__IG.state.compiledRevision,status:document.querySelector('#status')?.textContent||''}));
 if(uiCompile.compiledRevision!==uiCompile.revision)throw Error(`PDF-F10 UI edit did not compile: ${JSON.stringify(uiCompile)}`);
 const result=await page.evaluate(async()=>{
  const {makeProject,node,addNode,animate}=await import('/IntroGenerator/src/model.js');
  const p=makeProject();
  const a=node('shape','World A');a.transform.position=[-50,0,0];addNode(p,a);
  const b=node('shape','World B');b.transform.position=[50,0,0];b.transform.scale=[2,2];addNode(p,b);
  const overlay=node('shape','Screen Overlay');overlay.space='screen';overlay.transform.position=[80,60,0];addNode(p,overlay);
  const cam=node('camera','Main Camera');addNode(p,cam);
  animate(p,cam.transform.position,'0',[[0,0,'linear'],[1,40,'linear']]);
  animate(p,cam.transform.position,'1',[[0,0,'linear'],[1,-20,'linear']]);
  animate(p,cam.transform,'rotation',[[0,0,'linear'],[1,30,'linear']]);
  animate(p,cam.data,'zoom',[[0,1,'linear'],[1,2,'linear']]);
  __IG.state.p=p;__IG.state.id=cam.id;__IG.state.t=0;__IG.state.revision++;await __IG.rebuild();
  const runtime=new __IG.Runtime(__IG.state.compiled),pick=(frame,id)=>frame.find(x=>x.nodeId===id)?.v;
  const f0=runtime.prepare(0),f1=runtime.prepare(1),a0=pick(f0,a.id),a1=pick(f1,a.id),b0=pick(f0,b.id),b1=pick(f1,b.id),o0=pick(f0,overlay.id),o1=pick(f1,overlay.id);
  if(![a0,a1,b0,b1,o0,o1].every(Boolean))throw Error('PDF-F10 draw item missing');
  const scale=v=>Math.hypot(v[0],v[1]),delta=(x,y)=>[y[4]-x[4],y[5]-x[5]],angle=v=>Math.atan2(v[1],v[0])*180/Math.PI;
  const d0=delta(a0,b0),d1=delta(a1,b1),mid1=[(a1[4]+b1[4])/2,(a1[5]+b1[5])/2];
  const sb3=await __IG.exportSB3(__IG.state.compiled),imported=await __IG.importSB3(sb3.bytes),restored=imported.source.nodes.find(n=>n.id===cam.id);
  return {d0,d1,mid1,angle1:angle(d1),aScale0:scale(a0),aScale1:scale(a1),bScale0:scale(b0),bScale1:scale(b1),overlay0:[o0[4],o0[5],scale(o0)],overlay1:[o1[4],o1[5],scale(o1)],sourceCamera:JSON.stringify({transform:cam.transform,data:cam.data}),restoredCamera:JSON.stringify({transform:restored.transform,data:restored.data})};
 });
 if(!close(Math.hypot(...result.d0),100))throw Error(`PDF-F10 base world distance changed: ${JSON.stringify(result.d0)}`);
 if(!close(Math.hypot(...result.d1),200,1e-4))throw Error(`PDF-F10 zoom did not affect whole World: ${JSON.stringify(result.d1)}`);
 if(!close(result.angle1,-30,1e-4))throw Error(`PDF-F10 roll mismatch: ${result.angle1}`);
 if(Math.hypot(...result.mid1)<1)throw Error('PDF-F10 pan did not move World');
 if(!close(result.bScale0/result.aScale0,2)||!close(result.bScale1/result.aScale1,2))throw Error('PDF-F10 camera overwrote element-local scale');
 if(!result.overlay0.every((v,i)=>close(v,result.overlay1[i]))||!close(result.overlay0[0],80)||!close(result.overlay0[1],60))throw Error(`PDF-F10 moved Screen-fixed overlay: ${JSON.stringify([result.overlay0,result.overlay1])}`);
 if(result.sourceCamera!==result.restoredCamera)throw Error('PDF-F10 camera authoring data changed after sb3 roundtrip');
 await page.setViewportSize({width:390,height:844});if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))throw Error('PDF-F10 controls cause mobile horizontal overflow');
 if(errors.length)throw Error(errors.join('\n'));console.log({camera:'PDF-F10 pass',uiCompile,...result});
}finally{await browser.close()}
