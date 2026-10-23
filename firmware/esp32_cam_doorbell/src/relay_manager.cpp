#include "relay_manager.h"
static_assert(RELAY_ACTIVE_LOW, "This PCF fail-off policy requires active-low relay inputs.");
RelayManager relayManager;

bool RelayManager::writeOutputs(uint8_t value) {
    Wire.beginTransmission(PCF8574_I2C_ADDR);
    Wire.write(value);
    return Wire.endTransmission() == 0;
}

bool RelayManager::begin() {
    mutex = xSemaphoreCreateMutex();
    buttonEvents = xQueueCreate(8, sizeof(bool));
    if (!mutex || !buttonEvents) return false;
    pinMode(PIN_DOORBELL_BTN, INPUT_PULLUP);
    Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
    Wire.setTimeOut(20);
    // Active-low relays off. Reset reader before task ownership.
    if (!writeOutputs(0xFF)) return false;
    if (!writeOutputs(0xFF & ~(1 << PCF_PIN_RFID_RST))) return false;
    delay(10);
    if (!writeOutputs(0xFF)) return false;
    delay(20);
    fault.store(false);
    if (xTaskCreatePinnedToCore(run, "relay", 3072, this, 4, nullptr, 1) != pdPASS) {
        fault.store(true);
        return false;
    }
    return true;
}

bool RelayManager::triggerGateUnlockBurst(unsigned long duration) {
    if (fault.load() || !mutex || xSemaphoreTake(mutex, pdMS_TO_TICKS(25)) != pdTRUE) return false;
    bool accepted = policy.unlock(millis(), duration);
    xSemaphoreGive(mutex);
    return accepted;
}

bool RelayManager::triggerChimePulse(unsigned long duration) {
    if (fault.load() || !mutex || xSemaphoreTake(mutex, pdMS_TO_TICKS(25)) != pdTRUE) return false;
    bool accepted = policy.chime(millis(), duration);
    xSemaphoreGive(mutex);
    return accepted;
}

void RelayManager::setAlarm(bool active) {
    if (!mutex || xSemaphoreTake(mutex, pdMS_TO_TICKS(25)) != pdTRUE) return;
    policy.alarm(active, millis());
    xSemaphoreGive(mutex);
}

bool RelayManager::nextButtonEvent(bool& pressed) {
    return buttonEvents && xQueueReceive(buttonEvents, &pressed, 0) == pdTRUE;
}

void RelayManager::run(void* arg) { static_cast<RelayManager*>(arg)->service(); }

void RelayManager::service() {
    bool previous = false, stable = false;
    uint32_t changedAt = millis(), retryAt = 0;
    for (;;) {
        uint32_t now = millis();
        bool pressed = digitalRead(PIN_DOORBELL_BTN) == LOW;
        if (pressed != previous) { previous = pressed; changedAt = now; }
        if (uint32_t(now - changedAt) >= DEBOUNCE_DELAY_MS && stable != pressed) {
            stable = pressed;
            xQueueSend(buttonEvents, &stable, 0);
        }
        if (xSemaphoreTake(mutex, pdMS_TO_TICKS(5)) == pdTRUE) {
            policy.button(stable, now);
            policy.tick(now);
            uint8_t desired = 0xFF;
            if (policy.lockOn()) desired &= ~(1 << PCF_PIN_LOCK_RELAY);
            if (policy.bellOn()) desired &= ~(1 << PCF_PIN_BELL_RELAY);
            // Hold through bounded I2C so acceptance cannot race a fault.
            if (desired != confirmed || (policy.fault() && uint32_t(now - retryAt) >= 100)) {
                retryAt = now;
                if (writeOutputs(desired)) {
                    confirmed = desired;
                    lockConfirmed.store(!(desired & (1 << PCF_PIN_LOCK_RELAY)));
                    bellConfirmed.store(!(desired & (1 << PCF_PIN_BELL_RELAY)));
                } else {
                    policy.fail();
                    fault.store(true);
                    // Preserve last acknowledged state: OFF is not yet confirmed.
                }
            }
            xSemaphoreGive(mutex);
        }
        vTaskDelay(pdMS_TO_TICKS(5));
    }
}
