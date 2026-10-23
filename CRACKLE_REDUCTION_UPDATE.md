# Crackle reduction update (rc4)

ESP32 firmware rc4 is already installed on COM9. Startup confirmed audio, camera, RFID, LittleFS and backend connection. The live website still needs the two web files below.

## Update GitHub and Render

1. Extract doorbell-rc4-web-audio-update.zip.
2. Open https://github.com/ggopgg/smart-bell-app and navigate into the public folder.
3. Replace doorbell.js with the version from the ZIP's public folder.
4. Add playback-worklet.js into that same public folder. Both JavaScript files must be deployed together.
5. Commit the changes. Wait for Render's deployment to finish. If automatic deployment is disabled, use Manual Deploy > Deploy latest commit.
6. Refresh the doorbell page with Ctrl+Shift+R. Start Live View and test visitor speech with the computer microphone muted, then test both directions together.

No environment variables or private settings need changing. No filesystem upload is needed. Do not upload the ZIP itself as a file in the repository. The Render build must run the existing npm run build so public files are copied into dist.

If Live View reports a missing playback module, verify that playback-worklet.js was added inside public and that the latest deployment finished.

## What changed

- The ESP speaker queue now holds up to 640 ms of incoming speech instead of 80 ms. Speech starts with approximately 120 ms of prebuffering after a gap; local chimes bypass that wait.
- ESP speaker playback smooths gap and recovery transitions over 5 ms instead of stepping between a nonzero sample and silence.
- Browser playback now uses one continuous AudioWorklet with a 100 ms startup buffer, interpolation to the browser audio rate, and 5 ms gap/recovery smoothing. The bounded queue retains up to one second; on overflow it discards stale audio rather than growing indefinitely.
- Speaker gain remains 4x. Full duplex, microphone mute behavior and the rc3 video bandwidth settings remain in place.

This targets packet-boundary and buffer-underflow clicks. Listening confirmation is still required; it is not a measured guarantee of noise removal or end-to-end latency. Large network stalls can still exceed the playback buffer.

## Validation

- 11 web/backend tests passed, including simultaneous audio, permission/session cleanup, jitter buffering, packet continuity, fade transitions and bounded overflow.
- Native C++ tests passed against the actual audio manager and smoothing helper: microphone retention, speaker burst capacity, speech prebuffering, gap fade-out and immediate local tones.
- ESP32 build and upload succeeded, with flash hashes verified. Firmware 3.1.0-rc4 booted and connected to the backend; LittleFS mounted successfully.
- Chrome headless verification at http://127.0.0.1:19191/ (1280 x 900) loaded the dashboard and new AudioWorklet, started/ended a synthetic media session, and rendered synthetic PCM in an OfflineAudioContext. RMS 0.24958, peak 0.25, no page errors. Screenshot: ../crackle-fix-browser-check.png.
- Browser plugin was unavailable, so Playwright used installed Chrome. Edge was unavailable. Production web build passed. Real microphone/speaker listening and Render deployment remain to be confirmed.

The local source project has the updated firmware, public files and tests. The ZIP intentionally includes only the two web files and this guide; private credentials are excluded.
