#include "wifi_manager.h"
#include "led_manager.h"
#include <time.h>

WifiManager wifiManager;

WifiManager::WifiManager()
    : lastReconnectAttempt(0),
      wasConnected(false),
      timeConfigured(false) {}

void WifiManager::begin() {
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    initiateConnection();
}

void WifiManager::initiateConnection() {
    Serial.printf("📡 [WIFI] Connecting to SSID: %s ...\n", DEFAULT_WIFI_SSID);
    ledManager.setStatusColor(0, 0, 255); // Blue
    WiFi.begin(DEFAULT_WIFI_SSID, DEFAULT_WIFI_PASSWORD);
}

bool WifiManager::isConnected() const {
    return (WiFi.status() == WL_CONNECTED);
}

String WifiManager::getIpAddress() const {
    if (isConnected()) {
        return WiFi.localIP().toString();
    }
    return "0.0.0.0";
}

int8_t WifiManager::getRssi() const {
    if (isConnected()) {
        return WiFi.RSSI();
    }
    return -100;
}

String WifiManager::getMacAddress() const {
    return WiFi.macAddress();
}

void WifiManager::update() {
    unsigned long now = millis();
    bool currentlyConnected = (WiFi.status() == WL_CONNECTED);

    if (currentlyConnected && !wasConnected) {
        wasConnected = true;
        configTime(0, 0, "pool.ntp.org", "time.nist.gov");
        timeConfigured = true;
        ledManager.setStatusColor(0, 255, 0); // Green
        Serial.println("\n✅ ========================================================");
        Serial.println("✅ [WIFI] Connected Successfully!");
        Serial.printf("🌐 [WIFI] Local IP Address : %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("📶 [WIFI] Signal Strength  : %d dBm\n", WiFi.RSSI());
        Serial.printf("🏷️ [WIFI] MAC Address      : %s\n", WiFi.macAddress().c_str());
        Serial.println("========================================================\n");
    } else if (!currentlyConnected && wasConnected) {
        wasConnected = false;
        timeConfigured = false;
        ledManager.setStatusColor(255, 140, 0); // Orange
        Serial.println("⚠️ [WIFI] Connection lost! Entering background auto-reconnect.");
    }

    if (!currentlyConnected && (now - lastReconnectAttempt >= 10000)) {
        lastReconnectAttempt = now;
        WiFi.reconnect();
    }
}
