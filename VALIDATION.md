# Validation report — 22 October 2026

## Passed

- Firmware: PlatformIO Espressif32 6.13.0, Arduino 2.0.17, ESP32-S3, 16MB flash image; known-working OV3660 pin map retained.
- Native relay-policy tests: pulse limits, repeated requests, cooldown, rollover, independent chime sources and fault latch.
- Backend integration tests: authenticated routes, blocked private files, full-payload HMAC, boot/sequence fields, command acceptance/failure acknowledgement, global card control, telemetry, media forwarding, and persisted/deduplicated offline batch acknowledgement.
- Push-service tests with an injected fake transport; no real notifications sent.
- Browser production build with Vite 8.3.5.
- Android JavaScript bundle export with Expo. No APK or signed native installation was produced.
- Browser interaction against a local fake ESP32: login, PIN confirmation, enable and disable cards, start/end media session controls. No physical video/audio was available in the test fixture.

## Dependency audit

- Root backend/web dependency audit: **0 reported vulnerabilities** after updating Vite and compatible dependencies.
- Mobile dependency tree: reduced from 31 findings (including one critical) to **24 findings: 16 high and 8 moderate, zero critical** after compatible fixes. Remaining root advisories include braces <=3.0.3, node-forge <=1.4.0, decode-uri-component <=0.4.2 and older uuid versions. At the time of checking, the registry's latest braces and node-forge versions remained in the reported affected ranges. npm's forced fixes suggested incompatible framework downgrades; those were not applied.
- The native app therefore needs further dependency review/upstream fixes before a production security sign-off. A successful bundle export does not resolve these advisories. Full machine-readable audit reports accompany the delivery.

## Hardware/deployment not tested

No ESP32 was flashed, no relay/lock load was actuated, no remote repository was pushed, no cloud service was deployed, and no physical phone push was sent. Actual camera stability, audio gain/channel selection, relay input levels, power supply behavior, lock ratings, reset/fault behavior and real notification delivery must be checked using START_HERE.md.

This is a reviewable release candidate, not an unattended-installation certification. The original uploaded ZIP and supplied working sketch were left unchanged. The exported source contains examples, not the user's Wi-Fi or backend credentials.
