/**
 * Doorbell Activity Log & Event History Screen
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Bell, Unlock, Activity, Filter } from 'lucide-react-native';
import { Colors } from '../theme/colors';
import { HomeAssistant } from '../api/homeAssistant';

export const EventHistoryScreen = ({ navigation }) => {
  const [history, setHistory] = useState(HomeAssistant.history);
  const [filter, setFilter] = useState('all'); // 'all' | 'ring' | 'unlock' | 'motion'

  useEffect(() => {
    const unsub = HomeAssistant.subscribe((_, newHist) => {
      setHistory([...newHist]);
    });
    return unsub;
  }, []);

  const filteredData = history.filter((item) => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.bgPrimary} />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <ArrowLeft color="#fff" size={22} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Activity & Event Log</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {['all', 'ring', 'unlock', 'motion'].map((f) => (
          <TouchableOpacity
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
          >
            <Text
              style={[
                styles.filterText,
                filter === f && styles.filterTextActive,
              ]}
            >
              {f === 'all' ? 'All Events' : f === 'ring' ? 'Rings' : f === 'unlock' ? 'Unlocks' : 'Motion'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Event List */}
      <FlatList
        data={filteredData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <View style={styles.itemCard}>
            <View style={styles.itemLeft}>
              <View
                style={[
                  styles.iconBox,
                  item.type === 'ring'
                    ? styles.iconRing
                    : item.type === 'unlock'
                    ? styles.iconUnlock
                    : styles.iconMotion,
                ]}
              >
                {item.type === 'ring' ? (
                  <Bell color="#60a5fa" size={20} />
                ) : item.type === 'unlock' ? (
                  <Unlock color="#34d399" size={20} />
                ) : (
                  <Activity color="#fbbf24" size={20} />
                )}
              </View>
              <View>
                <Text style={styles.itemTitle}>{item.title}</Text>
                <Text style={styles.itemSub}>{item.subtitle}</Text>
                <Text style={styles.itemStatus}>{item.status}</Text>
              </View>
            </View>
            <Text style={styles.itemTime}>{item.time}</Text>
          </View>
        )}
      />
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
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginVertical: 12,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: Colors.borderGlass,
  },
  filterChipActive: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
    borderColor: Colors.accentBlue,
  },
  filterText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterTextActive: {
    color: '#93c5fd',
    fontWeight: '700',
  },
  listContent: {
    padding: 20,
    gap: 10,
  },
  itemCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.borderGlass,
    padding: 14,
    borderRadius: 18,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: { backgroundColor: 'rgba(59, 130, 246, 0.15)' },
  iconUnlock: { backgroundColor: 'rgba(16, 185, 129, 0.15)' },
  iconMotion: { backgroundColor: 'rgba(245, 158, 11, 0.15)' },
  itemTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  itemSub: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  itemStatus: {
    color: '#38bdf8',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 3,
  },
  itemTime: {
    color: Colors.textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
