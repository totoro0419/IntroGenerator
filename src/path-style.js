import {pathMetrics,atLength} from './paths.js';
import {I,trs,clamp,lerpKeys} from './math.js';
import {paintSVG} from './assets.js';

export function ribbonLeaves(author,n,c,chunks){
 const d=n.data,r=d.ribbon,e=v=>author.value(v,c),paint=paintSVG(d.stroke.paint,e),width=e(d.stroke.width),wc=author.tracks.get(r.widthCurve),ac=author.tracks.get(r.alphaCurve);
 if(!wc||!ac)throw Error('Ribbonの幅・不透明度Curveがありません');
 const metrics=chunks.map(pathMetrics),total=metrics.reduce((s,m)=>s+m.length,0),out=[];let offset=0;
 for(const m of metrics){const count=Math.max(1,Math.ceil(m.length/r.spacingPx));if(out.length+count>author.p.profile.maxSamples)throw Error('Ribbon密度が出力予算を超えています');
  for(let i=0;i<count;i++){const sa=m.length*i/count,sb=m.length*(i+1)/count,a=atLength(m,sa),b=atLength(m,sb),u=total?(offset+sa)/total:0,v=total?(offset+sb)/total:1,wa=Math.max(0,width*lerpKeys(wc.keys,u,wc.default))/2,wb=Math.max(0,width*lerpKeys(wc.keys,v,wc.default))/2;
   const ps=[[a[0]-a[3]*wa,a[1]+a[2]*wa],[b[0]-b[3]*wb,b[1]+b[2]*wb],[b[0]+b[3]*wb,b[1]-b[2]*wb],[a[0]+a[3]*wa,a[1]-a[2]*wa]],xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]);
   out.push({body:paint.defs+`<path d="${ps.map((p,j)=>`${j?'L':'M'}${p.join(',')}`).join(' ')}Z" ${paint.attrs}/>`,bounds:[Math.min(...xs)-1,Math.min(...ys)-1,Math.max(...xs)-Math.min(...xs)+2,Math.max(...ys)-Math.min(...ys)+2],m:I,alpha:clamp(lerpKeys(ac.keys,(u+v)/2,ac.default)),suffix:'ribbon'+String(out.length).padStart(5,'0')});
  }offset+=m.length;
 }return out;
}
export function decorationLeaves(author,n,c,chunks){
 const out=[],e=v=>author.value(v,c),metrics=chunks.map(pathMetrics),total=metrics.reduce((s,m)=>s+m.length,0);
 const sample=s=>{for(const m of metrics){if(s<=m.length)return atLength(m,s);s-=m.length}return atLength(metrics.at(-1),metrics.at(-1).length)};
 for(const d of n.data.decorations){const count=d.kind==='endpoints'?2:Math.max(1,Math.floor(total/d.spacing)+1);if(count>author.p.profile.maxSamples)throw Error('曲線の装飾密度が出力予算を超えています');for(let i=0;i<count;i++){const p=sample(d.kind==='endpoints'?i*total:i*d.spacing),size=e(d.size),angle=e(d.angle)+(d.orientation==='tangent'?Math.atan2(p[3],p[2])*180/Math.PI:0);out.push({...author.image(d.asset,12,12),m:trs(p[0],p[1],size,size,angle),alpha:e(d.opacity),suffix:'dec'+d.id+String(i).padStart(5,'0'),pass:d.pass})}}
 return out;
}
