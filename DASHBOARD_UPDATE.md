# Dashboard update contract

- Preserve intercom DSP and simultaneous audio. Keep tokens in tab memory and PIN confirmation for protected operations.
- Provide five responsive views, light/dark/system themes and keyboard-accessible controls.
- Activity: readable event labels, filtering/search, bounded pagination, authenticated photos, JSON/CSV export.
- Cards: load the actual device metadata before editing; never send an example or empty list by default; no browser provisioning of secret tag keys.
- Settings: browser appearance, time display, receive volume; owner-confirmed persistent idle/active LED levels and ESP speech gain with strict limits and compatibility gating.
- Diagnostics: actual firmware, Wi-Fi, uptime, memory, storage/audio/camera readiness, pending events and bounded command outcomes; no secrets or arbitrary command console.
- Web/API and firmware are separately deployable; older firmware must show unsupported features, never fake success.
- Verify Node tests, firmware compile, device-settings tests and desktop/mobile browser interactions. Never operate a real gate during UI tests.
