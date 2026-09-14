import {node,addNode,expression,input,solid} from './model.js';
import {validateSource} from './compiler.js';

const $=s=>document.querySelector(s);
const state=()=>window.__IG?.state;
const expressionOf=(p,binding)=>binding?.expr?p.expressions.find(e=>e.id===binding.expr):null;
const localTimeInput=(p,binding)=>{const e=expressionOf(p,binding);return e?.op==='input'&&e.name==='localTime'};
const constantExpression=(p,value)=>expression(p,'add',[value,0]);
const constantNode=(p,binding)=>{const e=expressionOf(p,binding);return e?.op==='add'&&typeof e.args?.[0]==='number'&&e.args?.[1]===0?e:null};

function depthParts(p,n){
 if(n?.type!=='repeater'||n.data.mode!=='linear')return null;
 const sx=n.transform.scale?.[0],sy=n.transform.scale?.[1];if(!sx?.expr||sy?.expr!==sx.expr)return null;
 const scale=expressionOf(p,sx);if(scale?.op!=='pow')return null;
 const step=constantNode(p,scale.args?.[0]);if(!step)return null;
 if(n.data.scaleStep?.[0]?.expr!==step.id||n.data.scaleStep?.[1]?.expr!==step.id)return null;
 const phase=expressionOf(p,scale.args?.[1]);if(phase?.op!=='modp'||phase.args?.[1]!==1)return null;
 const motion=expressionOf(p,phase.args?.[0]);if(motion?.op!=='mul')return null;
 const speedBinding=localTimeInput(p,motion.args?.[0])?motion.args?.[1]:localTimeInput(p,motion.args?.[1])?motion.args?.[0]:null;
 const speed=constantNode(p,speedBinding);if(!speed)return null;
 return {scale,step,phase,motion,speed};
}

function activeCamera(p){
 const viewCameras=new Set(p.nodes.filter(n=>n.type==='view').map(n=>n.data.camera));
 return p.nodes.find(n=>n.type==='camera'&&n.enabled&&!viewCameras.has(n.id))||null;
}

function cameraParts(p,camera){
 const root=expressionOf(p,camera?.data?.zoom);if(root?.op!=='mul')return null;
 for(const factorBinding of root.args||[]){
  const factor=expressionOf(p,factorBinding);if(factor?.op!=='pow'||factor.args?.[0]!==2)continue;
  const exponent=expressionOf(p,factor.args?.[1]);if(exponent?.op!=='mul')continue;
  const speedBinding=localTimeInput(p,exponent.args?.[0])?exponent.args?.[1]:localTimeInput(p,exponent.args?.[1])?exponent.args?.[0]:null;
  const speed=constantNode(p,speedBinding);if(speed)return {root,factor,exponent,speed};
 }
 return null;
}

function requiredCount(p,step,template){
 const rawW=template?.data?.params?.width,rawH=template?.data?.params?.height;
 const w=typeof rawW==='number'&&rawW>0?rawW:4,h=typeof rawH==='number'&&rawH>0?rawH:3;
 const target=Math.max(p.width/w,p.height/h)*1.5;
 return Math.min(128,Math.max(8,Math.ceil(Math.log(Math.max(1,target))/Math.log(Math.max(1.01,step)))+2));
}

function ensureCamera(p){
 let camera=activeCamera(p);
 if(!camera){camera=node('camera','Depth camera');camera.time.end=p.duration;camera.time.duration=p.duration;addNode(p,camera,p.root)}
 let parts=cameraParts(p,camera);
 if(!parts){
  const speed=constantExpression(p,.04),factor=expression(p,'pow',[2,expression(p,'mul',[input(p,'localTime'),speed])]);
  camera.data.zoom=expression(p,'mul',[camera.data.zoom,factor]);parts=cameraParts(p,camera);
 }
 return {camera,parts};
}

