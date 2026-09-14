import './timing-ui.css';
import {syncTiming,timingAnchor,timingValue,uid} from './model.js';
import {beats,beatAtSeconds} from './math.js';
import {validateSource} from './compiler.js';

const $=s=>document.querySelector(s);
const all=(s,root=document)=>[...root.querySelectorAll(s)];
let scheduled=false;

function status(message,error=false){
 const el=$('#status');if(!el)return;el.textContent=message;el.style.background=error?'#843d32':'#263030';
 clearTimeout(status.timer);status.timer=setTimeout(()=>{if(el.textContent===message)el.textContent=''},error?12000:4000);
}
function state(){return window.__IG?.state}
function selected(){const s=state();return s?.p?.nodes.find(n=>n.id===s.id)}
function refreshMainUI(){const row=$('.layer.selected .name')||$('.layer .name');row?.click()}
async function persist(p){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('IntroGenerator',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('projects'))r.result.createObjectStore('projects')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 const save=$('#save-state');if(save)save.textContent='保存済み';
}
async function transact(mutator,{timing=true,closeOnError=false}={}){
 const s=state();if(!s?.p)return false;const previous=structuredClone(s.p);
 try{
  mutator(s.p);if(timing)syncTiming(s.p);validateSource(s.p);
  s.undo.push(previous);if(s.undo.length>40)s.undo.shift();s.redo=[];s.revision++;
  await persist(s.p);refreshMainUI();queueMount();window.__IG.rebuild().catch(e=>status(e.message,true));return true;
 }catch(e){s.p=previous;if(closeOnError)$('#dialog')?.close();refreshMainUI();queueMount();status(e.message,true);return false}
}
function setAnchor(p,{target,owner,key=null,unit,seconds}){
 let a=timingAnchor(p,target,owner,key);const value=timingValue(p,unit,seconds);
 if(!a){a={id:uid(),target,owner,key,unit,value};p.timeAnchors??=[];p.timeAnchors.push(a)}else{a.unit=unit;a.value=value}
 return a
}
function control(labelText,value,unit,onValue,onUnit){
 const row=document.createElement('div');row.className='timing-anchor-row full';
 const label=document.createElement('label');label.textContent=labelText;const input=document.createElement('input');input.type='number';input.step='.05';input.value=Number(value.toFixed(6));input.setAttribute('aria-label',labelText);label.append(input);
 const unitLabel=document.createElement('label');unitLabel.textContent='固定基準';const select=document.createElement('select');select.innerHTML='<option value="seconds">秒固定</option><option value="beats">拍固定</option>';select.value=unit;select.setAttribute('aria-label',labelText+'の固定基準');unitLabel.append(select);
 input.onchange=()=>{const v=Number(input.value);if(Number.isFinite(v))onValue(v,select.value)};
 select.onchange=()=>onUnit(select.value);
 row.append(label,unitLabel);return row
}
function resolvedText(seconds){const span=document.createElement('span');span.className='timing-resolved';span.textContent=`= ${seconds.toFixed(3)} s`;return span}

function mountNodeTiming(){
 const s=state(),n=selected(),area=$('#inspector');if(!s?.p||!n||!area)return;
 const timeDetails=all('#inspector details.section').find(d=>d.querySelector(':scope > summary')?.textContent==='時間');if(!timeDetails)return;
 const fields=timeDetails.querySelector(':scope > .fields');if(!fields||fields.querySelector('.timing-node-anchor'))return;
 const legacy=all(':scope > label',fields);const startLegacy=legacy.find(l=>l.textContent.includes('開始 秒')),endLegacy=legacy.find(l=>l.textContent.includes('終了 秒'));if(startLegacy)startLegacy.hidden=true;if(endLegacy)endLegacy.hidden=true;
 const box=document.createElement('div');box.className='timing-node-anchor full';
 for(const [target,key,label] of [['nodeStart','start','開始'],['nodeEnd','end','終了']]){
  const a=timingAnchor(s.p,target,n.id,null),seconds=n.time[key],unit=a?.unit||'seconds',display=a?.value??seconds;
  const row=control(label,display,unit,(v,u)=>transact(p=>{const node=p.nodes.find(x=>x.id===n.id),current=node.time[key];let anchor=timingAnchor(p,target,n.id,null);if(!anchor)anchor=setAnchor(p,{target,owner:n.id,key:null,unit:u,seconds:current});anchor.unit=u;anchor.value=v},{closeOnError:true}),u=>transact(p=>{const node=p.nodes.find(x=>x.id===n.id);setAnchor(p,{target,owner:n.id,key:null,unit:u,seconds:node.time[key]})},{closeOnError:true}));
  row.append(resolvedText(seconds));box.append(row)
 }
 fields.prepend(box)
}

