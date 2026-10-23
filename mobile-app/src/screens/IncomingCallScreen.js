/**
 * Full-Screen Incoming Doorbell Call Screen
 * Displays live camera feed from the doorbell in the background with Answer and Decline actions.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  StatusBar,
} from 'react-native';
import { PhoneCall, PhoneOff, Shield, Wifi } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { CameraFeedBackground } from '../components/CameraFeedBackground';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';

export const IncomingCallScreen = ({ navigation, route }) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Pulsating animation on the Answer button
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Trigger ring haptics
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const handleAnswer = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    HomeAssistant.addHistoryEvent({
      id: Date.now().toString(),
      type: 'ring',
      title: 'Call Answered',
      subtitle: '2-Way Audio Connected',
      time: 'Just now',
      status: 'In Progress',
    });
    navigation.replace('ActiveIntercom');
  };

  const handleDecline = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    HomeAssistant.addHistoryEvent({
      id: Date.now().toString(),
      type: 'ring',
      title: 'Call Declined',
      subtitle: 'Declined by Homeowner',
      time: 'Just now',
      status: 'Missed',
    });
    navigation.navigate('Dashboard');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      {/* 1. LIVE CAMERA FEED BACKGROUND */}
      <CameraFeedBackground visitorType="Courier Delivery" />

      {/* 2. Top Header Info */}
      <View style={styles.headerContainer}>
        <View style={styles.haBadge}>
          <Shield color="#60a5fa" size={14} strokeWidth={2.5} />
          <Text style={styles.haBadgeText}>HOME ASSISTANT • FRONT DOOR</Text>
        </View>

        <Text style={styles.callerTitle}>Front Doorbell</Text>

        <View style={styles.ringingStatusPill}>
          <View style={styles.statusDot} />
          <Text style={styles.ringingText}>Incoming Ringing...</Text>
        </View>

        <View style={styles.wifiRow}>
          <Wifi color="rgba(255,255,255,0.7)" size={13} />
          <Text style={styles.wifiText}>Connected via Home_5GHz_IoT</Text>
        </View>
      </View>

      {/* 3. Bottom Action Panel: Answer & Decline Buttons */}
      <View style={styles.bottomActionsContainer}>
        <View style={styles.buttonsRow}>
          {/* DECLINE BUTTON */}
          <View style={styles.actionColumn}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleDecline}
              style={[styles.callButtonCircle, styles.declineButton]}
            >
              <PhoneOff color="#fff" size={32} strokeWidth={2.5} />
            </TouchableOpacity>
            <Text style={styles.buttonLabel}>Decline</Text>
          </View>

          {/* ANSWER BUTTON WITH PULSATING HALO */}
          <View style={styles.actionColumn}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleAnswer}
                style={[styles.callButtonCircle, styles.answerButton]}
              >
                <PhoneCall color="#fff" size={34} strokeWidth={2.5} />
              </TouchableOpacity>
            </Animated.View>
            <Text style={styles.buttonLabel}>Answer</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'space-between',
  },
  headerContainer: {
    paddingTop: 80,
    alignItems: 'center',
    zIndex: 20,
  },
  haBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  haBadgeText: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  callerTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: -0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  ringingStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accentEmerald,
  },
  ringingText: {
    color: Colors.accentEmerald,
    fontSize: 15,
    fontWeight: '700',
  },
  wifiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  wifiText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
    fontWeight: '500',
  },

  bottomActionsContainer: {
    paddingBottom: 60,
    zIndex: 20,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  actionColumn: {
    alignItems: 'center',
    gap: 12,
  },
  callButtonCircle: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 18,
    elevation: 10,
  },
  declineButton: {
    backgroundColor: Colors.accentRose,
    shadowColor: Colors.accentRose,
  },
  answerButton: {
    backgroundColor: Colors.accentEmerald,
    shadowColor: Colors.accentEmerald,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
