import {AuthorEvaluator} from './author.js';
import {AssetStore} from './assets.js';
import {validateSource} from './compiler.js';
import {stackFromPrimitive} from './easing-stack.js';
import {lerpKeys} from './math.js';
import {uid} from './model.js';

const $=(s,r=document)=>r.querySelector(s);
const all=(s,r=document)=>[...r.querySelectorAll(s)];
const state=()=>window.__IG?.state;
const selected=()=>{const s=state();return s?.p?.nodes.find(n=>n.id===s.id)};

function status(message,error=false){
 const el=$('#status');if(!el)return;el.textContent=message;el.style.background=error?'#843d32':'#263030';
 clearTimeout(status.timer);status.timer=setTimeout(()=>{if(el.textContent===message)el.textContent=''},error?12000:4000)
}

async function persist(p){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('IntroGenerator',1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('projects'))r.result.createObjectStore('projects')};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(p,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();
 const save=$('#save-state');if(save)save.textContent='保存済み'
}

function referencedTracks(root,p){
 const out=new Set(),seen=new Set(),exps=new Map(p.expressions.map(e=>[e.id,e]));
 const walk=v=>{if(!v||typeof v!=='object'||seen.has(v))return;seen.add(v);if(typeof v.expr==='string'){const e=exps.get(v.expr);if(e?.op==='track')out.add(e.track)}for(const x of Array.isArray(v)?v:Object.values(v))walk(x)};
 walk(root);return out
}

function matchingTrack(){
 const s=state(),root=selected(),rows=all('#keys > tr').filter(r=>r.querySelector('select[aria-label="時間単位"]'));if(!s?.p||!root||!rows.length)return null;
 const refs=referencedTracks(root,s.p),near=(a,b)=>Math.abs(a-b)<1e-6,pool=refs.size?s.p.tracks.filter(t=>refs.has(t.id)):s.p.tracks;
 const candidates=pool.filter(tr=>tr.keys.length===rows.length&&rows.every((r,i)=>{const k=tr.keys[i],a=s.p.timeAnchors.find(a=>a.target==='keyframe'&&a.owner===tr.id&&a.key===k.id),time=r.querySelector('input[aria-label="Key位置"]'),value=r.querySelector('input[aria-label="Key値"]'),unit=r.querySelector('select[aria-label="時間単位"]');return time&&value&&unit&&near(Number(time.value),a?.value??k.time)&&near(Number(value.value),k.value)&&unit.value===(a?.unit||'seconds')}));
 return candidates.length===1?candidates[0]:null
}

function localTime(s,node){
 if(!node)return s.t;
 try{return new AuthorEvaluator(s.p,new AssetStore(s.p)).contextAt(node.id,s.t)?.c?.localTime??s.t}catch{return s.t}
}

function reopenKeyDialog(label){
 $('#dialog')?.close();
 $('.layer.selected .name')?.click();
 const button=all('.key-button').find(b=>b.getAttribute('aria-label')===label+'のキーフレーム');button?.click()
}

async function addKey(){
 const s=state(),track=matchingTrack(),node=selected();
 if(!s?.p||!track){status('キーフレームのTrackを特定できません',true);return}
 const time=localTime(s,node);if(track.keys.some(k=>Math.abs(k.time-time)<1e-9))return;
 const previous=structuredClone(s.p),label=($('#dialog-title')?.textContent||'').replace(/\s*·\s*キーフレーム.*$/,'');
 try{
  const tr=s.p.tracks.find(t=>t.id===track.id);if(!tr)throw Error('キーフレームのTrackが見つかりません');
  const id=uid(),trackValue=lerpKeys(tr.keys,time,tr.default);
  tr.keys.push({id,time,value:trackValue,ease:stackFromPrimitive({kind:'linear'},id)});tr.keys.sort((a,b)=>a.time-b.time);
  validateSource(s.p);s.undo.push(previous);if(s.undo.length>40)s.undo.shift();s.redo=[];s.revision++;
  await persist(s.p);reopenKeyDialog(label);window.__IG.rebuild().catch(e=>status(e.message,true))
 }catch(e){s.p=previous;status(e.message,true);$('.layer.selected .name')?.click()}
}

// Capture globally so an immediate click after the dialog opens cannot race a MutationObserver.
document.addEventListener('click',e=>{
 const button=e.target.closest?.('#new-key');
 if(!button||!$('#dialog')?.open||!$('#dialog-title')?.textContent.includes('キーフレーム'))return;
 button.dataset.trackValuePatched='1';
 e.preventDefault();e.stopImmediatePropagation();addKey()
},true);
