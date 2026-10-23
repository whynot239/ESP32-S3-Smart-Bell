#pragma once
#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include "pins.h"

class LedManager {
public:
    LedManager();
    void begin();
    void update();
    void setBrightnessLevels(uint8_t idle, uint8_t active);

    // Porch Light Control (12-LED WS2812 Ring)
    void setPorchLight(bool on);
    void togglePorchLight();
    bool isPorchLightOn() const { return porchLightOn; }

    // Visual Access Feedback
    void showAccessGranted();
    void showAccessDenied();
    void setAlarmStrobe(bool active);
    void showDoorbellRingAnimation();
    void stopDoorbellRingAnimation();

    // Onboard Status Indicator
    void setStatusColor(uint8_t r, uint8_t g, uint8_t b);

private:
    Adafruit_NeoPixel ringLed;

    bool porchLightOn;
    bool alarmStrobeActive;
    bool doorbellRingActive;
    unsigned long lastAnimationUpdate;
    uint16_t rainbowHue;
    uint8_t animationStep;
    uint8_t idleBrightness, activeBrightness;
};

extern LedManager ledManager;
