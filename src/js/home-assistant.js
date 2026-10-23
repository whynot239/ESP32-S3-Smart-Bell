/**
 * Home Assistant OS Integration & State Management Hub
 * Handles real HAOS WebSocket/REST communication and built-in local state synchronization.
 */
export class HomeAssistantHub {
  constructor() {
    this.serverUrl = localStorage.getItem('ha_server_url') || 'http://homeassistant.local:8123';
    this.token = localStorage.getItem('ha_token') || '';
    this.isConnected = false;
    this.isLocalWifi = true;
    this.wifiSSID = 'Home_5GHz_IoT';
    this.listeners = new Set();

    // Default Entity States
    this.entities = {
      'binary_sensor.front_doorbell_ring': {
        state: 'off',
        attributes: { friendly_name: 'Front Doorbell Ring', icon: 'mdi:bell' },
        last_changed: new Date().toISOString()
      },
      'binary_sensor.front_door_motion': {
        state: 'off',
        attributes: { friendly_name: 'Porch Motion Sensor', device_class: 'motion' },
        last_changed: new Date().toISOString()
      },
      'camera.front_doorbell_live': {
        state: 'idle',
        attributes: { friendly_name: 'Front Doorbell Camera', access_token: 'demo-cam-token' },
        last_changed: new Date().toISOString()
      },
      'lock.front_gate': {
        state: 'locked',
        attributes: { friendly_name: 'Smart Front Gate Lock', supported_features: 1 },
        last_changed: new Date().toISOString()
      },
      'switch.porch_light': {
        state: 'off',
        attributes: { friendly_name: 'Front Porch Sconce Light' },
        last_changed: new Date().toISOString()
      },
      'sensor.wifi_signal': {
        state: '-48 dBm (Excellent)',
        attributes: { ssid: this.wifiSSID, frequency: '5.2 GHz' }
      },
      'sensor.doorbell_power': {
        state: '24V AC Hardwired (100%)',
        attributes: { status: 'Optimal' }
      }
    };

    // Activity Log History
    this.history = JSON.parse(localStorage.getItem('doorbell_history') || '[]');
    if (this.history.length === 0) {
      this.seedInitialHistory();
    }

    this.ws = null;
    this.initWebSocket();
  }

