export const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
export const mod=(x,n)=>((x%n)+n)%n;
export const rad=x=>x*Math.PI/180;
export const I=[1,0,0,1,0,0];
export function mul(a,b){return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]}
export function trs(x=0,y=0,sx=1,sy=1,d=0,ax=0,ay=0){const c=Math.cos(rad(d)),s=Math.sin(rad(d));return [c*sx,s*sx,-s*sy,c*sy,x-c*sx*ax+s*sy*ay,y-s*sx*ax-c*sy*ay]}
export const point=(m,p)=>[m[0]*p[0]+m[2]*p[1]+m[4],m[1]*p[0]+m[3]*p[1]+m[5]];
export function ease(e,u){u=clamp(u);const k=e?.kind||'linear';if(k==='hold')return 0;if(k==='linear')return u;
 if(k==='samples'){return lerpKeys(e.points.map(([time,value])=>({time,value,ease:{kind:'linear'}})),u,0)}
 if(k==='bezier'){let l=0,h=1,v=.5;for(let i=0;i<28;i++){v=(l+h)/2;const x=3*(1-v)**2*v*e.x1+3*(1-v)*v*v*e.x2+v**3;if(x<u)l=v;else h=v}return 3*(1-v)**2*v*e.y1+3*(1-v)*v*v*e.y2+v**3}
 const out=k.endsWith('Out')&&!k.endsWith('InOut'),both=k.endsWith('InOut');let name=k.replace(/InOut|In|Out/g,''),power={quad:2,cubic:3,quart:4,quint:5,power:e.power||2}[name];
 const bounce=x=>{let n=7.5625,d=2.75;if(x<1/d)return n*x*x;if(x<2/d)return n*(x-=1.5/d)*x+.75;if(x<2.5/d)return n*(x-=2.25/d)*x+.9375;return n*(x-=2.625/d)*x+.984375};
 const fn=x=>power?x**power:name==='sine'?1-Math.cos(x*Math.PI/2):name==='expo'?(x===0?0:2**(10*x-10)):name==='circ'?1-Math.sqrt(1-x*x):name==='back'?((e.overshoot??1.70158)+1)*x**3-(e.overshoot??1.70158)*x*x:name==='bounce'?1-bounce(1-x):name==='elastic'?(x===0||x===1?x:-(2**(10*x-10))*Math.sin((x-1-(e.period||.3)/4)*2*Math.PI/(e.period||.3))):x;
 return both?(u<.5?fn(2*u)/2:1-fn(2-2*u)/2):out?1-fn(1-u):fn(u)
}
export function lerpKeys(keys,t,def=0){if(!keys.length)return def;if(t<keys[0].time)return keys[0].value;let a=0,b=keys.length;while(a<b){let m=(a+b)>>1;if(keys[m].time<=t)a=m+1;else b=m}if(a===keys.length)return keys.at(-1).value;const l=keys[a-1],r=keys[a];return l.value+(r.value-l.value)*ease(l.ease,(t-l.time)/(r.time-l.time))}
export function random(seed,tag){let h=2166136261;for(const c of `${seed}:${tag}`){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0)/4294967296}
export function vdc(n){let x=0,f=.5;while(n>0){x+=(n%2)*f;n=Math.floor(n/2);f/=2}return x}
export function bezier(pts,u){let q=pts.map(p=>[...p]);for(let n=q.length-1;n>0;n--)for(let i=0;i<n;i++)q[i]=[q[i][0]*(1-u)+q[i+1][0]*u,q[i][1]*(1-u)+q[i+1][1]*u];return q[0]}
export function samplePath(pts,u){if(!pts.length)return [0,0,1,0];let lens=[0];for(let i=1;i<pts.length;i++)lens.push(lens.at(-1)+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));let s=clamp(u)*lens.at(-1),i=1;while(i<pts.length-1&&lens[i]<s)i++;if(pts.length===1||!lens.at(-1))return [...pts[0],1,0];let d=lens[i]-lens[i-1],f=d?(s-lens[i-1])/d:0,a=pts[i-1],b=pts[i];return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f,d?(b[0]-a[0])/d:1,d?(b[1]-a[1])/d:0]}
export function beats(tempo,x){if(x<0)return x*60/tempo[0].bpm;let s=0;for(let i=0;i<tempo.length;i++){let end=Math.min(x,tempo[i+1]?.beat??x);s+=Math.max(0,end-tempo[i].beat)*60/tempo[i].bpm;if(end===x)break}return s}
export const rgbInt=c=>Math.round(clamp(c[0])*255)*65536+Math.round(clamp(c[1])*255)*256+Math.round(clamp(c[2])*255);
export const hex=c=>'#'+rgbInt(c).toString(16).padStart(6,'0');
export const fromHex=s=>[parseInt(s.slice(1,3),16)/255,parseInt(s.slice(3,5),16)/255,parseInt(s.slice(5,7),16)/255,1];
export function inverse(m){const d=m[0]*m[3]-m[1]*m[2];if(Math.abs(d)<1e-12)return null;return [m[3]/d,-m[1]/d,-m[2]/d,m[0]/d,(m[2]*m[5]-m[3]*m[4])/d,(m[1]*m[4]-m[0]*m[5])/d]}