function activeBpm(tempo,beat){let bpm=tempo[0].bpm;for(const t of tempo){if(t.beat>beat)break;bpm=t.bpm}return bpm}
function mountProjectDialog(force=false){
 if($('#dialog-title')?.textContent!=='プロジェクト')return;const f=$('#project-fields');if(!f)return;
 const old=all(':scope > label',f).find(l=>/^BPM/.test(l.textContent.trim()));if(old)old.hidden=true;
 let panel=$('#timing-project-panel');if(panel&&!force)return;panel?.remove();panel=document.createElement('div');panel.id='timing-project-panel';panel.className='timing-project-panel';
 const tempoTitle=document.createElement('div');tempoTitle.className='timing-title';tempoTitle.innerHTML='<strong>Tempo Map</strong><span>Beat 0から区間ごとにBPMを設定</span>';panel.append(tempoTitle);
 const tempoList=document.createElement('div');tempoList.className='timing-list';panel.append(tempoList);const p=state().p;
 p.tempo.forEach((t,i)=>{const row=document.createElement('div');row.className='timing-table-row';const beat=document.createElement('label');beat.textContent='Beat';const bi=document.createElement('input');bi.type='number';bi.step='.25';bi.value=t.beat;bi.disabled=i===0;bi.setAttribute('aria-label',`Tempo ${i+1} 開始Beat`);beat.append(bi);const bpm=document.createElement('label');bpm.textContent='BPM';const pi=document.createElement('input');pi.type='number';pi.min='0.000001';pi.step='1';pi.value=t.bpm;pi.setAttribute('aria-label',`Tempo ${i+1} BPM`);bpm.append(pi);const del=document.createElement('button');del.className='mini';del.textContent='削除';del.disabled=i===0;del.setAttribute('aria-label',`Tempo ${i+1}を削除`);
  bi.onchange=async()=>{const v=Number(bi.value);if(Number.isFinite(v)&&await transact(q=>{q.tempo[i].beat=v}))mountProjectDialog(true)};
  pi.onchange=async()=>{const v=Number(pi.value);if(Number.isFinite(v)&&v>0&&await transact(q=>{q.tempo[i].bpm=v}))mountProjectDialog(true)};
  del.onclick=async()=>{if(await transact(q=>q.tempo.splice(i,1)))mountProjectDialog(true)};row.append(beat,bpm,del);tempoList.append(row)});
 const addTempo=document.createElement('button');addTempo.className='mini';addTempo.textContent='＋ 現在位置にTempo区間';addTempo.onclick=async()=>{const s=state(),b=beatAtSeconds(s.p.tempo,s.t),bpm=activeBpm(s.p.tempo,b);if(await transact(q=>{if(q.tempo.some(x=>Math.abs(x.beat-b)<1e-9))throw Error('このBeatには既にTempo区間があります');q.tempo.push({beat:b,bpm});q.tempo.sort((a,c)=>a.beat-c.beat)}))mountProjectDialog(true)};panel.append(addTempo);
 const markerTitle=document.createElement('div');markerTitle.className='timing-title timing-marker-title';markerTitle.innerHTML='<strong>Markers</strong><span>編集位置の秒固定／拍固定を保持</span>';panel.append(markerTitle);
 const markerList=document.createElement('div');markerList.className='timing-list';panel.append(markerList);
 if(!p.markers?.length){const empty=document.createElement('p');empty.className='help';empty.textContent='Markerはまだありません。タイムラインの「＋ Marker」で現在位置へ追加できます。';markerList.append(empty)}
 (p.markers||[]).forEach((m,i)=>{const row=document.createElement('div');row.className='timing-marker-row';const name=document.createElement('label');name.textContent='名前';const ni=document.createElement('input');ni.value=m.name;ni.setAttribute('aria-label',`Marker ${i+1} 名前`);name.append(ni);const pos=document.createElement('label');pos.textContent='位置';const vi=document.createElement('input');vi.type='number';vi.step='.05';vi.value=m.value;vi.setAttribute('aria-label',`Marker ${i+1} 位置`);pos.append(vi);const unit=document.createElement('label');unit.textContent='固定基準';const us=document.createElement('select');us.innerHTML='<option value="seconds">秒固定</option><option value="beats">拍固定</option>';us.value=m.unit;us.setAttribute('aria-label',`Marker ${i+1} 固定基準`);unit.append(us);const del=document.createElement('button');del.className='mini';del.textContent='削除';del.setAttribute('aria-label',`Marker ${i+1}を削除`);
  ni.onchange=async()=>{if(await transact(q=>q.markers[i].name=ni.value,{timing:false}))mountProjectDialog(true)};
  vi.onchange=async()=>{const v=Number(vi.value);if(Number.isFinite(v)&&await transact(q=>q.markers[i].value=v,{timing:false}))mountProjectDialog(true)};
  us.onchange=async()=>{const s=state(),old=s.p.markers[i],seconds=old.unit==='beats'?beats(s.p.tempo,old.value):old.value,newUnit=us.value,newValue=newUnit==='beats'?beatAtSeconds(s.p.tempo,seconds):seconds;if(await transact(q=>{q.markers[i].unit=newUnit;q.markers[i].value=newValue},{timing:false}))mountProjectDialog(true)};
  del.onclick=async()=>{if(await transact(q=>q.markers.splice(i,1),{timing:false}))mountProjectDialog(true)};row.append(name,pos,unit,del);markerList.append(row)});
 f.after(panel)
}

