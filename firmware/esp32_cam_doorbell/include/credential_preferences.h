#pragma once
#include <Preferences.h>
#include <nvs.h>

// Preferences convenience getters hide NOT_FOUND versus storage errors.
// Authorization and recovery must preserve that distinction.
class CredentialPreferences : public Preferences {
public:
    esp_err_t blobStatus(const char* key) {
        if (!_started) return ESP_ERR_INVALID_STATE;
        size_t length = 0;
        return nvs_get_blob(_handle, key, nullptr, &length);
    }
    esp_err_t enrollment(String& uid) {
        if (!_started) return ESP_ERR_INVALID_STATE;
        char value[16] = {};
        size_t length = sizeof(value);
        esp_err_t status = nvs_get_str(_handle, "enroll_uid", value, &length);
        if (status == ESP_OK) uid = value;
        return status;
    }
    bool enrollmentClear() {
        String uid;
        return enrollment(uid) == ESP_ERR_NVS_NOT_FOUND;
    }
    bool readCardsEnabled(bool& enabled) {
        uint8_t value = 0;
        if (!_started || nvs_get_u8(_handle,"cards_enabled",&value)!=ESP_OK || value>1) return false;
        enabled = value == 1;
        return true;
    }
};
