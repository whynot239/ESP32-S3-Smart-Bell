#include "nfc_manager.h"
#include "relay_manager.h"
#include "led_manager.h"
#include "audio_manager.h"
#include "camera_manager.h"
#include "security_manager.h"
#include "api_client.h"
#include "classic_credentials.h"
#include "esp_system.h"

NfcManager nfcManager;

NfcManager::NfcManager()
    : rfid(PIN_RC522_CS, UINT8_MAX), // RST pin is controlled via PCF8574 P0
      lastScanTime(0),
      lastScannedUid(""),
      lastScannedUidTime(0) {}

bool NfcManager::begin() {
    // Initialize SPI bus for RC522 (SCK: 38, MISO: 40, MOSI: 39, CS: 20)
    SPI.begin(PIN_RC522_SCK, PIN_RC522_MISO, PIN_RC522_MOSI, PIN_RC522_CS);
    rfid.PCD_Init();

    byte v = rfid.PCD_ReadRegister(rfid.VersionReg);
    if (v == 0x00 || v == 0xFF) {
        Serial.printf("⚠️ [NFC] RC522 reader communication warning (Version: 0x%02X). Check SPI lines.\n", v);
    } else {
        Serial.printf("✅ [NFC] RC522 Reader ready on SPI (Firmware Version: 0x%02X).\n", v);
    }
    initialized = v != 0x00 && v != 0xFF;
    credentialStoreReady = credentialPreferences.begin("rfid_secure", false);
    Serial.println("[RFID] Protected-sector authorization required. UID-only registrations cannot unlock.");
    if (!credentialStoreReady) Serial.println("[RFID] Credential storage unavailable; card unlock disabled.");
    return initialized && credentialStoreReady;
}

void NfcManager::softReset() {
    rfid.PCD_Reset();
    rfid.PCD_Init();
}

void NfcManager::handleCardScanned(const String& cardUid) {
    Serial.println("\n💳 ========================================================");
    Serial.printf("💳 [NFC SCAN] Card UID: %s\n", cardUid.c_str());

    NfcCardRecord cardRecord;
    bool authorized = storageManager.isCardAuthorized(cardUid, cardRecord) && verifyProtectedCard(cardUid);

    AccessLogEvent logEvent;
    logEvent.eventId = securityManager.generateNonce();
    logEvent.cardUid = cardUid;
    logEvent.timestamp = millis();
    logEvent.method = "NFC protected sector";

    if (authorized) {
        // -------------------------------------------------------------
        // 1. Authorized Card Flow
        // -------------------------------------------------------------
        logEvent.type = "nfc_access";
        logEvent.userId = cardRecord.userId;
        logEvent.userName = cardRecord.name;
        logEvent.authorized = true;

        Serial.printf("✅ [ACCESS GRANTED] User: %s (ID: %s)\n", cardRecord.name.c_str(), cardRecord.userId.c_str());
        Serial.println("💳 Poping gate solenoid for 1000ms...");
        Serial.println("💳 ========================================================\n");

        // Unlock gate safely
        if (!relayManager.triggerGateUnlockBurst(LOCK_BURST_DURATION_MS)) return;
        audioManager.playAccessGrantedTone();
        ledManager.showAccessGranted();

        // Reset security unauthorized attempt counter
        securityManager.resetUnauthorizedAttempts();

        // Dispatch live event to backend or queue offline
        if (!apiClient.sendAccessEvent(logEvent)) {
            storageManager.queueOfflineEvent(logEvent);
        }
    } else {
        // -------------------------------------------------------------
        // 2. Unauthorized / Unknown / Disabled Card Flow
        // -------------------------------------------------------------
        logEvent.type = "unauthorized_attempt";
        logEvent.userId = "unknown";
        logEvent.userName = "Unknown Visitor";
        logEvent.authorized = false;

        Serial.println("❌ [ACCESS DENIED] Card is unknown or disabled!");
        Serial.println("💳 Solenoid remains locked. Capturing security photo...");
        Serial.println("💳 ========================================================\n");

        audioManager.playAccessDeniedTone();
        ledManager.showAccessDenied();

        securityManager.recordUnauthorizedAttempt(cardUid);

        // Capture security photo
        camera_fb_t* fb = cameraManager.captureFrame();
        if (fb != nullptr) {
            storageManager.saveSecuritySnapshot(fb->buf, fb->len);
            apiClient.sendSecurityAlert(logEvent, fb->buf, fb->len);
            cameraManager.releaseFrame(fb);
        } else {
            apiClient.sendSecurityAlert(logEvent, nullptr, 0);
        }



        // Queue event if offline
        if (!apiClient.isConnected()) {
            storageManager.queueOfflineEvent(logEvent);
        }
    }
}

