import AsyncStorage from '@react-native-async-storage/async-storage';

const CONFIG_KEY = 'smart_doorbell_config_v2';

class DoorbellClient {
  constructor() {
    this.config = null;
    this.ws = null;
    this.listeners = new Set();
    this.reconnectTimer = null;
    this.reconnectDelay = 1500;
  }

  emit(event) {
    this.listeners.forEach(listener => listener(event));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async load() {
    const raw = await AsyncStorage.getItem(CONFIG_KEY);
    this.config = raw ? JSON.parse(raw) : null;
    if (this.config?.serverUrl && this.config?.token) this.connect();
    return this.config;
  }

  async saveConfig({ serverUrl, token, username }) {
    this.config = { serverUrl: serverUrl.trim().replace(/\/+$/, ''), token: token.trim(), username: username?.trim() || 'owner' };
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(this.config));
    this.disconnect();
    this.connect();
  }

  async clearConfig() {
    this.disconnect();
    this.config = null;
    await AsyncStorage.removeItem(CONFIG_KEY);
  }

  disconnect() {
    clearTimeout(this.reconnectTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.emit({ type: 'connection', connected: false });
  }

  connect() {
    if (!this.config?.serverUrl || !this.config?.token) return;
    const wsUrl = this.config.serverUrl.replace(/^http/, 'ws') + '/api/websocket?token=' + encodeURIComponent(this.config.token);
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.reconnectDelay = 1500;
        this.emit({ type: 'connection', connected: true });
      };
      this.ws.onmessage = ({ data }) => {
        try {
          const message = JSON.parse(data);
          if (message.type === 'ring_alert') {
            this.emit({ type: 'ring', visitor: message.visitor || 'Front door visitor', eventId: message.eventId });
          }
          if (message.type === 'hardware_status') this.emit({ type: 'hardware', connected: message.connected });
        } catch {}
      };
      this.ws.onerror = () => this.emit({ type: 'connection', connected: false });
      this.ws.onclose = () => {
        this.emit({ type: 'connection', connected: false });
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, 15000);
      };
    } catch {
      this.emit({ type: 'connection', connected: false });
    }
  }

  async request(path, options = {}) {
    if (!this.config) throw new Error('Connect your doorbell first.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(this.config.serverUrl + path, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + this.config.token,
          ...(options.headers || {}),
        },
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'The doorbell service rejected this request.');
      return body;
    } finally { clearTimeout(timer); }
  }

  status() {
    return this.request('/status');
  }

  startLiveView() {
    return this.request('/api/live_view', { method: 'POST' });
  }

  unlock(pin) {
    return this.request('/api/unlock', {
      method: 'POST',
      body: JSON.stringify({ username: this.config.username || 'owner', pin }),
    });
  }

  cardsEnabled(pin, enabled) {
    return this.request('/api/cards_enabled', { method:'POST', body:JSON.stringify({username:this.config.username || 'owner',pin,enabled}) });
  }

  async history() {
    const [access, security] = await Promise.all([
      this.request('/api/access_history'),
      this.request('/api/security_history'),
    ]);
    return [...access, ...security].sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  }
}

export const doorbellClient = new DoorbellClient();
