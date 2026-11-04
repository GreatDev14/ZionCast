/**
 * ZionCast Mobile Remote Server
 * Built-in zero-latency HTTP & Server-Sent Events (SSE) server
 * Allows pastors, worship leaders, and media technicians to control slides from any smartphone or tablet.
 */

const http = require('http');
const os = require('os');
const QRCode = require('qrcode');

class RemoteServer {
  constructor() {
    this.server = null;
    this.port = 3000;
    this.isRunning = false;
    this.clients = new Set();
    this.qrCodeDataUrl = '';
    this.localIps = [];
    this.currentStatus = {
      activeItemTitle: 'ZionCast Broadcast',
      currentSlideIndex: 0,
      totalSlides: 1,
      currentSlideLabel: 'Ready',
      currentSlideBody: 'Ready for service',
      nextSlideLabel: 'End',
      nextSlideBody: '',
      slidesList: [],
      blackout: false,
      clearText: false,
      themeOnly: false,
      bannerActive: false,
      bannerText: '',
      stageMessage: '',
      stageMessageActive: false,
      countdownActive: false,
      countdownRemaining: 0,
      countdownTotal: 0,
      countdownTitle: 'Service Starts In'
    };
    this.onActionCallback = null;
  }

  getLocalIps() {
    const interfaces = os.networkInterfaces();
    const ips = [];
    for (const name of Object.keys(interfaces)) {
      for (const net of interfaces[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push(net.address);
        }
      }
    }
    return ips.length > 0 ? ips : ['127.0.0.1'];
  }

  async init(onAction) {
    this.onActionCallback = onAction;
    this.localIps = this.getLocalIps();
    return this.startWithPortRetry(3000, 3010);
  }

  startWithPortRetry(startPort, maxPort) {
    return new Promise((resolve) => {
      let currentPort = startPort;

      const tryListen = () => {
        const srv = http.createServer((req, res) => this.handleRequest(req, res));

        srv.on('error', (err) => {
          if (err.code === 'EADDRINUSE' && currentPort < maxPort) {
            currentPort++;
            tryListen();
          } else {
            console.error('[Remote Server] Failed to bind port:', err);
            resolve(false);
          }
        });

        srv.listen(currentPort, '0.0.0.0', async () => {
          this.server = srv;
          this.port = currentPort;
          this.isRunning = true;
          const primaryIp = this.localIps[0] || '127.0.0.1';
          const primaryUrl = `http://${primaryIp}:${this.port}`;

          try {
            this.qrCodeDataUrl = await QRCode.toDataURL(primaryUrl, {
              margin: 1,
              width: 280,
              color: {
                dark: '#0d1117',
                light: '#ffffff'
              }
            });
          } catch (e) {
            console.warn('[Remote Server] Could not generate QR code:', e);
          }

          console.log(`[Remote Server] Running at ${primaryUrl}`);
          resolve(true);
        });
      };

      tryListen();
    });
  }

  updateStatus(status) {
    this.currentStatus = { ...this.currentStatus, ...status };
    this.broadcastSSE({
      type: 'status',
      data: this.currentStatus
    });
  }

