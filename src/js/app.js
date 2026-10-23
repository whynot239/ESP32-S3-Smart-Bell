/**
 * Main Application Orchestrator
 * Connects Doorbell Hardware Simulator, Live Camera Engine, Home Assistant Hub,
 * Notification Manager, 2-Way Audio Intercom, and Gate Release Controls.
 */

import { audioEngine } from './audio-engine.js';
import { CameraFeedEngine } from './camera-feed.js';
import { haHub } from './home-assistant.js';
import { NotificationManager } from './notifications.js';
import { injectIcons } from './icons.js';
import { laptopIntercom } from './intercom-bridge.js';

class DoorbellApp {
  constructor() {
    this.cameraEngine = null;
    this.notificationManager = null;
    this.callTimerInterval = null;
    this.callSeconds = 0;
    this.isCallActive = false;
    this.isMicMuted = false;
    this.visualizerInterval = null;

    this.dom = {};
  }

  init() {
    this.cacheDomElements();
    this.setupCamera();
    this.setupNotifications();
    this.bindEvents();
    this.subscribeToHA();
    this.startClock();
    this.renderActivityLogs(haHub.history);
    injectIcons();
    window.doorbellAppInstance = this;

    console.log("Smart Doorbell System initialized successfully.");
  }

  cacheDomElements() {
    this.dom = {
      // Hardware Porch Unit
      physicalRingBtn: document.getElementById('btn-physical-ring'),
      motionTriggerBtn: document.getElementById('btn-motion-trigger'),
      porchLightBtn: document.getElementById('btn-porch-light'),
      webcamToggleBtn: document.getElementById('btn-webcam-toggle'),
      sceneButtons: document.querySelectorAll('[data-scene]'),
      irEmitters: document.querySelectorAll('.ir-emitter'),

      // Camera Canvases
      incomingCallCanvas: document.getElementById('incoming-call-camera-canvas'),
      intercomCanvas: document.getElementById('intercom-camera-canvas'),

      // Mobile Screens
      mobileDashboard: document.getElementById('mobile-dashboard-view'),
      incomingCallOverlay: document.getElementById('incoming-call-overlay'),
      activeIntercomView: document.getElementById('active-intercom-view'),

      // Call Actions
      btnAnswerCall: document.getElementById('btn-answer-call'),
      btnDeclineCall: document.getElementById('btn-decline-call'),
      btnEndIntercom: document.getElementById('btn-end-intercom'),
      btnToggleMic: document.getElementById('btn-toggle-mic'),
      btnNightVisionToggle: document.getElementById('btn-night-vision-toggle'),
      btnFlashlightToggle: document.getElementById('btn-flashlight-toggle'),
      btnSnapshot: document.getElementById('btn-snapshot'),

      // Gate Controls
      btnOpenDoorMaster: document.getElementById('btn-open-door-master'),
      btnQuickGateDash: document.getElementById('btn-quick-gate-dash'),
      gateStatusLabel: document.getElementById('gate-status-label'),
      gateIconContainer: document.getElementById('gate-icon-container'),

      // Quick Voice Chips
      quickChips: document.querySelectorAll('.btn-quick-chip'),

      // Waveform Visualizer
      waveformBars: document.querySelectorAll('.wave-bar'),
      callTimerText: document.getElementById('call-timer-text'),

      // HAOS Panel & Telemetry
      haWifiToggleBtn: document.getElementById('btn-ha-wifi-toggle'),
      wifiStatusText: document.getElementById('ha-wifi-status-text'),
      entityRingState: document.getElementById('entity-ring-state'),
      entityLockState: document.getElementById('entity-lock-state'),
      entityCamState: document.getElementById('entity-cam-state'),
      entityLightState: document.getElementById('entity-light-state'),
      activityLogsContainer: document.getElementById('activity-logs-list'),
      mobileActivityList: document.getElementById('mobile-activity-list'),
      btnClearLogs: document.getElementById('btn-clear-logs'),

      // Clock
      phoneClock: document.getElementById('phone-clock'),

      // Dual Relays & Hardware Diagnostics
      relay1Card: document.getElementById('relay1-card'),
      relay1Led: document.getElementById('relay1-led'),
      relay1Status: document.getElementById('relay1-status'),
      relay1Progress: document.getElementById('relay1-progress'),

      relay2Card: document.getElementById('relay2-card'),
      relay2Led: document.getElementById('relay2-led'),
      relay2Status: document.getElementById('relay2-status'),
      relay2Progress: document.getElementById('relay2-progress'),

      telemetryPinBtn: document.getElementById('telemetry-pin-btn'),
      telemetryCamState: document.getElementById('telemetry-cam-state'),
      esp32StatusBadge: document.getElementById('esp32-status-badge')
    };
  }

