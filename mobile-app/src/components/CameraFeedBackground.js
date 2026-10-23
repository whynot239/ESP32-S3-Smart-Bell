/**
 * Live Camera Stream Component with Security HUD Overlay
 * Used as the full-screen background for the incoming call screen and active intercom.
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';

const { width, height } = Dimensions.get('window');

export const CameraFeedBackground = ({ isNightVision = false, visitorType = 'Courier Delivery', customStreamUrl = null }) => {
  const [timeString, setTimeString] = useState('');
  const [fps, setFps] = useState(60);
  const [hasStreamError, setHasStreamError] = useState(false);

  // Use customStreamUrl if passed, or stored ESP32 CAM url from HomeAssistant service
  const streamUrl = customStreamUrl || HomeAssistant.esp32CamUrl;

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTimeString(now.toISOString().slice(0, 10) + ' ' + now.toTimeString().slice(0, 8));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.container}>
      {/* Real Hardware ESP32-CAM Stream Feed if configured */}
      {streamUrl && !hasStreamError ? (
        <Image
          source={{ uri: streamUrl }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onError={() => setHasStreamError(true)}
        />
      ) : (
        /* Fallback Simulation UI when hardware stream is offline or not configured */
        <>
          <LinearGradient
            colors={
              isNightVision
                ? ['#0a140d', '#132317', '#080d09']
                : ['#14171f', '#242a38', '#161922']
            }
            style={StyleSheet.absoluteFillObject}
          />
          <View style={styles.porchSlatWall} />
          <View style={styles.porchDoorFrame} />
        </>
      )}

      {/* AI Object Bounding Box (e.g. Courier with Package) */}
      <View style={styles.aiBoundingBox}>
        <View style={styles.aiTagBadge}>
          <Text style={styles.aiTagText}>PERSON (99%) • PACKAGE (96%)</Text>
        </View>
        <View style={[styles.cornerBracket, styles.bracketTL]} />
        <View style={[styles.cornerBracket, styles.bracketTR]} />
        <View style={[styles.cornerBracket, styles.bracketBL]} />
        <View style={[styles.cornerBracket, styles.bracketBR]} />
      </View>

      {/* Night Vision Scanlines / Tint */}
      {isNightVision && (
        <View style={styles.nightVisionOverlay}>
          <Text style={styles.irBadgeText}>⚡ IR NIGHT VISION ACTIVE</Text>
        </View>
      )}

      {/* Semi-Transparent Vignette Gradient */}
      <LinearGradient
        colors={[
          'rgba(7, 9, 14, 0.85)',
          'rgba(7, 9, 14, 0.1)',
          'rgba(7, 9, 14, 0.2)',
          'rgba(7, 9, 14, 0.95)'
        ]}
        style={StyleSheet.absoluteFillObject}
      />

      {/* Top Security Camera HUD Info */}
      <View style={styles.hudHeader}>
        <View style={styles.hudLeft}>
          <View style={styles.liveDot} />
          <Text style={styles.hudLiveText}>LIVE 4K HDR</Text>
        </View>
        <Text style={styles.hudTimeText}>{timeString}</Text>
      </View>

      {/* Bottom Telemetry HUD */}
      <View style={styles.hudFooter}>
        <Text style={styles.telemetryText}>
          CAM 01 // HAOS_FRONT_PORCH • 60 FPS • 4.2 MB/S • H.265
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  porchSlatWall: {
    position: 'absolute',
    left: 0,
    top: '15%',
    bottom: 0,
    width: '24%',
    backgroundColor: 'rgba(20, 24, 33, 0.9)',
    borderRightWidth: 2,
    borderRightColor: 'rgba(180, 130, 80, 0.3)',
  },
  porchDoorFrame: {
    position: 'absolute',
    right: 0,
    top: '10%',
    bottom: 0,
    width: '26%',
    backgroundColor: 'rgba(30, 36, 48, 0.85)',
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255, 255, 255, 0.1)',
  },
  aiBoundingBox: {
    position: 'absolute',
    top: '25%',
    left: '20%',
    width: '60%',
    height: '46%',
    borderColor: 'rgba(16, 185, 129, 0.8)',
  },
  aiTagBadge: {
    position: 'absolute',
    top: -24,
    left: 0,
    backgroundColor: Colors.accentEmerald,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  aiTagText: {
    color: '#061a12',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cornerBracket: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderColor: Colors.accentEmerald,
  },
  bracketTL: { top: 0, left: 0, borderTopWidth: 2.5, borderLeftWidth: 2.5 },
  bracketTR: { top: 0, right: 0, borderTopWidth: 2.5, borderRightWidth: 2.5 },
  bracketBL: { bottom: 0, left: 0, borderBottomWidth: 2.5, borderLeftWidth: 2.5 },
  bracketBR: { bottom: 0, right: 0, borderBottomWidth: 2.5, borderRightWidth: 2.5 },

  hudHeader: {
    position: 'absolute',
    top: 55,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  hudLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.liveRed,
  },
  hudLiveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  hudTimeText: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hudFooter: {
    position: 'absolute',
    bottom: 220,
    left: 20,
    zIndex: 10,
  },
  telemetryText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  nightVisionOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  irBadgeText: {
    color: Colors.accentEmerald,
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
});
