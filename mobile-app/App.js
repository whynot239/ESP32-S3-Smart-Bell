import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { doorbellClient } from './src/api/doorbellClient';
import { NotificationManager } from './src/api/notifications';

const DEFAULT_URL = 'https://smart-bell-app.onrender.com';
const PIN_PATTERN = /^\d{6,12}$/;

function Setup({ config, onDone }) {
  const [serverUrl, setServerUrl] = useState(config?.serverUrl || DEFAULT_URL);
  const [token, setToken] = useState(config?.token || '');
  const [username, setUsername] = useState(config?.username || 'owner');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!/^https?:\/\/.+/.test(serverUrl.trim()) || !token.trim()) {
      Alert.alert('Connection details needed', 'Enter your Render URL and MOBILE_WS_TOKEN value.');
      return;
    }
    setSaving(true);
    try {
      const next = { serverUrl: serverUrl.trim().replace(/\/+$/, ''), token: token.trim(), username: username.trim() || 'owner' };
      await doorbellClient.saveConfig(next);
      onDone(next);
    } catch (error) { Alert.alert('Could not connect', error.message); }
    finally { setSaving(false); }
  };
  return <View style={styles.setup}>
    <Text style={styles.brand}>SMART DOORBELL</Text>
    <Text style={styles.setupTitle}>Your entrance,{`\n`}in one place.</Text>
    <Text style={styles.setupText}>Connect your phone to your private doorbell service.</Text>
    <Text style={styles.label}>SERVER URL</Text>
    <TextInput value={serverUrl} onChangeText={setServerUrl} style={styles.input} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://your-app.onrender.com" placeholderTextColor="#66758a" />
    <Text style={styles.label}>OWNER USERNAME</Text>
    <TextInput value={username} onChangeText={setUsername} style={styles.input} autoCapitalize="none" autoCorrect={false} />
    <Text style={styles.label}>ACCESS TOKEN</Text>
    <TextInput value={token} onChangeText={setToken} style={styles.input} autoCapitalize="none" secureTextEntry placeholder="MOBILE_WS_TOKEN value" placeholderTextColor="#66758a" />
    <Pressable style={styles.primary} onPress={save} disabled={saving}>{saving ? <ActivityIndicator color="#031019" /> : <Text style={styles.primaryText}>Connect doorbell</Text>}</Pressable>
  </View>;
}

function AppIcon({ children }) { return <Text style={styles.icon}>{children}</Text>; }
function formatEvent(event) {
  if (event.type === 'doorbell_ring') return 'Doorbell rang';
  if (event.type === 'remote_unlock' || event.type === 'access_granted') return 'Unlock pulse accepted';
  if (event.type === 'unauthorized_attempt') return 'Security alert';
  return event.type?.replace(/_/g, ' ') || 'Doorbell activity';
}

