import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});

 // Build the PDF-F17 authoring case through the real Editor.
 await page.locator('#add-type').selectOption('composition');
 await page.locator('#add').click();
 await page.waitForFunction(()=>window.__IG.state.p.nodes.find(n=>n.id===window.__IG.state.id)?.type==='composition');
 const sceneId=await page.evaluate(()=>window.__IG.state.id);
 // F17 is a timing/flow acceptance, not an isolated-compositing stress test.
 await page.getByLabel('透明度の適用').selectOption('inherit');
 await page.locator('#add-type').selectOption('scroll');
 await page.locator('#add').click();
 await page.waitForFunction(sceneId=>{const s=window.__IG.state,n=s.p.nodes.find(x=>x.id===s.id);return n?.type==='repeater'&&n.parent===sceneId&&n.data.mode==='lattice'},sceneId,{timeout:30000});
 const repeaterId=await page.evaluate(()=>window.__IG.state.id);

 const inspect=()=>page.evaluate(({sceneId,repeaterId})=>{
  const p=window.__IG.state.p,n=p.nodes.find(x=>x.id===repeaterId),scene=p.nodes.find(x=>x.id===sceneId),ex=new Map(p.expressions.map(e=>[e.id,e]));
  const findTrack=v=>{const e=ex.get(v?.expr);if(!e)return null;if(e.op==='track')return e;for(const a of e.args||[]){const hit=findTrack(a);if(hit)return hit}return null};
  const te=findTrack(n.data.scroll[0]),tr=te&&p.tracks.find(t=>t.id===te.track),anchors=tr?p.timeAnchors.filter(a=>a.target==='keyframe'&&a.owner===tr.id).sort((a,b)=>a.value-b.value):[];
  const easeKind=k=>k.ease?.kind==='stack'?k.ease.layers?.[0]?.curve?.kind:k.ease?.kind;
  return {sceneStart:scene.time.start,sceneOpacityMode:scene.opacityMode,outer:ex.get(n.data.scroll[0]?.expr)?.op,trackId:tr?.id,keys:tr?.keys.map(k=>({id:k.id,time:k.time,value:k.value,ease:easeKind(k)})),anchors:anchors.map(a=>({key:a.key,unit:a.unit,value:a.value}))};
 },{sceneId,repeaterId});

 // Keyframing an already-moving background must preserve localTime*baseSpeed and layer a zero delta Track.
 await page.getByRole('button',{name:'スクロール Xのキーフレーム'}).click();
 await page.waitForSelector('#keys');
 let state=await inspect();
 if(state.outer!=='add'||state.keys?.length!==2||state.keys.some(k=>Math.abs(k.value)>1e-12))throw Error('PDF-F17 did not preserve the base flow as an additive track: '+JSON.stringify(state));
 await page.locator('#dialog-close').click();

 // Regression: adding a Key at a non-zero base-flow time must store the Track delta, not base+delta.
 await page.evaluate(()=>window.__IG.state.t=2);
 await page.getByRole('button',{name:'スクロール Xのキーフレーム'}).click();
 await page.waitForSelector('#new-key');
 await page.locator('#new-key').click();
 await page.waitForFunction(()=>document.querySelectorAll('#keys input[aria-label="Key値"]').length===3,{timeout:10000});
 state=await inspect();
 const inserted=state.keys.find(k=>Math.abs(k.time-2)<1e-8);
 if(!inserted||Math.abs(inserted.value)>1e-12)throw Error('PDF-F17 new key absorbed the base scroll instead of the additive delta: '+JSON.stringify(state));

 // Three beat-fixed points define two different music sections while the .25/s base flow remains underneath.
 const keyRows=()=>page.locator('#keys > tr').filter({has:page.locator('select[aria-label="時間単位"]')});
 for(let i=0;i<3;i++)await keyRows().nth(i).locator('select[aria-label="時間単位"]').selectOption('beats');
 const setNumber=async(i,label,value)=>{const input=keyRows().nth(i).locator(`input[aria-label="${label}"]`);await input.fill(String(value));await input.press('Tab')};
 await setNumber(0,'Key位置',0);await setNumber(1,'Key位置',2);await setNumber(2,'Key位置',4);
 await setNumber(0,'Key値',0);await setNumber(1,'Key値',.35);await setNumber(2,'Key値',-.15);
 await page.waitForFunction(()=>document.querySelectorAll('.easing-stack-editor').length>=3,{timeout:10000});
 const firstLayer=page.locator('.easing-stack-editor').nth(0).locator('.easing-layer').first();
 await firstLayer.locator('select[aria-label$="Easing種類"]').selectOption('quad');
 await firstLayer.locator('select[aria-label$="Easing方向"]').selectOption('In');
 await page.waitForFunction(()=>window.__IG.state.p.tracks.some(t=>t.keys.some(k=>k.ease?.layers?.[0]?.curve?.kind==='quadIn')),{timeout:10000});
 await page.locator('#dialog-close').click();
 state=await inspect();
 if(JSON.stringify(state.anchors.map(a=>[a.unit,a.value]))!==JSON.stringify([['beats',0],['beats',2],['beats',4]]))throw Error('PDF-F17 beat anchors were not stored: '+JSON.stringify(state));
 if(JSON.stringify(state.keys.map(k=>k.time))!==JSON.stringify([0,1,2]))throw Error('PDF-F17 120 BPM key positions are wrong: '+JSON.stringify(state));
 if(state.keys[0].ease!=='quadIn')throw Error('PDF-F17 acceleration was not retained: '+JSON.stringify(state));

 // BPM changes must move beat-fixed boundaries without changing section values/easing.
 await page.locator('#project-settings').click();
 await page.waitForSelector('#timing-project-panel');
 const bpm=page.getByLabel('Tempo 1 BPM');await bpm.fill('60');await bpm.dispatchEvent('change');
 await page.waitForFunction(()=>window.__IG.state.p.tempo[0].bpm===60,{timeout:10000});
 await page.locator('#dialog-close').click();
 state=await inspect();
 if(JSON.stringify(state.keys.map(k=>k.time))!==JSON.stringify([0,2,4]))throw Error('PDF-F17 beat-fixed sections did not follow BPM: '+JSON.stringify(state));
 if(JSON.stringify(state.keys.map(k=>k.value))!==JSON.stringify([0,.35,-.15]))throw Error('PDF-F17 BPM change altered section deltas: '+JSON.stringify(state));

 const sample=async(start)=>page.evaluate(async({repeaterId,start})=>{
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const p=window.__IG.state.p,n=p.nodes.find(x=>x.id===repeaterId),ev=new AuthorEvaluator(p,new AssetStore(p));
  return [.5,1,2,3,4,4.5].map(local=>{const c=ev.contextAt(repeaterId,start+local)?.c;return c?ev.value(n.data.scroll[0],c):null});
 },{repeaterId,start});
 const beforeMove=await sample(0);
 if(beforeMove.some(v=>v===null))throw Error('PDF-F17 background became inactive inside the Scene: '+JSON.stringify(beforeMove));
 if(Math.abs(beforeMove[1]-(.25+.35*.25))>1e-6)throw Error('PDF-F17 easing did not shape the added section: '+JSON.stringify(beforeMove));
 if(Math.abs((beforeMove[5]-beforeMove[4])-.125)>1e-6)throw Error('PDF-F17 base flow did not continue after section animation: '+JSON.stringify(beforeMove));
 const rateA=beforeMove[2]-beforeMove[0],rateB=beforeMove[4]-beforeMove[2];
 if(Math.abs(rateA-rateB)<.05)throw Error('PDF-F17 section speeds did not differ: '+JSON.stringify({beforeMove,rateA,rateB}));

 // Moving the Scene shifts the envelope as a whole; internal local Key times remain unchanged.
 await page.locator('#layers').getByRole('button',{name:'Scene',exact:true}).click();
 await page.waitForSelector('.timing-node-anchor');
 const startInput=page.getByLabel('開始',{exact:true});await startInput.fill('1.25');await startInput.dispatchEvent('change');
 await page.waitForFunction(id=>Math.abs(window.__IG.state.p.nodes.find(n=>n.id===id).time.start-1.25)<1e-9,sceneId,{timeout:10000});
 const afterMove=await sample(1.25);
 if(afterMove.some((v,i)=>Math.abs(v-beforeMove[i])>1e-8))throw Error('PDF-F17 Scene move changed internal speed sections: '+JSON.stringify({beforeMove,afterMove}));
 state=await inspect();if(JSON.stringify(state.keys.map(k=>k.time))!==JSON.stringify([0,2,4]))throw Error('PDF-F17 Scene move rewrote local key times: '+JSON.stringify(state));
 const historyBeforeUndo=await page.evaluate(sceneId=>{const s=window.__IG.state,start=p=>p?.nodes.find(n=>n.id===sceneId)?.time.start;return{current:start(s.p),undoCount:s.undo.length,redoCount:s.redo.length,undoTop:start(s.undo.at(-1)),undoPrev:start(s.undo.at(-2))}},sceneId);
 if(historyBeforeUndo.undoTop!==0)throw Error('PDF-F17 Scene move did not create the expected Undo snapshot: '+JSON.stringify(historyBeforeUndo));
 await page.locator('#undo').click();await page.waitForTimeout(100);
 const historyAfterUndo=await page.evaluate(sceneId=>{const s=window.__IG.state,start=p=>p?.nodes.find(n=>n.id===sceneId)?.time.start;return{current:start(s.p),undoCount:s.undo.length,redoCount:s.redo.length,undoTop:start(s.undo.at(-1)),redoTop:start(s.redo.at(-1))}},sceneId);
 if(historyAfterUndo.current!==0)throw Error('PDF-F17 Undo did not restore the Scene start: '+JSON.stringify({historyBeforeUndo,historyAfterUndo}));
 await page.locator('#redo').click();await page.waitForTimeout(100);
 const historyAfterRedo=await page.evaluate(sceneId=>{const s=window.__IG.state,start=p=>p?.nodes.find(n=>n.id===sceneId)?.time.start;return{current:start(s.p),undoCount:s.undo.length,redoCount:s.redo.length,undoTop:start(s.undo.at(-1)),redoTop:start(s.redo.at(-1))}},sceneId);
 if(Math.abs(historyAfterRedo.current-1.25)>1e-9)throw Error('PDF-F17 Redo did not restore the Scene move: '+JSON.stringify({historyBeforeUndo,historyAfterUndo,historyAfterRedo}));
 await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision&&document.querySelector('#save-state')?.textContent==='保存済み',undefined,{timeout:90000});

 const roundtrip=await page.evaluate(async({sceneId,repeaterId})=>{
  const p=structuredClone(window.__IG.state.p),compiled=await window.__IG.compile(p),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),scene=back.source.nodes.find(n=>n.id===sceneId),r=back.source.nodes.find(n=>n.id===repeaterId),ex=new Map(back.source.expressions.map(e=>[e.id,e]));
  const findTrack=v=>{const e=ex.get(v?.expr);if(!e)return null;if(e.op==='track')return e;for(const a of e.args||[]){const hit=findTrack(a);if(hit)return hit}return null};const te=findTrack(r.data.scroll[0]),tr=back.source.tracks.find(t=>t.id===te?.track),anchors=back.source.timeAnchors.filter(a=>a.owner===tr?.id).sort((a,b)=>a.value-b.value),ease=k=>k.ease?.kind==='stack'?k.ease.layers?.[0]?.curve?.kind:k.ease?.kind;
  return {format:back.source.format,commands:compiled.report.commands,sceneStart:scene?.time.start,keys:tr?.keys.map(k=>[k.time,k.value,ease(k)]),anchors:anchors.map(a=>[a.unit,a.value])};
 },{sceneId,repeaterId});
 if(roundtrip.format!=='IGAUTHOR/1.4'||roundtrip.commands<=0||roundtrip.sceneStart!==1.25||JSON.stringify(roundtrip.keys)!==JSON.stringify([[0,0,'quadIn'],[2,.35,'linear'],[4,-.15,'linear']])||JSON.stringify(roundtrip.anchors)!==JSON.stringify([['beats',0],['beats',2],['beats',4]]))throw Error('PDF-F17 sb3 roundtrip lost music-section timing: '+JSON.stringify(roundtrip));

 await page.reload();await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});
 const persisted=await inspect();
 if(persisted.sceneStart!==1.25||JSON.stringify(persisted.keys?.map(k=>[k.time,k.value,k.ease]))!==JSON.stringify([[0,0,'quadIn'],[2,.35,'linear'],[4,-.15,'linear']]))throw Error('PDF-F17 persistence failed: '+JSON.stringify(persisted));
 if(errors.length)throw Error(errors.join('\n'));
 console.log({musicSectionBackground:'PDF-F17 pass',beforeMove,afterMove,roundtrip,persisted});
}finally{
 await browser.close();
}
