#pragma once
#include <stdint.h>
struct DeviceSettings { uint8_t version=1, idleBrightness=8, activeBrightness=120, speakerGain=4; };
inline bool validDeviceSettings(const DeviceSettings& value) {
    return value.version==1 && value.idleBrightness<=64 && value.activeBrightness<=120 && value.speakerGain<=6;
}
