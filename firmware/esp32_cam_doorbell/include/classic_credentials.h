#pragma once
#include <stdint.h>
#include <string.h>

constexpr uint32_t CLASSIC_CREDENTIAL_MAGIC = 0x53424331;
#pragma pack(push, 1)
struct ClassicCredential {
    uint32_t magic;
    uint8_t version, state; // 1 = prepared, 2 = active
    uint8_t uid[4], keyA[6], keyB[6], token[32];
};
#pragma pack(pop)

inline bool validClassicCredential(const ClassicCredential& r) {
    return r.magic == CLASSIC_CREDENTIAL_MAGIC && r.version == 1 && (r.state == 1 || r.state == 2);
}
inline void classicMarker(const ClassicCredential& r, uint8_t* marker) {
    memset(marker, 0, 16); memcpy(marker, "SBELL001", 8);
    memcpy(marker + 8, r.uid, 4); marker[12] = 1;
}
inline bool classicAccessMatches(const uint8_t* trailer, bool enrolled) {
    // Data: read A/B, write B after enrollment. Trailer: key/access changes require B.
    const uint8_t oldAccess[4] = {0x7f,0x07,0x88,0x40};
    const uint8_t newAccess[4] = {0x78,0x77,0x88,0x40};
    return memcmp(trailer + 6, enrolled ? newAccess : oldAccess, 4) == 0;
}
template<class Device>
bool verifyClassicPayload(Device& card, const ClassicCredential& r, bool keyB = false) {
    if (!card.authenticate(keyB ? r.keyB : r.keyA, keyB)) return false;
    uint8_t actual[16], expected[16], difference = 0;
    for (unsigned i = 0; i < 3; ++i) {
        if (!card.read(60 + i, actual)) return false;
        if (i < 2) memcpy(expected, r.token + 16 * i, 16); else classicMarker(r, expected);
        for (unsigned j = 0; j < 16; ++j) difference |= actual[j] ^ expected[j];
    }
    return card.read(63, actual) && classicAccessMatches(actual, true) && difference == 0;
}
template<class Device>
bool verifyClassicCredential(Device& card, const ClassicCredential& r) {
    return validClassicCredential(r) && r.state == 2 && verifyClassicPayload(card, r);
}
template<class Device, class Store>
bool enrollClassicCredential(Device& card, Store& store, ClassicCredential& r, bool fresh) {
    if (!validClassicCredential(r)) return false;
    if (!fresh && r.state == 2) return verifyClassicPayload(card, r) && verifyClassicPayload(card, r, true);
    const uint8_t initialB[6] = {255,255,255,255,255,255};
    bool usingNewKey = !fresh && card.authenticate(r.keyB, true);
    if (!usingNewKey && !card.authenticate(initialB, true)) return false;
    uint8_t data[16], expected[16];
    if (!card.read(63, data)) return false;
    if (fresh ? !classicAccessMatches(data, false) :
        (!classicAccessMatches(data, false) && !classicAccessMatches(data, true))) return false;
    if (fresh) {
        for (unsigned block = 60; block < 63; ++block) {
            if (!card.read(block, data)) return false;
            for (auto value : data) if (value) return false;
        }
    }
    r.state = 1;
    // Persist and read back recovery credentials BEFORE the first card write.
    if (!store.save(r)) return false;
    for (unsigned i = 0; i < 3; ++i) {
        if (i < 2) memcpy(expected, r.token + 16 * i, 16); else classicMarker(r, expected);
        if (!card.write(60 + i, expected) || !card.read(60 + i, data) || memcmp(data, expected, 16)) return false;
    }
    uint8_t trailer[16];
    memcpy(trailer, r.keyA, 6); memcpy(trailer + 10, r.keyB, 6);
    trailer[6]=0x78; trailer[7]=0x77; trailer[8]=0x88; trailer[9]=0x40;
    // Keys change last, after all credential blocks pass readback.
    if (!card.write(63, trailer) || !verifyClassicPayload(card, r) || !verifyClassicPayload(card, r, true)) return false;
    r.state = 2;
    return store.save(r);
}

// Keep a persistent activation barrier across BOTH credential and metadata commits.
template<class Device, class Store, class Activation>
bool completeClassicEnrollment(Device& card, Store& store, ClassicCredential& r, bool fresh, Activation& activation) {
    if (!activation.begin()) return false;
    if (!enrollClassicCredential(card, store, r, fresh)) return false;
    if (!activation.saveMetadata()) return false;
    return activation.finish();
}
