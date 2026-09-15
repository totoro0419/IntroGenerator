import profile from '../schemas/export-profile.json';
import {beats,beatAtSeconds,random,validateTempo} from './math.js';
import {AUTHORING_FORMAT,stackFromPrimitive} from './easing-stack.js';
export const uid=()=>`n${crypto.randomUUID().replaceAll('-','')}`;
export const solid=(rgba=[.38,.8,1,1])=>({kind:'solid',rgba});
export const stroke=()=>({enabled:false,width:2,paint:solid(),space:'geometric',cap:'round',join:'round',miterLimit:4,uniformAlpha:true});
export const constant=value=>({kind:'constant',value});
export function node(type,name=type,parent='root'){let n={id:uid(),name,parent,children:[],enabled:true,space:'inherit',time:{start:0,end:6,rate:1,offset:0,wrap:'none',duration:6,remap:null},transform:{position:[0,0,0],anchor:[0,0],scale:[1,1],rotation:0},opacity:1,opacityMode:'inherit',blend:'sourceOver',effects:[],type,data:{}};
 const shape=type==='shape';if(shape)n.data={shape:'ring',params:{width:160,height:100,radius:90,innerRadius:70,thickness:4,cornerRadius:0,sides:6,points:8,startAngle:0,sweepAngle:300,tipRatio:.35,seed:1},paint:solid(),stroke:stroke()};
 if(type==='text')n.data={text:'TTRO',direction:'ltr',runs:[{from:0,to:4,font:'defaultFont',fontSize:64,axes:{},features:{},language:'en'}],boxWidth:440,align:'center',tracking:2,lineHeight:76,anchorBox:'layout',dynamicReflow:false,paint:solid([1,1,1,1]),stroke:stroke(),animators:[]};
 if(type==='path')n.data={segments:[],spline:null,bezier:{points:[[-150,-50],[-80,110],[40,-100],[150,50]]},closed:false,fill:null,stroke:{...stroke(),enabled:true,width:3},trimStart:0,trimEnd:1,ribbon:null,decorations:[]};
 if(type==='camera')n.data={projection:'orthographic',zoom:1,focal:300,near:1,far:2000,shakeX:0,shakeY:0,shakeRoll:0};
 if(type==='composition'){n.data={width:480,height:360,duration:6,clip:false};n.opacityMode='isolated'}
 if(type==='repeater')n.data={template:'',mode:'radial',count:24,maxCount:24,columns:6,radius:105,offset:[60,60],rotationStep:15,scaleStep:[1,1],opacityStep:1,colorStep:[0,0,0],phaseStep:0,delay:0,path:null,u0:0,uStep:1/24,basis:[[60,0],[0,60]],scroll:[0,0],order:'instanceMajor'};
 if(type==='scatter')n.data={template:'',count:24,seed:1,region:'disk',size:[160,160],rotation:{kind:'uniform',min:0,max:360},scale:{kind:'uniform',min:.3,max:1},delay:constant(0)};
 if(type==='particle')n.data={emitter:null,space:'world',seed:1,rate:12,bursts:[{time:0,count:24}],life:constant(3),spawnX:constant(0),spawnY:constant(0),spawnZ:constant(0),velocity:[constant(0),constant(0),constant(0)],acceleration:[0,0,0],inheritVelocity:0,rotation:constant(0),spin:constant(45),scale:constant(.15),alpha:1,scaleCurve:'particleScale',alphaCurve:'particleAlpha',assets:['shardAsset'],accelerationSpace:'world',radialLaunch:{angleStart:0,angleSpan:360,speed:constant(75),distribution:'distributed'}};
 if(type==='image')n.data={asset:'',crop:[0,0,100,100],width:120,height:120,fit:'contain'};
 if(type==='clip')n.data={assets:['shardAsset'],times:[0],duration:1};
 if(type==='follower')n.data={path:'',u:0,orient:true,rotationOffset:0,asset:'glowAsset'};
 if(type==='trail')n.data={source:'',mode:'temporal',count:24,duration:.3,widthCurve:'particleScale',alphaCurve:'particleAlpha',asset:'glowAsset'};
 if(type==='instance')n.data={definition:'',overrides:[]};
 if(type==='view'){n.space='screen';n.data={camera:'',worldRoot:'',backgroundRoot:null,overlayRoot:null,viewport:[-240,-180,480,360],clip:true,sort:'painter'}}
 return n
}
export function makeProject(){let root=node('group','Main scene',null);root.id='root';let p={format:AUTHORING_FORMAT,projectId:uid(),width:480,height:360,duration:6,fit:'contain',background:[.025,.035,.065,1],seed:1,root:'root',definitions:[],nodes:[root],expressions:[],tracks:[{id:'particleScale',unit:'scalar',default:1,keys:[]},{id:'particleAlpha',unit:'alpha',default:1,keys:[{id:'pa0',time:0,value:1,ease:stackFromPrimitive({kind:'linear'},'pa0')},{id:'pa1',time:1,value:0,ease:stackFromPrimitive({kind:'linear'},'pa1')}]}],assets:[],audio:[],tempo:[{beat:0,bpm:120}],profile:{...profile,id:'portable-v1',timeMode:'sampled',sampleFPS:30},timeAnchors:[],markers:[]};return p}
export function addNode(p,n,parent=p.root){n.parent=parent;n.time.end=p.duration;n.time.duration=p.duration;p.nodes.push(n);p.nodes.find(x=>x.id===parent).children.push(n.id);return n}
export function input(p,name){let e=p.expressions.find(e=>e.op==='input'&&e.name===name);if(!e){e={id:uid(),op:'input',name};p.expressions.push(e)}return {expr:e.id}}
export function expression(p,op,args){let e={id:uid(),op,args};p.expressions.push(e);return {expr:e.id}}
export function animate(p,obj,key,values,unit='scalar'){const tr={id:uid(),unit,default:values[0][1],keys:values.map(([time,value,kind='cubicOut'])=>{const id=uid();return{id,time,value,ease:stackFromPrimitive({kind},id)}})};p.tracks.push(tr);let e={id:uid(),op:'track',track:tr.id,time:input(p,'localTime')};p.expressions.push(e);obj[key]={expr:e.id};return tr}
export function timingAnchor(p,target,owner,key=null){return (p.timeAnchors||[]).find(a=>a.target===target&&a.owner===owner&&(a.key??null)===(key??null))||null}
export function timingValue(p,unit,seconds){return unit==='beats'?beatAtSeconds(p.tempo,seconds):seconds}
function anchorLocation(p,a){
 if(a.target==='keyframe'){const tr=p.tracks.find(t=>t.id===a.owner);if(!tr)throw Error('Time AnchorのTrack参照がありません: '+a.owner);const k=tr.keys.find(k=>k.id===a.key);if(!k)throw Error('Time AnchorのKey参照がありません: '+a.key);return {get:()=>k.time,set:v=>k.time=v}}
 if(a.target==='audioStart'){const audio=p.audio.find(x=>x.id===a.owner);if(!audio)throw Error('Time AnchorのAudio参照がありません: '+a.owner);return {get:()=>audio.start,set:v=>audio.start=v}}
 if(a.target==='nodeStart'||a.target==='nodeEnd'){const n=p.nodes.find(n=>n.id===a.owner);if(!n)throw Error('Time AnchorのNode参照がありません: '+a.owner);const key=a.target==='nodeStart'?'start':'end';return {get:()=>n.time[key],set:v=>n.time[key]=v}}
 throw Error('Time Anchorのtargetが不正です: '+a.target)
}
function validateAnchorTable(p,checkCache){
 const ids=new Set(),targets=new Set();
 for(const a of p.timeAnchors||[]){
  if(ids.has(a.id))throw Error('Time Anchor IDの重複: '+a.id);ids.add(a.id);
  if(a.unit!=='seconds'&&a.unit!=='beats')throw Error('Time Anchorの単位が不正です');
  const key=a.key??null;if(a.target==='keyframe'&&key===null)throw Error('Keyframe AnchorにKey IDがありません');if(a.target!=='keyframe'&&key!==null)throw Error('Keyframe以外のAnchorにKey IDを指定できません');
  const sig=`${a.target}\u0000${a.owner}\u0000${key??''}`;if(targets.has(sig))throw Error('同じ時刻にTime Anchorを複数設定できません');targets.add(sig);
  if(!Number.isFinite(a.value))throw Error('Time Anchorの値が不正です');const location=anchorLocation(p,a);
  if(checkCache){const expected=a.unit==='beats'?beats(p.tempo,a.value):a.value;if(Math.abs(location.get()-expected)>1e-9)throw Error('Time Anchorと保存済み秒値が一致しません: '+a.id)}
 }
 const markerIds=new Set();for(const m of p.markers||[]){if(markerIds.has(m.id))throw Error('Marker IDの重複: '+m.id);markerIds.add(m.id);if((m.unit!=='seconds'&&m.unit!=='beats')||!Number.isFinite(m.value))throw Error('Markerの時刻が不正です')}
}
export function validateTiming(p){validateTempo(p.tempo);validateAnchorTable(p,true);for(const t of p.tracks){for(let i=1;i<t.keys.length;i++)if(t.keys[i].time<=t.keys[i-1].time)throw Error('Keyframe時刻は厳密に増加する必要があります: '+t.id)}for(const n of p.nodes)if(n.time.start>n.time.end)throw Error('開始が終了より後です: '+n.id);return true}
export function syncTiming(p){validateTempo(p.tempo);validateAnchorTable(p,false);for(const a of p.timeAnchors||[]){const seconds=a.unit==='beats'?beats(p.tempo,a.value):a.value;anchorLocation(p,a).set(seconds)}for(const t of p.tracks){t.keys.sort((a,b)=>a.time-b.time);if(t.keys.some((k,i)=>i&&k.time===t.keys[i-1].time))throw Error('BPM変更でキーフレームが重なります: '+t.id)}for(const n of p.nodes)if(n.time.start>n.time.end)throw Error('開始が終了より後です: '+n.id);validateTiming(p);return p}
export function removeNode(p,id){const ids=new Set([id]);for(let i=0;i<p.nodes.length;i++)for(const n of p.nodes)if(ids.has(n.parent))ids.add(n.id);p.nodes=p.nodes.filter(n=>!ids.has(n.id));for(const n of p.nodes)n.children=n.children.filter(x=>!ids.has(x));p.timeAnchors=p.timeAnchors.filter(x=>!ids.has(x.owner))}
export function cloneNode(p,id,parent){
 const src=p.nodes.find(n=>n.id===id),map=new Map(),all=[],todo=[src],exprMap=new Map(),trackMap=new Map();
 while(todo.length){const n=todo.shift();map.set(n.id,uid());all.push(n);todo.push(...n.children.map(id=>p.nodes.find(n=>n.id===id)))}
 function copyExpr(id){if(exprMap.has(id))return exprMap.get(id);const original=p.expressions.find(e=>e.id===id);if(!original)throw Error('式の参照がありません');const e=structuredClone(original);e.id=uid();exprMap.set(id,e.id);if(e.op==='track'){if(!trackMap.has(e.track)){const tr=structuredClone(p.tracks.find(t=>t.id===e.track));const old=tr.id;tr.id=uid();tr.keys.forEach(k=>k.id=uid());trackMap.set(old,tr.id);p.tracks.push(tr)}e.track=trackMap.get(e.track)}walk(e);p.expressions.push(e);return e.id}
 function walk(o){if(!o||typeof o!=='object')return;for(const k of Object.keys(o)){if(k==='expr')o[k]=copyExpr(o[k]);else walk(o[k])}}
 for(const n of all){const c=structuredClone(n);c.id=map.get(n.id);c.parent=n.id===id?(parent??src.parent):map.get(n.parent);c.children=c.children.map(x=>map.get(x));for(const k of ['template','definition','path','emitter'])if(map.has(c.data[k]))c.data[k]=map.get(c.data[k]);walk(c);if(n.id===id)c.name+=' copy';p.nodes.push(c)}p.nodes.find(n=>n.id===(parent??src.parent)).children.push(map.get(id));return map.get(id)
}
