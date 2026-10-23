# Smart Bell — setup and verification

This release candidate integrates the GOOUUU ESP32-S3-CAM N16R8 / OV3660 firmware, Node hub, browser controls, and mobile app. It preserves the camera pins and VGA settings from your successful stream sketch. The rc6 firmware has been built, flashed to COM9 and checked at startup. The owner has confirmed the enrolled white card works. See RC6_DEPLOYMENT.md for the new dashboard deployment and remaining physical checks.

## What to use

- Firmware: `firmware/esp32_cam_doorbell/platformio.ini` and its `src/` directory.
- Hub and browser app: this repository root. The main page is the real-device control page; the old laptop simulator is retained at `/simulator` for reference.
- Mobile app: `mobile-app/App.js`. Live View opens the authenticated browser intercom. It does not use the old laptop-to-phone WebRTC implementation.
- Wiring: `firmware/WIRING_AND_SETUP_GUIDE.md`.
- Protocol and limits: `PROTOCOL_AND_TESTING.md`.
- Ignore the archived `.ino` sketch: it contains the old GPIO45 RFID assignment and is not compiled by PlatformIO.

## Features implemented

- Working-camera baseline: 20MHz XCLK, VGA JPEG quality 12, two PSRAM framebuffers, grab latest, and OV3660 orientation/color adjustments.
- Independent relay task: bounded lock pulse, no retrigger extension, two-second cooldown, independent chime sources, continuous-chime cap, I2C fault latch and OFF retries.
- PIN-confirmed remote unlock, chime, porch light and alarm disarm.
- rc5 protected-sector offline authorization with independent private per-tag keys and credentials; no UID-only fallback. See OFFLINE_CARD_ENROLLMENT_RC5.md.
- Global RFID enable/disable stored in ESP32 NVS. New installations default to disabled; disabling does not erase the saved cards. Card-list synchronization is separate.
- Exact-payload signed commands, boot-session/sequence replay checks, TLS CA verification.
- Browser live JPEG video (target 5fps), visitor audio, and simultaneous two-way audio using PCM16 at 16kHz. One active media viewer; 30-second device lease renewed every 15 seconds.
- Event snapshots, bounded offline queue with durable hub acknowledgement and deduplication, persisted hub histories.
- Optional Expo background ring/security notifications with authenticated token registration. Platform credentials still need to be configured for your app build.

No gate-position sensor is fitted: an accepted unlock pulse is not proof that the gate physically opened or relocked. Hardware failures and stuck relay contacts cannot be solved in software.

## 1. Configure the hub

Use Node 22.12 or newer. Copy `.env.example` to `.env`, then generate three separate random secrets (run this once for each):

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set `DEVICE_HMAC_KEY`, `DEVICE_CONNECTION_TOKEN`, `MOBILE_WS_TOKEN`, `OWNER_USERNAME`, and your own 6–12 digit `OWNER_PIN`. Do not use the test fixture values. Use `DATA_DIR` on persistent storage; an ephemeral cloud filesystem will lose histories, photos and push registrations when replaced. Keep reverse-proxy query strings out of logs because WebSocket URLs contain access tokens.

```sh
npm ci
npm run build
npm test
npm start
```

Deploy behind HTTPS/WSS. The hub serves only `dist/`, and private APIs require the owner bearer token. Build the browser assets before starting. HTTPS is required for phone microphone access; plain HTTP is only suitable for local development, with localhost microphone exceptions depending on the browser.

Run one hub process for this single-device installation. Multiple replicas need shared device routing and storage, which this version does not implement.

## 2. Configure and build the ESP32

Copy `firmware/esp32_cam_doorbell/include/secrets.h.example` to `secrets.h` and enter:

- Wi-Fi SSID/password.
- Backend hostname only, port 443, SSL enabled for HTTPS deployment.
- The same device HMAC key and connection token as the hub.
- The trusted PEM root CA for your backend's actual certificate chain, inside the supplied raw-string constant. Obtain it from your certificate authority's official repository. Do not substitute the server leaf certificate unless you deliberately intend leaf pinning and its renewal requirements.