void NfcManager::update() {
    // Bounded local console input; card writes require explicit UID-targeted enrollment.
    for (unsigned i = 0; i < 32 && Serial.available(); ++i) {
        auto result = inspection.feed(char(Serial.read()), millis());
        if (result == RfidInspection::Result::Armed)
            Serial.println("[RFID INSPECT] Active for 60 seconds. Tap each tag separately; no card writes, gate action or access alarms for inspection scans.");
        else if (result == RfidInspection::Result::EnrollArmed)
            Serial.printf("[RFID ENROLL] Armed for UID=%s for 60 seconds. Keep only that tag on the reader until completion. No gate action during enrollment.\n", inspection.targetUid());
        else if (result == RfidInspection::Result::Enable || result == RfidInspection::Result::Disable) {
            bool enable = result == RfidInspection::Result::Enable;
            bool ok = (!enable || (credentialStoreReady && !credentialFault && credentialPreferences.enrollmentClear())) && storageManager.setCardsEnabled(enable);
            Serial.printf("[RFID] Card access %s: %s. Protected credentials are always required.\n", enable ? "enable" : "disable", ok ? "SAVED" : "FAILED");
        }
        else if (result == RfidInspection::Result::Exited)
            Serial.println("[RFID INSPECT] Ended; normal access handling restored.");
        else if (result == RfidInspection::Result::Invalid)
            Serial.println("[RFID] Unknown command; enrollment cancelled. Use RFID INSPECT, RFID ENROLL <8-hex UID>, RFID ENABLE, RFID DISABLE or RFID EXIT.");
    }
    if (!initialized) return;
    unsigned long now = millis();
    if (now - lastScanTime < RFID_POLL_INTERVAL_MS) return;
    lastScanTime = now;

    if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
        return;
    }

    // Format Card UID String (e.g. "A3:4F:92:B1")
    String cardUid = "";
    for (byte i = 0; i < rfid.uid.size; i++) {

        if (rfid.uid.uidByte[i] < 0x10) cardUid += "0";
        cardUid += String(rfid.uid.uidByte[i], HEX);
    }
    cardUid.toUpperCase();

    // Prevent re-triggering repeatedly if card is held against reader
    if (cardUid == lastScannedUid && (now - lastScannedUidTime < RFID_RESCAN_THROTTLE_MS)) {
        rfid.PICC_HaltA();
        rfid.PCD_StopCrypto1();
        return;
    }

    lastScannedUid = cardUid;
    lastScannedUidTime = now;

    if (inspection.enrollmentActive(millis())) {
        if (cardUid != inspection.targetUid()) {
            Serial.printf("[RFID ENROLL] Wrong tag UID=%s; waiting for the requested tag. No changes made.\n", cardUid.c_str());
        } else {
            inspection.cancelEnrollment();
            bool ok = enrollProtectedCard(cardUid);
            Serial.printf("[RFID ENROLL] UID=%s RESULT=%s. Remove tag.\n", cardUid.c_str(), ok ? "READY" : "FAILED_OR_PENDING_RETRY_SAME_COMMAND");
        }
    } else if (inspection.active(millis())) {
        MFRC522::PICC_Type type = rfid.PICC_GetType(rfid.uid.sak);
        bool classic = type == MFRC522::PICC_TYPE_MIFARE_MINI ||
                       type == MFRC522::PICC_TYPE_MIFARE_1K ||
                       type == MFRC522::PICC_TYPE_MIFARE_4K;
        Serial.printf("[RFID INSPECT] UID=%s SAK=0x%02X UID_BYTES=%u TYPE=%s CLASSIC=%s\n",
            cardUid.c_str(), unsigned(rfid.uid.sak), unsigned(rfid.uid.size),
            String(rfid.PICC_GetTypeName(type)).c_str(), classic ? "YES" : "NO");
        if (type == MFRC522::PICC_TYPE_MIFARE_1K || type == MFRC522::PICC_TYPE_MIFARE_4K)
            inspectClassicMemory();
        Serial.println("[RFID INSPECT] Read-only check complete; no keys or card contents changed. Remove tag before the next tap.");
    } else {
        handleCardScanned(cardUid);
    }

    rfid.PICC_HaltA();
    rfid.PCD_StopCrypto1();
}

