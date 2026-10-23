#include <cassert>
#include <cstdlib>
#include "../firmware/esp32_cam_doorbell/include/audio_processing.h"
int main(){
 AudioGapSmoother smoother;
 int previous=0;
 for(int i=0;i<300;i++){int next=smoother.process(16000,true);assert(std::abs(next-previous)<=201);previous=next;}
 assert(previous==16000);
 for(int i=0;i<100;i++){int next=smoother.process(0,false);assert(std::abs(next-previous)<=201);previous=next;}
 assert(previous==0);
 for(int i=0;i<300;i++){int next=smoother.process(-16000,true);assert(std::abs(next-previous)<=201);previous=next;}
 assert(previous==-16000);
}
