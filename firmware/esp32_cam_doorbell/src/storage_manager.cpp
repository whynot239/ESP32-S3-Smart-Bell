#include "storage_manager.h"
#include "security_config.h"
#include "card_access_state.h"
#include <sys/stat.h>
#include <errno.h>

StorageManager storageManager;

StorageManager::StorageManager() : fsReady(false) {}

bool StorageManager::begin() {
    preferencesReady = preferences.begin("doorbell_cfg", false);
    DeviceSettings savedSettings;
    if (preferencesReady && preferences.blobStatus("ui_settings")==ESP_OK && preferences.getBytesLength("ui_settings")==sizeof(savedSettings) &&
        preferences.getBytes("ui_settings",&savedSettings,sizeof(savedSettings))==sizeof(savedSettings) &&
        validDeviceSettings(savedSettings)) deviceSettings=savedSettings;
    bool savedEnabled = false;
    cardsEnabled = preferencesReady && preferences.readCardsEnabled(savedEnabled) && savedEnabled;

    if (!LittleFS.begin(false, "/littlefs", 10, "littlefs")) {
        Serial.println("[STORAGE] Mount failed; data preserved, card access unavailable.");
        return false;
    }
    fsReady = true;
    Serial.println("✅ [STORAGE] LittleFS mounted successfully.");

    // Start with no authorized cards if no database exists.
    if (!loadCardsDatabase()) {
        cardCache.clear();
        struct stat info;String path=String("/littlefs")+PATH_CARD_DATABASE;
        errno=0;int result=::stat(path.c_str(),&info);
        cardBaselineTrusted=result!=0 && errno==ENOENT;
        cardDatabaseHealthy=cardBaselineTrusted;
        cardsEnabled=false;
        Serial.println(cardBaselineTrusted?"[STORAGE] No NFC database; no cards are authorized.":"[STORAGE] Card database unreadable; refusing card snapshots and enrollment until recovered.");
    }

    return true;
}

bool StorageManager::loadCardsDatabase() {
    if (!fsReady || !LittleFS.exists(PATH_CARD_DATABASE)) return false;

    File file = LittleFS.open(PATH_CARD_DATABASE, "r");
    if (!file) return false;

    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, file);
    file.close();

    if (error) {
        Serial.printf("❌ [STORAGE] JSON parse error in card database: %s\n", error.c_str());
        return false;
    }

    cardCache.clear();
    if (!doc.is<JsonArray>() || doc.as<JsonArray>().size()>100) return false;
    JsonArray array = doc.as<JsonArray>();
    for (JsonObject obj : array) {
        if (!obj["uid"].is<const char*>() || !obj["active"].is<bool>() ||
            !obj["permission"].is<const char*>()) return false;
        NfcCardRecord rec;
        rec.uid = obj["uid"].as<String>();
        rec.uid.toUpperCase();
        rec.uid.replace(":", "");
        rec.userId = obj["userId"].as<String>();
        rec.name = obj["name"].as<String>();
        rec.permission = obj["permission"].as<String>();
        rec.active = obj["active"].as<bool>();
        bool valid = (rec.uid.length()==8 || rec.uid.length()==14 || rec.uid.length()==20);
        for(unsigned i=0;i<rec.uid.length();++i) valid &= isxdigit(rec.uid[i])!=0;
        if(!valid || rec.permission!="gate_access" || rec.name.length()>80 || rec.userId.length()>80) return false;
        for(const auto& existing : cardCache) if(existing.uid==rec.uid) return false;
        cardCache.push_back(rec);
    }

    cardBaselineTrusted=true;
    Serial.printf("✅ [STORAGE] Loaded %u authorized NFC cards from LittleFS.\n", cardCache.size());
    return true;
}

bool StorageManager::saveCardsDatabase() {
    if (!fsReady) return false;
    const bool resumeAccess = cardsEnabled;
    // Persist disabled before changing the database, including revocations.
    // Failure retains a RAM block; only a verified save clears the fault.
    cardDatabaseHealthy = false;
    if (!setCardsEnabled(false)) return false;

    JsonDocument doc;
    JsonArray array = doc.to<JsonArray>();

    for (const auto& rec : cardCache) {
        JsonObject obj = array.add<JsonObject>();
        obj["uid"] = rec.uid;
        obj["userId"] = rec.userId;
        obj["name"] = rec.name;
        obj["permission"] = rec.permission;
        obj["active"] = rec.active;
    }

    if(doc.overflowed()) return false;
    String temporary = String(PATH_CARD_DATABASE) + ".tmp";
    File file = LittleFS.open(temporary, "w");
    if (!file) {
        Serial.println("❌ [STORAGE] Failed to open card database file for writing.");
        return false;
    }

    size_t written = serializeJson(doc, file);
    file.flush();
    file.close();
    if (written != measureJson(doc)) { LittleFS.remove(temporary); return false; }
    if (!LittleFS.rename(temporary, PATH_CARD_DATABASE)) return false;
    String expected;
    serializeJson(doc, expected);
    File committed = LittleFS.open(PATH_CARD_DATABASE,"r");
    if (!committed) return false;
    String actual = committed.readString();
    committed.close();
    if (actual != expected) return false;
    cardBaselineTrusted=true;
    cardDatabaseHealthy = true;
    if (resumeAccess && !setCardsEnabled(true)) { cardDatabaseHealthy = false; return false; }
    return true;
}

