import opentype from 'opentype.js';
import {sha256} from '@noble/hashes/sha256';
import {md5} from '@noble/hashes/legacy';
import {bytesToHex} from '@noble/hashes/utils';
import {hex,clamp,point} from './math.js';
export const utf8=s=>new TextEncoder().encode(s);
export const digest=x=>bytesToHex(sha256(typeof x==='string'?utf8(x):x));
export const md5hex=x=>bytesToHex(md5(x));
export function b64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)}
export const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function canonical(x){const a=[];const add=s=>a.push(utf8(s));function walk(v){if(v===null)add('N');else if(typeof v==='boolean')add(v?'B1':'B0');else if(typeof v==='number'){if(!Number.isFinite(v)||Math.abs(v)>1e100)throw Error('非有限の数値');add('D');let b=new Uint8Array(8);new DataView(b.buffer).setFloat64(0,Object.is(v,-0)?0:v);a.push(b)}else if(typeof v==='string'){if(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(v))throw Error('不正なUnicode');let b=utf8(v);add('S'+b.length+':');a.push(b)}else if(Array.isArray(v)){add('A'+v.length+':');v.forEach(walk)}else{let keys=Object.keys(v).sort((a,b)=>{let aa=[...a].map(x=>x.codePointAt(0)),bb=[...b].map(x=>x.codePointAt(0));for(let i=0;i<Math.min(aa.length,bb.length);i++)if(aa[i]!==bb[i])return aa[i]-bb[i];return aa.length-bb.length});add('O'+keys.length+':');keys.forEach(k=>{walk(k);walk(v[k])})}}walk(x);let out=new Uint8Array(a.reduce((n,b)=>n+b.length,0)),i=0;for(let b of a){out.set(b,i);i+=b.length}return out}
export const hashObject=o=>digest(canonical(o));
export class AssetStore{
 constructor(source){this.source=source;this.fonts=new Map();this.items=[];this.map=new Map()}
 font(id){if(!this.fonts.has(id)){let a=this.source.assets.find(x=>x.id===id);if(!a?.bytesBase64)throw Error('Fontを読み込んでください: '+id);let bytes=unb64(a.bytesBase64);this.fonts.set(id,opentype.parse(bytes.buffer))}return this.fonts.get(id)}
 put(body,bounds,needsRaster=false){let [x,y,w,h]=bounds;w=Math.max(1,w);h=Math.max(1,h);let cx=-x,cy=y+h;
 const text=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><g transform="translate(${cx} ${cy}) scale(1 -1)">${body}</g></svg>`;
 const key=digest(text);if(this.map.has(key))return this.map.get(key);if(this.items.length>=this.source.profile.maxVariants)throw Error('素材バリエーションの上限です。長さ・品質設定を調整してください');let a={id:this.items.length+1,body,bounds:[x,y,w,h],text,width:w,height:h,cx,cy,needsRaster,bytes:utf8(text),format:'svg',hash:key};this.items.push(a);this.map.set(key,a.id);return a.id
 }
 putPlan(plan){const key=hashObject(plan);if(this.map.has(key))return this.map.get(key);if(this.items.length>=this.source.profile.maxVariants)throw Error('素材バリエーションの上限です');const [x,y,w,h]=plan.bounds,a={id:this.items.length+1,plan,bounds:plan.bounds,width:w,height:h,cx:-x,cy:y+h,hash:key,format:'png'};this.items.push(a);this.map.set(key,a.id);return a.id}
 async finish(){for(const a of this.items){if(a.plan){const {renderPlan}=await import('./render-plan.js');const rendered=await renderPlan(a.plan),blob=await new Promise(r=>rendered.canvas.toBlob(r,'image/png'));a.bytes=new Uint8Array(await blob.arrayBuffer());a.hash=digest(a.bytes);a.width=rendered.bounds[2];a.height=rendered.bounds[3];a.res=2;a.cx=-rendered.bounds[0]*2;a.cy=(rendered.bounds[1]+rendered.bounds[3])*2}if(a.needsRaster){if(a.width>2048||a.height>2048)throw Error('Effect素材が大きすぎます');const img=await loadImage('data:image/svg+xml;base64,'+b64(a.bytes));let c=document.createElement('canvas');c.width=Math.ceil(a.width*2);c.height=Math.ceil(a.height*2);c.getContext('2d').drawImage(img,0,0,a.width*2,a.height*2);let blob=await new Promise(r=>c.toBlob(r,'image/png'));a.bytes=new Uint8Array(await blob.arrayBuffer());a.format='png';a.hash=digest(a.bytes);a.res=2;a.width=c.width/2;a.height=c.height/2;a.cx*=2;a.cy*=2}a.name='ig_'+a.hash+'_0';a.md5=md5hex(a.bytes);a.url=`data:image/${a.format==='svg'?'svg+xml':'png'};base64,${b64(a.bytes)}`;a.image=await loadImage(a.url)}}
}
export const loadImage=url=>new Promise((resolve,reject)=>{let im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('画像を読み込めません'));im.src=url});
export function paintSVG(p,e){if(!p)return {attrs:'fill="none"',defs:''};if(p.kind==='solid')return {attrs:`fill="${hex(p.rgba.map(e))}" fill-opacity="${clamp(e(p.rgba[3]))}"`,defs:''};if(p.kind==='hsv'){let h=((e(p.hueTurns)%1)+1)%1,s=clamp(e(p.saturation)),v=clamp(e(p.value)),f=n=>v-v*s*Math.max(0,Math.min((n+h*6)%6,4-(n+h*6)%6,1));return {attrs:`fill="${hex([f(5),f(3),f(1)])}" fill-opacity="${clamp(e(p.alpha))}"`,defs:''}}
 let stops=p.stops.map(s=>`<stop offset="${clamp(s.at)}" stop-color="${hex(s.rgba.map(e))}" stop-opacity="${clamp(e(s.rgba[3]))}"/>`).join('');let body=p.kind==='radial'?`<radialGradient id="paint" gradientUnits="userSpaceOnUse" cx="${e(p.p0[0])}" cy="${e(p.p0[1])}" r="${e(p.radius)}">${stops}</radialGradient>`:`<linearGradient id="paint" gradientUnits="userSpaceOnUse" x1="${e(p.p0[0])}" y1="${e(p.p0[1])}" x2="${e(p.p1[0])}" y2="${e(p.p1[1])}">${stops}</linearGradient>`;return {attrs:'fill="url(#paint)"',defs:`<defs>${body}</defs>`}
}
export function shapeGeometry(n,e){const d=n.data,p=Object.fromEntries(Object.entries(d.params).map(([k,v])=>[k,e(v)])),w=p.width,h=p.height,r=p.radius,t=p.thickness;let body='',bounds=[-Math.max(w/2,r)-5,-Math.max(h/2,r)-5,Math.max(w,r*2)+10,Math.max(h,r*2)+10];const polygon=(N,r1=r,r2=null)=>Array.from({length:N},(_,i)=>{let a=(i/N*360+90)*Math.PI/180,rr=r2!==null&&i%2?r2:r1;return `${rr*Math.cos(a)},${rr*Math.sin(a)}`}).join(' ');
 switch(d.shape){case 'circle':case 'dot':body=`<circle r="${r}"/>`;break;case 'ring':body=`<path fill-rule="evenodd" d="M ${r} 0 A ${r} ${r} 0 1 0 ${-r} 0 A ${r} ${r} 0 1 0 ${r} 0 M ${Math.max(0,r-t)} 0 A ${Math.max(0,r-t)} ${Math.max(0,r-t)} 0 1 1 ${-Math.max(0,r-t)} 0 A ${Math.max(0,r-t)} ${Math.max(0,r-t)} 0 1 1 ${Math.max(0,r-t)} 0"/>`;break;
 case 'arc':{let pts=Array.from({length:Math.max(2,Math.ceil(Math.abs(p.sweepAngle)/4)+1)},(_,i,a)=>i);let N=pts.length;body=`<path d="${pts.map((_,i)=>{let a=(p.startAngle+p.sweepAngle*i/(N-1))*Math.PI/180;return `${i?'L':'M'}${r*Math.cos(a)},${r*Math.sin(a)}`}).join(' ')}" fill="none" stroke="currentColor" stroke-width="${t}"/>`;break}
 case 'triangle':case 'diamond':case 'polygon':body=`<polygon points="${polygon(d.shape==='triangle'?3:d.shape==='diamond'?4:Math.max(3,p.sides))}"/>`;break;
 case 'star':case 'burst':case 'spark':body=`<polygon points="${polygon(Math.max(4,p.points*2),r,p.innerRadius)}"/>`;break;
 case 'shard':body=`<polygon points="${-w/2},${-h/3} ${w/2},${-h/2} ${w*.12},${h/2}"/>`;break;
 case 'arrow':body=`<polygon points="${-w/2},${-h/6} ${w/6},${-h/6} ${w/6},${-h/2} ${w/2},0 ${w/6},${h/2} ${w/6},${h/6} ${-w/2},${h/6}"/>`;break;
 case 'chevron':body=`<polygon points="${-w/2},${-h/2} ${w/2},0 ${-w/2},${h/2} ${-w/2+t},${h/2-t} ${w/2-t},0 ${-w/2+t},${-h/2+t}"/>`;break;
 case 'frame':case 'bracket':body=`<path d="M${-w/2},${-h/2}h${w}v${h}h${-w}z M${-w/2+t},${-h/2+t}v${h-2*t}h${w-2*t}v${-h+2*t}z" fill-rule="evenodd"/>`;break;
 case 'crosshair':case 'target':body=`<rect x="${-r}" y="${-t/2}" width="${2*r}" height="${t}"/><rect x="${-t/2}" y="${-r}" width="${t}" height="${2*r}"/>${d.shape==='target'?`<circle r="${r*.7}" fill="none" stroke="currentColor" stroke-width="${t}"/>`:''}`;break;
 case 'blob':case 'petal':body=`<path d="M${-r},0 C${-r},${r} ${r},${r} ${r},0 C${r},${-r} ${-r},${-r*.5} ${-r},0Z"/>`;break;
 default:body=`<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="${p.cornerRadius}"/>`;
 }
 const fill=paintSVG(d.paint,e),st=d.stroke;let style=fill.attrs+` color="${d.paint.kind==='solid'?hex(d.paint.rgba.map(e)):'#66ccff'}"`;if(st.enabled)style+=` stroke="${hex((st.paint.rgba||[1,1,1,1]).map(e))}" stroke-width="${e(st.width)}" stroke-linejoin="${st.join}"`;return {body:`${fill.defs}<g ${style}>${body}</g>`,bounds}
}
