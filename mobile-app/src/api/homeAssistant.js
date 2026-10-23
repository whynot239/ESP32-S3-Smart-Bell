/**
 * Home Assistant OS Client & State Manager
 * Handles real WebSocket / REST integration with HAOS and built-in offline simulation.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NotificationManager } from './notifications';

class HomeAssistantService {
  constructor() {
    this.ws = null;
    this.serverUrl = 'http://192.168.1.100:3000';
    this.token = 'local-hub-token';
    this.esp32CamUrl = 'http://192.168.1.100:3000';
    this.msgId = 1;
    this.listeners = new Set();
    this.isConnected = false;
    this.isLocalWifi = true;
    this.wifiSSID = 'Home_5GHz_IoT';

    this.entities = {
      'binary_sensor.front_doorbell_ring': { state: 'off', attributes: { friendly_name: 'Front Doorbell Ring' } },
      'binary_sensor.front_door_motion': { state: 'off', attributes: { friendly_name: 'Porch Motion Sensor' } },
      'camera.front_doorbell_live': { state: 'idle', attributes: { friendly_name: 'Front Doorbell Camera' } },
      'lock.front_gate': { state: 'locked', attributes: { friendly_name: 'Front Gate Smart Lock' } },
      'switch.porch_light': { state: 'off', attributes: { friendly_name: 'Front Porch Sconce' } },
      'sensor.wifi_signal': { state: '-48 dBm', attributes: { ssid: 'Home_5GHz_IoT' } }
    };

    this.history = [];
    this.init();
  }

  async init() {
    try {
      const savedUrl = await AsyncStorage.getItem('ha_server_url');
      const savedToken = await AsyncStorage.getItem('ha_token');
      const savedCamUrl = await AsyncStorage.getItem('esp32_cam_url');
      const savedHistory = await AsyncStorage.getItem('ha_history');

      this.serverUrl = savedUrl || 'http://192.168.1.100:3000';
      this.token = savedToken || 'local-hub-token';
      this.esp32CamUrl = savedCamUrl || 'http://192.168.1.100:3000';

      if (savedHistory) this.history = JSON.parse(savedHistory);
      else this.seedInitialHistory();

      this.connectWebSocket();

      // Start hardware polling backup if ESP32 / Server URL is configured
      this.startEsp32Polling();
    } catch (e) {
      console.warn("Error initializing HA storage:", e);
    }
  }

  getEsp32BaseUrl() {
    if (!this.esp32CamUrl) return null;
    let url = this.esp32CamUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'http://' + url;
    }
    try {
      const parsed = new URL(url);
      // Strip port 81 (MJPEG stream port) to talk to REST on port 80, but preserve other ports like 3000
      const port = parsed.port && parsed.port !== '81' ? `:${parsed.port}` : '';
      return `${parsed.protocol}//${parsed.hostname}${port}`;
    } catch {
      return url.replace(/\/stream.*|\/capture.*/, '').replace(/:81$/, '');
    }
  }

  startEsp32Polling() {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    const espBase = this.getEsp32BaseUrl();
    if (!espBase) return;

    this.pollingTimer = setInterval(async () => {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 1800);
        const res = await fetch(`${espBase}/status`, { signal: controller.signal });
        clearTimeout(tid);
        if (res.ok) {
          const data = await res.json();
          // 1. Detect physical bell ring initialization from ESP32
          if (data.chime === 'ringing' && this.entities['binary_sensor.front_doorbell_ring'].state !== 'on') {
            this.triggerRingSimulation();
          }
          // 2. Reflect camera wake state
          if (data.cameraActive && this.entities['camera.front_doorbell_live'].state !== 'streaming') {
            this.entities['camera.front_doorbell_live'].state = 'streaming';
            this.notify();
          }
          // 3. Reflect gate burst status
          if (data.lockBurst === 'active' && this.entities['lock.front_gate'].state !== 'unlocked') {
            this.entities['lock.front_gate'].state = 'unlocked';
            this.notify();
          }
        }
      } catch {
        // Silent catch for offline or non-local network
      }
    }, 1000);
  }

  seedInitialHistory() {
    const now = Date.now();
    this.history = [
      {
        id: '1',
        type: 'ring',
        title: 'Doorbell Ring',
        subtitle: 'Physical Bell Initialized (Relay 1)',
        time: '35m ago',
        status: 'Answered (1m 42s)'
      },
      {
        id: '2',
        type: 'unlock',
        title: 'Gate Lock Burst (1.0s)',
        subtitle: 'Relay 2 Current Pulse Dispatched',
        time: '34m ago',
        status: 'Auto re-locked (8s)'
      },
      {
        id: '3',
        type: 'motion',
        title: 'Porch Motion Detected',
        subtitle: 'Person in Zone 1',
        time: '3h ago',
        status: '15s Clip Recorded'
      }
    ];
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.entities, this.history));
  }

  connectWebSocket() {
    try {
      const wsUrl = this.serverUrl.replace(/^http/, 'ws') + '/api/websocket?token=' + encodeURIComponent(this.token);
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        console.log("WebSocket connected to the doorbell hub");
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'event' && msg.event?.data) {
            const { entity_id, new_state } = msg.event.data;
            if (entity_id && new_state) {
              this.entities[entity_id] = new_state;
              this.notify();
            }
          } else if (msg.type === 'ring_alert') {
            // Direct instantaneous ring alert trigger from Hub / Website!
            console.log("🔔 [ALERT] Immediate Doorbell Ring Received from Hub!");
            const visitor = msg.visitor || 'Visitor at Front Porch';
            this.triggerRingSimulation(visitor);
            NotificationManager.triggerRingAlert(visitor);
          } else if (msg.type === 'rfid_event') {
            const isGranted = msg.status === 'granted';
            this.addHistoryEvent({
              id: Date.now().toString(),
              type: 'unlock',
              title: isGranted ? `NFC Keycard: ${msg.user}` : 'Unknown Card Tap',
              subtitle: `UID: ${msg.cardId}`,
              time: 'Just now',
              status: isGranted ? 'Access Granted' : 'Access Denied'
            });
          } else if (msg.type === 'hardware_status') {
            console.log(`🤖 ESP32 Hardware is now ${msg.connected ? 'ONLINE' : 'OFFLINE'}`);
          }
        } catch (e) {
          console.warn("WS error:", e);
        }
      };

      this.ws.onerror = (e) => {
        console.log("Hub WebSocket connection note:", e.message);
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        setTimeout(() => this.connectWebSocket(), 3500);
      };
    } catch (err) {
      console.log("WebSocket setup skipped:", err);
    }
  }

  subscribeEvents() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      id: this.msgId++,
      type: 'subscribe_events',
      event_type: 'state_changed'
    }));
  }

  fetchStates() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({
      id: this.msgId++,
      type: 'get_states'
    }));
  }

  async callService(domain, service, serviceData = {}) {
    // Also dispatch directly to ESP32 if available
    const espBase = this.getEsp32BaseUrl();
    if (espBase) {
      if (domain === 'switch' && service === 'toggle') {
        try {
          fetch(`${espBase}/light/toggle`, { method: 'GET' }).catch(() => {});
        } catch {}
      }
    }

    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        id: this.msgId++,
        type: 'call_service',
        domain,
        service,
        service_data: serviceData
      }));
    } else {
      // Local execution fallback
      if (domain === 'lock' && service === 'unlock') {
        return Promise.reject(new Error('Use the secured unlock control with your owner PIN.'));
      } else if (domain === 'switch' && service === 'toggle') {
        const cur = this.entities['switch.porch_light'].state;
        this.entities['switch.porch_light'].state = cur === 'on' ? 'off' : 'on';
        this.notify();
      }
    }
  }

  async unlockGate(pin) {
    if (!this.isLocalWifi) {
      throw new Error("Security Alert: Gate unlock is only allowed when connected to Home WiFi!");
    }
    if (!/^\d{6,12}$/.test(pin || '')) {
      throw new Error('Enter your 6 to 12 digit owner PIN to unlock the gate.');
    }
    this.entities['lock.front_gate'].state = 'unlocking';
    this.notify();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch(`${this.serverUrl}/api/unlock`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'owner', pin }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      this.entities['lock.front_gate'].state = 'locked';
      this.notify();
      throw new Error(result.error || 'The hub did not authorize the unlock.');
    }

    this.entities['lock.front_gate'].state = 'unlocked';
    this.addHistoryEvent({
      id: Date.now().toString(),
      type: 'unlock',
      title: 'Gate Lock Burst (1.0s)',
      subtitle: 'Server-authorized command delivered to doorbell',
      time: 'Just now',
      status: 'Success'
    });
    this.notify();
    setTimeout(() => {
      this.entities['lock.front_gate'].state = 'locked';
      this.notify();
    }, 8000);
    return true;
  }

  triggerRingSimulation() {
    this.entities['binary_sensor.front_doorbell_ring'].state = 'on';
    this.entities['camera.front_doorbell_live'].state = 'streaming';
    this.addHistoryEvent({
      id: Date.now().toString(),
      type: 'ring',
      title: 'Doorbell Ringing',
      subtitle: 'Visitor at Front Porch',
      time: 'Just now',
      status: 'Incoming'
    });
    this.notify();

    setTimeout(() => {
      if (this.entities['binary_sensor.front_doorbell_ring'].state === 'on') {
        this.entities['binary_sensor.front_doorbell_ring'].state = 'off';
        this.notify();
      }
    }, 15000);
  }

  addHistoryEvent(event) {
    this.history.unshift(event);
    if (this.history.length > 25) this.history.pop();
    AsyncStorage.setItem('ha_history', JSON.stringify(this.history));
    this.notify();
  }

  toggleWifi() {
    this.isLocalWifi = !this.isLocalWifi;
    this.entities['sensor.wifi_signal'].state = this.isLocalWifi ? '-48 dBm (5GHz Connected)' : 'Cellular 5G (Remote)';
    this.notify();
    return this.isLocalWifi;
  }

  sendVoiceReply(presetId, text) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'voice_reply',
          presetId,
          text
        }));
        console.log(`🔊 Voice reply dispatched to hardware: "${text}"`);
      } catch (err) {
        console.warn("Error sending voice reply:", err);
      }
    }
  }

  sendAudioChunk(base64Data) {
    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({
          type: 'audio_chunk',
          data: base64Data
        }));
      } catch (err) {
        console.warn("Error sending audio chunk:", err);
      }
    }
  }
}

export const HomeAssistant = new HomeAssistantService();
