import test from 'node:test';
import assert from 'node:assert/strict';
import {trs,mul,point,lerpKeys,mod,beats,beatAtSeconds,validateTempo,samplePath,random} from '../src/math.js';
test('nested transform applies the pivot once',()=>{const m=mul(trs(100,0,2,2,90),trs(10,20,1,1,0,3,4));const p=point(m,[3,4]);assert.ok(Math.abs(p[0]-60)<1e-9);assert.ok(Math.abs(p[1]-20)<1e-9)});
test('keyframe exact boundary and negative seek',()=>{const keys=[{time:0,value:0,ease:{kind:'hold'}},{time:1,value:10,ease:{kind:'linear'}}];assert.equal(lerpKeys(keys,-2),0);assert.equal(lerpKeys(keys,.999),0);assert.equal(lerpKeys(keys,1),10);assert.equal(mod(-.25,1),.75)});
test('tempo change integrates elapsed beats and has an exact inverse',()=>{const tempo=[{beat:0,bpm:120},{beat:4,bpm:60}];assert.equal(beats(tempo,6),4);assert.equal(beatAtSeconds(tempo,4),6);assert.equal(beats(tempo,-2),-1);assert.equal(beatAtSeconds(tempo,-1),-2);for(const beat of [-3,0,1.25,4,7.5])assert.ok(Math.abs(beatAtSeconds(tempo,beats(tempo,beat))-beat)<1e-9)});
test('tempo map contract rejects invalid boundaries',()=>{assert.throws(()=>validateTempo([{beat:1,bpm:120}]),/先頭Beat/);assert.throws(()=>validateTempo([{beat:0,bpm:120},{beat:0,bpm:90}]),/厳密に増加/);assert.throws(()=>validateTempo([{beat:0,bpm:0}]),/不正/)});
test('path end and degenerate path have finite values',()=>{assert.deepEqual(samplePath([[0,0],[3,4]],1),[3,4,.6,.8]);assert.deepEqual(samplePath([[2,3],[2,3]],.7),[2,3,1,0])});
test('random is independent of evaluation order',()=>{const a=random(5,'particle:12:x');random(5,'particle:30:x');assert.equal(a,random(5,'particle:12:x'));assert.notEqual(a,random(5,'particle:12:y'))});
