import {AuthorEvaluator} from './author.js';
import {AssetStore} from './assets.js';
import {input,uid} from './model.js';
import {stackFromPrimitive} from './easing-stack.js';
import {validateSource} from './compiler.js';

const $=s=>document.querySelector(s);
const state=()=>window.__IG?.state;

async function persist(project){
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('IntroGenerator',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 await new Promise((resolve,reject)=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').put(project,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});
 db.close();
}
function refresh(){document.querySelector('[data-pdf-path-controls]')?.remove();const selected=$('#layers .layer.selected .name');selected?.click()}
async function commit(mutator){
 const S=state();if(!S?.p)return;const before=structuredClone(S.p);
 try{mutator();validateSource(S.p);S.undo.push(before);if(S.undo.length>40)S.undo.shift();S.redo=[];S.revision++;const saved=$('#save-state');if(saved)saved.textContent='保存中';await persist(S.p);if(saved)saved.textContent='保存済み';await window.__IG.rebuild();refresh()}
 catch(error){S.p=before;const status=$('#status');if(status){status.textContent=error.message;status.style.background='#843d32'}throw error}
}
function toast(message){const status=$('#status');if(!status)return;status.textContent=message;status.style.background='#843d32'}
function parseCoordinates(raw){
 const s=raw.trim();if(!s)throw Error('座標1から入力してください');
 const blank=/,\s*,/.exec(s);if(blank)throw Error(`空欄があります（文字 ${blank.index+2} 付近）`);
 const tokens=s.split(/[\s,]+/).filter(Boolean);
 for(let i=0;i<tokens.length;i++)if(!Number.isFinite(Number(tokens[i])))throw Error(`値 ${i+1}「${tokens[i]}」が数値ではありません`);
 if(tokens.length<4)throw Error(`座標は2点以上必要です（現在 ${tokens.length} 個の値）`);
 if(tokens.length%2)throw Error(`値 ${tokens.length} のXに対応するYがありません`);
 return Array.from({length:tokens.length/2},(_,i)=>[Number(tokens[i*2]),Number(tokens[i*2+1])]);
}
export function replacePathCoordinates(project,path,raw){const points=parseCoordinates(raw);path.data.segments=[];path.data.spline=null;path.data.bezier={points};return points}

function pathContext(p,n,t){try{return new AuthorEvaluator(p,new AssetStore(p)).contextAt(n.id,t)?.c?.localTime??t}catch{return t}}
function channelValue(p,n,v){if(typeof v==='number')return v;try{const a=new AuthorEvaluator(p,new AssetStore(p)),c=a.contextAt(n.id,state()?.t??0)?.c;return c?a.value(v,c):0}catch{return 0}}
function bindingTrack(p,binding){if(!binding||typeof binding!=='object')return null;const e=p.expressions.find(x=>x.id===binding.expr);return e?.op==='track'?p.tracks.find(t=>t.id===e.track):null}
function addOrUpdateColorKey(p,n,index,value){
 let binding=n.data.stroke.paint.rgba[index],track=bindingTrack(p,binding),time=pathContext(p,n,state()?.t??0);
 if(!track){const current=typeof binding==='number'?binding:channelValue(p,n,binding),keyId=uid();track={id:uid(),unit:'channel',default:current,keys:[{id:keyId,time,value:current,ease:stackFromPrimitive({kind:'linear'},keyId)}]};p.tracks.push(track);const e={id:uid(),op:'track',track:track.id,time:input(p,'localTime')};p.expressions.push(e);n.data.stroke.paint.rgba[index]={expr:e.id}}
 let key=track.keys.find(k=>Math.abs(k.time-time)<1e-8);if(key)key.value=value;else{const keyId=uid();track.keys.push({id:keyId,time,value,ease:stackFromPrimitive({kind:'linear'},keyId)});track.keys.sort((a,b)=>a.time-b.time)}
}
function setColorValue(p,n,index,value){const binding=n.data.stroke.paint.rgba[index],track=bindingTrack(p,binding);if(track)addOrUpdateColorKey(p,n,index,value);else n.data.stroke.paint.rgba[index]=value}
function keyColorChannel(p,n,index){const current=channelValue(p,n,n.data.stroke.paint.rgba[index]);addOrUpdateColorKey(p,n,index,current)}
function details(host,title){const d=document.createElement('details');d.className='section';d.open=true;d.innerHTML=`<summary>${title}</summary><div class="fields"></div>`;host.append(d);return d.querySelector('.fields')}
function colorChannelField(host,p,n,index,label){
 const field=document.createElement('label');field.textContent=label;const row=document.createElement('span');row.className='field-binding';const inputEl=document.createElement('input');inputEl.type='number';inputEl.min='0';inputEl.max='1';inputEl.step='.01';inputEl.value=channelValue(p,n,n.data.stroke.paint.rgba[index]).toFixed(3);inputEl.setAttribute('aria-label',`線色 ${label}`);inputEl.onchange=()=>{const v=Number(inputEl.value);if(Number.isFinite(v))commit(()=>setColorValue(p,n,index,Math.max(0,Math.min(1,v))))};const key=document.createElement('button');key.className='key-button'+(bindingTrack(p,n.data.stroke.paint.rgba[index])?' on':'');key.dataset.pathColorKey=label;key.textContent='◇';key.setAttribute('aria-label',`線色 ${label}のキーフレーム`);key.onclick=()=>commit(()=>keyColorChannel(p,n,index));row.append(inputEl,key);field.append(row);host.append(field)
}
function augmentInspector(){
 const S=state(),inspector=$('#inspector');if(!S?.p||!inspector)return;const n=S.p.nodes.find(x=>x.id===S.id),old=inspector.querySelector('[data-pdf-path-controls]');
 if(n?.type!=='path'||n.data.stroke.paint?.kind!=='solid'){old?.remove();return}if(old?.dataset.nodeId===n.id)return;old?.remove();const host=document.createElement('div');host.dataset.pdfPathControls='';host.dataset.nodeId=n.id;const fields=details(host,'線色Animation · PDF-F30');['R','G','B','A'].forEach((label,i)=>colorChannelField(fields,S.p,n,i,label));const help=document.createElement('p');help.className='help full';help.textContent='◇で現在時刻に色Keyを作成。線幅は既存の◇で独立Animationできます。';fields.append(help);inspector.append(host)
}
function patchCoordinateDialog(){
 const S=state(),dialog=$('#dialog'),button=$('#apply-coordinates'),title=$('#dialog-title'),text=$('#coordinate-text');if(!S?.p||!dialog?.open||title?.textContent!=='座標列'||!button||!text||button.dataset.pdfPathPatched)return;
 button.dataset.pdfPathPatched='1';button.onclick=async()=>{const n=S.p.nodes.find(x=>x.id===S.id);if(n?.type!=='path')return toast('曲線を選択してください');try{parseCoordinates(text.value)}catch(error){toast(error.message);return}await commit(()=>replacePathCoordinates(S.p,n,text.value));dialog.close()}
}
let observer;function start(){if(!window.__IG?.state?.p||!$('#inspector')||!$('#dialog'))return requestAnimationFrame(start);observer=new MutationObserver(()=>queueMicrotask(()=>{augmentInspector();patchCoordinateDialog()}));observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});augmentInspector();patchCoordinateDialog()}
start();
