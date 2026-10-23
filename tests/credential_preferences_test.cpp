#include <cassert>
#include "../firmware/esp32_cam_doorbell/include/credential_preferences.h"
esp_err_t readStatus=ESP_OK;
uint8_t enabledValue=1;
int main() {
    CredentialPreferences prefs;
    String uid;bool enabled=false;
    assert(prefs.enrollment(uid)==ESP_OK && uid=="F909F41F");
    assert(!prefs.enrollmentClear());
    assert(prefs.blobStatus("card")==ESP_OK);
    assert(prefs.readCardsEnabled(enabled) && enabled);
    readStatus=ESP_ERR_NVS_NOT_FOUND;
    assert(prefs.enrollmentClear());
    assert(prefs.blobStatus("card")==ESP_ERR_NVS_NOT_FOUND);
    assert(!prefs.readCardsEnabled(enabled));
    readStatus=99; // Read/type/length errors cannot be interpreted as missing state.
    assert(!prefs.enrollmentClear());
    assert(prefs.blobStatus("card")==99);
    assert(!prefs.readCardsEnabled(enabled));
    readStatus=ESP_OK;enabledValue=2;assert(!prefs.readCardsEnabled(enabled));
}
