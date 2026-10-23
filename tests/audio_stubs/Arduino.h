#pragma once
#include <stdint.h>
#include <stddef.h>
#include <atomic>
#include <cmath>
#define PI 3.14159265358979323846
inline void delay(unsigned long){}
struct TestSerial { template<class... T> void printf(const char*,T...){} void println(const char*){} };
extern TestSerial Serial;
#include <cstring>
