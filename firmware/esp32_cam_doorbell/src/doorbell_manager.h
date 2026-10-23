#pragma once
#include <Arduino.h>
#include "pins.h"
#include "config.h"

class DoorbellManager {
public:
    DoorbellManager();
    void begin();
    void update();

    bool isButtonPressed() const { return buttonHeld; }

private:
    void onButtonPressed();
    void onButtonReleased();

    int lastButtonReading;
    bool buttonHeld;
    unsigned long lastDebounceTime;
};

extern DoorbellManager doorbellManager;
