/**
 * ============================================================================
 * LEGACY SKETCH — DO NOT UPLOAD THIS FILE.
 *
 * Build the production firmware in src/ through platformio.ini. This sketch
 * retains an older wiring plan and is present only as an archived reference.
 * ============================================================================
 * Hardware Board: GOOUUU ESP32-S3-CAM
 * Microcontroller: ESP32-S3 (Dual-Core LX7 + 8MB PSRAM)
 * 
 * Peripherals & Pinout Integration:
 *  - I2C Bus (GPIO 1 SDA, GPIO 2 SCL): PCF8574 I/O Expander + DS3231 RTC
 *  - PCF8574 Output Expander:
 *      * P0: RC522 RFID Reset
 *      * P1: Gate-Lock Relay CH1 (Calibrated 1000ms Solenoid Current Burst)
 *      * P2: Old-Bell Chime Relay CH2 (Inside House Bell - 2.0s Duration)
 *  - Camera (OV2640 / OV5640): ESP32-S3 Optical bus (GPIO 4-13, 15-18)
 *  - Doorbell Button: GPIO 19 (Debounced, Active LOW)
 *  - RFID / NFC Reader (RC522 SPI): SCK=38, MOSI=39, MISO=40, CS=45, RST=PCF8574(P0)
 *  - Two-Way Audio Intercom (I2S Bus):
 *      * BCLK: GPIO 41 (Shared between Mic & Amp)
 *      * WS / LRC: GPIO 42 (Shared between Mic & Amp)
 *      * Microphone Input (INMP441 SD): GPIO 14
 *      * Speaker / Amp Output (MAX98357A DIN): GPIO 47
 *  - Illumination / Status:
 *      * WS2812 ×12 LED Ring: GPIO 21 (Porch Light & Ring Animations)
 *      * Onboard WS2812 LED: GPIO 48 (System Status)
 * 
 * Two-Way Communication:
 *  - Full Cloud WebSocket (wss:// or ws:// to Render / Hub)
 *  - Remote Gate Unlock, Remote Chime, Porch Light Toggle, AI Voice Replies
 *  - Auto-reconnection & 30s heartbeat ping (Keeps free cloud awake 24/7)
 * ============================================================================
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <HTTPClient.h>
#include <WebSocketsClient.h>
#include <Wire.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_NeoPixel.h>
#include "driver/i2s.h"

// ============================================================================
// 1. LOCAL WI-FI & LOCAL SERVER CREDENTIALS
// ============================================================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";     // Friend's Home Wi-Fi Name
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Friend's Home Wi-Fi Password

// Local Server Configuration:
// Put your PC / Laptop's local IP address here (shown when running `npm start`)
const char* WS_HOST       = "192.168.1.100";      // <-- Change to your PC's IP (e.g., 192.168.1.15)
const uint16_t WS_PORT    = 3000;                 // Node.js server local port
const char* WS_PATH       = "/ws";
const bool  WS_USE_SSL    = false;                // false for local Wi-Fi (ws://)

// Local HTTP Webhook fallback
const char* HA_RING_WEBHOOK = "http://192.168.1.100:3000/chime";

// Emergency Local Fallback Whitelist (Works even if Wi-Fi is down)
const char* LOCAL_WHITELIST[] = {
  "A3:4F:92:B1",  // Owner (Moiz)
  "73:E2:11:08",  // Family Member
  "F1:2A:8C:99"   // Maintenance
};
const int LOCAL_WHITELIST_COUNT = 3;

// ============================================================================
// 2. GOOUUU ESP32-S3-CAM PIN DEFINITIONS
// ============================================================================

// --- I2C Bus ---
#define PIN_I2C_SDA        1
#define PIN_I2C_SCL        2
#define PCF8574_I2C_ADDR   0x20  // A0=A1=A2=GND (Standard PCF8574)

// PCF8574 Pin Assignments
#define PCF_PIN_RFID_RST   0   // P0 -> RC522 RST
#define PCF_PIN_LOCK_RELAY 1   // P1 -> Gate-Lock Relay CH1 (Solenoid)
#define PCF_PIN_BELL_RELAY 2   // P2 -> Old-Bell Relay CH2 (Inside Chime)

// Relay active level: true = active LOW (standard relay boards engage on LOW)
#define RELAY_ACTIVE_LOW   true

// --- Physical Button ---
#define PIN_DOORBELL_BTN   19  // Momentary Push Button to GND

// --- WS2812 Addressable LEDs ---
#define PIN_WS2812_RING    21  // 12x WS2812 LED Ring (Porch Light & Animations)
#define NUM_RING_LEDS      12
#define PIN_ONBOARD_LED    48  // Onboard status WS2812 LED

// --- Two-Way Audio Intercom (I2S) ---
#define I2S_PORT           I2S_NUM_0
#define PIN_I2S_BCLK       41  // Shared Bit Clock
#define PIN_I2S_WS         42  // Shared Word Select (LRC)
#define PIN_MIC_DATA       14  // INMP441 Microphone Data Input
#define PIN_AMP_DATA       47  // MAX98357A Amplifier Data Output
#define I2S_SAMPLE_RATE    16000

// --- RFID / NFC Reader (RC522 SPI) ---
#define PIN_RC522_SCK      38
#define PIN_RC522_MOSI     39
#define PIN_RC522_MISO     40
#define PIN_RC522_CS       45

// --- Camera Optical Bus (GOOUUU ESP32-S3-CAM) ---
#define PWDN_GPIO_NUM      -1
#define RESET_GPIO_NUM     -1
#define XCLK_GPIO_NUM      15
#define SIOD_GPIO_NUM       4
#define SIOC_GPIO_NUM       5

#define Y9_GPIO_NUM        16  // Camera D7
#define Y8_GPIO_NUM        17  // Camera D6
#define Y7_GPIO_NUM        18  // Camera D5
#define Y6_GPIO_NUM        12  // Camera D4
#define Y5_GPIO_NUM        10  // Camera D3
#define Y4_GPIO_NUM         8  // Camera D2
#define Y3_GPIO_NUM         9  // Camera D1
#define Y2_GPIO_NUM        11  // Camera D0

#define VSYNC_GPIO_NUM      6
#define HREF_GPIO_NUM       7
#define PCLK_GPIO_NUM      13

// ============================================================================
// 3. GLOBALS, DRIVERS & TIMERS
// ============================================================================
WebServer server(80);
WiFiServer streamServer(81);
WebSocketsClient webSocket;
MFRC522 rfid(PIN_RC522_CS, UINT8_MAX); // RST handled via PCF8574 P0
Adafruit_NeoPixel ledRing(NUM_RING_LEDS, PIN_WS2812_RING, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel onboardLed(1, PIN_ONBOARD_LED, NEO_GRB + NEO_KHZ800);

// PCF8574 Output Register State (Default: all HIGH)
uint8_t pcfOutputState = 0xFF;

// Timers & States
bool isChimeActive = false;
bool isButtonPressed = false;                       // Tracks physical momentary press state
bool isRemoteChimeActive = false;                   // Only for remote web/app test triggers
unsigned long remoteChimeStart = 0;
const unsigned long REMOTE_CHIME_PULSE_MS = 2000;

bool isLockBurstActive = false;
unsigned long lockBurstTimestamp = 0;
const unsigned long LOCK_BURST_DURATION_MS = 1000;  // 1000ms solenoid current burst

bool isCameraWoken = false;
unsigned long cameraActiveTimestamp = 0;
const unsigned long CAMERA_TIMEOUT_MS = 60000;      // 60s active camera session

bool isPorchLightOn = false;
int lastButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long DEBOUNCE_DELAY_MS = 150;

unsigned long lastHeartbeatTime = 0;
const unsigned long HEARTBEAT_INTERVAL_MS = 30000;  // 30s ping keeps Render cloud awake
unsigned long lastRfidScanTime = 0;

// Camera MJPEG Stream Boundaries
#define PART_BOUNDARY "123456789000000000000987654321"
static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=" PART_BOUNDARY;
static const char* _STREAM_BOUNDARY = "\r\n--" PART_BOUNDARY "\r\n";
static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

// ============================================================================
// 4. PCF8574 I/O EXPANDER CONTROLLER
// ============================================================================

void pcfWriteBit(uint8_t pin, bool level) {
  if (level) {
    pcfOutputState |= (1 << pin);
  } else {
    pcfOutputState &= ~(1 << pin);
  }
  Wire.beginTransmission(PCF8574_I2C_ADDR);
  Wire.write(pcfOutputState);
  Wire.endTransmission();
}

void setRelayCh1(bool active) {
  // P1: Gate-Lock Solenoid
  bool pinState = RELAY_ACTIVE_LOW ? !active : active;
  pcfWriteBit(PCF_PIN_LOCK_RELAY, pinState);
}

void setRelayCh2(bool active) {
  // P2: Inside House Chime
  bool pinState = RELAY_ACTIVE_LOW ? !active : active;
  pcfWriteBit(PCF_PIN_BELL_RELAY, pinState);
}

void resetRfidHardware() {
  // Pulse P0 to reset RC522
  pcfWriteBit(PCF_PIN_RFID_RST, LOW);
  delay(10);
  pcfWriteBit(PCF_PIN_RFID_RST, HIGH);
  delay(20);
}

// ============================================================================
// 5. WS2812 LED RING & LIGHTING
// ============================================================================

void setPorchLight(bool on) {
  isPorchLightOn = on;
  if (isPorchLightOn) {
    // Warm white illumination on all 12 LEDs
    for (int i = 0; i < NUM_RING_LEDS; i++) {
      ledRing.setPixelColor(i, ledRing.Color(255, 220, 180));
    }
  } else {
    ledRing.clear();
  }
  ledRing.show();
}

void showAccessGrantedAnimation() {
  // Emerald green sweep
  for (int i = 0; i < NUM_RING_LEDS; i++) {
    ledRing.setPixelColor(i, ledRing.Color(0, 255, 100));
    ledRing.show();
    delay(20);
  }
  delay(400);
  setPorchLight(isPorchLightOn);
}

void showAccessDeniedAnimation() {
  // Crimson red flash
  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < NUM_RING_LEDS; j++) ledRing.setPixelColor(j, ledRing.Color(255, 0, 30));
    ledRing.show();
    delay(100);
    ledRing.clear();
    ledRing.show();
    delay(100);
  }
  setPorchLight(isPorchLightOn);
}

void setOnboardStatusColor(uint8_t r, uint8_t g, uint8_t b) {
  onboardLed.setPixelColor(0, onboardLed.Color(r, g, b));
  onboardLed.show();
}

// ============================================================================
// 6. TWO-WAY AUDIO INTERCOM (I2S DRIVER & TONE GENERATOR)
// ============================================================================

void initI2SAudio() {
  i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = 64,
    .use_apll = false,
    .tx_desc_auto_clear = true,
    .fixed_mclk = 0
  };

  i2s_pin_config_t pin_config = {
    .bck_io_num = PIN_I2S_BCLK,
    .ws_io_num = PIN_I2S_WS,
    .data_out_num = PIN_AMP_DATA,
    .data_in_num = PIN_MIC_DATA
  };

  esp_err_t err = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.printf("❌ I2S driver install failed: %d\n", err);
    return;
  }
  i2s_set_pin(I2S_PORT, &pin_config);
  Serial.println("✅ I2S Full-Duplex Audio Engine Initialized (Mic & Speaker Amp).");
}

// Generates smooth sine wave tones over MAX98357A I2S DAC
void playI2STone(int freqHz, int durationMs, float volume = 0.5) {
  int totalSamples = (I2S_SAMPLE_RATE * durationMs) / 1000;
  int16_t sampleBuffer[128];
  size_t bytesWritten;

  float phase = 0.0;
  float phaseStep = (2.0 * 3.14159265 * freqHz) / I2S_SAMPLE_RATE;

  int samplesRemaining = totalSamples;
  while (samplesRemaining > 0) {
    int chunk = min(samplesRemaining, 64);
    for (int i = 0; i < chunk; i++) {
      int16_t sample = (int16_t)(sin(phase) * 32767.0 * volume);
      sampleBuffer[i * 2]     = sample; // Left
      sampleBuffer[i * 2 + 1] = sample; // Right
      phase += phaseStep;
      if (phase >= 2.0 * 3.14159265) phase -= 2.0 * 3.14159265;
    }
    i2s_write(I2S_PORT, sampleBuffer, chunk * 4, &bytesWritten, portMAX_DELAY);
    samplesRemaining -= chunk;
  }
}

// Chime tones
void playAccessGrantedTone() {
  showAccessGrantedAnimation();
  playI2STone(880, 100);
  delay(30);
  playI2STone(1320, 200);
}

void playAccessDeniedTone() {
  showAccessDeniedAnimation();
  playI2STone(220, 180);
  delay(50);
  playI2STone(220, 250);
}

void playOutsideDoorbellChime() {
  playI2STone(659, 250); // Ding
  delay(60);
  playI2STone(523, 400); // Dong
}

void playVoiceReplyAnnouncementTone() {
  playI2STone(587, 80);
  delay(30);
  playI2STone(880, 150);
}

// ============================================================================
// 7. HARDWARE ACTIONS & RELAY CONTROLS
// ============================================================================

void activateCameraFeed() {
  isCameraWoken = true;
  cameraActiveTimestamp = millis();
}

// Trigger Inside House Bell (Remote web/app test pulse)
void triggerInsideBellChime() {
  isRemoteChimeActive = true;
  remoteChimeStart = millis();
  setRelayCh2(true);
  Serial.println("🔔 [RELAY 2 - PCF8574 P2] Remote bell chime test pulse energized.");
}

// Trigger Gate Lock Current Burst (Relay CH1 - Calibrated 1000ms)
void triggerGateLockBurst() {
  isLockBurstActive = true;
  lockBurstTimestamp = millis();
  setRelayCh1(true); // Energize Solenoid
  playAccessGrantedTone();
  Serial.println("⚡ [RELAY 1 - PCF8574 P1] Instant 1000ms current burst dispatched to gate lock!");
}

// Physical Outside Doorbell Button Pressed (Energize Relay 2 for as long as held)
void onDoorbellButtonPressed() {
  isChimeActive = true;
  setRelayCh2(true); // ENERGIZE RELAY 2 (CHIME) IMMEDIATELY!

  Serial.println("\n🔔 =======================================================");
  Serial.println("🔔 [DOORBELL BUTTON] PRESSED & HELD DOWN!");
  Serial.println("🔔 [RELAY 2 - PCF8574 P2] Inside bell energized (Active as long as held)!");
  Serial.println("🔔 =======================================================\n");

  // 1. Play chime through outside speaker amp (MAX98357A)
  playOutsideDoorbellChime();

  // 2. Wake camera optical system
  activateCameraFeed();

  // 3. Dispatch WebSocket Ring Event to Server & Mobile App
  if (webSocket.isConnected()) {
    String payload = "{\"type\":\"ring\",\"source\":\"physical_button\",\"timestamp\":" + String(millis()) + "}";
    webSocket.sendTXT(payload);
    Serial.println("📡 [CLOUD] Doorbell ring alert dispatched via WebSocket.");
  }

  // 4. Fallback Webhook
  if (WiFi.status() == WL_CONNECTED && strlen(HA_RING_WEBHOOK) > 8) {
    HTTPClient http;
    http.begin(HA_RING_WEBHOOK);
    http.addHeader("Content-Type", "application/json");
    http.POST("{\"event\":\"ring\",\"caller\":\"Front Porch\"}");
    http.end();
  }
}

// Physical Outside Doorbell Button Released (De-energize Relay 2 immediately)
void onDoorbellButtonReleased() {
  isChimeActive = false;
  setRelayCh2(false); // DE-ENERGIZE RELAY 2 IMMEDIATELY! NO TIMER!

  Serial.println("🔔 [DOORBELL BUTTON] RELEASED -> Relay 2 De-energized immediately (Bell stopped).");

  // Notify server that visitor released the button
  if (webSocket.isConnected()) {
    String payload = "{\"type\":\"ring_release\",\"timestamp\":" + String(millis()) + "}";
    webSocket.sendTXT(payload);
  }
}

// ============================================================================
// 8. RFID / NFC KEYCARD SCANNER (RC522 ON SPI 38/39/40/45)
// ============================================================================

void checkRfidCard() {
  if (millis() - lastRfidScanTime < 1500) return;

  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return;
  }

  lastRfidScanTime = millis();

  // Format Card UID String (e.g. "A3:4F:92:B1")
  String cardUid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (i > 0) cardUid += ":";
    if (rfid.uid.uidByte[i] < 0x10) cardUid += "0";
    cardUid += String(rfid.uid.uidByte[i], HEX);
  }
  cardUid.toUpperCase();

  Serial.println("\n💳 =======================================================");
  Serial.printf("💳 [RFID / NFC SCAN] Scanned Card UID: %s\n", cardUid.c_str());

  // 1. Dispatch scan event to Cloud Backend
  if (webSocket.isConnected()) {
    String payload = "{\"type\":\"rfid_scan\",\"cardId\":\"" + cardUid + "\",\"timestamp\":" + String(millis()) + "}";
    webSocket.sendTXT(payload);
    Serial.println("📡 [CLOUD] Card scan dispatched to server for authorization.");
  }

  // 2. Emergency Local Fallback Whitelist
  bool locallyAuthorized = false;
  for (int i = 0; i < LOCAL_WHITELIST_COUNT; i++) {
    if (cardUid.equalsIgnoreCase(LOCAL_WHITELIST[i])) {
      locallyAuthorized = true;
      break;
    }
  }

  if (locallyAuthorized) {
    Serial.println("✅ [LOCAL ACCESS GRANTED] Recognized in local emergency whitelist!");
    triggerGateLockBurst();
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}

// ============================================================================
// 9. TWO-WAY CLOUD WEBSOCKET CLIENT (RENDER / HUB INTEGRATION)
// ============================================================================

void handleWebSocketMessage(uint8_t * payload, size_t length) {
  String msg = String((char*)payload);
  Serial.printf("📩 [CLOUD RECEIVED]: %s\n", msg.c_str());

  // 1. Remote Gate Unlock Command (From Mobile App or Cloud RFID check)
  if (msg.indexOf("\"command\":\"unlock\"") >= 0 || msg.indexOf("unlock") >= 0) {
    Serial.println("⚡ [REMOTE COMMAND] Gate unlock burst ordered from Cloud!");
    triggerGateLockBurst();
  }
  // On-demand live view from the owner's app. This wakes the camera even when
  // the physical bell button has not been pressed.
  else if (msg.indexOf("\"command\":\"live_view\"") >= 0) {
    activateCameraFeed();
    if (webSocket.isConnected()) {
      webSocket.sendTXT("{\"type\":\"live_view_ready\"}");
    }
    Serial.println("📹 [LIVE VIEW] Camera session started by the owner's app.");
  }
  // 2. Remote Inside Bell Chime Trigger
  else if (msg.indexOf("\"command\":\"chime\"") >= 0) {
    Serial.println("🔔 [REMOTE COMMAND] Bell chime test triggered!");
    triggerInsideBellChime();
  }
  // 3. Porch Light Control (WS2812 ×12 Ring)
  else if (msg.indexOf("\"command\":\"light_set\"") >= 0) {
    bool state = (msg.indexOf("\"state\":\"on\"") >= 0);
    setPorchLight(state);
    Serial.printf("💡 [REMOTE COMMAND] Porch Light set to: %s\n", state ? "ON" : "OFF");
  }
  else if (msg.indexOf("\"command\":\"light_toggle\"") >= 0) {
    setPorchLight(!isPorchLightOn);
    Serial.printf("💡 [REMOTE COMMAND] Porch Light toggled to: %s\n", isPorchLightOn ? "ON" : "OFF");
  }
  // 4. Quick AI Voice Reply Announcement
  else if (msg.indexOf("\"command\":\"play_voice\"") >= 0) {
    Serial.println("🔊 [VOICE INTERCOM] Playing AI speech chime on MAX98357A speaker!");
    playVoiceReplyAnnouncementTone();
  }
  // 5. RFID Validation Result from Cloud
  else if (msg.indexOf("\"command\":\"rfid_result\"") >= 0) {
    if (msg.indexOf("\"authorized\":false") >= 0) {
      Serial.println("❌ [RFID DENIED] Cloud rejected scanned card!");
      playAccessDeniedTone();
    }
  }
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("❌ [WEBSOCKET] Disconnected from Cloud Server. Retrying...");
      setOnboardStatusColor(255, 0, 0); // Red
      break;

    case WStype_CONNECTED:
      Serial.println("✅ [WEBSOCKET] Connected to Cloud Server (Render / Hub)!");
      setOnboardStatusColor(0, 255, 0); // Green
      webSocket.sendTXT("{\"type\":\"esp32_connect\",\"hardware\":\"GOOUUU-ESP32-S3-CAM\",\"version\":\"2.1\"}");
      break;

    case WStype_TEXT:
      handleWebSocketMessage(payload, length);
      break;

    case WStype_BIN:
      // Binary audio stream from phone mic -> write to MAX98357A speaker amp
      if (length > 0) {
        size_t bytesWritten;
        i2s_write(I2S_PORT, payload, length, &bytesWritten, 100);
      }
      break;

    default:
      break;
  }
}

void sendHeartbeatTelemetry() {
  if (millis() - lastHeartbeatTime < HEARTBEAT_INTERVAL_MS) return;
  lastHeartbeatTime = millis();

  if (webSocket.isConnected()) {
    String json = "{";
    json += "\"type\":\"heartbeat\",";
    json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"uptimeSec\":" + String(millis() / 1000) + ",";
    json += "\"chime\":\"" + String(isChimeActive ? "ringing" : "idle") + "\",";
    json += "\"lockBurst\":\"" + String(isLockBurstActive ? "active" : "locked") + "\",";
    json += "\"light\":\"" + String(isPorchLightOn ? "on" : "off") + "\"";
    json += "}";
    webSocket.sendTXT(json);
  }
}

// ============================================================================
// 10. OPTICAL CAMERA SYSTEM (GOOUUU ESP32-S3-CAM)
// ============================================================================

esp_err_t initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size = FRAMESIZE_SVGA; // 800x600 fluid 25-30fps stream
    config.jpeg_quality = 12;
    config.fb_count = 2;
  } else {
    config.frame_size = FRAMESIZE_VGA;  // 640x480 fallback
    config.jpeg_quality = 15;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("❌ Camera init failed: 0x%x\n", err);
    return err;
  }

  sensor_t * s = esp_camera_sensor_get();
  s->set_brightness(s, 1);
  s->set_contrast(s, 1);
  s->set_saturation(s, 0);
  s->set_sharpness(s, 1);
  return ESP_OK;
}

void handleMjpegStreaming() {
  WiFiClient client = streamServer.available();
  if (!client) return;

  activateCameraFeed();
  client.write(_STREAM_CONTENT_TYPE);

  while (client.connected()) {
    camera_fb_t * fb = esp_camera_fb_get();
    if (!fb) { delay(10); continue; }

    client.write(_STREAM_BOUNDARY);
    char part_buf[128];
    snprintf(part_buf, sizeof(part_buf), _STREAM_PART, fb->len);
    client.write(part_buf);
    client.write(fb->buf, fb->len);
    esp_camera_fb_return(fb);

    delay(30); // ~25-30 FPS video
  }
}

void handleCapture() {
  activateCameraFeed();
  camera_fb_t * fb = esp_camera_fb_get();
  if (!fb) {
    server.send(500, "text/plain", "Capture failed");
    return;
  }
  WiFiClient client = server.client();
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.setContentLength(fb->len);
  server.send(200, "image/jpeg", "");
  client.write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

void handleStatus() {
  String json = "{";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"wsConnected\":" + String(webSocket.isConnected() ? "true" : "false") + ",";
  json += "\"chime\":\"" + String(isChimeActive ? "ringing" : "idle") + "\",";
  json += "\"lockBurst\":\"" + String(isLockBurstActive ? "active" : "locked") + "\",";
  json += "\"light\":\"" + String(isPorchLightOn ? "on" : "off") + "\"";
  json += "}";
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.send(200, "application/json", json);
}

// ============================================================================
// 11. SETUP & SYSTEM BOOTSTRAP
// ============================================================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n=======================================================");
  Serial.println("  GOOUUU ESP32-S3-CAM SMART DOORBELL HUB INITIALIZING   ");
  Serial.println("  I2C PCF8574 Relays | RC522 SPI | I2S Full Intercom     ");
  Serial.println("=======================================================");

  // 1. Initialize I2C Bus (GPIO 1 SDA, GPIO 2 SCL)
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Serial.println("✅ I2C Bus Started (SDA:1, SCL:2).");

  // Initialize PCF8574 outputs (Default: Relays OFF, RFID RST HIGH)
  pcfOutputState = 0xFF;
  setRelayCh1(false);
  setRelayCh2(false);
  resetRfidHardware();
  Serial.println("✅ PCF8574 Expander initialized (Dual Relays configured).");

  // 2. Initialize LEDs
  ledRing.begin();
  ledRing.setBrightness(120);
  ledRing.clear();
  ledRing.show();

  onboardLed.begin();
  onboardLed.setBrightness(60);
  setOnboardStatusColor(0, 0, 255); // Blue (Booting)

  // 3. Configure Doorbell Push Button (GPIO 19)
  pinMode(PIN_DOORBELL_BTN, INPUT_PULLUP);

  // 4. Initialize Camera (GOOUUU ESP32-S3)
  if (initCamera() != ESP_OK) {
    Serial.println("⚠️ Camera optical init note (Check ribbon cable).");
  } else {
    Serial.println("✅ GOOUUU ESP32-S3 Camera system ready.");
  }

  // 5. Initialize RFID RC522 Reader on SPI (SCK:38, MISO:40, MOSI:39, CS:45)
  SPI.begin(PIN_RC522_SCK, PIN_RC522_MISO, PIN_RC522_MOSI, PIN_RC522_CS);
  rfid.PCD_Init();
  Serial.println("✅ RC522 RFID Keycard reader initialized on SPI (Pins 38,39,40,45).");

  // 6. Initialize Two-Way I2S Audio Engine (Mic:14, Amp:47, BCLK:41, WS:42)
  initI2SAudio();

  // 7. Connect to Wi-Fi
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("📡 Connecting to Wi-Fi: ");
  Serial.println(WIFI_SSID);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    setOnboardStatusColor(0, 255, 0); // Green
    Serial.println("\n✅ Wi-Fi Connected!");
    Serial.printf("🌐 Local IP Address: %s\n", WiFi.localIP().toString().c_str());
  } else {
    setOnboardStatusColor(255, 140, 0); // Orange
    Serial.println("\n⚠️ Wi-Fi connecting in background...");
  }

  // 8. Connect to Two-Way Cloud WebSocket
  if (WS_USE_SSL) {
    webSocket.beginSSL(WS_HOST, WS_PORT, WS_PATH);
  } else {
    webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
  }
  webSocket.onEvent(webSocketEvent);
  webSocket.setReconnectInterval(5000);
  webSocket.enableHeartbeat(15000, 3000, 2);

  // 9. Start Local Endpoints & Stream Servers
  server.on("/capture", HTTP_GET, handleCapture);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/unlock", HTTP_GET, triggerGateLockBurst);
  server.on("/chime", HTTP_GET, triggerInsideBellChime);
  server.begin();
  streamServer.begin();

  Serial.println("🚀 [READY] GOOUUU ESP32-S3-CAM Smart Doorbell running!");
}

// ============================================================================
// 12. MAIN REAL-TIME LOOP
// ============================================================================
void loop() {
  // 1. Maintain Cloud WebSocket & Local Servers
  webSocket.loop();
  server.handleClient();
  handleMjpegStreaming();
  sendHeartbeatTelemetry();

  // 2. Poll RFID Keycard Reader
  checkRfidCard();

  // 3. Check Physical Doorbell Push Button (GPIO 19, Debounced Momentary Hold)
  int reading = digitalRead(PIN_DOORBELL_BTN);
  if (reading != lastButtonState) {
    lastDebounceTime = millis();
  }
  if ((millis() - lastDebounceTime) > DEBOUNCE_DELAY_MS) {
    // Visitor presses button down -> Bell rings and stays ON as long as held!
    if (reading == LOW && !isButtonPressed) {
      isButtonPressed = true;
      onDoorbellButtonPressed();
    }
    // Visitor releases button -> Bell turns OFF immediately! NO TIMER!
    else if (reading == HIGH && isButtonPressed) {
      isButtonPressed = false;
      onDoorbellButtonReleased();
    }
  }
  lastButtonState = reading;

  // 4. Remote Chime Test Auto-Shutoff (Only for remote software app triggers)
  if (isRemoteChimeActive && (millis() - remoteChimeStart >= REMOTE_CHIME_PULSE_MS)) {
    setRelayCh2(false);
    isRemoteChimeActive = false;
    Serial.println("🔔 [RELAY 2 - PCF8574 P2] Remote app test chime pulse complete.");
  }

  // 5. Relay CH1 Auto-Shutoff Timer (Gate Lock Current Burst - 1000ms)
  if (isLockBurstActive && (millis() - lockBurstTimestamp >= LOCK_BURST_DURATION_MS)) {
    setRelayCh1(false); // Cut off Solenoid Current
    isLockBurstActive = false;
    Serial.println("⚡ [RELAY 1 - PCF8574 P1] Gate lock current burst finished (Solenoid safe).");
  }

  // 6. Camera Standby Timer (60s session)
  if (isCameraWoken && (millis() - cameraActiveTimestamp >= CAMERA_TIMEOUT_MS)) {
    isCameraWoken = false;
    Serial.println("💤 [CAMERA] 60s video call elapsed -> Low-power standby.");
  }
}
