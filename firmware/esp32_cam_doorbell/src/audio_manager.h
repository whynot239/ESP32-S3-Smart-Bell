#pragma once
#include <Arduino.h>
#include <atomic>
#include "freertos/queue.h"
#include "driver/i2s.h"
#include "pins.h"
#include "config.h"

class AudioManager {
public:
    AudioManager();
    bool begin();
    bool isReady() const { return initialized; }
    void setSpeechGain(uint8_t value) { if(value<=6) speechGain.store(value); }

    // Feedback & Alert Tones (Speaker Output)
    void playTone(int freqHz, int durationMs, float volume = 0.5f);
    void playDingDongChime();
    void playAccessGrantedTone();
    void playAccessDeniedTone();
    void playVoiceReplyAlert();

    // Two-Way Intercom Audio I/O
    // Speaker Playback (Phone Mic -> ESP32 Speaker)
    size_t writeSpeakerData(const uint8_t* data, size_t length);

    // Microphone Sampling (Visitor Voice -> Phone App)
    size_t readMicrophoneData(int16_t* buffer, size_t maxSamples);

    // Clear pre-session speech; renewing a live session must not clear ongoing audio.
    void resetStream();

    // Audio Flow Control (Prevents Acoustic Feedback Oscillations)
    void setMicrophoneMute(bool muted) { micMuted = muted; }
    bool isMicrophoneMuted() const { return micMuted; }

private:
    bool initialized;
    std::atomic<bool> micMuted{false};
    std::atomic<uint8_t> speechGain{SPEECH_PLAYBACK_GAIN};
    struct AudioFrame { int16_t samples[160]; bool speech = false; };
    QueueHandle_t microphoneQueue = nullptr;
    QueueHandle_t speakerQueue = nullptr;
    static void worker(void* arg);
    void service();
};

extern AudioManager audioManager;
