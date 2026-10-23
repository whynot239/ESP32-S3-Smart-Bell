#pragma once

// Never leave RAM authorization enabled after a failed state persistence.
template<class Persist>
bool persistCardAccess(bool& current, bool desired, Persist persist) {
    current = false;
    if (!persist(desired)) return false;
    current = desired;
    return true;
}
