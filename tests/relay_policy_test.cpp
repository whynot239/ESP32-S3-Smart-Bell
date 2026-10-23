#include <cassert>
#include <cstdint>
#include "../firmware/esp32_cam_doorbell/include/relay_policy.h"

int main() {
    RelayPolicy p;
    assert(!p.lockOn());
    assert(!p.unlock(0, 0));
    assert(!p.unlock(0, 1001));
    assert(p.unlock(100, 1000));
    assert(!p.unlock(999, 1000)); // Cannot extend an existing pulse.
    p.tick(1099); assert(p.lockOn());
    p.tick(1100); assert(!p.lockOn());
    assert(!p.unlock(1101, 1000)); // Cooldown follows actual shutoff.
    assert(p.unlock(3100, 1000));
    p.fail(); assert(!p.lockOn()); assert(!p.unlock(5000, 1000));

    RelayPolicy wrap;
    assert(wrap.unlock(UINT32_MAX - 500, 1000));
    wrap.tick(498); assert(wrap.lockOn());
    wrap.tick(499); assert(!wrap.lockOn());

    RelayPolicy bell;
    bell.button(true, 100);
    assert(bell.chime(100, 2000));
    bell.button(false, 200); assert(bell.bellOn());
    bell.tick(2100); assert(!bell.bellOn());
    bell.alarm(true, 2200);
    bell.button(true, 2300);
    bell.alarm(false, 2400); assert(bell.bellOn());
    bell.tick(32200); assert(!bell.bellOn()); // Held input cannot overrun cap.
    bell.button(false, 32300);
    bell.button(true, 32400); assert(bell.bellOn());
    bell.fail(); assert(!bell.bellOn());
}

