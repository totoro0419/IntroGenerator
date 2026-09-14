import {validateSource} from './compiler.js';

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
  const undo=$('#undo'),redo=$('#redo'),saved=$('#save-state');if(undo)undo.disabled=false;if(redo)redo.disabled=true;if(saved)saved.textContent='保存中';
  await persist(S.p);if(saved)saved.textContent='保存済み';
  await window.__IG.rebuild();
 }catch(error){
  S.p=before;const status=$('#status');if(status){status.textContent=error.message;status.style.background='#843d32'}throw error;
 }
}

function numberField(host,node,path,label){
 const [row,column]=path;
 const field=document.createElement('label');field.textContent=label;
 const input=document.createElement('input');input.type='number';input.step='.1';input.value=node.data.basis[row][column];input.ariaLabel=label;
 input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value)){input.value=node.data.basis[row][column];return}commit(()=>node.data.basis[row][column]=value)};
 field.append(input);host.append(field);
}

function augment(){
 const S=state(),root=$('#inspector');if(!S?.p||!root)return;
 const node=S.p.nodes.find(n=>n.id===S.id),existing=root.querySelector('[data-repeating-background-controls]');
 if(node?.type!=='repeater'||node.data.mode!=='lattice'){existing?.remove();return}
 if(existing?.dataset.nodeId===node.id)return;
 existing?.remove();
 const panel=[...root.querySelectorAll('details.section')].find(section=>section.querySelector(':scope > summary')?.textContent==='繰り返し');
 const fields=panel?.querySelector(':scope > .fields');if(!fields)return;
 const box=document.createElement('div');box.dataset.repeatingBackgroundControls='';box.dataset.nodeId=node.id;box.className='full';
 const title=document.createElement('strong');title.textContent='格子の間隔・方向';
 const help=document.createElement('p');help.className='help';help.textContent='2本の格子軸で間隔と向きを決めます。スクロール X/Y はこの格子座標に沿った移動量です。';
 const grid=document.createElement('div');grid.className='fields';
 numberField(grid,node,[0,0],'格子 X軸 X');numberField(grid,node,[0,1],'格子 X軸 Y');numberField(grid,node,[1,0],'格子 Y軸 X');numberField(grid,node,[1,1],'格子 Y軸 Y');
 box.append(title,help,grid);fields.append(box);
}

let observer;
function start(){
 if(!window.__IG?.state?.p)return requestAnimationFrame(start);
 const root=$('#inspector');if(!root)return requestAnimationFrame(start);
 observer=new MutationObserver(()=>queueMicrotask(augment));observer.observe(root,{childList:true,subtree:true});augment();
}
start();
