import './easing-ui.css';

const $=(s,r=document)=>r.querySelector(s);
const all=(s,r=document)=>[...r.querySelectorAll(s)];
const families=[['linear','Linear'],['sine','Sine'],['quad','Quad'],['cubic','Cubic'],['quart','Quart'],['quint','Quint'],['expo','Expo'],['circ','Circ'],['back','Back'],['elastic','Elastic'],['bounce','Bounce'],['power','Power'],['bezier','Cubic Bezier'],['hold','Hold']];
const dirs=[['In','In'],['Out','Out'],['InOut','InOut']];
let scheduled=false;

function parseKind(kind){
 if(kind==='linear'||kind==='hold'||kind==='bezier')return {family:kind,direction:null};
 for(const direction of ['InOut','In','Out'])if(kind.endsWith(direction))return {family:kind.slice(0,-direction.length),direction};
 return {family:'linear',direction:null};
}
function makeKind(family,direction){return family==='linear'||family==='hold'||family==='bezier'?family:family+(direction||'InOut')}
function nativeParamRow(row){const next=row.nextElementSibling;if(!next)return null;const td=$('td[colspan="5"]',next);return td&&$('label input',td)?next:null}
function changeNative(select,value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))}
function parameterSpec(kind){
 if(kind.startsWith('power'))return [['power','強さ',0.01,null,.05]];
 if(kind.startsWith('back'))return [['overshoot','Overshoot',null,null,.05]];
 if(kind.startsWith('elastic'))return [['period','振動周期',0.001,null,.01]];
 if(kind==='bezier')return [['x1','X1',0,1,.05],['y1','Y1',null,null,.05],['x2','X2',0,1,.05],['y2','Y2',null,null,.05]];
 return []
}
function patchRow(row){
 const raw=$('select[aria-label="Easing"]',row);if(!raw||raw.dataset.f09Patched)return;raw.dataset.f09Patched='1';
 const {family,direction}=parseKind(raw.value),cell=raw.closest('td');if(!cell)return;
 raw.classList.add('easing-native');raw.tabIndex=-1;raw.setAttribute('aria-hidden','true');
 const editor=document.createElement('div');editor.className='easing-editor';editor.dataset.kind=raw.value;
 const familyLabel=document.createElement('label');familyLabel.textContent='種類';const familySelect=document.createElement('select');familySelect.setAttribute('aria-label','Easing種類');for(const [value,title] of families){const option=document.createElement('option');option.value=value;option.textContent=title;familySelect.append(option)}familySelect.value=family;familyLabel.append(familySelect);
 const dirLabel=document.createElement('label');dirLabel.textContent='方向';const dirSelect=document.createElement('select');dirSelect.setAttribute('aria-label','Easing方向');for(const [value,title] of dirs){const option=document.createElement('option');option.value=value;option.textContent=title;dirSelect.append(option)}dirSelect.value=direction||'InOut';dirSelect.disabled=['linear','hold','bezier'].includes(family);dirLabel.append(dirSelect);
 editor.append(familyLabel,dirLabel);
 const paramRow=nativeParamRow(row),nativeInputs=paramRow?all('label input',paramRow):[];if(paramRow)paramRow.hidden=true;
 const specs=parameterSpec(raw.value);if(specs.length){const params=document.createElement('div');params.className='easing-params';specs.forEach(([name,label,min,max,step],i)=>{const native=nativeInputs[i];if(!native)return;const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.type='number';input.step=String(step);if(min!==null)input.min=String(min);if(max!==null)input.max=String(max);input.value=native.value;input.setAttribute('aria-label',`Easing ${label}`);input.onchange=()=>{const value=Number(input.value);if(!Number.isFinite(value))return;if(min!==null&&value<=0&&name!=='x1'&&name!=='x2')return;if(min!==null&&value<min||max!==null&&value>max)return;native.value=String(value);native.dispatchEvent(new Event('change',{bubbles:true}))};wrap.append(input);params.append(wrap)});editor.append(params)}
 familySelect.onchange=()=>changeNative(raw,makeKind(familySelect.value,dirSelect.value));
 dirSelect.onchange=()=>changeNative(raw,makeKind(familySelect.value,dirSelect.value));
 cell.prepend(editor)
}
function mount(){if(!$('#dialog')?.open||!$('#dialog-title')?.textContent.includes('キーフレーム'))return;all('#keys > tr').filter(r=>$('select[aria-label="Easing"]',r)).forEach(patchRow)}
function queue(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;mount()})}
async function boot(){for(let i=0;i<300&&!window.__IG;i++)await new Promise(r=>setTimeout(r,20));const dialog=$('#dialog');if(!dialog)return;new MutationObserver(queue).observe(dialog,{subtree:true,childList:true});document.addEventListener('click',e=>{if(e.target.closest('.key-button'))setTimeout(queue,0)},true);mount()}
boot();
