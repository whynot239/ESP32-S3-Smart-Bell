/**
 * Active Two-Way Video/Audio Intercom Screen
 * Provides live stream viewing, mic communication, quick voice replies, and gate unlock.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Mic,
  MicOff,
  PhoneOff,
  Moon,
  Sun,
  Camera,
  User,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CameraFeedBackground } from '../components/CameraFeedBackground';
import { WaveformVisualizer } from '../components/WaveformVisualizer';
import { OpenDoorButton } from '../components/OpenDoorButton';
import { QuickVoiceReplies } from '../components/QuickVoiceReplies';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';

export const ActiveIntercomScreen = ({ navigation }) => {
  const [seconds, setSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isNightVision, setIsNightVision] = useState(false);
  const [isLightOn, setIsLightOn] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (s) => {
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleEndCall = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.navigate('Dashboard');
  };

  const handleToggleMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsMuted((prev) => !prev);
  };

  const handleToggleNightVision = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsNightVision((prev) => !prev);
  };

  const handleToggleLight = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    HomeAssistant.callService('switch', 'toggle', { entity_id: 'switch.porch_light' });
    setIsLightOn((prev) => !prev);
  };

  const handleSnapshot = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Snapshot Saved', 'High-resolution security frame saved to event history.');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* Main Live Stream Viewport */}
      <View style={styles.videoViewport}>
        <CameraFeedBackground isNightVision={isNightVision} />

        {/* Top Floating HUD Bar */}
        <SafeAreaView style={styles.topHudBar}>
          <View style={styles.timerPill}>
            <View style={styles.recDot} />
            <Text style={styles.timerText}>{formatTimer(seconds)}</Text>
          </View>

          <View style={styles.miniControlsRow}>
            <TouchableOpacity
              onPress={handleToggleNightVision}
              style={[styles.btnMini, isNightVision && styles.btnMiniActive]}
            >
              <Moon color="#fff" size={18} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleToggleLight}
              style={[styles.btnMini, isLightOn && styles.btnMiniActive]}
            >
              <Sun color="#fff" size={18} />
            </TouchableOpacity>

            <TouchableOpacity onPress={handleSnapshot} style={styles.btnMini}>
              <Camera color="#fff" size={18} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Picture in Picture Preview */}
        <View style={styles.pipUserBox}>
          <User color={Colors.textSecondary} size={20} />
          <Text style={styles.pipText}>You (Mic)</Text>
        </View>
      </View>

      {/* Real-Time Waveform Equalizer */}
      <View style={styles.waveformWrapper}>
        <WaveformVisualizer isActive={true} isMuted={isMuted} />
      </View>

      {/* Controls Drawer */}
      <View style={styles.bottomDrawer}>
        {/* SMART GATE UNLOCK BUTTON */}
        <OpenDoorButton />

        {/* Quick Voice Replies */}
        <QuickVoiceReplies />

        {/* Call Action Row */}
        <View style={styles.callActionsRow}>
          {/* Mute Mic */}
          <TouchableOpacity
            onPress={handleToggleMic}
            style={[styles.circleBtn, isMuted && styles.circleBtnMuted]}
          >
            {isMuted ? (
              <MicOff color={Colors.accentRose} size={24} />
            ) : (
              <Mic color="#fff" size={24} />
            )}
          </TouchableOpacity>

          {/* End Call */}
          <TouchableOpacity
            onPress={handleEndCall}
            style={[styles.circleBtn, styles.circleBtnEnd]}
          >
            <PhoneOff color="#fff" size={28} strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgPrimary,
  },
  videoViewport: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000',
  },
  topHudBar: {
    position: 'absolute',
    top: 30,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 20,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  recDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.liveRed,
  },
  timerText: {
    color: Colors.accentEmerald,
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  miniControlsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  btnMini: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnMiniActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.4)',
    borderColor: Colors.accentBlue,
  },
  pipUserBox: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    width: 85,
    height: 110,
    borderRadius: 16,
    backgroundColor: 'rgba(20, 26, 40, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    zIndex: 15,
  },
  pipText: {
    color: Colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  waveformWrapper: {
    paddingVertical: 6,
    backgroundColor: Colors.bgSecondary,
  },
  bottomDrawer: {
    backgroundColor: Colors.bgSecondary,
    paddingBottom: 40,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderGlass,
  },
  callActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 30,
    marginTop: 10,
  },
  circleBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleBtnMuted: {
    backgroundColor: 'rgba(244, 63, 94, 0.2)',
    borderColor: Colors.accentRose,
  },
  circleBtnEnd: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accentRose,
    borderWidth: 0,
  },
});
