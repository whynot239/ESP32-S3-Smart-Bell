#pragma once
#include <Arduino.h>

/**
 * ============================================================================
 * GOOUUU ESP32-S3-CAM MASTER HARDWARE PINOUT
 * ============================================================================
 * Microcontroller: ESP32-S3 N16R8 (Dual-Core LX7 + 16MB Flash + 8MB OPI PSRAM)
 */

// ----------------------------------------------------------------------------
// 1. I2C Bus & PCF8574 Output Expander
// ----------------------------------------------------------------------------
#define PIN_I2C_SDA             1       // PCF8574 I2C data
#define PIN_I2C_SCL             2       // PCF8574 I2C clock
#define PCF8574_I2C_ADDR        0x20    // A0=A1=A2=GND

// PCF8574 Expander Pin Assignments
#define PCF_PIN_RFID_RST        0       // P0 -> RC522 Hardware Reset
#define PCF_PIN_LOCK_RELAY      1       // P1 -> Gate-Lock Relay CH1 (Solenoid)
#define PCF_PIN_BELL_RELAY      2       // P2 -> House Bell Chime Relay CH2

// Relay active level: true = active LOW (standard optocoupler relay boards)
#define RELAY_ACTIVE_LOW        true

// ----------------------------------------------------------------------------
// 2. Physical Push Button (Doorbell Trigger)
// ----------------------------------------------------------------------------
#define PIN_DOORBELL_BTN        19      // Momentary Push Button to GND (Input Pullup)

// ----------------------------------------------------------------------------
// 3. Addressable WS2812 RGB LEDs
// ----------------------------------------------------------------------------
#define PIN_WS2812_RING         21      // 12-Pixel WS2812 Ring (Porch Sconce & Animations)
#define NUM_RING_LEDS           12
// GPIO 48 is reserved; do not drive the onboard LED.

// ----------------------------------------------------------------------------
// 4. Two-Way Audio Intercom (I2S Bus)
// ----------------------------------------------------------------------------
#define I2S_PORT_NUM            I2S_NUM_0
#define PIN_I2S_BCLK            41      // Shared Bit Clock (Mic SCK + Amp BCLK)
#define PIN_I2S_WS              42      // Shared Word Select (Mic WS + Amp LRC)
#define PIN_MIC_DATA            14      // INMP441 MEMS Mic Data Out (ESP32 Input)
#define PIN_AMP_DATA            47      // MAX98357A I2S DAC Data In (ESP32 Output)
#define AUDIO_SAMPLE_RATE       16000   // 16 kHz 16-bit PCM standard for voice

// ----------------------------------------------------------------------------
// 5. RFID / NFC Keycard Reader (RC522 SPI)
// ----------------------------------------------------------------------------
#define PIN_RC522_SCK           38      // SPI Serial Clock
#define PIN_RC522_MOSI          39      // SPI Master Out Slave In
#define PIN_RC522_MISO          40      // SPI Master In Slave Out
#define PIN_RC522_CS            20      // SPI chip select / RC522 SDA (native USB pin repurposed)

// ----------------------------------------------------------------------------
// 6. Camera DVP 8-Bit Optical Bus (GOOUUU ESP32-S3-CAM)
// ----------------------------------------------------------------------------
#define PWDN_GPIO_NUM           -1      // Power down pin (-1 if tied to GND/VCC)
#define RESET_GPIO_NUM          -1      // Reset pin (-1 if tied to EN)
#define XCLK_GPIO_NUM           15      // Camera Master Clock (LEDC 20MHz)
#define SIOD_GPIO_NUM           4       // SCCB I2C Data
#define SIOC_GPIO_NUM           5       // SCCB I2C Clock

#define Y9_GPIO_NUM             16      // Camera D7
#define Y8_GPIO_NUM             17      // Camera D6
#define Y7_GPIO_NUM             18      // Camera D5
#define Y6_GPIO_NUM             12      // Camera D4
#define Y5_GPIO_NUM             10      // Camera D3
#define Y4_GPIO_NUM              8      // Camera D2
#define Y3_GPIO_NUM              9      // Camera D1
#define Y2_GPIO_NUM             11      // Camera D0

#define VSYNC_GPIO_NUM           6      // Vertical Sync
#define HREF_GPIO_NUM            7      // Horizontal Reference
#define PCLK_GPIO_NUM           13      // Pixel Clock
