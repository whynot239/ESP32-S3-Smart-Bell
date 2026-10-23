# Microphone streaming fix (rc3)

Installed and verified on the ESP32 connected to COM9.

The original diagnostic received 3.96 seconds of microphone samples over 29.82 seconds, with gaps up to 825 ms. The four-frame (40 ms) microphone queue discarded speech while the main loop sent JPEG frames. This was a confirmed source of broken speech; packet timing alone does not establish that all audible noise has the same cause.

Changes:
- Keep a bounded queue of up to 960 ms of microphone capture during blocking network work, and drain captured speech into one PCM packet.
- Clear old microphone and speaker frames at the start of a session; renewals preserve ongoing audio.
- Reserve the WebSockets library's header space so large media headers and contents use one write operation.
- During intercom, use 320 x 240 JPEG quality 20, with video limited to two frames per second. Postpone video if more than 100 ms of microphone audio was waiting. Normal VGA/quality 12 settings return when the call ends, expires, or disconnects. Snapshots taken during a call also use the current lower resolution; camera buffers may briefly contain frames from the preceding mode.
- Preserve speaker gain, pin map, relay policy, private settings and LittleFS.

Validation:
- A regression test against the actual audio manager failed before the fix and passed afterward. It simulates a 300 ms transmission stall and checks sample order, session reset, and bounded overflow behavior.
- Five existing browser intercom tests pass.
- Firmware builds and hardware uploads succeeded with flash hashes verified.
- The final short live check delivered 18.45 seconds of PCM over an 18.47-second arrival span, with the camera running. JPEG dimensions settled at 320 x 240. Maximum packet-arrival gap in that check was 613 ms. No PCM samples reached clipping thresholds during the measurement.
- A longer check delivered 36.65 seconds over 38.39 seconds; occasional longer gaps remain possible. These measurements are not an end-to-end acoustic latency test.

Next listening check:
1. Refresh the webpage and start Live View.
2. Leave the computer microphone muted and speak near the ESP32 microphone.
3. Enable the computer microphone and check both directions.
4. Report whether the remaining issue is crackling/hiss, missing syllables, echo, or delayed speech, and which direction is affected.

No Render update or filesystem upload is required for these firmware changes. Actual listening quality still needs confirmation; this is not a claim of complete noise removal or acoustic echo cancellation.
