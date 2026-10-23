#pragma once
#include <stddef.h>
#define pdTRUE 1
#define pdPASS 1
#define pdMS_TO_TICKS(x) (x)
using QueueHandle_t=void*;
QueueHandle_t xQueueCreate(unsigned,unsigned);
int xQueueSend(QueueHandle_t,const void*,unsigned);
int xQueueReceive(QueueHandle_t,void*,unsigned);
int xQueueReset(QueueHandle_t);
int xTaskCreatePinnedToCore(void(*)(void*),const char*,unsigned,void*,unsigned,void*,unsigned);
inline void vTaskDelay(unsigned){}

int xQueuePeek(QueueHandle_t,void*,unsigned);
unsigned uxQueueMessagesWaiting(QueueHandle_t);
