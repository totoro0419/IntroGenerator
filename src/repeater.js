import {I,mul,trs,point,inverse,mod,clamp,random,samplePath} from './math.js';

function rectIntersectsQuad(x0,y0,x1,y1,quad){
 const rect=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]],axes=[[1,0],[0,1]];
 for(let i=0;i<quad.length;i++){const a=quad[i],b=quad[(i+1)%quad.length],dx=b[0]-a[0],dy=b[1]-a[1];if(Math.abs(dx)+Math.abs(dy)>1e-12)axes.push([-dy,dx])}
 for(const axis of axes){let qMin=Infinity,qMax=-Infinity,rMin=Infinity,rMax=-Infinity;for(const p of quad){const v=p[0]*axis[0]+p[1]*axis[1];qMin=Math.min(qMin,v);qMax=Math.max(qMax,v)}for(const p of rect){const v=p[0]*axis[0]+p[1]*axis[1];rMin=Math.min(rMin,v);rMax=Math.max(rMax,v)}if(qMax<rMin-1e-9||rMax<qMin-1e-9)return false}
 return true;
}

// Placement always uses the repeater's time. Delay/phase changes only template time.
export function repeatInstances(author,n,c,m,z,space,cameraTime,cameraId,cameraRootTime){
 const d=n.data,e=v=>author.value(v,c),scatter=n.type==='scatter';
 let cells=null,N=scatter?d.count:Math.min(d.maxCount,Math.max(0,Math.floor(e(d.count))));
 if(!scatter&&d.mode==='lattice'){
  const basis=d.basis.map(p=>p.map(e)),scroll=d.scroll.map(v=>mod(e(v),1)),bm=[...basis[0],...basis[1],0,0];
  const screen=author.project({m:mul(m,bm),z,space,cameraId,cameraRootTime},cameraTime),inv=inverse(screen.m);
  if(!inv)throw Error('格子の2軸を異なる方向にしてください');
  const w=author.p.width/2,h=author.p.height/2,ps=[[-w,-h],[w,-h],[w,h],[-w,h]].map(p=>point(inv,p));
  // Include the template's extent in grid units, so large/offset tiles are retained.
  let left=0,right=0,bottom=0,top=0;const bi=inverse(bm);
  for(const leaf of author.frame(c.masterTime,false,cameraTime,d.template,{localTime:c.localTime,forceScreen:true})){
   const b=leaf.bounds,tm=mul(bi,leaf.m);for(const p of [[b[0],b[1]],[b[0]+b[2],b[1]],[b[0],b[1]+b[3]],[b[0]+b[2],b[1]+b[3]]]){const q=point(tm,p);left=Math.min(left,q[0]);right=Math.max(right,q[0]);bottom=Math.min(bottom,q[1]);top=Math.max(top,q[1])}
  }
  const lo=[Math.floor(Math.min(...ps.map(p=>p[0]))-right-scroll[0])-1,Math.floor(Math.min(...ps.map(p=>p[1]))-top-scroll[1])-1],hi=[Math.ceil(Math.max(...ps.map(p=>p[0]))-left-scroll[0])+1,Math.ceil(Math.max(...ps.map(p=>p[1]))-bottom-scroll[1])+1];
  const candidateN=(hi[0]-lo[0]+1)*(hi[1]-lo[1]+1);if(candidateN>d.maxCount)throw Error(`画面を覆う格子は${candidateN}個必要です。最大個数を増やしてください`);
  cells=[];for(let y=lo[1];y<=hi[1];y++)for(let x=lo[0];x<=hi[0];x++){
   const tx=x+scroll[0],ty=y+scroll[1];if(!rectIntersectsQuad(tx+left,ty+bottom,tx+right,ty+top,ps))continue;
   cells.push({x,y,m:mul(bm,trs(tx,ty))});
  }
  N=cells.length;
 }
 if(N>author.p.profile.maxDraws)throw Error('複製が描画予算を超えています');
 const out=[];for(let i=0;i<N;i++){
  const placement={...c,index:i,count:N},ex=v=>author.value(v,placement),ic={...placement};let pm=I,offset=[0,0,0],alpha=1;
  if(scatter){const u=random(d.seed,n.id+i+'x'),v=random(d.seed,n.id+i+'y'),angle=2*Math.PI*v,scale=author.distribution(d.scale,n.id+':'+d.seed+':'+i+'s');pm=trs(d.region==='disk'?Math.sqrt(u)*e(d.size[0])*Math.cos(angle):(u-.5)*e(d.size[0]),d.region==='disk'?Math.sqrt(u)*e(d.size[1])*Math.sin(angle):(v-.5)*e(d.size[1]),scale,scale,author.distribution(d.rotation,n.id+':'+d.seed+':'+i+'r'));ic.localTime-=author.distribution(d.delay,n.id+':'+d.seed+':'+i+'delay')}
  else{
   const angle=ex(d.rotationStep)*i,dx=ex(d.offset[0]),dy=ex(d.offset[1]);
   if(cells)pm=cells[i].m;
   else if(d.mode==='radial')pm=mul(trs(0,0,1,1,360*i/N),trs(ex(d.radius),0,1,1,angle));
   else if(d.mode==='grid'){const columns=Math.max(1,Math.floor(ex(d.columns)));pm=trs(mod(i,columns)*dx,Math.floor(i/columns)*dy,1,1,angle)}
   else if(d.mode==='path'){const path=author.nodes.get(d.path),pc=path&&author.contextAt(path.id,c.masterTime);if(!pc)throw Error('Pathを選んでください');const p=samplePath(author.path(path,pc.c),ex(d.u0)+i*ex(d.uStep)),inverseParent=inverse(m);if(!inverseParent)continue;const relative=mul(inverseParent,pc.m),xy=point(relative,p),tangent=point([...relative.slice(0,4),0,0],p.slice(2));pm=trs(...xy,1,1,Math.atan2(tangent[1],tangent[0])*180/Math.PI+angle)}
   else pm=trs(dx*i,dy*i,1,1,angle);
   pm=mul(pm,trs(0,0,ex(d.scaleStep[0])**i,ex(d.scaleStep[1])**i));alpha=clamp(ex(d.opacityStep)**i);offset=d.colorStep.map(v=>ex(v)*i/255);
   ic.localTime=c.localTime-ex(d.delay)*i+ex(d.phaseStep)*i*(author.nodes.get(d.template)?.time.duration||1);
  }
  out.push({c:ic,m:mul(m,pm),alpha,colorOffset:offset,key:cells?`cell${cells[i].x}_${cells[i].y}`:'i'+i,index:i});
 }
 return out;
}