A missing CA refuses the TLS connection; an invalid CA fails verification. The device must obtain NTP time before accepting commands. Keep the firmware and hub updates together: older command formats are intentionally rejected.

From the firmware directory:

```sh
pio run
pio run -t upload
pio device monitor -b 115200
```

Use the USB-to-UART port you confirmed, not USB/OTG. The upload speed is 460800. The build uses Espressif32 6.13.0 / Arduino 2.0.17, QIO flash and OPI PSRAM, and a 16MB partition table with two 5MB application slots. No USB CDC boot flag is enabled.

### First-time filesystem initialization

Firmware does **not** auto-format LittleFS on a mount error. On a new blank board, after confirming that there are no saved cards/events to preserve:

```sh
pio run -t buildfs
pio run -t uploadfs
```

`uploadfs` replaces the filesystem. Do not use it as a routine update on an installed system; back up saved records first. If changing from an older partition layout, back up data before flashing this layout. Ordinary firmware uploads do not intentionally erase NVS or LittleFS.

## 3. Connect the app

Open the HTTPS hub address in a browser and enter `MOBILE_WS_TOKEN`. The token stays in that browser tab's memory. For rc5 and later, first provision each physical tag through the local USB procedure in **OFFLINE_CARD_ENROLLMENT_RC5.md**. Adding a UID in **Manage saved cards** alone cannot authorize a tag. After both tags report READY, explicitly enable RFID access; the web page can then rename or revoke enrolled cards. Card UIDs are shown in device logs; use 8, 14 or 20 hex digits (old colon-separated UIDs are normalized).

For the native app:

```sh
cd mobile-app
npm ci
npx expo export --platform android
```

The export command checks the JavaScript bundle; it does not create an installable APK. Use your configured EAS/native build workflow to make and install a development or release build. Keep the existing EAS project only if it belongs to your account. Expo Go is not the production notification path, and the former postinstall patch that suppressed its warning is no longer run.

Enter your hub URL and owner token in the app. Set the owner username in the app to match `OWNER_USERNAME` on the hub (default `owner`). Live View opens the browser control page, where you tap **Start live view** and choose **Enable microphone** to speak and listen together. **Mute microphone** only mutes your voice; visitor audio continues.

For background alerts, configure FCM/APNs credentials for your EAS project, install the native build, allow notifications, then tap **Enable background ring alerts**. If Expo enhanced push security is enabled, set `EXPO_ACCESS_TOKEN` on the hub. This sends generic ring/security messages through Expo; it does not upload camera images to Expo. Push delivery is best effort and is not a substitute for the physical chime. No real push notification was sent during testing.

## 4. Bench checks before connecting the lock load

1. Leave relay contact loads disconnected. Power up/reset repeatedly. Neither relay should energize at boot. Verify the module is actually active-low.
2. Confirm the serial log reports 8MB PSRAM and OV3660 PID. Verify image orientation in Live View.
3. Measure the lock relay pulse, cooldown and OFF state while streaming and while disconnecting Wi-Fi. Repeated requests must not extend a pulse. Check MCU-only resets while the PCF remains powered.
4. Disconnect the PCF I2C link during a test with no load. Confirm the fault is reported and new unlocks are rejected. Restore communication, verify OFF, then restart to clear the fault latch.
5. Check physical chime press/release and overlapping alarm/remote chime. Held requests are capped at 30 seconds.
6. Test one saved RFID card enabled, disabled, offline, and after reboot. Disabling must survive reboot and card synchronization. Verify invalid/unknown cards never unlock.
7. Check live video, microphone channel selection, speaker sound, talk/listen switching, session expiry, and reconnect behavior on your phone. Tune gain only after confirming samples and speaker wiring.
8. Test offline event recovery, persisted hub history after restart, and phone notifications while the app is closed.
9. Only after confirming the **lock's own** voltage, current and permitted duty cycle, connect it through correctly rated relay contacts with suitable suppression and an independent maximum-on cutoff.

The relay board's 5V supply does not establish the lock supply rating. That rating was not provided, so the guide deliberately does not assign 5V to the lock contacts.
