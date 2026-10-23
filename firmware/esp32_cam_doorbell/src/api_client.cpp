#include "api_client.h"
#include "wifi_manager.h"
#include "relay_manager.h"
#include "led_manager.h"
#include "audio_manager.h"
#include "camera_manager.h"
#include "security_manager.h"
#include "storage_manager.h"

ApiClient apiClient;

static void webSocketEventWrapper(WStype_t type, uint8_t* payload, size_t length) {
    apiClient.handleWebSocketEvent(type, payload, length);
}

ApiClient::ApiClient()
    : lastHeartbeatTime(0),
      wsConnected(false) {}

void ApiClient::begin() {
    // 1. Initialize WebSocket Client
    String wsPath = String(DEFAULT_WS_PATH) + "?device_token=" + DEVICE_CONNECTION_TOKEN;
    if (DEFAULT_WS_USE_SSL) {
        if (strlen(BACKEND_ROOT_CA) == 0) {
            Serial.println("[API] Configure BACKEND_ROOT_CA before TLS connection.");
            return;
        }
        webSocket.beginSslWithCA(DEFAULT_WS_HOST, DEFAULT_WS_PORT, wsPath.c_str(), BACKEND_ROOT_CA);
    } else {
        webSocket.begin(DEFAULT_WS_HOST, DEFAULT_WS_PORT, wsPath.c_str());
    }
    webSocket.onEvent(webSocketEventWrapper);
    webSocket.setReconnectInterval(5000);
    webSocket.enableHeartbeat(15000, 3000, 2);

    // Remote media uses the authenticated hub connection; no unauthenticated LAN listener.

    Serial.println("✅ [API] Network Services & WebSocket Engine started.");
}

bool ApiClient::isConnected() const {
    return wsConnected;
}

void ApiClient::handleWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            wsConnected = false;
            mediaActive = false;
            cameraManager.setLiveStreamQuality(false);
            ledManager.setStatusColor(255, 140, 0); // Orange
            Serial.println("❌ [WEBSOCKET] Disconnected from Backend Server.");
            break;

        case WStype_CONNECTED: {
            wsConnected = true;
            ledManager.setStatusColor(0, 255, 0); // Green
            Serial.println("✅ [WEBSOCKET] Connected to Backend Server!");

            // Send registration & hardware capabilities
            JsonDocument doc;
            doc["type"] = "esp32_connect";
            doc["bootId"] = securityManager.bootId;
            doc["lastSequence"] = securityManager.lastSequence;
            doc["hardware"] = HARDWARE_MODEL;
            doc["version"] = FIRMWARE_VERSION;
            doc["mac"] = wifiManager.getMacAddress();
            doc["cardsCached"] = storageManager.getAuthorizedCardsCount();
            doc["queuedEvents"] = storageManager.getPendingEventsCount();

            String output;
            serializeJson(doc, output);
            webSocket.sendTXT(output);

            sendHeartbeat();
            // Flush any offline events recorded while disconnected
            flushOfflineEvents();
            break;
        }

        case WStype_TEXT: {
            String message;
            message.concat((char*)payload, length);
            handleIncomingJson(message);
            break;
        }

        case WStype_BIN: {
            // Incoming audio stream from mobile phone -> write directly to MAX98357A speaker amp
            if (mediaActive && int32_t(millis() - mediaUntil) < 0 && length > 1 && payload[0] == 2) {
                audioManager.writeSpeakerData(payload + 1, length - 1);
            }
            break;
        }

        default:
            break;
    }
}

