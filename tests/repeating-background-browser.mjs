import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});

 // Editor acceptance: the dedicated infinite-scroll entry creates a lattice whose two basis
 // vectors are directly editable without replacing the existing Repeater schema.
 await page.locator('#add-type').selectOption('scroll');
 await page.locator('#add').click();
 await page.waitForFunction(()=>{const s=window.__IG?.state,n=s?.p?.nodes.find(n=>n.id===s.id);return n?.type==='repeater'&&n.data.mode==='lattice'});
 await page.waitForSelector('[data-repeating-background-controls]');
 const repeaterId=await page.evaluate(()=>window.__IG.state.id);
 const templateId=await page.evaluate(id=>window.__IG.state.p.nodes.find(n=>n.id===id).data.template,repeaterId);

 const change=async(label,value,check)=>{const input=page.getByLabel(label,{exact:true});await input.fill(String(value));await input.press('Tab');await page.waitForFunction(check,{id:repeaterId,value})};
 await change('格子 X軸 X',72,({id,value})=>window.__IG.state.p.nodes.find(n=>n.id===id).data.basis[0][0]===value);
 await change('格子 X軸 Y',18,({id,value})=>window.__IG.state.p.nodes.find(n=>n.id===id).data.basis[0][1]===value);
 await change('格子 Y軸 X',-12,({id,value})=>window.__IG.state.p.nodes.find(n=>n.id===id).data.basis[1][0]===value);
 await change('格子 Y軸 Y',54,({id,value})=>window.__IG.state.p.nodes.find(n=>n.id===id).data.basis[1][1]===value);
 await page.locator('#undo').click();
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).data.basis[1][1]===50,repeaterId);
 await page.locator('#redo').click();
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).data.basis[1][1]===54,repeaterId);

 // Pattern appearance and lattice motion remain independent editor state.
 const beforePattern=await page.evaluate(id=>{const n=window.__IG.state.p.nodes.find(n=>n.id===id);return {basis:structuredClone(n.data.basis),scroll:JSON.stringify(n.data.scroll)}},repeaterId);
 await page.locator('#layers .name').filter({hasText:'Pattern source'}).first().click();
 const kind=page.locator('#inspector label').filter({hasText:'種類'}).locator('select').first();
 await kind.selectOption('circle');
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id)?.data.shape==='circle',templateId);
 const afterPattern=await page.evaluate(id=>{const n=window.__IG.state.p.nodes.find(n=>n.id===id);return {basis:structuredClone(n.data.basis),scroll:JSON.stringify(n.data.scroll)}},repeaterId);
 if(JSON.stringify(beforePattern)!==JSON.stringify(afterPattern))throw Error('PDF-F15 pattern edit changed spacing or scroll: '+JSON.stringify({beforePattern,afterPattern}));
 await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='保存済み',{timeout:15000});

 // Runtime semantics: a periodic lattice must cover the whole viewport while moving in both
 // lattice axes, including immediately around a wrap boundary.
 const semantics=await page.evaluate(async()=>{
  const {makeProject,node,addNode,expression,input,solid}=await import('/IntroGenerator/src/model.js');
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');
  const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const {inverse,point}=await import('/IntroGenerator/src/math.js');
  const p=makeProject();p.duration=3;p.assets=structuredClone(window.__IG.state.p.assets);
  const template=node('shape','PDF-F15 Tile',null);template.data.shape='rectangle';template.data.params.width=60;template.data.params.height=60;template.data.paint=solid([.2,.7,1,1]);p.nodes.push(template);p.definitions.push(template.id);
  const repeat=node('repeater','PDF-F15 Background');repeat.data.template=template.id;repeat.data.mode='lattice';repeat.data.maxCount=1024;repeat.data.basis=[[60,0],[0,60]];repeat.data.scroll=[expression(p,'mul',[input(p,'localTime'),.5]),expression(p,'mul',[input(p,'localTime'),.25])];repeat.space='screen';addNode(p,repeat);
  const evaluator=new AuthorEvaluator(p,new AssetStore(p));
  const covers=(leaves,x,y)=>leaves.some(leaf=>{const inv=inverse(leaf.m);if(!inv)return false;const q=point(inv,[x,y]),b=leaf.bounds,e=1e-6;return q[0]>=b[0]-e&&q[0]<=b[0]+b[2]+e&&q[1]>=b[1]-e&&q[1]<=b[1]+b[3]+e});
  const frames=[0,.5,1.99,2].map(time=>{const leaves=evaluator.frame(time);let covered=true;for(let y=-160;y<=160;y+=40)for(let x=-220;x<=220;x+=40)covered&&=covers(leaves,x,y);const first=leaves[0],norm=v=>((v%60)+60)%60;return {time,count:leaves.length,covered,offset:[norm(first.m[4]),norm(first.m[5])]}});
  const scrollBefore=JSON.stringify(repeat.data.scroll);template.data.shape='circle';template.data.params.width=44;template.data.params.height=44;const scrollAfter=JSON.stringify(repeat.data.scroll);
  const compiled=await window.__IG.compile(p),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),r=back.source.nodes.find(n=>n.id===repeat.id),t=back.source.nodes.find(n=>n.id===template.id);
  return {frames,scrollIndependent:scrollBefore===scrollAfter,roundtrip:{format:back.source.format,mode:r?.data.mode,basis:r?.data.basis,shape:t?.data.shape,commands:compiled.report.commands}};
 });
 if(semantics.frames.some(f=>!f.covered||f.count<20))throw Error('PDF-F15 lattice did not continuously cover viewport: '+JSON.stringify(semantics.frames));
 const diagonal=semantics.frames.find(f=>f.time===.5)?.offset;
 if(!diagonal||Math.abs(diagonal[0]-15)>1e-5||Math.abs(diagonal[1]-7.5)>1e-5)throw Error('PDF-F15 diagonal scroll did not move on both lattice axes: '+JSON.stringify(semantics.frames));
 if(!semantics.scrollIndependent)throw Error('PDF-F15 pattern and speed are not independent');
 if(semantics.roundtrip.mode!=='lattice'||JSON.stringify(semantics.roundtrip.basis)!==JSON.stringify([[60,0],[0,60]])||semantics.roundtrip.shape!=='circle'||semantics.roundtrip.commands<=0)throw Error('PDF-F15 sb3 roundtrip lost repeating-background settings: '+JSON.stringify(semantics.roundtrip));

 const editorRoundtrip=await page.evaluate(async id=>{const s=window.__IG.state,compiled=await window.__IG.compile(structuredClone(s.p)),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),r=back.source.nodes.find(n=>n.id===id);return {basis:r?.data.basis,mode:r?.data.mode}},repeaterId);
 if(editorRoundtrip.mode!=='lattice'||JSON.stringify(editorRoundtrip.basis)!==JSON.stringify([[72,18],[-12,54]]))throw Error('PDF-F15 editor settings were lost in sb3: '+JSON.stringify(editorRoundtrip));

 await page.reload();
 await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});
 const persisted=await page.evaluate(id=>window.__IG.state.p.nodes.find(n=>n.id===id)?.data.basis,repeaterId);
 if(JSON.stringify(persisted)!==JSON.stringify([[72,18],[-12,54]]))throw Error('PDF-F15 persistence lost lattice basis: '+JSON.stringify(persisted));
 if(errors.length)throw Error(errors.join('\n'));
 console.log({repeatingBackground:'PDF-F15 pass',semantics,editorRoundtrip,persisted});
}finally{
 await browser.close();
}
