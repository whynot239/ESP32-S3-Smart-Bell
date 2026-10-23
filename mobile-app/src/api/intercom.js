import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

class IntercomClient {
  async answer(config, onRemoteStream) {
    this.onRemoteStream = onRemoteStream;
    const wsUrl = config.serverUrl.replace(/^http/, 'ws') + '/api/intercom?token=' + encodeURIComponent(config.token);
    this.signal = new WebSocket(wsUrl);
    this.signal.onopen = () => this.send({ type: 'ready' });
    this.signal.onmessage = async ({ data }) => {
      const message = JSON.parse(data);
      if (message.type === 'offer') await this.acceptOffer(message.sdp);
      if (message.type === 'ice' && this.peer) await this.peer.addIceCandidate(new RTCIceCandidate(message.candidate));
      if (message.type === 'hangup') this.end();
    };
  }

  async acceptOffer(sdp) {
    this.peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ type: 'ice', candidate });
    };
    this.peer.ontrack = ({ streams }) => {
      if (streams[0]) this.onRemoteStream?.(streams[0]);
    };
    const localStream = await mediaDevices.getUserMedia({ audio: true, video: false });
    this.localStream = localStream;
    InCallManager.start({ media: 'video', auto: true });
    InCallManager.setForceSpeakerphoneOn(true);
    localStream.getTracks().forEach(track => this.peer.addTrack(track, localStream));
    await this.peer.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.peer.createAnswer();
    await this.peer.setLocalDescription(answer);
    this.send({ type: 'answer', sdp: answer });
  }

  send(message) {
    if (this.signal?.readyState === WebSocket.OPEN) this.signal.send(JSON.stringify(message));
  }

  end() {
    this.send({ type: 'hangup' });
    this.peer?.close();
    this.signal?.close();
    this.localStream?.getTracks().forEach(track => track.stop());
    InCallManager.stop();
    this.peer = null;
    this.signal = null;
    this.localStream = null;
  }

  toggleMute() {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return !track.enabled;
  }

  setAudioRoute(useSpeaker) {
    InCallManager.setForceSpeakerphoneOn(useSpeaker);
    return useSpeaker;
  }
}

export const intercomClient = new IntercomClient();
