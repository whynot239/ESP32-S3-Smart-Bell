#include <cassert>
#include <stdint.h>
#include "../firmware/esp32_cam_doorbell/include/audio_processing.h"
int main() {
    assert(amplifySpeechSample(0,4)==0);
    assert(amplifySpeechSample(1000,4)==4000);
    assert(amplifySpeechSample(-1000,4)==-4000);
    assert(amplifySpeechSample(32767,1)==32767);
    assert(amplifySpeechSample(-32768,1)==-32768);
    assert(amplifySpeechSample(8192,4)==32767);
    assert(amplifySpeechSample(-8193,4)==-32768);
    assert(amplifySpeechSample(32767,8)==32767);
    assert(amplifySpeechSample(-32768,8)==-32768);
    for(int32_t sample=-32768;sample<=32767;++sample) {
        int32_t expected=sample*4;
        if(expected>32767)expected=32767;
        if(expected<-32768)expected=-32768;
        assert(amplifySpeechSample(int16_t(sample),4)==expected);
    }
}
