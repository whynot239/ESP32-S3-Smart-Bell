#include "camera_manager.h"

CameraManager cameraManager;

CameraManager::CameraManager()
    : initialized(false),
      cameraSessionActive(false),
      sessionStartTime(0) {}

bool CameraManager::begin() {
    camera_config_t config = {};
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0       = Y2_GPIO_NUM;
    config.pin_d1       = Y3_GPIO_NUM;
    config.pin_d2       = Y4_GPIO_NUM;
    config.pin_d3       = Y5_GPIO_NUM;
    config.pin_d4       = Y6_GPIO_NUM;
    config.pin_d5       = Y7_GPIO_NUM;
    config.pin_d6       = Y8_GPIO_NUM;
    config.pin_d7       = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.grab_mode    = CAMERA_GRAB_LATEST;

    if (!psramFound()) {
        Serial.println("[CAMERA] PSRAM required; camera disabled.");
        return false;
    }
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 12;
    config.fb_count = 2;
    config.fb_location = CAMERA_FB_IN_PSRAM;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("❌ [CAMERA] Initialization failed with error 0x%x\n", err);
        return false;
    }

    sensor_t* s = esp_camera_sensor_get();
    if (!s) {
        esp_camera_deinit();
        return false;
    }
    Serial.printf("[CAMERA] Sensor PID: 0x%04X, PSRAM: %u bytes\n", s->id.PID, ESP.getPsramSize());
    if (s->id.PID == OV3660_PID) {
        s->set_vflip(s, 1);
        s->set_brightness(s, 1);
        s->set_saturation(s, -2);
    }
    s->set_framesize(s, FRAMESIZE_VGA);

    initialized = true;
    Serial.println("✅ [CAMERA] GOOUUU ESP32-S3 Camera optical system online.");
    return true;
}

sensor_t* CameraManager::getSensor() {
    return esp_camera_sensor_get();
}

void CameraManager::wakeCameraSession() {
    if (!initialized) return;
    cameraSessionActive = true;
    sessionStartTime = millis();
}

camera_fb_t* CameraManager::captureFrame() {
    if (!initialized) return nullptr;
    wakeCameraSession();
    return esp_camera_fb_get();
}

void CameraManager::releaseFrame(camera_fb_t* fb) {
    if (fb != nullptr) {
        esp_camera_fb_return(fb);
    }
}

void CameraManager::update() {
    if (cameraSessionActive && (millis() - sessionStartTime >= CAMERA_SESSION_TIMEOUT_MS)) {
        cameraSessionActive = false;
        Serial.println("💤 [CAMERA] Video session elapsed. Intercom session ended; camera remains initialized.");
    }
}

// Bound video bandwidth during intercom; restore normal snapshots outside a call.
bool CameraManager::setLiveStreamQuality(bool enabled) {
    if (!initialized) return false;
    if (liveStreamQuality == enabled) return true;
    sensor_t* sensor = esp_camera_sensor_get();
    if (!sensor) return false;
    if (sensor->set_framesize(sensor, enabled ? FRAMESIZE_QVGA : FRAMESIZE_VGA) != 0 ||
        sensor->set_quality(sensor, enabled ? 20 : 12) != 0) {
        sensor->set_framesize(sensor, FRAMESIZE_VGA);
        sensor->set_quality(sensor, 12);
        liveStreamQuality = false;
        return false;
    }
    liveStreamQuality = enabled;
    return true;
}
