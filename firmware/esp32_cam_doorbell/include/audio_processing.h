#pragma once
#include <stdint.h>

// Clamp boosted PCM to the signed 16-bit range instead of wrapping loud samples.
inline int16_t amplifySpeechSample(int16_t sample, uint8_t gain) {
    int32_t value = int32_t(sample) * gain;
    if (value > 32767) value = 32767;
    if (value < -32768) value = -32768;
    return int16_t(value);
}

// Smooth only the transitions at missing/recovered audio, not normal PCM samples.
// Eighty samples is 5 ms at the intercom's 16 kHz rate.
class AudioGapSmoother {
public:
    int16_t process(int16_t sample, bool available) {
        if (available) {
            if (!active) { active = true; progress = 0; start = last; }
            if (progress < 80) ++progress;
            last = (int32_t(sample) * progress + start * (80 - progress)) / 80;
        } else {
            if (active) { active = false; progress = 80; start = last; }
            if (progress > 0) --progress;
            last = start * progress / 80;
        }
        return int16_t(last);
    }
private:
    bool active = false;
    int progress = 0;
    int32_t last = 0, start = 0;
};