void ApiClient::handleIncomingJson(const String& jsonStr) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, jsonStr);
    if (error) {
        Serial.printf("❌ [API] JSON deserialization failed: %s\n", error.c_str());
        return;
    }

    if (securityManager.verifyCommand(doc.as<JsonObject>()) != SecurityResult::SUCCESS) return;
    String signedPayload = doc["payload"].as<String>();
    doc.clear();
    if (deserializeJson(doc, signedPayload)) return;
    JsonObject obj = doc.as<JsonObject>();
    String command = obj["command"].as<String>();
    bool accepted = true;

    // All commands above have passed exact-payload HMAC, boot-session and sequence checks.
    if (command == "unlock") {
        accepted = relayManager.triggerGateUnlockBurst(LOCK_BURST_DURATION_MS);
        if (accepted) {
            AccessLogEvent event;
            event.eventId = obj["nonce"].as<String>();
            event.type = "remote_unlock";
            event.userId = obj["userId"] | "app_user";
            event.userName = obj["user"] | "Owner";
            event.cardUid = "REMOTE";
            event.authorized = true;
            event.timestamp = millis();
            event.method = "Mobile App (PIN Verified)";
            if (!sendAccessEvent(event)) storageManager.queueOfflineEvent(event);
            audioManager.playAccessGrantedTone();
            ledManager.showAccessGranted();
        }
    } else if (command == "disarm") {
        securityManager.disarmAlarm();
    } else if (command == "cards_enabled") {
        accepted = obj["enabled"].is<bool>() && storageManager.setCardsEnabled(obj["enabled"].as<bool>());
    } else if (command == "sync_cards") {
        String cardsJson;
        serializeJson(obj["data"], cardsJson);
        accepted = storageManager.syncCardsFromJson(cardsJson);
    } else if (command == "get_cards") {
        accepted=storageManager.canReadCards();
        if(accepted) {
            JsonDocument snapshot;snapshot["type"]="cards_snapshot";snapshot["nonce"]=obj["nonce"];
            String cards=storageManager.getCardsJson();JsonDocument records;
            accepted=!deserializeJson(records,cards) && records.is<JsonArray>() && records.size()==storageManager.getAuthorizedCardsCount();
            if(accepted) {
                snapshot["cards"]=records.as<JsonArray>();String output;
                accepted=!snapshot.overflowed() && serializeJson(snapshot,output)==measureJson(snapshot) && webSocket.sendTXT(output);
            }
        }
    } else if (command == "device_settings") {
        accepted=obj["idleBrightness"].is<unsigned>() && obj["activeBrightness"].is<unsigned>() && obj["speakerGain"].is<unsigned>() &&
            obj["idleBrightness"].as<unsigned>()<=64 && obj["activeBrightness"].as<unsigned>()<=120 && obj["speakerGain"].as<unsigned>()<=6;
        if(accepted) {
            DeviceSettings settings;settings.idleBrightness=obj["idleBrightness"].as<unsigned>();
            settings.activeBrightness=obj["activeBrightness"].as<unsigned>();settings.speakerGain=obj["speakerGain"].as<unsigned>();
            accepted=storageManager.saveDeviceSettings(settings);
            if(accepted) { ledManager.setBrightnessLevels(settings.idleBrightness,settings.activeBrightness);audioManager.setSpeechGain(settings.speakerGain); }
        }
    } else if (command == "live_view") {
        cameraManager.wakeCameraSession();
        accepted = cameraManager.isCameraActive();
        if (accepted && !mediaActive) {
            accepted = cameraManager.setLiveStreamQuality(true);
            audioManager.resetStream();
        }
        mediaActive = accepted;
        mediaUntil = millis() + 30000;
        if (accepted) webSocket.sendTXT("{\"type\":\"live_view_ready\"}");
    } else if (command == "offline_ack") {
        accepted = storageManager.acknowledgeEvents(obj["eventIds"].as<JsonArray>());
    } else if (command == "end_view") {
        mediaActive = false;
        cameraManager.setLiveStreamQuality(false);
    } else if (command == "chime") {
        accepted = relayManager.triggerChimePulse(obj["durationMs"] | REMOTE_CHIME_PULSE_MS);
    } else if (command == "light_set") {
        accepted = obj["state"] == "on" || obj["state"] == "off";
        if (accepted) ledManager.setPorchLight(obj["state"] == "on");
    } else {
        accepted = false;
    }
    commandResult(obj["nonce"].as<String>(), accepted);
    sendHeartbeat();
}

bool ApiClient::sendAccessEvent(const AccessLogEvent& event) {
    storageManager.queueOfflineEvent(event);
    if (!wsConnected) return false;

    JsonDocument doc;
    doc["type"] = "access_event";
    doc["eventId"] = event.eventId;
    doc["eventType"] = event.type;
    doc["userId"] = event.userId;
    doc["userName"] = event.userName;
    doc["cardUid"] = event.cardUid;
    doc["authorized"] = event.authorized;
    doc["timestamp"] = event.timestamp;
    doc["method"] = event.method;

    String payload;
    serializeJson(doc, payload);
    return webSocket.sendTXT(payload);
}

bool ApiClient::sendDoorbellRing(const AccessLogEvent& event, const uint8_t* photoBuf, size_t photoLen) {
    storageManager.queueOfflineEvent(event);
    if (!wsConnected) return false;

    JsonDocument doc;
    doc["type"] = "ring";
    doc["eventId"] = event.eventId;
    doc["source"] = "physical_button";
    doc["timestamp"] = event.timestamp;
    doc["hasPhoto"] = (photoBuf != nullptr && photoLen > 0);

    String payload;
    serializeJson(doc, payload);
    bool sent = webSocket.sendTXT(payload);

    // If photo is attached, send snapshot as a binary WebSocket frame or chunk
    if (sent && photoBuf != nullptr && photoLen > 0) {
        webSocket.sendBIN(photoBuf, photoLen);
    }
    return sent;
}

bool ApiClient::sendDoorbellRelease() {
    if (!wsConnected) return false;
    return webSocket.sendTXT("{\"type\":\"ring_release\"}");
}

