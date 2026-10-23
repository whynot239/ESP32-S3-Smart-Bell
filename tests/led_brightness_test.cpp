#include <cassert>
#include "../firmware/esp32_cam_doorbell/src/led_manager.h"
TestSerial Serial;
int main() {
    LedManager lights;
    lights.begin();
    auto& strip=Adafruit_NeoPixel::state();
    assert(strip.brightness==8); // Dim at boot and while idle.
    testClock()+=100; lights.update(); assert(strip.brightness==8);
    lights.setPorchLight(true); assert(strip.brightness==120);
    lights.setPorchLight(false); testClock()+=100; lights.update(); assert(strip.brightness==8);
    lights.showDoorbellRingAnimation(); assert(strip.brightness==120);
    lights.stopDoorbellRingAnimation(); testClock()+=100; lights.update(); assert(strip.brightness==8);
    lights.setAlarmStrobe(true); testClock()+=200; lights.update(); assert(strip.brightness==120);
    lights.setAlarmStrobe(false); testClock()+=100; lights.update(); assert(strip.brightness==8);
    strip.shown.clear(); lights.showAccessGranted();
    bool active=false;for(auto level:strip.shown)active|=level==120;
    assert(active);assert(strip.brightness==8);
    strip.shown.clear(); lights.showAccessDenied();
    active=false;for(auto level:strip.shown)active|=level==120;
    assert(active);assert(strip.brightness==8);
    lights.setBrightnessLevels(2,80);testClock()+=100;lights.update();assert(strip.brightness==2);
    lights.setPorchLight(true);assert(strip.brightness==80);
    lights.setBrightnessLevels(65,121);assert(strip.brightness==80);
    lights.setPorchLight(false);testClock()+=100;lights.update();assert(strip.brightness==2);
}
