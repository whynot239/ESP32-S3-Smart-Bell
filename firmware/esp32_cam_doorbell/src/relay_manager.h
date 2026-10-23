#pragma once
#include <Arduino.h>
#include <Wire.h>
#include <atomic>
#include "freertos/semphr.h"
#include "freertos/queue.h"
#include "pins.h"
#include "config.h"
#include "relay_policy.h"
class RelayManager {
public:
    bool begin();
    void update() {}
    bool triggerGateUnlockBurst(unsigned long durationMs = LOCK_BURST_DURATION_MS);
    bool triggerChimePulse(unsigned long durationMs = REMOTE_CHIME_PULSE_MS);
    void setAlarm(bool active);
    bool nextButtonEvent(bool& pressed);
    bool isGateUnlocked() const { return lockConfirmed.load(); }
    bool isChimeRinging() const { return bellConfirmed.load(); }
    bool hasFault() const { return fault.load(); }
private:
    static void run(void* arg);
    void service();
    bool writeOutputs(uint8_t value);
    SemaphoreHandle_t mutex = nullptr;
    QueueHandle_t buttonEvents = nullptr;
    RelayPolicy policy;
    uint8_t confirmed = 0xFF;
    std::atomic<bool> lockConfirmed{false}, bellConfirmed{false}, fault{true};
};
extern RelayManager relayManager;
