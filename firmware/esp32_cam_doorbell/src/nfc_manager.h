#pragma once
#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include "pins.h"
#include "config.h"
#include "storage_manager.h"
#include "rfid_inspection.h"
#include "credential_preferences.h"

class NfcManager {
public:
    NfcManager();
    bool begin();
    void update();

    // Re-initialization if communication drops
    void softReset();

private:
    void handleCardScanned(const String& cardUid);
    void inspectClassicMemory();
    bool verifyProtectedCard(const String& uid);
    bool enrollProtectedCard(const String& uid);

    CredentialPreferences credentialPreferences;
    bool credentialStoreReady = false;
    bool credentialFault = false;
    RfidInspection inspection;
    bool initialized = false;
    MFRC522 rfid;
    unsigned long lastScanTime;
    String lastScannedUid;
    unsigned long lastScannedUidTime;
};

extern NfcManager nfcManager;