  setupCamera() {
    // We attach the main camera feed engine to the incoming call canvas,
    // and continuously mirror to intercom canvas as needed.
    this.cameraEngine = new CameraFeedEngine(this.dom.incomingCallCanvas);

    // Synchronize frame rendering to intercom canvas
    const origRender = this.cameraEngine.renderFrame.bind(this.cameraEngine);
    this.cameraEngine.renderFrame = (time) => {
      origRender(time);
      if (this.isCallActive && this.dom.intercomCanvas) {
        const iCtx = this.dom.intercomCanvas.getContext('2d');
        if (iCtx) {
          if (this.dom.intercomCanvas.width !== this.dom.incomingCallCanvas.width) {
            this.dom.intercomCanvas.width = this.dom.incomingCallCanvas.width;
            this.dom.intercomCanvas.height = this.dom.incomingCallCanvas.height;
          }
          iCtx.drawImage(this.dom.incomingCallCanvas, 0, 0);
        }
      }
    };
  }

  setupNotifications() {
    this.notificationManager = new NotificationManager(() => {
      this.openIncomingCallScreen();
    });
  }

  bindEvents() {
    // 1. Physical Doorbell Ring Button
    this.dom.physicalRingBtn.addEventListener('click', () => this.handleDoorbellRing());

    // Rings from the simulator server or physical hardware notify every open dashboard.
    window.addEventListener('doorbell:ring-alert', (event) => {
      this.notificationManager.showDoorbellRingAlert(event.detail?.visitor || 'Front Porch Visitor');
    });

    // 2. Motion Trigger
    this.dom.motionTriggerBtn.addEventListener('click', () => this.handleMotionDetected());

    // 3. Porch Light Hardware Button
    this.dom.porchLightBtn.addEventListener('click', () => {
      const isOn = haHub.togglePorchLight();
      this.cameraEngine.toggleFlashlight(isOn);
      audioEngine.playNotificationPing();
    });

    // 4. Visitor Preset Buttons
    this.dom.sceneButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const scene = btn.getAttribute('data-scene');
        this.dom.sceneButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.cameraEngine.stopWebcam();
        this.cameraEngine.setVisitorPreset(scene);
      });
    });

    // 5. Webcam Toggle
    this.dom.webcamToggleBtn.addEventListener('click', async () => {
      if (this.cameraEngine.mode === 'webcam') {
        this.cameraEngine.stopWebcam();
        this.dom.webcamToggleBtn.classList.remove('active');
        this.dom.webcamToggleBtn.innerHTML = `<span>Use My Webcam</span>`;
      } else {
        const ok = await this.cameraEngine.startWebcam();
        if (ok) {
          laptopIntercom.start(this.cameraEngine.webcamVideo.srcObject);
          this.dom.webcamToggleBtn.classList.add('active');
          this.dom.webcamToggleBtn.innerHTML = `<span>Switch to AI Sim</span>`;
        }
      }
    });

    // 6. Incoming Call Screen: Answer & Decline Buttons
    this.dom.btnAnswerCall.addEventListener('click', () => this.answerCall());
    this.dom.btnDeclineCall.addEventListener('click', () => this.declineCall());

    // 7. Active Intercom Screen Controls
    this.dom.btnEndIntercom.addEventListener('click', () => this.endIntercomCall());
    this.dom.btnToggleMic.addEventListener('click', () => this.toggleMic());

    this.dom.btnNightVisionToggle.addEventListener('click', () => {
      const active = this.cameraEngine.toggleNightVision();
      this.dom.btnNightVisionToggle.classList.toggle('active', active);
      this.dom.irEmitters.forEach(el => el.classList.toggle('active', active));
    });

    this.dom.btnFlashlightToggle.addEventListener('click', () => {
      const isOn = haHub.togglePorchLight();
      this.cameraEngine.toggleFlashlight(isOn);
      this.dom.btnFlashlightToggle.classList.toggle('active', isOn);
    });

    this.dom.btnSnapshot.addEventListener('click', () => this.takeSnapshot());

    // 8. Open Door / Unlock Gate Actions
    this.dom.btnOpenDoorMaster.addEventListener('click', () => this.handleUnlockGate());
    this.dom.btnQuickGateDash.addEventListener('click', () => this.handleUnlockGate());

    // 9. Quick Voice Responses
    this.dom.quickChips.forEach(chip => {
      chip.addEventListener('click', () => {
        const text = chip.getAttribute('data-reply');
        this.sendQuickVoiceReply(text);
      });
    });

    // 10. WiFi Toggle Simulation
    this.dom.haWifiToggleBtn.addEventListener('click', () => {
      const isWifi = haHub.toggleWifi();
      this.dom.haWifiToggleBtn.textContent = isWifi ? 'Switch to Cellular 5G' : 'Switch to Local WiFi';
      this.updateWifiDisplay(isWifi);
    });

    // 11. Clear Logs
    if (this.dom.btnClearLogs) {
      this.dom.btnClearLogs.addEventListener('click', () => {
        haHub.clearHistory();
      });
    }
  }

  startClock() {
    const updateTime = () => {
      const now = new Date();
      if (this.dom.phoneClock) {
        this.dom.phoneClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  }

  /**
   * 1. Physical Doorbell Ring Action
   */
  handleDoorbellRing() {
    // 1. Physical button & Pin 13 detection
    this.dom.physicalRingBtn.classList.add('ringing', 'pressed');
    setTimeout(() => this.dom.physicalRingBtn.classList.remove('pressed'), 200);
    setTimeout(() => this.dom.physicalRingBtn.classList.remove('ringing'), 4000);

    if (this.dom.telemetryPinBtn) {
      this.dom.telemetryPinBtn.textContent = 'LOW (Triggered!)';
      this.dom.telemetryPinBtn.style.color = '#38bdf8';
      setTimeout(() => {
        if (this.dom.telemetryPinBtn) {
          this.dom.telemetryPinBtn.textContent = 'HIGH (Ready)';
          this.dom.telemetryPinBtn.style.color = '';
        }
      }, 2000);
    }

    // 2. Relay 1: Energize inside bell chime for 2.0s
    this.triggerRelay1Chime(2000);

    // 3. On-Demand Camera Wakeup
    if (this.dom.telemetryCamState) {
      this.dom.telemetryCamState.textContent = 'STREAMING (Woken)';
      this.dom.telemetryCamState.style.color = '#34d399';
    }

    // 4. Play physical inside bell chime sound through web audio engine
    audioEngine.playDoorbellChime('modern');

    // 5. Trigger state in Home Assistant Hub
    haHub.triggerRing();

    // 6. Issue Mobile Notification Alert with Visitor Scene
    const visitorTitle = this.getVisitorTitle(this.cameraEngine.visitorPreset);
    this.notificationManager.showDoorbellRingAlert(visitorTitle);

    // 7. Auto record ring event to HA history
    haHub.addHistoryEvent({
      type: 'ring',
      title: 'Doorbell Ring Initialized',
      status: 'Relay 1 (GPIO 12) Inside Chime Ringing (2.0s)',
      visitor: visitorTitle
    });
  }

  handleMotionDetected() {
    audioEngine.playNotificationPing();
    haHub.setEntityState('binary_sensor.front_door_motion', 'on');
    setTimeout(() => haHub.setEntityState('binary_sensor.front_door_motion', 'off'), 3000);

    haHub.addHistoryEvent({
      type: 'motion',
      title: 'Motion Detected',
      status: 'AI Person Detected',
      visitor: 'Front Porch Zone'
    });
  }

  /**
   * 2. User Taps Notification -> Show Incoming Call Screen (Live Camera Feed in Background)
   */
  openIncomingCallScreen() {
    this.dom.mobileDashboard.classList.add('hidden');
    this.dom.activeIntercomView.classList.add('hidden');
    this.dom.incomingCallOverlay.classList.remove('hidden');

    // Refresh canvas dimensions
    this.cameraEngine.resizeCanvas();
  }

  /**
   * 3. User Taps Decline
   */
  declineCall() {
    audioEngine.playIntercomBeep('disconnect');
    this.dom.incomingCallOverlay.classList.add('hidden');
    this.dom.activeIntercomView.classList.add('hidden');
    this.dom.mobileDashboard.classList.remove('hidden');

    haHub.setEntityState('binary_sensor.front_doorbell_ring', 'off');
    haHub.addHistoryEvent({
      type: 'ring',
      title: 'Call Declined',
      status: 'Declined by Homeowner',
      visitor: this.getVisitorTitle(this.cameraEngine.visitorPreset)
    });
  }

  /**
   * 4. User Taps Answer -> Activates 2-Way Intercom Session
   */
  async answerCall() {
    audioEngine.playIntercomBeep('connect');

    this.dom.incomingCallOverlay.classList.add('hidden');
    this.dom.activeIntercomView.classList.remove('hidden');
    this.isCallActive = true;

    // Start 2-Way Microphone Stream
    await audioEngine.startMicrophone();

    // Start Call Timer
    this.callSeconds = 0;
    this.updateTimerText();
    clearInterval(this.callTimerInterval);
    this.callTimerInterval = setInterval(() => {
      this.callSeconds++;
      this.updateTimerText();
    }, 1000);

    // Start Waveform Visualizer
    this.startWaveformVisualizer();

    haHub.setEntityState('binary_sensor.front_doorbell_ring', 'off');
    haHub.setEntityState('camera.front_doorbell_live', 'streaming');
    haHub.addHistoryEvent({
      type: 'ring',
      title: 'Call Connected',
      status: '2-Way Intercom Active',
      visitor: this.getVisitorTitle(this.cameraEngine.visitorPreset)
    });
  }

  endIntercomCall() {
    audioEngine.playIntercomBeep('disconnect');
    audioEngine.stopMicrophone();

    clearInterval(this.callTimerInterval);
    clearInterval(this.visualizerInterval);
    this.isCallActive = false;

    this.dom.activeIntercomView.classList.add('hidden');
    this.dom.incomingCallOverlay.classList.add('hidden');
    this.dom.mobileDashboard.classList.remove('hidden');

    haHub.setEntityState('camera.front_doorbell_live', 'idle');
  }

  toggleMic() {
    this.isMicMuted = !this.isMicMuted;
    this.dom.btnToggleMic.classList.toggle('active-muted', this.isMicMuted);
    this.dom.btnToggleMic.innerHTML = this.isMicMuted ? 
      `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="2" x2="22" y1="2" y2="22"/><path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"/><path d="M5 10v2a7 7 0 0 0 12 5"/><path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12"/><line x1="12" x2="12" y1="19" y2="22"/></svg>` :
      `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`;
  }

  updateTimerText() {
    const mins = String(Math.floor(this.callSeconds / 60)).padStart(2, '0');
    const secs = String(this.callSeconds % 60).padStart(2, '0');
    if (this.dom.callTimerText) {
      this.dom.callTimerText.textContent = `${mins}:${secs}`;
    }
  }

  startWaveformVisualizer() {
    clearInterval(this.visualizerInterval);
    this.visualizerInterval = setInterval(() => {
      if (!this.isCallActive || this.isMicMuted) {
        this.dom.waveformBars.forEach(b => {
          b.style.height = '6px';
          b.classList.remove('speaking');
        });
        return;
      }
      const level = audioEngine.getAudioLevel();
      this.dom.waveformBars.forEach((bar, index) => {
        const height = Math.max(6, Math.min(32, level * 36 * (0.6 + Math.sin(index + Date.now() / 80) * 0.4)));
        bar.style.height = `${height}px`;
        bar.classList.toggle('speaking', level > 0.2);
      });
    }, 60);
  }

  /**
   * 5. Smart Gate Unlock Action ("Open Door")
   */
  async handleUnlockGate() {
    const btn = this.dom.btnOpenDoorMaster;
    const quickBtn = this.dom.btnQuickGateDash;

    if (!haHub.isLocalWifi) {
      alert("⚠️ WiFi Verification Notice: You are currently on Cellular 5G. For security, please connect to your Home WiFi network or switch WiFi mode in the Home Assistant panel.");
      return;
    }

    try {
      // 1. Trigger Relay 2: 1000ms Current Burst to Solenoid
      this.triggerRelay2Burst(1000);

      // 2. Audio mechanical actuator sound
      audioEngine.playGateUnlockSound();

      // UI state transition
      btn.classList.add('unlocking');
      btn.innerHTML = `
        <div class="open-door-left">
          <svg class="pulse-ring" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 11V7a5 5 0 0 1 9.9-1"/><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/></svg>
          <div>
            <div style="font-size: 1rem; font-weight: 800;">CURRENT BURST (1.0s)...</div>
            <div style="font-size: 0.72rem; opacity: 0.85;">Relay 2 (GPIO 14) Energized</div>
          </div>
        </div>
      `;

      await haHub.unlockGate(9000);

      btn.classList.remove('unlocking');
      btn.classList.add('unlocked');
      btn.innerHTML = `
        <div class="open-door-left">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <div>
            <div style="font-size: 1rem; font-weight: 800; color: #34d399;">GATE UNLOCKED</div>
            <div style="font-size: 0.72rem; opacity: 0.85;">Burst complete • Auto re-locking in 8s</div>
          </div>
        </div>
      `;

      setTimeout(() => {
        btn.classList.remove('unlocked');
        btn.innerHTML = `
          <div class="open-door-left">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 11V7a5 5 0 0 1 9.9-1"/><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/></svg>
            <div>
              <div style="font-size: 1rem; font-weight: 800;">OPEN DOOR / GATE</div>
              <div style="font-size: 0.72rem; opacity: 0.85;">Tap to trigger instant unlock burst</div>
            </div>
          </div>
          <span class="open-door-wifi-badge">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 13a10 10 0 0 1 14 0"/><line x1="12" x2="12.01" y1="20" y2="20"/></svg>
            WiFi OK
          </span>
        `;
      }, 9000);

    } catch (err) {
      alert(err.message);
    }
  }

  /**
   * Relay 1: Inside Bell Chime Animation & Auto-Off
   */
  triggerRelay1Chime(durationMs = 2000) {
    if (!this.dom.relay1Card) return;
    this.dom.relay1Card.classList.add('active-chime');
    this.dom.relay1Led.classList.add('led-chime-on');
    this.dom.relay1Status.classList.add('status-chime-active');
    this.dom.relay1Status.textContent = 'ENERGIZED (Ringing)';
    if (this.dom.relay1Progress) this.dom.relay1Progress.style.width = '100%';

    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / durationMs) * 100);
      if (this.dom.relay1Progress) {
        this.dom.relay1Progress.style.width = `${pct}%`;
      }
      if (elapsed >= durationMs) {
        clearInterval(interval);
        if (this.dom.relay1Card) {
          this.dom.relay1Card.classList.remove('active-chime');
          this.dom.relay1Led.classList.remove('led-chime-on');
          this.dom.relay1Status.classList.remove('status-chime-active');
          this.dom.relay1Status.textContent = 'IDLE (OFF)';
          if (this.dom.relay1Progress) this.dom.relay1Progress.style.width = '0%';
        }
      }
    }, 40);
  }

  /**
   * Relay 2: Gate Lock Solenoid 1000ms Current Burst & Cut-Off
   */
  triggerRelay2Burst(burstMs = 1000) {
    if (!this.dom.relay2Card) return;
    this.dom.relay2Card.classList.add('active-burst');
    this.dom.relay2Led.classList.add('led-burst-on');
    this.dom.relay2Status.classList.add('status-burst-active');
    this.dom.relay2Status.textContent = '⚡ 1000ms BURST ACTIVE';
    if (this.dom.relay2Progress) this.dom.relay2Progress.style.width = '100%';

    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / burstMs) * 100);
      if (this.dom.relay2Progress) {
        this.dom.relay2Progress.style.width = `${pct}%`;
      }
      if (elapsed >= burstMs) {
        clearInterval(interval);
        if (this.dom.relay2Card) {
          this.dom.relay2Card.classList.remove('active-burst');
          this.dom.relay2Led.classList.remove('led-burst-on');
          this.dom.relay2Status.classList.remove('status-burst-active');
          this.dom.relay2Status.textContent = 'BURST COMPLETE (Safe)';
          if (this.dom.relay2Progress) this.dom.relay2Progress.style.width = '0%';

          setTimeout(() => {
            if (this.dom.relay2Status) {
              this.dom.relay2Status.textContent = 'IDLE (LOCKED)';
            }
          }, 7000);
        }
      }
    }, 30);
  }

  sendQuickVoiceReply(text) {
    audioEngine.playIntercomBeep('connect');
    audioEngine.speakCannedResponse(text, () => {
      audioEngine.playIntercomBeep('disconnect');
    });

    haHub.addHistoryEvent({
      type: 'ring',
      title: 'Voice Reply Sent',
      status: `"${text}"`,
      visitor: 'Broadcasting to Doorbell'
    });
  }

  takeSnapshot() {
    const dataUrl = this.cameraEngine.takeSnapshot();
    audioEngine.playNotificationPing();
    haHub.addHistoryEvent({
      type: 'motion',
      title: 'Snapshot Saved',
      status: 'Captured by Homeowner',
      visitor: 'Manual Capture',
      snapshot: dataUrl
    });
    alert("📸 High-resolution snapshot saved to activity history!");
  }

  subscribeToHA() {
    haHub.subscribe((entities, history) => {
      // Sync Entity State Badges
      if (this.dom.entityRingState) {
        const ring = entities['binary_sensor.front_doorbell_ring'].state;
        this.dom.entityRingState.textContent = ring.toUpperCase();
        this.dom.entityRingState.className = `ha-entity-state-pill ${ring === 'on' ? 'state-ringing' : ''}`;
      }

      if (this.dom.entityLockState) {
        const lock = entities['lock.front_gate'].state;
        this.dom.entityLockState.textContent = lock.toUpperCase();
        this.dom.entityLockState.className = `ha-entity-state-pill ${lock === 'unlocked' ? 'state-unlocked' : ''}`;
        
        // Mobile Dash Gate Status
        if (this.dom.gateStatusLabel) {
          this.dom.gateStatusLabel.textContent = lock === 'unlocked' ? 'UNLOCKED' : 'LOCKED';
          this.dom.gateStatusLabel.parentElement.classList.toggle('locked', lock === 'locked');
        }
      }

      if (this.dom.entityCamState) {
        const cam = entities['camera.front_doorbell_live'].state;
        this.dom.entityCamState.textContent = cam.toUpperCase();
        this.dom.entityCamState.className = `ha-entity-state-pill ${cam === 'streaming' ? 'state-streaming' : ''}`;
      }

      if (this.dom.entityLightState) {
        const light = entities['switch.porch_light'].state;
        this.dom.entityLightState.textContent = light.toUpperCase();
        this.dom.entityLightState.className = `ha-entity-state-pill ${light === 'on' ? 'state-on' : ''}`;
      }

      this.renderActivityLogs(history);
    });
  }

  updateWifiDisplay(isWifi) {
    if (this.dom.wifiStatusText) {
      this.dom.wifiStatusText.textContent = isWifi ? 'Home_5GHz_IoT (-48 dBm)' : 'Cellular 5G (Remote Relay)';
    }
  }

  renderActivityLogs(history) {
    if (!this.dom.activityLogsContainer) return;

    const renderItem = (item) => `
      <div class="log-entry-item">
        <div class="log-left">
          <span class="log-time">${item.time}</span>
          <span class="log-title">${item.title}</span>
        </div>
        <span class="log-badge">${item.status || item.visitor}</span>
      </div>
    `;

    this.dom.activityLogsContainer.innerHTML = history.slice(0, 15).map(renderItem).join('');

    if (this.dom.mobileActivityList) {
      this.dom.mobileActivityList.innerHTML = history.slice(0, 4).map(item => `
        <div class="activity-item">
          <div class="activity-left">
            <div class="activity-icon-badge ${item.type}">
              ${item.type === 'ring' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>' :
                item.type === 'unlock' ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>' :
                '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/></svg>'}
            </div>
            <div>
              <div class="activity-title">${item.title}</div>
              <div class="activity-sub">${item.status || item.visitor}</div>
            </div>
          </div>
          <div class="activity-time">${item.time}</div>
        </div>
      `).join('');
    }
  }

  getVisitorTitle(preset) {
    switch (preset) {
      case 'courier': return 'Delivery Courier (Package Detected)';
      case 'neighbor': return 'Neighbor (Motion in Zone)';
      case 'guest': return 'Evening Visitor';
      case 'empty': return 'Empty Front Porch';
      default: return 'Visitor at Porch';
    }
  }
}

// Instantiate and start app on DOM content loaded
window.addEventListener('DOMContentLoaded', () => {
  const app = new DoorbellApp();
  app.init();
});
