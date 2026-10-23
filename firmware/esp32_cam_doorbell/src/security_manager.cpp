#include "security_manager.h"
#include "storage_manager.h"
#include "relay_manager.h"
#include "led_manager.h"
#include "mbedtls/md.h"
#include <time.h>

SecurityManager securityManager;

SecurityManager::SecurityManager()
    : nonceHead(0),
      unauthorizedAttemptCount(0),
      alarmActive(false),
      alarmStartTime(0) {}

void SecurityManager::begin() {
    bootId = generateNonce();
    lastSequence = 0;
    for (size_t i = 0; i < NONCE_CACHE_SIZE; i++) {
        seenNonces[i] = "";
    }
    Serial.println("🔒 [SECURITY] HMAC-SHA256 & Replay Protection Engine initialized.");
}

String SecurityManager::generateNonce() {
    char nonceBuf[33];
    uint32_t r1 = esp_random();
    uint32_t r2 = esp_random();
    uint32_t r3 = esp_random();
    uint32_t r4 = esp_random();
    snprintf(nonceBuf, sizeof(nonceBuf), "%08x%08x%08x%08x", r1, r2, r3, r4);
    return String(nonceBuf);
}

bool SecurityManager::isNonceSeen(const String& nonce) {
    if (nonce.length() == 0) return true;
    for (size_t i = 0; i < NONCE_CACHE_SIZE; i++) {
        if (seenNonces[i] == nonce) return true;
    }
    return false;
}

void SecurityManager::rememberNonce(const String& nonce) {
    seenNonces[nonceHead] = nonce;
    nonceHead = (nonceHead + 1) % NONCE_CACHE_SIZE;
}

bool SecurityManager::constantTimeCompare(const String& a, const String& b) {
    if (a.length() != b.length()) return false;
    volatile uint8_t result = 0;
    for (size_t i = 0; i < a.length(); i++) {
        result |= (a[i] ^ b[i]);
    }
    return (result == 0);
}

String SecurityManager::computeHmacSha256(const String& payload, const String& key) {
    uint8_t hmacResult[32];
    mbedtls_md_context_t ctx;
    mbedtls_md_type_t md_type = MBEDTLS_MD_SHA256;

    mbedtls_md_init(&ctx);
    mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(md_type), 1);
    mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
    mbedtls_md_hmac_update(&ctx, (const unsigned char*)payload.c_str(), payload.length());
    mbedtls_md_hmac_finish(&ctx, hmacResult);
    mbedtls_md_free(&ctx);

    char hexBuffer[65];
    for (int i = 0; i < 32; i++) {
        snprintf(&hexBuffer[i * 2], 3, "%02x", hmacResult[i]);
    }
    return String(hexBuffer);
}

SecurityResult SecurityManager::verifyCommand(const JsonObject& cmdObj) {
    if (!cmdObj["payload"].is<String>() || !cmdObj["signature"].is<String>())
        return SecurityResult::MALFORMED_PAYLOAD;
    String payload = cmdObj["payload"].as<String>();
    if (payload.length() > 12000) return SecurityResult::MALFORMED_PAYLOAD;
    String expected = computeHmacSha256(payload, storageManager.getDeviceHmacKey());
    if (!constantTimeCompare(cmdObj["signature"].as<String>(), expected))
        return SecurityResult::INVALID_SIGNATURE;
    JsonDocument data;
    if (deserializeJson(data, payload)) return SecurityResult::MALFORMED_PAYLOAD;
    if (!data["seq"].is<uint32_t>() || data["bootId"].as<String>() != bootId ||
        data["seq"].as<uint32_t>() <= lastSequence) return SecurityResult::REPLAY_DETECTED;
    time_t now = time(nullptr);
    if (now < 1700000000 || !data["timestamp"].is<uint32_t>() ||
        llabs((long long)now - data["timestamp"].as<uint32_t>()) > CMD_TIMESTAMP_WINDOW_SEC)
        return SecurityResult::EXPIRED_TIMESTAMP;
    lastSequence = data["seq"].as<uint32_t>();
    return SecurityResult::SUCCESS;
}

void SecurityManager::recordUnauthorizedAttempt(const String& uid) {
    if (unauthorizedAttemptCount < UNAUTHORIZED_ATTEMPT_LIMIT) unauthorizedAttemptCount++;
    Serial.printf("⚠️ [SECURITY] Unauthorized NFC attempt (%u / %d) for UID: %s\n", 
                  unauthorizedAttemptCount, UNAUTHORIZED_ATTEMPT_LIMIT, uid.c_str());

    if (unauthorizedAttemptCount >= UNAUTHORIZED_ATTEMPT_LIMIT && !alarmActive) {
        alarmActive = true;
        alarmStartTime = millis();
        ledManager.setAlarmStrobe(true);
        relayManager.setAlarm(true); // Sound continuous siren/buzzer
        Serial.println("\n🚨 ========================================================");
        Serial.println("🚨 [SECURITY ALARM ACTIVE] Unauthorized threshold exceeded!");
        Serial.println("🚨 Siren sounding | Strobe active | Requiring app disarm.");
        Serial.println("🚨 ========================================================\n");
    }
}

void SecurityManager::resetUnauthorizedAttempts() {
    unauthorizedAttemptCount = 0;
}

void SecurityManager::disarmAlarm() {
    if (alarmActive) {
        alarmActive = false;
        unauthorizedAttemptCount = 0;
        ledManager.setAlarmStrobe(false);
        relayManager.setAlarm(false); // Silence buzzer
        Serial.println("🛡️ [SECURITY] Alarm successfully disarmed by authenticated command.");
    }
}

void SecurityManager::update() {
    // Auto-silence alarm after ALARM_AUTO_SILENCE_MS so buzzer does not overheat indefinitely
    if (alarmActive && (millis() - alarmStartTime >= ALARM_AUTO_SILENCE_MS)) {
        relayManager.setAlarm(false); // Cut off buzzer sound
        // Note: alarmActive stays true until user disarms via app, but noise is silenced
    }
}