function configureDepthBackground(p,n){
 const template=p.nodes.find(x=>x.id===n.data.template);if(!template)throw Error('奥行き背景の模様が見つかりません');
 template.name='Depth pattern';template.data.shape='frame';template.data.params.width=4;template.data.params.height=3;template.data.params.thickness=.08;template.data.paint=solid([.22,.72,1,.8]);template.time.end=p.duration;template.time.duration=p.duration;
 n.name='Depth zoom background';n.space='world';n.data.mode='linear';n.data.offset=[0,0];n.data.rotationStep=0;n.data.opacityStep=1;n.data.colorStep=[0,0,0];n.data.phaseStep=0;n.data.delay=0;n.data.order='instanceMajor';n.data.maxCount=128;
 const step=constantExpression(p,1.35),speed=constantExpression(p,.5),phase=expression(p,'modp',[expression(p,'mul',[input(p,'localTime'),speed]),1]),scale=expression(p,'pow',[step,phase]);
 n.data.scaleStep=[structuredClone(step),structuredClone(step)];n.transform.scale=[structuredClone(scale),structuredClone(scale)];n.data.count=requiredCount(p,1.35,template);
 ensureCamera(p);
}

function setError(message){const status=$('#status');if(status){status.textContent=message;status.style.background='#843d32'}}

function forceRenderThroughHistory(){
 const undo=$('#undo'),redo=$('#redo');if(!undo||undo.disabled)return;
 undo.click();if(redo&&!redo.disabled)redo.click();
}

function commit(mutator){
 const S=state();if(!S?.p)return;
 const before=structuredClone(S.p);
 try{
  mutator();validateSource(S.p);S.undo.push(before);if(S.undo.length>40)S.undo.shift();S.redo=[];S.revision++;
  if($('#undo'))$('#undo').disabled=false;if($('#redo'))$('#redo').disabled=true;
  forceRenderThroughHistory();
 }catch(error){S.p=before;setError(error.message)}
}

function numberField(host,label,value,onChange,{step='.05',min=null,max=null}={}){
 const field=document.createElement('label');field.textContent=label;
 const input=document.createElement('input');input.type='number';input.step=step;input.value=Number(value).toFixed(3).replace(/\.0+$/,'').replace(/(\.\d*?)0+$/,'$1');input.ariaLabel=label;
 if(min!==null)input.min=String(min);if(max!==null)input.max=String(max);
 input.onchange=()=>{const next=Number(input.value);if(!Number.isFinite(next)){input.value=String(value);return}onChange(next)};
 field.append(input);host.append(field);return input;
}

function selectLayer(id){
 const S=state(),n=S?.p?.nodes.find(x=>x.id===id);if(!n)return;
 const button=[...document.querySelectorAll('#layers .name')].find(b=>b.textContent===n.name);button?.click();
}

function hideConflictingAdvancedFields(fields){
 const hidden=new Set(['個数','最大個数','列数','半径','間隔 X','間隔 Y','回転差','倍率差 X','倍率差 Y','不透明度差','色の差 X','色の差 Y','色の差 Z','位相差','時間差','開始位置','位置差','スクロール X','スクロール Y']);
 for(const label of fields.querySelectorAll('label')){const aria=label.querySelector('input')?.getAttribute('aria-label');if(hidden.has(aria))label.hidden=true}
}

