import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 console.log(await page.evaluate(async()=>{
  const {makeProject,node,addNode,animate,solid,uid}=await import('/IntroGenerator/src/model.js');
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');
  const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const {compile,validateSource}=await import('/IntroGenerator/src/compiler.js');
  const {Runtime}=await import('/IntroGenerator/src/runtime.js');
  const {exportSB3,importSB3}=await import('/IntroGenerator/src/scratch.js');
  const {replacePathCoordinates}=await import('/IntroGenerator/src/pdf-path-ui.js');
  const ok=(v,m)=>{if(!v)throw Error(m)},close=(a,b,e=1e-4)=>Math.abs(a-b)<=e;
  const project=(duration=.2)=>{const p=makeProject();p.duration=duration;p.assets=structuredClone(__IG.state.p.assets);const root=p.nodes.find(n=>n.id===p.root);root.time.end=duration;root.time.duration=duration;return p};
  const author=p=>new AuthorEvaluator(p,new AssetStore(p));
  const pathNode=(p,name='Path')=>{const n=node('path',name);n.data.bezier.points=[[-100,0],[-50,50],[0,-50],[50,50],[100,0]];n.data.stroke.paint=solid([1,1,1,1]);addNode(p,n);n.time.end=p.duration;n.time.duration=p.duration;return n};

  // F24: arbitrary control-point count remains editable source data.
  const p24=project(),curve=pathNode(p24);const five=author(p24).path(curve,author(p24).contextAt(curve.id,0).c);curve.data.bezier.points.push([130,-30],[160,20],[190,0]);curve.data.bezier.points[3]=[55,90];validateSource(p24);const eight=author(p24).path(curve,author(p24).contextAt(curve.id,0).c);ok(curve.data.bezier.points.length===8,'F24 source lost arbitrary control points');ok(JSON.stringify(five)!==JSON.stringify(eight),'F24 moving/adding control points did not change curve');

  // F25: coordinate import replaces only the selected path source and remains normal authoring data.
  const before=structuredClone(curve.data.bezier.points);replacePathCoordinates(p24,curve,'-120,0, -60,80, 0,0, 60,-80, 120,0, 160,30');validateSource(p24);ok(curve.data.bezier.points.length===6&&JSON.stringify(curve.data.bezier.points)!==JSON.stringify(before),'F25 coordinate import failed');

  // F26: independent curves retain separate geometry/time settings inside the same group.
  const p26=project(),group=node('group','Curves');addNode(p26,group);group.time.end=p26.duration;group.time.duration=p26.duration;const a=node('path','A'),b=node('path','B');a.data.stroke.paint=solid();b.data.stroke.paint=solid();a.data.bezier.points=[[-80,0],[0,80],[80,0]];b.data.bezier.points=[[-80,-40],[0,-80],[80,-40]];addNode(p26,a,group.id);addNode(p26,b,group.id);a.time.end=b.time.end=p26.duration;a.time.duration=b.time.duration=p26.duration;const bBefore=JSON.stringify(author(p26).path(b,author(p26).contextAt(b.id,0).c));a.data.bezier.points[1][1]=120;a.time.start=.05;const bAfter=JSON.stringify(author(p26).path(b,author(p26).contextAt(b.id,0).c));ok(bBefore===bAfter&&b.time.start===0,'F26 editing one curve changed the other');

  // F27/F28/F29: moving trim window, visible endpoints, and light-only decoration all follow displayed interval.
  const p27=project(),line=node('path','Flowing line');line.data.bezier.points=[[-100,0],[100,0]];line.data.stroke.paint=solid([1,1,1,1]);line.data.stroke.width=4;line.data.trimStart=.25;line.data.trimEnd=.75;line.data.decorations=[{id:'ends',kind:'endpoints',asset:'glowAsset',size:1,angle:0,opacity:1,spacing:20,orientation:'tangent',pass:'base'}];addNode(p27,line);line.time.end=p27.duration;line.time.duration=p27.duration;let frame=author(p27).frame(0),stroke=frame.find(x=>x.key.endsWith('/path')),ends=frame.filter(x=>x.key.includes('/decends'));ok(stroke&&ends.length===2,'F27/F28 line or endpoints missing');const ex=ends.map(x=>x.m[4]).sort((x,y)=>x-y);ok(close(ex[0],-50)&&close(ex[1],50),'F28 decorations are not on visible trim endpoints: '+ex);const x0=stroke.bounds[0];line.data.trimStart=.5;line.data.trimEnd=1;frame=author(p27).frame(0);stroke=frame.find(x=>x.key.endsWith('/path'));ok(stroke.bounds[0]>x0+40,'F27 moving interval did not move independently');line.data.trimStart=.25;line.data.trimEnd=.75;line.data.stroke.enabled=false;line.data.decorations=[{id:'glow',kind:'alongPath',asset:'glowAsset',size:1.6,angle:0,opacity:.4,spacing:20,orientation:'tangent',pass:'base'}];const lights=author(p27).frame(0);ok(!lights.some(x=>x.key.endsWith('/path')),'F29 light-only mode still drew base line');const glow=lights.filter(x=>x.key.includes('/decglow'));ok(glow.length===6&&glow.every(x=>x.alpha<=.40001&&x.m[4]>=-50.01&&x.m[4]<=50.01),'F29 glow did not follow trimmed range/density/opacity');line.data.trimStart=.5;line.data.trimEnd=.5;ok(author(p27).frame(0).filter(x=>x.key.includes('/decglow')).length===0,'F28/F29 decorations remained on empty interval');

  // F30: geometric width follows Camera zoom; screen width stays fixed. Color and width are independently animatable bindings.
  const makeWidth=async space=>{const p=project(.2),n=node('path','Width');n.data.bezier.points=[[-40,0],[40,0]];n.data.stroke.paint=solid([0,0,0,1]);n.data.stroke.width=4;n.data.stroke.space=space;addNode(p,n);n.time.end=.2;n.time.duration=.2;const cam=node('camera');cam.data.zoom=2;addNode(p,cam);cam.time.end=.2;cam.time.duration=.2;return {p,n,c:await compile(p)}};
  const geometric=await makeWidth('geometric'),screen=await makeWidth('screen'),gw=new Runtime(geometric.c).prepare(0).find(x=>x.prim===2)?.v[8],sw=new Runtime(screen.c).prepare(0).find(x=>x.prim===2)?.v[8];ok(close(gw,8)&&close(sw,4),'F30 camera width spaces mismatch: '+gw+'/'+sw);animate(screen.p,screen.n.data.stroke,'width',[[0,2,'linear'],[.15,8,'linear']],'px');animate(screen.p,screen.n.data.stroke.paint.rgba,0,[[0,0,'linear'],[.15,1,'linear']],'channel');validateSource(screen.p);ok(typeof screen.n.data.stroke.width==='object'&&typeof screen.n.data.stroke.paint.rgba[0]==='object','F30 width/color are not independently animatable');

  // F31: mirrored placement and content-orientation choice are distinct and linked to the source.
  const p31=project(),sym=node('path','Symmetry');sym.data.bezier.points=[[-30,0],[20,50],[60,10]];sym.data.stroke.paint=solid();sym.transform.position[0]=70;sym.effects=[{id:'sym',kind:'symmetry',center:[0,0],mode:'y',space:'world',transformContent:true}];addNode(p31,sym);sym.time.end=p31.duration;sym.time.duration=p31.duration;let pair=author(p31).frame(0).filter(x=>x.nodeId===sym.id);ok(pair.length===2,'F31 symmetry did not create linked counterpart');const mirrored=pair.find(x=>x.key.includes('/mirror')),base=pair.find(x=>!x.key.includes('/mirror'));ok(mirrored&&close(mirrored.m[4],-base.m[4])&&Math.sign(mirrored.m[0])===-Math.sign(base.m[0]),'F31 geometry was not mirrored');sym.effects[0].transformContent=false;pair=author(p31).frame(0).filter(x=>x.nodeId===sym.id);const kept=pair.find(x=>x.key.includes('/mirror')),keptBase=pair.find(x=>!x.key.includes('/mirror'));ok(close(kept.m[4],-keptBase.m[4])&&Math.sign(kept.m[0])===Math.sign(keptBase.m[0]),'F31 content orientation choice was not preserved');sym.data.bezier.points[1][1]=80;ok(JSON.stringify(author(p31).frame(0).map(x=>x.body)).includes('80')||author(p31).frame(0).length===2,'F31 source edit broke linked pair');

  // F32: author order -> compiler command order -> sb3 lists -> independent Web Runtime order remains identical.
  const p32=project(.1),ids=[];for(const [i,color] of [[0,[1,0,0,1]],[1,[0,1,0,1]],[2,[0,0,1,1]],[3,[1,1,0,1]],[4,[1,0,1,1]]]){const n=node('shape',['Background','Particle','Shadow','Effect','Text'][i]);n.data.shape='rectangle';n.data.params.width=80-i*5;n.data.params.height=80-i*5;n.data.paint=solid(color);addNode(p32,n);n.time.end=.1;n.time.duration=.1;ids.push(n.id)}validateSource(p32);const c32=await compile(p32),ordered=c32.entries.map(e=>e.nodeId);ok(JSON.stringify(ordered)===JSON.stringify(ids),'F32 compiler reordered layers: '+JSON.stringify(ordered));const runtimeOrder=new Runtime(c32).prepare(0).map((_,i)=>c32.entries[i]?.nodeId);ok(JSON.stringify(runtimeOrder)===JSON.stringify(ids),'F32 Web Runtime order differs from compiler');const sb3=await exportSB3(c32),loaded=await importSB3(sb3.bytes);ok(JSON.stringify(loaded.lists.C_ORDER)===JSON.stringify(c32.lists.C_ORDER),'F32 Scratch command order changed in sb3 roundtrip');
  return {F24:'pass',F25:'pass',F26:'pass',F27:'pass',F28:'pass',F29:'pass',F30:'pass',F31:'pass',F32:'pass'};
 }));

 // F25 editor acceptance: invalid import is non-mutating with a position, valid import is one Undo unit.
 await page.locator('#add-type').selectOption('path');await page.locator('#add').click();await page.waitForFunction(()=>__IG.state.compiledRevision===__IG.state.revision,{timeout:90000});
 const pathId=await page.evaluate(()=>__IG.state.id),initial=await page.evaluate(()=>structuredClone(__IG.state.p.nodes.find(n=>n.id===__IG.state.id).data.bezier.points));
 await page.getByRole('button',{name:'座標を貼り付け'}).click();await page.locator('#coordinate-text').fill('0,0,,100,100');await page.locator('#apply-coordinates').click();await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('文字'));
 const afterBad=await page.evaluate(id=>structuredClone(__IG.state.p.nodes.find(n=>n.id===id).data.bezier.points),pathId);if(JSON.stringify(afterBad)!==JSON.stringify(initial))throw Error('F25 invalid input mutated path');
 await page.locator('#coordinate-text').fill('-100,0, 0,100, 100,0');await page.locator('#apply-coordinates').click();await page.waitForFunction(id=>__IG.state.p.nodes.find(n=>n.id===id).data.bezier.points.length===3,pathId);await page.locator('#undo').click();await page.waitForFunction(({id,count})=>__IG.state.p.nodes.find(n=>n.id===id).data.bezier.points.length===count,{id:pathId,count:initial.length});
 // F30 editor acceptance: path color exposes independent keyframe controls.
 await page.locator('.layer .name').filter({hasText:'曲線'}).last().click().catch(()=>{});await page.waitForSelector('[data-pdf-path-controls]');const keys=await page.locator('[data-path-color-key]').count();if(keys!==4)throw Error('F30 color keyframe controls missing: '+keys);
 console.log('PDF F24-F32 UI routes: pass');
}finally{await browser.close()}
