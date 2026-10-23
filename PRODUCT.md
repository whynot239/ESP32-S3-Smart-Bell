# Smart Bell
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users and purpose
The homeowner operates an ESP32 doorbell and gate from a phone or computer: see and hear visitors, speak simultaneously, operate bounded controls, manage offline cards and investigate faults.

## Confirmed constraints
GOOUUU ESP32-S3-CAM N16R8, OV3660, RC522 Classic1K, INMP441 and MAX98357A. Keep working camera/audio wiring and relay safety. Owner PIN protects access changes. Card provisioning stays local USB; no private tag credentials enter the browser or server. Render hosts the existing Node/WebSocket hub.

## Confirmed update
The user requested a friendlier dashboard, settings, activity logs and debug tools, both light and dark appearance, and remotely adjustable LED brightness and ESP speech volume. Preserve offline card operation and existing private configuration.
