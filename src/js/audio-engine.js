/**
 * High-Fidelity Web Audio Synthesizer & Intercom Sound Engine
 */
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.micStream = null;
    this.micSource = null;
    this.analyser = null;
    this.isMuted = false;
    this.speakerVolume = 1.0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Realistic Ding-Dong Doorbell Chime
   */
  playDoorbellChime(type = 'modern') {
    this.init();
    const now = this.ctx.currentTime;

    if (type === 'modern') {
      // 2-tone harmonic Ding-Dong (E5 ~ 659Hz -> C5 ~ 523Hz)
      this.playChimeTone(659.25, now, 1.8, 0.85);
      this.playChimeTone(523.25, now + 0.55, 2.2, 0.95);
    } else if (type === 'cyber') {
      // Futuristic 3-note ascending chime
      this.playChimeTone(587.33, now, 0.6, 0.5);
      this.playChimeTone(880.00, now + 0.15, 0.8, 0.6);
      this.playChimeTone(1174.66, now + 0.35, 1.5, 0.7);
    } else {
      // Classic mechanical chime
      this.playChimeTone(783.99, now, 1.2, 0.8);
      this.playChimeTone(523.25, now + 0.45, 1.8, 0.9);
    }
  }

  playChimeTone(freq, startTime, duration, gainLevel = 0.8) {
    // Primary Tone + Harmonics for rich bell timbre
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const osc3 = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(freq, startTime);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(freq * 2.01, startTime); // Harmonic octave with shimmer

    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(freq * 3.02, startTime); // Third harmonic

    // Dynamic exponential decay
    gainNode.gain.setValueAtTime(0.001, startTime);
    gainNode.gain.exponentialRampToValueAtTime(gainLevel * this.speakerVolume, startTime + 0.02);
    gainNode.gain.exponentialRampToValueAtTime(gainLevel * 0.4, startTime + 0.3);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc1.connect(gainNode);
    osc2.connect(gainNode);
    osc3.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc1.start(startTime);
    osc2.start(startTime);
    osc3.start(startTime);

    osc1.stop(startTime + duration + 0.1);
    osc2.stop(startTime + duration + 0.1);
    osc3.stop(startTime + duration + 0.1);
  }

  /**
   * Gentle Mobile Notification Chime
   */
  playNotificationPing() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.12);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.exponentialRampToValueAtTime(0.4, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.4);
  }

  /**
   * Intercom Walkie-Talkie Radio Burst & Connect Tone
   */
  playIntercomBeep(type = 'connect') {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === 'connect') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(880, now + 0.08);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    } else {
      // Disconnect roger beep
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(600, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  }

  /**
   * Mechanical Gate Lock Actuator Sound (Servo hum + latch unlock click)
   */
  playGateUnlockSound() {
    this.init();
    const now = this.ctx.currentTime;

    // 1. Initial Solenoid Click
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(120, now);
    clickGain.gain.setValueAtTime(0.5, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    clickOsc.connect(clickGain);
    clickGain.connect(this.ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.1);

    // 2. Motor Servo Hum
    const servoOsc = this.ctx.createOscillator();
    const servoGain = this.ctx.createGain();
    servoOsc.type = 'sawtooth';
    servoOsc.frequency.setValueAtTime(80, now + 0.05);
    servoOsc.frequency.linearRampToValueAtTime(160, now + 0.6);
    servoOsc.frequency.linearRampToValueAtTime(90, now + 1.1);

    servoGain.gain.setValueAtTime(0.01, now + 0.05);
    servoGain.gain.linearRampToValueAtTime(0.18, now + 0.2);
    servoGain.gain.setValueAtTime(0.18, now + 0.9);
    servoGain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    servoOsc.connect(servoGain);
    servoGain.connect(this.ctx.destination);
    servoOsc.start(now + 0.05);
    servoOsc.stop(now + 1.25);

    // 3. Final Heavy Latch Release Clack
    const latchOsc = this.ctx.createOscillator();
    const latchGain = this.ctx.createGain();
    latchOsc.type = 'square';
    latchOsc.frequency.setValueAtTime(65, now + 1.15);
    latchGain.gain.setValueAtTime(0.4, now + 1.15);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 1.35);
    latchOsc.connect(latchGain);
    latchGain.connect(this.ctx.destination);
    latchOsc.start(now + 1.15);
    latchOsc.stop(now + 1.4);
  }

  /**
   * Start User Microphone Stream & Visualizer
   */
  async startMicrophone() {
    this.init();
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.micSource.connect(this.analyser);
      return true;
    } catch (err) {
      console.warn("Real microphone access denied or not available. Using simulated audio visualizer.", err);
      // Fallback: Create oscillator simulator node
      return false;
    }
  }

  stopMicrophone() {
    if (this.micStream) {
      this.micStream.getTracks().forEach(track => track.stop());
      this.micStream = null;
    }
  }

  getAudioLevel() {
    if (!this.analyser) {
      // Simulate natural speech fluctuations when active
      return Math.min(1, Math.max(0.15, Math.random() * 0.75 + Math.sin(Date.now() / 150) * 0.2));
    }
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    return sum / (dataArray.length * 255);
  }

  /**
   * Speak quick automated response through simulated doorbell speaker
   */
  speakCannedResponse(text, onEnd) {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = 1.0;
      utterance.rate = 1.05;
      utterance.volume = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
      if (naturalVoice) utterance.voice = naturalVoice;

      if (onEnd) utterance.onend = onEnd;
      window.speechSynthesis.speak(utterance);
    } else {
      setTimeout(onEnd, 2000);
    }
  }
}

export const audioEngine = new AudioEngine();