function Home({ config, onEdit }) {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState({ status: 'checking' });
  const [history, setHistory] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pushStatus, setPushStatus] = useState('Enable background ring alerts');
  const [ring, setRing] = useState(null);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pinAction, setPinAction] = useState('unlock');
  const [unlocking, setUnlocking] = useState(false);
  const [startingLive, setStartingLive] = useState(false);
  const latestRingId = useRef(null);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [nextStatus, nextHistory] = await Promise.all([doorbellClient.status(), doorbellClient.history()]);
      setStatus(nextStatus);
      setHistory(nextHistory.slice(0, 6));
      const latestRing = nextHistory.find(event => event.type === 'doorbell_ring');
      if (latestRing && latestRingId.current && latestRing.eventId !== latestRingId.current) setRing({ eventId: latestRing.eventId, visitor: 'Visitor at the front door' });
      if (latestRing) latestRingId.current = latestRing.eventId;
    } catch { setStatus(previous => ({ ...previous, status: 'offline' })); }
    finally { setRefreshing(false); }
  };

  useEffect(() => {
    refresh();
    const unsubscribe = doorbellClient.subscribe(event => {
      if (event.type === 'connection') setConnected(event.connected);
      if (event.type === 'hardware') setStatus(previous => ({ ...previous, status: event.connected ? 'online' : 'offline' }));
      if (event.type === 'ring') {
        latestRingId.current = event.eventId;
        setRing(event);
        NotificationManager.triggerRingAlert(event.visitor || 'Visitor at the front door');
        refresh();
      }
    });
    return unsubscribe;
  }, []);
  useEffect(() => { const timer = setInterval(refresh, 10000); return () => clearInterval(timer); }, []);

  const enablePush = async () => {
    try { const token = await NotificationManager.getPushToken(); await doorbellClient.request('/api/push_token',{method:'POST',body:JSON.stringify({token})}); setPushStatus('Background alerts registered'); }
    catch(error) { Alert.alert('Alerts need setup',error.message); }
  };
  const openIntercom = () => Linking.openURL(config.serverUrl + '/doorbell.html#token=' + encodeURIComponent(config.token));
  const startLiveView = async () => {
    try { await openIntercom(); } catch (error) { Alert.alert('Could not open intercom', error.message); }
  };
  const answerRing = async () => { setRing(null); await startLiveView(); };
  const unlock = async () => {
    if (!PIN_PATTERN.test(pin)) { Alert.alert('PIN required', 'Enter your 6 to 12 digit owner PIN.'); return; }
    setUnlocking(true);
    try { if (pinAction === 'cards') await doorbellClient.cardsEnabled(pin, !status.cardsEnabled); else await doorbellClient.unlock(pin); setUnlockOpen(false); setPin(''); await refresh(); Alert.alert('Device confirmed', pinAction === 'cards' ? 'Card access setting saved on the doorbell.' : 'Unlock pulse accepted. Gate position is not measured.'); }
    catch (error) { Alert.alert('Request not confirmed', error.message); }
    finally { setUnlocking(false); }
  };
  const online = status.status === 'online';

  return <View style={styles.fill}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#57d9ff" />}>
      <View style={styles.header}><View><Text style={styles.brand}>SMART DOORBELL</Text><Text style={styles.title}>Front Door</Text><View style={styles.onlineRow}><View style={[styles.liveDot, online ? styles.green : styles.red]} /><Text style={styles.onlineText}>{online ? 'Online' : 'Offline'}</Text></View></View><Pressable onPress={onEdit} style={styles.settings}><AppIcon>⚙</AppIcon></Pressable></View>
      <View style={styles.cameraCard}><View style={styles.cameraSky}><View style={styles.livePill}><View style={styles.liveDot} /><Text style={styles.livePillText}>CAMERA</Text></View><Text style={styles.cameraMark}>FRONT ENTRANCE</Text></View><Text style={styles.cameraHint}>{online ? 'Camera ready when you are.' : 'Reconnect the doorbell to view video.'}</Text></View>
      <Pressable style={[styles.primary, styles.unlockDoor]} onPress={() => {setPinAction("unlock"); setUnlockOpen(true);}}><AppIcon>♙</AppIcon><Text style={styles.primaryText}>Unlock door</Text></Pressable>
      <Pressable style={[styles.liveView, (!online || startingLive) && styles.disabled]} onPress={startLiveView} disabled={!online || startingLive}>{startingLive ? <ActivityIndicator color="#dff8ff" /> : <><AppIcon>◉</AppIcon><View><Text style={styles.liveViewTitle}>Live View</Text><Text style={styles.liveViewSub}>Open secure browser intercom</Text></View><Text style={styles.arrow}>›</Text></>}</Pressable>
      <View style={styles.quickGrid}><Quick icon="▣" label="Activity" onPress={refresh} /><Quick icon="◌" label="Doorbell" value={status.chime === 'ringing' ? 'Ringing' : 'Ready'} /><Quick icon="⌁" label="Wi‑Fi" value={status.rssi ? `${status.rssi} dBm` : '—'} /></View>
      <Pressable style={styles.liveView} disabled={!online || status.cardsEnabled == null} onPress={() => {setPinAction('cards'); setPin(''); setUnlockOpen(true);}} accessibilityRole="button"><View><Text style={styles.liveViewTitle}>RFID cards: {status.cardsEnabled == null ? 'Unknown' : status.cardsEnabled ? 'Enabled' : 'Disabled'}</Text><Text style={styles.liveViewSub}>{status.cardsEnabled ? 'Disable all cards with your PIN' : 'Enable saved cards with your PIN'}</Text></View></Pressable>
      {status.relayFault && <Text style={styles.pinSub}>Relay status needs attention. Check the device before unlocking.</Text>}
      <Pressable style={styles.liveView} onPress={enablePush}><Text style={styles.liveViewTitle}>{pushStatus}</Text></Pressable>
      <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Recent activity</Text><Pressable onPress={refresh}><Text style={styles.seeAll}>Refresh</Text></Pressable></View>
      {history.length ? history.map((event, index) => <View style={styles.event} key={String(event.eventId || index)}><View style={styles.eventIcon}><AppIcon>{event.type === 'doorbell_ring' ? '◉' : '⌑'}</AppIcon></View><View style={styles.eventText}><Text style={styles.eventTitle}>{formatEvent(event)}</Text><Text style={styles.eventSub}>{event.visitor || event.userName || 'Front entrance'}</Text></View><Text style={styles.chevron}>›</Text></View>) : <Text style={styles.empty}>No recent activity.</Text>}
    </ScrollView>
    <Modal visible={unlockOpen} transparent animationType="slide"><View style={styles.modalShade}><View style={styles.pinSheet}><View style={styles.sheetHandle}/><Text style={styles.sheetIcon}>♙</Text><Text style={styles.pinTitle}>{pinAction === "cards" ? (status.cardsEnabled ? "Disable RFID cards" : "Enable RFID cards") : "Unlock door"}</Text><Text style={styles.pinSub}>Enter your owner PIN to confirm this change on the device.</Text><TextInput value={pin} onChangeText={setPin} keyboardType="number-pad" secureTextEntry style={styles.pinInput} placeholder="••••••" placeholderTextColor="#75849a" maxLength={12}/><Pressable style={styles.primary} onPress={unlock} disabled={unlocking}>{unlocking ? <ActivityIndicator color="#031019" /> : <Text style={styles.primaryText}>Confirm</Text>}</Pressable><Pressable onPress={() => { setUnlockOpen(false); setPin(''); }} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable></View></View></Modal>
    <Modal visible={Boolean(ring)} transparent animationType="slide"><View style={styles.modalShade}><View style={styles.callSheet}><Text style={styles.brand}>INCOMING VISITOR</Text><Text style={styles.pinTitle}>{ring?.visitor || 'Visitor at the front door'}</Text><Text style={styles.pinSub}>See and talk to the person at your entrance.</Text><View style={styles.callActions}><Pressable style={styles.decline} onPress={() => setRing(null)}><Text style={styles.callActionText}>Decline</Text></Pressable><Pressable style={styles.accept} onPress={answerRing}><Text style={styles.acceptText}>Accept</Text></Pressable></View></View></View></Modal>

  </View>;
}
function Quick({ icon, label, value, onPress }) { return <Pressable style={styles.quick} onPress={onPress}><AppIcon>{icon}</AppIcon><Text style={styles.quickLabel}>{label}</Text><Text style={styles.quickValue}>{value || 'Open'}</Text></Pressable>; }
function Route({ label, active, onPress }) { return <Pressable style={[styles.route, active && styles.routeActive]} onPress={onPress}><Text style={styles.routeLabel}>{label}</Text></Pressable>; }
function CallButton({ label, danger, onPress }) { return <Pressable onPress={onPress} style={[styles.callButton, danger && styles.end]}><Text style={styles.callButtonText}>{label}</Text></Pressable>; }

