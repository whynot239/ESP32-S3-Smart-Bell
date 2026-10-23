/**
 * High-Definition Doorbell Camera Feed Engine
 * Supports real WebCam input or simulated dynamic security camera canvas with AI detection HUD.
 */
export class CameraFeedEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    this.webcamVideo = document.createElement('video');
    this.webcamVideo.autoplay = true;
    this.webcamVideo.muted = true;
    this.webcamVideo.playsInline = true;

    this.mode = 'simulated'; // 'simulated' or 'webcam'
    this.visitorPreset = 'courier'; // 'courier', 'neighbor', 'guest', 'empty'
    this.isNightVision = false;
    this.isFlashlightOn = false;
    this.showAIDetection = true;
    this.zoomLevel = 1.0;
    this.bitrate = 4.2;
    this.fps = 60;
    this.frameCount = 0;
    this.lastFrameTime = performance.now();
    this.animationId = null;

    // Visitor Animation State
    this.visitorState = {
      x: 0,
      y: 0,
      headBob: 0,
      armWave: 0,
      packageVisible: true,
      breathOffset: 0
    };

    this.init();
  }

  init() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    this.startRenderLoop();
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 640) * dpr;
    this.canvas.height = (rect.height || 480) * dpr;
  }

  async startWebcam() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: true
      });
      this.webcamVideo.srcObject = stream;
      await this.webcamVideo.play();
      this.mode = 'webcam';
      return true;
    } catch (err) {
      console.warn("Webcam not available, keeping simulation mode:", err);
      this.mode = 'simulated';
      return false;
    }
  }

  stopWebcam() {
    if (this.webcamVideo.srcObject) {
      this.webcamVideo.srcObject.getTracks().forEach(track => track.stop());
      this.webcamVideo.srcObject = null;
    }
    this.mode = 'simulated';
  }

  setVisitorPreset(preset) {
    this.visitorPreset = preset;
  }

  toggleNightVision(force) {
    this.isNightVision = force !== undefined ? force : !this.isNightVision;
    return this.isNightVision;
  }

  toggleFlashlight(force) {
    this.isFlashlightOn = force !== undefined ? force : !this.isFlashlightOn;
    return this.isFlashlightOn;
  }

  startRenderLoop() {
    const render = (time) => {
      this.renderFrame(time);
      this.animationId = requestAnimationFrame(render);
    };
    this.animationId = requestAnimationFrame(render);
  }

  renderFrame(time) {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return;

    this.frameCount++;
    if (time - this.lastFrameTime >= 1000) {
      this.fps = Math.round((this.frameCount * 1000) / (time - this.lastFrameTime));
      this.bitrate = (3.8 + Math.sin(time / 1000) * 0.4).toFixed(1);
      this.frameCount = 0;
      this.lastFrameTime = time;
    }

    this.ctx.save();

    // 1. Draw Background Stream
    if (this.mode === 'webcam' && this.webcamVideo.readyState >= 2) {
      this.ctx.drawImage(this.webcamVideo, 0, 0, w, h);
    } else {
      this.renderSimulatedScene(w, h, time);
    }

    // 2. Night Vision / Porch Light Filters
    if (this.isNightVision) {
      this.applyNightVisionFilter(w, h);
    } else if (this.isFlashlightOn) {
      this.applyFlashlightGlow(w, h);
    }

    // 3. Render AI Detection Bounding Boxes
    if (this.showAIDetection && this.visitorPreset !== 'empty') {
      this.renderAIBoundingBoxes(w, h, time);
    }

    // 4. Render Professional Security Camera HUD Overlay
    this.renderHUD(w, h, time);

    this.ctx.restore();
  }

  renderSimulatedScene(w, h, time) {
    const t = time / 1000;

    // Porch Entrance & Architecture Background
    const bgGrad = this.ctx.createLinearGradient(0, 0, 0, h);
    if (this.isNightVision) {
      bgGrad.addColorStop(0, '#0a120d');
      bgGrad.addColorStop(0.6, '#142018');
      bgGrad.addColorStop(1, '#080d09');
    } else {
      // Warm modern architectural front entryway
      bgGrad.addColorStop(0, '#1a1d24');
      bgGrad.addColorStop(0.4, '#2d3340');
      bgGrad.addColorStop(0.8, '#1e222b');
      bgGrad.addColorStop(1, '#111317');
    }
    this.ctx.fillStyle = bgGrad;
    this.ctx.fillRect(0, 0, w, h);

    // Warm Porch Sconce Light on the wall
    const wallLight = this.ctx.createRadialGradient(w * 0.85, h * 0.25, 10, w * 0.85, h * 0.25, w * 0.6);
    wallLight.addColorStop(0, 'rgba(255, 200, 120, 0.45)');
    wallLight.addColorStop(0.5, 'rgba(255, 170, 70, 0.15)');
    wallLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.ctx.fillStyle = wallLight;
    this.ctx.fillRect(0, 0, w, h);

    // Modern Porch Wall & Modern Oak Slat Paneling
    this.ctx.fillStyle = 'rgba(20, 24, 33, 0.9)';
    this.ctx.fillRect(0, h * 0.15, w * 0.22, h * 0.85);

    // Slat Lines
    this.ctx.strokeStyle = 'rgba(180, 130, 80, 0.25)';
    this.ctx.lineWidth = Math.max(2, w * 0.005);
    for (let x = w * 0.02; x < w * 0.2; x += w * 0.035) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, h * 0.15);
      this.ctx.lineTo(x, h);
      this.ctx.stroke();
    }

    // Front Door Frame & Frosted Glass Side Lite
    this.ctx.fillStyle = 'rgba(30, 36, 48, 0.85)';
    this.ctx.fillRect(w * 0.78, h * 0.1, w * 0.22, h * 0.9);
    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.strokeRect(w * 0.78, h * 0.1, w * 0.22, h * 0.9);

    // Modern Porch Plants in planter
    this.ctx.fillStyle = 'rgba(35, 60, 40, 0.8)';
    this.ctx.beginPath();
    this.ctx.ellipse(w * 0.12, h * 0.85, w * 0.09, h * 0.12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    // Floating Dust / Atmospheric Particles
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    for (let i = 0; i < 15; i++) {
      const px = (Math.sin(t * 0.5 + i * 2.3) * 0.5 + 0.5) * w;
      const py = (Math.cos(t * 0.3 + i * 1.7) * 0.5 + 0.5) * h;
      const pSize = (Math.sin(t + i) * 1.5 + 2) * (w / 600);
      this.ctx.beginPath();
      this.ctx.arc(px, py, Math.max(1, pSize), 0, Math.PI * 2);
      this.ctx.fill();
    }

    // Render Dynamic Visitor Character
    if (this.visitorPreset !== 'empty') {
      this.renderVisitorCharacter(w, h, t);
    }
  }

  renderVisitorCharacter(w, h, t) {
    const cx = w * 0.5;
    const breath = Math.sin(t * 2) * (h * 0.006);
    const sway = Math.sin(t * 1.2) * (w * 0.012);
    const baseCy = h * 0.62 + breath;

    this.ctx.save();
    this.ctx.translate(sway, 0);

    if (this.visitorPreset === 'courier') {
      // 1. Delivery Courier (Amazon / Logistics Driver Uniform)
      
      // Torso / High-Vis Jacket
      const bodyGrad = this.ctx.createLinearGradient(cx - w * 0.18, 0, cx + w * 0.18, 0);
      bodyGrad.addColorStop(0, '#103d6d');
      bodyGrad.addColorStop(0.5, '#1e5da6');
      bodyGrad.addColorStop(1, '#0e3157');
      this.ctx.fillStyle = bodyGrad;

      this.ctx.beginPath();
      this.ctx.ellipse(cx, baseCy + h * 0.25, w * 0.22, h * 0.28, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // High-Vis Neon Safety Stripes
      this.ctx.fillStyle = '#ff9900';
      this.ctx.fillRect(cx - w * 0.16, baseCy + h * 0.12, w * 0.32, h * 0.025);
      this.ctx.fillStyle = '#e2e8f0';
      this.ctx.fillRect(cx - w * 0.14, baseCy + h * 0.15, w * 0.28, h * 0.015);

      // Neck & Head
      this.ctx.fillStyle = '#dca785';
      this.ctx.beginPath();
      this.ctx.arc(cx, baseCy - h * 0.08, w * 0.085, 0, Math.PI * 2);
      this.ctx.fill();

      // Courier Cap (Dark Navy with peak)
      this.ctx.fillStyle = '#0a1c30';
      this.ctx.beginPath();
      this.ctx.arc(cx, baseCy - h * 0.11, w * 0.09, Math.PI, Math.PI * 2);
      this.ctx.fill();
      // Cap Visor
      this.ctx.beginPath();
      this.ctx.ellipse(cx, baseCy - h * 0.1, w * 0.11, h * 0.025, 0, 0, Math.PI);
      this.ctx.fill();

      // Face Features & Friendly Glance
      this.ctx.fillStyle = '#1e293b';
      this.ctx.beginPath();
      this.ctx.arc(cx - w * 0.03, baseCy - h * 0.08, w * 0.009, 0, Math.PI * 2);
      this.ctx.arc(cx + w * 0.03, baseCy - h * 0.08, w * 0.009, 0, Math.PI * 2);
      this.ctx.fill();

      // Mask / Smile
      this.ctx.strokeStyle = '#9c6f55';
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(cx, baseCy - h * 0.055, w * 0.025, 0.2, Math.PI - 0.2);
      this.ctx.stroke();

      // Amazon / Cardboard Delivery Box being held!
      const boxW = w * 0.28;
      const boxH = h * 0.22;
      const boxX = cx - boxW / 2 + Math.sin(t * 1.5) * (w * 0.005);
      const boxY = baseCy + h * 0.08;

      const boxGrad = this.ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
      boxGrad.addColorStop(0, '#c28b53');
      boxGrad.addColorStop(1, '#9b6833');
      this.ctx.fillStyle = boxGrad;
      this.ctx.fillRect(boxX, boxY, boxW, boxH);
      this.ctx.strokeStyle = '#7c4c1e';
      this.ctx.lineWidth = 2;
      this.ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Packing Tape & Shipping Label
      this.ctx.fillStyle = 'rgba(70, 50, 20, 0.4)';
      this.ctx.fillRect(boxX + boxW * 0.4, boxY, boxW * 0.2, boxH);

      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(boxX + boxW * 0.1, boxY + boxH * 0.2, boxW * 0.3, boxH * 0.35);
      // Barcode lines
      this.ctx.fillStyle = '#111111';
      for (let bx = boxX + boxW * 0.13; bx < boxX + boxW * 0.35; bx += 4) {
        this.ctx.fillRect(bx, boxY + boxH * 0.25, 2, boxH * 0.2);
      }

      // Hands holding box
      this.ctx.fillStyle = '#dca785';
      this.ctx.beginPath();
      this.ctx.ellipse(boxX - w * 0.015, boxY + boxH * 0.5, w * 0.03, h * 0.04, 0.3, 0, Math.PI * 2);
      this.ctx.ellipse(boxX + boxW + w * 0.015, boxY + boxH * 0.5, w * 0.03, h * 0.04, -0.3, 0, Math.PI * 2);
      this.ctx.fill();

    } else if (this.visitorPreset === 'neighbor') {
      // 2. Friendly Neighbor (Casual hoodie, waving hand)
      const wave = Math.sin(t * 5) * (h * 0.03);

      this.ctx.fillStyle = '#3b82f6';
      this.ctx.beginPath();
      this.ctx.ellipse(cx, baseCy + h * 0.25, w * 0.2, h * 0.26, 0, 0, Math.PI * 2);
      this.ctx.fill();

      // Head & Hair
      this.ctx.fillStyle = '#e5b08e';
      this.ctx.beginPath();
      this.ctx.arc(cx, baseCy - h * 0.07, w * 0.085, 0, Math.PI * 2);
      this.ctx.fill();

      // Curly / Modern Hair
      this.ctx.fillStyle = '#451a03';
      this.ctx.beginPath();
      this.ctx.arc(cx, baseCy - h * 0.11, w * 0.09, 0, Math.PI * 2);
      this.ctx.fill();

      // Waving Hand
      this.ctx.fillStyle = '#e5b08e';
      this.ctx.beginPath();
      this.ctx.arc(cx + w * 0.18, baseCy + wave, w * 0.035, 0, Math.PI * 2);
      this.ctx.fill();

    } else {
      // 3. Evening Visitor / Guest
      this.ctx.fillStyle = '#1e293b';
      this.ctx.beginPath();
      this.ctx.ellipse(cx, baseCy + h * 0.25, w * 0.2, h * 0.26, 0, 0, Math.PI * 2);
      this.ctx.fill();

      this.ctx.fillStyle = '#f6d8ae';
      this.ctx.beginPath();
      this.ctx.arc(cx, baseCy - h * 0.07, w * 0.085, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  applyNightVisionFilter(w, h) {
    // Night Vision Green Phosphor Monochrome Grade + Sensor Noise
    this.ctx.fillStyle = 'rgba(10, 40, 20, 0.45)';
    this.ctx.fillRect(0, 0, w, h);

    // Vignette
    const vig = this.ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.25, w * 0.5, h * 0.5, w * 0.65);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,15,5,0.75)');
    this.ctx.fillStyle = vig;
    this.ctx.fillRect(0, 0, w, h);

    // Scanlines
    this.ctx.fillStyle = 'rgba(0, 255, 100, 0.035)';
    for (let y = 0; y < h; y += 4) {
      this.ctx.fillRect(0, y, w, 1);
    }
  }

  applyFlashlightGlow(w, h) {
    const glow = this.ctx.createRadialGradient(w * 0.5, h * 0.5, 40, w * 0.5, h * 0.5, w * 0.7);
    glow.addColorStop(0, 'rgba(255, 255, 240, 0.25)');
    glow.addColorStop(0.6, 'rgba(255, 245, 200, 0.08)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.fillStyle = glow;
    this.ctx.fillRect(0, 0, w, h);
  }

  renderAIBoundingBoxes(w, h, time) {
    const cx = w * 0.5;
    const cy = h * 0.52;
    const boxW = w * 0.42;
    const boxH = h * 0.72;

    const x = cx - boxW / 2;
    const y = cy - boxH / 2;

    // Pulse
    const pulseAlpha = 0.7 + Math.sin(time / 300) * 0.25;

    this.ctx.save();
    this.ctx.strokeStyle = `rgba(16, 185, 129, ${pulseAlpha})`;
    this.ctx.lineWidth = Math.max(2, w * 0.004);

    // Corner reticles
    const cLen = w * 0.05;
    // Top-Left
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + cLen);
    this.ctx.lineTo(x, y);
    this.ctx.lineTo(x + cLen, y);
    this.ctx.stroke();

    // Top-Right
    this.ctx.beginPath();
    this.ctx.moveTo(x + boxW - cLen, y);
    this.ctx.lineTo(x + boxW, y);
    this.ctx.lineTo(x + boxW, y + cLen);
    this.ctx.stroke();

    // Bottom-Left
    this.ctx.beginPath();
    this.ctx.moveTo(x, y + boxH - cLen);
    this.ctx.lineTo(x, y + boxH);
    this.ctx.lineTo(x + cLen, y + boxH);
    this.ctx.stroke();

    // Bottom-Right
    this.ctx.beginPath();
    this.ctx.moveTo(x + boxW - cLen, y + boxH);
    this.ctx.lineTo(x + boxW, y + boxH);
    this.ctx.lineTo(x + boxW, y + boxH - cLen);
    this.ctx.stroke();

    // Label Badge
    this.ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
    const tagText = this.visitorPreset === 'courier' ? 'PERSON (99%) • PACKAGE DETECTED (96%)' : 'PERSON (98%)';
    this.ctx.font = `600 ${Math.max(10, Math.round(w * 0.022))}px "JetBrains Mono", monospace`;
    const textWidth = this.ctx.measureText(tagText).width;
    
    this.ctx.fillRect(x, y - Math.max(18, w * 0.038), textWidth + 16, Math.max(18, w * 0.038));
    this.ctx.fillStyle = '#061a12';
    this.ctx.fillText(tagText, x + 8, y - Math.max(5, w * 0.012));

    this.ctx.restore();
  }

  renderHUD(w, h, time) {
    const fontSize = Math.max(10, Math.round(w * 0.022));
    this.ctx.font = `600 ${fontSize}px "JetBrains Mono", monospace`;

    // 1. Live Indicator (Top Left)
    const isLiveBlink = Math.floor(time / 500) % 2 === 0;
    this.ctx.fillStyle = isLiveBlink ? '#ef4444' : '#7f1d1d';
    this.ctx.beginPath();
    this.ctx.arc(w * 0.04, h * 0.06, Math.max(4, w * 0.009), 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText('LIVE 4K HDR', w * 0.065, h * 0.065);

    // 2. Camera Name & HAOS Tag
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    this.ctx.fillText('FRONT_PORCH // HAOS_CAM_01', w * 0.04, h * 0.11);

    // 3. Live Timestamp (Top Right)
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8) + '.' + String(Math.floor(now.getMilliseconds() / 100));
    const fullTime = `${dateStr}  ${timeStr}`;
    const timeWidth = this.ctx.measureText(fullTime).width;
    this.ctx.fillStyle = '#ffffff';
    this.ctx.fillText(fullTime, w - timeWidth - w * 0.04, h * 0.065);

    // 4. Stream Telemetry (Bottom Left)
    const telemetry = `${this.fps} FPS • ${this.bitrate} MB/S • H.265 HEVC`;
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    this.ctx.fillText(telemetry, w * 0.04, h * 0.94);

    // 5. Night Vision / IR Badge if active
    if (this.isNightVision) {
      this.ctx.fillStyle = '#10b981';
      this.ctx.fillText('⚡ IR NIGHT VISION ACTIVE', w - w * 0.35, h * 0.94);
    }
  }

  takeSnapshot() {
    return this.canvas.toDataURL('image/jpeg', 0.85);
  }
}
