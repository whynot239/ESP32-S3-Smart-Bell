#pragma once
#include <stdint.h>
inline unsigned long& testClock() { static unsigned long value = 0; return value; }
inline unsigned long millis() { return testClock(); }
inline void delay(unsigned long ms) { testClock() += ms; }
struct TestSerial { void println(const char*) {} };
extern TestSerial Serial;
