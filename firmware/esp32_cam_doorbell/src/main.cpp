/**
 * ============================================================================
 * GOOUUU ESP32-S3-CAM SMART VIDEO DOORBELL & SECURE GATE ACCESS SYSTEM
 * ============================================================================
 * Hardware: GOOUUU ESP32-S3-CAM N16R8 (Dual-Core LX7 + 16MB Flash + 8MB OPI PSRAM)
 * Peripherals:
 *  - Camera: OV3660 DVP Parallel Bus (GPIO 4-13, 15-18)
 *  - I2C Bus (GPIO 1, 2): PCF8574 Expander (Relay 1 Solenoid, Relay 2 Chime, RC522 RST)
 *  - Two-Way Audio (I2S Bus): INMP441 Mic (GPIO 14), MAX98357A Amp (GPIO 47), BCLK (41), WS (42)
 *  - RFID / NFC: RC522 SPI (SCK 38, MOSI 39, MISO 40, CS 20)
 *  - Button: GPIO 19 (Debounced, Active LOW)
 *  - Visuals: WS2812 12-LED Porch Ring (GPIO 21); GPIO 48 reserved
 * 
 * Production Security:
 *  - HMAC-SHA256 Command Authentication with Replay Attack Nonce Protection
 *  - Instant Local NFC Authorization with Offline Event Spooling (LittleFS)
 *  - Full-Duplex Two-Way Voice Intercom & Live MJPEG Video
 * ============================================================================
 */

#include <Arduino.h>
#include "config.h"
#include "storage_manager.h"
#include "relay_manager.h"
#include "led_manager.h"
#include "audio_manager.h"
#include "camera_manager.h"
#include "nfc_manager.h"
#include "doorbell_manager.h"
#include "security_manager.h"
#include "wifi_manager.h"
#include "sleep_manager.h"
#include "api_client.h"

void setup() {
    Serial.begin(115200);
    delay(100);

    Serial.println("\n=======================================================");
    Serial.println("  GOOUUU ESP32-S3-CAM SECURE DOORBELL HUB INITIALIZING ");
    Serial.printf ("  Firmware: v%s | Hardware: %s\n", FIRMWARE_VERSION, HARDWARE_MODEL);
    Serial.println("=======================================================");

    // 2. I2C Bus & PCF8574 Dual Relay Controller
    if (!relayManager.begin()) {
        Serial.println("[SYSTEM] PCF8574 unavailable; stopping for safety.");
        while (true) delay(1000);
    }

    if (!storageManager.begin()) Serial.println("[SYSTEM] Storage unavailable.");

    // 3. WS2812 Addressable LEDs (Porch Light & Status)
    ledManager.begin();

    // 4. Two-Way Audio Engine (INMP441 Mic & MAX98357A Amp)
    if (!audioManager.begin()) Serial.println("[SYSTEM] Audio unavailable.");

    const auto& settings=storageManager.getDeviceSettings();
    ledManager.setBrightnessLevels(settings.idleBrightness,settings.activeBrightness);
    audioManager.setSpeechGain(settings.speakerGain);

    // 5. Doorbell Physical Push Button (GPIO 19)
    doorbellManager.begin();

    // 6. Camera Optical Subsystem (OV3660)
    if (!cameraManager.begin()) Serial.println("[SYSTEM] Camera unavailable.");

    // 7. RFID / NFC Keycard Reader (RC522 SPI)
    if (!nfcManager.begin()) Serial.println("[SYSTEM] RFID unavailable.");

    // 8. Cryptographic Security Engine
    securityManager.begin();

    // 9. Wi-Fi STA Connection & Modem Sleep
    wifiManager.begin();
    sleepManager.begin();

    // 10. WebSocket API Client & Local Streaming Servers
    apiClient.begin();

    Serial.println("🚀 [SYSTEM READY] Doorbell services started; check subsystem status.\n");
}

void loop() {
    // Non-blocking cooperative multitasking loop
    wifiManager.update();
    apiClient.update();
    doorbellManager.update();
    nfcManager.update();
    relayManager.update();
    cameraManager.update();
    securityManager.update();
    ledManager.update();
}
