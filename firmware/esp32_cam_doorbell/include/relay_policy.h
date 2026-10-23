#pragma once
#include <stdint.h>

// Pure state policy; the relay task owns this object and all PCF writes.
class RelayPolicy {
public:
    bool unlock(uint32_t now, uint32_t duration) {
        tick(now);
        if (fault_ || lock_ || duration == 0 || duration > 1000 ||
            (used_ && uint32_t(now - offAt_) < 2000)) return false;
        lock_ = used_ = true;
        lockAt_ = now;
        lockDuration_ = duration;
        return true;
    }
    bool chime(uint32_t now, uint32_t duration) {
        tick(now);
        if (fault_ || limited_ || remote_ || duration == 0 || duration > 5000) return false;
        remote_ = true;
        remoteAt_ = now;
        remoteDuration_ = duration;
        reconcile(now);
        return true;
    }
    void button(bool on, uint32_t now) { button_ = on; reconcile(now); }
    void alarm(bool on, uint32_t now) {
        if (on && !alarm_) alarmAt_ = now;
        alarm_ = on;
        reconcile(now);
    }
    void tick(uint32_t now) {
        if (lock_ && uint32_t(now - lockAt_) >= lockDuration_) {
            lock_ = false;
            offAt_ = now;
        }
        if (remote_ && uint32_t(now - remoteAt_) >= remoteDuration_) remote_ = false;
        if (alarm_ && uint32_t(now - alarmAt_) >= 30000) alarm_ = false;
        reconcile(now);
    }
    void fail() { fault_ = true; lock_ = bell_ = false; }
    bool lockOn() const { return lock_; }
    bool bellOn() const { return bell_; }
    bool fault() const { return fault_; }
private:
    void reconcile(uint32_t now) {
        bool requested = button_ || remote_ || alarm_;
        if (!requested) limited_ = false;
        if (bell_ && uint32_t(now - bellAt_) >= 30000) limited_ = true;
        bool next = requested && !limited_ && !fault_;
        if (next && !bell_) bellAt_ = now;
        bell_ = next;
    }
    bool lock_ = false, bell_ = false, used_ = false, fault_ = false;
    bool button_ = false, remote_ = false, alarm_ = false, limited_ = false;
    uint32_t lockAt_ = 0, lockDuration_ = 0, offAt_ = 0;
    uint32_t remoteAt_ = 0, remoteDuration_ = 0, alarmAt_ = 0, bellAt_ = 0;
};