bool StorageManager::isCardAuthorized(const String& uid, NfcCardRecord& record) {
    if (!fsReady || !cardsEnabled) return false;
    String normalizedUid = uid;
    normalizedUid.toUpperCase();
    normalizedUid.replace(":", "");

    for (const auto& rec : cardCache) {
        if (rec.uid.equalsIgnoreCase(normalizedUid)) {
            record = rec;
            return rec.active && rec.permission == "gate_access"; // Authorized only if active is true
        }
    }
    return false;
}

bool StorageManager::saveOrUpdateCard(const NfcCardRecord& card) {
    if (!canStoreCard(card.uid)) return false;
    auto previous = cardCache;
    String normalizedUid = card.uid;
    normalizedUid.toUpperCase();
    normalizedUid.replace(":", "");

    bool found = false;
    for (auto& rec : cardCache) {
        if (rec.uid.equalsIgnoreCase(normalizedUid)) {
            rec = card;
            rec.uid = normalizedUid;
            found = true;
            break;
        }
    }

    if (!found) {
        NfcCardRecord newCard = card;
        newCard.uid = normalizedUid;
        cardCache.push_back(newCard);
    }

    if (saveCardsDatabase()) return true;
    cardCache = previous;
    return false;
}

bool StorageManager::canStoreCard(const String& uid) const {
    if (!fsReady || !cardBaselineTrusted) return false;
    String normalizedUid = uid;
    normalizedUid.toUpperCase(); normalizedUid.replace(":", "");
    for (const auto& record : cardCache) if (record.uid == normalizedUid) return true;
    return cardCache.size() < 100;
}

bool StorageManager::revokeCard(const String& uid) {
    auto previous = cardCache;
    String normalizedUid = uid;
    normalizedUid.toUpperCase();
    normalizedUid.replace(":", "");

    for (auto& rec : cardCache) {
        if (rec.uid.equalsIgnoreCase(normalizedUid)) {
            rec.active = false;
            if (saveCardsDatabase()) return true;
            cardCache = previous;
            return false;
        }
    }
    return false;
}

bool StorageManager::syncCardsFromJson(const String& jsonPayload) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, jsonPayload);
    if (error) return false;

    JsonArray array = doc["cards"].as<JsonArray>();
    if (array.isNull()) return false;

    if (array.size() > 100) return false;
    auto previous = cardCache;
    cardCache.clear();
    for (JsonObject obj : array) {
        NfcCardRecord rec;
        rec.uid = obj["uid"].as<String>();
        rec.uid.toUpperCase();
        rec.uid.replace(":", "");
        rec.userId = obj["userId"].as<String>();
        rec.name = obj["name"].as<String>();
        if (!obj["active"].is<bool>() || !obj["permission"].is<const char*>()) { cardCache = previous; return false; }
        rec.permission = obj["permission"].as<String>();
        rec.active = obj["active"].as<bool>();
        bool valid = (rec.uid.length() == 8 || rec.uid.length() == 14 || rec.uid.length() == 20);
        for (unsigned i = 0; i < rec.uid.length(); ++i) valid &= isxdigit(rec.uid[i]) != 0;
        if (!valid || rec.permission != "gate_access" || rec.name.length() > 80 || rec.userId.length() > 80) {
            cardCache = previous; return false;
        }
        for (const auto& existing : cardCache) if (existing.uid == rec.uid) { cardCache = previous; return false; }
        cardCache.push_back(rec);
    }

    if (saveCardsDatabase()) return true;
    cardCache = previous;
    return false;
}

size_t StorageManager::getAuthorizedCardsCount() {
    return cardCache.size();
}

bool StorageManager::queueOfflineEvent(const AccessLogEvent& event) {
    if (!fsReady) return false;

    JsonDocument doc;
    if (LittleFS.exists(PATH_OFFLINE_EVENTS)) {
        File readFile = LittleFS.open(PATH_OFFLINE_EVENTS, "r");
        if (readFile) {
            deserializeJson(doc, readFile);
            readFile.close();
        }
    }

    JsonArray array = doc.is<JsonArray>() ? doc.as<JsonArray>() : doc.to<JsonArray>();

    for (JsonObject existing : array) if (existing["eventId"].as<String>() == event.eventId) return true;

    // Cap queue to MAX_OFFLINE_EVENTS
    if (array.size() >= MAX_OFFLINE_EVENTS) {
        array.remove(0); // Drop oldest event
    }

    JsonObject obj = array.add<JsonObject>();
    obj["eventId"] = event.eventId;
    obj["type"] = event.type;
    obj["userId"] = event.userId;
    obj["userName"] = event.userName;
    obj["cardUid"] = event.cardUid;
    obj["authorized"] = event.authorized;
    obj["timestamp"] = event.timestamp;
    obj["method"] = event.method;

    String temporary = String(PATH_OFFLINE_EVENTS) + ".tmp";
    File writeFile = LittleFS.open(temporary, "w");
    if (!writeFile) return false;

    size_t written = serializeJson(doc, writeFile);
    writeFile.flush();
    writeFile.close();
    if (written != measureJson(doc) || !LittleFS.rename(temporary, PATH_OFFLINE_EVENTS)) return false;
    Serial.printf("📦 [STORAGE] Queued offline event '%s' (Queue total: %u)\n", event.eventId.c_str(), array.size());
    return true;
}

