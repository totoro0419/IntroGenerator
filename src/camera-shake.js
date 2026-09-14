import {uid} from './model.js';

const TAG='IGCameraShakeV1.';
export const cameraShakeDefaults={x:12,y:8,roll:1.5,zoom:.03,speed:8,start:0,duration:1,attack:.08,decay:.25};
const PARAM_KEYS=Object.keys(cameraShakeDefaults);
const ref=id=>({expr:id});
const bindingRefs=v=>v&&typeof v==='object'&&typeof v.expr==='string';
function expression(p,op,args,extra={}){const e={id:uid(),op,...extra};if(args!==undefined)e.args=args;p.expressions.push(e);return ref(e.id)}
function marker(p,tag){const e={id:uid(),op:'seeded',tag:TAG+tag,instance:0,seed:1};p.expressions.push(e);return ref(e.id)}
function zeroMarker(p,tag){return expression(p,'mul',[0,marker(p,tag)])}
function param(p,key,value){return expression(p,'add',[structuredClone(value),zeroMarker(p,'param.'+key)])}
function bin(p,op,a,b){return expression(p,op,[a,b])}
function uni(p,op,a){return expression(p,op,[a])}
function add(p,a,b){return bin(p,'add',a,b)}
function sub(p,a,b){return bin(p,'sub',a,b)}
function mul(p,a,b){return bin(p,'mul',a,b)}
function div(p,a,b){return bin(p,'div',a,b)}
function min(p,a,b){return bin(p,'min',a,b)}
function max(p,a,b){return bin(p,'max',a,b)}
function lt(p,a,b){return bin(p,'lt',a,b)}
function le(p,a,b){return bin(p,'le',a,b)}
function sin(p,a){return uni(p,'sin',a)}
function taggedZero(p,tag){return zeroMarker(p,'out.'+tag)}
function wave(p,q,speed,phase,ratio){
 const a1=add(p,mul(p,mul(p,speed,q),360),phase),a2=add(p,mul(p,mul(p,speed,q),360*ratio),phase+73);
 return div(p,add(p,sin(p,a1),mul(p,.45,sin(p,a2))),1.45)
}
function reachableExpressions(p,bindings){
 const byId=new Map(p.expressions.map(e=>[e.id,e])),seen=new Set(),out=[];
 const visit=v=>{if(Array.isArray(v)){v.forEach(visit);return}if(!v||typeof v!=='object')return;if(bindingRefs(v)){if(seen.has(v.expr))return;seen.add(v.expr);const e=byId.get(v.expr);if(!e)return;out.push(e);visit(e.args);visit(e.time);visit(e.instance);return}for(const x of Object.values(v))visit(x)};
 bindings.forEach(visit);return {byId,out}
}
function markerTag(byId,binding){
 if(!bindingRefs(binding))return null;const z=byId.get(binding.expr);if(!z||z.op!=='mul'||z.args?.[0]!==0||!bindingRefs(z.args?.[1]))return null;const m=byId.get(z.args[1].expr);return m?.op==='seeded'&&typeof m.tag==='string'&&m.tag.startsWith(TAG)?m.tag.slice(TAG.length):null
}
export function cameraShakeParams(p,n){
 if(n?.type!=='camera')return null;const {byId,out}=reachableExpressions(p,[n.data.shakeX,n.data.shakeY,n.data.shakeRoll,n.data.zoom]),params={};let hasOutput=false;
 for(const e of out){if(e.op==='add'&&e.args?.length===2){const tag=markerTag(byId,e.args[1]);if(tag?.startsWith('param.'))params[tag.slice(6)]=e}
  for(const a of e.args||[]){const tag=markerTag(byId,a);if(tag?.startsWith('out.'))hasOutput=true}
 }
 return hasOutput&&PARAM_KEYS.every(k=>params[k])?params:null
}
export function cameraShakeConfig(p,n){const params=cameraShakeParams(p,n);if(!params)return null;return Object.fromEntries(PARAM_KEYS.map(k=>[k,structuredClone(params[k].args[0])]))}
export function installCameraShake(p,n,config={}){
 if(n?.type!=='camera')throw Error('Camera ShakeはCameraにだけ追加できます');const existing=cameraShakeParams(p,n);if(existing){for(const k of PARAM_KEYS)if(k in config)existing[k].args[0]=structuredClone(config[k]);return existing}
 const cfg={...cameraShakeDefaults,...config},t=expression(p,'input',undefined,{name:'localTime'}),params=Object.fromEntries(PARAM_KEYS.map(k=>[k,param(p,k,cfg[k])]));
 const q=sub(p,t,params.start),safeDuration=max(p,params.duration,0),end=add(p,params.start,safeDuration),active=mul(p,le(p,params.start,t),lt(p,t,end)),attackDen=max(p,params.attack,1e-6),decayDen=max(p,params.decay,1e-6),attack=min(p,1,max(p,0,div(p,q,attackDen))),decay=min(p,1,max(p,0,div(p,sub(p,end,t),decayDen))),env=mul(p,active,mul(p,attack,decay));
 const offset=(key,phase,ratio)=>mul(p,params[key],mul(p,env,wave(p,q,params.speed,phase,ratio)));
 const x=offset('x',11,1.83),y=offset('y',97,1.61),roll=offset('roll',173,2.07),zoom=offset('zoom',251,1.43);
 const old={x:structuredClone(n.data.shakeX),y:structuredClone(n.data.shakeY),roll:structuredClone(n.data.shakeRoll),zoom:structuredClone(n.data.zoom)};
 n.data.shakeX=add(p,old.x,add(p,x,taggedZero(p,'x')));
 n.data.shakeY=add(p,old.y,add(p,y,taggedZero(p,'y')));
 n.data.shakeRoll=add(p,old.roll,add(p,roll,taggedZero(p,'roll')));
 n.data.zoom=mul(p,old.zoom,add(p,1,add(p,zoom,taggedZero(p,'zoom'))));
 return params
}
export function setCameraShakeParam(p,n,key,value){if(!PARAM_KEYS.includes(key))throw Error('Camera Shakeの項目が不正です');const params=cameraShakeParams(p,n)||installCameraShake(p,n);params[key].args[0]=structuredClone(value);return params[key]}
export function hasCameraShake(p,n){return !!cameraShakeParams(p,n)}