function AppContent() {
  const [ready, setReady] = useState(false); const [config, setConfig] = useState(null); const [editing, setEditing] = useState(false);
  useEffect(() => { doorbellClient.load().then(saved => { setConfig(saved); setReady(true); }); }, []);
  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#57d9ff" size="large" /></View>;
  if (!config || editing) return <Setup config={config} onDone={next => { setConfig(next); setEditing(false); }} />;
  return <Home config={config} onEdit={() => setEditing(true)} />;
}
export default function App() { return <SafeAreaProvider><SafeAreaView style={styles.safe}><StatusBar barStyle="light-content"/><AppContent/></SafeAreaView></SafeAreaProvider>; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:'#071019'},fill:{flex:1},loading:{flex:1,backgroundColor:'#071019',alignItems:'center',justifyContent:'center'},screen:{flex:1,backgroundColor:'#071019'},content:{padding:22,paddingBottom:42},setup:{flex:1,backgroundColor:'#071019',padding:28,justifyContent:'center'},brand:{color:'#59d7fb',fontSize:11,fontWeight:'900',letterSpacing:1.8},setupTitle:{color:'#f6f8fb',fontSize:34,fontWeight:'800',lineHeight:40,marginTop:12},setupText:{color:'#91a1b4',fontSize:15,lineHeight:22,marginTop:13,marginBottom:20},label:{color:'#9aaabb',fontSize:11,fontWeight:'800',letterSpacing:1.1,marginTop:14,marginBottom:8},input:{backgroundColor:'#111f30',borderColor:'#243b52',borderWidth:1,borderRadius:15,color:'#fff',fontSize:15,padding:15},primary:{height:56,borderRadius:17,backgroundColor:'#57d9ff',alignItems:'center',justifyContent:'center',flexDirection:'row',gap:9,marginTop:20},primaryText:{color:'#041018',fontSize:16,fontWeight:'900'},header:{marginTop:8,flexDirection:'row',justifyContent:'space-between'},title:{fontSize:31,fontWeight:'800',color:'#f6f8fb',marginTop:7},onlineRow:{flexDirection:'row',alignItems:'center',gap:7,marginTop:9},liveDot:{width:8,height:8,borderRadius:4,backgroundColor:'#57d9ff'},green:{backgroundColor:'#4de29a'},red:{backgroundColor:'#fa6270'},onlineText:{color:'#a6b6c7',fontSize:13,fontWeight:'600'},settings:{height:42,width:42,borderRadius:14,borderWidth:1,borderColor:'#2b435c',alignItems:'center',justifyContent:'center'},icon:{color:'#dcedf7',fontSize:18,fontWeight:'700'},cameraCard:{marginTop:23,backgroundColor:'#102034',borderRadius:21,overflow:'hidden',borderWidth:1,borderColor:'#1d344a'},cameraSky:{height:170,backgroundColor:'#315050',padding:14,justifyContent:'space-between'},livePill:{alignSelf:'flex-start',backgroundColor:'rgba(5,17,26,.75)',borderRadius:20,paddingHorizontal:10,paddingVertical:6,flexDirection:'row',gap:6,alignItems:'center'},livePillText:{fontSize:11,color:'#fff',fontWeight:'800'},cameraMark:{fontSize:11,color:'#e4fbff',fontWeight:'900',letterSpacing:1.2,alignSelf:'center',marginBottom:55},cameraHint:{color:'#9fb3c6',fontSize:13,padding:14},unlockDoor:{marginTop:16},liveView:{marginTop:12,minHeight:72,backgroundColor:'#14283a',borderRadius:18,borderWidth:1,borderColor:'#2a4c65',paddingHorizontal:17,alignItems:'center',flexDirection:'row',gap:13},disabled:{opacity:.52},liveViewTitle:{color:'#f5f8fb',fontSize:16,fontWeight:'800'},liveViewSub:{color:'#8ea4b8',fontSize:12,marginTop:2},arrow:{marginLeft:'auto',color:'#57d9ff',fontSize:28},quickGrid:{flexDirection:'row',gap:9,marginTop:15},quick:{flex:1,minHeight:92,backgroundColor:'#0e1b2a',borderRadius:16,padding:12,justifyContent:'space-between'},quickLabel:{color:'#9badbf',fontSize:11,fontWeight:'700'},quickValue:{color:'#eff7fc',fontSize:13,fontWeight:'800'},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginTop:29},sectionTitle:{color:'#f6f8fb',fontSize:20,fontWeight:'800'},seeAll:{color:'#57d9ff',fontSize:13,fontWeight:'800'},event:{marginTop:10,backgroundColor:'#0e1b2a',borderRadius:16,padding:13,alignItems:'center',flexDirection:'row'},eventIcon:{height:36,width:36,backgroundColor:'#18354a',borderRadius:12,alignItems:'center',justifyContent:'center'},eventText:{marginLeft:11,flex:1},eventTitle:{color:'#f4f7fa',fontSize:14,fontWeight:'800',textTransform:'capitalize'},eventSub:{color:'#8396aa',fontSize:12,marginTop:3},chevron:{color:'#5e7891',fontSize:24},empty:{color:'#8294a7',textAlign:'center',marginTop:22},modalShade:{flex:1,backgroundColor:'rgba(0,0,0,.68)',justifyContent:'flex-end'},pinSheet:{backgroundColor:'#111f30',borderTopLeftRadius:30,borderTopRightRadius:30,padding:26,paddingBottom:36,alignItems:'center'},sheetHandle:{width:42,height:4,borderRadius:4,backgroundColor:'#4a6177',marginBottom:21},sheetIcon:{fontSize:34,color:'#57d9ff'},pinTitle:{color:'#fff',fontSize:27,fontWeight:'800',marginTop:12,textAlign:'center'},pinSub:{color:'#a5b7c8',fontSize:14,lineHeight:20,textAlign:'center',marginTop:7},pinInput:{width:'100%',marginTop:22,backgroundColor:'#071019',borderWidth:1,borderColor:'#2c4961',borderRadius:15,padding:16,color:'#fff',fontSize:22,letterSpacing:8,textAlign:'center'},cancel:{height:48,alignItems:'center',justifyContent:'center',marginTop:7},cancelText:{color:'#b9c7d2',fontSize:15,fontWeight:'800'},callSheet:{backgroundColor:'#111f30',borderTopLeftRadius:30,borderTopRightRadius:30,padding:28,paddingBottom:39},callActions:{flexDirection:'row',gap:13,marginTop:27},decline:{flex:1,height:55,backgroundColor:'#314153',borderRadius:17,alignItems:'center',justifyContent:'center'},accept:{flex:1,height:55,backgroundColor:'#58d9a0',borderRadius:17,alignItems:'center',justifyContent:'center'},callActionText:{color:'#fff',fontWeight:'900'},acceptText:{color:'#082116',fontWeight:'900'},callScreen:{flex:1,backgroundColor:'#071019',padding:22,paddingTop:58},callHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},callTitle:{color:'#fff',fontSize:25,fontWeight:'800'},callStatus:{color:'#56d9a0',fontWeight:'700',fontSize:13,marginTop:5},close:{color:'#dbeaf3',fontSize:34},video:{flex:1,marginTop:20,backgroundColor:'#000',borderRadius:22},videoWaiting:{flex:1,marginTop:20,borderRadius:22,backgroundColor:'#0f2233',justifyContent:'center',alignItems:'center'},waiting:{color:'#a6b9cb',marginTop:15,fontSize:14},routeRow:{flexDirection:'row',gap:11,marginTop:15},route:{flex:1,height:49,borderRadius:15,backgroundColor:'#1b3144',alignItems:'center',justifyContent:'center'},routeActive:{backgroundColor:'#175772',borderWidth:1,borderColor:'#57d9ff'},routeLabel:{color:'#f0f8fc',fontWeight:'800'},callButtonRow:{flexDirection:'row',gap:9,marginTop:12},callButton:{flex:1,height:56,borderRadius:17,backgroundColor:'#1c3144',alignItems:'center',justifyContent:'center'},end:{backgroundColor:'#ef5d6b'},callButtonText:{color:'#fff',fontSize:13,fontWeight:'900'}
});
