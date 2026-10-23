import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function fixture({capture,loadModule}={}) {
  const nodes=new Map(), sockets=[], contexts=[], worklets=[];
  const track={enabled:true,stopped:false,stop(){this.stopped=true;this.enabled=false;}};
  const stream={getTracks:()=>[track],getAudioTracks:()=>[track]};
  let captureCalls=0;
  const element=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',value:'',hidden:false,classList:{add(){},remove(){}},setAttribute(name,value){this[name]=value;},getAttribute(name){return this[name];}});return nodes.get(id);};
  class Socket {
    static OPEN=1;
    constructor(){this.readyState=0;this.bufferedAmount=0;this.sent=[];sockets.push(this);}
    open(){this.readyState=1;this.onopen();}
    send(data){this.sent.push(data);}
    close(){this.readyState=3;}
    receive(data){this.onmessage({data});}
  }
  class Audio {
    constructor(){this.currentTime=0;this.destination={};this.played=[];this.audioWorklet={addModule:loadModule||(()=>Promise.resolve())};contexts.push(this);}
    resume(){return Promise.resolve();}
    close(){this.closed=true;return Promise.resolve();}
    createGain(){return {gain:{value:1},connect(){},disconnect(){}};}
    createBuffer(channels,count){const data=new Float32Array(count);return {getChannelData:()=>data,duration:count/16000};}
    createBufferSource(){const audio=this;return {connect(){},start(){audio.played.push(this.buffer);}};}
    createMediaStreamSource(){return {connect(){},disconnect(){}};}
  }
  class Worklet {constructor(context,name){this.name=name;this.port={postMessage(data){context.played.push({getChannelData:()=>data});}};worklets.push(this);}connect(){}disconnect(){}}
  const sandbox={document:{getElementById:element,addEventListener(){}},window:{addEventListener(){}},location:{hash:'',pathname:'/',protocol:'https:',host:'test.invalid'},history:{replaceState(){}},URLSearchParams,URL,Blob,DataView,ArrayBuffer,Float32Array,WebSocket:Socket,AudioContext:Audio,AudioWorkletNode:Worklet,navigator:{mediaDevices:{getUserMedia(options){captureCalls++;return capture?capture(options):Promise.resolve(stream);}}},setInterval:()=>1,clearInterval(){},AbortSignal,console};
  // Exercise the actual media functions without bootstrapping unrelated dashboard views.
  const source=fs.readFileSync(new URL('../public/doorbell.js',import.meta.url),'utf8');
  const media=source.slice(source.indexOf('function end()'),source.indexOf('function ask('));
  const setup="const $=id=>document.getElementById(id);let state={status:'online'},socket,context,mic,worklet,playback,receiveGain,source,renewal,imageUrl,microphoneEnabled=false;const token='test';const preferences={receiveVolume:85};const message=text=>{$('message').textContent=text;};";
  vm.runInNewContext(setup+media+"$('start').onclick=start;$('end').onclick=end;$('talk').onclick=toggleMicrophone;",sandbox);
  return {nodes,element,sockets,contexts,worklets,track,stream,get captureCalls(){return captureCalls;},async start(){await element('start').onclick();sockets.at(-1).open();},audio(){const frame=new ArrayBuffer(321);const view=new DataView(frame);view.setUint8(0,2);view.setInt16(1,8192,true);sockets.at(-1).receive(frame);},outgoing(){const frame=new ArrayBuffer(641);new DataView(frame).setUint8(0,2);worklets.at(-1).port.onmessage({data:frame});},sentAudio(){return sockets.at(-1).sent.filter(value=>value instanceof ArrayBuffer).length;}};
}

test('visitor audio continues while the browser microphone sends audio',async()=>{
  const f=fixture();await f.start();
  assert.equal(f.captureCalls,0,'live view must not request microphone permission automatically');
  f.audio();assert.equal(f.contexts[0].played.length,1);
  await f.element('talk').onclick();
  f.outgoing();assert.equal(f.sentAudio(),1);
  f.audio();assert.equal(f.contexts[0].played.length,2,'incoming audio must play while transmitting');
  assert.equal(f.contexts[0].played[1].getChannelData(0)[0],0.25);
  assert.equal(f.element('talkLabel').textContent,'Mute microphone');
});

test('microphone mute only stops outgoing audio; listening continues and unmute reuses permission',async()=>{
  const f=fixture();await f.start();await f.element('talk').onclick();
  await f.element('talk').onclick();assert.equal(f.track.enabled,false);
  f.outgoing();assert.equal(f.sentAudio(),0);
  f.audio();assert.equal(f.contexts[0].played.length,1);
  assert.equal(f.element('talkLabel').textContent,'Unmute microphone');
  await f.element('talk').onclick();f.outgoing();assert.equal(f.sentAudio(),1);
  assert.equal(f.captureCalls,1);
  f.element('end').onclick();assert.equal(f.track.stopped,true);
});

test('denied microphone permission leaves incoming audio working',async()=>{
  const f=fixture({capture:()=>Promise.reject(Error('Permission denied'))});await f.start();
  await f.element('talk').onclick();f.audio();assert.equal(f.contexts[0].played.length,1);
  assert.equal(f.element('talk').disabled,false);
  assert.match(f.element('message').textContent,/Permission denied/);
});

test('ending the session while permission is pending stops a late microphone stream',async()=>{
  let resolve;const pending=new Promise(done=>resolve=done);
  const f=fixture({capture:()=>pending});await f.start();
  const request=f.element('talk').onclick();f.element('end').onclick();resolve(f.stream);await request;
  assert.equal(f.track.stopped,true);assert.equal(f.worklets.filter(node=>node.name==='doorbell-pcm').length,0);
  assert.equal(f.element('talk').disabled,true);
});

test('late permission from an earlier session cannot attach to a new session',async()=>{
  let resolve;const pending=new Promise(done=>resolve=done);
  const f=fixture({capture:()=>pending});await f.start();const request=f.element('talk').onclick();
  await f.start();resolve(f.stream);await request;
  assert.equal(f.track.stopped,true);assert.equal(f.worklets.filter(node=>node.name==='doorbell-pcm').length,0);
  assert.equal(f.element('talkLabel').textContent,'Enable microphone');
});


test('ending while playback module loads cannot open a late media connection',async()=>{
 let resolve;const pending=new Promise(done=>resolve=done);
 const f=fixture({loadModule:()=>pending});const start=f.element('start').onclick();
 await Promise.resolve();f.element('end').onclick();resolve();await start;
 assert.equal(f.sockets.length,0);assert.equal(f.worklets.length,0);
});
