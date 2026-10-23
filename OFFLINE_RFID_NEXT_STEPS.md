# Offline RFID hardening: identification first

Requirement: a card or key fob alone must unlock locally without internet. Retain the RC522 and existing tags.

The supplied product image labels the white card as MIFARE Classic, but it does not identify the key fob chip, memory layout or current key configuration. No card-writing or key-changing operation has been performed.

## Current update: read-only identification

Firmware version: 3.1.0-rc4-inspect1. This update does not implement the new authorization mechanism yet. Normal access behavior is unchanged outside inspection mode.

1. Open Serial Monitor at 115200 on COM9.
2. Send RFID INSPECT followed by Enter/newline.
3. Within 60 seconds, tap the white card, remove it, then tap the blue fob and remove it.
4. Copy the two lines beginning [RFID INSPECT] UID= and label which is which.
5. Send RFID EXIT when finished. Inspection automatically expires after 60 seconds; send RFID INSPECT again if more time is needed.

While inspection is active, scanned tags are not passed to the gate-unlock or failed-access/alarm handlers. UID, SAK, UID length and the library-reported card type are printed. No card memory or authentication keys are written or printed. Reported type is a protocol indication, not proof of chip authenticity or cryptographic security.

## Planned next stage after identifying the actual tags

For supported MIFARE Classic tags, check the intended sector's existing data and access configuration before selecting any write operation. Do not use third-party access/payment cards. Do not alter the manufacturer block or set irreversible access conditions.

Provisioning should be an explicit administrator operation, separate from an ordinary scan. Use per-tag random sector keys and a high-entropy credential, verify every write by re-authentication/readback, and retain recovery information privately before changing keys. Reject partial/failed enrollment. Do not expose keys through serial logs, the public web app, Git or downloadable source archives.

Normal offline authorization should require the enabled local record, successful sector authentication and a matching protected credential. A UID-only match must not bypass those checks. Lost-card revocation should persist locally. Reboot/storage failures must not silently re-enable legacy UID-only unlocking.

MIFARE Classic's Crypto1 weaknesses remain: this improves resistance to casual UID copying but does not make a fully recovered/cloned card distinguishable from the original. Static HMAC data or rolling counters must not be presented as a cure for that limitation. Reader-library security notes: https://github.com/miguelbalboa/rfid#security

## Verification

The console-mode test covers explicit arming, timeout, exit, unknown commands, overlong input and millis rollover. The firmware build/upload status must be confirmed separately. Actual tag identification and provisioning are pending; the image alone cannot supply those results.

User confirmed both tags are new, unused and dedicated to this project. This permits planning enrollment on these tags, after their actual types and memory/access configuration are checked.

Build succeeded (1,079,109 bytes flash; 113,416 bytes static RAM). The first upload attempt was blocked because COM9 was busy. No firmware or card data was written in that attempt.

Upload completed and flash hash verified. Hardware boot confirmed version 3.1.0-rc4-inspect1, LittleFS, the existing saved card record, RC522 0x92, audio/camera and backend connection. The USB RFID INSPECT and RFID EXIT commands were verified on the device. Inspection was exited before releasing COM9. Neither physical tag was identified or programmed during this verification.
