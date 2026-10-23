#include "led_manager.h"
#include "config.h"

static_assert(LED_IDLE_BRIGHTNESS >= 0 && LED_IDLE_BRIGHTNESS <= 255, "Idle brightness must be 0..255.");
static_assert(LED_ACTIVE_BRIGHTNESS >= 0 && LED_ACTIVE_BRIGHTNESS <= 255, "Active brightness must be 0..255.");

LedManager ledManager;

LedManager::LedManager()
    : ringLed(NUM_RING_LEDS, PIN_WS2812_RING, NEO_GRB + NEO_KHZ800),
      porchLightOn(false),
      alarmStrobeActive(false),
      doorbellRingActive(false),
      lastAnimationUpdate(0),
      rainbowHue(0),
      animationStep(0), idleBrightness(LED_IDLE_BRIGHTNESS), activeBrightness(LED_ACTIVE_BRIGHTNESS) {}

void LedManager::begin() {
    ringLed.begin();
    ringLed.setBrightness(idleBrightness);
    ringLed.clear();
    ringLed.show();

    Serial.println("✅ [LED] WS2812 Porch Ring ready.");
}

void LedManager::setPorchLight(bool on) {
    porchLightOn = on;
    if (alarmStrobeActive) return; // Strobe has priority

    ringLed.setBrightness(porchLightOn ? activeBrightness : idleBrightness);
    if (porchLightOn) {
        // Warm white illumination (255, 220, 180)
        for (int i = 0; i < NUM_RING_LEDS; i++) {
            ringLed.setPixelColor(i, ringLed.Color(255, 220, 180));
        }
    } else {
        ringLed.clear();
    }
    ringLed.show();
}

void LedManager::togglePorchLight() {
    setPorchLight(!porchLightOn);
}

void LedManager::showAccessGranted() {
    ringLed.setBrightness(activeBrightness);
    // Smooth emerald green sweep
    for (int i = 0; i < NUM_RING_LEDS; i++) {
        ringLed.setPixelColor(i, ringLed.Color(0, 255, 80));
        ringLed.show();
        delay(15);
    }
    delay(300);
    setPorchLight(porchLightOn); // Restore previous state
}

void LedManager::showAccessDenied() {
    ringLed.setBrightness(activeBrightness);
    // Crimson red flash
    for (int k = 0; k < 3; k++) {
        for (int i = 0; i < NUM_RING_LEDS; i++) {
            ringLed.setPixelColor(i, ringLed.Color(255, 0, 20));
        }
        ringLed.show();
        delay(100);
        ringLed.clear();
        ringLed.show();
        delay(100);
    }
    setPorchLight(porchLightOn); // Restore previous state
}

void LedManager::showDoorbellRingAnimation() {
    doorbellRingActive = true;
    ringLed.setBrightness(activeBrightness);
    // Bright white has priority while the button is held.
    for (int i = 0; i < NUM_RING_LEDS; i++) {
        ringLed.setPixelColor(i, ringLed.Color(255, 255, 255));
    }
    ringLed.show();
}

void LedManager::stopDoorbellRingAnimation() {
    doorbellRingActive = false;
}

void LedManager::setAlarmStrobe(bool active) {
    alarmStrobeActive = active;
    if (!active) {
        setPorchLight(porchLightOn);
    }
}

void LedManager::setStatusColor(uint8_t r, uint8_t g, uint8_t b) {
    // GPIO 48 is reserved by the wiring plan; status is reported over serial.
    (void)r; (void)g; (void)b;
}

void LedManager::update() {
    unsigned long now = millis();

    if (alarmStrobeActive) {
        if (now - lastAnimationUpdate < 120) return;
        lastAnimationUpdate = now;
        animationStep = !animationStep;
        ringLed.setBrightness(activeBrightness);
        if (animationStep) {
            for (int i = 0; i < NUM_RING_LEDS; i++) {
                ringLed.setPixelColor(i, ringLed.Color(255, 0, 0));
            }
            setStatusColor(255, 0, 0);
        } else {
            ringLed.clear();
            setStatusColor(0, 0, 0);
        }
        ringLed.show();
        return;
    }

    // The idle state is a continuously moving rainbow. Other ring modes win.
    if (porchLightOn || doorbellRingActive || now - lastAnimationUpdate < 35) return;
    lastAnimationUpdate = now;
    ringLed.setBrightness(idleBrightness);
    for (int i = 0; i < NUM_RING_LEDS; i++) {
        uint16_t pixelHue = rainbowHue + (uint32_t)i * 65536 / NUM_RING_LEDS;
        ringLed.setPixelColor(i, ringLed.gamma32(ringLed.ColorHSV(pixelHue)));
    }
    rainbowHue += 256;
    ringLed.show();
}

void LedManager::setBrightnessLevels(uint8_t idle, uint8_t active) {
    if(idle>64 || active>120) return;
    idleBrightness=idle;activeBrightness=active;
    if(!alarmStrobeActive && !doorbellRingActive) setPorchLight(porchLightOn);
}