  broadcastSSE(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  getInfo() {
    const primaryIp = this.localIps[0] || '127.0.0.1';
    return {
      isRunning: this.isRunning,
      port: this.port,
      localIps: this.localIps,
      primaryUrl: `http://${primaryIp}:${this.port}`,
      stageUrl: `http://${primaryIp}:${this.port}/stage`,
      lowerThirdsUrl: `http://${primaryIp}:${this.port}/lower-thirds`,
      connectedCount: this.clients.size,
      qrCodeDataUrl: this.qrCodeDataUrl,
      currentStatus: this.currentStatus
    };
  }

  handleRequest(req, res) {
    // Enable CORS for flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 1. Server-Sent Events (SSE) Stream
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      res.write(`data: ${JSON.stringify({ type: 'status', data: this.currentStatus })}\n\n`);
      this.clients.add(res);

      req.on('close', () => {
        this.clients.delete(res);
      });
      return;
    }

    // 2. Status API
    if (url.pathname === '/api/status' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, status: this.currentStatus }));
      return;
    }

    // 3. Action API (commands from phone)
    if (url.pathname === '/api/action' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          if (this.onActionCallback) {
            this.onActionCallback(parsed.action, parsed.data || {});
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
      });
      return;
    }

    // 4. Stage Display / Confidence Monitor (Preacher & Choir Screen)
    if (url.pathname === '/stage' || url.pathname === '/confidence') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getStageHtml());
      return;
    }

    // 5. OBS Studio / ATEM Transparent Lower-Thirds Broadcast Overlay
    if (url.pathname === '/lower-thirds' || url.pathname === '/obs' || url.pathname === '/overlay') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getLowerThirdsHtml());
      return;
    }

    // 6. Direct Clean YouTube Embed Proxy
    if (url.pathname === '/embed') {
      const vid = url.searchParams.get('v') || '';
      const autoplay = url.searchParams.get('autoplay') || '1';
      const mute = url.searchParams.get('mute') || '0';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getEmbedHtml(vid, autoplay, mute));
      return;
    }

    // 7. Default: Serve Mobile Remote Web App
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/remote') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getRemoteHtml());
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  getRemoteHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#0d1117">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>ZionCast Mobile Remote</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    body {
      background: #0a0d14;
      color: #f1f5f9;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      padding-bottom: env(safe-area-inset-bottom, 16px);
    }

    /* Top Bar */
    header.remote-header {
      padding: 12px 16px;
      background: rgba(13, 17, 23, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-logo-icon {
      width: 26px;
      height: 26px;
      border-radius: 6px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 900;
      color: #000;
      box-shadow: 0 0 10px rgba(245, 158, 11, 0.35);
    }

    .brand-title {
      font-size: 0.95rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #ffffff;
    }

    .connection-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .connection-badge.disconnected {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.3);
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
      animation: pulse 1.5s infinite;
    }

    .connection-badge.disconnected .pulse-dot {
      background: #ef4444;
      box-shadow: 0 0 6px #ef4444;
      animation: none;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
    }

    /* Fast Action Controls */
    .quick-actions-bar {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      padding: 10px 14px;
      background: #0f141e;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .btn-quick {
      background: #1a2232;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 8px 6px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-quick:active {
      transform: scale(0.96);
    }

    .btn-quick.active-blackout {
      background: #dc2626 !important;
      color: #ffffff !important;
      border-color: #ef4444 !important;
      box-shadow: 0 0 12px rgba(220, 38, 38, 0.5);
    }

    .btn-quick.active-clear {
      background: #d97706 !important;
      color: #ffffff !important;
      border-color: #f59e0b !important;
      box-shadow: 0 0 12px rgba(217, 119, 6, 0.5);
    }

    .btn-quick.active-theme {
      background: #0284c7 !important;
      color: #ffffff !important;
      border-color: #38bdf8 !important;
      box-shadow: 0 0 12px rgba(2, 132, 199, 0.5);
    }

    /* Main Presentation Container */
    main.remote-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 12px 14px;
    }

    /* Active Presentation Title */
    .item-header-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .item-title-text {
      font-size: 0.82rem;
      font-weight: 800;
      color: #f59e0b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 65%;
    }

    .slide-progress-badge {
      font-size: 0.72rem;
      font-weight: 800;
      padding: 3px 8px;
      background: rgba(245, 158, 11, 0.16);
      color: #f59e0b;
      border-radius: 999px;
    }

    /* Current Live Slide Display */
    .live-slide-box {
      flex: 1;
      min-height: 190px;
      background: linear-gradient(180deg, #131926 0%, #0d121c 100%);
      border: 1.5px solid rgba(245, 158, 11, 0.45);
      border-radius: 14px;
      padding: 18px 16px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      position: relative;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5), 0 0 20px rgba(245, 158, 11, 0.1);
    }

    .live-slide-tag {
      position: absolute;
      top: 10px;
      left: 12px;
      font-size: 0.68rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: #f59e0b;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .live-slide-text {
      font-size: 1.25rem;
      font-weight: 700;
      color: #ffffff;
      line-height: 1.45;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 240px;
      overflow-y: auto;
    }

    .live-status-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.92);
      border-radius: 12px;
      display: none;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      color: #ef4444;
      z-index: 10;
    }

    .live-status-overlay.active {
      display: flex;
    }

    /* Next Slide Confidence Preview */
    .next-preview-box {
      background: #111723;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .next-preview-label {
      font-size: 0.66rem;
      font-weight: 800;
      color: #38bdf8;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .next-preview-text {
      font-size: 0.85rem;
      color: #94a3b8;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    /* Big Navigation Touch Buttons */
    .touch-nav-row {
      display: grid;
      grid-template-columns: 1fr 1.5fr;
      gap: 10px;
      margin-top: auto;
      padding-top: 6px;
    }

    .btn-nav-touch {
      height: 72px;
      border-radius: 12px;
      border: none;
      font-family: inherit;
      font-size: 1.15rem;
      font-weight: 900;
      letter-spacing: 0.04em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
      transition: all 0.1s ease;
    }

    .btn-nav-touch:active {
      transform: scale(0.97);
    }

    .btn-nav-prev {
      background: #1e293b;
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .btn-nav-next {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #0b0f17;
      box-shadow: 0 4px 18px rgba(245, 158, 11, 0.35);
    }

    /* Secondary Tools Bar (Jump to slide & Send Alert) */
    .secondary-tools-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 8px;
    }

    .btn-tool-secondary {
      background: #141b27;
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      padding: 10px;
      border-radius: 8px;
      font-size: 0.78rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      cursor: pointer;
    }

    .btn-tool-secondary:active {
      background: #1c2637;
    }

    /* Slide Jump Drawer Modal */
    .modal-drawer {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      z-index: 100;
      display: none;
      flex-direction: column;
      justify-content: flex-end;
    }

    .modal-drawer.open {
      display: flex;
    }

    .drawer-content {
      background: #0f141e;
      border-top: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 20px 20px 0 0;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      padding: 16px;
    }

    .drawer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: 10px;
    }

    .drawer-title {
      font-size: 0.95rem;
      font-weight: 800;
      color: #ffffff;
    }

    .drawer-close-btn {
      background: #1e293b;
      border: none;
      color: #cbd5e1;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 16px;
      font-weight: 800;
      cursor: pointer;
    }

    .drawer-slides-list {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding-right: 4px;
    }

    .drawer-slide-item {
      padding: 10px 12px;
      background: #151d2a;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 3px;
      cursor: pointer;
    }

    .drawer-slide-item.active {
      border-color: #f59e0b;
      background: rgba(245, 158, 11, 0.12);
    }

    .drawer-slide-label {
      font-size: 0.72rem;
      font-weight: 800;
      color: #f59e0b;
      text-transform: uppercase;
    }

    .drawer-slide-snippet {
      font-size: 0.8rem;
      color: #cbd5e1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>

  <!-- Top Header -->
  <header class="remote-header">
    <div class="brand-wrap">
      <div class="brand-logo-icon">Z</div>
      <span class="brand-title">ZionCast Remote</span>
    </div>
    <div id="conn-badge" class="connection-badge">
      <span class="pulse-dot"></span>
      <span id="conn-text">Live Sync</span>
    </div>
  </header>

  <!-- Quick Presentation Toggles -->
  <div class="quick-actions-bar">
    <button id="btn-remote-blackout" class="btn-quick">
      ⬛ Blackout
    </button>
    <button id="btn-remote-clear" class="btn-quick">
      👁️ Clear Text
    </button>
    <button id="btn-remote-theme" class="btn-quick">
      🎨 Theme Only
    </button>
  </div>

  <!-- Content Workspace -->
  <main class="remote-content">
    
    <!-- Active Song / Scripture Reference -->
    <div class="item-header-card">
      <span id="label-item-title" class="item-title-text">ZionCast Broadcast</span>
      <span id="label-slide-progress" class="slide-progress-badge">1 / 1</span>
    </div>

    <!-- Live On-Air Slide Box -->
    <div class="live-slide-box">
      <div class="live-slide-tag">
        <span>🔴 ON SCREEN</span>
        <span id="label-slide-tag">• Ready</span>
      </div>
      <div id="label-slide-body" class="live-slide-text">Ready for service</div>
      <div id="blackout-curtain" class="live-status-overlay">
        BLACKOUT ACTIVE
      </div>
      <div id="clear-curtain" class="live-status-overlay" style="color: #f59e0b;">
        TEXT CLEARED
      </div>
    </div>

    <!-- Upcoming Next Slide Confidence Preview -->
    <div class="next-preview-box">
      <div class="next-preview-label">
        <span>NEXT SLIDE ⏩</span>
        <span id="label-next-tag">End</span>
      </div>
      <div id="label-next-body" class="next-preview-text">No upcoming slide</div>
    </div>

    <!-- Big Touch Navigation -->
    <div class="touch-nav-row">
      <button id="btn-nav-prev" class="btn-nav-touch btn-nav-prev">
        ◀ PREV
      </button>
      <button id="btn-nav-next" class="btn-nav-touch btn-nav-next">
        NEXT ▶
      </button>
    </div>

    <!-- Slide List Jump & Nursery Alert Trigger -->
    <div class="secondary-tools-row">
      <button id="btn-open-drawer" class="btn-tool-secondary">
        📑 All Slides (<span id="drawer-count">0</span>)
      </button>
      <button id="btn-send-alert-prompt" class="btn-tool-secondary">
        📢 Send Alert
      </button>
    </div>

  </main>

  <!-- Slide Jump Drawer -->
  <div id="modal-drawer" class="modal-drawer">
    <div class="drawer-content">
      <div class="drawer-header">
        <span class="drawer-title">Select Slide to Jump</span>
        <button id="btn-close-drawer" class="drawer-close-btn">&times;</button>
      </div>
      <div id="drawer-slides-list" class="drawer-slides-list">
        <!-- Rendered dynamically -->
      </div>
    </div>
  </div>

  <script>
    let currentStatus = {};

    function triggerHaptic() {
      if (navigator.vibrate) {
        navigator.vibrate(35);
      }
    }

    async function sendAction(action, data = {}) {
      triggerHaptic();
      try {
        await fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, data })
        });
      } catch (err) {
        console.warn('Action send error:', err);
      }
    }

    function renderStatus(s) {
      if (!s) return;
      currentStatus = s;

      // Update Titles & Progress
      document.getElementById('label-item-title').textContent = s.activeItemTitle || 'ZionCast Broadcast';
      const curIdx = (s.currentSlideIndex || 0) + 1;
      const total = s.totalSlides || 1;
      document.getElementById('label-slide-progress').textContent = curIdx + ' / ' + total;
      document.getElementById('drawer-count').textContent = total;

      // Update Current Live Slide
      document.getElementById('label-slide-tag').textContent = '• ' + (s.currentSlideLabel || ('Slide ' + curIdx));
      document.getElementById('label-slide-body').textContent = s.currentSlideBody || '';

      // Update Next Slide Preview
      document.getElementById('label-next-tag').textContent = s.nextSlideLabel || 'End of Item';
      document.getElementById('label-next-body').textContent = s.nextSlideBody || 'End of current presentation';

      // Update Blackout & Clear Curtains
      const blackoutCurtain = document.getElementById('blackout-curtain');
      const clearCurtain = document.getElementById('clear-curtain');
      const btnBlackout = document.getElementById('btn-remote-blackout');
      const btnClear = document.getElementById('btn-remote-clear');
      const btnTheme = document.getElementById('btn-remote-theme');

      if (s.blackout) {
        blackoutCurtain.classList.add('active');
        clearCurtain.classList.remove('active');
        btnBlackout.classList.add('active-blackout');
      } else {
        blackoutCurtain.classList.remove('active');
        btnBlackout.classList.remove('active-blackout');
        
        if (s.clearText) {
          clearCurtain.classList.add('active');
          btnClear.classList.add('active-clear');
        } else {
          clearCurtain.classList.remove('active');
          btnClear.classList.remove('active-clear');
        }
      }

      btnTheme.classList.toggle('active-theme', !!s.themeOnly);

      // Render Drawer items
      renderDrawerList(s.slidesList || [], s.currentSlideIndex || 0);
    }

    function renderDrawerList(slides, activeIdx) {
      const listEl = document.getElementById('drawer-slides-list');
      listEl.innerHTML = '';
      if (!slides || slides.length === 0) {
        listEl.innerHTML = '<div style="color: #64748b; font-size: 0.8rem; text-align: center; padding: 20px;">No slides loaded in active item</div>';
        return;
      }

      slides.forEach((sl, idx) => {
        const item = document.createElement('div');
        item.className = 'drawer-slide-item' + (idx === activeIdx ? ' active' : '');
        item.innerHTML = \`
          <span class="drawer-slide-label">\${sl.label || 'Slide ' + (idx + 1)}</span>
          <span class="drawer-slide-snippet">\${escapeHtml(sl.body || '')}</span>
        \`;
        item.addEventListener('click', () => {
          sendAction('goto', { index: idx });
          document.getElementById('modal-drawer').classList.remove('open');
        });
        listEl.appendChild(item);
      });
    }

    function escapeHtml(str) {
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Connect SSE Stream
    let evtSource = null;
    function connectSSE() {
      const connBadge = document.getElementById('conn-badge');
      const connText = document.getElementById('conn-text');

      evtSource = new EventSource('/api/events');
      evtSource.onopen = () => {
        connBadge.classList.remove('disconnected');
        connText.textContent = 'Live Sync';
      };

      evtSource.onmessage = (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.type === 'status') {
            renderStatus(parsed.data);
          }
        } catch (err) {}
      };

      evtSource.onerror = () => {
        connBadge.classList.add('disconnected');
        connText.textContent = 'Reconnecting...';
        evtSource.close();
        setTimeout(connectSSE, 2000);
      };
    }

    // Button Listeners
    document.getElementById('btn-nav-next').addEventListener('click', () => sendAction('next'));
    document.getElementById('btn-nav-prev').addEventListener('click', () => sendAction('prev'));
    document.getElementById('btn-remote-blackout').addEventListener('click', () => sendAction('blackout'));
    document.getElementById('btn-remote-clear').addEventListener('click', () => sendAction('clear'));
    document.getElementById('btn-remote-theme').addEventListener('click', () => sendAction('theme'));

    // Drawer modal
    const drawerModal = document.getElementById('modal-drawer');
    document.getElementById('btn-open-drawer').addEventListener('click', () => {
      drawerModal.classList.add('open');
    });
    document.getElementById('btn-close-drawer').addEventListener('click', () => {
      drawerModal.classList.remove('open');
    });
    drawerModal.addEventListener('click', (e) => {
      if (e.target === drawerModal) drawerModal.classList.remove('open');
    });

    // Alert Prompt
    document.getElementById('btn-send-alert-prompt').addEventListener('click', () => {
      const text = prompt('Enter Nursery or Congregation Alert text to display on screen:');
      if (text && text.trim()) {
        sendAction('alert', { text: text.trim() });
      }
    });

    // Start Real-Time Connection
    connectSSE();
  </script>
</body>
</html>`;
  }

  getEmbedHtml(vid, autoplay = '1', mute = '0') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>ZionCast YouTube Stream</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; overflow:hidden; }
    html, body { width:100vw; height:100vh; background:#000; }
    iframe { width:100%; height:100%; border:none; }
  </style>
</head>
<body>
  <iframe 
    src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=${autoplay}&mute=${mute}&controls=1&rel=0&playsinline=1&modestbranding=1" 
    referrerpolicy="strict-origin-when-cross-origin" 
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
    allowfullscreen>
  </iframe>
</body>
</html>`;
  }

  getLowerThirdsHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZionCast OBS Transparent Lower-Thirds</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: transparent !important;
      font-family: 'Outfit', 'Segoe UI', system-ui, sans-serif;
    }
    #lt-container {
      position: fixed;
      bottom: 44px;
      left: 50%;
      transform: translateX(-50%) translateY(40px);
      width: 86%;
      max-width: 1440px;
      opacity: 0;
      transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), transform 0.4s cubic-bezier(0.16, 1, 0.3, 1);
      pointer-events: none;
    }
    #lt-container.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .lt-card {
      background: linear-gradient(135deg, rgba(13, 17, 23, 0.94) 0%, rgba(22, 27, 34, 0.9) 100%);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-left: 8px solid #f59e0b;
      border-radius: 16px;
      padding: 22px 34px;
      box-shadow: 0 16px 45px rgba(0, 0, 0, 0.65), 0 0 1px rgba(255, 255, 255, 0.15);
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .lt-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .lt-badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 14px;
      background: rgba(245, 158, 11, 0.18);
      border: 1px solid rgba(245, 158, 11, 0.4);
      color: #f59e0b;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      border-radius: 9999px;
    }
    .lt-item-title {
      font-size: 14px;
      font-weight: 600;
      color: #94a3b8;
      letter-spacing: 0.05em;
    }
    .lt-body {
      font-size: 32px;
      font-weight: 700;
      line-height: 1.35;
      color: #ffffff;
      text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
      white-space: pre-wrap;
      word-break: break-word;
    }
    #lt-ticker {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100vw;
      background: rgba(220, 38, 38, 0.95);
      color: #fff;
      font-weight: 800;
      font-size: 18px;
      padding: 10px 0;
      overflow: hidden;
      white-space: nowrap;
      display: none;
      box-shadow: 0 -4px 15px rgba(0, 0, 0, 0.4);
    }
    #lt-ticker.visible {
      display: block;
    }
    .ticker-content {
      display: inline-block;
      animation: tickerScroll 20s linear infinite;
      padding-left: 100vw;
    }
    @keyframes tickerScroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }
  </style>
</head>
<body>
  <div id="lt-container">
    <div class="lt-card">
      <div class="lt-header">
        <span id="lt-badge" class="lt-badge">LIVE</span>
        <span id="lt-item-title" class="lt-item-title"></span>
      </div>
      <div id="lt-body" class="lt-body"></div>
    </div>
  </div>
  <div id="lt-ticker">
    <div id="lt-ticker-text" class="ticker-content"></div>
  </div>

  <script>
    const container = document.getElementById('lt-container');
    const badge = document.getElementById('lt-badge');
    const itemTitle = document.getElementById('lt-item-title');
    const body = document.getElementById('lt-body');
    const ticker = document.getElementById('lt-ticker');
    const tickerText = document.getElementById('lt-ticker-text');

    function updateView(state) {
      if (state.bannerActive && state.bannerText) {
        tickerText.textContent = state.bannerText;
        ticker.classList.add('visible');
      } else {
        ticker.classList.remove('visible');
      }

      if (state.blackout || state.clearText || state.themeOnly || !state.currentSlideBody) {
        container.classList.remove('visible');
        return;
      }

      badge.textContent = state.currentSlideLabel || 'LIVE';
      itemTitle.textContent = state.activeItemTitle || '';
      body.textContent = state.currentSlideBody || '';
      container.classList.add('visible');
    }

    function connectSSE() {
      const evtSource = new EventSource('/api/events');
      evtSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'status') updateView(payload.data);
        } catch (err) {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectSSE, 2000);
      };
    }
    connectSSE();
  </script>
</body>
</html>`;
  }

  getStageHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ZionCast - Preacher & Choir Stage Display</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: #07090e;
      color: #ffffff;
      font-family: 'Outfit', 'Segoe UI', system-ui, -apple-system, sans-serif;
      user-select: none;
    }
    .stage-shell {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      padding: 18px 24px;
      gap: 16px;
    }
    /* Top Status Bar: Clock, Live indicator, Sermon Timer */
    .stage-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 24px;
      background: #0f141f;
      border: 1px solid #1e293b;
      border-radius: 14px;
      flex-shrink: 0;
    }
    .clock-display {
      font-size: 28px;
      font-weight: 800;
      color: #f8fafc;
      letter-spacing: 0.05em;
      font-variant-numeric: tabular-nums;
    }
    .center-status {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .live-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 14px;
      background: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.4);
      color: #10b981;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0.1em;
      border-radius: 9999px;
      text-transform: uppercase;
    }
    .live-badge.blackout-state {
      background: rgba(239, 68, 68, 0.18);
      border-color: rgba(239, 68, 68, 0.5);
      color: #ef4444;
    }
    .stage-item-title {
      font-size: 16px;
      font-weight: 700;
      color: #94a3b8;
    }
    .timer-display {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .timer-badge {
      font-size: 12px;
      font-weight: 800;
      color: #38bdf8;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .timer-clock {
      font-size: 28px;
      font-weight: 800;
      color: #f59e0b;
      font-variant-numeric: tabular-nums;
    }
    .btn-fs {
      background: #1e293b;
      border: 1px solid #334155;
      color: #cbd5e1;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      margin-left: 14px;
    }

    /* Private Tech Booth to Preacher Alert Banner */
    #stage-alert-banner {
      display: none;
      padding: 16px 24px;
      background: linear-gradient(135deg, rgba(220, 38, 38, 0.95), rgba(185, 28, 28, 0.9));
      border: 2px solid #fca5a5;
      border-radius: 14px;
      color: #ffffff;
      font-size: 24px;
      font-weight: 800;
      text-align: center;
      letter-spacing: 0.05em;
      box-shadow: 0 0 25px rgba(220, 38, 38, 0.7);
      animation: alertPulse 1.5s infinite;
      flex-shrink: 0;
    }
    @keyframes alertPulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(0.995); }
    }

    /* Main Stage Layout: Current Slide & Next Preview */
    .stage-main {
      display: flex;
      flex-direction: column;
      flex: 1;
      gap: 16px;
      min-height: 0;
    }
    .current-slide-panel {
      flex: 1.4;
      background: #0f141f;
      border: 2px solid rgba(245, 158, 11, 0.4);
      border-radius: 16px;
      padding: 24px 32px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      overflow: hidden;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.5);
    }
    .panel-tag {
      position: absolute;
      top: 14px;
      left: 20px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      padding: 3px 10px;
      border-radius: 6px;
    }
    .current-slide-panel .panel-tag {
      background: rgba(245, 158, 11, 0.2);
      color: #f59e0b;
      border: 1px solid rgba(245, 158, 11, 0.4);
    }
    .current-slide-text {
      font-size: clamp(24px, 4.2vw, 56px);
      font-weight: 800;
      line-height: 1.3;
      color: #ffffff;
      text-align: center;
      white-space: pre-wrap;
      word-break: break-word;
      margin-top: 10px;
    }
    .current-slide-text.blackout-msg {
      color: #ef4444;
      font-size: clamp(20px, 3vw, 36px);
    }
    .current-slide-text.clear-msg {
      color: #38bdf8;
      font-size: clamp(20px, 3vw, 36px);
    }

    /* Next Slide Preview */
    .next-slide-panel {
      flex: 0.85;
      background: #090d14;
      border: 1px solid #1e293b;
      border-radius: 16px;
      padding: 18px 28px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    .next-slide-panel .panel-tag {
      background: rgba(56, 189, 248, 0.15);
      color: #38bdf8;
      border: 1px solid rgba(56, 189, 248, 0.3);
    }
    .next-slide-text {
      font-size: clamp(18px, 2.6vw, 36px);
      font-weight: 700;
      line-height: 1.35;
      color: #94a3b8;
      text-align: center;
      white-space: pre-wrap;
      word-break: break-word;
      margin-top: 10px;
    }
  </style>
</head>
<body>
  <div class="stage-shell">
    <div class="stage-header">
      <div id="stage-clock" class="clock-display">--:--:--</div>
      <div class="center-status">
        <span id="stage-live-badge" class="live-badge">● LIVE</span>
        <span id="stage-item-title" class="stage-item-title">ZionCast</span>
      </div>
      <div class="timer-display">
        <span id="timer-title" class="timer-badge">COUNTDOWN</span>
        <span id="timer-clock" class="timer-clock">00:00</span>
        <button id="btn-fullscreen" class="btn-fs">⛶ Fullscreen</button>
      </div>
    </div>

    <!-- Private Tech Booth to Pastor Message -->
    <div id="stage-alert-banner">
      ⚠️ TECH BOOTH ALERT: <span id="stage-alert-text">Wrap up in 2 minutes</span>
    </div>

    <div class="stage-main">
      <div class="current-slide-panel">
        <div id="current-panel-tag" class="panel-tag">CURRENT SLIDE</div>
        <div id="current-slide-text" class="current-slide-text">Waiting for service to begin...</div>
      </div>

      <div class="next-slide-panel">
        <div id="next-panel-tag" class="panel-tag">▶ NEXT SLIDE</div>
        <div id="next-slide-text" class="next-slide-text">--</div>
      </div>
    </div>
  </div>

  <script>
    const stageClock = document.getElementById('stage-clock');
    const stageLiveBadge = document.getElementById('stage-live-badge');
    const stageItemTitle = document.getElementById('stage-item-title');
    const timerTitle = document.getElementById('timer-title');
    const timerClock = document.getElementById('timer-clock');
    const alertBanner = document.getElementById('stage-alert-banner');
    const alertText = document.getElementById('stage-alert-text');
    const currentTag = document.getElementById('current-panel-tag');
    const currentText = document.getElementById('current-slide-text');
    const nextTag = document.getElementById('next-panel-tag');
    const nextText = document.getElementById('next-slide-text');
    const btnFullscreen = document.getElementById('btn-fullscreen');

    // Wall Clock
    function updateClock() {
      const now = new Date();
      stageClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    setInterval(updateClock, 1000);
    updateClock();

    // Fullscreen toggle
    btnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
        btnFullscreen.textContent = '✕ Exit';
      } else {
        document.exitFullscreen().catch(() => {});
        btnFullscreen.textContent = '⛶ Fullscreen';
      }
    });

    function formatTime(sec) {
      const s = Math.max(0, Math.floor(sec));
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return String(m).padStart(2, '0') + ':' + String(rem).padStart(2, '0');
    }

    function updateStageDisplay(state) {
      // 1. Tech Booth Private Alert Message
      if (state.stageMessageActive && state.stageMessage) {
        alertText.textContent = state.stageMessage;
        alertBanner.style.display = 'block';
      } else {
        alertBanner.style.display = 'none';
      }

      // 2. Countdown / Service Timer
      if (state.countdownActive && state.countdownRemaining !== undefined) {
        timerTitle.textContent = state.countdownTitle || 'COUNTDOWN';
        timerClock.textContent = formatTime(state.countdownRemaining);
        timerClock.style.color = state.countdownRemaining <= 60 ? '#ef4444' : '#f59e0b';
      } else {
        timerTitle.textContent = 'STATUS';
        timerClock.textContent = 'READY';
        timerClock.style.color = '#10b981';
      }

      // 3. Status Bar
      stageItemTitle.textContent = state.activeItemTitle || 'ZionCast Broadcast';
      if (state.blackout) {
        stageLiveBadge.textContent = '⬛ BLACKOUT';
        stageLiveBadge.className = 'live-badge blackout-state';
      } else if (state.clearText) {
        stageLiveBadge.textContent = '👁️ TEXT CLEARED';
        stageLiveBadge.className = 'live-badge blackout-state';
      } else {
        stageLiveBadge.textContent = '● LIVE';
        stageLiveBadge.className = 'live-badge';
      }

      // 4. Current Slide
      if (state.blackout) {
        currentTag.textContent = 'BLACKOUT ACTIVE';
        currentText.textContent = '[ AUDIENCE PROJECTOR IS BLACKED OUT ]';
        currentText.className = 'current-slide-text blackout-msg';
      } else if (state.clearText) {
        currentTag.textContent = 'TEXT CLEARED';
        currentText.textContent = '[ TEXT CLEARED ON MAIN PROJECTOR ]';
        currentText.className = 'current-slide-text clear-msg';
      } else {
        currentTag.textContent = state.currentSlideLabel ? ('CURRENT • ' + state.currentSlideLabel) : 'CURRENT SLIDE';
        currentText.textContent = state.currentSlideBody || 'Ready for service';
        currentText.className = 'current-slide-text';
      }

      // 5. Next Slide Preview
      nextTag.textContent = state.nextSlideLabel ? ('▶ NEXT • ' + state.nextSlideLabel) : '▶ NEXT SLIDE PREVIEW';
      nextText.textContent = state.nextSlideBody || (state.currentSlideIndex + 1 >= state.totalSlides ? '— End of Item —' : '--');
    }

    function connectSSE() {
      const evtSource = new EventSource('/api/events');
      evtSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'status') updateStageDisplay(payload.data);
        } catch (err) {}
      };
      evtSource.onerror = () => {
        evtSource.close();
        setTimeout(connectSSE, 2000);
      };
    }
    connectSSE();
  </script>
</body>
</html>`;
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.isRunning = false;
    }
  }
}

module.exports = new RemoteServer();
