// Continuous PCM16/16 kHz playout, independent of packet boundaries and page rendering.
class DoorbellPlayback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer=new Float32Array(16000);
    this.head=0; this.count=0; this.phase=0; this.playing=false;
    this.gain=0; this.last=0; this.blendFrom=0; this.tail=0; this.tailStart=0;
    this.fade=1/(sampleRate*.005);
    this.port.onmessage=({data})=>{
      if (!(data instanceof Float32Array)) return;
      for (const sample of data) {
        if(this.count===this.buffer.length) {
          this.head=(this.head+1)%this.buffer.length; this.count--;
          this.playing=false; this.gain=0; this.phase=0;
        }
        this.buffer[(this.head+this.count)%this.buffer.length]=Number.isFinite(sample)?Math.max(-1,Math.min(1,sample)):0;
        this.count++;
      }
    };
  }
  process(inputs,outputs) {
    const channels=outputs[0];
    if(!channels?.length) return true;
    if(!this.playing && this.count>=1600) {this.playing=true;this.gain=0;this.phase=0;this.blendFrom=this.last;}
    for(let i=0;i<channels[0].length;i++) {
      if(this.playing && this.count>=2) {
        const a=this.buffer[this.head],b=this.buffer[(this.head+1)%this.buffer.length];
        this.gain=Math.min(1,this.gain+this.fade);
        this.last=(a+(b-a)*this.phase)*this.gain+this.blendFrom*(1-this.gain);
        this.phase+=16000/sampleRate;
        const advance=Math.floor(this.phase);
        this.phase-=advance;this.head=(this.head+advance)%this.buffer.length;this.count-=advance;
      } else {
        if(this.playing) {this.tail=Math.ceil(1/this.fade);this.tailStart=this.last;}
        this.playing=false;this.gain=0;
        this.tail=Math.max(0,this.tail-1);
        this.last=this.tailStart*this.tail/Math.ceil(1/this.fade);
      }
      for(const channel of channels)channel[i]=this.last;
    }
    return true;
  }
}
registerProcessor('doorbell-playback',DoorbellPlayback);
