#include <cassert>
#include <cstring>
#include <deque>
#include <vector>
#include "audio_manager.h"
TestSerial Serial;
struct Queue { unsigned capacity,size; std::deque<std::vector<unsigned char>> frames; };
QueueHandle_t xQueueCreate(unsigned n,unsigned size){return new Queue{n,size,{}};}
int xQueueSend(QueueHandle_t q,const void* p,unsigned){auto& v=*static_cast<Queue*>(q);if(v.frames.size()==v.capacity)return 0;v.frames.emplace_back((const unsigned char*)p,(const unsigned char*)p+v.size);return 1;}
int xQueueReceive(QueueHandle_t q,void* p,unsigned){auto& v=*static_cast<Queue*>(q);if(v.frames.empty())return 0;memcpy(p,v.frames.front().data(),v.size);v.frames.pop_front();return 1;}
int xQueuePeek(QueueHandle_t q,void* p,unsigned){auto& v=*static_cast<Queue*>(q);if(v.frames.empty())return 0;memcpy(p,v.frames.front().data(),v.size);return 1;}
unsigned uxQueueMessagesWaiting(QueueHandle_t q){return static_cast<Queue*>(q)->frames.size();}
int xQueueReset(QueueHandle_t q){static_cast<Queue*>(q)->frames.clear();return 1;}
static void(*runAudio)(void*);static void* audioArg;
int xTaskCreatePinnedToCore(void(*f)(void*),const char*,unsigned,void* arg,unsigned,void*,unsigned){runAudio=f;audioArg=arg;return 1;}
int i2s_driver_install(int,const i2s_config_t*,int,void*){return 0;}
int i2s_set_pin(int,const i2s_pin_config_t*){return 0;}
static int captureCount;
static int captureLimit=30;
struct Done {};
int i2s_read(int,void* data,size_t size,size_t* read,unsigned){if(captureCount==captureLimit)throw Done{};auto p=static_cast<int32_t*>(data);for(int i=0;i<160;i++){p[2*i]=(100+captureCount)*65536;p[2*i+1]=0;}captureCount++;*read=size;return 0;}
static std::vector<std::vector<int32_t>> renderedFrames;
int i2s_write(int,const void* data,size_t size,size_t* written,unsigned){auto p=static_cast<const int32_t*>(data);renderedFrames.emplace_back(p,p+size/4);*written=size;return 0;}
int main(){
 assert(audioManager.begin());
 // A 300 ms camera/TLS send prevents network polling, while I2S keeps sampling.
 try{runAudio(audioArg);}catch(Done&){}
 int16_t pcm[160*96];
 auto bytes=audioManager.readMicrophoneData(pcm,160*96);
 assert(bytes==30*320 && "All 300 ms of captured speech must survive and drain in one batch");
 for(int frame=0;frame<30;frame++)for(int sample=0;sample<160;sample++)assert(pcm[frame*160+sample]==100+frame);
 assert(audioManager.readMicrophoneData(pcm,160*96)==0);
 captureLimit=120;
 try{runAudio(audioArg);}catch(Done&){}
 // A new session must not replay the previous session's captured speech.
 audioManager.resetStream();
 assert(audioManager.readMicrophoneData(pcm,160*96)==0);
 captureLimit=220;
 try{runAudio(audioArg);}catch(Done&){}
 // Overflow keeps the most recent 960 ms and never allows an unbounded backlog.
 assert(audioManager.readMicrophoneData(pcm,160*96)==96*320);
 assert(pcm[0]==224 && pcm[95*160]==319);
 audioManager.resetStream();
 int16_t speech[160*8];for(auto& sample:speech)sample=1000;
 assert(audioManager.writeSpeakerData(reinterpret_cast<uint8_t*>(speech),sizeof(speech))==sizeof(speech));
 captureLimit=240;renderedFrames.clear();
 try{runAudio(audioArg);}catch(Done&){}
 // A short speech burst waits for jitter buffering, plays all eight frames,
 // then fades out instead of jumping from a nonzero sample to silence.
 assert(renderedFrames.size()==20);
 for(int i=0;i<11;i++)for(auto word:renderedFrames[i])assert(word==0);
 assert(renderedFrames[11][318]==4000*65536);
 assert(renderedFrames[18][318]==4000*65536);
 assert(renderedFrames[19][318]==0);
 audioManager.resetStream();
 for(int i=0;i<5;i++)assert(audioManager.writeSpeakerData(reinterpret_cast<uint8_t*>(speech),sizeof(speech))==sizeof(speech));
 audioManager.resetStream();
 audioManager.playTone(440,10,.1f);
 captureLimit=241;renderedFrames.clear();
 try{runAudio(audioArg);}catch(Done&){}
 bool tone=false;for(auto word:renderedFrames[0])tone|=word!=0;
 assert(tone && "Local chime must bypass speech prebuffering");
}
