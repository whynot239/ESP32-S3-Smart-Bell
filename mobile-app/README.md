> Historical instructions below. Use [../START_HERE.md](../START_HERE.md) for this integrated release candidate, including the current intercom and native push setup.

# 📱 Smart Video Doorbell Mobile App (React Native / Expo)

A cross-platform iOS & Android mobile application for the Smart Video Doorbell system connected to **Home Assistant OS**.

---

## 🌟 Key Features

1. **Full-Screen Live Camera Incoming Call Layout**:
   - Live camera feed running in the background.
   - Prominent **Answer** (Emerald Green) and **Decline** (Rose Red) actions.
   - Caller identity (`Front Doorbell • Home Assistant Connected`).

2. **Instant Push Notifications**:
   - Push alerts via `expo-notifications` triggered by doorbell ring events.
   - Device haptic vibrations (`expo-haptics`) and custom chimes.

3. **Two-Way Audio & Video Intercom**:
   - Live stream viewing with IR night vision and porch light controls.
   - Audio waveform equalizer (`WaveformVisualizer`).
   - Quick AI Voice Replies using `expo-speech` (*"Please leave the package by the door"*, *"Coming in 1 min"*).

4. **"OPEN DOOR / GATE" Control**:
   - Fast gate unlocking mechanism with local WiFi safety validation.
   - Mechanical feedback and auto-relock timers.

5. **Home Assistant OS WebSocket Integration**:
   - Direct real-time entity updates (`binary_sensor.front_doorbell_ring`, `lock.front_gate`, `camera.front_doorbell_live`, `switch.porch_light`).

---

## 🚀 How to Run the Mobile App

### Prerequisites
- Install **Node.js** (v18+)
- Install the **Expo Go** app on your iPhone or Android phone (free from App Store / Google Play).

### Steps:
1. Navigate to the `mobile-app` directory:
   ```bash
   cd "mobile-app"
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the Expo development server:
   ```bash
   npx expo start
   ```

4. Scan the QR code shown in your terminal with:
   - **iPhone**: Camera app (opens Expo Go).
   - **Android**: Expo Go app.

---

## ⚙️ Connecting to Home Assistant OS & ESP32-CAM

1. Open the app on your phone.
2. Tap the **Settings icon (⚙️)** on the top right of the dashboard.
3. Enter your Home Assistant server URL (e.g. `http://192.168.1.100:8123`) and paste your **Long-Lived Access Token**.
4. In the **ESP32-CAM Video Stream** box, enter your ESP32-CAM stream URL:
   `http://<ESP32_IP>:81/stream` (e.g. `http://192.168.1.50:81/stream`)
5. Tap the **Checkmark (✓)** to save and connect!

---

## 📦 Building a Standalone Android APK (Install Permanently)

If you want to install a standalone `.apk` directly onto your phone without needing Expo Go or your computer running:

1. Install EAS CLI:
   ```bash
   npm install -g eas-cli
   ```
2. Log in with your free Expo account:
   ```bash
   eas login
   ```
3. Build the standalone APK:
   ```bash
   eas build -p android --profile preview
   ```
4. Download the generated `.apk` file directly onto your Android phone and tap to install!

---

## 🔌 Hardware Firmware & Wiring

The complete ESP32-CAM Arduino sketch, pinout guide, and Home Assistant YAML configurations are available in:
- Firmware Sketch: `../firmware/esp32_cam_doorbell/esp32_cam_doorbell.ino`
- Hardware Wiring Guide: `../firmware/WIRING_AND_SETUP_GUIDE.md`
- Home Assistant Config: `../firmware/home_assistant_config.yaml`

