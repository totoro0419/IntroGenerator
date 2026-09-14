import {chromium} from '@playwright/test';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1200,height:820}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:5173/IntroGenerator/');await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});

 // Create a text layer and add temporalEcho through the normal Effects UI.
 await page.locator('#add-type').selectOption('text');await page.locator('#add').click();await page.waitForFunction(()=>window.__IG.state.p.nodes.find(n=>n.id===window.__IG.state.id)?.type==='text');
 const textId=await page.evaluate(()=>window.__IG.state.id);
 const effects=page.locator('details.section').filter({has:page.locator('summary',{hasText:'Effects'})}).first();
 const effectType=effects.locator('select').last();await effectType.selectOption('temporalEcho');await effects.getByRole('button',{name:'＋ Effect'}).click();
 await page.waitForFunction(id=>window.__IG.state.p.nodes.find(n=>n.id===id)?.effects.some(e=>e.kind==='temporalEcho'),textId);
 const panel=page.locator('.full').filter({has:page.locator(':scope > h3',{hasText:'temporalEcho'})}).first();
 await page.waitForSelector('select[aria-label="残像の減衰"]');
 const duration=panel.locator('input[aria-label="長さ"]'),opacity=panel.locator('input[aria-label="不透明度"]'),softness=panel.locator('input[aria-label="柔らかさ"]');
 await duration.fill('0.8');await duration.press('Tab');await opacity.fill('0.7');await opacity.press('Tab');await softness.fill('2.5');await softness.press('Tab');
 const camera=panel.locator('label').filter({hasText:'Camera'}).locator('select');await camera.selectOption('current');
 const includeBase=panel.locator('label').filter({hasText:'本体を表示'}).locator('input[type="checkbox"]');if(!await includeBase.isChecked())await includeBase.check();
 await panel.getByRole('button',{name:'減衰カーブを作成'}).click();
 await page.waitForFunction(id=>{const e=window.__IG.state.p.nodes.find(n=>n.id===id)?.effects.find(e=>e.kind==='temporalEcho');return typeof e?.falloff==='string'&&window.__IG.state.p.tracks.some(t=>t.id===e.falloff)},textId);
 const falloffSelect=panel.locator('select[aria-label="残像の減衰"]');const falloffId=await falloffSelect.inputValue();if(!falloffId)throw Error('PDF-F13 falloff track was not assigned');
 await page.waitForSelector('input[aria-label="減衰強さ 2"]');const oldStrength=page.locator('input[aria-label="減衰強さ 2"]');await oldStrength.fill('0.35');await oldStrength.press('Tab');
 await page.waitForFunction(({id,falloff})=>{const p=window.__IG.state.p,e=p.nodes.find(n=>n.id===id)?.effects.find(e=>e.kind==='temporalEcho'),tr=p.tracks.find(t=>t.id===falloff);return e?.duration===.8&&e.opacity===.7&&e.softness===2.5&&e.camera==='current'&&e.includeBase===true&&tr?.keys.at(-1)?.value===.35},{id:textId,falloff:falloffId});
 await page.waitForFunction(()=>document.querySelector('#save-state')?.textContent==='保存済み',{timeout:15000});

 // Exact evaluator semantics: null uses linear decay, Track ID overrides it, base and duration remain independent.
 const semantics=await page.evaluate(async()=>{
  const {makeProject,node,addNode,animate,uid}=await import('/IntroGenerator/src/model.js');const {AuthorEvaluator}=await import('/IntroGenerator/src/author.js');const {AssetStore}=await import('/IntroGenerator/src/assets.js');
  const p=makeProject();p.duration=2;p.assets=structuredClone(window.__IG.state.p.assets);const n=node('text','PDF-F13');n.data.text='ECHO';n.data.runs[0].to=4;addNode(p,n);animate(p,n.transform.position,0,[[0,-80,'linear'],[2,80,'linear']]);
  const fx={id:uid(),kind:'temporalEcho',duration:.8,unit:'seconds',opacity:.8,softness:0,falloff:null,includeBase:true,camera:'current'};n.effects=[fx];
  const leaves=()=>new AuthorEvaluator(p,new AssetStore(p)).frame(1),echoes=xs=>xs.filter(x=>/\/echo\d+$/.test(x.key)).sort((a,b)=>Number(a.key.match(/echo(\d+)$/)[1])-Number(b.key.match(/echo(\d+)$/)[1]));
  const linear=echoes(leaves()).map(x=>x.alpha);const baseLinear=leaves().filter(x=>!x.key.includes('/echo')).length;
  const curveId=uid(),ease={kind:'stack',layers:[{id:uid(),enabled:true,weight:1,curve:{kind:'linear'}}]};p.tracks.push({id:curveId,unit:'alpha',default:.25,keys:[{id:uid(),time:0,value:.25,ease:structuredClone(ease)},{id:uid(),time:1,value:.25,ease:structuredClone(ease)}]});fx.falloff=curveId;
  const customLeaves=leaves(),custom=echoes(customLeaves).map(x=>x.alpha);
  fx.softness=3;const soft=echoes(leaves())[0]?.bounds;fx.softness=0;const sharp=echoes(leaves())[0]?.bounds;
  fx.includeBase=false;const noBase=leaves();fx.duration=0;const zeroHidden=leaves();fx.includeBase=true;const zeroBase=leaves();
  return {linear,custom,baseLinear,noBaseCount:noBase.filter(x=>!x.key.includes('/echo')).length,zeroHidden:zeroHidden.length,zeroBase:zeroBase.length,soft,sharp};
 });
 if(semantics.linear.length!==8||!(semantics.linear[0]>semantics.linear.at(-1)))throw Error('PDF-F13 null falloff is not linear decay: '+JSON.stringify(semantics.linear));
 if(semantics.custom.length!==8||!semantics.custom.every(a=>Math.abs(a-.2)<1e-8))throw Error('PDF-F13 falloff Track did not override decay: '+JSON.stringify(semantics.custom));
 if(semantics.baseLinear!==1||semantics.noBaseCount!==0)throw Error('PDF-F13 includeBase is not independent');
 if(semantics.zeroHidden!==0||semantics.zeroBase!==1)throw Error('PDF-F13 duration=0 semantics failed: '+JSON.stringify({hidden:semantics.zeroHidden,base:semantics.zeroBase}));
 const area=b=>b?.[2]*b?.[3];if(!(area(semantics.soft)>area(semantics.sharp)))throw Error('PDF-F13 softness did not expand blurred echo bounds');

 const roundtrip=await page.evaluate(async({id,falloff})=>{const s=window.__IG.state,compiled=await window.__IG.compile(structuredClone(s.p)),out=await window.__IG.exportSB3(compiled),back=await window.__IG.importSB3(out.bytes),n=back.source.nodes.find(n=>n.id===id),e=n.effects.find(e=>e.kind==='temporalEcho'),tr=back.source.tracks.find(t=>t.id===falloff);return{format:back.source.format,effect:e,track:tr&&{id:tr.id,values:tr.keys.map(k=>k.value)},commands:compiled.report.commands}}, {id:textId,falloff:falloffId});
 if(roundtrip.format!=='IGAUTHOR/1.4'||roundtrip.effect.falloff!==falloffId||roundtrip.effect.duration!==.8||roundtrip.effect.opacity!==.7||roundtrip.effect.softness!==2.5||roundtrip.effect.camera!=='current'||roundtrip.effect.includeBase!==true||roundtrip.track?.values.at(-1)!==.35)throw Error('PDF-F13 sb3 roundtrip lost controls: '+JSON.stringify(roundtrip));

 await page.reload();await page.waitForFunction(()=>window.__IG?.state?.compiled,{timeout:60000});const persisted=await page.evaluate(({id,falloff})=>{const p=window.__IG.state.p,e=p.nodes.find(n=>n.id===id)?.effects.find(e=>e.kind==='temporalEcho'),tr=p.tracks.find(t=>t.id===falloff);return e&&tr&&{duration:e.duration,opacity:e.opacity,softness:e.softness,falloff:e.falloff,includeBase:e.includeBase,camera:e.camera,last:tr.keys.at(-1).value}}, {id:textId,falloff:falloffId});
 if(!persisted||persisted.last!==.35||persisted.falloff!==falloffId)throw Error('PDF-F13 persistence lost falloff: '+JSON.stringify(persisted));
 if(errors.length)throw Error(errors.join('\n'));console.log({temporalEcho:'PDF-F13 pass',falloffId,semantics,roundtrip:{format:roundtrip.format,commands:roundtrip.commands,effect:roundtrip.effect,track:roundtrip.track},persisted});
}finally{await browser.close()}
