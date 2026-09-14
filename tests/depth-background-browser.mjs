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
 try{await page.waitForFunction(()=>{const s=window.__IG?.state,n=s?.p?.nodes.find(x=>x.id===s.id);return n?.type==='repeater'&&n.name==='Depth zoom background'},undefined,{timeout:5000})}catch{
  const diagnostic=await page.evaluate(()=>{const s=window.__IG?.state,n=s?.p?.nodes.find(x=>x.id===s?.id);return {revision:s?.revision,compiledRevision:s?.compiledRevision,selected:n?{id:n.id,type:n.type,name:n.name}:null,status:document.querySelector('#status')?.textContent||'',addType:document.querySelector('#add-type')?.value,nodes:s?.p?.nodes.slice(-5).map(x=>({id:x.id,type:x.type,name:x.name,parent:x.parent}))}});
  throw Error('PDF-F16 add diagnostic '+JSON.stringify(diagnostic));
 }
 await page.waitForSelector('[data-depth-background-controls]',{timeout:10000});
 const repeaterId=await page.evaluate(()=>window.__IG.state.id);
 const templateId=await page.evaluate(id=>window.__IG.state.p.nodes.find(n=>n.id===id).data.template,repeaterId);

 const inspect=()=>page.evaluate(id=>{
  const p=window.__IG.state.p,n=p.nodes.find(x=>x.id===id),ex=b=>b?.expr?p.expressions.find(e=>e.id===b.expr):null,isLocal=b=>{const e=ex(b);return e?.op==='input'&&e.name==='localTime'},constant=b=>{const e=ex(b);return e?.op==='add'&&typeof e.args?.[0]==='number'&&e.args?.[1]===0?e:null};
  const scale=ex(n.transform.scale[0]),step=constant(scale.args[0]),phase=ex(scale.args[1]),motion=ex(phase.args[0]),speed=constant(isLocal(motion.args[0])?motion.args[1]:motion.args[0]);
  const viewCameras=new Set(p.nodes.filter(x=>x.type==='view').map(x=>x.data.camera)),camera=p.nodes.find(x=>x.type==='camera'&&x.enabled&&!viewCameras.has(x.id));
  const zoom=ex(camera?.data.zoom);let cameraSpeed=null;if(zoom?.op==='mul')for(const b of zoom.args){const factor=ex(b);if(factor?.op!=='pow'||factor.args?.[0]!==2)continue;const power=ex(factor.args[1]);if(power?.op!=='mul')continue;const sb=isLocal(power.args[0])?power.args[1]:isLocal(power.args[1])?power.args[0]:null;cameraSpeed=constant(sb)?.args?.[0]??null}
  return {speed:speed.args[0],step:step.args[0],count:n.data.count,maxCount:n.data.maxCount,cameraId:camera?.id,cameraSpeed,template:n.data.template,shape:p.nodes.find(x=>x.id===n.data.template)?.data.shape,scaleRefs:n.data.scaleStep.map(x=>x.expr),scaleExpr:n.transform.scale.map(x=>x.expr)};
 },repeaterId);

 const initial=await inspect();
 if(initial.shape!=='frame'||initial.speed!==.5||initial.cameraSpeed!==.04||initial.scaleRefs[0]!==initial.scaleRefs[1]||initial.scaleExpr[0]!==initial.scaleExpr[1])throw Error('PDF-F16 default authoring graph is invalid: '+JSON.stringify(initial));

 const change=async(label,value)=>{const input=page.getByLabel(label,{exact:true});await input.fill(String(value));await input.press('Tab');await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision&&document.querySelector('#save-state')?.textContent==='保存済み',undefined,{timeout:90000})};
 await change('模様の拡大速度',.65);let after=await inspect();if(Math.abs(after.speed-.65)>1e-9||Math.abs(after.cameraSpeed-.04)>1e-9)throw Error('PDF-F16 pattern speed changed Camera speed: '+JSON.stringify(after));
 await change('Camera Zoom速度',.09);after=await inspect();if(Math.abs(after.speed-.65)>1e-9||Math.abs(after.cameraSpeed-.09)>1e-9)throw Error('PDF-F16 Camera speed changed pattern speed: '+JSON.stringify(after));
 const beforeOverlap=await inspect();await change('重なり',.7);const overlapChanged=await inspect();if(Math.abs(overlapChanged.step-beforeOverlap.step)<1e-6||overlapChanged.count<8||overlapChanged.count>128)throw Error('PDF-F16 overlap control did not update depth spacing safely: '+JSON.stringify({beforeOverlap,overlapChanged}));
 await page.locator('#undo').click();await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:90000});const undone=await inspect();if(Math.abs(undone.step-beforeOverlap.step)>1e-9)throw Error('PDF-F16 overlap undo failed: '+JSON.stringify({beforeOverlap,undone}));
 await page.locator('#redo').click();await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:90000});const redone=await inspect();if(Math.abs(redone.step-overlapChanged.step)>1e-9)throw Error('PDF-F16 overlap redo failed: '+JSON.stringify({overlapChanged,redone}));

 await change('Camera Zoom速度',0);
 const seam=await page.evaluate(async id=>{
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const p=window.__IG.state.p,n=p.nodes.find(x=>x.id===id),ex=b=>b?.expr?p.expressions.find(e=>e.id===b.expr):null,isLocal=b=>{const e=ex(b);return e?.op==='input'&&e.name==='localTime'},constant=b=>{const e=ex(b);return e?.op==='add'?e:null};
  const scale=ex(n.transform.scale[0]),phase=ex(scale.args[1]),motion=ex(phase.args[0]),speed=constant(isLocal(motion.args[0])?motion.args[1]:motion.args[0]).args[0],period=1/speed,eps=1e-6,evaluator=new AuthorEvaluator(p,new AssetStore(p));
  const scalesAt=t=>evaluator.frame(t,false,t).filter(l=>l.nodeId===n.data.template).map(l=>Math.hypot(l.m[0],l.m[1])).sort((a,b)=>a-b);
  const before=scalesAt(period-eps),after=scalesAt(period);let maxRelative=0;for(let i=0;i<Math.min(before.length-1,after.length-1);i++)maxRelative=Math.max(maxRelative,Math.abs(before[i]-after[i+1])/Math.max(1e-12,after[i+1]));
  const template=p.nodes.find(x=>x.id===n.data.template),w=template.data.params.width,h=template.data.params.height;
  return {period,countBefore:before.length,countAfter:after.length,maxRelative,newInner:[after[0]*w,after[0]*h],outer:[after.at(-1)*w,after.at(-1)*h],stage:[p.width,p.height]};
 },repeaterId);
 if(seam.countBefore!==seam.countAfter||seam.countAfter<8||seam.maxRelative>1e-5)throw Error('PDF-F16 periodic zoom has a discontinuity: '+JSON.stringify(seam));
 if(Math.max(...seam.newInner)>6||seam.outer[0]<seam.stage[0]*1.35||seam.outer[1]<seam.stage[1]*1.35)throw Error('PDF-F16 wrap endpoints are visible enough to flash: '+JSON.stringify(seam));

 const roundtrip=await page.evaluate(async id=>{
  const s=window.__IG.state,source=structuredClone(s.p),n=source.nodes.find(x=>x.id===id),camera=source.nodes.find(x=>x.type==='camera'&&x.enabled),before={scale:JSON.stringify(n.transform.scale),step:JSON.stringify(n.data.scaleStep),count:n.data.count,camera:JSON.stringify(camera?.data.zoom)};
  const compiled=await window.__IG.compile(source),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),r=back.source.nodes.find(x=>x.id===id),c=back.source.nodes.find(x=>x.id===camera?.id);
  return {before,after:{scale:JSON.stringify(r?.transform.scale),step:JSON.stringify(r?.data.scaleStep),count:r?.data.count,camera:JSON.stringify(c?.data.zoom)},commands:compiled.report.commands,format:back.source.format};
 },repeaterId);
 if(roundtrip.commands<=0||JSON.stringify(roundtrip.before)!==JSON.stringify(roundtrip.after))throw Error('PDF-F16 sb3 roundtrip lost depth settings: '+JSON.stringify(roundtrip));

 await page.reload();await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});
 const persisted=await inspect();if(Math.abs(persisted.speed-.65)>1e-9||persisted.cameraSpeed!==0||Math.abs(persisted.step-overlapChanged.step)>1e-9)throw Error('PDF-F16 persistence failed: '+JSON.stringify(persisted));

 await page.setViewportSize({width:390,height:844});
 await page.locator('#layers .name').filter({hasText:'Depth zoom background'}).first().click();
 await page.locator('.mobile-tabs button[data-pane="inspector"]').click();
 await page.waitForSelector('[data-depth-background-controls]');
 const mobile=await page.locator('[data-depth-background-controls]').boundingBox();if(!mobile||mobile.x<0||mobile.x+mobile.width>391)throw Error('PDF-F16 mobile controls overflow viewport: '+JSON.stringify(mobile));
 if(errors.length)throw Error(errors.join('\n'));
 console.log({depthBackground:'PDF-F16 pass',initial,overlapChanged,seam,roundtrip,persisted,mobile});
}finally{
 await browser.close();
}