String StorageManager::getPendingEventsJson() {
    if (!fsReady || !LittleFS.exists(PATH_OFFLINE_EVENTS)) return "[]";

    File file = LittleFS.open(PATH_OFFLINE_EVENTS, "r");
    if (!file) return "[]";

    String content = file.readString();
    file.close();
    return content.length() > 0 ? content : "[]";
}

bool StorageManager::clearPendingEvents() {
    if (!fsReady) return false;
    if (LittleFS.exists(PATH_OFFLINE_EVENTS)) {
        return LittleFS.remove(PATH_OFFLINE_EVENTS);
    }
    return true;
}

size_t StorageManager::getPendingEventsCount() {
    if (!fsReady || !LittleFS.exists(PATH_OFFLINE_EVENTS)) return 0;
    File file = LittleFS.open(PATH_OFFLINE_EVENTS, "r");
    if (!file) return 0;
    JsonDocument doc;
    deserializeJson(doc, file);
    file.close();
    return doc.as<JsonArray>().size();
}

bool StorageManager::saveSecuritySnapshot(const uint8_t* buffer, size_t length) {
    if (!fsReady || buffer == nullptr || length == 0) return false;

    File file = LittleFS.open(PATH_SECURITY_SNAPSHOT, "w");
    if (!file) return false;

    size_t written = file.write(buffer, length);
    file.close();
    return (written == length);
}

void StorageManager::clearSecuritySnapshot() {
    if (fsReady && LittleFS.exists(PATH_SECURITY_SNAPSHOT)) {
        LittleFS.remove(PATH_SECURITY_SNAPSHOT);
    }
}

String StorageManager::getDeviceHmacKey() {
    // A saved override is optional. Avoid a noisy getString() on first-time installs.
    if (!preferencesReady || !preferences.isKey("hmac_key")) return String(DEVICE_HMAC_KEY);
    return preferences.getString("hmac_key", DEVICE_HMAC_KEY);
}

void StorageManager::setDeviceHmacKey(const String& key) {
    preferences.putString("hmac_key", key);
}

bool StorageManager::setCardsEnabled(bool enabled) {
    return persistCardAccess(cardsEnabled, enabled, [&](bool desired) {
        if ((desired && (!fsReady || !cardDatabaseHealthy)) || !preferencesReady ||
            preferences.putBool("cards_enabled", desired) != 1) return false;
        bool saved = false;
        return preferences.readCardsEnabled(saved) && saved == desired;
    });
}

bool StorageManager::acknowledgeEvents(const JsonArray& ids) {
    if (!fsReady || ids.isNull()) return false;
    JsonDocument existing;
    if (deserializeJson(existing, getPendingEventsJson())) return false;
    JsonDocument remaining;
    JsonArray output = remaining.to<JsonArray>();
    for (JsonObject event : existing.as<JsonArray>()) {
        bool acknowledged = false;
        for (JsonVariant id : ids) if (id.as<String>() == event["eventId"].as<String>()) acknowledged = true;
        if (!acknowledged) output.add(event);
    }
    String temporary = String(PATH_OFFLINE_EVENTS) + ".tmp";
    File file = LittleFS.open(temporary, "w");
    if (!file) return false;
    size_t written = serializeJson(remaining, file);
    file.flush(); file.close();
    return written == measureJson(remaining) && LittleFS.rename(temporary, PATH_OFFLINE_EVENTS);
}

bool StorageManager::saveDeviceSettings(const DeviceSettings& value) {
    if(!preferencesReady || !validDeviceSettings(value)) return false;
    if(preferences.putBytes("ui_settings",&value,sizeof(value))!=sizeof(value)) return false;
    DeviceSettings check;
    if(preferences.getBytes("ui_settings",&check,sizeof(check))!=sizeof(check) || memcmp(&check,&value,sizeof(value))) return false;
    deviceSettings=value;return true;
}
String StorageManager::getCardsJson() const {
    JsonDocument doc;JsonArray cards=doc.to<JsonArray>();
    for(const auto& card:cardCache) {
        JsonObject obj=cards.add<JsonObject>();obj["uid"]=card.uid;obj["name"]=card.name;
        obj["userId"]=card.userId;obj["permission"]=card.permission;obj["active"]=card.active;
    }
    if(doc.overflowed()) return String();
    String output;if(serializeJson(doc,output)!=measureJson(doc)) return String();return output;
}
