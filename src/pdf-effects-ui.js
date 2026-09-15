import {node,uid,input,expression} from './model.js';
import {validateSource} from './compiler.js';

const $=s=>document.querySelector(s);
const state=()=>window.__IG?.state;
const imageAssets=p=>p.assets.filter(a=>a.kind==='image');

async function persist(project){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('IntroGenerator',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 db.close();
}

function refresh(){
 document.querySelector('[data-pdf-effects-controls]')?.remove();
 const selected=$('#layers .layer.selected .name');
 if(selected)selected.click();
 else augment();
}

async function commit(mutator,{undoBase=null}={}){
 const S=state();if(!S?.p)return;
 const before=structuredClone(S.p);
 try{
  mutator();validateSource(S.p);
  if(undoBase&&S.undo.length)S.undo.pop();
  S.undo.push(undoBase||before);if(S.undo.length>40)S.undo.shift();S.redo=[];S.revision++;
  const saved=$('#save-state');if(saved)saved.textContent='保存中';
  await persist(S.p);if(saved)saved.textContent='保存済み';
  await window.__IG.rebuild();refresh();
 }catch(error){S.p=before;const status=$('#status');if(status){status.textContent=error.message;status.style.background='#843d32'}throw error}
}

function details(host,title){const d=document.createElement('details');d.className='section';d.open=true;d.innerHTML=`<summary>${title}</summary><div class="fields"></div>`;host.append(d);return d.querySelector('.fields')}
function optionSelect(values,current,onchange,label){const l=document.createElement('label');l.textContent=label;const s=document.createElement('select');for(const [value,title] of values){const o=document.createElement('option');o.value=value;o.textContent=title;s.append(o)}s.value=current??'';s.onchange=()=>onchange(s.value);l.append(s);return l}
function numberInput(value,onchange,label,step='.1'){const l=document.createElement('label');l.textContent=label;const i=document.createElement('input');i.type='number';i.step=step;i.value=Number(value??0);i.onchange=()=>{const v=Number(i.value);if(Number.isFinite(v))onchange(v)};l.append(i);return l}
function action(label,onclick){const b=document.createElement('button');b.className='mini';b.textContent=label;b.onclick=onclick;return b}

function cloneDefinition(p,sourceId,name){
 const root=p.nodes.find(n=>n.id===sourceId);if(!root)throw Error('原型が見つかりません');
 const todo=[root],all=[];while(todo.length){const n=todo.shift();all.push(n);for(const id of n.children){const c=p.nodes.find(x=>x.id===id);if(c)todo.push(c)}}
 const map=new Map(all.map(n=>[n.id,uid()]));
 for(const src of all){const c=structuredClone(src);c.id=map.get(src.id);c.name=src===root?name:src.name;c.parent=src===root?null:map.get(src.parent);c.children=c.children.map(id=>map.get(id));for(const key of ['template','definition','path','emitter','source'])if(map.has(c.data?.[key]))c.data[key]=map.get(c.data[key]);p.nodes.push(c)}
 const id=map.get(sourceId);p.definitions.push(id);return id;
}
function childInstances(p,cycle){return cycle.children.map(id=>p.nodes.find(n=>n.id===id)).filter(n=>n?.type==='instance')}
function cycleFor(p,repeater){const c=p.nodes.find(n=>n.id===repeater.data.template);return c?.type==='group'&&c.name===`Appearance Cycle:${repeater.id}`?c:null}
function setGate(p,instance,index,count){const idx=input(p,'index'),mod=expression(p,'modp',[idx,count]);instance.opacity=expression(p,'eq',[mod,index])}

export function ensureAppearanceCycle(p,repeater,count=2){
 count=Math.max(2,Math.min(8,Math.floor(count)));
 let cycle=cycleFor(p,repeater);
 if(!cycle){
  const sourceId=repeater.data.template;if(!sourceId)throw Error('先に「原型」を選択してください');
  cycle=node('group',`Appearance Cycle:${repeater.id}`,null);cycle.time.end=p.duration;cycle.time.duration=p.duration;p.nodes.push(cycle);p.definitions.push(cycle.id);
  repeater.data.template=cycle.id;
  for(let i=0;i<count;i++){const def=cloneDefinition(p,sourceId,`Pattern ${i+1}`),inst=node('instance',`Pattern ${i+1}`,cycle.id);inst.time.end=p.duration;inst.time.duration=p.duration;inst.data.definition=def;inst.effects=[{id:uid(),kind:'color',hue:0,brightness:0}];setGate(p,inst,i,count);p.nodes.push(inst);cycle.children.push(inst.id)}
 }else{
  let list=childInstances(p,cycle);const seed=list[0]?.data.definition;
  while(list.length<count){if(!seed)throw Error('見た目パターンの原型がありません');const i=list.length,def=cloneDefinition(p,seed,`Pattern ${i+1}`),inst=node('instance',`Pattern ${i+1}`,cycle.id);inst.time.end=p.duration;inst.time.duration=p.duration;inst.data.definition=def;inst.effects=[{id:uid(),kind:'color',hue:0,brightness:0}];p.nodes.push(inst);cycle.children.push(inst.id);list.push(inst)}
  while(list.length>count){const inst=list.pop();cycle.children=cycle.children.filter(id=>id!==inst.id);p.nodes=p.nodes.filter(n=>n.id!==inst.id)}
  list.forEach((inst,i)=>setGate(p,inst,i,count));
 }
 return cycle.id;
}

function firstVisual(p,definitionId){
 const stack=[definitionId],seen=new Set();while(stack.length){const id=stack.shift();if(seen.has(id))continue;seen.add(id);const n=p.nodes.find(x=>x.id===id);if(!n)continue;if(n.type==='image'||n.type==='clip'||n.data?.paint)return n;stack.push(...n.children)}return null
}
function colorEffect(instance){let e=instance.effects.find(e=>e.kind==='color');if(!e){e={id:uid(),kind:'color',hue:0,brightness:0};instance.effects.push(e)}return e}

export function configureLinkedEffect(p,clip,repeater,{count=6,start=0,span=300}={}){
 if(clip.type!=='clip'||repeater.type!=='repeater')throw Error('連番EffectとRepeaterを指定してください');
 const parent=p.nodes.find(n=>n.id===clip.parent);if(parent)parent.children=parent.children.filter(id=>id!==clip.id);clip.parent=null;if(!p.definitions.includes(clip.id))p.definitions.push(clip.id);
 repeater.data.template=clip.id;repeater.data.mode='linear';repeater.data.count=Math.max(1,Math.floor(count));repeater.data.maxCount=Math.max(repeater.data.maxCount,repeater.data.count);repeater.data.offset=[0,0];repeater.data.radius=0;repeater.data.rotationStep=repeater.data.count>1?span/(repeater.data.count-1):0;repeater.transform.rotation=start;return repeater.id
}

function appearanceUI(host,p,repeater){
 const f=details(host,'見た目パターン · PDF-F18');let cycle=cycleFor(p,repeater),instances=cycle?childInstances(p,cycle):[];
 const count=instances.length||2;f.append(numberInput(count,v=>commit(()=>ensureAppearanceCycle(p,repeater,v)),'パターン数','1'));
 if(!cycle){f.append(action('交互パターンを作成',()=>commit(()=>ensureAppearanceCycle(p,repeater,2))));return}
 const assets=imageAssets(p).map(a=>[a.id,a.id]);
 instances.forEach((inst,i)=>{
  const box=document.createElement('div');box.className='full';const h=document.createElement('h3');h.textContent=`パターン ${i+1}`;box.append(h);
  const visual=firstVisual(p,inst.data.definition),effect=colorEffect(inst);
  if(visual?.type==='image')box.append(optionSelect(assets,visual.data.asset,v=>commit(()=>visual.data.asset=v),'素材'));
  if(visual?.type==='clip')box.append(optionSelect(assets,visual.data.assets[0],v=>commit(()=>visual.data.assets[0]=v),'先頭素材'));
  if(visual?.data?.paint?.kind==='solid'){
   const l=document.createElement('label');l.textContent='色';const c=document.createElement('input');c.type='color';const rgb=visual.data.paint.rgba.slice(0,3).map(x=>Math.round(Math.max(0,Math.min(1,x))*255).toString(16).padStart(2,'0')).join('');c.value='#'+rgb;c.onchange=()=>commit(()=>{const hex=c.value.slice(1);visual.data.paint.rgba.splice(0,3,...[0,2,4].map(k=>parseInt(hex.slice(k,k+2),16)/255))});l.append(c);box.append(l)
  }
  box.append(numberInput(effect.hue,v=>commit(()=>effect.hue=v),'色相シフト °','1'));
  box.append(numberInput(effect.brightness,v=>commit(()=>effect.brightness=v),'明るさ','.05'));
  box.append(numberInput(inst.transform.scale[0],v=>commit(()=>inst.transform.scale=[v,v]),'大きさ','.05'));
  f.append(box)
 })
}

function particleUI(host,p,n){
 const assets=imageAssets(p).map(a=>[a.id,a.id]);const a=details(host,'Particle 素材 · PDF-F19/F20');
 n.data.assets.forEach((id,i)=>{const row=document.createElement('div');row.className='full';row.append(optionSelect(assets,id,v=>commit(()=>n.data.assets[i]=v),`素材 ${i+1}`));if(n.data.assets.length>1)row.append(action('削除',()=>commit(()=>n.data.assets.splice(i,1))));a.append(row)});
 a.append(action('＋ 素材',()=>commit(()=>n.data.assets.push(assets[0]?.[0]||'shardAsset'))));
 const b=details(host,'Burst / 分布 · PDF-F19/F20');n.data.bursts.forEach((burst,i)=>{const row=document.createElement('div');row.className='fields full';row.append(numberInput(burst.time,v=>commit(()=>burst.time=v),`Burst ${i+1} 時刻`),numberInput(burst.count,v=>commit(()=>burst.count=Math.max(0,Math.floor(v))),'個数','1'));if(n.data.bursts.length>1)row.append(action('削除',()=>commit(()=>n.data.bursts.splice(i,1))));b.append(row)});b.append(action('＋ Burst',()=>commit(()=>n.data.bursts.push({time:0,count:12}))));
 if(n.data.radialLaunch){const row=document.createElement('div');row.className='row';row.append(action('ランダム配置',()=>commit(()=>n.data.radialLaunch.distribution='random')),action('均等分散',()=>commit(()=>n.data.radialLaunch.distribution='distributed')),action('Seed変更',()=>commit(()=>n.data.seed=(n.data.seed+1)%9007199254740991)));b.append(row)}
}

function clipUI(host,p,n){
 const assets=imageAssets(p).map(a=>[a.id,a.id]),f=details(host,'連番Effect · PDF-F21');
 n.data.assets.forEach((id,i)=>{const row=document.createElement('div');row.className='fields full';row.append(optionSelect(assets,id,v=>commit(()=>n.data.assets[i]=v),`Frame ${i+1}`),numberInput(n.data.times[i],v=>commit(()=>{n.data.times[i]=Math.max(0,v);const pairs=n.data.assets.map((a,j)=>({a,t:n.data.times[j]})).sort((x,y)=>x.t-y.t);n.data.assets=pairs.map(x=>x.a);n.data.times=pairs.map(x=>x.t)}),'開始 秒','.01'));row.append(action('↑',()=>commit(()=>{if(i<1)return;[n.data.assets[i-1],n.data.assets[i]]=[n.data.assets[i],n.data.assets[i-1]];[n.data.times[i-1],n.data.times[i]]=[n.data.times[i],n.data.times[i-1]]})));if(n.data.assets.length>1)row.append(action('削除',()=>commit(()=>{n.data.assets.splice(i,1);n.data.times.splice(i,1)})));f.append(row)});
 f.append(numberInput(n.data.duration,v=>commit(()=>n.data.duration=Math.max(.001,v)),'素材列の長さ 秒','.01'));
 f.append(numberInput(n.time.rate,v=>commit(()=>n.time.rate=v),'再生速度','.05'));
 f.append(action('＋ Frame',()=>commit(()=>{const last=n.data.times.at(-1)??0;n.data.assets.push(assets[0]?.[0]||'shardAsset');n.data.times.push(last+.1);n.data.duration=Math.max(n.data.duration,last+.2)})));
 const linked=details(host,'複数方向へ配置 · PDF-F22');linked.append(action('共有したまま放射配置を作成',async()=>{
  const S=state(),clipId=n.id,oldUndo=S.undo.at(-1);const select=$('#add-type');select.value='repeater';$('#add').click();const rep=S.p.nodes.find(x=>x.id===S.id);if(!rep||rep.type!=='repeater')return;const undoBase=S.undo.at(-1)||oldUndo;await commit(()=>configureLinkedEffect(S.p,S.p.nodes.find(x=>x.id===clipId),rep),{undoBase})
 }))
}

function linkedRepeaterUI(host,p,n){const clip=p.nodes.find(x=>x.id===n.data.template&&x.type==='clip');if(!clip)return;const f=details(host,'共有Effect配置 · PDF-F22');const count=typeof n.data.count==='number'?n.data.count:1,span=n.data.rotationStep*Math.max(0,count-1);f.append(numberInput(count,v=>commit(()=>{const oldSpan=n.data.rotationStep*Math.max(0,count-1);n.data.count=Math.max(1,Math.floor(v));n.data.maxCount=Math.max(n.data.maxCount,n.data.count);n.data.rotationStep=n.data.count>1?oldSpan/(n.data.count-1):0}),'個数','1'));f.append(numberInput(n.transform.rotation,v=>commit(()=>n.transform.rotation=v),'開始角度 °','1'));f.append(numberInput(span,v=>commit(()=>n.data.rotationStep=count>1?v/(count-1):0),'角度範囲 °','1'));f.append(numberInput(clip.time.rate,v=>commit(()=>clip.time.rate=v),'内部再生速度','.05'))}

function ensureClipOption(){const s=$('#add-type');if(s&&!s.querySelector('option[value="clip"]')){const o=document.createElement('option');o.value='clip';o.textContent='連番Effect';s.insertBefore(o,s.querySelector('option[value="follower"]'))}}
function augment(){const S=state(),inspector=$('#inspector');if(!S?.p||!inspector)return;ensureClipOption();const n=S.p.nodes.find(x=>x.id===S.id);let old=inspector.querySelector('[data-pdf-effects-controls]');if(!n){old?.remove();return}if(old?.dataset.nodeId===n.id)return;old?.remove();const host=document.createElement('div');host.dataset.pdfEffectsControls='';host.dataset.nodeId=n.id;inspector.append(host);if(n.type==='repeater'){appearanceUI(host,S.p,n);linkedRepeaterUI(host,S.p,n)}if(n.type==='particle')particleUI(host,S.p,n);if(n.type==='clip')clipUI(host,S.p,n);if(!host.children.length)host.remove()}
let observer;function start(){if(!window.__IG?.state?.p||!$('#inspector'))return requestAnimationFrame(start);ensureClipOption();observer=new MutationObserver(()=>queueMicrotask(augment));observer.observe($('#inspector'),{childList:true,subtree:true});augment()}
start();
