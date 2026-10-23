# LED, speech-volume and key-lookup update

This update includes the simultaneous two-way website audio change plus firmware adjustments for the running doorbell.

## What changed

- Idle rainbow brightness: 8/255, previously 120/255. Porch illumination, ring animation and access/alarm indications keep the previous active brightness of 120/255.
- Speech arriving from the computer/phone is boosted by 4x (+12 dB signal gain) before the ESP32 speaker queue. The conversion clamps to signed PCM16 limits instead of wrapping. Local doorbell and access tones keep their existing levels.
- The optional NVS `hmac_key` override is checked before calling `getString`. If it is absent, firmware directly uses `DEVICE_HMAC_KEY` from the private `secrets.h`, as before. An existing saved override is still honored. This stops the repeated normal-first-install NOT_FOUND message without writing or erasing keys.
- Firmware reports `3.1.0-rc2` so you can confirm the new build is running.

## Use your existing local project

The changes are already applied under `outputs/smart-bell-system`. Your private `.env`, `secrets.h`, verified TLS certificate and pin assignments were preserved.

1. Close Serial Monitor and upload the updated firmware to COM9 through the USB-to-UART port using PlatformIO.
2. Reopen Serial Monitor at 115200. Check for `Firmware: v3.1.0-rc2`, `Incoming speech gain: 4x`, and the successful WebSocket connection. No filesystem upload/format is needed for these changes.
3. Test the idle ring and speech from the computer to the doorbell speaker. Use a modest initial listening level when testing the gain increase. Digital gain cannot exceed the amplifier's physical power limit; if loud speech sounds distorted, change `SPEECH_PLAYBACK_GAIN` from 4 to 2 in `include/config.h` and upload again.
4. Update `public/doorbell.js` and `public/doorbell.html` on GitHub and deploy the commit on Render for simultaneous two-way conversation. Refresh the page and choose **Enable microphone**. Mute pauses only your own voice.

For GitHub, the runtime files in the update ZIP should replace the corresponding files at the same paths. Do not upload your `.env` or `secrets.h`.

## Settings

In `firmware/esp32_cam_doorbell/include/config.h`:

```cpp
#define LED_IDLE_BRIGHTNESS         8
#define LED_ACTIVE_BRIGHTNESS       120
#define SPEECH_PLAYBACK_GAIN        4
```

LED values range from 0 to 255; speech gain is an integer from 1 to 8. Actual loudness and echo need testing on the assembled hardware. The MAX98357A hardware gain, supply and speaker rating also affect output; this update does not change the amplifier wiring. See the [manufacturer's amplifier information](https://www.analog.com/en/products/MAX98357A.html).

## Verification

- Native tests exercise the actual LED manager with a fake strip across idle/porch/ring/alarm/access transitions.
- PCM gain tests cover every signed 16-bit input at 4x plus boundary cases at other gains.
- The existing relay timing test remains passing.
- PlatformIO build verifies integration with the installed Arduino/Preferences/I2S drivers.
- The website update previously passed its production build and all seven frontend/backend tests. The brightness and loudness still need your physical confirmation after upload.

The earlier LittleFS mount issue is separate. This update does not format storage or claim to repair it.