function mountAudioDialog(force=false){
 if($('#dialog-title')?.textContent!=='音楽・効果音')return;const root=$('#audio-tracks'),s=state();if(!root||!s?.p)return;
 const sections=all('#audio-tracks > details.section');sections.forEach((section,i)=>{const audio=s.p.audio[i];if(!audio)return;if(section.querySelector('.timing-audio-anchor')&&!force)return;section.querySelector('.timing-audio-anchor')?.remove();const fields=section.querySelector(':scope > .fields');if(!fields)return;const legacy=all(':scope > label',fields).find(l=>l.textContent.includes('開始 秒'));if(legacy)legacy.hidden=true;const a=timingAnchor(s.p,'audioStart',audio.id,null),seconds=audio.start,unit=a?.unit||'seconds',display=a?.value??seconds;const row=control('開始位置',display,unit,(v,u)=>transact(p=>{const item=p.audio.find(x=>x.id===audio.id),current=item.start;let anchor=timingAnchor(p,'audioStart',audio.id,null);if(!anchor)anchor=setAnchor(p,{target:'audioStart',owner:audio.id,key:null,unit:u,seconds:current});anchor.unit=u;anchor.value=v},{closeOnError:true}),u=>transact(p=>{const item=p.audio.find(x=>x.id===audio.id);setAnchor(p,{target:'audioStart',owner:audio.id,key:null,unit:u,seconds:item.start})},{closeOnError:true}));row.classList.add('timing-audio-anchor');row.append(resolvedText(seconds));fields.prepend(row);const del=all('button',fields).find(b=>b.textContent==='削除');if(del)del.onclick=async()=>{if(await transact(p=>{p.audio=p.audio.filter(x=>x.id!==audio.id);p.timeAnchors=(p.timeAnchors||[]).filter(x=>!(x.target==='audioStart'&&x.owner===audio.id))},{timing:false}))mountAudioDialog(true)}})
}

