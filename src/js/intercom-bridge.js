const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

class LaptopIntercom {
  async start(stream) {
    if (!stream) return;
    if (!stream.getAudioTracks().length) {
      window.alert('No laptop microphone was found. Allow microphone access for this website, then click Use My Webcam again.');
      return;
    }
    this.stream = stream;
    let token = localStorage.getItem('doorbell_test_token');
    if (!token) {
      token = window.prompt('Enter MOBILE_WS_TOKEN to enable the remote live call.');
      if (!token) return;
      localStorage.setItem('doorbell_test_token', token);
    }
    const signalUrl = location.origin.replace(/^http/, 'ws') + '/api/intercom?token=' + encodeURIComponent(token);
    this.signal = new WebSocket(signalUrl);
    this.signal.onmessage = async event => {
      const message = JSON.parse(event.data);
      if (message.type === 'ready') await this.offer();
      if (message.type === 'answer' && this.peer) await this.peer.setRemoteDescription(message.sdp);
      if (message.type === 'ice' && this.peer) await this.peer.addIceCandidate(message.candidate);
      if (message.type === 'hangup') this.end();
    };
  }

  async offer() {
    this.peer?.close();
    this.peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.stream.getTracks().forEach(track => this.peer.addTrack(track, this.stream));
    this.peer.ontrack = ({ streams }) => {
      if (!streams[0]) return;
      this.remoteAudio ??= document.createElement('audio');
      this.remoteAudio.autoplay = true;
      this.remoteAudio.playsInline = true;
      this.remoteAudio.muted = false;
      this.remoteAudio.volume = 1;
      this.remoteAudio.style.display = 'none';
      if (!this.remoteAudio.isConnected) document.body.appendChild(this.remoteAudio);
      this.remoteAudio.srcObject = streams[0];
      this.remoteAudio.play().catch(() => {});
    };
    this.peer.onicecandidate = ({ candidate }) => {
      if (candidate) this.send({ type: 'ice', candidate });
    };
    const offer = await this.peer.createOffer();
    await this.peer.setLocalDescription(offer);
    this.send({ type: 'offer', sdp: offer });
  }

  send(message) {
    if (this.signal?.readyState === WebSocket.OPEN) this.signal.send(JSON.stringify(message));
  }

  end() {
    this.peer?.close();
    this.peer = null;
    this.remoteAudio?.pause();
    this.remoteAudio?.remove();
    this.remoteAudio = null;
  }
}

export const laptopIntercom = new LaptopIntercom();