function augment(){
 const S=state(),root=$('#inspector');if(!S?.p||!root)return;
 const n=S.p.nodes.find(x=>x.id===S.id),parts=depthParts(S.p,n),existing=root.querySelector('[data-depth-background-controls]');
 if(!parts){existing?.remove();return}
 if(existing?.dataset.nodeId===n.id)return;
 existing?.remove();
 const section=[...root.querySelectorAll('details.section')].find(x=>x.querySelector(':scope > summary')?.textContent==='繰り返し'),fields=section?.querySelector(':scope > .fields');if(!fields)return;
 hideConflictingAdvancedFields(fields);
 const box=document.createElement('div');box.className='full';box.dataset.depthBackgroundControls='';box.dataset.nodeId=n.id;
 const title=document.createElement('strong');title.textContent='奥行き拡大背景';
 const help=document.createElement('p');help.className='help';help.textContent='模様は幾何級数の同心配置を周期的にずらして連続拡大します。継ぎ目では同じ大きさの模様へ入れ替わるため、Camera Zoomとは別の速度で調整できます。';
 const grid=document.createElement('div');grid.className='fields';
 numberField(grid,'模様の拡大速度',parts.speed.args[0],value=>commit(()=>{const current=S.p.nodes.find(x=>x.id===n.id),d=depthParts(S.p,current);if(!d)throw Error('奥行き背景の設定が壊れています');if(value<0||value>4)throw Error('模様の拡大速度は0〜4で指定してください');d.speed.args[0]=value}),{step:'.05',min:0,max:4});
 const stepValue=parts.step.args[0],overlap=Math.max(0,Math.min(1,(1.6-stepValue)/.52));
 numberField(grid,'重なり',overlap,value=>commit(()=>{if(value<0||value>1)throw Error('重なりは0〜1で指定してください');const current=S.p.nodes.find(x=>x.id===n.id),d=depthParts(S.p,current);if(!d)throw Error('奥行き背景の設定が壊れています');const step=1.6-value*.52;d.step.args[0]=step;const template=S.p.nodes.find(x=>x.id===current.data.template);current.data.count=requiredCount(S.p,step,template)}),{step:'.05',min:0,max:1});
 const camera=activeCamera(S.p),cameraInfo=cameraParts(S.p,camera);
 if(cameraInfo)numberField(grid,'Camera Zoom速度',cameraInfo.speed.args[0],value=>commit(()=>{if(value<-1||value>1)throw Error('Camera Zoom速度は-1〜1で指定してください');const c=activeCamera(S.p),cp=cameraParts(S.p,c);if(!cp)throw Error('Camera Zoom設定が見つかりません');cp.speed.args[0]=value}),{step:'.01',min:-1,max:1});
 const actions=document.createElement('div');actions.className='row full';
 const editPattern=document.createElement('button');editPattern.className='mini';editPattern.textContent='模様を編集';editPattern.onclick=()=>selectLayer(n.data.template);
 const editCamera=document.createElement('button');editCamera.className='mini';editCamera.textContent=camera?`Cameraを編集`:'Cameraなし';editCamera.disabled=!camera;editCamera.onclick=()=>camera&&selectLayer(camera.id);
 actions.append(editPattern,editCamera);box.append(title,help,grid,actions);fields.append(box);
}

function installAddEntry(){
 const select=$('#add-type'),add=$('#add');if(!select||!add)return false;
 if(!select.querySelector('option[value="depth"]')){const option=document.createElement('option');option.value='depth';option.textContent='奥行き拡大背景';const scroll=select.querySelector('option[value="scroll"]');scroll?.after(option)??select.append(option)}
 let pending=false;
 add.addEventListener('click',()=>{
  if(select.value!=='depth'||pending)return;
  const S=state();if(!S?.p)return;
  const revision=S.revision;pending=true;select.value='repeater';
  queueMicrotask(()=>{
   try{
    const current=state();if(current.revision===revision)throw Error('奥行き背景を追加できませんでした');
    const n=current.p.nodes.find(x=>x.id===current.id);if(n?.type!=='repeater')throw Error('奥行き背景のRepeaterを作成できませんでした');
    configureDepthBackground(current.p,n);validateSource(current.p);select.value='depth';forceRenderThroughHistory();
   }catch(error){select.value='depth';const current=state();if(current?.revision!==revision&&!$('#undo')?.disabled){$('#undo').click();current.redo=[]}setError(error.message)}finally{pending=false}
  });
 },true);
 return true;
}

let observer;
function start(){
 if(!installAddEntry()||!window.__IG?.state?.p)return requestAnimationFrame(start);
 const root=$('#inspector');if(!root)return requestAnimationFrame(start);
 observer=new MutationObserver(()=>queueMicrotask(augment));observer.observe(root,{childList:true,subtree:true});augment();
}
start();
