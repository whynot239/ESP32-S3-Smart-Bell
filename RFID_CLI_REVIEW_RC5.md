# rc5 offline RFID review and verification

Firmware installed on COM9 on 2026-10-23. Source commit: 0be0f8e (local only; not pushed).

## Review performed

A fresh-context read-only reviewer examined the public RFID implementation. The user-approved Codex CLI invocation was run twice in the isolated work/rfid-cli-review directory, supplying public code/tests through stdin:

    codex exec --sandbox read-only --skip-git-repo-check --ephemeral -

The configured CLI model was gpt-6-astra. The CLI reported that it used only supplied source and did not call tools or access hardware. No secrets.h, .env, card keys or private device storage were supplied. Public-only CLI output is retained locally under work/rfid-cli-review/review-final-output.txt.

## Findings resolved

- Recovery accepts either known valid trailer access profile independently of which administration key survived a partial write. Arbitrary torn trailers remain a hardware limitation.
- Persistent pending-enrollment barrier and global disable cover credential/metadata commits; failed enrollment cannot activate a card through stale metadata. Successful enrollment still requires separate ENABLE.
- Fresh preflight failure can release its own barrier only when native NVS explicitly confirms no prepared credential exists. NVS errors cannot be interpreted as missing state.
- Failed DISABLE blocks authorization in RAM. Enabled state is written and read back; boot uses strict native validation rather than getBool's nonzero conversion.
- Metadata mutations persist disabled before file replacement, verify the exact committed database text, and only restore prior enabled state on success. Failure blocks re-enabling until a verified save. Invalid/missing authorization fields and duplicate normalized UIDs are rejected.
- Writer/reader capacity limits agree at100 entries; enrollment checks capacity before any tag write.

The CLI suggestion that every authenticated web metadata update must require a new local USB ENABLE was not adopted: the owner remains authorized to change existing card metadata remotely. Such changes still require private enrolled credentials for physical unlock. The separate-enable enrollment rule applies to physical provisioning.

The final CLI pass found only the boot validation inconsistency, fixed before the final build. The fresh reviewer additionally caught the capacity mismatch, also fixed before upload. Neither review is a claim of exhaustive security proof.

## Verification completed

- Four native suites passed: classic_credentials, rfid_inspection, card_access_state, credential_preferences.
- Tests cover fresh enrollment and all required device-operation failure points, token/marker/version mismatch, pending denial, copied data without keys, occupied sector refusal, unexpected access settings, initial/final NVS save failures, an applied active commit with failed acknowledgement, recoverable key/access combinations, activation failures, explicit enable behavior, invalid/missing/error NVS reads and failed disable persistence.
- Deliberately inverted active-state verification was rejected by the tests.
- Final PlatformIO build: success, static RAM113432/327680, flash1090001/5242880 bytes.
- COM9 upload: success; esptool verified flashed image hashes. No full-chip erase, filesystem format or eFuse changes.
- Firmware binary SHA256: AB2F782F92BEED1B800D8CC25F0A2A0C20BCE234299DCC88615AB1C7192EFA85. The binary contains private device configuration and is not a public release artifact.
- Boot confirmed v3.1.0-rc5, PSRAM enabled, LittleFS mounted, existing one-card metadata preserved, OV3660 initialized, RC522 firmware0x92 ready, backend WebSocket connected.
- Sent only RFID DISABLE and RFID EXIT after boot. Device confirmed Card access disable: SAVED.
- No tags enrolled or tag memory written; no gate operation tested by the agent. COM9 was released after verification.

## Remaining physical verification and limitations

Follow OFFLINE_CARD_ENROLLMENT_RC5.md. Enroll each owner tag separately, confirm READY, enable only after both are ready, then test enabled/disabled access, reboot and offline operation. Keep another means of gate entry during testing.

Mock tests do not establish all physical RF, flash, filesystem durability or interrupted sector-trailer behavior. Production filesystem open/write/rename/readback failures and full reboot-boundary combinations have not all been fault-injected on physical hardware. Credentials reside in ordinary NVS; extraction/erase can compromise or destroy them. Classic Crypto1 remains vulnerable to key recovery/cloning.

A FAILED disable/revocation is not confirmed durable: RAM is blocked, but when persistent storage rejects every write, reboot may reload the earlier saved state. Resolve the storage failure and obtain confirmed success before relying on offline revocation.