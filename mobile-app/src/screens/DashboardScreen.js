/**
 * Main Mobile Home Dashboard Screen
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell,
  Lock,
  Unlock,
  Video,
  Settings,
  History,
  Shield,
  Wifi,
  Sun,
  Activity,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';
import { NotificationManager } from '../api/notifications';

export const DashboardScreen = ({ navigation }) => {
  const [entities, setEntities] = useState(HomeAssistant.entities);
  const [history, setHistory] = useState(HomeAssistant.history);

  useEffect(() => {
    const unsub = HomeAssistant.subscribe((newEntities, newHistory) => {
      setEntities({ ...newEntities });
      setHistory([...newHistory]);
    });
    return unsub;
  }, []);

  const isGateUnlocked = entities['lock.front_gate']?.state === 'unlocked';
  const isLightOn = entities['switch.porch_light']?.state === 'on';

  const handleQuickUnlock = async () => {
    Alert.alert('Owner PIN required', 'Open an active intercom call to enter your owner PIN before unlocking the gate.');
  };

  const handleToggleLight = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    HomeAssistant.callService('switch', 'toggle', { entity_id: 'switch.porch_light' });
  };

  const handleTestRing = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    HomeAssistant.triggerRingSimulation();
    NotificationManager.triggerRingAlert('Courier Delivery (Package)');
    // Auto navigate to incoming call screen
    navigation.navigate('IncomingCall');
  };

  const handleTestLockScreen = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(
      "⏱️ Lock Screen Now!",
      "A test doorbell notification will arrive in 5 seconds. Press your phone's power button to lock your screen right now and verify sound + vibration!",
      [
        {
          text: "Start 5s Timer",
          onPress: async () => {
            await NotificationManager.scheduleDelayedAlert(5, 'Visitor at Front Porch');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />

      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.brandRow}>
            <Shield color={Colors.accentBlue} size={16} />
            <Text style={styles.brandText}>HOME ASSISTANT</Text>
          </View>
          <Text style={styles.greetingTitle}>Front Entrance</Text>
        </View>

        <View style={styles.headerIcons}>
          <TouchableOpacity
            onPress={() => navigation.navigate('EventHistory')}
            style={styles.iconBtn}
          >
            <History color="#fff" size={20} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Settings')}
            style={styles.iconBtn}
          >
            <Settings color="#fff" size={20} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* Live Camera Preview Card */}
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => navigation.navigate('ActiveIntercom')}
          style={styles.cameraCard}
        >
          <View style={styles.cameraCardBg}>
            {HomeAssistant.esp32CamUrl ? (
              <Image
                source={{ uri: HomeAssistant.esp32CamUrl }}
                style={[StyleSheet.absoluteFillObject, { opacity: 0.65 }]}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.camLiveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.camLiveText}>LIVE CAMERA STREAM</Text>
            </View>
            <View style={styles.camCenterHint}>
              <Video color="#fff" size={32} />
              <Text style={styles.camTapText}>Tap to View Live Feed</Text>
            </View>
            <Text style={styles.camFooterText}>
              CAM 01 // {HomeAssistant.esp32CamUrl ? 'ESP32-CAM STREAM' : '60 FPS • 1080p HDR'}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Test Ring Simulation Trigger */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleTestRing}
          style={styles.testRingCard}
        >
          <View style={styles.ringLeft}>
            <View style={styles.ringIconBox}>
              <Bell color="#fff" size={22} />
            </View>
            <View>
              <Text style={styles.ringTitle}>Simulate Doorbell Ring</Text>
              <Text style={styles.ringSub}>Test push alert & live call screen</Text>
            </View>
          </View>
          <View style={styles.ringBtnPill}>
            <Text style={styles.ringBtnText}>RING</Text>
          </View>
        </TouchableOpacity>

        {/* Test Lock Screen Alert (5s Delay) */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleTestLockScreen}
          style={[styles.testRingCard, { borderColor: 'rgba(59, 130, 246, 0.4)', backgroundColor: 'rgba(59, 130, 246, 0.08)', marginTop: 8 }]}
        >
          <View style={styles.ringLeft}>
            <View style={[styles.ringIconBox, { backgroundColor: '#3b82f6' }]}>
              <Bell color="#fff" size={20} />
            </View>
            <View>
              <Text style={styles.ringTitle}>Test Lock-Screen Alert</Text>
              <Text style={styles.ringSub}>5s delay — lock phone to test sound & vibrate</Text>
            </View>
          </View>
          <View style={[styles.ringBtnPill, { backgroundColor: '#3b82f6' }]}>
            <Text style={styles.ringBtnText}>5s TIMER</Text>
          </View>
        </TouchableOpacity>

        {/* Smart Gate Lock Status Card */}
        <View style={styles.widgetCard}>
          <View style={styles.widgetHeader}>
            <View style={styles.widgetTitleGroup}>
              <Lock color={Colors.accentBlue} size={20} />
              <Text style={styles.widgetTitle}>Front Gate Lock</Text>
            </View>
            <View
              style={[
                styles.lockStatusBadge,
                isGateUnlocked ? styles.badgeUnlocked : styles.badgeLocked,
              ]}
            >
              <Text
                style={[
                  styles.lockStatusText,
                  isGateUnlocked ? styles.textUnlocked : styles.textLocked,
                ]}
              >
                {isGateUnlocked ? 'UNLOCKED' : 'LOCKED'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleQuickUnlock}
            style={[
              styles.btnQuickUnlock,
              isGateUnlocked && styles.btnQuickUnlocked,
            ]}
          >
            {isGateUnlocked ? (
              <Unlock color="#34d399" size={20} />
            ) : (
              <Lock color="#fff" size={20} />
            )}
            <Text
              style={[
                styles.quickUnlockText,
                isGateUnlocked && { color: '#34d399' },
              ]}
            >
              {isGateUnlocked ? 'Gate Unlocked (Auto-Relock)' : 'Open Door / Gate'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Quick Toggles Row */}
        <View style={styles.quickRow}>
          <TouchableOpacity
            onPress={handleToggleLight}
            style={[styles.smallTile, isLightOn && styles.smallTileActive]}
          >
            <Sun color={isLightOn ? '#fbbf24' : Colors.textSecondary} size={22} />
            <Text style={styles.smallTileTitle}>Porch Light</Text>
            <Text style={styles.smallTileSub}>{isLightOn ? 'ON' : 'OFF'}</Text>
          </TouchableOpacity>

          <View style={styles.smallTile}>
            <Wifi color={Colors.wifiActive} size={22} />
            <Text style={styles.smallTileTitle}>WiFi Security</Text>
            <Text style={styles.smallTileSub}>Home_5GHz_IoT</Text>
          </View>
        </View>

        {/* Recent Activity Section */}
        <View style={styles.activitySection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>RECENT ACTIVITY</Text>
            <TouchableOpacity onPress={() => navigation.navigate('EventHistory')}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>

          {history.slice(0, 3).map((item) => (
            <View key={item.id} style={styles.activityItem}>
              <View style={styles.activityLeft}>
                <View
                  style={[
                    styles.activityIconBox,
                    item.type === 'ring'
                      ? styles.iconRing
                      : item.type === 'unlock'
                      ? styles.iconUnlock
                      : styles.iconMotion,
                  ]}
                >
                  {item.type === 'ring' ? (
                    <Bell color="#60a5fa" size={18} />
                  ) : item.type === 'unlock' ? (
                    <Unlock color="#34d399" size={18} />
                  ) : (
                    <Activity color="#fbbf24" size={18} />
                  )}
                </View>
                <View>
                  <Text style={styles.actTitle}>{item.title}</Text>
                  <Text style={styles.actSub}>{item.subtitle || item.status}</Text>
                </View>
              </View>
              <Text style={styles.actTime}>{item.time}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandText: {
    color: Colors.accentBlue,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  greetingTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  headerIcons: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBody: {
    padding: 20,
    gap: 16,
  },
  cameraCard: {
    borderRadius: 24,
    overflow: 'hidden',
    height: 180,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  cameraCardBg: {
    flex: 1,
    backgroundColor: '#151924',
    padding: 16,
    justifyContent: 'space-between',
  },
  camLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.liveRed,
  },
  camLiveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  camCenterHint: {
    alignItems: 'center',
    gap: 6,
  },
  camTapText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    fontWeight: '600',
  },
  camFooterText: {
    color: Colors.textMuted,
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  testRingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(59, 130, 246, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
    borderRadius: 20,
    padding: 16,
  },
  ringLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ringIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  ringSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  ringBtnPill: {
    backgroundColor: Colors.accentBlue,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
  },
  ringBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },

  widgetCard: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 22,
    padding: 18,
    gap: 14,
  },
  widgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  widgetTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  widgetTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  lockStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeLocked: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  badgeUnlocked: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  lockStatusText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  textLocked: { color: Colors.textSecondary },
  textUnlocked: { color: '#34d399' },

  btnQuickUnlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    paddingVertical: 14,
    borderRadius: 16,
  },
  btnQuickUnlocked: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  quickUnlockText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },

  quickRow: {
    flexDirection: 'row',
    gap: 12,
  },
  smallTile: {
    flex: 1,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 20,
    padding: 16,
    gap: 4,
  },
  smallTileActive: {
    borderColor: 'rgba(251, 191, 36, 0.4)',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
  },
  smallTileTitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  smallTileSub: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },

  activitySection: {
    gap: 10,
    marginTop: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  viewAllText: {
    color: Colors.accentBlue,
    fontSize: 12,
    fontWeight: '600',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 12,
    borderRadius: 16,
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  activityIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
  iconUnlock: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  iconMotion: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  actTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  actSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  actTime: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
