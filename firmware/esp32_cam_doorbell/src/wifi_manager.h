#pragma once
#include <Arduino.h>
#include <WiFi.h>
#include "config.h"

class WifiManager {
public:
    WifiManager();
    void begin();
    void update();

    bool isConnected() const;
    String getIpAddress() const;
    int8_t getRssi() const;
    String getMacAddress() const;

private:
    void initiateConnection();

    unsigned long lastReconnectAttempt;
    bool wasConnected;
    bool timeConfigured;
};

extern WifiManager wifiManager;
