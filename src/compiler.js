import Ajv from 'ajv/dist/2020.js';
import schema from '../schemas/authoring.schema.json';
import ABI from '../schemas/runtime-abi.json';
import {AssetStore,hashObject,b64} from './assets.js';
import {AuthorEvaluator} from './author.js';
import {I,trs,point,clamp,rgbInt} from './math.js';
import {gzipSync,strToU8} from 'fflate';
const validate=new Ajv({strict:false,allErrors:false}).compile(schema);
export function validateSource(p){
 if(!validate(p))throw Error('編集データが仕様と一致しません: '+validate.errors[0].instancePath+' '+validate.errors[0].message);
 const nodes=new Map();for(const n of p.nodes){if(nodes.has(n.id))throw Error('Node IDの重複');nodes.set(n.id,n)}
 if(!nodes.has(p.root)||nodes.get(p.root).parent!==null)throw Error('Root参照が不正です');
 for(const n of p.nodes){if(new Set(n.children).size!==n.children.length)throw Error('Child参照の重複');for(const id of n.children){const c=nodes.get(id);if(!c||c.parent!==n.id)throw Error('親子参照が一致しません')}if(n.parent!==null&&!nodes.get(n.parent)?.children.includes(n.id))throw Error('親参照が一致しません')}
 const done=new Set();for(const n of p.nodes){let cur=n,seen=new Set();while(cur&&!done.has(cur.id)){if(seen.has(cur.id))throw Error('Groupの親子関係が循環しています');seen.add(cur.id);cur=nodes.get(cur.parent)}for(const id of seen)done.add(id)}
 return true
}
export const row=(L,table,values)=>{ABI.tables[table].forEach((k,i)=>L[k].push(values[i]));return L[ABI.tables[table][0]].length};
export function nextDown(x){let b=new ArrayBuffer(8),v=new DataView(b);v.setFloat64(0,x);v.setBigUint64(0,v.getBigUint64(0)-1n);return v.getFloat64(0)}
export async function compile(source,onProgress=()=>{},signal){validateSource(source);let p=structuredClone(source);if(p.audio?.length)throw Error("音声の出力は未対応です。音声を含む作品の書き出しは中止しました");if(p.duration>120)throw Error('この版の書き出しは120秒までです');let assets=new AssetStore(p),author=new AuthorEvaluator(p,assets),fps=p.profile.sampleFPS,frames=Math.ceil(p.duration*fps),times=Array.from({length:frames},(_,i)=>i/fps),map=new Map();
 const base=[1,0,0,1,0,0,0,1,1,0,0,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0];
 for(let f=0;f<frames;f++){if(signal?.aborted)throw Error('キャンセルしました');const leaves=author.frame(times[f]);if(leaves.length>p.profile.maxDraws)throw Error('描画数の予算を超えています');for(let leaf of leaves){let m=leaf.m,s=Math.hypot(m[0],m[1]),theta=Math.atan2(m[1],m[0]),body=leaf.body,bounds=leaf.bounds;if(s<1e-10||leaf.alpha<=0)continue;
 let c=Math.cos(theta),sn=Math.sin(theta),h=[(c*m[0]+sn*m[1])/s,(-sn*m[0]+c*m[1])/s,(c*m[2]+sn*m[3])/s,(-sn*m[2]+c*m[3])/s,0,0];
 if(Math.abs(h[2])+Math.abs(h[1])+Math.abs(h[3]-1)>1e-7){h=h.map(x=>+x.toFixed(6));body=`<g transform="matrix(${h.join(' ')})">${body}</g>`;let [x,y,w,hh]=bounds,ps=[[x,y],[x+w,y],[x+w,y+hh],[x,y+hh]].map(p=>point(h,p)),xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)]}
 let aid=assets.put(body,bounds,leaf.needsRaster),v=[...base];v.splice(0,6,...trs(m[4],m[5],s,s,theta*180/Math.PI));v[6]=leaf.z;v[7]=clamp(leaf.alpha);v[10]=leaf.color||0;v[11]=leaf.brightness||0;v[12]=aid;
 let entry=map.get(leaf.key);if(!entry){entry={key:leaf.key,order:leaf.order,nodeId:leaf.nodeId,values:new Map(),asset:aid};map.set(leaf.key,entry)}entry.values.set(f,v)}
 if(f%8===0){onProgress(f/frames*.7);await new Promise(r=>setTimeout(r,0))}}
 await assets.finish();onProgress(.82);let L=Object.fromEntries(Object.keys(ABI.columnTypes).map(k=>[k,[]]));L.IG_MODULE=['core@1.1'];L.I_SORT=[0];row(L,'ease',[0,0,0,0]);let trackMap=new Map();
 function track(values){let key=JSON.stringify(values);if(trackMap.has(key))return trackMap.get(key);let first=L.K_TIME.length+1,count=0;for(let f=0;f<values.length;f++){if(f===0||values[f]!==values[f-1]){row(L,'key',[times[f],values[f],1]);count++}}let id=row(L,'track',[first,count,values[0]]);trackMap.set(key,id);return id}
 let entries=[...map.values()].sort((a,b)=>a.order.localeCompare(b.order));
 for(let [i,en] of entries.entries()){let values=times.map((_,f)=>en.values.get(f)||[...base.slice(0,20),0,...base.slice(21)]);let first=L.O_CODE.length+1;row(L,'instruction',[1,33,0,0,0]);for(let j=0;j<32;j++){let vals=values.map(v=>v[j]);if(vals.every(v=>v===vals[0]))row(L,'instruction',[0,j+1,0,0,vals[0]]);else{let tid=track(vals),start=L.OA_SLOT.length+1;L.OA_SLOT.push(33);row(L,'instruction',[23,j+1,start,1,tid])}}let prog=row(L,'program',[0,first,L.O_CODE.length-first+1,33,1,32]);let d=row(L,'template',[1,prog,en.asset,0,0,0,0,1]);row(L,'command',[0,d,1,0,0,p.duration,1,i+1])}
 for(let a of assets.items){row(L,'asset',[a.id,a.name,a.width,a.height,a.cx,a.cy,a.res||1,1,a.hash,0,1e6])}
 let fit=p.fit==='contain'?Math.min(480/p.width,360/p.height):Math.max(480/p.width,360/p.height);let src=b64(gzipSync(strToU8(JSON.stringify(p))));L.IG_SOURCE=src.match(/.{1,4096}/g)||[];
 L.IG_HEADER=['IGRT/1.1',p.duration,fps,p.width,p.height,fit,rgbInt(p.background),p.profile.id,1,p.profile.maxDraws,4096,2,p.profile.maxSamples,256,hashObject(p),'','','','gzip-base64-json-v1',nextDown(p.duration),0,fps,1e100,assets.items.length+1];
 for(let [k,v] of Object.entries(L))if(v.length>200000)throw Error('Scratch Listの上限: '+k);
 let result={abi:'IGRT/1.1',lists:L,assets:assets.items,source:p,report:{frames,fps,commands:entries.length,assets:assets.items.length,mode:'sampled',warnings:[...author.warnings],sourceNodes:p.nodes.length},entries};onProgress(1);return result
}
