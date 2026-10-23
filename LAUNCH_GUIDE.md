> Historical instructions below. Use [START_HERE.md](START_HERE.md) for this integrated release candidate, including the current intercom and native push setup.

# Personal Doorbell Launch Guide

This installation is for one owner. Do not connect the gate relay until the software checks below pass.

## 1. Create private server settings

1. Copy `.env.example` to `.env`.
2. Generate three random values with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
3. Set those values as `DEVICE_HMAC_KEY`, `DEVICE_CONNECTION_TOKEN`, and `MOBILE_WS_TOKEN`.
4. Set `OWNER_USERNAME=owner` and a new 6-12 digit `OWNER_PIN` that is not used anywhere else.
5. Start the hub with `npm start`. It must start without a configuration error before continuing.

Never send `.env`, `secrets.h`, your PIN, or either token in chat, email, or a Git repository.

## 2. Configure and test the ESP32 safely

1. Copy `firmware/esp32_cam_doorbell/include/secrets.h.example` to `secrets.h`.
2. Enter your Wi-Fi details and the exact device HMAC key and device connection token from `.env`.
3. For a local test, use your computer's LAN address, port `3000`, and `BACKEND_USE_SSL false`.
4. Flash the firmware with the gate relay physically disconnected from the solenoid.
5. Confirm the serial monitor reports Wi-Fi, NTP time synchronization, then WebSocket connection.
6. Test a ring and an NFC card. Test remote unlock only after the hub reports the device online.
7. Finally reconnect the relay. Use a fused supply, correct relay voltage, shared ground where required, and the flyback diode shown in `firmware/WIRING_AND_SETUP_GUIDE.md`.

Use the modular PlatformIO project at `firmware/esp32_cam_doorbell/src/main.cpp`. Do not flash `esp32_cam_doorbell.ino`; it is an older prototype and does not have this deployment configuration.

## 3. Configure the Android app

1. In Settings, set the server URL to your hub URL.
2. Set the access token to the value of `MOBILE_WS_TOKEN`.
3. Use `owner` as the current owner username.
4. On an active intercom call, use Open Door and enter your owner PIN. A failed/offline request must leave the gate locked.

## 4. Deploying to paid hosting

A normal static website host is not enough. Choose a Node.js **web service** host with HTTPS, WebSockets, environment variables, logs, and an always-on plan. Render paid web services meet those requirements; set the same `.env` values in its environment-variable dashboard, do not upload the `.env` file.

For a cloud deployment, set `BACKEND_HOST` to the service domain without `https://`, `BACKEND_PORT` to `443`, and `BACKEND_USE_SSL true`. Add `ALLOWED_ORIGINS=https://your-service-domain` in the host environment. Use the resulting `https://` server URL in the mobile app.

Do not use free hosting for a gate you rely on: sleeping/restarts can delay or lose delivery. A paid always-on web service works, but still needs backups and monitoring before being treated as a security product.

## 5. Launch checklist

- [ ] No placeholder appears in `.env` or `secrets.h`.
- [ ] The hub rejects an unlock while the ESP32 is offline.
- [ ] The app cannot unlock without the owner PIN.
- [ ] The ESP32 rejects an expired command after its clock synchronizes.
- [ ] You tested relay pulse duration with the lock disconnected first.
- [ ] You tested power loss, Wi-Fi loss, and backend loss; every failure leaves the gate locked.
- [ ] You changed any sample NFC cards and removed old sample credentials.

## Current product boundary

This code now has a safer personal-install foundation, but it does not yet provide durable database storage, account recovery, OTA updates, cloud backup, or remote live-video relay. Do not market or share it as a production security product until those are implemented and independently tested.
