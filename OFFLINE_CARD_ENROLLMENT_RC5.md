# Offline card authorization — rc5

Status: read-only fresh-context and Codex CLI reviews completed; automated RFID checks passed. Firmware build/upload verification is recorded in RFID_CLI_REVIEW_RC5.md. Physical tag enrollment is NOT automatic.

## Enrollment on your two tags

Your successful read-only checks identified both as Classic1K with empty sector15 data, old access bytes 7F078840, public NDEF Key A and factory-FF Key B.

1. End Live View while programming. Open Serial Monitor on COM9 at 115200 after the firmware upload finishes.
2. Send RFID DISABLE followed by Enter. Wait for SAVED.
3. Send RFID ENROLL F909F41F and press Enter. Within 60 seconds, place only the WHITE CARD on the reader. Keep it still until RESULT=READY, then REMOVE it.
4. Send RFID ENROLL 9A130156 and press Enter. Place only the BLUE FOB on the reader; hold it until RESULT=READY, then REMOVE it.
5. Only after both are READY, send RFID ENABLE. Wait for SAVED.
6. Tap each tag normally. Each valid tag should unlock with no phone or internet needed. Existing relay pulse limits still apply.
7. Test again after an ESP restart and with the backend/Wi-Fi unavailable. First ensure you have another way to enter your gate. A normal test tap operates the real lock; do not test where that could cause an unsafe movement.

RFID EXIT cancels an armed enrollment. Arming expires after 60 seconds. A wrong UID is refused without writes and leaves the intended UID armed. Enrollment itself never invokes the gate relay. Changing a tag's keys requires it to stay powered on the reader; do not remove it while enrollment is running.

Starting enrollment automatically saves global card access as disabled. An unfinished enrollment blocks all RFID authorization and RFID ENABLE until that same UID is recovered. A fresh preflight refusal before any saved credential/card write clears its new barrier safely; access stays disabled. RFID EXIT cancels arming, not an unfinished credential transaction.

If FAILED_OR_PENDING_RETRY_SAME_COMMAND appears: keep the ESP's NVS storage intact, remove the tag, and repeat the same UID enrollment command with that tag. Do not format the tag, try guessed access-bit edits, or erase the ESP to recover. If retry continues to fail, stop and share the status messages; keys are not printed. Interrupted trailer programming can still leave a card unable to authenticate if neither old nor new keys remain usable; the software cannot guarantee recovery from arbitrary physical card damage.

## What changed

- Offline authorization now requires ALL of: card access enabled; active permitted local UID record; active private credential record; successful sector authentication with that card's random Key A; matching 32-byte random credential and UID-bound marker; expected protected access settings.
- Matching only a UID, or only adding a UID through the web page, cannot unlock an unprovisioned card.
- Only blocks60-63 (sector15) are programmed. Blocks0-59 are not written. Sector15 becomes dedicated to this application; general NFC/NDEF apps may no longer read the entire tag. Do not reformat the enrolled tags with your phone.
- Data access uses Classic condition100 (read A/B, write B); trailer condition011 requires B for key/access changes and does not expose Key B as readable data. Access bytes are 78778840.
- Each tag has independent random keys A and B plus a random256-bit credential. This does NOT imply256-bit system security: MIFARE Classic Crypto1 remains vulnerable to key recovery and cloning.
- USB enrollment is privileged local administration. Restrict physical access to the ESP/USB and relay wiring. There is no network enrollment endpoint or printed secret.
- Prepared credentials are persisted and read back from the ESP's NVS namespace rfid_secure before ANY card write. New data is read back, keys change last, both new keys authenticate, then the record is committed active. Partial enrollment is denied. Recovery retries reuse the stored secrets instead of generating replacements.
- These credentials reside in ordinary NVS, not a secure element or newly enabled flash encryption. No eFuses are changed. Ordinary firmware uploads and LittleFS uploads preserve NVS, but full-chip erase, NVS erase, chip replacement or downgrading to old UID-only firmware can destroy recovery or weaken security. There is no exported private key backup in this update.
- Metadata is saved and read back before the enrollment barrier is cleared. Failed card-database saves leave access disabled; enable requests are refused until a successful verified database save. A database holds at most100 entries, checked before tag programming. Native NVS read errors are distinguished from absent credentials or barriers.
- Local enabled state and card metadata remain in the existing persistent storage. Revocations are effective offline once they have reached the device; an offline device cannot receive new remote revocations until it reconnects.
- Enrolled records appear as RFID <UID> in the existing card list. You can rename/revoke them through the existing authorized card-management UI. Web card synchronization changes metadata, never the private credential records.

## Software verification

Native tests cover initial enrollment, verification, credential/marker mismatch, pending and invalid record denial, a copied-data tag without authentication keys, occupied data refusal, incompatible access bytes, NVS prepare/commit failures, each mocked device-operation failure, retry recovery, lost final-trailer acknowledgement and idempotent active re-enrollment. Additional tests cover all four recoverable key/access-profile combinations, active-commit acknowledgement failure, metadata/activation failure, failed state writes, native NVS missing-versus-error behavior, and invalid enabled values. A deliberately inverted active-state check was correctly rejected by the tests. Console tests cover exact-UID arming, malformed input, timeout, inspection/exit cancellation and enable/disable commands.

Hardware authentication and enrollment must still be verified with the physical tags. The mock driver does not model all RF faults or destructive torn sector-trailer writes. Gate operation has not been tested by the agent.

NXP access-condition tables: https://cache.nxp.com/docs/en/data-sheet/MF1S50YYX_V1.pdf
Classic security limitations: https://github.com/miguelbalboa/rfid#security

If DISABLE or a revocation reports FAILED, it is not confirmed durable. RAM access is blocked, but if NVS refuses the disable write, a restart may load the earlier saved enabled state and metadata. Resolve the storage error and obtain SAVED/success before relying on revocation offline. Arbitrary storage loss, chip erasure, RF disruption, or physical extraction of keys is outside the software guarantee.
