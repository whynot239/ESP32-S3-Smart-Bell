#pragma once
#include <Arduino.h>
#include "esp_camera.h"
#include "pins.h"
#include "config.h"

class CameraManager {
public:
    CameraManager();
    bool begin();
    bool isReady() const { return initialized; }
    void update();

    // Session & Standby State
    void wakeCameraSession();
    bool isCameraActive() const { return cameraSessionActive; }

    // Snapshot Capture (Allocates and returns framebuffer; caller must return it)
    camera_fb_t* captureFrame();
    void releaseFrame(camera_fb_t* fb);

    // Stream Support
    sensor_t* getSensor();
    bool setLiveStreamQuality(bool enabled);

private:
    bool liveStreamQuality = false;
    bool initialized;
    bool cameraSessionActive;
    unsigned long sessionStartTime;
};

extern CameraManager cameraManager;
