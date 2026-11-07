/**
 * ZionCast Audience TV / Projector Display Engine
 * Zero-latency real-time synchronization, procedural motion loops,
 * direct hardware camera feeds, and high-legibility typography rendering.
 */

(() => {
  // DOM Elements
  const canvas = document.getElementById('display-canvas');
  const ctx = canvas.getContext('2d');
  const cameraVideo = document.getElementById('display-camera-layer');
  const mediaVideo = document.getElementById('display-video-bg');
  const mediaImg = document.getElementById('display-img-bg');
  const scrim = document.getElementById('display-scrim');
  const textContainer = document.getElementById('display-text-container');
  const badgeTitle = document.getElementById('display-badge');
  const bodyText = document.getElementById('display-body');
  const ticker = document.getElementById('display-ticker');
  const dimmerCurtain = document.getElementById('display-dimmer');
  const blackoutCurtain = document.getElementById('display-blackout');

  // BroadcastChannel Fallback for cross-window sync
  let syncChannel = null;
  try {
    syncChannel = new BroadcastChannel('zioncast-sync');
    syncChannel.onmessage = (event) => {
      if (event.data) applyDisplayState(event.data);
    };
  } catch (err) {
    console.warn('BroadcastChannel not supported, relying strictly on Electron IPC:', err);
  }

  // Active State Cache
  let state = {
    activeSlide: null,
    activeItem: null,
    blackout: false,
    clearText: false,
    themeOnly: false,
    fontSize: 44,
    fontFamily: 'Outfit',
    fontColor: '#ffffff',
    strokeWidth: 0,
    strokeColor: '#000000',
    dropShadow: true,
    textAlign: 'center',
    backgroundType: 'procedural',
    backgroundId: 'celestial-clouds',
    customBgUrl: '',
    cameraEnabled: false,
    cameraMode: 'none',
    cameraDeviceId: '',
    cameraDeviceLabel: '',
    cameraOpacity: 0.75,
    remotePort: 3000,
    bannerText: '',
    bannerActive: false,
    bannerStyle: 'urgent-red',
    bannerLayout: 'bar',
    bannerAutoDismiss: 0,
    youtubeVideoId: '',
    youtubeUrl: '',
    youtubeTitle: '',
    youtubeMuted: false,
    youtubeActive: false,
    brightness: 100
  };

  let activeCameraStream = null;
  let activeCameraDeviceId = null;
  let cameraOpeningKey = null;
  let cameraSetupSeq = 0;
  let activeBannerTimer = null;
  let lastSlideSignature = '';

  function escapeHtmlDisplay(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Window Resize & Canvas Setup
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // =========================================================================
  // PROCEDURAL MOTION BACKGROUND ENGINE (60 FPS)
  // =========================================================================
  let animationFrameId = null;
  let animTime = 0;

  // Particles system cache
  const particles = [];
  const PARTICLE_COUNT = 75;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      radius: Math.random() * 4 + 1.5,
      speedY: Math.random() * 0.7 + 0.3,
      speedX: (Math.random() - 0.5) * 0.4,
      alpha: Math.random() * 0.7 + 0.2,
      pulseSpeed: Math.random() * 0.02 + 0.01
    });
  }

  function renderProceduralLoop() {
    animTime += 0.015;
    const w = canvas.width;
    const h = canvas.height;

    const bgId = state.backgroundId || 'celestial-clouds';

    if (bgId === 'celestial-clouds') {
      // Celestial Clouds: deep royal purple & midnight blue shifting gradient with volumetric lighting
      const grad = ctx.createRadialGradient(
        w * 0.5 + Math.sin(animTime * 0.5) * (w * 0.25),
        h * 0.4 + Math.cos(animTime * 0.4) * (h * 0.2),
        w * 0.1,
        w * 0.5,
        h * 0.5,
        w * 0.8
      );
      grad.addColorStop(0, '#581c87'); // royal purple
      grad.addColorStop(0.4, '#2e1065'); // deep violet
      grad.addColorStop(0.8, '#0f172a'); // midnight slate
      grad.addColorStop(1, '#020617'); // obsidian

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Ethereal cloud puffs
      ctx.fillStyle = 'rgba(168, 85, 247, 0.04)';
      ctx.beginPath();
      ctx.arc(w * 0.3 + Math.sin(animTime * 0.3) * 60, h * 0.6 + Math.cos(animTime * 0.2) * 40, w * 0.35, 0, Math.PI * 2);
      ctx.fill();

    } else if (bgId === 'deep-gradient-pulse') {
      // Modern Worship Indigo & Amethyst Flowing Gradient
      const grad = ctx.createLinearGradient(
        Math.sin(animTime * 0.4) * w * 0.3,
        0,
        w + Math.cos(animTime * 0.3) * w * 0.2,
        h
      );
      grad.addColorStop(0, '#0c1a3b');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Cyan accent aura
      const aura = ctx.createRadialGradient(
        w * 0.7 + Math.cos(animTime * 0.5) * 80,
        h * 0.3 + Math.sin(animTime * 0.6) * 50,
        20,
        w * 0.7,
        h * 0.3,
        w * 0.5
      );
      aura.addColorStop(0, 'rgba(6, 182, 212, 0.12)');
      aura.addColorStop(1, 'rgba(6, 182, 212, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, w, h);

    } else if (bgId === 'worship-particles') {
      // Gentle Rising Sanctuary Embers & Bokeh Stars
      ctx.fillStyle = '#08070d';
      ctx.fillRect(0, 0, w, h);

      // Soft deep purple nebula backdrop
      const nebula = ctx.createRadialGradient(w * 0.5, h * 0.7, 50, w * 0.5, h * 0.5, w * 0.7);
      nebula.addColorStop(0, 'rgba(124, 58, 237, 0.18)');
      nebula.addColorStop(1, 'rgba(8, 7, 13, 0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, w, h);

      // Animate particles rising heavenward
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.y -= p.speedY;
        p.x += Math.sin(animTime + i) * 0.3;
        p.alpha += Math.sin(animTime * 2 + i) * 0.005;

        if (p.y < -10) {
          p.y = h + 10;
          p.x = Math.random() * w;
        }

        ctx.fillStyle = `rgba(245, 158, 11, ${Math.max(0.1, Math.min(0.85, p.alpha))})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (bgId === 'golden-sanctuary') {
      // Golden Sanctuary: Warm amber radiant waves for high-energy praise
      const grad = ctx.createRadialGradient(
        w * 0.5,
        h * 0.1,
        20,
        w * 0.5,
        h * 0.5,
        w * 0.75
      );
      grad.addColorStop(0, '#78350f'); // rich amber
      grad.addColorStop(0.5, '#451a03'); // deep bronze
      grad.addColorStop(1, '#0f0802'); // dark warm obsidian
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Radiant beams
      ctx.fillStyle = 'rgba(251, 191, 36, 0.05)';
      ctx.beginPath();
      ctx.moveTo(w * 0.5, 0);
      const beamSpread = Math.sin(animTime * 0.6) * 100;
      ctx.lineTo(w * 0.2 + beamSpread, h);
      ctx.lineTo(w * 0.8 + beamSpread, h);
      ctx.closePath();
      ctx.fill();

    } else if (bgId === 'midnight-praise') {
      // Midnight Praise: Deep sapphire & emerald aurora waves
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#022c22');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#030712');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const waveGrad = ctx.createRadialGradient(
        w * 0.4 + Math.sin(animTime * 0.5) * 100,
        h * 0.6 + Math.cos(animTime * 0.4) * 80,
        40,
        w * 0.5,
        h * 0.5,
        w * 0.6
      );
      waveGrad.addColorStop(0, 'rgba(16, 185, 129, 0.14)');
      waveGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
      ctx.fillStyle = waveGrad;
      ctx.fillRect(0, 0, w, h);

    } else if (bgId === 'sacred-light-rays') {
      // Sacred Light Rays: Volumetric Cathedral sunbeams streaming down
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#0a0d14');
      bg.addColorStop(1, '#020408');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 4; i++) {
        const offset = Math.sin(animTime * 0.4 + i * 1.2) * (w * 0.15);
        const originX = w * (0.2 + i * 0.2) + offset;
        const beamGrad = ctx.createRadialGradient(originX, 0, 10, originX, h * 0.6, w * 0.4);
        beamGrad.addColorStop(0, 'rgba(254, 240, 138, 0.14)');
        beamGrad.addColorStop(0.5, 'rgba(251, 191, 36, 0.05)');
        beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(originX - 20, 0);
        ctx.lineTo(originX + 20, 0);
        ctx.lineTo(originX + w * 0.25, h);
        ctx.lineTo(originX - w * 0.15, h);
        ctx.closePath();
        ctx.fill();
      }

    } else if (bgId === 'living-waters') {
      // Living Waters: Gentle flowing oceanic sapphire waves
      const bg = ctx.createLinearGradient(0, 0, w, h);
      bg.addColorStop(0, '#021526');
      bg.addColorStop(0.5, '#032b44');
      bg.addColorStop(1, '#010c14');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      for (let layer = 1; layer <= 3; layer++) {
        ctx.fillStyle = `rgba(0, 240, 255, ${0.03 * layer})`;
        ctx.beginPath();
        ctx.moveTo(0, h * (0.4 + layer * 0.15));
        for (let x = 0; x <= w; x += 30) {
          const waveY = h * (0.4 + layer * 0.15) + Math.sin(animTime * 1.2 * layer + x * 0.005) * (20 * layer);
          ctx.lineTo(x, waveY);
        }
        ctx.lineTo(w, h);
        ctx.lineTo(0, h);
        ctx.closePath();
        ctx.fill();
      }

    } else if (bgId === 'heavenly-dawn') {
      // Heavenly Dawn: Sunrise gold, rose & peach communion ambient
      const grad = ctx.createRadialGradient(
        w * 0.5 + Math.sin(animTime * 0.3) * 80,
        h * 0.65,
        30,
        w * 0.5,
        h * 0.5,
        w * 0.7
      );
      grad.addColorStop(0, '#be185d');
      grad.addColorStop(0.35, '#831843');
      grad.addColorStop(0.7, '#2e1065');
      grad.addColorStop(1, '#05020a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const sunAura = ctx.createRadialGradient(w * 0.5, h * 0.85, 20, w * 0.5, h * 0.85, w * 0.45);
      sunAura.addColorStop(0, 'rgba(251, 191, 36, 0.18)');
      sunAura.addColorStop(1, 'rgba(251, 191, 36, 0)');
      ctx.fillStyle = sunAura;
      ctx.fillRect(0, 0, w, h);

    } else if (bgId === 'holy-fire') {
      // Holy Fire: Spiritual flame glow and rising ember particles
      ctx.fillStyle = '#0f0202';
      ctx.fillRect(0, 0, w, h);

      const fireGlow = ctx.createRadialGradient(w * 0.5, h * 0.95, 30, w * 0.5, h * 0.6, w * 0.6);
      fireGlow.addColorStop(0, 'rgba(239, 68, 68, 0.28)');
      fireGlow.addColorStop(0.4, 'rgba(245, 158, 11, 0.16)');
      fireGlow.addColorStop(1, 'rgba(15, 2, 2, 0)');
      ctx.fillStyle = fireGlow;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 40; i++) {
        const px = (w * ((i * 37) % 100) / 100) + Math.sin(animTime * 2 + i) * 20;
        const py = (h - ((animTime * 120 + i * 45) % h));
        const pRadius = (i % 3) + 1.5;
        ctx.fillStyle = `rgba(245, 158, 11, ${0.4 + Math.sin(animTime * 3 + i) * 0.3})`;
        ctx.beginPath();
        ctx.arc(px, py, pRadius, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (bgId === 'starlight-firmament') {
      // Starlight Firmament: Deep starry cosmos & subtle drifting nebula
      ctx.fillStyle = '#030014';
      ctx.fillRect(0, 0, w, h);

      const nebula = ctx.createRadialGradient(
        w * 0.4 + Math.sin(animTime * 0.2) * 50,
        h * 0.4 + Math.cos(animTime * 0.2) * 40,
        40,
        w * 0.5,
        h * 0.5,
        w * 0.6
      );
      nebula.addColorStop(0, 'rgba(99, 102, 241, 0.12)');
      nebula.addColorStop(0.6, 'rgba(168, 85, 247, 0.08)');
      nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = nebula;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 50; i++) {
        const sx = (w * ((i * 73) % 100) / 100);
        const sy = (h * ((i * 47) % 100) / 100);
        const twinkle = Math.sin(animTime * 3 + i * 1.5) * 0.4 + 0.6;
        ctx.fillStyle = `rgba(255, 255, 255, ${twinkle * 0.8})`;
        ctx.beginPath();
        ctx.arc(sx, sy, (i % 4 === 0) ? 2 : 1, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (bgId === 'rose-gold-elegance') {
      // Rose Gold Elegance: Modern velvet rose-gold and deep charcoal waves
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#1c1418');
      grad.addColorStop(0.5, '#2e1822');
      grad.addColorStop(1, '#0c080a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const sheen = ctx.createRadialGradient(
        w * 0.6 + Math.cos(animTime * 0.4) * 90,
        h * 0.4 + Math.sin(animTime * 0.3) * 60,
        30,
        w * 0.6,
        h * 0.4,
        w * 0.5
      );
      sheen.addColorStop(0, 'rgba(251, 113, 133, 0.16)');
      sheen.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, w, h);

    } else if (bgId === 'cathedral-stained-glass') {
      // Cathedral Stained Glass Glow: Refracting jewel tones
      ctx.fillStyle = '#080811';
      ctx.fillRect(0, 0, w, h);

      const colors = ['rgba(234, 179, 8, 0.08)', 'rgba(59, 130, 246, 0.08)', 'rgba(239, 68, 68, 0.08)', 'rgba(168, 85, 247, 0.08)'];
      for (let i = 0; i < 4; i++) {
        const cx = w * (0.25 + (i % 2) * 0.5) + Math.sin(animTime * 0.5 + i) * 30;
        const cy = h * (0.3 + Math.floor(i / 2) * 0.4) + Math.cos(animTime * 0.4 + i) * 20;
        const prism = ctx.createRadialGradient(cx, cy, 20, cx, cy, w * 0.35);
        prism.addColorStop(0, colors[i]);
        prism.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = prism;
        ctx.fillRect(0, 0, w, h);
      }

    } else if (bgId === 'cross-majesty') {
      // Cross of Majesty: Reverent backlit glowing Cross
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.4, 20, w * 0.5, h * 0.45, w * 0.65);
      grad.addColorStop(0, '#311b05');
      grad.addColorStop(0.4, '#170c02');
      grad.addColorStop(1, '#050301');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const halo = ctx.createRadialGradient(w * 0.5, h * 0.38, 10, w * 0.5, h * 0.38, 160 + Math.sin(animTime * 1.5) * 15);
      halo.addColorStop(0, 'rgba(245, 158, 11, 0.35)');
      halo.addColorStop(0.5, 'rgba(217, 119, 6, 0.12)');
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.38, 200, 0, Math.PI * 2);
      ctx.fill();

      const crossW = 28;
      const crossH = 260;
      const barW = 160;
      const barH = 28;
      const crossY = h * 0.22;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.fillRect(w * 0.5 - crossW * 0.5, crossY, crossW, crossH);
      ctx.fillRect(w * 0.5 - barW * 0.5, crossY + 60, barW, barH);

    } else if (bgId === 'emerald-sanctuary') {
      // Emerald Sanctuary: Deep forest emerald and golden amber
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#021c14');
      grad.addColorStop(0.5, '#064e3b');
      grad.addColorStop(1, '#02100b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const aura = ctx.createRadialGradient(
        w * 0.5 + Math.sin(animTime * 0.4) * 80,
        h * 0.5 + Math.cos(animTime * 0.5) * 50,
        30,
        w * 0.5,
        h * 0.5,
        w * 0.55
      );
      aura.addColorStop(0, 'rgba(52, 211, 153, 0.16)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(0, 0, w, h);
    }

    animationFrameId = requestAnimationFrame(renderProceduralLoop);
  }

  // Start background procedural render loop
  renderProceduralLoop();

  // =========================================================================
  // HARDWARE VIDEO LAYER (DroidCam, OBS, HDMI Capture, USB)
  // =========================================================================
  async function resolveDisplayCameraId(requestedId, requestedLabel) {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices.filter(d => d.kind === 'videoinput');
      if (cams.length === 0) return requestedId || '';

      if (requestedId) {
        const exact = cams.find(c => c.deviceId === requestedId);
        if (exact) return exact.deviceId;
      }

      if (requestedLabel) {
        const cleanReq = String(requestedLabel).toLowerCase().trim();
        const byLabel = cams.find(c => {
          const lbl = (c.label || '').toLowerCase().trim();
          return lbl && (lbl === cleanReq || lbl.includes(cleanReq) || cleanReq.includes(lbl));
        });
        if (byLabel && byLabel.deviceId) return byLabel.deviceId;
      }

      // Priority virtual/broadcast cameras if exact ID wasn't scoped to this window
      const preferred = cams.find(c => /camo|droidcam|droid|obs|capture|elgato|hdmi|atem/i.test(c.label || ''));
      if (preferred && preferred.deviceId) return preferred.deviceId;

      return cams[0].deviceId || requestedId || '';
    } catch (e) {
      return requestedId || '';
    }
  }

  async function openCameraStreamWithFallbacks(resolvedId) {
    const attempts = [];
    if (resolvedId) {
      attempts.push({
        video: { deviceId: { exact: resolvedId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      attempts.push({
        video: { deviceId: resolvedId },
        audio: false
      });
    }
    attempts.push({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    attempts.push({ video: true, audio: false });

    let lastErr = null;
    for (const c of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(c);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Could not start camera video source');
  }

  async function setupCameraFeed(deviceId, mode, deviceLabel = '') {
    if (!state.cameraEnabled || mode === 'none' || !mode) {
      cameraSetupSeq++;
      cameraOpeningKey = null;
      if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => track.stop());
        activeCameraStream = null;
      }
      cameraVideo.srcObject = null;
      cameraVideo.classList.remove('camera-active');
      cameraVideo.style.opacity = '0';
      cameraVideo.style.display = 'none';
      activeCameraDeviceId = null;
      return;
    }

    const requestKey = (deviceId || '') + '::' + (deviceLabel || '');
    const isStreamAlive = activeCameraStream && activeCameraStream.getVideoTracks().some(t => t.readyState === 'live');

    if (isStreamAlive && activeCameraDeviceId === requestKey) {
      cameraVideo.style.display = 'block';
      cameraVideo.classList.add('camera-active');
      cameraVideo.style.opacity = '1';
      if (cameraVideo.paused) {
        cameraVideo.play().catch(e => console.warn('Camera video play error:', e));
      }
      return;
    }

    if (cameraOpeningKey === requestKey) {
      return;
    }

    cameraOpeningKey = requestKey;
    const mySeq = ++cameraSetupSeq;

    try {
      // Stop previous stream before acquiring new device
      if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => track.stop());
        activeCameraStream = null;
      }

      const resolvedId = await resolveDisplayCameraId(deviceId, deviceLabel);
      let stream = null;

      try {
        stream = await openCameraStreamWithFallbacks(resolvedId);
      } catch (firstErr) {
        console.warn('[Display Camera] Initial acquire failed, requesting Control Desk camera release:', firstErr);
        // Exclusive single-client Windows driver (e.g. DroidCam / USB HDMI capture): release Control Desk handle & retry!
        if (window.zionApi && window.zionApi.requestCameraRelease) {
          window.zionApi.requestCameraRelease();
        }
        await new Promise(r => setTimeout(r, 400));
        const retryId = await resolveDisplayCameraId(deviceId, deviceLabel);
        stream = await openCameraStreamWithFallbacks(retryId);
      }

      if (mySeq !== cameraSetupSeq || !state.cameraEnabled || state.cameraMode === 'none') {
        if (stream) stream.getTracks().forEach(t => t.stop());
        return;
      }

      activeCameraStream = stream;
      activeCameraDeviceId = requestKey;
      cameraVideo.srcObject = stream;
      cameraVideo.muted = true;
      cameraVideo.style.display = 'block';
      cameraVideo.classList.add('camera-active');
      cameraVideo.style.opacity = '1';
      await cameraVideo.play().catch(e => console.warn('Camera play error:', e));
    } catch (err) {
      console.error('[Display Camera] All camera initialization attempts failed:', err);
    } finally {
      if (cameraOpeningKey === requestKey) {
        cameraOpeningKey = null;
      }
    }
  }

  // =========================================================================
  // STATE APPLICATION ENGINE
  // =========================================================================
  if (window.zionApi && window.zionApi.getRemoteInfo) {
    window.zionApi.getRemoteInfo().then(i => {
      if (i && i.port) {
        window.__zcPort = i.port;
        state.remotePort = i.port;
      }
    }).catch(() => {});
  }

  if (window.zionApi && window.zionApi.getDisplayState) {
    window.zionApi.getDisplayState().then(initialState => {
      if (initialState) {
        if (initialState.remotePort) window.__zcPort = initialState.remotePort;
        applyDisplayState(initialState);
      }
    }).catch(() => {});
  }

  function applyDisplayState(newState) {
    state = { ...state, ...newState };

    // 1. Blackout Curtain
    if (state.blackout) {
      blackoutCurtain.classList.add('blackout-active');
    } else {
      blackoutCurtain.classList.remove('blackout-active');
    }

    // 1b. Master Hardware-Composited Brightness & Image Brightness Booster (0% - 200%)
    const bVal = typeof state.brightness === 'number' ? Math.max(0, Math.min(200, state.brightness)) : 100;

    if (bVal <= 100) {
      // 0% - 100%: Smooth zero-lag hardware dimmer curtain
      if (dimmerCurtain) {
        dimmerCurtain.style.opacity = (100 - bVal) / 100;
      }
      if (mediaImg) mediaImg.style.filter = 'none';
      if (mediaVideo) mediaVideo.style.filter = 'none';
      if (cameraVideo) cameraVideo.style.filter = 'none';
      if (canvas) canvas.style.filter = 'none';
      if (scrim) scrim.style.opacity = '1';
    } else {
      // 101% - 200%: Active brightness amplification! Makes dark images/cameras bright & vivid
      if (dimmerCurtain) {
        dimmerCurtain.style.opacity = '0';
      }
      const boostFactor = bVal / 100;
      // Exponential luminous amplification with contrast tuning to keep colors punchy
      const boostFilter = `brightness(${boostFactor}) contrast(${1 + (boostFactor - 1) * 0.15}) saturate(${1 + (boostFactor - 1) * 0.1})`;
      if (mediaImg) mediaImg.style.filter = boostFilter;
      if (mediaVideo) mediaVideo.style.filter = boostFilter;
      if (cameraVideo) cameraVideo.style.filter = boostFilter;
      if (canvas) canvas.style.filter = boostFilter;

      // Allow the boosted brightened image to shine through the scrim
      if (scrim) {
        const extraRatio = (bVal - 100) / 100;
        scrim.style.opacity = Math.max(0.15, 1 - extraRatio * 0.75);
      }
    }

    if (newState && newState.remotePort) {
      window.__zcPort = newState.remotePort;
    }

    const hasSlideLyrics = !!(state.activeSlide && state.activeSlide.body && state.activeSlide.body.trim().length > 0);
    const showLyricsNow = hasSlideLyrics && !state.clearText && !state.themeOnly && !state.blackout;

    // 2. Hardware Video Camera
    setupCameraFeed(state.cameraDeviceId, state.cameraMode, state.cameraDeviceLabel);

    // 3. Contrast Scrim Layer & Camera Layer Z-Index
    if (state.cameraEnabled && state.cameraMode === 'preacher') {
      // Full preacher camera mode: place camera above scrim (z-index 6) so pastor feed is 100% bright & crisp,
      // while still below textContainer (z-index 10) if scripture/lyrics are projected over the preacher!
      scrim.style.background = 'rgba(0, 0, 0, 0.05)';
      cameraVideo.style.zIndex = '6';
    } else if (state.cameraEnabled && state.cameraMode === 'background') {
      // Worship background camera mode: dimmer scrim (z-index 4) protects lyric legibility over camera (z-index 3)
      const opacity = state.cameraOpacity !== undefined ? state.cameraOpacity : 0.75;
      scrim.style.background = `rgba(0, 0, 0, ${opacity})`;
      cameraVideo.style.zIndex = '3';
    } else {
      // Normal procedural / media background: gentle ambient scrim
      scrim.style.background = 'rgba(0, 0, 0, 0.4)';
      cameraVideo.style.zIndex = '3';
    }

    function formatMediaUrl(url) {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('data:')) {
        return url;
      }
      return 'file:///' + url.replace(/\\/g, '/');
    }

    // 4. Custom Local Media & YouTube Live Backgrounds with Smooth Crossfade
    const youtubeLayer = document.getElementById('display-youtube-layer');
    const youtubeIframe = document.getElementById('display-youtube-iframe');

    if (state.backgroundType === 'youtube' && state.youtubeVideoId) {
      canvas.style.opacity = '0';
      mediaImg.classList.remove('media-active');
      mediaVideo.classList.remove('media-active');
      mediaImg.style.display = 'none';
      mediaVideo.style.display = 'none';

      if (youtubeLayer && youtubeIframe) {
        youtubeLayer.style.display = 'block';
        youtubeLayer.classList.add('youtube-active');
        youtubeLayer.style.opacity = '1';
        // When lyrics are actively shown over a YouTube Worship Background, keep YouTube at z-index 3 beneath scrim & lyrics;
        // when playing Fullscreen YouTube Live TV (no lyrics / text cleared), raise to z-index 15!
        youtubeLayer.style.zIndex = showLyricsNow ? '3' : '15';
        youtubeLayer.style.pointerEvents = showLyricsNow ? 'none' : 'auto';
        const muteParam = state.youtubeMuted ? 1 : 0;
        const embedPort = state.remotePort || window.__zcPort || 3000;
        const targetUrl = `http://127.0.0.1:${embedPort}/embed?v=${encodeURIComponent(state.youtubeVideoId)}&autoplay=1&mute=${muteParam}`;
        if (youtubeIframe.dataset.loadedUrl !== targetUrl) {
          youtubeIframe.dataset.loadedUrl = targetUrl;
          youtubeIframe.src = targetUrl;
        }
      }
    } else {
      if (youtubeLayer && youtubeIframe) {
        youtubeLayer.classList.remove('youtube-active');
        youtubeLayer.style.zIndex = '3';
        youtubeLayer.style.pointerEvents = 'none';
        setTimeout(() => {
          if (state.backgroundType !== 'youtube') {
            youtubeLayer.style.display = 'none';
            youtubeIframe.dataset.loadedUrl = '';
            youtubeIframe.src = 'about:blank';
          }
        }, 350);
      }

      if (state.cameraEnabled && state.cameraMode !== 'none') {
        // Hide custom static/video media so hardware camera layer is completely unobstructed
        mediaImg.classList.remove('media-active');
        mediaVideo.classList.remove('media-active');
        mediaImg.style.display = 'none';
        mediaVideo.style.display = 'none';
        canvas.style.display = 'block';
        canvas.style.opacity = '1';
      } else if (state.backgroundType === 'video' && state.customBgUrl) {
        canvas.style.opacity = '0';
        mediaImg.classList.remove('media-active');
        mediaImg.style.display = 'none';
        mediaVideo.style.display = 'block';
        const formatted = formatMediaUrl(state.customBgUrl);
        if (mediaVideo.src !== formatted) {
          mediaVideo.src = formatted;
          mediaVideo.play().catch(e => console.warn('Video bg autoplay prevented:', e));
        }
        mediaVideo.classList.add('media-active');
      } else if (state.backgroundType === 'image' && state.customBgUrl) {
        canvas.style.opacity = '0';
        mediaVideo.classList.remove('media-active');
        mediaVideo.style.display = 'none';
        mediaImg.style.display = 'block';
        mediaImg.src = formatMediaUrl(state.customBgUrl);
        mediaImg.classList.add('media-active');
      } else {
        // Procedural canvas mode
        mediaVideo.classList.remove('media-active');
        mediaImg.classList.remove('media-active');
        setTimeout(() => {
          if (state.backgroundType === 'procedural') {
            mediaVideo.style.display = 'none';
            mediaImg.style.display = 'none';
          }
        }, 350);
        canvas.style.display = 'block';
        canvas.style.opacity = '1';
      }
    }

    // 5. Text Styling, Visibility & Smooth Slide Crossfade
    const isYouTubePlaying = state.backgroundType === 'youtube' || (state.activeItem && state.activeItem.type === 'youtube');

    if (!showLyricsNow) {
      if (isYouTubePlaying || (state.cameraEnabled && state.cameraMode === 'preacher')) {
        if (scrim) {
          scrim.style.opacity = '0';
          scrim.style.pointerEvents = 'none';
        }
      }
      if (!hasSlideLyrics) {
        textContainer.style.display = 'none';
      } else {
        textContainer.style.display = 'flex';
      }
    } else {
      textContainer.style.display = 'flex';
      if (scrim) {
        if (state.backgroundType === 'youtube') {
          scrim.style.opacity = '0.4';
          scrim.style.pointerEvents = 'none';
        } else if (bVal <= 100) {
          scrim.style.opacity = '1';
          scrim.style.pointerEvents = 'none';
        }
      }
    }

    const isTextHidden = state.clearText || state.themeOnly || state.blackout || !state.activeSlide || !hasSlideLyrics;

    if (isTextHidden) {
      textContainer.classList.add('fade-out');
      lastSlideSignature = '';
    } else {
      const currentSignature = `${state.activeSlide.label || ''}__${state.activeSlide.body || ''}`;

      const applySlideContent = () => {
        // Update slide title / label badge (prevent duplicate text if title and label are identical)
        if (state.activeSlide.label || state.activeItem) {
          const itemTitle = state.activeItem ? state.activeItem.title : '';
          const slideLabel = state.activeSlide.label || '';
          if (itemTitle && slideLabel) {
            badgeTitle.textContent = (itemTitle.trim() === slideLabel.trim()) ? itemTitle : `${itemTitle} • ${slideLabel}`;
          } else {
            badgeTitle.textContent = itemTitle || slideLabel;
          }
          if (isYouTubePlaying && !hasSlideLyrics) {
            badgeTitle.style.display = 'none';
          } else {
            badgeTitle.style.display = 'block';
          }
        } else {
          badgeTitle.style.display = 'none';
        }

        // Update slide body: support standard text & parallel dual-Bible comparison
        if (state.activeSlide.isDualComparison && state.activeSlide.dualPrimary && state.activeSlide.dualSecondary) {
          bodyText.innerHTML = `
            <div class="display-dual-comparison">
              <div class="dual-col dual-col-primary">
                <div class="dual-col-header">${escapeHtmlDisplay(state.activeSlide.dualPrimary.label || 'PRIMARY')}</div>
                <div class="dual-col-text">"${escapeHtmlDisplay(state.activeSlide.dualPrimary.text || '')}"</div>
              </div>
              <div class="dual-col-divider"></div>
              <div class="dual-col dual-col-secondary">
                <div class="dual-col-header">${escapeHtmlDisplay(state.activeSlide.dualSecondary.label || 'SECONDARY')}</div>
                <div class="dual-col-text">"${escapeHtmlDisplay(state.activeSlide.dualSecondary.text || '')}"</div>
              </div>
            </div>
          `;
        } else {
          bodyText.textContent = state.activeSlide.body || '';
        }

        // Apply dynamic typography & legibility properties
        bodyText.style.fontSize = `${state.fontSize || 44}px`;
        bodyText.style.fontFamily = `${state.fontFamily || 'Outfit'}, sans-serif`;
        bodyText.style.color = state.fontColor || '#ffffff';
        bodyText.style.textAlign = state.textAlign || 'center';
        bodyText.style.paintOrder = 'stroke fill';

        // Text stroke outline
        const strokeW = state.strokeWidth !== undefined ? state.strokeWidth : 0;
        const strokeC = state.strokeColor || '#000000';
        if (strokeW > 0) {
          bodyText.style.webkitTextStroke = `${strokeW}px ${strokeC}`;
        } else {
          bodyText.style.webkitTextStroke = 'none';
        }

        // Drop shadow
        if (state.dropShadow) {
          bodyText.style.textShadow = '0 4px 24px rgba(0, 0, 0, 0.95), 0 2px 8px rgba(0, 0, 0, 0.9)';
        } else {
          bodyText.style.textShadow = 'none';
        }
      };

      if (lastSlideSignature && lastSlideSignature !== currentSignature) {
        // Smooth slide cross-dissolve
        textContainer.classList.add('slide-swapping');
        setTimeout(() => {
          applySlideContent();
          textContainer.classList.remove('slide-swapping');
          textContainer.classList.remove('fade-out');
        }, 110);
      } else {
        applySlideContent();
        textContainer.classList.remove('fade-out');
        textContainer.classList.remove('slide-swapping');
      }

      lastSlideSignature = currentSignature;
    }

    // 6. Nursery / Congregation Alert Ticker Banner (Enhanced with Themes, Layouts & Timers)
    if (state.bannerActive && state.bannerText) {
      if (activeBannerTimer) {
        clearTimeout(activeBannerTimer);
        activeBannerTimer = null;
      }

      const style = state.bannerStyle || 'urgent-red';
      const layout = state.bannerLayout || 'bar';

      let icon = '📢';
      if (style === 'urgent-red') icon = '🚨';
      else if (style === 'amber-warning') icon = '⚠️';
      else if (style === 'royal-blue') icon = '📢';
      else if (style === 'celebration-green') icon = '🕊️';
      else if (style === 'obsidian-glass') icon = '✨';

      ticker.className = `display-ticker-banner active ${style} layout-${layout}`;

      if (layout === 'marquee') {
        const itemHtml = `<span>${icon} ${escapeHtmlDisplay(state.bannerText)}</span>`;
        ticker.innerHTML = `<div class="marquee-inner">${itemHtml}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${itemHtml}</div>`;
      } else {
        ticker.innerHTML = `<span style="font-size: 1.1em; flex-shrink: 0;">${icon}</span> <span>${escapeHtmlDisplay(state.bannerText)}</span>`;
      }

      const autoDismissSec = parseInt(state.bannerAutoDismiss, 10) || 0;
      if (autoDismissSec > 0) {
        activeBannerTimer = setTimeout(() => {
          ticker.classList.remove('active');
          state.bannerActive = false;
        }, autoDismissSec * 1000);
      }
    } else {
      if (activeBannerTimer) {
        clearTimeout(activeBannerTimer);
        activeBannerTimer = null;
      }
      ticker.classList.remove('active');
    }

    // 7. Pre-Service Countdown Timer Overlay Layer
    const countdownLayer = document.getElementById('display-countdown-layer');
    const countdownTitle = document.getElementById('display-countdown-title');
    const countdownDigits = document.getElementById('display-countdown-digits');
    const countdownSub = document.getElementById('display-countdown-sub');

    if (countdownLayer && countdownDigits) {
      if (state.countdownActive && state.countdownRemaining !== undefined) {
        countdownLayer.classList.add('active');
        if (countdownTitle) countdownTitle.textContent = state.countdownTitle || 'SERVICE BEGINS IN';
        const rem = Math.max(0, Math.floor(state.countdownRemaining));
        const m = Math.floor(rem / 60);
        const s = rem % 60;
        countdownDigits.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        if (countdownSub) {
          if (rem <= 0) {
            countdownDigits.textContent = '00:00';
            countdownSub.textContent = '✨ Welcome to Zion Sanctuary • Service Has Begun ✨';
          } else {
            countdownSub.textContent = state.countdownSub || 'Welcome to Worship • Please take your seats';
          }
        }
      } else {
        countdownLayer.classList.remove('active');
      }
    }

    // 8. Live Sanctuary Clock Overlay for Entire Congregation
    const sanctuaryClock = document.getElementById('display-sanctuary-clock');
    const clockText = document.getElementById('display-clock-text');
    if (sanctuaryClock && clockText) {
      if (state.showClockOnTv) {
        sanctuaryClock.classList.add('visible');
        if (!window.__sanctuaryClockInterval) {
          const updateClock = () => {
            const now = new Date();
            clockText.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          };
          updateClock();
          window.__sanctuaryClockInterval = setInterval(updateClock, 1000);
        }
      } else {
        sanctuaryClock.classList.remove('visible');
        if (window.__sanctuaryClockInterval) {
          clearInterval(window.__sanctuaryClockInterval);
          window.__sanctuaryClockInterval = null;
        }
      }
    }
  }

  // =========================================================================
  // IPC LISTENER (ELECTRON PRELOAD)
  // =========================================================================
  if (window.zionApi && window.zionApi.onDisplayStateUpdate) {
    window.zionApi.onDisplayStateUpdate((payload) => {
      applyDisplayState(payload);
    });
  }

  // Keyboard shortcut for display window (e.g. F11 Fullscreen toggle)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      if (window.zionApi && window.zionApi.toggleFullscreen) {
        window.zionApi.toggleFullscreen();
      }
    }
  });

})();

  // Auto-hide mouse cursor after 2.5s of inactivity on TV output
  let cursorHideTimer = null;
  window.addEventListener('mousemove', () => {
    document.body.style.cursor = 'default';
    clearTimeout(cursorHideTimer);
    cursorHideTimer = setTimeout(() => {
      document.body.style.cursor = 'none';
    }, 2500);
  });
