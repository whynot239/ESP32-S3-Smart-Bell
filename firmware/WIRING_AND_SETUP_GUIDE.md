# Wiring — GOOUUU ESP32-S3-CAM N16R8 / OV3660

This map follows the camera sketch you supplied and your confirmed USB-to-UART programming port. Native USB/OTG must remain unused because GPIO19 and GPIO20 are assigned to peripherals.

## ESP32 signals

| Function | GPIO / connection |
|---|---|
| PCF8574 SDA / SCL | 1 / 2; address 0x20 with A0–A2 grounded |
| Doorbell button | 19 to GND; firmware uses INPUT_PULLUP |
| RC522 SCK / MOSI / MISO / CS | 38 / 39 / 40 / 20 |
| RC522 RST | PCF8574 P0, 3.3V logic only |
| Lock relay input | PCF8574 P1; active LOW through a suitable voltage interface |
| Chime relay input | PCF8574 P2; active LOW through a suitable voltage interface |
| WS2812 ring data | 21 through a suitable 3.3V-to-5V fast logic buffer |
| I2S BCLK / WS | 41 / 42, shared by microphone and amplifier |
| INMP441 SD | 14; L/R tied LOW for the left slot |
| MAX98357A DIN | 47; stereo output repeats the same mono sample on both slots |
| Onboard GPIO48 LED | Reserved; not driven |

## Camera — unchanged from the working sketch

| Signal | GPIO |
|---|---:|
| PWDN / RESET | -1 / -1 |
| XCLK | 15 |
| SCCB SDA / SCL | 4 / 5 |
| D0 / D1 / D2 / D3 | 11 / 9 / 8 / 10 |
| D4 / D5 / D6 / D7 | 12 / 18 / 17 / 16 |
| VSYNC / HREF / PCLK | 6 / 7 / 13 |

Keep the existing camera ribbon connector. Do not repurpose memory-reserved GPIOs to add features. GPIO45 in the archived sketch is not the current RFID chip select.

## Power and voltage domains

The confirmed relay module is a **5V two-channel module powered at 5V**. That alone does not prove that its inputs accept 3.3V logic, that it triggers LOW, or that the lock itself is rated for 5V.

A consistent arrangement for this firmware is:

- ESP32 GPIOs, RC522, INMP441 and PCF8574 logic at 3.3V. Use I2C pull-ups to 3.3V. RC522 supply and reset must not be driven from 5V.
- Relay coils/module at its specified 5V supply, with a non-inverting voltage interface suitable for its input current and thresholds between P1/P2 and IN1/IN2. The logical LOW must energize the relay and HIGH must release it. Verify with disconnected contact loads.
- If using the generic LV/HV translator shown earlier, LV belongs on 3.3V, HV on 5V and grounds share the correct reference. Check that its channel can sink the relay module's input current. Do not assume an unlabeled translator is suitable merely because an LED lights.
- Do not power the PCF at 5V and connect P0 directly to the 3.3V RC522 reset. Do not allow any 5V I2C pull-up to reach GPIO1/2.
- MAX98357A and WS2812 power should follow their actual module ratings, with sufficient supply current and local decoupling. Use a fast appropriate buffer such as a correctly wired AHCT-family buffer for WS2812 data; a generic I2C MOSFET translator is not a dependable WS2812 data buffer.
- Keep logic/audio ground references consistent. Route coil/LED/speaker return current away from the camera and ESP32 signal returns. Do not assume the USB-to-UART port can supply all peripherals reliably.

The level shifter channels and relay module input circuitry need electrical verification. The firmware cannot establish their voltage or current ratings.

## Relay contacts and lock safety

The firmware uses active-low P1/P2 and writes all PCF outputs HIGH before storage, camera or networking starts. A dedicated task services the outputs every approximately 5ms, with a 20ms I2C transaction timeout. Timing is a software design bound, not a certification of physical switch-off.

- Lock requests are capped at 1000ms; repeated requests cannot extend a pulse; a two-second cooldown follows expiry.
- Physical button, remote chime and alarm requests are combined. A continuous chime is capped at 30 seconds.
- A failed expander write latches a fault, blocks further energizing requests, and retries OFF. Reported output state remains the last acknowledged write until OFF succeeds.
- An I2C ACK does not measure relay contact position. If the PCF remains powered during an MCU reset, its previously latched output can remain active until initialization reaches it. If the bus fails or contacts weld, software cannot guarantee release.

Use an independent maximum-on hardware cutoff for a pulse-rated lock. Confirm the lock/strike's rated voltage, current and duty cycle before choosing its supply, relay contacts, fuse and suppression. A DC solenoid commonly needs suitable flyback suppression; AC and other loads require different suppression. The correct NO/NC contact choice also depends on the actual locking mechanism. Do not infer this from the relay board supply.

No mains-contact wiring is specified here. Start with a low-voltage test load, then follow the lock and relay manufacturers' electrical ratings.

## Physical test order

Follow the bench checklist in `../START_HERE.md` with lock/chime contact loads disconnected first. Confirm boot behavior, pulse timing, reset behavior, I2C-loss behavior, RFID disable persistence, and streaming under load before attaching the real lock.

Reference specifications: [Espressif ESP32-S3 GPIO documentation](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/api-reference/peripherals/gpio.html), [TI PCF8574 datasheet](https://www.ti.com/lit/ds/symlink/pcf8574.pdf), [INMP441 datasheet](https://invensense.tdk.com/wp-content/uploads/2015/02/INMP441.pdf). The exact relay module and lock datasheets remain necessary for their interfaces and contact loads.
