import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});

 // PDF-F12 must be possible through normal Editor operations: whole-text scale animation + per-character stagger.
 await page.locator('#add-type').selectOption('text');
 await page.locator('#add').click();
 await page.waitForFunction(()=>{const s=window.__IG.state,n=s.p.nodes.find(n=>n.id===s.id);return n?.type==='text'&&n.data.animators.length===0});
 const textId=await page.evaluate(()=>window.__IG.state.id);
 const textSection=page.locator('details.section').filter({has:page.locator('summary',{hasText:'テキスト'})}).first();
 await textSection.getByRole('button',{name:'＋ 文字ごとに登場'}).click();
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id)?.data.animators.length===1,textId);
 const animationSection=page.locator('details.section').filter({hasText:/^Animation/}).first();
 await animationSection.locator('select').selectOption('zoom');
 await animationSection.getByRole('button',{name:'追加'}).click();
 await page.waitForFunction(id=>{const n=window.__IG.state.p.nodes.find(n=>n.id===id);return n&&typeof n.transform.scale[0]==='object'&&typeof n.transform.scale[1]==='object'},textId);
 const animatorSection=page.locator('details.section').filter({has:page.locator('summary',{hasText:'文字Animation 1'})}).first();
 const delay=animatorSection.locator('input[aria-label="時間差 秒"]');
 await delay.fill('0.12');await delay.press('Tab');
 await page.waitForFunction(id=>Math.abs(window.__IG.state.p.nodes.find(n=>n.id===id).data.animators[0].delay-.12)<1e-9,textId);
 await page.locator('#undo').click();
 await page.waitForFunction(id=>Math.abs(window.__IG.state.p.nodes.find(n=>n.id===id).data.animators[0].delay-.05)<1e-9,textId);
 await page.locator('#redo').click();
 await page.waitForFunction(id=>Math.abs(window.__IG.state.p.nodes.find(n=>n.id===id).data.animators[0].delay-.12)<1e-9,textId);
 await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='保存済み',{timeout:15000});

 const uiRoundtrip=await page.evaluate(async id=>{
  const s=window.__IG.state,n=s.p.nodes.find(n=>n.id===id),compiled=await window.__IG.compile(structuredClone(s.p)),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),r=back.source.nodes.find(n=>n.id===id);
  return {commands:compiled.report.commands,delay:r?.data.animators[0]?.delay,scale:r?.transform.scale,animators:r?.data.animators.length,format:back.source.format};
 },textId);
 if(uiRoundtrip.commands<=0||uiRoundtrip.animators!==1||Math.abs(uiRoundtrip.delay-.12)>1e-9||!uiRoundtrip.scale?.every(v=>typeof v==='object'&&typeof v.expr==='string'))throw Error('PDF-F12 sb3 roundtrip lost whole-text/stagger animation: '+JSON.stringify(uiRoundtrip));

 // Mathematical acceptance: text-wide scale changes inter-glyph placement while stagger changes only internal timing.
 const semantics=await page.evaluate(async()=>{
  const {makeProject,node,addNode,animate,uid}=await import('/IntroGenerator/src/model.js');
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');
  const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const p=makeProject();p.duration=2;p.assets=structuredClone(window.__IG.state.p.assets);const n=node('text','PDF-F12');n.data.text='ABC';n.data.runs[0].to=3;n.data.tracking=4;addNode(p,n);
  animate(p,n.transform.scale,0,[[0,1,'linear'],[1,2,'linear']]);animate(p,n.transform.scale,1,[[0,1,'linear'],[1,2,'linear']]);
  const a={id:uid(),selector:{id:uid(),unit:'grapheme',from:0,to:3,countWhitespace:true,order:'logical',clusterPolicy:'preserve'},transform:{position:[0,0,0],scale:[1,1],anchor:[0,0],rotation:0},opacity:1,delay:.15,phase:0,randomDelay:0,seed:1};animate(p,a,'opacity',[[0,0,'linear'],[.2,1,'linear']]);n.data.animators=[a];
  const ev=new AuthorEvaluator(p,new AssetStore(p)),leaves=t=>ev.frame(t).filter(x=>x.nodeId===n.id).sort((x,y)=>x.m[4]-y.m[4]);
  const f0=leaves(0),f1=leaves(1),stagger=leaves(.1).map(x=>x.alpha),all=leaves(.5).map(x=>x.alpha);
  const d0=f0.at(-1).m[4]-f0[0].m[4],d1=f1.at(-1).m[4]-f1[0].m[4];
  a.delay=.3;const changed=leaves(.5).map(x=>x.alpha);
  return {d0,d1,stagger,all,changed};
 });
 const close=(a,b,e=1e-4)=>Math.abs(a-b)<=e;
 if(!close(semantics.d1,semantics.d0*2))throw Error('PDF-F12 whole-text scale did not preserve/scale relative glyph placement: '+JSON.stringify(semantics));
 if(!(Math.max(...semantics.stagger)>0&&semantics.stagger.some(a=>a===0)))throw Error('PDF-F12 character stagger is not time-separated: '+JSON.stringify(semantics.stagger));
 if(!semantics.all.every(a=>a>.99))throw Error('PDF-F12 stagger did not complete independently: '+JSON.stringify(semantics.all));
 if(!semantics.changed.some(a=>a===0))throw Error('PDF-F12 delay edit did not change internal timing: '+JSON.stringify(semantics.changed));

 await page.reload();await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 const persisted=await page.evaluate(id=>{const n=window.__IG.state.p.nodes.find(n=>n.id===id);return n&&{delay:n.data.animators[0]?.delay,scale:n.transform.scale}},textId);
 if(!persisted||Math.abs(persisted.delay-.12)>1e-9||!persisted.scale.every(v=>typeof v==='object'))throw Error('PDF-F12 persistence lost animation settings: '+JSON.stringify(persisted));
 if(errors.length)throw Error(errors.join('\n'));
 console.log({textAnimation:'PDF-F12 pass',uiRoundtrip,semantics,persisted});
}finally{await browser.close()}
