#pragma once
#include <string>
#include <stdint.h>
using String = std::string;
class Preferences {
protected:
    uint32_t _handle=1;
    bool _started=true;
};
