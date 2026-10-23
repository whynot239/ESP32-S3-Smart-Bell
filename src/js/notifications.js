/**
 * Mobile Notification Manager
 * Handles Web Notifications and in-app interactive Lockscreen/Island notifications.
 */
import { audioEngine } from './audio-engine.js';

export class NotificationManager {
  constructor(onNotificationClick) {
    this.onNotificationClick = onNotificationClick;
    this.container = null;
    this.activeNotification = null;
    this.timeoutId = null;
    this.lastAlertAt = 0;
    this.init();
  }

  init() {
    this.container = document.getElementById('mobile-notification-container');
    if ('Notification' in window && Notification.permission === 'default') {
      // Proactively ask for native notification permission
      Notification.requestPermission();
    }
  }

  showDoorbellRingAlert(visitorType = 'Delivery Courier') {
    // A locally pressed simulator button and its server broadcast describe one ring.
    const now = Date.now();
    if (now - this.lastAlertAt < 1000) return;
    this.lastAlertAt = now;

    // 1. Play chime audio
    audioEngine.playNotificationPing();

    // 2. Browser Native Notification if allowed
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const nativeNotification = new Notification("🔔 Front Doorbell Ringing!", {
          body: `Visitor at Front Porch (${visitorType}). Tap to view live feed and answer.`,
          icon: 'favicon.ico',
          vibrate: [200, 100, 200, 100, 300],
          tag: 'doorbell-ring',
          requireInteraction: true
        });
        nativeNotification.onclick = () => {
          window.focus();
          nativeNotification.close();
          if (this.onNotificationClick) this.onNotificationClick();
        };
      } catch (e) {
        console.log("Native notification suppressed:", e);
      }
    }

    // 3. Render In-App Mobile Banner / Dynamic Island Alert
    if (!this.container) return;

    this.container.innerHTML = '';
    const notif = document.createElement('div');
    notif.className = 'mobile-notification-banner animate-slide-down';
    notif.innerHTML = `
      <div class="notif-glow"></div>
      <div class="notif-content">
        <div class="notif-icon-box pulse-ring">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18.8 4A6.3 6.3 0 0 0 6 4"/><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </div>
        <div class="notif-text">
          <div class="notif-header">
            <span class="notif-app-name">HOME ASSISTANT • DOORBELL</span>
            <span class="notif-time">NOW</span>
          </div>
          <div class="notif-title">Front Door Ringing</div>
          <div class="notif-subtitle">Tap to view live camera & answer</div>
        </div>
      </div>
      <div class="notif-action-hint">
        <span>Tap to Open</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;

    notif.addEventListener('click', () => {
      this.dismiss();
      if (this.onNotificationClick) this.onNotificationClick();
    });

    this.container.appendChild(notif);
    this.activeNotification = notif;

    // Auto dismiss after 20 seconds if ignored
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => {
      this.dismiss();
    }, 20000);
  }

  dismiss() {
    if (this.activeNotification && this.activeNotification.parentElement) {
      this.activeNotification.classList.remove('animate-slide-down');
      this.activeNotification.classList.add('animate-slide-up');
      setTimeout(() => {
        if (this.activeNotification && this.activeNotification.parentElement) {
          this.activeNotification.parentElement.removeChild(this.activeNotification);
        }
        this.activeNotification = null;
      }, 300);
    }
  }
}
