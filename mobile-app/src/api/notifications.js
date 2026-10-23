/**
 * Push Notifications & Chime Alert Manager for Expo Mobile App
 * Supports Lock Screen / Heads-Up notifications with system sound & vibration
 * Fully compatible with Expo Go on Android & iOS without ExponentAV dependency
 */
import appConfig from '../../app.json';
import { AppState, Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

class NotificationService {
  constructor() {
    this.notificationsModule = null;
    this.ready = this.init();
  }

  async init() {
    try {
      this.notificationsModule = require('expo-notifications');

      // 1. Configure foreground presentation handler
      if (this.notificationsModule?.setNotificationHandler) {
        this.notificationsModule.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: AppState.currentState !== "active",
            shouldShowList: AppState.currentState !== "active",
            shouldPlaySound: AppState.currentState !== "active",
            shouldSetBadge: true,
          }),
        });
      }

      // 2. Request Android 13+ (POST_NOTIFICATIONS) and iOS permissions
      if (this.notificationsModule?.requestPermissionsAsync) {
        const { status } = await this.notificationsModule.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
            allowAnnouncements: true,
          },
        });
        console.log('📱 Notification permission status:', status);
      }

      // 3. Create high-importance Android Notification Channel (Required for heads-up & lock screen sound/vibrate)
      if (Platform.OS === 'android' && this.notificationsModule?.setNotificationChannelAsync) {
        await this.notificationsModule.setNotificationChannelAsync('doorbell-ring', {
          name: 'Doorbell Ring Alerts',
          description: 'High-priority doorbell alerts that wake screen and sound on lock screen',
          importance: this.notificationsModule.AndroidImportance.MAX,
          vibrationPattern: [0, 500, 250, 500, 250, 500],
          lightColor: '#3b82f6',
          lockscreenVisibility: this.notificationsModule.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          bypassDnd: true,
          enableVibrate: true,
          showBadge: true,
        });
        console.log('✅ Android Notification Channel [doorbell-ring] created with MAX importance');
      }
    } catch (e) {
      console.log('ℹ️ [Notifications] Init note:', e.message);
    }
  }

  async getPushToken() {
    await this.ready;
    const notifications=this.notificationsModule;
    if (!notifications?.getExpoPushTokenAsync) throw new Error('Push notifications require a configured native app build.');
    const permissions=await notifications.getPermissionsAsync();
    if (permissions.status !== 'granted') throw new Error('Notification permission is not enabled.');
    return (await notifications.getExpoPushTokenAsync({projectId:appConfig.expo.extra.eas.projectId})).data;
  }

  setupResponseListener(callback) {
    if (this.notificationsModule?.addNotificationResponseReceivedListener) {
      return this.notificationsModule.addNotificationResponseReceivedListener((response) => {
        const screen = response?.notification?.request?.content?.data?.screen;
        if (screen && callback) {
          callback(screen);
        }
      });
    }
    return null;
  }

  async triggerRingAlert(visitor = 'Visitor at Front Porch') {
    console.log('🔔 [ALERT] Triggering Ring Alert with sound and vibration!');

    // 1. Strong Repeating Doorbell Vibration Pattern
    try {
      // 4-pulse distinct doorbell vibration pattern: wait 0ms, vibrate 600ms, wait 250ms, vibrate 600ms...
      Vibration.vibrate([0, 600, 250, 600, 250, 600, 250, 600]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch (e) {
      console.log('Vibration error:', e.message);
    }

    // 2. Display High-Priority Lock Screen / Heads-Up System Notification Banner with sound
    try {
      if (this.notificationsModule?.scheduleNotificationAsync) {
        await this.notificationsModule.scheduleNotificationAsync({
          content: {
            title: '🔔 Doorbell Ringing — Front Entrance',
            body: `${visitor}. Tap to answer live video intercom.`,
            data: { screen: 'IncomingCall' },
            sound: 'default',
            vibrate: [0, 600, 250, 600, 250, 600],
            priority: this.notificationsModule.AndroidNotificationPriority?.MAX || 'max',
            channelId: 'doorbell-ring',
            color: '#3b82f6',
          },
          trigger: null, // deliver immediately
        });
        console.log('✅ Lock screen / heads-up notification scheduled successfully');
      }
    } catch (e) {
      console.log('Local alert notification notice:', e.message);
    }
  }

  async checkPermissionStatus() {
    try {
      if (this.notificationsModule?.getPermissionsAsync) {
        const settings = await this.notificationsModule.getPermissionsAsync();
        return settings.granted || settings.status === 'granted';
      }
      return true;
    } catch {
      return false;
    }
  }

  async requestPermissions() {
    try {
      if (this.notificationsModule?.requestPermissionsAsync) {
        const settings = await this.notificationsModule.requestPermissionsAsync({
          ios: { allowAlert: true, allowBadge: true, allowSound: true },
        });
        return settings.granted || settings.status === 'granted';
      }
      return true;
    } catch (e) {
      console.log('Permission request error:', e.message);
      return false;
    }
  }

  async scheduleDelayedAlert(delaySeconds = 5, visitor = 'Visitor at Front Porch') {
    try {
      if (this.notificationsModule?.scheduleNotificationAsync) {
        await this.notificationsModule.scheduleNotificationAsync({
          content: {
            title: '🔔 Doorbell Ringing — Front Entrance',
            body: `${visitor}. Tap to answer live video intercom.`,
            data: { screen: 'IncomingCall' },
            sound: 'default',
            vibrate: [0, 600, 250, 600, 250, 600],
            priority: this.notificationsModule.AndroidNotificationPriority?.MAX || 'max',
            channelId: 'doorbell-ring',
            color: '#3b82f6',
          },
          trigger: {
            type: 'timeInterval',
            seconds: delaySeconds,
            channelId: 'doorbell-ring',
          },
        });
        console.log(`✅ Delayed alert scheduled for ${delaySeconds}s (Lock screen test)`);
        return true;
      }
    } catch (e) {
      console.log('Delayed alert schedule error:', e.message);
    }
    return false;
  }
}

export const NotificationManager = new NotificationService();
