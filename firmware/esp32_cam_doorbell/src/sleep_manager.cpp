#include "sleep_manager.h"
#include <WiFi.h>

SleepManager sleepManager;

SleepManager::SleepManager() : batteryModeEnabled(false) {}

void SleepManager::begin() {
    configureModemSleep();
}

void SleepManager::configureModemSleep() {
    // Wi-Fi Modem-Sleep keeps the ESP32 connected to the AP and listening to beacons
    // while lowering average current draw and temperature significantly.
    WiFi.setSleep(false);
    Serial.println("⚡ [POWER] Wi-Fi power saving disabled for reliable streaming.");
}

void SleepManager::enterDeepSleep() {
    Serial.println("💤 [POWER] Entering Deep Sleep. Wake source: Doorbell Button (GPIO 19)...");
    Serial.flush();

    // Configure GPIO 19 as RTC wake-up source (Active LOW)
    esp_sleep_enable_ext0_wakeup((gpio_num_t)PIN_DOORBELL_BTN, 0);

    esp_deep_sleep_start();
}
