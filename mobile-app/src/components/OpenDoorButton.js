/**
 * Smart Gate Unlock Control Button ("OPEN DOOR")
 * Includes WiFi safety checks, mechanical animation, and haptic feedback.
 */
import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Unlock, Lock, Wifi } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';

export const OpenDoorButton = ({ onUnlocked }) => {
  const [status, setStatus] = useState('idle'); // 'idle' | 'unlocking' | 'unlocked'
  const [pin, setPin] = useState('');
  const [pinVisible, setPinVisible] = useState(false);

  const requestUnlock = () => {
    if (status !== 'idle') return;

    if (!HomeAssistant.isLocalWifi) {
      Alert.alert(
        'WiFi Verification Required',
        'For security, opening the gate is only authorized when connected to your Home WiFi network.'
      );
      return;
    }
    setPin('');
    setPinVisible(true);
  };

  const handlePress = async () => {
    setPinVisible(false);
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      setStatus('unlocking');

      await HomeAssistant.unlockGate(pin);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStatus('unlocked');
      if (onUnlocked) onUnlocked();

      setTimeout(() => {
        setStatus('idle');
      }, 8000);
    } catch (err) {
      setStatus('idle');
      Alert.alert('Gate Unlock Failed', err.message);
    }
  };

  const getButtonColors = () => {
    if (status === 'unlocking') return ['#f59e0b', '#d97706'];
    if (status === 'unlocked') return ['#3b82f6', '#1d4ed8'];
    return [Colors.accentEmerald, Colors.accentEmeraldDark];
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={requestUnlock}
      style={styles.wrapper}
    >
      <LinearGradient
        colors={getButtonColors()}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientContainer}
      >
        <View style={styles.leftGroup}>
          <View style={styles.iconCircle}>
            {status === 'unlocking' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : status === 'unlocked' ? (
              <Unlock color="#fff" size={24} strokeWidth={2.5} />
            ) : (
              <Unlock color="#fff" size={24} strokeWidth={2.5} />
            )}
          </View>
          <View>
            <Text style={styles.mainTitle}>
              {status === 'unlocking'
                ? 'UNLOCKING GATE...'
                : status === 'unlocked'
                ? 'GATE UNLOCKED'
                : 'OPEN DOOR / GATE'}
            </Text>
            <Text style={styles.subTitle}>
              {status === 'unlocked'
                ? 'Current burst dispatched (1.0s) • Auto-lock 8s'
                : 'Tap to trigger instant unlock burst'}
            </Text>
          </View>
        </View>

        <View style={styles.wifiPill}>
          <Wifi color="#fff" size={12} strokeWidth={2.5} />
          <Text style={styles.wifiText}>WiFi OK</Text>
        </View>
      </LinearGradient>
      <Modal visible={pinVisible} transparent animationType="fade" onRequestClose={() => setPinVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm gate unlock</Text>
            <Text style={styles.modalText}>Enter your owner PIN. The gate will not open if the doorbell is offline.</Text>
            <TextInput
              value={pin}
              onChangeText={setPin}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={12}
              placeholder="Owner PIN"
              placeholderTextColor="#708090"
              style={styles.pinInput}
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setPinVisible(false)} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePress} style={styles.confirmButton}>
                <Text style={styles.confirmText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 20,
    borderRadius: 22,
    shadowColor: Colors.accentEmerald,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  gradientContainer: {
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  leftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subTitle: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 12,
    marginTop: 2,
  },
  wifiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
  wifiText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  modalCard: {
    borderRadius: 20,
    padding: 20,
    backgroundColor: Colors.bgSecondary,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalText: { color: Colors.textSecondary, marginTop: 8, lineHeight: 20 },
  pinInput: {
    color: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    marginTop: 16,
    padding: 12,
    fontSize: 18,
    letterSpacing: 4,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 16 },
  cancelButton: { paddingHorizontal: 14, paddingVertical: 10 },
  confirmButton: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: Colors.accentEmerald },
  cancelText: { color: Colors.textSecondary, fontWeight: '700' },
  confirmText: { color: '#fff', fontWeight: '800' },
});
