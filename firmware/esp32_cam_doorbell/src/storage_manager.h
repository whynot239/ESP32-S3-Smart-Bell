#pragma once
#include <Arduino.h>
#include <vector>
#include <LittleFS.h>
#include <Preferences.h>
#include "credential_preferences.h"
#include <ArduinoJson.h>
#include "config.h"
#include "device_settings.h"

struct NfcCardRecord {
    String uid;
    String userId;
    String name;
    String permission;
    bool active;
};

struct AccessLogEvent {
    String eventId;
    String type;        // "nfc_access", "doorbell_ring", "unauthorized_attempt", "remote_unlock"
    String userId;
    String userName;
    String cardUid;
    bool authorized;
    unsigned long timestamp;
    String method;      // "NFC", "Physical Button", "Mobile App"
};

class StorageManager {
public:
    StorageManager();
    bool begin();
    const DeviceSettings& getDeviceSettings() const { return deviceSettings; }
    bool saveDeviceSettings(const DeviceSettings& value);
    String getCardsJson() const;
    bool isReady() const { return fsReady; }
    bool canReadCards() const { return fsReady && cardBaselineTrusted && cardDatabaseHealthy; }
    bool setCardsEnabled(bool enabled);
    bool areCardsEnabled() const { return cardsEnabled; }

    // NFC Card Database Operations
    bool isCardAuthorized(const String& uid, NfcCardRecord& record);
    bool saveOrUpdateCard(const NfcCardRecord& card);
    bool canStoreCard(const String& uid) const;
    bool revokeCard(const String& uid);
    bool syncCardsFromJson(const String& jsonPayload);
    size_t getAuthorizedCardsCount();

    // Offline Event Queue Operations
    bool queueOfflineEvent(const AccessLogEvent& event);
    String getPendingEventsJson();
    bool clearPendingEvents();
    bool acknowledgeEvents(const JsonArray& ids);
    size_t getPendingEventsCount();

    // Security Snapshot Operations
    bool saveSecuritySnapshot(const uint8_t* buffer, size_t length);
    bool getSecuritySnapshot(uint8_t*& buffer, size_t& length);
    void clearSecuritySnapshot();

    // Device HMAC Key & Configuration
    String getDeviceHmacKey();
    void setDeviceHmacKey(const String& key);

private:
    bool loadCardsDatabase();
    bool saveCardsDatabase();

    std::vector<NfcCardRecord> cardCache;
    CredentialPreferences preferences;
    DeviceSettings deviceSettings;
    bool fsReady;
    bool preferencesReady = false;
    bool cardsEnabled = false;
    bool cardDatabaseHealthy = true;
    bool cardBaselineTrusted = false;
};

extern StorageManager storageManager;