// Probe only documented/common initial keys on the user's own tags. Never write.
void NfcManager::inspectClassicMemory() {
    const MFRC522::Uid expected = rfid.uid;
    const byte candidates[3][6] = {
        {0xff,0xff,0xff,0xff,0xff,0xff},
        {0xd3,0xf7,0xd3,0xf7,0xd3,0xf7},
        {0,0,0,0,0,0}
    };
    const char* names[3] = {"FACTORY_FF", "NDEF_PUBLIC", "ZERO_DEFAULT"};
    bool readChecked = false;
    for (unsigned mode = 0; mode < 2; ++mode) {
        bool authenticated = false;
        for (unsigned keyIndex = 0; keyIndex < 3; ++keyIndex) {
            if (mode == 1 && keyIndex == 1) continue;
            // Failed authentication requires reactivation before another attempt.
            // Halt with the current cipher state before clearing the reader cipher.
            rfid.PICC_HaltA();
            rfid.PCD_StopCrypto1();
            byte atqa[2], atqaLength = sizeof(atqa);
            auto wake = rfid.PICC_WakeupA(atqa, &atqaLength);
            if (wake != MFRC522::STATUS_OK && wake != MFRC522::STATUS_COLLISION) {
                Serial.println("[RFID CHECK] Tag not responding; remove it and retry inspection.");
                return;
            }
            if (rfid.PICC_Select(&rfid.uid) != MFRC522::STATUS_OK ||
                rfid.uid.size != expected.size || memcmp(rfid.uid.uidByte, expected.uidByte, expected.size) != 0) {
                Serial.println("[RFID CHECK] Selection changed or failed; check cancelled.");
                return;
            }
            MFRC522::MIFARE_Key key;
            memcpy(key.keyByte, candidates[keyIndex], sizeof(key.keyByte));
            byte command = mode == 0 ? MFRC522::PICC_CMD_MF_AUTH_KEY_A : MFRC522::PICC_CMD_MF_AUTH_KEY_B;
            if (rfid.PCD_Authenticate(command, 63, &key, &rfid.uid) != MFRC522::STATUS_OK) continue;
            authenticated = true;
            Serial.printf("[RFID CHECK] SECTOR=15 KEY_%c=AUTHENTICATED INITIAL_KEY_CLASS=%s\n", mode == 0 ? 'A' : 'B', names[keyIndex]);
            if (!readChecked) {
                bool allZero = true, readable = true;
                for (byte block = 60; block <= 62; ++block) {
                    byte data[18], length = sizeof(data);
                    if (rfid.MIFARE_Read(block, data, &length) != MFRC522::STATUS_OK || length != 18) { readable = false; break; }
                    for (unsigned i = 0; i < 16; ++i) allZero &= data[i] == 0;
                }
                byte trailer[18], length = sizeof(trailer);
                if (readable && rfid.MIFARE_Read(63, trailer, &length) == MFRC522::STATUS_OK && length == 18) {
                    byte c1 = trailer[7] >> 4, c2 = trailer[8] & 15, c3 = trailer[8] >> 4;
                    bool valid = ((trailer[6] & 15) ^ c1) == 15 &&
                                 ((trailer[6] >> 4) ^ c2) == 15 &&
                                 ((trailer[7] & 15) ^ c3) == 15;
                    Serial.printf("[RFID CHECK] SECTOR=15 DATA_READ=OK DATA_ZERO=%s ACCESS=%02X%02X%02X ACCESS_VALID=%s\n",
                        allZero ? "YES" : "NO", trailer[6], trailer[7], trailer[8], valid ? "YES" : "NO");
                    readChecked = true;
                } else Serial.println("[RFID CHECK] SECTOR=15 DATA_READ=FAILED");
            }
            break;
        }
        if (!authenticated) Serial.printf("[RFID CHECK] SECTOR=15 KEY_%c=NO_COMMON_INITIAL_KEY_MATCH\n", mode == 0 ? 'A' : 'B');
    }
    rfid.PCD_StopCrypto1();
}

