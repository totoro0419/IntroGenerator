import {I,inverse,point,mul} from './math.js';
import {AuthorEvaluator} from './author.js';
import {AssetStore} from './assets.js';
import {expression} from './model.js';

function hits(h,p){if(h.segment){const [a,b]=h.segment,dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,u=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return Math.hypot(p[0]-a[0]-dx*u,p[1]-a[1]-dy*u)<h.radius}if(h.polygon){let inside=false;for(let i=0,j=h.polygon.length-1;i<h.polygon.length;j=i++){const a=h.polygon[i],b=h.polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}return Math.hypot(h.x-p[0],h.y-p[1])<Math.max(20,h.radius)}
export function installCanvasEditor(canvas,{state,selected,select,commit,draw,toast}){
 let drag=null;
 const evaluator=()=>new AuthorEvaluator(state.p,new AssetStore(state.p));
 const coordinates=e=>{const r=canvas.getBoundingClientRect();return [(e.clientX-r.left)*canvas.width/r.width,(e.clientY-r.top)*canvas.height/r.height]};
 const factor=()=>Math.min(canvas.width/480,canvas.height/360)*state.compiled.lists.IG_HEADER[5];
 function spaceOf(n){while(n){if(n.space!=='inherit')return n.space;n=state.p.nodes.find(x=>x.id===n.parent)}return 'world'}
 function matrix(n,parent=false){const a=evaluator(),own=a.contextAt(n.id,state.t),ctx=parent?(a.contextAt(n.parent,state.t)||{m:I,z:0}):own;if(!ctx)return null;return a.project({m:ctx.m,z:own?.z??ctx.z,space:spaceOf(n)},state.t).m}
 const points=n=>n?.type==='path'?(n.data.bezier?.points||n.data.spline?.points):null;
 function handles(){const n=selected(),ps=points(n);if(!ps||!state.compiled)return [];const m=matrix(n);if(!m)return [];const a=evaluator(),c=a.contextAt(n.id,state.t)?.c;if(!c)return [];const sc=factor();return ps.map((p,i)=>{const xy=point(m,p.map(v=>a.value(v,c)));return {i,x:canvas.width/2+xy[0]*sc,y:canvas.height/2-xy[1]*sc}})}
 function overlay(){const hs=handles(),ctx=canvas.getContext('2d');ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.strokeStyle='#ffc267';ctx.fillStyle='#172229';ctx.lineWidth=2;for(const h of hs){const dx=drag?.point===h.i?drag.pixel[0]:0,dy=drag?.point===h.i?drag.pixel[1]:0;ctx.beginPath();ctx.arc(h.x+dx,h.y+dy,6,0,Math.PI*2);ctx.fill();ctx.stroke()}ctx.restore()}
 canvas.style.touchAction='none';canvas.onpointerdown=e=>{
  if(!state.runtime||e.button>0)return;const start=coordinates(e),handle=handles().find(h=>Math.hypot(start[0]-h.x,start[1]-h.y)<14);let n=selected();
  if(!handle){const hit=[...state.runtime.hit].reverse().find(h=>h.nodeId&&hits(h,start));if(!hit)return;select(hit.nodeId);n=selected()}
  if(!n)return;const inv=inverse(matrix(n,!handle)||I);if(!inv)return toast('倍率が0の座標空間では移動できません',true);
  state.audio?.stop();state.playing=false;drag={node:n,point:handle?.i,start,pixel:[0,0],inv};canvas.setPointerCapture(e.pointerId);e.preventDefault();draw();
 };
 canvas.onpointermove=e=>{if(!drag)return;const xy=coordinates(e);drag.pixel=[xy[0]-drag.start[0],xy[1]-drag.start[1]];if(drag.point===undefined){const ids=new Set([drag.node.id]);for(let i=0;i<state.p.nodes.length;i++)for(const n of state.p.nodes)if(ids.has(n.parent))ids.add(n.id);state.runtime.drag={ids,offset:[drag.pixel[0]/factor(),-drag.pixel[1]/factor()]}}draw()};
 const finish=(e,cancel)=>{if(!drag)return;const d=drag;drag=null;delete state.runtime.drag;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);if(!cancel&&Math.hypot(...d.pixel)>2){const delta=point([...d.inv.slice(0,4),0,0],[d.pixel[0]/factor(),-d.pixel[1]/factor()]);commit(()=>{const target=d.point===undefined?d.node.transform.position:points(d.node)[d.point];for(let i=0;i<2;i++)target[i]=typeof target[i]==='number'?target[i]+delta[i]:expression(state.p,'add',[target[i],delta[i]])})}else draw()};
 canvas.onpointerup=e=>finish(e,false);canvas.onpointercancel=e=>finish(e,true);return {overlay};
}
