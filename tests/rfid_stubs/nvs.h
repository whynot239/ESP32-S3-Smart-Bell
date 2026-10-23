#pragma once
#include <cstring>
#include <stddef.h>
#include <stdint.h>
using esp_err_t=int;
constexpr int ESP_OK=0, ESP_ERR_INVALID_STATE=1, ESP_ERR_NVS_NOT_FOUND=2;
extern esp_err_t readStatus;
extern uint8_t enabledValue;
inline esp_err_t nvs_get_blob(uint32_t,const char*,void*,size_t*) {return readStatus;}
inline esp_err_t nvs_get_str(uint32_t,const char*,char* value,size_t*) {if(!readStatus)std::strcpy(value,"F909F41F");return readStatus;}
inline esp_err_t nvs_get_u8(uint32_t,const char*,uint8_t* value) {*value=enabledValue;return readStatus;}
