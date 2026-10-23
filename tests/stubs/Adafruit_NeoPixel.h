#pragma once
#include <stdint.h>
#include <vector>
#define NEO_GRB 1
#define NEO_KHZ800 2
class Adafruit_NeoPixel {
public:
    struct State { uint8_t brightness=0; std::vector<uint8_t> shown; };
    static State& state() { static State value; return value; }
    Adafruit_NeoPixel(int,int,int) {}
    void begin() {}
    void setBrightness(uint8_t value) { state().brightness=value; }
    void clear() {}
    void show() { state().shown.push_back(state().brightness); }
    uint32_t Color(uint8_t r,uint8_t g,uint8_t b) {return (uint32_t(r)<<16)|(uint32_t(g)<<8)|b;}
    uint32_t ColorHSV(uint16_t hue) {return hue;}
    uint32_t gamma32(uint32_t value) {return value;}
    void setPixelColor(int,uint32_t) {}
};
