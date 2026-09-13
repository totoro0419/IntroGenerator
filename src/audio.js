import {b64,unb64,digest,md5hex} from './assets.js';
import {clamp,beats} from './math.js';
const decoded=new Map();
export async function decodeAudio(asset){
 if(!decoded.has(asset.sha256)){const ctx=new AudioContext();const task=ctx.decodeAudioData(unb64(asset.bytesBase64).buffer).finally(()=>ctx.close());decoded.set(asset.sha256,task);task.catch(()=>decoded.delete(asset.sha256))}
 return decoded.get(asset.sha256);
}
export function encodeWav(channels,rate,first=0){
 const n=Math.max(0,channels[0].length-first),size=n*channels.length*2,bytes=new Uint8Array(44+size),v=new DataView(bytes.buffer),tag=(p,s)=>[...s].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));
 tag(0,'RIFF');v.setUint32(4,36+size,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels.length,true);v.setUint32(24,rate,true);v.setUint32(28,rate*channels.length*2,true);v.setUint16(32,channels.length*2,true);v.setUint16(34,16,true);tag(36,'data');v.setUint32(40,size,true);
 for(let i=0;i<n;i++)for(let c=0;c<channels.length;c++){const x=clamp(channels[c][i+first],-1,1);v.setInt16(44+(i*channels.length+c)*2,Math.round(x*(x<0?32768:32767)),true)}return bytes;
}
export async function compileAudio(p,author,signal){
 if(!p.audio.length)return {sounds:[],checkpoints:[]};
 const rate=48000,count=Math.ceil(p.duration*rate),mix=[new Float32Array(count),new Float32Array(count)];
 for(const event of p.audio){if(signal?.aborted)throw Error('キャンセルしました');const asset=p.assets.find(a=>a.id===event.asset);if(!asset||asset.kind!=='audio')throw Error('音声素材がありません: '+event.asset);const buffer=await decodeAudio(asset);if(event.sourceIn<0||event.sourceOut>buffer.duration+1/rate||event.sourceOut<=event.sourceIn)throw Error('音声の素材範囲が不正です');if(event.rate===0)continue;
  const length=(event.sourceOut-event.sourceIn)/Math.abs(event.rate),start=Math.max(0,Math.ceil(event.start*rate)),end=Math.min(count,Math.ceil((event.start+length)*rate));let gain=1,pan=0;
  for(let i=start;i<end;i++){if((i-start)%128===0){const time=i/rate,c={masterTime:time,localTime:time-event.start,index:0,count:1,age:time-event.start,normalizedAge:(time-event.start)/length,birthTime:event.start};gain=author.value(event.gain,c);pan=clamp(author.value(event.pan,c),-1,1)}const t=i/rate-event.start,pos=(event.rate>0?event.sourceIn+t*event.rate:event.sourceOut+t*event.rate)*buffer.sampleRate,j=Math.floor(pos),u=pos-j;
   for(let c=0;c<2;c++){const data=buffer.getChannelData(Math.min(c,buffer.numberOfChannels-1)),x=(data[j]||0)*(1-u)+(data[j+1]||0)*u;mix[c][i]+=x*gain*(c===0?Math.min(1,1-pan):Math.min(1,1+pan))}
  }await new Promise(r=>setTimeout(r,0));
 }
 const checkpointTimes=[0,...p.markers.map(m=>m.unit==='beats'?beats(p.tempo,m.value):m.value)].filter(t=>t>=0&&t<p.duration).sort((a,b)=>a-b),times=[...new Set(checkpointTimes.map(t=>Math.round(t*rate)/rate))],sounds=[],checkpoints=[];let bytesTotal=0;
 for(const t of times){const first=Math.round(t*rate),bytes=encodeWav(mix,rate,first);bytesTotal+=bytes.length;if(bytesTotal>p.profile.maxZipBytes)throw Error('音声checkpointが素材容量の上限を超えます');const hash=digest(bytes);sounds.push({name:'ig_audio_'+hash,bytes,hash,md5:md5hex(bytes),format:'wav',sampleRate:rate,sampleCount:count-first,duration:(count-first)/rate});checkpoints.push({time:t,sound:sounds.length})}
 return {sounds,checkpoints};
}
export class AudioTransport{
 constructor(compiled){this.data=compiled;this.ctx=null;this.buffer=null;this.source=null;this.epoch=0;this.offset=0;this.generation=0}
 async play(t){this.stop();const generation=this.generation;if(!this.data.sounds?.length)return false;this.ctx??=new AudioContext();await this.ctx.resume();this.buffer??=await this.ctx.decodeAudioData(this.data.sounds[0].bytes.slice().buffer);if(generation!==this.generation)return false;if(t>=this.buffer.duration)return false;const s=this.ctx.createBufferSource();s.buffer=this.buffer;s.connect(this.ctx.destination);this.epoch=this.ctx.currentTime-t;this.source=s;s.start(0,t);return true}
 now(){return this.ctx&&this.source?this.ctx.currentTime-this.epoch:null}
 stop(){this.generation++;if(this.source){try{this.source.stop()}catch{}this.source.disconnect();this.source=null}}
 dispose(){this.stop();this.ctx?.close()}
}
