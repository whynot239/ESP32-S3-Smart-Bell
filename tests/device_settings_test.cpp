#include <cassert>
#include "../firmware/esp32_cam_doorbell/include/device_settings.h"
#include "../firmware/esp32_cam_doorbell/include/audio_processing.h"
int main(){DeviceSettings settings;assert(validDeviceSettings(settings));settings.idleBrightness=65;assert(!validDeviceSettings(settings));settings=DeviceSettings{};settings.activeBrightness=121;assert(!validDeviceSettings(settings));settings=DeviceSettings{};settings.speakerGain=7;assert(!validDeviceSettings(settings));settings=DeviceSettings{};settings.version=2;assert(!validDeviceSettings(settings));settings=DeviceSettings{};settings.idleBrightness=0;settings.activeBrightness=0;settings.speakerGain=0;assert(validDeviceSettings(settings));assert(amplifySpeechSample(16000,0)==0);assert(amplifySpeechSample(16000,6)==32767);}