function matchingKeyTrack(rows){const p=state()?.p;if(!p)return null;const near=(a,b)=>Math.abs(a-b)<1e-6;const candidates=p.tracks.filter(tr=>tr.keys.length===rows.length&&rows.every((r,i)=>{const k=tr.keys[i],a=timingAnchor(p,'keyframe',tr.id,k.id),inputs=r.querySelectorAll('input'),selects=r.querySelectorAll('select');return inputs.length>=2&&selects.length>=2&&near(Number(inputs[0].value),a?.value??k.time)&&near(Number(inputs[1].value),k.value)&&selects[0].value===(a?.unit||'seconds')&&selects[1].value===k.ease.kind}));return candidates.length===1?candidates[0]:null}
function mountKeyDialog(){
 if(!$('#dialog-title')?.textContent.includes('キーフレーム'))return;const rows=all('#keys > tr').filter(r=>r.querySelector('select[aria-label="時間単位"]'));if(!rows.length)return;const tr=matchingKeyTrack(rows);if(!tr)return;
 rows.forEach((r,i)=>{const select=r.querySelector('select[aria-label="時間単位"]');if(select.dataset.timingPatched)return;select.dataset.timingPatched='1';select.onchange=async()=>{const s=state(),key=tr.keys[i],unit=select.value,seconds=key.time,newValue=timingValue(s.p,unit,seconds);const ok=await transact(p=>{setAnchor(p,{target:'keyframe',owner:tr.id,key:key.id,unit,seconds})},{closeOnError:true});if(ok){const input=r.querySelector('input[aria-label="Key位置"]');if(input)input.value=Number(newValue.toFixed(6));queueMount()}}})
}

function mountTimelineMarkers(){
 const s=state(),body=$('#timeline-body');if(!s?.p||!body)return;const signature=JSON.stringify((s.p.markers||[]).map(m=>[m.id,m.unit,m.value,m.name]))+':'+s.p.duration+':'+body.clientWidth;let layer=body.querySelector(':scope > .timing-marker-layer');if(layer?.dataset.signature===signature)return;layer?.remove();layer=document.createElement('div');layer.className='timing-marker-layer';layer.dataset.signature=signature;(s.p.markers||[]).forEach(m=>{const seconds=m.unit==='beats'?beats(s.p.tempo,m.value):m.value;if(seconds<0||seconds>s.p.duration)return;const b=document.createElement('button');b.type='button';b.className='timing-marker';b.style.left=`${16+seconds/s.p.duration*(body.clientWidth-32)}px`;b.title=`${m.name} · ${m.unit==='beats'?m.value+' beat':seconds.toFixed(3)+' s'}`;b.setAttribute('aria-label',b.title);b.onclick=()=>{s.audio?.stop();s.playing=false;s.t=seconds;refreshMainUI()};layer.append(b)});body.append(layer)
}

function mountAll(){mountNodeTiming();mountProjectDialog();mountAudioDialog();mountKeyDialog();mountTimelineMarkers()}
function queueMount(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;mountAll()})}
async function boot(){for(let i=0;i<300&&!window.__IG;i++)await new Promise(r=>setTimeout(r,20));if(!window.__IG)return;mountAll();const app=$('#app');if(app)new MutationObserver(queueMount).observe(app,{subtree:true,childList:true});window.addEventListener('resize',queueMount);document.addEventListener('click',e=>{if(e.target.closest('#project-settings,#audio-settings,.key-button,#add-marker'))setTimeout(queueMount,0)},true)}
boot();
