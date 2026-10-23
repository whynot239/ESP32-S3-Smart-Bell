/**
 * Settings & Home Assistant Connection Screen
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Server, Key, Wifi, Bell, Check, Shield, Camera } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';
import { NotificationManager } from '../api/notifications';

export const SettingsScreen = ({ navigation }) => {
  const [serverUrl, setServerUrl] = useState(HomeAssistant.serverUrl);
  const [token, setToken] = useState(HomeAssistant.token);
  const [esp32CamUrl, setEsp32CamUrl] = useState(HomeAssistant.esp32CamUrl);
  const [isWifi, setIsWifi] = useState(HomeAssistant.isLocalWifi);

  const handleSave = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    HomeAssistant.serverUrl = serverUrl;
    HomeAssistant.token = token;
    HomeAssistant.esp32CamUrl = esp32CamUrl;
    await AsyncStorage.setItem('ha_server_url', serverUrl);
    await AsyncStorage.setItem('ha_token', token);
    await AsyncStorage.setItem('esp32_cam_url', esp32CamUrl);
    HomeAssistant.connectWebSocket();
    Alert.alert('Settings Saved', 'Doorbell & ESP32-CAM connection updated.');
  };

  const handleToggleWifi = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const updated = HomeAssistant.toggleWifi();
    setIsWifi(updated);
  };

  const [notifGranted, setNotifGranted] = useState(null);

  React.useEffect(() => {
    NotificationManager.checkPermissionStatus().then(granted => setNotifGranted(granted));
  }, []);

  const handleRequestPermissions = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const granted = await NotificationManager.requestPermissions();
    setNotifGranted(granted);
    if (granted) {
      Alert.alert("✅ Notifications Enabled", "Lock-screen alerts with sound and vibration are active!");
    } else {
      Alert.alert(
        "Notification Permission Required",
        "Notifications are blocked in your phone settings. Open Phone Settings > Apps > Expo Go > Notifications and enable 'Allow notifications'.",
        [
          { text: "Cancel" },
          { text: "Open Phone Settings", onPress: () => Linking.openSettings() }
        ]
      );
    }
  };

  const handleAutoFillPcHub = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setServerUrl('http://192.168.1.100:3000');
    setEsp32CamUrl('http://192.168.1.100:3000');
    setToken('local-hub-token');
    Alert.alert('Configured for Local Hub', 'Set to http://192.168.1.100:3000. Edit the IP to match your PC if different, then tap (✓) to save!');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>System Settings</Text>
        <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
          <Check color="#fff" size={20} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody}>
        {/* Quick PC Hub Link Button */}
        <TouchableOpacity
          onPress={handleAutoFillPcHub}
          style={{
            marginBottom: 16,
            paddingVertical: 12,
            paddingHorizontal: 16,
            backgroundColor: 'rgba(59, 130, 246, 0.2)',
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: '#3b82f6',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <Server color="#93c5fd" size={18} />
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 14 }}>
            Set Local PC Hub (192.168.1.X:3000)
          </Text>
        </TouchableOpacity>

        {/* Home Assistant OS Config Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Server color={Colors.accentBlue} size={20} />
            <Text style={styles.cardTitle}>Hub / Local PC Server</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>SERVER URL</Text>
            <TextInput
              style={styles.input}
              value={serverUrl}
              onChangeText={setServerUrl}
              placeholder="http://192.168.1.100:3000"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ACCESS TOKEN</Text>
            <TextInput
              style={[styles.input, { height: 75 }]}
              value={token}
              onChangeText={setToken}
              placeholder="Paste token or leave default..."
              placeholderTextColor={Colors.textMuted}
              multiline
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* ESP32-CAM Hardware Feed Config Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Camera color={Colors.accentEmerald} size={20} />
            <Text style={styles.cardTitle}>ESP32-CAM Video Stream</Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ESP32-CAM STREAM OR SNAPSHOT URL</Text>
            <TextInput
              style={styles.input}
              value={esp32CamUrl}
              onChangeText={setEsp32CamUrl}
              placeholder="e.g. http://192.168.1.50:81/stream or http://192.168.1.50/capture"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="none"
            />
          </View>
          <Text style={styles.cardDesc}>
            Enter your ESP32-CAM IP stream URL or Home Assistant camera proxy URL to display the live physical camera feed in the intercom and incoming call screens.
          </Text>
        </View>

        {/* Doorbell Notifications & Lock-Screen Status Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Bell color={Colors.accentRose} size={20} />
            <Text style={styles.cardTitle}>Lock-Screen & Ring Alerts</Text>
          </View>

          <Text style={styles.cardDesc}>
            Enables high-priority heads-up banners, screen wake-up, sound, and vibration when the doorbell rings while your phone is locked.
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, marginBottom: 12 }}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Permission Status:</Text>
            <View style={[styles.pill, notifGranted ? styles.pillOn : styles.pillOff]}>
              <Text style={styles.pillText}>{notifGranted ? 'ACTIVE ✅' : 'NOT GRANTED ⚠️'}</Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleRequestPermissions}
            style={{
              paddingVertical: 12,
              paddingHorizontal: 16,
              backgroundColor: notifGranted ? 'rgba(52, 211, 153, 0.15)' : 'rgba(244, 63, 94, 0.18)',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: notifGranted ? '#34d399' : '#f43f5e',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: notifGranted ? '#34d399' : '#fda4af', fontWeight: 'bold', fontSize: 13 }}>
              {notifGranted ? '✓ Notification Permissions Enabled' : '🔔 Enable Notification Permissions'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* WiFi Safety Policy Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Wifi color={Colors.wifiActive} size={20} />
            <Text style={styles.cardTitle}>Network & Gate Security</Text>
          </View>

          <Text style={styles.cardDesc}>
            "Open Door" gate unlock action requires a verified local WiFi connection to prevent accidental remote unlocks.
          </Text>

          <TouchableOpacity
            onPress={handleToggleWifi}
            style={[
              styles.wifiToggleCard,
              isWifi ? styles.wifiOn : styles.wifiOff,
            ]}
          >
            <View>
              <Text style={styles.wifiToggleTitle}>
                {isWifi ? 'Home WiFi (5GHz) Connected' : 'Cellular 5G (Remote Relay)'}
              </Text>
              <Text style={styles.wifiToggleSub}>
                {isWifi ? 'Gate unlock authorized' : 'Gate unlock locked for safety'}
              </Text>
            </View>
            <View style={[styles.pill, isWifi ? styles.pillOn : styles.pillOff]}>
              <Text style={styles.pillText}>{isWifi ? 'LOCAL' : 'REMOTE'}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Entity IDs & Diagnostics */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Shield color={Colors.accentEmerald} size={20} />
            <Text style={styles.cardTitle}>Connected Entities</Text>
          </View>

          <View style={styles.entityRow}>
            <Text style={styles.entityName}>Ring Sensor:</Text>
            <Text style={styles.entityId}>binary_sensor.front_doorbell_ring</Text>
          </View>
          <View style={styles.entityRow}>
            <Text style={styles.entityName}>Camera Entity:</Text>
            <Text style={styles.entityId}>camera.front_doorbell_live</Text>
          </View>
          <View style={styles.entityRow}>
            <Text style={styles.entityName}>Gate Lock:</Text>
            <Text style={styles.entityId}>lock.front_gate</Text>
          </View>
          <View style={styles.entityRow}>
            <Text style={styles.entityName}>Porch Light:</Text>
            <Text style={styles.entityId}>switch.porch_light</Text>
          </View>
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
    paddingVertical: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.accentBlue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  scrollBody: {
    padding: 20,
    gap: 16,
  },
  card: {
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  cardTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  cardDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  wifiToggleCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 6,
  },
  wifiOn: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  wifiOff: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    borderColor: 'rgba(244, 63, 94, 0.3)',
  },
  wifiToggleTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  wifiToggleSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pillOn: { backgroundColor: Colors.accentEmerald },
  pillOff: { backgroundColor: Colors.accentRose },
  pillText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  entityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  entityName: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  entityId: {
    color: '#60a5fa',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
