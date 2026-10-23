# Smart Bell dashboard update — rc6

## Already done on your ESP

rc6 was compiled, uploaded to COM9 and checked at startup on 2026-10-23. LittleFS mounted; the existing one-card metadata record remained present; OV3660, RC522 and the backend WebSocket initialized successfully. No tag writes, enrollment commands, gate pulses, filesystem formatting or card-enable changes were sent during verification. You do not need to re-enroll your working card.

## Update GitHub and Render

The hosted web app has NOT been updated automatically: the available GitHub CLI login is invalid. The ready-to-upload source package is doorbell-rc6-dashboard-update.zip.

1. Extract the ZIP. Upload/copy its CONTENTS into your existing smart-bell-app repository, preserving the folders. Do not upload only the ZIP file to GitHub.
2. Include both server.js and the new dashboard-support.js, plus all files in public/. The package also includes the complete public firmware source and tests so the repository matches the installed firmware. Private secrets.h, .env, captures, device credentials, binaries and build caches are excluded. Keep your local secrets.h and Render environment values.
3. Commit the update on the branch Render deploys. Keep your existing Render environment variables and data-disk configuration. The web build remains npm run build and the start script remains npm start. If automatic deploy is disabled, deploy the latest commit from Render.
4. Once Render reports a successful deployment, reload https://smart-bell-app.onrender.com/ and enter your private access token if asked. The token remains only in the current tab; the owner PIN is still required for protected actions.
5. Open Settings. Set lights and ESP speech volume, select Save on doorbell and enter your owner PIN. Success means the ESP acknowledged storage and application of those settings. Values are reported again by its heartbeat.
6. Open Cards and select Load from doorbell. Rename or revoke the actual saved records and save with your PIN. Adding a UID does not enroll a protected tag.

## What is new

- Five views: Live view, Activity, Cards, Settings and Diagnostics. Desktop rail and mobile bottom navigation. Light, dark and system themes.
- Recent activity shows five entries; full history has search, type/date filters, 20-row pages, protected snapshot viewing and CSV export. Offline uptime-only events are not given invented dates; future offline syncs retain a server receipt time.
- Normal card forms replace the raw JSON editor. Editing is enabled only after a successful, trusted device snapshot. Reload blocks editing in flight; failed/corrupt reads cannot appear as empty saved lists.
- Browser preferences: appearance, entrance name, time format/time zone and visitor playback volume. These are local preferences, separate from the ESP settings. No access tokens or PINs are saved in browser storage.
- Persistent ESP settings: idle brightness0..64, porch/alert brightness0..120 and incoming speech gain0..6. These values stay within the selected limits; gain0 mutes incoming speech. Chime/alarm tone volume is unchanged.
- Device-confirmed settings use owner PIN verification and the existing signed, boot-bound commands. Extra fields cannot override the signed command. Older firmware shows an update-required message.
- Diagnostics show actual reported firmware/hardware, Wi-Fi signal, device/server uptime, free memory, queued events, saved-card count, subsystem status and relay fault state. The last50 command results reset when the hub restarts. Download debug report exports these readings and bounded browser messages, never tokens, PINs, private card keys or raw server output.
- Alarm banner, offline control gating, explicit card-access state and mobile disconnect. A relay pulse is never presented as proof the gate physically opened.

## Validation and remaining checks

15 Node tests pass, including PIN/acknowledgement integration, card validation, settings bounds and command-field injection prevention, full-duplex audio, permission races and jitter playback. Seven native suites pass, including runtime LED settings, speech clamping, settings limits and prior protected-card tests. Firmware build: RAM113448/327680 bytes, flash1093333/5242880. COM9 upload hashes verified.

Chrome/Playwright checked1440x1000 and390x844, both themes and all five views, activity filtering/pagination/empty state, card rename preserving the other record, settings save/PIN flow, intercom start and cleanup on navigation, offline disabling, no token/PIN browser storage and zero page errors. Browser plugin was unavailable. UI checks used simulated hardware; they never operated the real gate.

A fresh read-only security review identified and verified fixes for untrustworthy empty snapshots and card edits lost during async reads/saves. The mechanical UI check identified small text, corrected to an11px minimum. Dynamic hidden image elements receive authenticated object URLs before display; missing static src warnings are intentional for live frames and snapshot dialogs.

Pending after the actual Render deployment: physical light/speech-level adjustments, reboot persistence of changed levels, live intercom through the deployed UI and normal/offline/reboot card tests. No claim of physical gate testing is made. MIFARE Classic remains vulnerable to key recovery/cloning despite the stronger offline provisioning.

## Local preview

http://127.0.0.1:19194/#token=preview-mobile-token-0000000000

Preview owner: owner; demo PIN:987654. Its visible banner says simulated device. Its controls never operate your real hardware. Demo card names/events are examples. This token/PIN pair works only for the isolated local preview.
