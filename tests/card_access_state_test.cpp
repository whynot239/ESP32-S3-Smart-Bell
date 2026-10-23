#include <cassert>
#include "../firmware/esp32_cam_doorbell/include/card_access_state.h"
int main() {
    bool enabled = true, durable = true;
    assert(!persistCardAccess(enabled,false,[&](bool){return false;}));
    assert(!enabled && durable); // A rejected write cannot guarantee reboot persistence.
    enabled = true;
    assert(!persistCardAccess(enabled,false,[&](bool value){durable=value;return false;}));
    assert(!enabled && !durable); // Ambiguous acknowledgement still blocks RAM.
    assert(persistCardAccess(enabled,true,[&](bool value){durable=value;return durable==value;}));
    assert(enabled && durable);
    assert(!persistCardAccess(enabled,true,[](bool){return false;}));
    assert(!enabled);
    assert(persistCardAccess(enabled,false,[&](bool value){durable=value;return true;}));
    assert(!enabled && !durable);
}
