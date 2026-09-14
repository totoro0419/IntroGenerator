import {validateSource} from './compiler.js';
import {uid} from './model.js';

const $=s=>document.querySelector(s);
const state=()=>window.__IG?.state;

async function persist(project){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('IntroGenerator',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 db.close();
}

async function commit(mutator){
 const S=state();if(!S?.p)return;
 const before=structuredClone(S.p);
 try{
  mutator();validateSource(S.p);S.undo.push(before);if(S.undo.length>40)S.undo.shift();S.redo=[];S.revision++;
  await persist(S.p);const undo=$('#undo'),redo=$('#redo'),saved=$('#save-state');if(undo)undo.disabled=false;if(redo)redo.disabled=true;if(saved)saved.textContent='保存済み';
  await window.__IG.rebuild();
 }catch(error){S.p=before;const status=$('#status');if(status){status.textContent=error.message;status.style.background='#843d32'}throw error}
}

function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o}
function syncSelect(select,effect){
 const S=state();select.replaceChildren(option('','線形（標準）'));
 for(const tr of S.p.tracks)select.append(option(tr.id,tr.id));
 select.value=effect.falloff??'';
}

function renderCurveEditor(host,effect){
 host.querySelector('[data-temporal-falloff-editor]')?.remove();
 if(!effect.falloff)return;
 const S=state(),track=S.p.tracks.find(t=>t.id===effect.falloff);if(!track)return;
 const editor=document.createElement('div');editor.dataset.temporalFalloffEditor='';editor.className='full temporal-falloff-editor';
 const title=document.createElement('small');title.textContent='減衰カーブ（0=現在、1=最古）';editor.append(title);
 track.keys.forEach((key,index)=>{
  const row=document.createElement('div');row.className='row';
  const time=document.createElement('input');time.type='number';time.min='0';time.max='1';time.step='.05';time.value=key.time;time.ariaLabel=`減衰位置 ${index+1}`;
  const value=document.createElement('input');value.type='number';value.step='.05';value.value=key.value;value.ariaLabel=`減衰強さ ${index+1}`;
  const del=document.createElement('button');del.className='mini';del.textContent='×';del.ariaLabel=`減衰点 ${index+1}を削除`;del.disabled=track.keys.length<=2;
  const apply=()=>commit(()=>{key.time=Math.max(0,Math.min(1,Number(time.value)));key.value=Number(value.value);track.keys.sort((a,b)=>a.time-b.time)}).then(()=>augment(true));
  time.onchange=apply;value.onchange=apply;del.onclick=()=>commit(()=>track.keys=track.keys.filter(k=>k.id!==key.id)).then(()=>augment(true));
  row.append(time,value,del);editor.append(row);
 });
 const add=document.createElement('button');add.className='mini';add.textContent='＋ 減衰点';add.onclick=()=>commit(()=>track.keys.push({id:uid(),time:.5,value:.5,ease:{kind:'stack',layers:[{id:uid(),enabled:true,weight:1,curve:{kind:'linear'}}]}})).then(()=>augment(true));editor.append(add);
 host.append(editor);
}

function augment(force=false){
 const S=state(),root=$('#inspector');if(!S?.p||!root)return;
 const node=S.p.nodes.find(n=>n.id===S.id);if(!node)return;
 const echoIndexes=node.effects.map((e,i)=>e.kind==='temporalEcho'?i:-1).filter(i=>i>=0);
 const panels=[...root.querySelectorAll('.full')].filter(x=>x.querySelector(':scope > h3')?.textContent==='temporalEcho');
 panels.forEach((panel,panelIndex)=>{
  const effectIndex=echoIndexes[panelIndex],effect=node.effects[effectIndex];if(!effect)return;
  const fields=panel.querySelector('.fields');if(!fields)return;
  let label=panel.querySelector('[data-temporal-falloff]');
  if(label){
   if(force){const select=label.querySelector('select');if(select)syncSelect(select,effect);renderCurveEditor(fields,effect)}
   return;
  }
  label=document.createElement('label');label.dataset.temporalFalloff='';label.textContent='減衰';
  const select=document.createElement('select');select.ariaLabel='残像の減衰';syncSelect(select,effect);
  select.onchange=()=>{
   const pending=commit(()=>effect.falloff=select.value||null);
   renderCurveEditor(fields,effect);
   pending.then(()=>augment(true)).catch(()=>augment(true));
  };
  label.append(select);fields.append(label);
  const create=document.createElement('button');create.className='mini';create.textContent='減衰カーブを作成';create.onclick=()=>{
   const id=uid(),linear={kind:'stack',layers:[{id:uid(),enabled:true,weight:1,curve:{kind:'linear'}}]};
   const pending=commit(()=>{S.p.tracks.push({id,unit:'alpha',default:1,keys:[{id:uid(),time:0,value:1,ease:structuredClone(linear)},{id:uid(),time:1,value:0,ease:structuredClone(linear)}]});effect.falloff=id});
   syncSelect(select,effect);renderCurveEditor(fields,effect);
   pending.then(()=>augment(true)).catch(()=>augment(true));
  };
  fields.append(create);
  renderCurveEditor(fields,effect);
 });
}

const observer=new MutationObserver(()=>queueMicrotask(()=>augment(false)));
const start=()=>{const root=$('#inspector');if(!root)return requestAnimationFrame(start);observer.observe(root,{childList:true,subtree:true});augment(false)};
start();
