/**
 * Quick AI Voice Responses Component
 */
import React from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';

const PRESETS = [
  { id: '1', label: '📦 Leave at porch', text: 'Please leave the package by the front door. Thank you!' },
  { id: '2', label: '⏳ Coming in 1 min', text: 'Hello, I will be right there in one minute!' },
  { id: '3', label: '👋 Can I help you?', text: 'Hello! How can I help you today?' },
  { id: '4', label: '🚫 Not interested', text: 'No thank you, please have a nice day.' },
];

export const QuickVoiceReplies = () => {
  const handleSpeak = (item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Speech.speak(item.text, {
      language: 'en-US',
      pitch: 1.0,
      rate: 1.05,
    });

    // Send voice reply command to ESP32 physical speaker
    HomeAssistant.sendVoiceReply(item.id, item.text);

    HomeAssistant.addHistoryEvent({
      id: Date.now().toString(),
      type: 'ring',
      title: 'Voice Reply Sent',
      subtitle: `"${item.text}"`,
      time: 'Just now',
      status: 'Spoken via Intercom',
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerLabel}>QUICK AI VOICE REPLIES</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {PRESETS.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => handleSpeak(item)}
            activeOpacity={0.7}
            style={styles.chip}
          >
            <Text style={styles.chipText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
  },
  headerLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
  },
  chipText: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
});
