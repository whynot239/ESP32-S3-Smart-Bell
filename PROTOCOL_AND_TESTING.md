# Protocol, validation and remaining limits

## Commands

The hub sends `{payload: "<JSON string>", signature: "<HMAC-SHA256 hex>"}`. The signature covers the exact UTF-8 payload bytes, including the command, nonce, timestamp, user, bootId, sequence and all action parameters. The ESP parses the signed string only after verification.

The device generates a new bootId at boot and registers its last accepted sequence on every connection. It rejects the wrong bootId, non-increasing sequences, invalid signatures, and timestamps outside the permitted window. The hub signs all commands, including light/chime/media controls and offline acknowledgements. TLS uses a configured root CA. Plain WS is only a development option.

A `command_result` acknowledges acceptance or persistence on the device. For unlock, this means a bounded pulse was accepted; it is not a gate-position reading. The HTTP API waits up to five seconds. A timeout is indeterminate: do not assume that a timed-out unlock was never performed or automatically retry it. The hardware cooldown is an additional constraint.

RFID global state is stored independently in NVS and defaults OFF on a new installation. Card list updates use a temporary file and rename; failed writes restore the prior in-memory list. Only active records with `gate_access` permission qualify. UIDs are normalized without colons. UID comparison on an RC522 is not cryptographic card authentication: cloned UIDs remain a security limitation.

## Media

One authenticated `/api/media` WebSocket viewer is allowed at a time. Binary byte 1 introduces a JPEG; byte 2 introduces little-endian PCM16 mono at 16kHz. Microphone packets are 160 samples (10ms) from the device; browser talk packets are 320 samples (20ms). The ESP uses continuous stereo 32-bit I2S slots (64 BCLKs per frame), selects the microphone's left slot, and duplicates speaker PCM into both slots. MCLK is disabled.

The camera targets VGA at five frames per second. Backpressure drops media rather than building unbounded server queues. The microphone task continuously drains DMA into a bounded queue. Network stalls can reduce quality or lose media; the relay task remains independent. The browser plays incoming audio continuously, including while the local microphone transmits. Microphone capture starts only after **Enable microphone**; mute only stops outgoing audio. The session stops on page hide. A device media lease expires after 30 seconds without renewal. This is JPEG/PCM over a hub connection, not WebRTC or a low-bandwidth video codec.

No unauthenticated local port-80 capture or port-81 streaming server is started. The public browser UI reaches the camera through the authenticated hub. The successful original sketch remains useful as an isolated hardware diagnostic, but should not be deployed with credentials copied into this repository.

## Storage and notifications

LittleFS never auto-formats on a mount error. Offline queue entries are retained until a signed hub acknowledgement names the event IDs. The hub saves and fsyncs its history before acknowledging, and deduplicates event IDs. The queue is bounded to 100 events; the oldest is dropped when full. Hub histories retain up to 5000 entries per list. Snapshots are retained on disk; define a retention policy for a long-running deployment. Offline event timestamps from the original event model are device uptime, explicitly shown as such rather than converted into false calendar dates.

Live events are also queued before sending and removed only after a signed acknowledgement following hub persistence. A failed local filesystem write still prevents durability, and bounded retention can drop old events. Snapshot bytes are handled separately from event acknowledgements. Do not treat the history as an audit-grade access-control ledger.

Push registration persists in DATA_DIR. Ring/security alerts use Expo's push service and process delivery tickets and delayed receipts; invalid device registrations are removed. Receipt polling is in-memory and does not survive hub restart. There is no guaranteed-delivery retry queue. Configure native FCM/APNs credentials and verify with your real phone. See [Expo setup](https://docs.expo.dev/push-notifications/push-notifications-setup/) and [Expo delivery documentation](https://docs.expo.dev/push-notifications/sending-notifications/). Browser audio requires a secure context; see [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) and [AudioWorklet](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet).

## Automated checks

- `npm test`: frontend audio regression tests plus local fake-device HTTP/WebSocket integration checks; owner authorization, private-file denial, full-payload signatures, device acknowledgement timing/failure, RFID controls, telemetry, media forwarding, duplicate offline batch persistence and acknowledgement. Separate push tests inject a fake HTTP transport; no real push messages are sent.
- `npm run build`: browser production assets.
- `g++ -std=c++11 tests/relay_policy_test.cpp -o relay_policy_test` then run it: no pulse extension, cooldown, timer rollover, overlapping chime sources, held-button cap and fault behavior.
- `pio run` in `firmware/esp32_cam_doorbell`: ESP32-S3 firmware compilation, including 16MB image generation.
- `npx expo export --platform android` in `mobile-app`: JavaScript/native-module bundle resolution. This is not an APK build or a physical-device test.
- Browser interaction check against a mock device: connect, PIN-confirmed enable/disable cards, and visible device-confirmed state. The preview image is simulated telemetry, not a photograph from your camera.

## Not established by these checks

Physical camera/PSRAM stability, I2S channel and gain on the actual modules, microphone permission behavior on your phone, real push delivery, relay voltage compatibility, lock duty-cycle suitability, physical OFF state during reset/bus failure, and native APK signing/installation all require the setup and bench checks. No real device was flashed, no backend was deployed, and no remote repository changes were pushed.

This is a release candidate for bench validation, not a claim that the installation is safe to leave unattended. There is no implemented OTA updater, secure card challenge-response, gate-position sensor, audio echo canceller on the ESP32, or AI voice-response service.

## Simultaneous audio update — 23 October 2026

The website no longer discards visitor audio while the local microphone is enabled. The ESP32 firmware and hub already forward both audio directions concurrently. Runtime changes are limited to `public/doorbell.js` and `public/doorbell.html`; this update requires a web deployment, not an ESP32 upload.

Five frontend regression cases cover simultaneous playback/transmission, mute/unmute, denied permission, ending a session during permission, and permission resolving after a new session starts. The complete seven-test suite and production build pass. Browser checks against a simulated device confirm the microphone control and session UI render without console errors. Acoustic performance on the assembled device still needs a real conversation test.

The browser requests echo cancellation/noise suppression for its microphone where supported. This does not add an acoustic echo canceller to the ESP32. Its speaker can still feed sound into its microphone; start physical tests with headphones at the computer and modest doorbell volume. See [browser echo-cancellation behavior](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints/echoCancellation).
