/**
 * ZionCast Audience TV / Projector Display Engine
 * Zero-latency real-time synchronization, procedural motion loops,
 * direct hardware camera feeds, and high-legibility typography rendering.
 */

(() => {
  // DOM Elements
  const canvas = document.getElementById('display-canvas');
  const ctx = canvas.getContext('2d');
  const camLayerA = document.getElementById('display-camera-layer');
  const camLayerB = document.getElementById('display-camera-layer-alt');
  let activeCamLayerIdx = 0;
  let cameraVideo = camLayerA;
  let camFadeOutTimer = null;
  function getActiveCameraVideoEl() { return activeCamLayerIdx === 0 ? camLayerA : camLayerB; }
  function getStandbyCameraVideoEl() { return activeCamLayerIdx === 0 ? camLayerB : camLayerA; }
  const wcamIframe = document.getElementById('display-wcam-iframe');
  const mediaVideo = document.getElementById('display-video-bg');
  const mediaImg = document.getElementById('display-img-bg');
  const scrim = document.getElementById('display-scrim');
  const textContainer = document.getElementById('display-text-container');
  const badgeTitle = document.getElementById('display-badge');
  const bodyText = document.getElementById('display-body');
  const subtitleText = document.getElementById('display-subtitle');
  const ticker = document.getElementById('display-ticker');
  const dimmerCurtain = document.getElementById('display-dimmer');
  const blackoutCurtain = document.getElementById('display-blackout');

  // BroadcastChannel Fallback for cross-window sync (only used when Electron IPC is unavailable)
  let syncChannel = null;
  if (!window.zionApi || !window.zionApi.onDisplayStateUpdate) {
    try {
      syncChannel = new BroadcastChannel('zioncast-sync');
      syncChannel.onmessage = (event) => {
        if (event.data) applyDisplayState(event.data);
      };
    } catch (err) {
      console.warn('BroadcastChannel not supported, relying strictly on Electron IPC:', err);
    }
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
    videoMuted: false,
    videoPaused: false,
    videoLoop: true,
    videoVolume: 1.0,
    videoRestartSeq: 0,
    videoPlaybackRate: 1.0,
    videoBgScrimOpacity: 0.42,
    videoAudioSinkId: '',
    cameraEnabled: false,
    cameraMode: 'none',
    cameraDeviceId: '',
    cameraDeviceLabel: '',
    wirelessCamViewUrl: '',
    prewarmCamDeviceId: '',
    prewarmWcamUrl: '',
    cameraOpacity: 0.75,
    cameraStabilization: 'off',
    cameraWatermarkEnabled: true,
    cameraWatermarkMode: 'default',
    cameraWatermarkText: '',
    cameraWatermarkSubtext: '',
    cameraWatermarkImage: '',
    cameraWatermarkLogoShape: 'rounded',
    cameraWatermarkLayout: 'row',
    cameraWatermarkStyle: 'glass',
    cameraWatermarkPosition: 'bottom-right',
    cameraWatermarkCustomX: 88,
    cameraWatermarkCustomY: 88,
    cameraWatermarkScale: 1.0,
    cameraWatermarkMargin: 30,
    cameraWatermarkFont: 'Inter',
    cameraWatermarkWeight: 400,
    cameraWatermarkColor: '#f8fafc',
    cameraWatermarkOpacity: 0.88,
    cameraWatermarkSize: 'medium',
    cameraWatermarkScope: 'cameras',
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
  let offlineWcamSlot = null;
  let offlineWcamPc = null;
  let offlineWcamSse = null;
  let offlineWcamPendingIce = [];
  const offlineWcamViewerId = 'tv-' + Math.random().toString(36).slice(2, 8);
  let activeBannerTimer = null;
  let lastSlideSignature = '';

  function escapeHtmlDisplay(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatMediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('file://') || url.startsWith('data:') || url.startsWith('blob:')) {
      return url;
    }
    const normalized = url.replace(/\\/g, '/');
    const encoded = normalized
      .split('/')
      .map((seg, idx) => (idx === 0 && /^[a-zA-Z]:$/.test(seg)) ? seg : encodeURIComponent(seg))
      .join('/');
    return encoded.startsWith('/') ? 'file://' + encoded : 'file:///' + encoded;
  }

  function syncCameraWatermarkOverlay() {
    const watermarkWrap = document.getElementById('display-camera-watermark');
    const watermarkLogo = document.getElementById('display-watermark-logo');
    const watermarkText = document.getElementById('display-watermark-text');
    const watermarkSubtext = document.getElementById('display-watermark-subtext');
    if (!watermarkWrap) return;

    const validPositions = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right', 'custom'];
    const pos = validPositions.includes(state.cameraWatermarkPosition) ? state.cameraWatermarkPosition : 'bottom-right';
    const validSizes = ['small', 'medium', 'large'];
    const sz = validSizes.includes(state.cameraWatermarkSize) ? state.cameraWatermarkSize : 'medium';
    const validStyles = ['glass', 'clean', 'light', 'solid', 'gold'];
    const styleVariant = validStyles.includes(state.cameraWatermarkStyle) ? state.cameraWatermarkStyle : 'glass';
    const validLayouts = ['row', 'row-reverse', 'column'];
    const layoutVariant = validLayouts.includes(state.cameraWatermarkLayout) ? state.cameraWatermarkLayout : 'row';
    const validShapes = ['square', 'rounded', 'circle'];
    const shapeVariant = validShapes.includes(state.cameraWatermarkLogoShape) ? state.cameraWatermarkLogoShape : 'rounded';
    const scope = state.cameraWatermarkScope === 'always' ? 'always' : 'cameras';

    const isCustom = state.cameraWatermarkMode === 'custom';
    const rawLogo = isCustom ? String(state.cameraWatermarkImage || '').trim() : 'assets/icon.png';
    const logoSrc = isCustom ? (rawLogo ? formatMediaUrl(rawLogo) : '') : rawLogo;
    const textVal = isCustom ? String(state.cameraWatermarkText || '').trim() : 'ZionCast';
    const subVal = isCustom ? String(state.cameraWatermarkSubtext || '').trim() : '';

    if (watermarkLogo) {
      if (logoSrc) {
        if (watermarkLogo.dataset.loadedSrc !== logoSrc) {
          watermarkLogo.dataset.loadedSrc = logoSrc;
          watermarkLogo.onerror = () => { watermarkLogo.style.display = 'none'; };
          watermarkLogo.src = logoSrc;
        }
        watermarkLogo.style.display = 'block';
      } else {
        watermarkLogo.dataset.loadedSrc = '';
        watermarkLogo.style.display = 'none';
      }
    }

    if (watermarkText) {
      watermarkText.textContent = textVal;
      watermarkText.style.display = textVal ? 'inline-block' : 'none';
    }
    if (watermarkSubtext) {
      watermarkSubtext.textContent = subVal;
      watermarkSubtext.style.display = subVal ? 'inline-block' : 'none';
    }
    const textCol = watermarkWrap.querySelector('.watermark-text-col');
    if (textCol) {
      textCol.style.display = (textVal || subVal) ? 'flex' : 'none';
    }

    const hasContent = !!(logoSrc || textVal || subVal);
    const cameraActiveNow = !!(state.cameraEnabled && state.cameraMode !== 'none');
    const camElementRevealed = [camLayerA, camLayerB, wcamIframe].some(el =>
      el && el.style.display !== 'none' && el.classList.contains('camera-active')
    );
    const camVisiblyReady = camElementRevealed || state.cameraMode === 'background';
    const scopeOk = scope === 'always' || (cameraActiveNow && camVisiblyReady);
    const shouldShow = scopeOk && state.cameraWatermarkEnabled !== false && hasContent && !state.blackout;

    const classes = [
      'display-camera-watermark',
      'pos-' + pos,
      'size-' + sz,
      'style-' + styleVariant,
      'layout-' + layoutVariant,
      'shape-' + shapeVariant
    ];
    if (pos === 'top-right' && state.showClockOnTv) classes.push('clock-offset');
    if (pos.startsWith('bottom-') && state.bannerActive && (state.bannerLayout || 'bar') === 'bar') classes.push('banner-offset');
    if (logoSrc && !textVal && !subVal) classes.push('image-only');
    if (shouldShow) classes.push('visible');
    watermarkWrap.className = classes.join(' ');

    const scale = Math.max(0.6, Math.min(1.8, Number(state.cameraWatermarkScale ?? 1.0) || 1.0));
    const margin = Math.max(8, Math.min(120, Number(state.cameraWatermarkMargin ?? 30) || 30));
    const weight = [300, 400, 500, 700].includes(Number(state.cameraWatermarkWeight)) ? Number(state.cameraWatermarkWeight) : 400;
    const fontFam = String(state.cameraWatermarkFont || 'Inter').trim() || 'Inter';
    const rawColor = String(state.cameraWatermarkColor || '#f8fafc').trim();
    const resolvedColor = (styleVariant === 'light' && rawColor.toLowerCase() === '#f8fafc') ? '#0f172a' : rawColor;

    watermarkWrap.style.setProperty('--wm-scale', String(scale));
    watermarkWrap.style.setProperty('--wm-margin-x', margin + 'px');
    watermarkWrap.style.setProperty('--wm-margin-y', margin + 'px');
    watermarkWrap.style.setProperty('--wm-font', `'${fontFam}', 'Inter', 'Outfit', 'Segoe UI', system-ui, sans-serif`);
    watermarkWrap.style.setProperty('--wm-weight', String(weight));
    watermarkWrap.style.setProperty('--wm-color', resolvedColor);

    if (pos === 'custom') {
      const cx = Math.max(4, Math.min(96, Number(state.cameraWatermarkCustomX ?? 88)));
      const cy = Math.max(4, Math.min(96, Number(state.cameraWatermarkCustomY ?? 88)));
      watermarkWrap.style.left = cx + '%';
      watermarkWrap.style.top = cy + '%';
      watermarkWrap.style.right = 'auto';
      watermarkWrap.style.bottom = 'auto';
      watermarkWrap.style.transform = `translate(-${cx}%, -${cy}%)`;
    } else {
      watermarkWrap.style.left = '';
      watermarkWrap.style.top = '';
      watermarkWrap.style.right = '';
      watermarkWrap.style.bottom = '';
      watermarkWrap.style.transform = '';
    }

    const targetOpacity = Math.max(0.15, Math.min(1, Number(state.cameraWatermarkOpacity ?? 0.88)));
    watermarkWrap.style.opacity = shouldShow ? String(targetOpacity) : '0';
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
    // Pause procedural 2D canvas drawing completely when video, image, youtube, blackout, or ANY camera mode (preacher OR worship background) is active.
    // This frees 100% of GPU & CPU for zero-lag hardware video decoding and camera playback!
    if (
      state.blackout ||
      state.backgroundType === 'video' ||
      state.backgroundType === 'image' ||
      state.backgroundType === 'youtube' ||
      (state.cameraEnabled && state.cameraMode !== 'none')
    ) {
      animationFrameId = requestAnimationFrame(renderProceduralLoop);
      return;
    }

    animTime += 0.015;
    const w = canvas.width;
    const h = canvas.height;
    const bgId = state.backgroundId || 'celestial-clouds';

    if (window.ZionWorshipMotion && typeof window.ZionWorshipMotion.renderFrame === 'function') {
      window.ZionWorshipMotion.renderFrame(ctx, w, h, animTime, bgId, particles);
    } else {
      ctx.fillStyle = '#0f172a';
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
        // 1. Exact match first
        const exactLabel = cams.find(c => (c.label || '').toLowerCase().trim() === cleanReq);
        if (exactLabel && exactLabel.deviceId) return exactLabel.deviceId;

        // 2. Numbered match (e.g. #2, #3, #4 or Cam 2, Cam 3, Cam 4) - critical for Iriun Cam 1, 2, 3, 4!
        const numMatch = cleanReq.match(/#\s*(\d+)|cam(?:era)?\s*(\d+)|\((\d+)\)/i);
        if (numMatch) {
          const num = numMatch[1] || numMatch[2] || numMatch[3];
          const byNum = cams.find(c => {
            const lbl = (c.label || '').toLowerCase();
            return lbl.includes('#' + num) || lbl.includes('camera ' + num) || lbl.includes('cam ' + num) || lbl.includes('(' + num + ')');
          });
          if (byNum && byNum.deviceId) return byNum.deviceId;
        }

        // 3. Substring match
        const byLabel = cams.find(c => {
          const lbl = (c.label || '').toLowerCase().trim();
          return lbl && lbl.includes(cleanReq);
        });
        if (byLabel && byLabel.deviceId) return byLabel.deviceId;
      }

      // Priority virtual/broadcast cameras if exact ID wasn't scoped to this window
      const preferred = cams.find(c => /iriun|irium|camo|droidcam|droid|obs|capture|elgato|hdmi|atem/i.test(c.label || ''));
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
        video: { deviceId: { exact: resolvedId }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false
      });
      attempts.push({
        video: { deviceId: { exact: resolvedId }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      attempts.push({
        video: { deviceId: { exact: resolvedId } },
        audio: false
      });
    } else {
      attempts.push({
        video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } },
        audio: false
      });
      attempts.push({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      attempts.push({ video: true, audio: false });
    }

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

  function stopOfflineWirelessCamFeed() {
    const prevSlot = offlineWcamSlot;
    offlineWcamSlot = null;
    offlineWcamPendingIce = [];
    if (offlineWcamPc) {
      try { offlineWcamPc.close(); } catch (_) {}
      offlineWcamPc = null;
    }
    if (offlineWcamSse) {
      try { offlineWcamSse.close(); } catch (_) {}
      offlineWcamSse = null;
    }
    if (prevSlot) {
      const basePort = state.remotePort || window.__zcPort || 3000;
      fetch(`http://127.0.0.1:${basePort}/api/cam-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'viewer-bye',
          targetRole: 'publisher',
          slot: prevSlot,
          viewerId: offlineWcamViewerId
        })
      }).catch(() => {});
    }
  }

  function fadeInCameraElement(el, targetZIndex) {
    if (!el) return;
    el.style.zIndex = targetZIndex || '3';
    el.style.pointerEvents = 'none';
    const wasHidden = el.style.display === 'none' || !el.style.display;
    if (wasHidden) {
      el.style.opacity = '0';
      el.style.display = 'block';
      void el.offsetWidth;
    }
    el.classList.add('camera-active');
    if (el === camLayerA || el === camLayerB) {
      applyZoomToDisplayVideo(el, state.cameraDeviceId || activeRelayDeviceId);
    }
    syncCameraWatermarkOverlay();
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      syncCameraWatermarkOverlay();
    });
  }

  const relayChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('zioncast-wcam-relay') : null;
  const pendingRelayWaiters = new Map();
  const relayPcMap = new Map();
  const relayZoomByDevice = new Map();
  let activeRelayId = '';
  let activeRelayDeviceId = '';

  function applyZoomToDisplayVideo(el, deviceId) {
    if (!el) return;
    const z = relayZoomByDevice.get(String(deviceId || '')) || 1;
    const lvl = window.ZionCameraStabilizer
      ? window.ZionCameraStabilizer.normalizeLevel(state.cameraStabilization)
      : 'off';
    const isLiveLayer = !!(el.srcObject && el.style.display !== 'none' && state.cameraEnabled && state.cameraMode !== 'none');
    if (window.ZionCameraStabilizer && (el === camLayerA || el === camLayerB)) {
      if (isLiveLayer) {
        window.ZionCameraStabilizer.syncVideoTarget(el, { level: lvl, zoom: z });
      } else {
        window.ZionCameraStabilizer.stopVideoTarget(el);
        el.style.transformOrigin = 'center center';
        el.style.transform = z > 1.01 ? `scale(${z.toFixed(2)})` : 'none';
      }
      return;
    }
    el.style.transformOrigin = 'center center';
    el.style.transform = z > 1.01 ? `scale(${z.toFixed(2)})` : 'none';
  }

  if (relayChannel) {
    relayChannel.onmessage = async (ev) => {
      const msg = ev && ev.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'relay-zoom' && msg.deviceId) {
        const z = Math.max(1, Math.min(5, Number(msg.zoom) || 1));
        relayZoomByDevice.set(String(msg.deviceId), z);
        if (String(state.cameraDeviceId || '') === String(msg.deviceId)) {
          applyZoomToDisplayVideo(getActiveCameraVideoEl(), msg.deviceId);
        }
        return;
      }
      if (!msg.relayId) return;
      const waiter = pendingRelayWaiters.get(msg.relayId);
      if (msg.type === 'relay-unavailable') {
        if (waiter) {
          pendingRelayWaiters.delete(msg.relayId);
          waiter.finish(null);
        }
        return;
      }
      if (msg.type === 'relay-offer' && msg.sdp && waiter) {
        if (msg.deviceId && typeof msg.zoom === 'number') {
          relayZoomByDevice.set(String(msg.deviceId), Math.max(1, Math.min(5, msg.zoom)));
        }
        try {
          const pc = new RTCPeerConnection({ iceServers: [] });
          relayPcMap.set(msg.relayId, { pc, pendingIce: [] });
          pc.ontrack = (trkEv) => {
            const stream = (trkEv.streams && trkEv.streams[0]) ? trkEv.streams[0] : new MediaStream([trkEv.track]);
            if (pendingRelayWaiters.has(msg.relayId)) {
              pendingRelayWaiters.delete(msg.relayId);
              waiter.finish(stream);
            }
          };
          pc.onicecandidate = (iceEv) => {
            if (iceEv.candidate) {
              relayChannel.postMessage({
                type: 'relay-ice',
                relayId: msg.relayId,
                candidate: iceEv.candidate.toJSON ? iceEv.candidate.toJSON() : { candidate: iceEv.candidate.candidate, sdpMid: iceEv.candidate.sdpMid, sdpMLineIndex: iceEv.candidate.sdpMLineIndex }
              });
            }
          };
          await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          const entry = relayPcMap.get(msg.relayId);
          if (entry && entry.pendingIce.length) {
            const q = entry.pendingIce.splice(0);
            for (const c of q) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
          const ans = await pc.createAnswer();
          await pc.setLocalDescription(ans);
          relayChannel.postMessage({
            type: 'relay-answer',
            relayId: msg.relayId,
            sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp }
          });
        } catch (_) {
          if (pendingRelayWaiters.has(msg.relayId)) {
            pendingRelayWaiters.delete(msg.relayId);
            waiter.finish(null);
          }
        }
        return;
      }
      if (msg.type === 'relay-ice' && msg.candidate) {
        const entry = relayPcMap.get(msg.relayId);
        if (entry && entry.pc) {
          if (entry.pc.remoteDescription && entry.pc.remoteDescription.type) {
            entry.pc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            entry.pendingIce.push(msg.candidate);
          }
        }
      }
    };
  }

  function closeRelayById(rid) {
    if (!rid) return;
    pendingRelayWaiters.delete(rid);
    const entry = relayPcMap.get(rid);
    if (entry && entry.pc) { try { entry.pc.close(); } catch (_) {} }
    relayPcMap.delete(rid);
    if (relayChannel) relayChannel.postMessage({ type: 'relay-close', relayId: rid });
  }

  function requestRelayStreamFromControl(deviceId, timeoutMs = 2000) {
    if (!relayChannel || !deviceId) return Promise.resolve(null);
    return new Promise((resolve) => {
      const relayId = 'rel-' + Math.random().toString(36).slice(2, 9);
      let settled = false;
      const finish = (stream) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (!stream) closeRelayById(relayId);
        resolve(stream ? { stream, relayId } : null);
      };
      const timer = setTimeout(() => {
        pendingRelayWaiters.delete(relayId);
        finish(null);
      }, timeoutMs);
      pendingRelayWaiters.set(relayId, { finish });
      relayChannel.postMessage({ type: 'relay-request', relayId, deviceId });
    });
  }

  let camCrossfadeSeq = 0;

  function isAnyCameraLayerVisiblyLive() {
    return [camLayerA, camLayerB, wcamIframe].some(el =>
      el && el.style.display !== 'none' && el.style.opacity === '1' && el.classList.contains('camera-active')
    );
  }

  function waitForFirstVideoFrame(videoEl, maxWaitMs = 450) {
    return new Promise((resolve) => {
      if (!videoEl || (videoEl.readyState >= 2 && videoEl.videoWidth > 0)) {
        resolve();
        return;
      }
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        videoEl.removeEventListener('loadeddata', done);
        videoEl.removeEventListener('playing', done);
        videoEl.removeEventListener('canplay', done);
        resolve();
      };
      const timer = setTimeout(done, maxWaitMs);
      videoEl.addEventListener('loadeddata', done, { once: true });
      videoEl.addEventListener('playing', done, { once: true });
      videoEl.addEventListener('canplay', done, { once: true });
      if (typeof videoEl.requestVideoFrameCallback === 'function') {
        try { videoEl.requestVideoFrameCallback(() => done()); } catch (_) {}
      }
    });
  }

  function syncPreacherBackdropOnCameraLive() {
    if (!state.cameraEnabled || state.cameraMode !== 'preacher') return;
    if (scrim) scrim.style.background = 'rgba(0, 0, 0, 0.05)';
    if (state.clearText && textContainer) {
      textContainer.classList.add('fade-out');
      if (subtitleText) {
        subtitleText.classList.remove('active');
        subtitleText.style.display = 'none';
      }
      lastSlideSignature = '';
    }
  }

  function crossfadeToCameraLayer(newEl, mode, stream, opts = {}) {
    if (!newEl) return;
    const prevEl = newEl === camLayerA ? camLayerB : camLayerA;
    const myFadeSeq = ++camCrossfadeSeq;
    if (camFadeOutTimer) {
      clearTimeout(camFadeOutTimer);
      camFadeOutTimer = null;
    }
    if (stream && newEl.srcObject !== stream) {
      newEl.srcObject = stream;
    }
    newEl.muted = true;
    newEl.playsInline = true;
    newEl.style.opacity = '0';
    newEl.style.display = 'block';
    applyZoomToDisplayVideo(newEl, state.cameraDeviceId || activeRelayDeviceId);
    newEl.play().catch(() => {});

    const targetZ = (mode === 'preacher') ? '6' : '3';
    // Keep outgoing camera or slide 100% solid underneath until incoming camera decodes its first real frame!
    waitForFirstVideoFrame(newEl, 450).then(() => {
      if (myFadeSeq !== camCrossfadeSeq) return;
      if (!state.cameraEnabled || state.cameraMode === 'none') return;
      const overPrevZ = prevEl && prevEl.style.display !== 'none' && prevEl.style.opacity !== '0'
        ? String(Math.max(Number(targetZ), Number(prevEl.style.zIndex || targetZ) + 1))
        : targetZ;
      fadeInCameraElement(newEl, overPrevZ);
      activeCamLayerIdx = newEl === camLayerA ? 0 : 1;
      cameraVideo = newEl;
      syncPreacherBackdropOnCameraLive();

      const oldRelay = opts.oldRelayId || '';
      const oldHwStream = opts.oldHwStream || null;
      const oldWcamStop = !!opts.stopOfflineWcam;
      const oldClearVdo = !!opts.clearVdo;

      camFadeOutTimer = setTimeout(() => {
        camFadeOutTimer = null;
        if (myFadeSeq !== camCrossfadeSeq) return;
        newEl.style.zIndex = targetZ;
        if (prevEl && prevEl !== newEl) {
          prevEl.classList.remove('camera-active');
          prevEl.style.opacity = '0';
          prevEl.style.display = 'none';
          prevEl.style.pointerEvents = 'none';
          prevEl.srcObject = null;
        }
        if (state.cameraEnabled && state.cameraMode === 'preacher') {
          if (mediaImg) { mediaImg.classList.remove('media-active'); mediaImg.style.display = 'none'; }
          if (mediaVideo) {
            mediaVideo.classList.remove('media-active');
            mediaVideo.style.display = 'none';
            if (!mediaVideo.paused) { try { mediaVideo.pause(); } catch (_) {} }
            mediaVideo.muted = true;
          }
        }
        if (oldRelay && oldRelay !== activeRelayId) closeRelayById(oldRelay);
        if (oldHwStream && oldHwStream !== activeCameraStream) {
          oldHwStream.getTracks().forEach(t => t.stop());
        }
        if (oldWcamStop) stopOfflineWirelessCamFeed();
        if (oldClearVdo) clearVdoNinjaCamFeed(state.prewarmWcamUrl || '');
      }, 320);
    });
  }

  function fadeOutAllCameraVideoLayers(delayCleanupCb) {
    if (camFadeOutTimer) {
      clearTimeout(camFadeOutTimer);
      camFadeOutTimer = null;
    }
    [camLayerA, camLayerB].forEach(el => {
      if (!el) return;
      if (window.ZionCameraStabilizer) window.ZionCameraStabilizer.stopVideoTarget(el);
      el.classList.remove('camera-active');
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
    });
    camFadeOutTimer = setTimeout(() => {
      camFadeOutTimer = null;
      [camLayerA, camLayerB].forEach(el => {
        if (!el) return;
        if (window.ZionCameraStabilizer) window.ZionCameraStabilizer.stopVideoTarget(el);
        el.style.display = 'none';
        el.style.transform = 'none';
        el.srcObject = null;
      });
      if (typeof delayCleanupCb === 'function') delayCleanupCb();
    }, 300);
  }

  function clearVdoNinjaCamFeed(keepPrewarmUrl = '') {
    if (!wcamIframe) return;
    if (keepPrewarmUrl) {
      if (wcamIframe.dataset.loadedUrl !== keepPrewarmUrl) {
        wcamIframe.dataset.loadedUrl = keepPrewarmUrl;
        wcamIframe.src = keepPrewarmUrl;
      }
      wcamIframe.classList.remove('camera-active');
      wcamIframe.style.opacity = '0';
      wcamIframe.style.zIndex = '2';
      wcamIframe.style.display = 'block';
      wcamIframe.style.pointerEvents = 'none';
      return;
    }
    if (wcamIframe.dataset.loadedUrl) {
      wcamIframe.dataset.loadedUrl = '';
      wcamIframe.src = 'about:blank';
    }
    wcamIframe.classList.remove('camera-active');
    wcamIframe.style.opacity = '0';
    wcamIframe.style.display = 'none';
    wcamIframe.style.pointerEvents = 'none';
  }

  function setupVdoNinjaCamFeed(viewUrl, mode) {
    if (!wcamIframe || !viewUrl) {
      clearVdoNinjaCamFeed('');
      return;
    }
    if (wcamIframe.dataset.loadedUrl !== viewUrl) {
      wcamIframe.dataset.loadedUrl = viewUrl;
      wcamIframe.src = viewUrl;
    }
    fadeInCameraElement(wcamIframe, (mode === 'preacher') ? '6' : '3');
    fadeOutAllCameraVideoLayers(() => {
      if (activeRelayId) { closeRelayById(activeRelayId); activeRelayId = ''; activeRelayDeviceId = ''; }
      if (activeCameraStream) { activeCameraStream.getTracks().forEach(t => t.stop()); activeCameraStream = null; }
      stopOfflineWirelessCamFeed();
    });
  }

  async function setupOfflineWirelessCamFeed(slot, mode, isStandbyPrewarm = false) {
    const cleanSlot = String(slot || '1');
    const shouldShowLive = !isStandbyPrewarm && state.cameraEnabled && mode && mode !== 'none';
    const curEl = getActiveCameraVideoEl();
    if (offlineWcamSlot === cleanSlot && offlineWcamSse && offlineWcamPc && offlineWcamPc.connectionState !== 'failed' && offlineWcamPc.connectionState !== 'closed') {
      if (shouldShowLive) {
        if (curEl.srcObject) {
          fadeInCameraElement(curEl, (mode === 'preacher') ? '6' : '3');
        } else {
          crossfadeToCameraLayer(getStandbyCameraVideoEl(), mode, curEl.srcObject);
        }
      } else {
        curEl.classList.remove('camera-active');
        curEl.style.opacity = '0';
        curEl.style.zIndex = '2';
        curEl.style.display = 'block';
      }
      return;
    }
    stopOfflineWirelessCamFeed();
    offlineWcamSlot = cleanSlot;
    const basePort = state.remotePort || window.__zcPort || 3000;
    const apiBase = `http://127.0.0.1:${basePort}`;

    async function sendWcamSignal(payload) {
      try {
        await fetch(`${apiBase}/api/cam-signal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } catch (_) {}
    }

    async function initiateOfferForSlot() {
      if (offlineWcamSlot !== cleanSlot) return;
      if (offlineWcamPc) {
        try { offlineWcamPc.close(); } catch (_) {}
        offlineWcamPc = null;
      }
      const pc = new RTCPeerConnection({ iceServers: [] });
      offlineWcamPc = pc;
      try {
        const tr = pc.addTransceiver('video', { direction: 'recvonly' });
        if (tr && typeof tr.setCodecPreferences === 'function' && RTCRtpReceiver.getCapabilities) {
          const caps = RTCRtpReceiver.getCapabilities('video');
          if (caps && caps.codecs) {
            const h264 = caps.codecs.filter(c => /h264/i.test(c.mimeType));
            const rest = caps.codecs.filter(c => !/h264/i.test(c.mimeType));
            if (h264.length) tr.setCodecPreferences([...h264, ...rest]);
          }
        }
      } catch (_) {}

      pc.ontrack = (ev) => {
        if (offlineWcamSlot !== cleanSlot) return;
        const stream = (ev.streams && ev.streams[0]) ? ev.streams[0] : new MediaStream([ev.track]);
        const isLiveRightNow = state.cameraEnabled && state.cameraMode !== 'none' && String(state.cameraDeviceId || '') === `wcam-offline:${cleanSlot}`;
        if (isLiveRightNow) {
          crossfadeToCameraLayer(getStandbyCameraVideoEl(), state.cameraMode, stream, {
            oldRelayId: activeRelayId,
            oldHwStream: activeCameraStream,
            clearVdo: true
          });
          activeRelayId = '';
          activeRelayDeviceId = '';
          activeCameraStream = null;
        } else {
          const preEl = getActiveCameraVideoEl();
          preEl.srcObject = stream;
          preEl.play().catch(() => {});
          preEl.classList.remove('camera-active');
          preEl.style.display = 'block';
          preEl.style.opacity = '0';
          preEl.style.zIndex = '2';
          preEl.style.pointerEvents = 'none';
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate && offlineWcamSlot === cleanSlot) {
          sendWcamSignal({
            type: 'ice',
            targetRole: 'publisher',
            slot: cleanSlot,
            viewerId: offlineWcamViewerId,
            candidate: ev.candidate
          });
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (offlineWcamPc !== pc || offlineWcamSlot !== cleanSlot) return;
        if (pc.iceConnectionState === 'failed') {
          setTimeout(() => {
            if (offlineWcamPc === pc && offlineWcamSlot === cleanSlot) {
              initiateOfferForSlot();
            }
          }, 1500);
        }
      };

      try {
        const offer = await pc.createOffer({ offerToReceiveVideo: true });
        await pc.setLocalDescription(offer);
        await sendWcamSignal({
          type: 'offer',
          targetRole: 'publisher',
          slot: cleanSlot,
          viewerId: offlineWcamViewerId,
          sdp: pc.localDescription
        });
      } catch (err) {
        console.warn('[TV Offline WCam Offer Error]', err);
      }
    }

    const sse = new EventSource(`${apiBase}/api/cam-events?role=viewer&viewerId=${encodeURIComponent(offlineWcamViewerId)}`);
    offlineWcamSse = sse;
    sse.onmessage = async (ev) => {
      if (offlineWcamSlot !== cleanSlot) return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'wcam-sync' && Array.isArray(msg.cams)) {
          if (msg.cams.some(c => String(c.slot) === cleanSlot)) {
            await initiateOfferForSlot();
          }
        } else if (msg.type === 'cam-joined' && msg.cam && String(msg.cam.slot) === cleanSlot) {
          await initiateOfferForSlot();
        } else if (msg.type === 'cam-left' && String(msg.slot) === cleanSlot) {
          if (offlineWcamPc) {
            try { offlineWcamPc.close(); } catch (_) {}
            offlineWcamPc = null;
          }
          const cur = getActiveCameraVideoEl();
          if (cur) cur.srcObject = null;
        } else if (msg.type === 'answer' && String(msg.slot) === cleanSlot && offlineWcamPc && msg.sdp) {
          await offlineWcamPc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          if (offlineWcamPendingIce.length > 0) {
            const queued = offlineWcamPendingIce.slice();
            offlineWcamPendingIce = [];
            for (const cand of queued) {
              await offlineWcamPc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }
        } else if (msg.type === 'ice' && String(msg.slot) === cleanSlot && offlineWcamPc && msg.candidate) {
          if (offlineWcamPc.remoteDescription && offlineWcamPc.remoteDescription.type) {
            await offlineWcamPc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(() => {});
          } else {
            offlineWcamPendingIce.push(msg.candidate);
          }
        }
      } catch (_) {}
    };
  }

  async function setupCameraFeed(deviceId, mode, deviceLabel = '') {
    if (!state.cameraEnabled || mode === 'none' || !mode) {
      cameraSetupSeq++;
      cameraOpeningKey = null;

      // Standby background pre-warming for zero-lag instant crossfade when Add to TV is clicked
      if (state.prewarmWcamUrl) {
        fadeOutAllCameraVideoLayers(() => {
          stopOfflineWirelessCamFeed();
          if (activeRelayId) { closeRelayById(activeRelayId); activeRelayId = ''; activeRelayDeviceId = ''; }
          if (activeCameraStream) { activeCameraStream.getTracks().forEach(t => t.stop()); activeCameraStream = null; }
          activeCameraDeviceId = null;
        });
        clearVdoNinjaCamFeed(state.prewarmWcamUrl);
        return;
      }
      if (state.prewarmCamDeviceId && String(state.prewarmCamDeviceId).startsWith('wcam-offline:')) {
        clearVdoNinjaCamFeed('');
        const targetPrewarmId = String(state.prewarmCamDeviceId);
        fadeOutAllCameraVideoLayers(async () => {
          if (activeCameraStream) { activeCameraStream.getTracks().forEach(t => t.stop()); activeCameraStream = null; }
          activeCameraDeviceId = null;
          // Pre-warm via localhost Control Desk relay (ZERO duplicate iPhone encoding / Wi-Fi bandwidth!)
          if (activeRelayId && activeRelayDeviceId === targetPrewarmId) return;
          const warmRelay = await requestRelayStreamFromControl(targetPrewarmId);
          if (state.cameraEnabled && state.cameraMode !== 'none') {
            if (warmRelay && warmRelay.relayId) closeRelayById(warmRelay.relayId);
            return;
          }
          if (warmRelay && warmRelay.stream) {
            if (activeRelayId && activeRelayId !== warmRelay.relayId) closeRelayById(activeRelayId);
            stopOfflineWirelessCamFeed();
            activeRelayId = warmRelay.relayId;
            activeRelayDeviceId = targetPrewarmId;
            activeCameraDeviceId = targetPrewarmId;
            const preEl = getActiveCameraVideoEl();
            if (preEl) {
              preEl.srcObject = warmRelay.stream;
              preEl.play().catch(() => {});
              preEl.classList.remove('camera-active');
              preEl.style.display = 'block';
              preEl.style.opacity = '0';
              preEl.style.zIndex = '2';
              preEl.style.pointerEvents = 'none';
            }
          }
        });
        return;
      }

      clearVdoNinjaCamFeed('');
      fadeOutAllCameraVideoLayers(() => {
        stopOfflineWirelessCamFeed();
        if (activeRelayId) { closeRelayById(activeRelayId); activeRelayId = ''; activeRelayDeviceId = ''; }
        if (activeCameraStream) { activeCameraStream.getTracks().forEach(t => t.stop()); activeCameraStream = null; }
        activeCameraDeviceId = null;
      });
      return;
    }

    if (deviceId && String(deviceId).startsWith('wcam-vdo:')) {
      cameraSetupSeq++;
      cameraOpeningKey = null;
      activeCameraDeviceId = deviceId;
      setupVdoNinjaCamFeed(state.wirelessCamViewUrl || '', mode);
      return;
    }

    const mySeq = ++cameraSetupSeq;
    const isOfflineCam = deviceId && String(deviceId).startsWith('wcam-offline:');
    const requestKey = isOfflineCam ? String(deviceId) : ((deviceId || '') + '::' + (deviceLabel || ''));

    // If same camera stream is already loaded on active layer, just fade smoothly in/update z-index
    const activeEl = getActiveCameraVideoEl();
    const activeElTrack = activeEl && activeEl.srcObject && activeEl.srcObject.getVideoTracks ? activeEl.srcObject.getVideoTracks().find(t => t.readyState === 'live') : null;
    if (activeCameraDeviceId === requestKey && activeElTrack) {
      if (camFadeOutTimer) {
        clearTimeout(camFadeOutTimer);
        camFadeOutTimer = null;
      }
      clearVdoNinjaCamFeed('');
      applyZoomToDisplayVideo(activeEl, deviceId || activeRelayDeviceId);
      fadeInCameraElement(activeEl, (mode === 'preacher') ? '6' : '3');
      if (mode === 'preacher') syncPreacherBackdropOnCameraLive();
      if (activeEl.paused) activeEl.play().catch(() => {});
      return;
    }

    if (cameraOpeningKey === requestKey) return;
    cameraOpeningKey = requestKey;

    try {
      // 1. Try instant <20ms BroadcastChannel localhost relay from Control Desk first!
      //    (Zero duplicate iPhone encoding, zero Windows DirectShow lock errors!)
      const relayed = await requestRelayStreamFromControl(deviceId || '');
      if (mySeq !== cameraSetupSeq || !state.cameraEnabled || state.cameraMode === 'none') {
        if (relayed && relayed.relayId) closeRelayById(relayed.relayId);
        return;
      }
      if (relayed && relayed.stream) {
        const prevRelay = activeRelayId;
        const prevHw = activeCameraStream;
        activeRelayId = relayed.relayId;
        activeRelayDeviceId = deviceId || '';
        activeCameraStream = null;
        activeCameraDeviceId = requestKey;
        crossfadeToCameraLayer(getStandbyCameraVideoEl(), mode, relayed.stream, {
          oldRelayId: prevRelay,
          oldHwStream: prevHw,
          stopOfflineWcam: true,
          clearVdo: true
        });
        return;
      }

      // 2. Fallback: Direct Offline /cam WebRTC peer
      if (isOfflineCam) {
        const slot = String(deviceId).replace('wcam-offline:', '');
        activeCameraDeviceId = requestKey;
        setupOfflineWirelessCamFeed(slot, mode, false);
        return;
      }

      // 3. Fallback: Direct Hardware Camera (only if Control Desk didn't already hold stream)
      let stream = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          const tryId = await resolveDisplayCameraId(deviceId, deviceLabel);
          stream = await openCameraStreamWithFallbacks(tryId);
          if (stream) break;
        } catch (camErr) {
          console.warn(`[Display Camera] Acquire attempt ${attempt}/4 failed, requesting Control Desk camera release:`, camErr);
          if (window.zionApi && window.zionApi.requestCameraRelease) {
            window.zionApi.requestCameraRelease();
          }
          await new Promise(r => setTimeout(r, 450));
        }
      }

      if (mySeq !== cameraSetupSeq || !state.cameraEnabled || state.cameraMode === 'none') {
        if (stream) stream.getTracks().forEach(t => t.stop());
        return;
      }
      if (!stream) return;

      const prevRelay = activeRelayId;
      const prevHw = activeCameraStream;
      activeRelayId = '';
      activeRelayDeviceId = '';
      activeCameraStream = stream;
      activeCameraDeviceId = requestKey;
      crossfadeToCameraLayer(getStandbyCameraVideoEl(), mode, stream, {
        oldRelayId: prevRelay,
        oldHwStream: prevHw,
        stopOfflineWcam: true,
        clearVdo: true
      });
    } catch (err) {
      console.error('[Display Camera] Camera switch warning:', err);
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
      if (camLayerA) camLayerA.style.filter = 'none';
      if (camLayerB) camLayerB.style.filter = 'none';
      if (wcamIframe) wcamIframe.style.filter = 'none';
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
      // Keep zero-copy hardware video overlay active unless user significantly boosts brightness (>115%)
      if (mediaVideo) mediaVideo.style.filter = bVal > 115 ? `brightness(${boostFactor})` : 'none';
      if (camLayerA) camLayerA.style.filter = bVal > 115 ? `brightness(${boostFactor})` : 'none';
      if (camLayerB) camLayerB.style.filter = bVal > 115 ? `brightness(${boostFactor})` : 'none';
      if (wcamIframe) wcamIframe.style.filter = bVal > 115 ? `brightness(${boostFactor})` : 'none';
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
    const camVisiblyLiveNow = isAnyCameraLayerVisiblyLive();
    if (state.cameraEnabled && state.cameraMode === 'preacher') {
      // Only switch scrim/z-index once camera is visibly live (or not mid-crossfade) so theme never flashes first
      if (camVisiblyLiveNow) {
        scrim.style.background = 'rgba(0, 0, 0, 0.05)';
      }
      if (!camFadeOutTimer) {
        cameraVideo.style.zIndex = '6';
        if (wcamIframe) wcamIframe.style.zIndex = '6';
      }
    } else if (state.cameraEnabled && state.cameraMode === 'background') {
      // Worship background camera mode: dimmer scrim (z-index 4) protects lyric legibility over camera (z-index 3)
      const opacity = state.cameraOpacity !== undefined ? state.cameraOpacity : 0.75;
      scrim.style.background = `rgba(0, 0, 0, ${opacity})`;
      if (!camFadeOutTimer) {
        cameraVideo.style.zIndex = '3';
        if (wcamIframe) wcamIframe.style.zIndex = '3';
      }
    } else {
      // Normal procedural / media background: gentle ambient scrim; keep off-air/prewarmed camera beneath canvas
      const vidScrim = typeof state.videoBgScrimOpacity === 'number'
        ? Math.max(0, Math.min(0.85, state.videoBgScrimOpacity))
        : 0.42;
      scrim.style.background = (state.backgroundType === 'video')
        ? `rgba(0, 0, 0, ${vidScrim})`
        : 'rgba(0, 0, 0, 0.4)';
      if (!camFadeOutTimer) {
        cameraVideo.style.zIndex = state.prewarmCamDeviceId ? '2' : '3';
        if (wcamIframe) wcamIframe.style.zIndex = state.prewarmWcamUrl ? '2' : '3';
      }
    }

    syncCameraWatermarkOverlay();
    applyZoomToDisplayVideo(getActiveCameraVideoEl(), state.cameraDeviceId || activeRelayDeviceId);

    // 4. Custom Local Media & YouTube Live Backgrounds with Smooth Crossfade
    const youtubeLayer = document.getElementById('display-youtube-layer');
    const youtubeIframe = document.getElementById('display-youtube-iframe');

    if (state.backgroundType === 'youtube' && state.youtubeVideoId) {
      canvas.style.opacity = '0';
      canvas.style.display = 'none';
      mediaImg.classList.remove('media-active');
      mediaVideo.classList.remove('media-active');
      mediaImg.style.display = 'none';
      mediaVideo.style.display = 'none';
      if (!mediaVideo.paused) {
        try { mediaVideo.pause(); } catch (_) {}
      }
      mediaVideo.muted = true;

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
        // Keep current media/slide untouched until the camera layer has faded in cleanly (prevents bare theme flash!)
        if (camVisiblyLiveNow) {
          mediaImg.classList.remove('media-active');
          mediaVideo.classList.remove('media-active');
          mediaImg.style.display = 'none';
          mediaVideo.style.display = 'none';
          if (!mediaVideo.paused) {
            try { mediaVideo.pause(); } catch (_) {}
          }
          mediaVideo.muted = true;
        }
      } else if (state.backgroundType === 'video' && state.customBgUrl) {
        canvas.style.opacity = '0';
        canvas.style.display = 'none';
        mediaImg.classList.remove('media-active');
        mediaImg.style.display = 'none';
        mediaVideo.style.display = 'block';

        const rawKey = String(state.customBgUrl);
        const formatted = formatMediaUrl(rawKey);
        const isNewVideo = mediaVideo.dataset.loadedRawUrl !== rawKey;

        mediaVideo.loop = state.videoLoop !== false;
        const targetVol = typeof state.videoVolume === 'number' ? Math.max(0, Math.min(1, state.videoVolume)) : 1.0;
        const shouldMute = !!(state.blackout || state.videoMuted);
        mediaVideo.volume = targetVol;
        mediaVideo.muted = shouldMute;
        const targetRate = Math.max(0.25, Math.min(2.0, Number(state.videoPlaybackRate) || 1.0));
        if (mediaVideo.playbackRate !== targetRate) {
          mediaVideo.playbackRate = targetRate;
        }

        // Route Media Video audio directly to TV HDMI / Church Mixer (separate from Operator Headset)
        if (typeof mediaVideo.setSinkId === 'function') {
          const desiredSink = state.videoAudioSinkId || '';
          if ((mediaVideo.dataset.activeSinkId || '') !== desiredSink) {
            mediaVideo.dataset.activeSinkId = desiredSink;
            mediaVideo.setSinkId(desiredSink).catch((e) => {
              console.warn('Could not route video audio sink:', e);
            });
          }
        }

        if (isNewVideo) {
          mediaVideo.dataset.loadedRawUrl = rawKey;
          mediaVideo.src = formatted;
          try { mediaVideo.currentTime = 0; } catch (_) {}
        } else if (state.videoRestartSeq && mediaVideo.dataset.lastRestartSeq !== String(state.videoRestartSeq)) {
          mediaVideo.dataset.lastRestartSeq = String(state.videoRestartSeq);
          try { mediaVideo.currentTime = 0; } catch (_) {}
        }

        if (state.videoRestartSeq) {
          mediaVideo.dataset.lastRestartSeq = String(state.videoRestartSeq);
        }

        if (state.videoPaused || state.blackout) {
          if (!mediaVideo.paused) {
            try { mediaVideo.pause(); } catch (_) {}
          }
        } else {
          if (mediaVideo.paused) {
            mediaVideo.play().catch(e => {
              console.warn('Video bg play error:', e);
            });
          }
        }
        mediaVideo.classList.add('media-active');
      } else if (state.backgroundType === 'image' && state.customBgUrl) {
        canvas.style.opacity = '0';
        canvas.style.display = 'none';
        mediaVideo.classList.remove('media-active');
        mediaVideo.style.display = 'none';
        if (!mediaVideo.paused) {
          try { mediaVideo.pause(); } catch (_) {}
        }
        mediaVideo.muted = true;
        mediaImg.style.display = 'block';
        const rawImgKey = String(state.customBgUrl);
        if (mediaImg.dataset.loadedRawUrl !== rawImgKey) {
          mediaImg.dataset.loadedRawUrl = rawImgKey;
          mediaImg.src = formatMediaUrl(rawImgKey);
        }
        mediaImg.classList.add('media-active');
      } else {
        // Procedural canvas mode
        mediaVideo.classList.remove('media-active');
        mediaImg.classList.remove('media-active');
        if (!mediaVideo.paused) {
          try { mediaVideo.pause(); } catch (_) {}
        }
        mediaVideo.muted = true;
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
      if (scrim) {
        if (state.backgroundType === 'image' || state.backgroundType === 'video' || isYouTubePlaying || (state.cameraEnabled && state.cameraMode === 'preacher')) {
          scrim.style.opacity = '0';
        } else if (bVal <= 100) {
          scrim.style.opacity = '0.35';
        }
        scrim.style.pointerEvents = 'none';
      }
      if (!hasSlideLyrics || isYouTubePlaying) {
        textContainer.style.display = 'none';
        if (badgeTitle) badgeTitle.style.display = 'none';
        if (subtitleText) subtitleText.style.display = 'none';
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

    const deferClearForIncomingPreacherCam = !!(state.cameraEnabled && state.cameraMode === 'preacher' && state.clearText && !camVisiblyLiveNow && !state.blackout && !state.themeOnly);
    const isTextHidden = (!deferClearForIncomingPreacherCam && state.clearText) || state.themeOnly || state.blackout || !state.activeSlide || !hasSlideLyrics;

    if (isTextHidden) {
      textContainer.classList.add('fade-out');
      if (subtitleText) {
        subtitleText.classList.remove('active');
        subtitleText.style.display = 'none';
      }
      lastSlideSignature = '';
    } else {
      const currentSignature = `${state.activeSlide.label || ''}__${state.activeSlide.body || ''}`;

      const applySlideContent = () => {
        // Update slide title / label badge (prevent duplicate text if title and label are identical)
        if (state.activeSlide.label || state.activeItem) {
          const itemTitle = state.activeItem ? (state.activeItem.title || '') : '';
          const slideLabel = state.activeSlide ? (state.activeSlide.label || '') : '';
          const iClean = itemTitle.trim();
          const sClean = slideLabel.trim();
          if (iClean && sClean) {
            badgeTitle.textContent = (iClean.toLowerCase() === sClean.toLowerCase()) ? iClean : `${iClean} • ${sClean}`;
          } else {
            badgeTitle.textContent = iClean || sClean;
          }
          if (isYouTubePlaying && !hasSlideLyrics) {
            badgeTitle.style.display = 'none';
          } else {
            badgeTitle.style.display = 'block';
          }
        } else {
          badgeTitle.style.display = 'none';
        }

        // Display announcement subtitle / event time
        const sub = (state.activeSlide && state.activeSlide.subtitle) || (state.activeItem && state.activeItem.subtitle) || '';
        if (subtitleText) {
          if (sub && !isYouTubePlaying) {
            subtitleText.textContent = sub;
            subtitleText.classList.add('active');
            subtitleText.style.display = 'inline-block';
          } else {
            subtitleText.textContent = '';
            subtitleText.classList.remove('active');
            subtitleText.style.display = 'none';
          }
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

    // 7. Pre-Service Countdown Timer Overlay Layer (Sleek Broadcast HUD)
    const countdownLayer = document.getElementById('display-countdown-layer');
    const countdownTitle = document.getElementById('display-countdown-title');
    const countdownDigits = document.getElementById('display-countdown-digits');
    const countdownSub = document.getElementById('display-countdown-sub');
    const countdownProgressBar = document.getElementById('display-countdown-progress-bar');

    if (countdownLayer && countdownDigits) {
      const pos = ['top-right', 'top-left', 'bottom-right', 'bottom-left', 'bottom-center', 'center'].includes(state.countdownPosition)
        ? state.countdownPosition
        : 'top-right';
      const sz = ['mini', 'compact', 'medium', 'large'].includes(state.countdownSize)
        ? state.countdownSize
        : 'compact';

      if (state.countdownActive && state.countdownRemaining !== undefined) {
        const rem = Math.max(0, Math.floor(state.countdownRemaining));
        const total = Math.max(1, Math.floor(state.countdownTotal || 300));
        const pct = Math.max(0, Math.min(100, (rem / total) * 100));

        const classes = ['display-countdown-wrapper', 'active', 'pos-' + pos, 'size-' + sz];
        if (pos === 'top-right' && state.showClockOnTv) classes.push('clock-offset');
        if (rem > 0 && rem <= 60) classes.push('urgent');
        if (rem <= 0) classes.push('finished');
        countdownLayer.className = classes.join(' ');

        if (countdownTitle) {
          countdownTitle.textContent = rem <= 0
            ? 'LIVE NOW'
            : (state.countdownTitle || 'SERVICE BEGINS IN');
        }
        const m = Math.floor(rem / 60);
        const s = rem % 60;
        countdownDigits.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');

        if (countdownSub) {
          if (rem <= 0) {
            countdownSub.textContent = '✨ Service Has Begun • Welcome!';
          } else {
            countdownSub.textContent = state.countdownSub || 'Welcome to Worship';
          }
        }
        if (countdownProgressBar) {
          countdownProgressBar.style.width = (rem <= 0 ? 100 : pct) + '%';
        }
      } else {
        countdownLayer.className = 'display-countdown-wrapper pos-' + pos + ' size-' + sz;
      }
    }

    // 8. Live Sanctuary Broadcast Clock Overlay for Entire Congregation
    const sanctuaryClock = document.getElementById('display-sanctuary-clock');
    const clockText = document.getElementById('display-clock-text');
    const clockSec = document.getElementById('display-clock-sec');
    const clockAmPm = document.getElementById('display-clock-ampm');
    const clockDate = document.getElementById('display-clock-date');
    if (sanctuaryClock && clockText) {
      if (state.showClockOnTv) {
        sanctuaryClock.classList.add('visible');
        if (!window.__sanctuaryClockInterval) {
          const updateClock = () => {
            const now = new Date();
            const rawH = now.getHours();
            const h12 = rawH % 12 || 12;
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            const ampm = rawH >= 12 ? 'PM' : 'AM';
            clockText.textContent = `${h12}:${mm}`;
            if (clockSec) clockSec.textContent = ss;
            if (clockAmPm) clockAmPm.textContent = ampm;
            if (clockDate) {
              const dayStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
              clockDate.textContent = dayStr;
            }
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

    // 9. Live Camera Broadcast Watermark
    syncCameraWatermarkOverlay();
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
