#include "doorbell_manager.h"
#include "relay_manager.h"
#include "led_manager.h"
#include "audio_manager.h"
#include "camera_manager.h"
#include "storage_manager.h"
#include "security_manager.h"
#include "api_client.h"

DoorbellManager doorbellManager;

DoorbellManager::DoorbellManager()
    : lastButtonReading(HIGH),
      buttonHeld(false),
      lastDebounceTime(0) {}

void DoorbellManager::begin() {
    pinMode(PIN_DOORBELL_BTN, INPUT_PULLUP);
    Serial.println("✅ [DOORBELL] Debounced push button initialized on GPIO 19.");
}

void DoorbellManager::onButtonPressed() {
    Serial.println("\n🔔 ========================================================");
    Serial.println("🔔 [DOORBELL BUTTON] PRESSED & HELD DOWN!");
    Serial.println("🔔 Inside chime energized immediately (active as long as held).");
    Serial.println("🔔 ========================================================\n");

    // 1. Energize Inside Chime Relay immediately
    // Relay task reads the physical button independently.

    // 2. Play outside chime on MAX98357A speaker
    audioManager.playDingDongChime();

    // 3. Wake camera optical system
    cameraManager.wakeCameraSession();
    ledManager.showDoorbellRingAnimation();

    // 4. Capture visitor photo
    camera_fb_t* fb = cameraManager.captureFrame();

    // 5. Package access log event
    AccessLogEvent ringEvent;
    ringEvent.eventId = securityManager.generateNonce();
    ringEvent.type = "doorbell_ring";
    ringEvent.userId = "visitor";
    ringEvent.userName = "Front Porch Visitor";
    ringEvent.cardUid = "N/A";
    ringEvent.authorized = true;
    ringEvent.timestamp = millis();
    ringEvent.method = "Physical Button";

    // 6. Dispatch live alert to backend (with photo if available)
    if (fb != nullptr) {
        apiClient.sendDoorbellRing(ringEvent, fb->buf, fb->len);
        cameraManager.releaseFrame(fb);
    } else {
        apiClient.sendDoorbellRing(ringEvent, nullptr, 0);
    }

    if (!apiClient.isConnected()) {
        storageManager.queueOfflineEvent(ringEvent);
    }
}

void DoorbellManager::onButtonReleased() {
    Serial.println("🔔 [DOORBELL BUTTON] RELEASED -> Inside Chime Relay de-energized immediately.");

    // De-energize Inside Chime Relay immediately
    // Relay task reads release independently.
    ledManager.stopDoorbellRingAnimation();
    ledManager.setPorchLight(ledManager.isPorchLightOn()); // Restore light

    // Send release event to backend
    apiClient.sendDoorbellRelease();
}

void DoorbellManager::update() {
    bool pressed;
    if (!relayManager.nextButtonEvent(pressed)) return;
    buttonHeld = pressed;
    if (pressed) onButtonPressed(); else onButtonReleased();
}