  initWebSocket() {
    try {
      const loc = window.location;
      const wsProtocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
      const token = localStorage.getItem('doorbell_test_token');
      if (!token) return; // Archived simulator is not an unauthenticated telemetry viewer.
      const wsUrl = `${wsProtocol}//${loc.host}/api/websocket?token=${encodeURIComponent(token)}`;
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log("🌐 [SYNC] Website connected to Hub WebSocket server!");
        this.isConnected = true;
        this.notify();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          
          if (msg.type === 'auth_required') {
            this.sendWs({ type: 'auth', access_token: 'local-web-token' });
          } else if (msg.type === 'auth_ok') {
            this.sendWs({ id: 1, type: 'subscribe_events', event_type: 'state_changed' });
            this.sendWs({ id: 2, type: 'get_states' });
          } else if (msg.type === 'init' && msg.entities) {
            this.entities = { ...this.entities, ...msg.entities };
            this.notify();
          } else if (msg.type === 'event' && msg.event?.data) {
            const { entity_id, new_state } = msg.event.data;
            if (entity_id && new_state) {
              this.entities[entity_id] = new_state;
              this.notify();
            }
          } else if (msg.type === 'sync' && msg.entityId && msg.state) {
            this.setEntityState(msg.entityId, msg.state);
          } else if (msg.type === 'ring_alert') {
            window.dispatchEvent(new CustomEvent('doorbell:ring-alert', { detail: msg }));
          } else if (msg.type === 'relay2_burst') {
            if (window.doorbellAppInstance && window.doorbellAppInstance.triggerRelay2Burst) {
              window.doorbellAppInstance.triggerRelay2Burst(msg.durationMs || 1000);
            }
          }
        } catch (e) {
          console.error("WS parse error:", e);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        setTimeout(() => this.initWebSocket(), 3000);
      };
    } catch (err) {
      console.warn("WebSocket init error:", err);
    }
  }

  sendWs(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  seedInitialHistory() {
    const now = Date.now();
    this.history = [
      {
        id: 'hist-1',
        type: 'ring',
        title: 'Doorbell Ring Answered',
        time: new Date(now - 1000 * 60 * 35).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: 'Today',
        status: 'Answered (1m 42s)',
        visitor: 'Courier Delivery',
        snapshot: null
      },
      {
        id: 'hist-2',
        type: 'unlock',
        title: 'Gate Unlocked by App',
        time: new Date(now - 1000 * 60 * 34).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: 'Today',
        status: 'Success (Local WiFi)',
        visitor: 'Auto Re-locked (10s)',
        snapshot: null
      },
      {
        id: 'hist-3',
        type: 'motion',
        title: 'Motion Detected',
        time: new Date(now - 1000 * 60 * 180).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: 'Today',
        status: 'Recorded Clip (15s)',
        visitor: 'Person at Porch',
        snapshot: null
      }
    ];
    this.saveHistory();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify() {
    this.listeners.forEach(fn => fn(this.entities, this.history));
  }

  getEntity(entityId) {
    return this.entities[entityId] || { state: 'unknown', attributes: {} };
  }

  setEntityState(entityId, newState, customAttributes = {}) {
    if (!this.entities[entityId]) {
      this.entities[entityId] = { state: newState, attributes: customAttributes, last_changed: new Date().toISOString() };
    } else {
      this.entities[entityId].state = newState;
      this.entities[entityId].last_changed = new Date().toISOString();
      this.entities[entityId].attributes = { ...this.entities[entityId].attributes, ...customAttributes };
    }
    this.notify();
  }

  /**
   * Trigger Doorbell Ring Event in HAOS
   */
  async triggerRing(snapshotData = null) {
    this.setEntityState('binary_sensor.front_doorbell_ring', 'on');
    this.setEntityState('camera.front_doorbell_live', 'streaming');

    let token = localStorage.getItem('doorbell_test_token');
    if (!token) {
      token = window.prompt('Enter your MOBILE_WS_TOKEN to test the phone alert.');
      if (token) localStorage.setItem('doorbell_test_token', token);
    }
    if (token) {
      try {
        const response = await fetch('/api/test_ring', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok) {
          localStorage.removeItem('doorbell_test_token');
          alert('Phone test was not authorized. Re-enter the MOBILE_WS_TOKEN and try again.');
        }
      } catch {
        alert('Phone test could not reach the hub. Try again after the service wakes up.');
      }
    }

    // Auto reset ring sensor after 15 seconds if not answered
    setTimeout(() => {
      if (this.entities['binary_sensor.front_doorbell_ring'].state === 'on') {
        this.setEntityState('binary_sensor.front_doorbell_ring', 'off');
      }
    }, 15000);
  }

  /**
   * Unlock Front Gate via Home Assistant Lock Service
   */
  async unlockGate(autoRelockDelay = 8000) {
    if (!this.isLocalWifi && !this.isConnected) {
      throw new Error("Cannot open gate: Device not on local WiFi network!");
    }

    this.setEntityState('lock.front_gate', 'unlocking');

    // Send to server WebSocket & REST endpoint
    this.sendWs({ type: 'call_service', domain: 'lock', service: 'unlock' });
    fetch('/unlock', { method: 'GET' }).catch(() => {});

    // Simulate mechanical unlock actuation delay
    return new Promise((resolve) => {
      setTimeout(() => {
        this.setEntityState('lock.front_gate', 'unlocked');
        this.addHistoryEvent({
          type: 'unlock',
          title: 'Gate Unlocked via App',
          status: 'Authorized (Local WiFi)',
          visitor: 'Homeowner Action'
        });

        // Auto re-lock mechanism
        setTimeout(() => {
          this.setEntityState('lock.front_gate', 'locked');
          this.notify();
        }, autoRelockDelay);

        resolve(true);
      }, 900);
    });
  }

  togglePorchLight() {
    const current = this.entities['switch.porch_light'].state;
    const next = current === 'on' ? 'off' : 'on';
    this.setEntityState('switch.porch_light', next);
    return next === 'on';
  }

  addHistoryEvent(event) {
    const newEvent = {
      id: 'hist-' + Date.now(),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      date: 'Today',
      ...event
    };
    this.history.unshift(newEvent);
    if (this.history.length > 30) this.history.pop();
    this.saveHistory();
    this.notify();
  }

  saveHistory() {
    localStorage.setItem('doorbell_history', JSON.stringify(this.history));
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
    this.notify();
  }

  toggleWifi(forceState) {
    this.isLocalWifi = forceState !== undefined ? forceState : !this.isLocalWifi;
    this.setEntityState('sensor.wifi_signal', this.isLocalWifi ? '-48 dBm (5GHz Connected)' : 'Cellular 5G (Remote Relay)');
    this.notify();
    return this.isLocalWifi;
  }
}

export const haHub = new HomeAssistantHub();
