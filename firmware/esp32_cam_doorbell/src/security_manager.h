#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include "security_config.h"
#include "config.h"

class SecurityManager {
public:
    SecurityManager();
    void begin();
    String bootId;
    uint32_t lastSequence = 0;
    void update();

    // HMAC-SHA256 Verification & Replay Protection
    SecurityResult verifyCommand(const JsonObject& cmdObj);
    String computeHmacSha256(const String& payload, const String& key);

    // Unauthorized Access Tracking & Alarm State
    void recordUnauthorizedAttempt(const String& uid);
    void resetUnauthorizedAttempts();
    bool isAlarmActive() const { return alarmActive; }
    void disarmAlarm();

    // Device Nonce / Event ID Generator
    String generateNonce();

private:
    bool isNonceSeen(const String& nonce);
    void rememberNonce(const String& nonce);
    bool constantTimeCompare(const String& a, const String& b);

    String seenNonces[NONCE_CACHE_SIZE];
    uint8_t nonceHead;

    uint8_t unauthorizedAttemptCount;
    bool alarmActive;
    unsigned long alarmStartTime;
};

extern SecurityManager securityManager;
