// PCM16 mono, 16kHz frames. AudioWorklet runs independently of the page rendering.
class DoorbellPCM extends AudioWorkletProcessor {
  constructor() { super(); this.samples=[]; this.phase=0; this.sum=0; this.count=0; }
  process(inputs) {
    const input=inputs[0]?.[0];
    if(input) for(let i=0;i<input.length;i++) {
      this.sum+=input[i]; this.count++;
      this.phase+=16000;
      if(this.phase>=sampleRate) {
        this.phase-=sampleRate;
        this.samples.push(Math.round(Math.max(-1,Math.min(1,(this.sum/this.count)))*32767));
        this.sum=0; this.count=0;
        if(this.samples.length===320) {
          const frame=new ArrayBuffer(641), view=new DataView(frame); view.setUint8(0,2);
          this.samples.forEach((v,j)=>view.setInt16(1+2*j,v,true));
          this.port.postMessage(frame,[frame]); this.samples=[];
        }
      }
    }
    return true;
  }
}
registerProcessor('doorbell-pcm',DoorbellPCM);