namespace {
class ProtectedCardDevice {
    MFRC522& reader;
    MFRC522::Uid selected;
public:
    explicit ProtectedCardDevice(MFRC522& value): reader(value), selected(value.uid) {}
    ~ProtectedCardDevice() { reader.PICC_HaltA(); reader.PCD_StopCrypto1(); }
    bool authenticate(const uint8_t* bytes, bool useB) {
        reader.PICC_HaltA(); reader.PCD_StopCrypto1();
        byte atqa[2], length=2;
        auto status=reader.PICC_WakeupA(atqa,&length);
        if (status!=MFRC522::STATUS_OK && status!=MFRC522::STATUS_COLLISION) return false;
        if (reader.PICC_Select(&reader.uid)!=MFRC522::STATUS_OK || reader.uid.size!=selected.size ||
            memcmp(reader.uid.uidByte,selected.uidByte,selected.size)) return false;
        if (reader.PICC_GetType(reader.uid.sak)!=MFRC522::PICC_TYPE_MIFARE_1K) return false;
        MFRC522::MIFARE_Key key;memcpy(key.keyByte,bytes,6);
        return reader.PCD_Authenticate(useB?MFRC522::PICC_CMD_MF_AUTH_KEY_B:MFRC522::PICC_CMD_MF_AUTH_KEY_A,63,&key,&reader.uid)==MFRC522::STATUS_OK;
    }
    bool read(unsigned block,uint8_t* out) {
        if (block<60 || block>63) return false;
        byte buffer[18],length=18;
        if(reader.MIFARE_Read(block,buffer,&length)!=MFRC522::STATUS_OK || length!=18)return false;
        memcpy(out,buffer,16);return true;
    }
    bool write(unsigned block,const uint8_t* bytes) {
        if(block<60 || block>63)return false;
        byte copy[16];memcpy(copy,bytes,16);
        return reader.MIFARE_Write(block,copy,16)==MFRC522::STATUS_OK;
    }
};
class LocalCredentialStore {
    CredentialPreferences& prefs;
    String key;
public:
    LocalCredentialStore(CredentialPreferences& value,const String& uid):prefs(value),key(String("c")+uid) {}
    esp_err_t status() { return prefs.blobStatus(key.c_str()); }
    bool exists() { return status() == ESP_OK; }
    bool load(ClassicCredential& record) {
        return exists() && prefs.getBytesLength(key.c_str())==sizeof(record) &&
            prefs.getBytes(key.c_str(),&record,sizeof(record))==sizeof(record) && validClassicCredential(record);
    }
    bool save(const ClassicCredential& record) {
        if(prefs.putBytes(key.c_str(),&record,sizeof(record))!=sizeof(record))return false;
        ClassicCredential check{};
        return load(check) && memcmp(&check,&record,sizeof(record))==0;
    }
};
}

