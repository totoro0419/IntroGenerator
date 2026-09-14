export const AUTHORING_FORMAT='IGAUTHOR/1.4';
export const LEGACY_AUTHORING_FORMAT='IGAUTHOR/1.3';

export function easingLayerId(keyId,index=0){
 const safe=String(keyId||'key').replace(/[^A-Za-z0-9_.:-]/g,'_');
 return `${/^[A-Za-z]/.test(safe)?safe:'k'+safe}:ease:${index}`.slice(0,128)
}

export function defaultCurve(kind='linear'){
 if(kind.startsWith('back'))return {kind,overshoot:1.70158};
 if(kind.startsWith('elastic'))return {kind,period:.3};
 if(kind.startsWith('power'))return {kind,power:2};
 if(kind==='bezier')return {kind,x1:.25,y1:.1,x2:.25,y2:1};
 return {kind}
}

export function stackFromPrimitive(ease,keyId='key'){
 const curve=structuredClone(ease&&ease.kind&&ease.kind!=='stack'?ease:{kind:'linear'});
 return {kind:'stack',layers:[{id:easingLayerId(keyId,0),enabled:true,weight:1,curve}]}
}

export function normalizeStack(ease,keyId='key'){
 if(ease?.kind==='stack')return ease;
 return stackFromPrimitive(ease,keyId)
}

export function migrateEasingSource(project){
 if(!project||typeof project!=='object')throw Error('編集データがありません');
 if(project.format!==LEGACY_AUTHORING_FORMAT&&project.format!==AUTHORING_FORMAT)throw Error('未対応の編集データ形式です: '+project.format);
 let changed=project.format!==AUTHORING_FORMAT;
 for(const track of project.tracks||[])for(const key of track.keys||[]){
  if(key.ease?.kind!=='stack'){key.ease=stackFromPrimitive(key.ease,key.id);changed=true}
 }
 project.format=AUTHORING_FORMAT;
 return changed
}

export function legacyValidationView(project){
 const copy=structuredClone(project);copy.format=LEGACY_AUTHORING_FORMAT;
 for(const track of copy.tracks||[])for(const key of track.keys||[])key.ease={kind:'linear'};
 return copy
}

export function assertEasingStackSemantics(project,validateStack){
 for(const track of project.tracks||[])for(const key of track.keys||[]){
  if(!validateStack(key.ease)){
   const error=validateStack.errors?.[0];
   throw Error(`Easing Stackが仕様と一致しません: ${track.id}/${key.id} ${error?.instancePath||''} ${error?.message||''}`.trim())
  }
  const ids=new Set();
  for(const layer of key.ease.layers){
   if(ids.has(layer.id))throw Error(`Easing Layer IDの重複: ${track.id}/${key.id}/${layer.id}`);
   ids.add(layer.id);
   if(!Number.isFinite(layer.weight)||layer.weight<0)throw Error(`Easing Weightが不正です: ${track.id}/${key.id}/${layer.id}`)
  }
 }
 return true
}

export function cloneLayer(layer,newId){return {...structuredClone(layer),id:newId}}
