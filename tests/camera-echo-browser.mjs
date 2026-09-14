import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});

 // Editor acceptance: camera mode is an ordinary editable/undoable temporalEcho setting.
 await page.locator('#add-type').selectOption('text');
 await page.locator('#add').click();
 await page.waitForFunction(()=>window.__IG.state.p.nodes.find(n=>n.id===window.__IG.state.id)?.type==='text');
 const textId=await page.evaluate(()=>window.__IG.state.id);
 const effects=page.locator('details.section').filter({has:page.locator('summary',{hasText:'Effects'})}).first();
 await effects.locator('select').last().selectOption('temporalEcho');
 await effects.getByRole('button',{name:'＋ Effect'}).click();
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id)?.effects.some(e=>e.kind==='temporalEcho'),textId);
 const cameraSelect=()=>page.locator('.full').filter({has:page.locator(':scope > h3',{hasText:'temporalEcho'})}).first().locator('label').filter({hasText:'Camera'}).locator('select');
 await cameraSelect().selectOption('current');
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).effects.find(e=>e.kind==='temporalEcho')?.camera==='current',textId);
 await page.locator('#undo').click();
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).effects.find(e=>e.kind==='temporalEcho')?.camera==='sampled',textId);
 await page.locator('#redo').click();
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).effects.find(e=>e.kind==='temporalEcho')?.camera==='current',textId);
 await cameraSelect().selectOption('sampled');
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).effects.find(e=>e.kind==='temporalEcho')?.camera==='sampled',textId);
 await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='保存済み',{timeout:15000});

 // Exact F14 semantics: a static object must not trail camera motion in current mode,
 // while sampled mode evaluates each history sample with its historical camera.
 const semantics=await page.evaluate(async()=>{
  const {makeProject,node,addNode,animate,uid}=await import('/IntroGenerator/src/model.js');
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');
  const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const p=makeProject();p.duration=2;p.assets=structuredClone(window.__IG.state.p.assets);
  const camera=node('camera','PDF-F14 Camera');addNode(p,camera);animate(p,camera.transform.position,0,[[0,-100,'linear'],[2,100,'linear']]);
  const text=node('text','PDF-F14 Static target');text.data.text='CAMERA';text.data.runs[0].to=6;addNode(p,text);
  const fx={id:uid(),kind:'temporalEcho',duration:.8,unit:'seconds',opacity:.8,softness:0,falloff:null,includeBase:true,camera:'current'};text.effects=[fx];
  const positions=mode=>{fx.camera=mode;const leaves=new AuthorEvaluator(p,new AssetStore(p)).frame(1);return leaves.filter(x=>/\/echo\d+$/.test(x.key)).map(x=>x.m[4])};
  const current=positions('current'),sampled=positions('sampled');
  const spread=xs=>Math.max(...xs)-Math.min(...xs);
  return {current,sampled,currentSpread:spread(current),sampledSpread:spread(sampled)};
 });
 if(semantics.current.length!==8||semantics.sampled.length!==8)throw Error('PDF-F14 history sample count is incomplete: '+JSON.stringify(semantics));
 if(semantics.currentSpread>1e-8)throw Error('PDF-F14 current mode incorrectly includes camera motion: '+JSON.stringify(semantics));
 if(semantics.sampledSpread<20)throw Error('PDF-F14 sampled mode did not include historical camera motion: '+JSON.stringify(semantics));

 const roundtrip=await page.evaluate(async id=>{
  const s=window.__IG.state,compiled=await window.__IG.compile(structuredClone(s.p)),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),e=back.source.nodes.find(n=>n.id===id)?.effects.find(e=>e.kind==='temporalEcho');
  return {format:back.source.format,camera:e?.camera,commands:compiled.report.commands};
 },textId);
 if(roundtrip.format!=='IGAUTHOR/1.4'||roundtrip.camera!=='sampled'||roundtrip.commands<=0)throw Error('PDF-F14 sb3 roundtrip lost camera mode: '+JSON.stringify(roundtrip));

 await page.reload();
 await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 const persisted=await page.evaluate(id=>window.__IG.state.p.nodes.find(n=>n.id===id)?.effects.find(e=>e.kind==='temporalEcho')?.camera,textId);
 if(persisted!=='sampled')throw Error('PDF-F14 persistence lost camera mode: '+persisted);
 if(errors.length)throw Error(errors.join('\n'));
 console.log({cameraEcho:'PDF-F14 pass',semantics,roundtrip,persisted});
}finally{
 await browser.close();
}
