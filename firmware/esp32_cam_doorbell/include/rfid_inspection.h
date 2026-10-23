#pragma once
#include <stdint.h>
#include <string.h>

// Local USB console: read-only inspection or explicit UID-targeted enrollment.
class RfidInspection {
public:
    enum class Result { None, Armed, Exited, Invalid, EnrollArmed, Enable, Disable };
    Result feed(char ch, uint32_t now) {
        if (ch != '\r' && ch != '\n') {
            if (ch >= 'a' && ch <= 'z') ch -= 'a' - 'A';
            if (used < sizeof(line) - 1) line[used++] = ch;
            else overflow = true;
            return Result::None;
        }
        if (!used && !overflow) return Result::None;
        line[used] = 0;
        Result result = Result::Invalid;
        if (!overflow && strcmp(line, "RFID INSPECT") == 0) {
            enabled = true; enrolling = false; deadline = now + 60000; result = Result::Armed;
        } else if (!overflow && used == 20 && strncmp(line, "RFID ENROLL ", 12) == 0) {
            bool valid = true;
            for (unsigned i=12;i<20;++i) valid &= (line[i]>='0' && line[i]<='9') || (line[i]>='A' && line[i]<='F');
            if (valid) {
                memcpy(target, line+12, 8); target[8]=0;
                enabled=false; enrolling=true; deadline=now+60000; result=Result::EnrollArmed;
            }
        } else if (!overflow && strcmp(line, "RFID ENABLE") == 0) {
            enabled=false; enrolling=false; result=Result::Enable;
        } else if (!overflow && strcmp(line, "RFID DISABLE") == 0) {
            enabled=false; enrolling=false; result=Result::Disable;
        } else if (!overflow && strcmp(line, "RFID EXIT") == 0) {
            enabled = false; enrolling=false; result = Result::Exited;
        }
        if (result == Result::Invalid) enrolling=false;
        used = 0; overflow = false;
        return result;
    }
    bool active(uint32_t now) {
        expire(now);
        return enabled;
    }
    bool enrollmentActive(uint32_t now) { expire(now); return enrolling; }
    const char* targetUid() const { return target; }
    void cancelEnrollment() { enrolling=false; }
private:
    void expire(uint32_t now) { if (int32_t(now-deadline)>=0) {enabled=false;enrolling=false;} }
    char line[32] = {};
    unsigned used = 0;
    bool overflow = false, enabled = false;
    bool enrolling=false;
    char target[9] = {};
    uint32_t deadline = 0;
};
