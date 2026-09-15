import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 await page.waitForFunction(()=>document.querySelector('#add-type option[value="clip"]'),{timeout:10000});
 console.log(await page.evaluate(async()=>{
  const {makeProject,node,addNode,solid,constant}=await import('/IntroGenerator/src/model.js');
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');
  const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const {validateSource}=await import('/IntroGenerator/src/compiler.js');
  const {ensureAppearanceCycle,configureLinkedEffect}=await import('/IntroGenerator/src/pdf-effects-ui.js');
  const ok=(v,m)=>{if(!v)throw Error(m)},close=(a,b)=>Math.abs(a-b)<1e-5;
  const project=()=>{const p=makeProject();p.duration=2;p.assets=structuredClone(__IG.state.p.assets);for(const n of p.nodes){n.time.end=2;n.time.duration=2}return p};
  const author=p=>new AuthorEvaluator(p,new AssetStore(p));

  // F18: editable 3-pattern appearance cycle using ordinary authoring nodes/expressions.
  const p=project(),base=node('shape','Pattern source',null);base.data.shape='rectangle';base.data.params.width=12;base.data.params.height=8;base.data.paint=solid([1,.2,.2,1]);p.nodes.push(base);p.definitions.push(base.id);
  const rep=node('repeater','Pattern repeater');rep.data.template=base.id;rep.data.mode='linear';rep.data.count=rep.data.maxCount=6;rep.data.offset=[20,0];rep.data.rotationStep=0;rep.data.scaleStep=[1,1];addNode(p,rep);
  const cycleId=ensureAppearanceCycle(p,rep,3),cycle=p.nodes.find(n=>n.id===cycleId),variants=cycle.children.map(id=>p.nodes.find(n=>n.id===id));variants[0].transform.scale=[1,1];variants[1].transform.scale=[2,2];variants[2].transform.scale=[.5,.5];
  validateSource(p);const patterned=author(p).frame(.5).filter(x=>x.nodeId!==rep.id);ok(patterned.length===6,'F18 cycle did not emit one visible variant per copy: '+patterned.length);const scales=patterned.map(x=>Math.hypot(x.m[0],x.m[1])).sort((a,b)=>a-b);ok(scales.filter(x=>close(x,.5)).length===2&&scales.filter(x=>close(x,1)).length===2&&scales.filter(x=>close(x,2)).length===2,'F18 independent size pattern missing');

  // F19/F20: burst + continuous-capable particle model, deterministic seek, distributed/random launch and asset cycling.
  const q=project(),particle=node('particle','Particles');particle.data.rate=0;particle.data.bursts=[{time:0,count:4}];particle.data.life=constant(2);particle.data.scale=constant(.1);particle.data.rotation=constant(0);particle.data.spin=constant(0);particle.data.assets=['shardAsset','glowAsset'];particle.data.radialLaunch={angleStart:0,angleSpan:360,speed:constant(50),distribution:'distributed'};addNode(q,particle);validateSource(q);
  const qa=author(q),distributed=qa.frame(.5).filter(x=>x.nodeId===particle.id),again=qa.frame(.5).filter(x=>x.nodeId===particle.id);ok(distributed.length===4,'F19 burst count mismatch');ok(distributed[0].body!==distributed[1].body&&distributed[0].body===distributed[2].body,'F19 particle asset cycle mismatch');ok(JSON.stringify(distributed.map(x=>[x.m,x.z,x.alpha]))===JSON.stringify(again.map(x=>[x.m,x.z,x.alpha])),'F20 seek changed particle layout');const distributedXY=distributed.map(x=>[x.m[4],x.m[5]]);particle.data.radialLaunch.distribution='random';const randomXY=author(q).frame(.5).filter(x=>x.nodeId===particle.id).map(x=>[x.m[4],x.m[5]]);ok(JSON.stringify(distributedXY)!==JSON.stringify(randomXY),'F20 distribution mode had no effect');

  // F21: sequence frame order/timing is stable by asset IDs.
  const r=project(),clip=node('clip','Sequence');clip.data.assets=['shardAsset','glowAsset'];clip.data.times=[0,.5];clip.data.duration=1;addNode(r,clip);validateSource(r);const ra=author(r),frameA=ra.frame(.25).find(x=>x.nodeId===clip.id),frameB=ra.frame(.75).find(x=>x.nodeId===clip.id);ok(frameA&&frameB&&frameA.body!==frameB.body,'F21 sequence did not switch frames');

  // F22: one shared clip definition drives multiple directions; editing source propagates to every copy.
  const s=project(),shared=node('clip','Shared effect');shared.data.assets=['shardAsset'];shared.data.times=[0];shared.data.duration=1;addNode(s,shared);const fan=node('repeater','Effect fan');addNode(s,fan);configureLinkedEffect(s,shared,fan,{count:6,start:-150,span:300});validateSource(s);let fanLeaves=author(s).frame(.2);ok(fanLeaves.length===6,'F22 linked copies missing: '+fanLeaves.length);const directions=new Set(fanLeaves.map(x=>Math.round(Math.atan2(x.m[1],x.m[0])*180/Math.PI)));ok(directions.size===6,'F22 directions are not independent');shared.data.assets[0]='glowAsset';fanLeaves=author(s).frame(.2);ok(new Set(fanLeaves.map(x=>x.body)).size===1&&fanLeaves[0].body.includes('image'),'F22 source edit did not propagate');

  // F23: grouped shadow pass renders every shadow before every base.
  const t=project(),g=node('group','Effect group');g.data.passOrder=['shadow','base'];addNode(t,g);for(let i=0;i<2;i++){const sh=node('shape','Effect '+i);sh.data.shape='rectangle';sh.data.params.width=20;sh.data.params.height=10;sh.transform.position[0]=i*30;sh.effects=[{id:'shadow'+i,kind:'shadow',offset:[3,-3],sigma:2,spread:0,rgba:[0,0,0,.5],blend:'sourceOver',space:'local'}];addNode(t,sh,g.id)}validateSource(t);const ordered=author(t).frame(.2);ok(ordered.length===4,'F23 expected two shadows + two bases');const shadowPositions=ordered.map((x,i)=>x.pass==='shadow'?i:-1).filter(i=>i>=0);ok(shadowPositions.length===2&&Math.max(...shadowPositions)<2,'F23 shadows are not globally behind bases');
  return {F18:'pass',F19:'pass',F20:'pass',F21:'pass',F22:'pass',F23:'pass'};
 }));

 // UI route: a clip can now be created from the standard layer add control and compile successfully.
 await page.locator('#add-type').selectOption('clip');await page.locator('#add').click();await page.waitForFunction(()=>__IG.state.compiledRevision===__IG.state.revision,{timeout:90000});
 const type=await page.evaluate(()=>__IG.state.p.nodes.find(n=>n.id===__IG.state.id)?.type);if(type!=='clip')throw Error('clip add UI failed');
 console.log('PDF F18-F23 UI route: pass');
}finally{await browser.close()}
