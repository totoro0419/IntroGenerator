import {I,point,inverse,trs,clamp,mod,rad,random,vdc,lerpKeys} from './math.js';

// Invert the current affine/wrapped branch through all parents, not only the emitter rate.
export function birthMasterTime(author,id,localBirth,now){
 const chain=[];let n=author.nodes.get(id);while(n){chain.push(n);n=author.nodes.get(n.parent)}chain.reverse();
 const states=[];let parent=now;for(const node of chain){const raw=(parent-node.time.start)*node.time.rate+node.time.offset;states.push({node,parent,raw});parent=author.time(node,parent,{masterTime:now,localTime:parent,index:0,count:1})}
 let q=localBirth;for(const {node,parent,raw} of states.reverse()){const tm=node.time;if(tm.remap!==null)throw Error('粒子のTime Remapには時刻逆写像の実装が必要です');if(tm.rate===0)return now;
  if(tm.wrap==='loop')q+=Math.floor(raw/tm.duration)*tm.duration;
  if(tm.wrap==='pingpong'){const k=Math.floor(raw/tm.duration);q=k*tm.duration+(mod(k,2)?tm.duration-q:q)}
  q=(q-tm.offset)/tm.rate+tm.start;
 }return q;
}
function emissionBirths(author,n,c,q){
 const d=n.data,key='emission:'+n.id+':'+c.index+':'+q;author.particleCache??=new Map();if(author.particleCache.has(key))return author.particleCache.get(key);
 const births=d.bursts.flatMap((b,k)=>Array.from({length:b.count},(_,i)=>({time:b.time,order:k,ordinal:i}))),maximum=author.p.profile.maxDraws*4;
 if(typeof d.rate==='number'){if(d.rate>0)for(let i=1;i<=Math.floor(d.rate*Math.max(0,q)+1e-10);i++){if(births.length>=maximum)throw Error('粒子の発生数が出力予算を超えています');births.push({time:i/d.rate,order:d.bursts.length,ordinal:i})}}
 else if(q>0){
  const rate=t=>Math.max(0,author.value(d.rate,{...c,localTime:t})),panels=[],integrate=(a,b,fa,fm,fb,estimate,tol,depth)=>{const m=(a+b)/2,l=(a+m)/2,r=(m+b)/2,fl=rate(l),fr=rate(r),left=(m-a)*(fa+4*fl+fm)/6,right=(b-m)*(fm+4*fr+fb)/6;
   if(depth>22||panels.length>20000)throw Error('粒子の発生率が複雑すぎます');if(Math.abs(left+right-estimate)<=15*tol){panels.push({a,b,area:left+right+(left+right-estimate)/15});return}
   integrate(a,m,fa,fl,fm,left,tol/2,depth+1);integrate(m,b,fm,fr,fb,right,tol/2,depth+1);
  };
  // Split at track boundaries before integration, including discontinuous HOLD keys.
  const cuts=[0,...[...author.tracks.values()].flatMap(t=>t.keys.map(k=>k.time)).filter(t=>t>0&&t<q),q].sort((a,b)=>a-b);let area=0,next=1;
  for(let i=1;i<cuts.length;i++){const a=cuts[i-1],b=cuts[i];if(b-a<1e-12)continue;const fa=rate(a),fm=rate((a+b)/2),fb=rate(b-Math.min(1e-10,(b-a)*1e-5));integrate(a,b,fa,fm,fb,(b-a)*(fa+4*fm+fb)/6,1e-10,0)}
  for(const panel of panels){while(next<=area+panel.area+1e-10){let lo=panel.a,hi=panel.b;const target=next-area;for(let j=0;j<44&&hi-lo>1e-9;j++){const mid=(lo+hi)/2,N=32,h=(mid-panel.a)/N;let integral=rate(panel.a)+rate(mid);for(let k=1;k<N;k++)integral+=(k%2?4:2)*rate(panel.a+k*h);if(integral*h/3<target)lo=mid;else hi=mid}births.push({time:(lo+hi)/2,order:d.bursts.length,ordinal:next++});if(births.length>maximum)throw Error('粒子の発生数が出力予算を超えています')}area+=panel.area}
 }
 births.sort((a,b)=>a.time-b.time||a.order-b.order||a.ordinal-b.ordinal);author.particleCache.set(key,births);if(author.particleCache.size>32)author.particleCache.delete(author.particleCache.keys().next().value);return births;
}
export function particleLeaves(author,n,c,space,cameraId,cameraRootTime){
 const d=n.data,q=c.localTime,t=c.masterTime,out=[],births=emissionBirths(author,n,c,q);if(!d.assets.length)return out;
 for(let i=0;i<births.length;i++){
  const birth=births[i].time,age=q-birth,tag=n.id+':'+d.seed+':'+i,life=author.distribution(d.life,tag+'life');if(age<0||age>=life||life<=0)continue;
  const tb=birthMasterTime(author,n.id,birth,t),owner=author.contextAt(d.emitter||n.id,d.space==='follow'?t:tb);if(!owner)continue;
  const bc={...c,masterTime:tb,localTime:birth,index:i,age:0,normalizedAge:0,birthTime:birth},pc={...c,index:i,age,normalizedAge:age/life,birthTime:birth},e=v=>author.value(v,bc),vel=d.velocity.map((v,j)=>author.distribution(v,tag+'v'+j)),pos=[d.spawnX,d.spawnY,d.spawnZ].map((v,j)=>author.distribution(v,tag+'p'+j));
  if(d.radialLaunch){const launch=d.radialLaunch,u=launch.distribution==='distributed'?mod(vdc(i+1)+random(d.seed,n.id),1):random(d.seed,tag),angle=rad(e(launch.angleStart)+e(launch.angleSpan)*u),speed=author.distribution(launch.speed,tag+'speed');vel[0]+=speed*Math.cos(angle);vel[1]+=speed*Math.sin(angle)}
  let origin=point(owner.m,pos),velocity=point([...owner.m.slice(0,4),0,0],vel),acc=d.acceleration.map(e),z=owner.z+pos[2];
  if(d.accelerationSpace==='birthLocal')acc=[...point([...owner.m.slice(0,4),0,0],acc),acc[2]];
  if(d.space==='viewAttached'){const projection=author.project({m:I,z,space:'world',cameraId,cameraRootTime},tb),inv=inverse(projection.m);if(!inv||projection.alpha===0)continue;origin=point(inv,origin);velocity=point([...inv.slice(0,4),0,0],velocity)}
  let inherited=[0,0];if(d.space!=='follow'&&e(d.inheritVelocity)!==0){const h=1e-5,right=author.contextAt(d.emitter||n.id,tb+h);if(right)inherited=[(right.m[4]-owner.m[4])/h,(right.m[5]-owner.m[5])/h].map(v=>v*e(d.inheritVelocity)*(t-tb))}
  const xy=[origin[0]+velocity[0]*age+.5*acc[0]*age*age+inherited[0],origin[1]+velocity[1]*age+.5*acc[1]*age*age+inherited[1]],scurve=author.tracks.get(d.scaleCurve),acurve=author.tracks.get(d.alphaCurve),scale=author.distribution(d.scale,tag+'scale')*lerpKeys(scurve.keys,age/life,scurve.default),alpha=author.value(d.alpha,pc)*lerpKeys(acurve.keys,age/life,acurve.default);
  out.push({...author.image(d.assets[i%d.assets.length],60,60),m:trs(...xy,scale,scale,author.distribution(d.rotation,tag+'rot')+author.distribution(d.spin,tag+'spin')*age),z:z+vel[2]*age+.5*acc[2]*age*age,alpha,suffix:'particle'+i,absolute:true,space:d.space==='screen'?'screen':space});
 }return out;
}
