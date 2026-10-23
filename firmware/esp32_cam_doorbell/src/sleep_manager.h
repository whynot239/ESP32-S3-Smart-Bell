#pragma once
#include <Arduino.h>
#include <esp_sleep.h>
#include "pins.h"

class SleepManager {
public:
    SleepManager();
    void begin();

    // Power Profile Management
    void configureModemSleep();
    void enterDeepSleep();

private:
    bool batteryModeEnabled;
};

extern SleepManager sleepManager;
