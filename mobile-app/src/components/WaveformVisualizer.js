/**
 * Animated Audio Waveform Equalizer Component
 */
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Colors } from '../theme/colors';

export const WaveformVisualizer = ({ isActive = true, isMuted = false }) => {
  const [animations] = useState(() =>
    Array.from({ length: 14 }).map(() => new Animated.Value(6))
  );

  useEffect(() => {
    if (!isActive || isMuted) {
      animations.forEach((anim) => anim.setValue(6));
      return;
    }

    const interval = setInterval(() => {
      animations.forEach((anim, i) => {
        const targetHeight = Math.floor(Math.random() * 26) + 8;
        Animated.timing(anim, {
          toValue: targetHeight,
          duration: 90,
          useNativeDriver: false,
        }).start();
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isActive, isMuted]);

  return (
    <View style={styles.container}>
      {animations.map((anim, index) => (
        <Animated.View
          key={index}
          style={[
            styles.bar,
            {
              height: anim,
              backgroundColor: isMuted
                ? Colors.textMuted
                : Colors.accentEmerald,
            },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 20, 32, 0.8)',
    borderRadius: 20,
    paddingHorizontal: 16,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
});
