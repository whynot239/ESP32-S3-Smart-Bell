#pragma once
#include <Arduino.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include "storage_manager.h"
#include "config.h"

class ApiClient {
public:
    ApiClient();
    void begin();
    void update();

    bool isConnected() const;

    // Outbound Event Dispatchers
    bool sendAccessEvent(const AccessLogEvent& event);
    bool sendSecurityAlert(const AccessLogEvent& event, const uint8_t* photoBuf, size_t photoLen);
    bool sendDoorbellRing(const AccessLogEvent& event, const uint8_t* photoBuf, size_t photoLen);
    bool sendDoorbellRelease();
    bool sendAudioChunk(const int16_t* pcmSamples, size_t sampleCount);
    void flushOfflineEvents();

    // Inbound WebSocket Handler
    void handleWebSocketEvent(WStype_t type, uint8_t* payload, size_t length);

private:
    void sendHeartbeat();
    void commandResult(const String& nonce, bool success);
    void handleIncomingJson(const String& jsonStr);

    WebSocketsClient webSocket;

    unsigned long lastHeartbeatTime;
    bool wsConnected;
    uint32_t mediaUntil = 0, lastVideoTime = 0;
    bool mediaActive = false;
};

extern ApiClient apiClient;
