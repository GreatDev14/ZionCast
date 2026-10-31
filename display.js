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
    cameraOpacity: 0.75,
    bannerText: '',
    bannerActive: false,
    brightness: 100
  };

  let activeCameraStream = null;
  let activeCameraDeviceId = null;

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
    }

    animationFrameId = requestAnimationFrame(renderProceduralLoop);
  }

  // Start background procedural render loop
  renderProceduralLoop();

  // =========================================================================
  // HARDWARE VIDEO LAYER (DroidCam, OBS, HDMI Capture, USB)
  // =========================================================================
  async function setupCameraFeed(deviceId, mode) {
    if (mode === 'none' || !deviceId) {
      if (activeCameraStream) {
        activeCameraStream.getTracks().forEach(track => track.stop());
        activeCameraStream = null;
      }
      cameraVideo.srcObject = null;
      cameraVideo.style.display = 'none';
      activeCameraDeviceId = null;
      return;
    }

    // If device hasn't changed and stream is still alive, keep playing without re-negotiating
    const isStreamAlive = activeCameraStream && activeCameraStream.getVideoTracks().some(t => t.readyState === 'live');
    if (isStreamAlive && activeCameraDeviceId === deviceId) {
      cameraVideo.style.display = 'block';
      if (cameraVideo.paused) {
        cameraVideo.play().catch(e => console.warn('Camera video play error:', e));
      }
      return;
    }

    // Stop previous stream if device changed or dead
    if (activeCameraStream) {
      activeCameraStream.getTracks().forEach(track => track.stop());
      activeCameraStream = null;
    }

    try {
      const constraints = {
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      cameraVideo.srcObject = stream;
      cameraVideo.muted = true;
      cameraVideo.style.display = 'block';
      activeCameraStream = stream;
      activeCameraDeviceId = deviceId;
      cameraVideo.play().catch(e => console.warn('Camera play error:', e));
    } catch (err) {
      console.warn('Failed to access camera device with exact constraints, falling back:', err);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: deviceId },
          audio: false
        });
        cameraVideo.srcObject = stream;
        cameraVideo.muted = true;
        cameraVideo.style.display = 'block';
        activeCameraStream = stream;
        activeCameraDeviceId = deviceId;
        cameraVideo.play().catch(e => console.warn('Fallback camera play error:', e));
      } catch (e) {
        console.error('All camera initialization attempts failed:', e);
      }
    }
  }

  // =========================================================================
  // STATE APPLICATION ENGINE
  // =========================================================================
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

    // 2. Hardware Video Camera
    setupCameraFeed(state.cameraDeviceId, state.cameraMode);

    // 3. Contrast Scrim Layer
    if (state.cameraMode === 'preacher') {
      // In full preacher mode, remove or minimize scrim so congregation sees pastor clearly
      scrim.style.background = 'rgba(0, 0, 0, 0.1)';
      cameraVideo.style.zIndex = '5';
    } else if (state.cameraMode === 'background') {
      // Worship background mode: dimmer protects lyric legibility
      const opacity = state.cameraOpacity !== undefined ? state.cameraOpacity : 0.75;
      scrim.style.background = `rgba(0, 0, 0, ${opacity})`;
      cameraVideo.style.zIndex = '3';
    } else {
      // Normal procedural background: gentle ambient scrim
      scrim.style.background = 'rgba(0, 0, 0, 0.4)';
    }

    function formatMediaUrl(url) {
      if (!url) return '';
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('data:')) {
        return url;
      }
      return 'file:///' + url.replace(/\\/g, '/');
    }

    // 4. Custom Local Media Backgrounds
    if (state.backgroundType === 'video' && state.customBgUrl) {
      canvas.style.display = 'none';
      mediaImg.style.display = 'none';
      mediaVideo.style.display = 'block';
      const formatted = formatMediaUrl(state.customBgUrl);
      if (mediaVideo.src !== formatted) {
        mediaVideo.src = formatted;
        mediaVideo.play().catch(e => console.warn('Video bg autoplay prevented:', e));
      }
    } else if (state.backgroundType === 'image' && state.customBgUrl) {
      canvas.style.display = 'none';
      mediaVideo.style.display = 'none';
      mediaImg.style.display = 'block';
      mediaImg.src = formatMediaUrl(state.customBgUrl);
    } else {
      // Procedural canvas mode
      canvas.style.display = 'block';
      mediaVideo.style.display = 'none';
      mediaImg.style.display = 'none';
    }

    // 5. Text Styling & Visibility
    const isTextHidden = state.clearText || state.themeOnly || state.blackout || !state.activeSlide;

    if (isTextHidden) {
      textContainer.classList.add('fade-out');
    } else {
      textContainer.classList.remove('fade-out');

      // Update slide title / label badge
      if (state.activeSlide.label || state.activeItem) {
        const itemTitle = state.activeItem ? state.activeItem.title : '';
        const slideLabel = state.activeSlide.label || '';
        badgeTitle.textContent = itemTitle && slideLabel ? `${itemTitle} • ${slideLabel}` : (itemTitle || slideLabel);
        badgeTitle.style.display = 'block';
      } else {
        badgeTitle.style.display = 'none';
      }

      // Update slide body
      bodyText.textContent = state.activeSlide.body || '';

      // Apply dynamic typography & legibility properties
      bodyText.style.fontSize = `${state.fontSize || 44}px`;
      bodyText.style.fontFamily = `${state.fontFamily || 'Outfit'}, sans-serif`;
      bodyText.style.color = state.fontColor || '#ffffff';
      bodyText.style.textAlign = state.textAlign || 'center';
      bodyText.style.paintOrder = 'stroke fill';

      // Text stroke outline (paint-order: stroke fill ensures the stroke stays outside and never turns text black)
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
    }

    // 6. Nursery / Congregation Alert Ticker Banner
    if (state.bannerActive && state.bannerText) {
      ticker.textContent = state.bannerText;
      ticker.classList.add('active');
    } else {
      ticker.classList.remove('active');
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
