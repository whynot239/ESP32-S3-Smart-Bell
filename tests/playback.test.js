import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function fixture(rate=48000) {
 let Processor;
 vm.runInNewContext(fs.readFileSync(new URL('../public/playback-worklet.js',import.meta.url),'utf8'),{sampleRate:rate,Float32Array,AudioWorkletProcessor:class {constructor(){this.port={};}},registerProcessor(name,cls){Processor=cls;}});
 const processor=new Processor();
 return {processor,push(data){processor.port.onmessage({data});},render(count){const output=new Float32Array(count);processor.process([],[[output]]);return output;}};
}
test('playback buffers brief packet bursts and joins packets without inserting silence',()=>{
 const f=fixture();f.push(new Float32Array(800).fill(.25));
 assert.ok(f.render(128).every(v=>v===0));
 f.push(new Float32Array(800).fill(.25));
 const output=f.render(4500);
 assert.ok(output.slice(500,4400).every(v=>Math.abs(v-.25)<1e-5));
});
test('underflow fades to silence and recovery fades in instead of stepping',()=>{
 const f=fixture(16000);f.push(new Float32Array(1600).fill(.5));
 const output=f.render(2000);
 let largest=0;for(let i=1;i<output.length;i++)largest=Math.max(largest,Math.abs(output[i]-output[i-1]));
 assert.ok(largest<.01,`largest transition ${largest}`);
 assert.ok(Math.abs(output.at(-1))<1e-5);
 f.push(new Float32Array(1600).fill(-.5));assert.ok(Math.abs(f.render(1)[0])<.01);
});
test('overflow stays bounded and discards stale speech',()=>{
 const f=fixture(44100);f.push(new Float32Array(32000).fill(.1));
 assert.ok(f.processor.count<=16000);
 assert.ok(f.render(512).every(Number.isFinite));
});
