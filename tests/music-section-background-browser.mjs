import {chromium} from '@playwright/test';

const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');
 await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});

 // Build the F17 case through the Editor: a Scene owns a continuously scrolling background.
 await page.locator('#add-type').selectOption('composition');
 await page.locator('#add').click();
 await page.waitForFunction(()=>window.__IG.state.p.nodes.find(n=>n.id===window.__IG.state.id)?.type==='composition');
 const sceneId=await page.evaluate(()=>window.__IG.state.id);
 await page.locator('#add-type').selectOption('scroll');
 await page.locator('#add').click();
 await page.waitForFunction(sceneId=>{const s=window.__IG.state,n=s.p.nodes.find(x=>x.id===s.id);return n?.type==='repeater'&&n.parent===sceneId&&n.data.mode==='lattice'},sceneId,{timeout:30000});
 await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:90000});
 const repeaterId=await page.evaluate(()=>window.__IG.state.id);

 const inspect=()=>page.evaluate(({sceneId,repeaterId})=>{
  const p=window.__IG.state.p,n=p.nodes.find(x=>x.id===repeaterId),scene=p.nodes.find(x=>x.id===sceneId),ex=new Map(p.expressions.map(e=>[e.id,e]));
  const findTrack=v=>{const e=ex.get(v?.expr);if(!e)return null;if(e.op==='track')return e;for(const a of e.args||[]){const hit=findTrack(a);if(hit)return hit}return null};
  const te=findTrack(n.data.scroll[0]),tr=te&&p.tracks.find(t=>t.id===te.track),anchors=tr?p.timeAnchors.filter(a=>a.target==='keyframe'&&a.owner===tr.id).sort((a,b)=>a.value-b.value):[];
  return {sceneStart:scene.time.start,scroll:structuredClone(n.data.scroll[0]),outer:ex.get(n.data.scroll[0]?.expr)?.op,trackId:tr?.id,keys:tr?.keys.map(k=>({id:k.id,time:k.time,value:k.value,ease:k.ease.kind})),anchors:anchors.map(a=>({key:a.key,unit:a.unit,value:a.value}))};
 },{sceneId,repeaterId});

 // Turning the existing localTime*baseSpeed expression into a Keyframe stack must preserve
 // the base expression and create a zero-valued additive correction track.
 await page.getByRole('button',{name:'スクロール Xのキーフレーム'}).click();
 await page.waitForSelector('#keys');
 let state=await inspect();
 if(state.outer!=='add'||state.keys?.length!==2||state.keys.some(k=>Math.abs(k.value)>1e-12))throw Error('PDF-F17 did not preserve the base flow as an additive track: '+JSON.stringify(state));
 await page.locator('#dialog-close').click();

 // Regression for F17: a newly inserted key on an additive animation stores the additive
 // track value, not the already-combined base+track value. Otherwise the base flow doubles.
 await page.evaluate(()=>window.__IG.state.t=2);
 await page.getByRole('button',{name:'スクロール Xのキーフレーム'}).click();
 await page.locator('#new-key').click();
 state=await inspect();
 const inserted=state.keys.find(k=>Math.abs(k.time-2)<1e-8);
 if(!inserted||Math.abs(inserted.value)>1e-12)throw Error('PDF-F17 new key absorbed the base scroll instead of the additive delta: '+JSON.stringify(state));

 // Configure three music-section points through the existing Keyframe UI.
 const setUnit=async(i,unit)=>{await page.getByLabel('時間単位').nth(i).selectOption(unit)};
 const setPosition=async(i,v)=>{const el=page.getByLabel('Key位置').nth(i);await el.fill(String(v));await el.press('Tab')};
 const setValue=async(i,v)=>{const el=page.getByLabel('Key値').nth(i);await el.fill(String(v));await el.press('Tab')};
 const setEase=async(i,v)=>{await page.getByLabel('Easing',{exact:true}).nth(i).selectOption(v)};
 for(let i=0;i<3;i++)await setUnit(i,'beats');
 await setPosition(0,0);await setPosition(1,2);await setPosition(2,4);
 await setValue(0,0);await setValue(1,.35);await setValue(2,-.15);
 await setEase(0,'quadIn');await setEase(1,'powerInOut');
 await page.locator('#dialog-close').click();
 await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision&&document.querySelector('#save-state')?.textContent==='保存済み',undefined,{timeout:90000});
 state=await inspect();
 if(JSON.stringify(state.anchors.map(a=>[a.unit,a.value]))!==JSON.stringify([['beats',0],['beats',2],['beats',4]]))throw Error('PDF-F17 beat anchors were not stored: '+JSON.stringify(state));
 if(JSON.stringify(state.keys.map(k=>k.time))!==JSON.stringify([0,1,2]))throw Error('PDF-F17 120 BPM key positions are wrong: '+JSON.stringify(state));
 if(state.keys[0].ease!=='quadIn'||state.keys[1].ease!=='powerInOut')throw Error('PDF-F17 easing was not retained: '+JSON.stringify(state));

 // BPM changes move beat-fixed section boundaries while preserving their values/easing.
 await page.locator('#project-settings').click();
 const bpm=page.getByLabel('BPM');await bpm.fill('60');await bpm.press('Tab');
 await page.locator('#dialog-close').click();
 await page.waitForFunction(()=>window.__IG.state.p.tempo[0].bpm===60&&window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:90000});
 state=await inspect();
 if(JSON.stringify(state.keys.map(k=>k.time))!==JSON.stringify([0,2,4]))throw Error('PDF-F17 beat-fixed sections did not follow BPM: '+JSON.stringify(state));
 if(JSON.stringify(state.keys.map(k=>k.value))!==JSON.stringify([0,.35,-.15]))throw Error('PDF-F17 BPM change altered section deltas: '+JSON.stringify(state));

 const sample=async(start)=>page.evaluate(async({sceneId,repeaterId,start})=>{
  const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const p=window.__IG.state.p,n=p.nodes.find(x=>x.id===repeaterId),ev=new AuthorEvaluator(p,new AssetStore(p));
  const values=[.5,1,2,3,4,4.5].map(local=>{const c=ev.contextAt(repeaterId,start+local)?.c;return c?ev.value(n.data.scroll[0],c):null});
  return values;
 },{sceneId,repeaterId,start});
 const beforeMove=await sample(0);
 if(beforeMove.some(v=>v===null))throw Error('PDF-F17 background became inactive inside the Scene: '+JSON.stringify(beforeMove));
 // quadIn at the middle of the first section must differ from a linear section; the final
 // half-second must still advance at exactly the base 0.25 units/s after the added track ends.
 if(Math.abs(beforeMove[1]-(.25+.35*.25))>1e-6)throw Error('PDF-F17 easing did not shape the added section: '+JSON.stringify(beforeMove));
 if(Math.abs((beforeMove[5]-beforeMove[4])-.125)>1e-6)throw Error('PDF-F17 base flow did not continue after the section animation: '+JSON.stringify(beforeMove));
 const rateA=beforeMove[2]-beforeMove[0],rateB=beforeMove[4]-beforeMove[2];
 if(Math.abs(rateA-rateB)<.05)throw Error('PDF-F17 section speeds did not differ: '+JSON.stringify({beforeMove,rateA,rateB}));

 // Moving the Scene must move the whole timing envelope without rewriting internal keys.
 await page.locator('#layers .name').filter({hasText:'Scene'}).first().click();
 const startInput=page.getByLabel('開始 秒',{exact:true});await startInput.fill('1.25');await startInput.press('Tab');
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).time.start===1.25,sceneId);
 await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:90000});
 const afterMove=await sample(1.25);
 if(afterMove.some((v,i)=>Math.abs(v-beforeMove[i])>1e-8))throw Error('PDF-F17 Scene move changed internal speed sections: '+JSON.stringify({beforeMove,afterMove}));
 state=await inspect();if(JSON.stringify(state.keys.map(k=>k.time))!==JSON.stringify([0,2,4]))throw Error('PDF-F17 Scene move rewrote local key times: '+JSON.stringify(state));
 await page.locator('#undo').click();await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).time.start===0,sceneId);await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:90000});
 await page.locator('#redo').click();await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id).time.start===1.25,sceneId);await page.waitForFunction(()=>window.__IG.state.compiledRevision===window.__IG.state.revision,undefined,{timeout:90000});

 const roundtrip=await page.evaluate(async({sceneId,repeaterId})=>{
  const p=structuredClone(window.__IG.state.p),compiled=await window.__IG.compile(p),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),scene=back.source.nodes.find(n=>n.id===sceneId),r=back.source.nodes.find(n=>n.id===repeaterId),ex=new Map(back.source.expressions.map(e=>[e.id,e]));
  const findTrack=v=>{const e=ex.get(v?.expr);if(!e)return null;if(e.op==='track')return e;for(const a of e.args||[]){const hit=findTrack(a);if(hit)return hit}return null};const te=findTrack(r.data.scroll[0]),tr=back.source.tracks.find(t=>t.id===te?.track),anchors=back.source.timeAnchors.filter(a=>a.owner===tr?.id).sort((a,b)=>a.value-b.value);
  return {format:back.source.format,commands:compiled.report.commands,sceneStart:scene?.time.start,scroll:JSON.stringify(r?.data.scroll[0]),keys:tr?.keys.map(k=>[k.time,k.value,k.ease.kind]),anchors:anchors.map(a=>[a.unit,a.value])};
 },{sceneId,repeaterId});
 if(roundtrip.format!=='IGAUTHOR/1.4'||roundtrip.commands<=0||roundtrip.sceneStart!==1.25||JSON.stringify(roundtrip.keys)!==JSON.stringify([[0,0,'quadIn'],[2,.35,'powerInOut'],[4,-.15,'linear']])||JSON.stringify(roundtrip.anchors)!==JSON.stringify([['beats',0],['beats',2],['beats',4]]))throw Error('PDF-F17 sb3 roundtrip lost music-section timing: '+JSON.stringify(roundtrip));

 await page.reload();await page.waitForFunction(()=>window.__IG?.state?.compiled,undefined,{timeout:60000});
 const persisted=await inspect();
 if(persisted.sceneStart!==1.25||JSON.stringify(persisted.keys?.map(k=>[k.time,k.value,k.ease]))!==JSON.stringify([[0,0,'quadIn'],[2,.35,'powerInOut'],[4,-.15,'linear']]))throw Error('PDF-F17 persistence failed: '+JSON.stringify(persisted));
 if(errors.length)throw Error(errors.join('\n'));
 console.log({musicSectionBackground:'PDF-F17 pass',beforeMove,afterMove,roundtrip,persisted});
}finally{
 await browser.close();
}