bool NfcManager::verifyProtectedCard(const String& uid) {
    if(credentialFault || (credentialStoreReady && !credentialPreferences.enrollmentClear()))return false;
    if(!credentialStoreReady || uid.length()!=8 || rfid.uid.size!=4 ||
       rfid.PICC_GetType(rfid.uid.sak)!=MFRC522::PICC_TYPE_MIFARE_1K)return false;
    LocalCredentialStore store(credentialPreferences,uid);
    ClassicCredential record{};
    if(!store.load(record) || memcmp(record.uid,rfid.uid.uidByte,4))return false;
    ProtectedCardDevice card(rfid);
    return verifyClassicCredential(card,record);
}

bool NfcManager::enrollProtectedCard(const String& uid) {
    if(!storageManager.canStoreCard(uid)) {
        Serial.println("[RFID ENROLL] Card database unavailable or full; no tag writes attempted.");
        return false;
    }
    if(!credentialStoreReady || uid.length()!=8 || rfid.uid.size!=4 ||
       rfid.PICC_GetType(rfid.uid.sak)!=MFRC522::PICC_TYPE_MIFARE_1K)return false;
    LocalCredentialStore store(credentialPreferences,uid);
    ClassicCredential record{};
    esp_err_t recordStatus = store.status();
    if(recordStatus != ESP_OK && recordStatus != ESP_ERR_NVS_NOT_FOUND) return false;
    bool fresh=recordStatus == ESP_ERR_NVS_NOT_FOUND;
    if(fresh) {
        record.magic=CLASSIC_CREDENTIAL_MAGIC;record.version=1;record.state=1;
        memcpy(record.uid,rfid.uid.uidByte,4);
        esp_fill_random(record.keyA,6);esp_fill_random(record.keyB,6);esp_fill_random(record.token,32);
    } else if(!store.load(record) || memcmp(record.uid,rfid.uid.uidByte,4)) {
        Serial.println("[RFID ENROLL] Existing credential record is unreadable; refusing to overwrite recovery data.");
        return false;
    }
    struct Activation {
        CredentialPreferences& prefs;
        String uid;
        bool& fault;
        bool begin() {
            fault = true;
            // This persists across reboot and is never automatically re-enabled.
            if(!storageManager.setCardsEnabled(false))return false;
            String pendingUid;
            esp_err_t status = prefs.enrollment(pendingUid);
            if(status != ESP_ERR_NVS_NOT_FOUND && (status != ESP_OK || pendingUid != uid)) {
                Serial.println("[RFID ENROLL] Another UID has unfinished enrollment; recover that UID first.");
                return false;
            }
            String check;
            return prefs.putString("enroll_uid",uid)==uid.length() && prefs.enrollment(check)==ESP_OK && check==uid;
        }
        bool saveMetadata() {
            NfcCardRecord metadata;
            metadata.uid=uid;metadata.userId="owner";metadata.name=String("RFID ")+uid;
            metadata.permission="gate_access";metadata.active=true;
            return storageManager.saveOrUpdateCard(metadata);
        }
        bool finish() {
            if(!prefs.remove("enroll_uid") || !prefs.enrollmentClear())return false;
            fault=false;return true;
        }
    } activation{credentialPreferences,uid,credentialFault};
    ProtectedCardDevice card(rfid);
    if(!completeClassicEnrollment(card,store,record,fresh,activation)) {
        // A nonexistent prepared record proves the write-before-card-write step
        // never completed. Release only this new barrier; keep access disabled.
        String pendingUid;
        if(fresh && store.status()==ESP_ERR_NVS_NOT_FOUND &&
           credentialPreferences.enrollment(pendingUid)==ESP_OK && pendingUid==uid &&
           credentialPreferences.remove("enroll_uid") && credentialPreferences.enrollmentClear()) {
            credentialFault=false;
            Serial.println("[RFID ENROLL] Preflight failed before card writes; no pending transaction remains. Card access is still disabled.");
        }
        Serial.println("[RFID ENROLL] Not activated. Card access remains disabled. Keep ESP storage intact and retry the same UID.");
        return false;
    }
    Serial.println("[RFID ENROLL] Protected credential verified and saved locally. RFID ENABLE is a separate command.");
    return true;
}
