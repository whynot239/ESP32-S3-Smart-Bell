#pragma once
#include <Arduino.h>
#include "secrets.h"

/**
 * ============================================================================
 * SYSTEM CONFIGURATION CONSTANTS & PARAMETERS
 * ============================================================================
 */

// Firmware Identification
#define FIRMWARE_VERSION            "3.1.0-rc6"
#define HARDWARE_MODEL              "GOOUUU-ESP32-S3-CAM-N16R8"
#define DEFAULT_DEVICE_ID           "doorbell_main_gate"

// Ring brightness (0..255): keep the idle rainbow subtle without dimming active modes.
#define LED_IDLE_BRIGHTNESS         8
#define LED_ACTIVE_BRIGHTNESS       120

// Gain for incoming speech only; 4 = +12 dB before the amplifier. Try 2 if it clips.
#define SPEECH_PLAYBACK_GAIN        4

// Network Settings (kept in ignored secrets.h)
#define DEFAULT_WIFI_SSID           WIFI_SSID
#define DEFAULT_WIFI_PASSWORD       WIFI_PASSWORD

#define DEFAULT_WS_HOST             BACKEND_HOST
#define DEFAULT_WS_PORT             BACKEND_PORT
#define DEFAULT_WS_PATH             "/ws"
#define DEFAULT_WS_USE_SSL          BACKEND_USE_SSL

// Hardware Timing Constraints
#define LOCK_BURST_DURATION_MS      1000    // Requested pulse cap; verify against the actual lock rating
#define REMOTE_CHIME_PULSE_MS       2000    // 2.0s pulse for remote app chime triggers
#define CAMERA_SESSION_TIMEOUT_MS   60000   // 60s active camera session timeout
#define DEBOUNCE_DELAY_MS           150     // Button debounce period
#define HEARTBEAT_INTERVAL_MS       30000   // 30s heartbeat keeps cloud/hub connection alive
#define RFID_POLL_INTERVAL_MS       500     // RFID polling interval
#define RFID_RESCAN_THROTTLE_MS     2000    // Delay before re-reading the exact same card

// Security & Alarm Thresholds
#define UNAUTHORIZED_ATTEMPT_LIMIT  3       // Trigger alarm after 3 consecutive denied scans
#define ALARM_AUTO_SILENCE_MS       30000   // 30s alarm sound duration before auto-silencing

// Storage Filesystem Paths (LittleFS)
#define PATH_CARD_DATABASE          "/nfc_cards.json"
#define PATH_OFFLINE_EVENTS         "/offline_events.json"
#define PATH_SECURITY_SNAPSHOT      "/unauthorized_snap.jpg"
#define MAX_OFFLINE_EVENTS          100

#ifndef BACKEND_ROOT_CA
#define BACKEND_ROOT_CA ""
#endif