bool ApiClient::sendSecurityAlert(const AccessLogEvent& event, const uint8_t* photoBuf, size_t photoLen) {
    storageManager.queueOfflineEvent(event);
    if (!wsConnected) return false;

    JsonDocument doc;
    doc["type"] = "unauthorized_alert";
    doc["eventId"] = event.eventId;
    doc["cardUid"] = event.cardUid;
    doc["timestamp"] = event.timestamp;
    doc["alarmActive"] = securityManager.isAlarmActive();
    doc["hasPhoto"] = (photoBuf != nullptr && photoLen > 0);

    String payload;
    serializeJson(doc, payload);
    bool sent = webSocket.sendTXT(payload);

    if (sent && photoBuf != nullptr && photoLen > 0) {
        webSocket.sendBIN(photoBuf, photoLen);
    }
    return sent;
}

void ApiClient::flushOfflineEvents() {
    if (!wsConnected) return;

    size_t pendingCount = storageManager.getPendingEventsCount();
    if (pendingCount == 0) return;

    Serial.printf("📤 [STORAGE] Synchronizing %u offline events to backend...\n", pendingCount);
    String rawEvents = storageManager.getPendingEventsJson();

    JsonDocument doc;
    doc["type"] = "offline_sync_batch";
    doc["count"] = pendingCount;
    doc["events"] = serialized(rawEvents);

    String payload;
    serializeJson(doc, payload);
    if (webSocket.sendTXT(payload)) {
        Serial.println("[STORAGE] Offline batch sent; retaining until durable server acknowledgement.");
    }
}

void ApiClient::sendHeartbeat() {
    if (!wsConnected) return;

    JsonDocument doc;
    doc["type"] = "heartbeat";
    doc["rssi"] = wifiManager.getRssi();
    doc["uptimeSec"] = millis() / 1000;
    doc["chime"] = relayManager.isChimeRinging() ? "ringing" : "idle";
    doc["gateLock"] = relayManager.isGateUnlocked() ? "active" : "locked";
    doc["light"] = ledManager.isPorchLightOn() ? "on" : "off";
    doc["alarmActive"] = securityManager.isAlarmActive();
    doc["cardsEnabled"] = storageManager.areCardsEnabled();
    doc["relayFault"] = relayManager.hasFault();
    doc["pendingEvents"] = storageManager.getPendingEventsCount();
    doc["cardsCached"] = storageManager.getAuthorizedCardsCount();
    doc["firmware"] = FIRMWARE_VERSION;
    doc["freeHeap"] = ESP.getFreeHeap();doc["freePsram"] = ESP.getFreePsram();
    doc["storageReady"] = storageManager.isReady();doc["cameraReady"] = cameraManager.isReady();doc["audioReady"] = audioManager.isReady();
    const auto& settings=storageManager.getDeviceSettings();
    JsonObject preferences=doc["settings"].to<JsonObject>();preferences["version"]=settings.version;
    preferences["idleBrightness"]=settings.idleBrightness;preferences["activeBrightness"]=settings.activeBrightness;preferences["speakerGain"]=settings.speakerGain;

    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}

void ApiClient::update() {
    // 1. Maintain WebSocket connection & HTTP client polling
    webSocket.loop();


    // 2. Send periodic heartbeat
    unsigned long now = millis();
    if (now - lastHeartbeatTime >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatTime = now;
        sendHeartbeat();
        flushOfflineEvents();
    }

    if (mediaActive && int32_t(now - mediaUntil) >= 0) {
        mediaActive = false;
        cameraManager.setLiveStreamQuality(false);
    }
    if (wsConnected && mediaActive) {
        // Batch captured speech after a blocking JPEG/TLS send. Tiny individual
        // WebSocket writes previously discarded most speech from the four-frame queue.
        static int16_t pcm[160 * 96];
        static uint8_t packet[14 + 1 + sizeof(pcm)];
        size_t count = audioManager.readMicrophoneData(pcm, 160 * 96);
        if (count) {
            // Reserve the WebSockets library's 14-byte header area so header and
            // PCM are written as one TLS record stream rather than separate writes.
            packet[14] = 2;
            memcpy(packet + 15, pcm, count);
            webSocket.sendBIN(packet, count + 1, true);
        }
        if (uint32_t(now - lastVideoTime) >= 500 && count <= 3200) {
            lastVideoTime = now;
            camera_fb_t* frame = cameraManager.captureFrame();
            if (frame) {
                // Discard any VGA frames queued before switching to live quality.
                if (frame->width != 320) { cameraManager.releaseFrame(frame); return; }
                uint8_t* packet = (uint8_t*)ps_malloc(frame->len + 15);
                if (packet) {
                    packet[14] = 1; memcpy(packet + 15, frame->buf, frame->len);
                    webSocket.sendBIN(packet, frame->len + 1, true); free(packet);
                }
                cameraManager.releaseFrame(frame);
            }
        }
    }
}

void ApiClient::commandResult(const String& nonce, bool success) {
    JsonDocument doc;
    doc["type"] = "command_result";
    doc["nonce"] = nonce;
    doc["success"] = success;
    String payload;
    serializeJson(doc, payload);
    webSocket.sendTXT(payload);
}
