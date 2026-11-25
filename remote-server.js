/**
 * ZionCast Mobile Remote Server
 * Built-in zero-latency HTTP & Server-Sent Events (SSE) server
 * Allows pastors, worship leaders, and media technicians to control slides from any smartphone or tablet.
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');
const { exec } = require('child_process');
const QRCode = require('qrcode');
const forge = require('node-forge');

class RemoteServer {
  constructor() {
    this.server = null;
    this.httpsServer = null;
    this.port = 3000;
    this.httpsPort = 3443;
    this.certDir = null;
    this.certPem = '';
    this.keyPem = '';
    this.certIpsKey = '';
    this.isRunning = false;
    this.clients = new Set();
    this.camSignalClients = new Set();
    this.offlineCams = new Map();
    this.camDisconnectTimers = new Map();
    this.camZoomBySlot = new Map();
    this.crewMicSlots = new Set();
    this.qrCodeDataUrl = '';
    this.qrCache = new Map();
    this.localIps = [];
    this.networkCandidates = [];
    this.selectedIp = null;
    this.lastWifiSsid = '';
    this.lastWifiCheckAt = 0;
    this.heartbeatTimer = null;
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
      countdownProjected: false,
      countdownRunning: false,
      countdownRemaining: 300,
      countdownTotal: 300,
      countdownTitle: 'Service Begins In',
      countdownPosition: 'top-right',
      countdownSize: 'compact',
      showClockOnTv: false,
      serviceTitle: 'Sunday Worship Service',
      serviceOrder: [],
      libraryVersion: 0
    };
    this.currentLibrary = {
      songs: [],
      media: [],
      custom: []
    };
    this.onActionCallback = null;
    this.bibleCache = {};
  }

  getPrimaryRouteIp() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ip) => {
        if (!settled) {
          settled = true;
          resolve(ip || null);
        }
      };
      try {
        const sock = dgram.createSocket('udp4');
        const timer = setTimeout(() => {
          try { sock.close(); } catch (_) {}
          done(null);
        }, 120);
        sock.on('error', () => {
          clearTimeout(timer);
          try { sock.close(); } catch (_) {}
          done(null);
        });
        sock.connect(80, '8.8.8.8', () => {
          clearTimeout(timer);
          let addr = null;
          try { addr = sock.address().address; } catch (_) {}
          try { sock.close(); } catch (_) {}
          done(addr && addr !== '127.0.0.1' && addr !== '0.0.0.0' ? addr : null);
        });
      } catch (_) {
        done(null);
      }
    });
  }

  getWifiSsid() {
    if (process.platform !== 'win32') return Promise.resolve('');
    const now = Date.now();
    if (now - this.lastWifiCheckAt < 2000) {
      return Promise.resolve(this.lastWifiSsid);
    }
    return new Promise((resolve) => {
      exec('netsh wlan show interfaces', { windowsHide: true, timeout: 1200 }, (err, stdout) => {
        this.lastWifiCheckAt = Date.now();
        if (err || !stdout) {
          resolve(this.lastWifiSsid || '');
          return;
        }
        const stateMatch = stdout.match(/^\s*State\s*:\s*(.+)$/im);
        const isConnected = stateMatch && stateMatch[1].trim().toLowerCase() === 'connected';
        if (!isConnected) {
          this.lastWifiSsid = '';
          resolve('');
          return;
        }
        const ssidMatch = stdout.match(/^\s*SSID\s*:\s*(.+)$/im);
        this.lastWifiSsid = ssidMatch ? ssidMatch[1].trim() : '';
        resolve(this.lastWifiSsid);
      });
    });
  }

  buildNetworkCandidates(routeIp = null, wifiSsid = '') {
    const interfaces = os.networkInterfaces();
    const candidates = [];

    for (const name of Object.keys(interfaces)) {
      const lower = name.toLowerCase();
      const isVirtual = lower.includes('vethernet') || lower.includes('virtualbox') ||
        lower.includes('vmnet') || lower.includes('vmware') || lower.includes('hyper-v') ||
        lower.includes('docker') || lower.includes('wsl') || lower.includes('bluetooth') ||
        lower.includes('tailscale') || lower.includes('loopback') ||
        lower.includes('wireguard') || lower.includes('nordlynx') || lower.includes('proton') ||
        lower.includes('warp') || lower.includes('cloudflare') || lower.includes('zerotier') ||
        lower.includes('hamachi') || lower.includes('openvpn') || lower.includes('wintun') ||
        lower.includes('anyconnect') || lower.includes('npcap');

      for (const net of (interfaces[name] || [])) {
        if (net.family !== 'IPv4' || net.internal) continue;
        const ip = net.address;
        if (!ip || ip.startsWith('169.254.') || ip === '192.168.56.1') continue;
        if (isVirtual) continue;

        const isRoute = ip === routeIp;
        const isHotspot = ip.startsWith('192.168.137.') || lower.includes('local area connection*');
        const isWifi = lower.includes('wi-fi') || lower.includes('wireless') || lower.includes('wlan');
        const isLan = lower.includes('ethernet') || lower.includes('lan');

        let priority = 50;
        let label = `${name} (${ip})`;

        if (isWifi) {
          priority = isRoute ? 1 : 5;
          label = wifiSsid
            ? `Wi-Fi "${wifiSsid}" (${ip})${isRoute ? ' • Active' : ''}`
            : `Wi-Fi (${ip})${isRoute ? ' • Active' : ''}`;
        } else if (isHotspot) {
          priority = isRoute ? 2 : 10;
          label = `Laptop Mobile Hotspot (${ip})`;
        } else if (isLan) {
          priority = isRoute ? 3 : 15;
          label = `Ethernet / Hotspot (${ip})${isRoute ? ' • Active' : ''}`;
        } else if (isRoute) {
          priority = 4;
          label = `Active Network (${ip})`;
        }

        candidates.push({
          ip,
          interfaceName: name,
          label,
          isWifi,
          isHotspot,
          isRoute,
          priority
        });
      }
    }

    candidates.sort((a, b) => a.priority - b.priority);

    if (candidates.length === 0) {
      candidates.push({
        ip: '127.0.0.1',
        interfaceName: 'Loopback',
        label: 'Offline / Not Connected to Wi-Fi (127.0.0.1)',
        isWifi: false,
        isHotspot: false,
        isRoute: false,
        priority: 99
      });
    }

    return candidates;
  }

  getLocalIps() {
    const cands = this.buildNetworkCandidates(null, this.lastWifiSsid);
    return cands.map(c => c.ip);
  }

  async getQrForUrl(urlStr) {
    if (this.qrCache.has(urlStr)) {
      return this.qrCache.get(urlStr);
    }
    try {
      const dataUrl = await QRCode.toDataURL(urlStr, {
        margin: 1,
        width: 280,
        color: {
          dark: '#0d1117',
          light: '#ffffff'
        }
      });
      this.qrCache.set(urlStr, dataUrl);
      return dataUrl;
    } catch (e) {
      console.warn('[Remote Server] Could not generate QR code:', e);
      return '';
    }
  }

  ensureSelfSignedCert(ips = []) {
    const cleanIps = Array.from(new Set(['127.0.0.1', ...ips.filter(ip => ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip))])).sort();
    const ipsKey = cleanIps.join(',');
    if (this.certPem && this.keyPem && this.certIpsKey === ipsKey) {
      return { cert: this.certPem, key: this.keyPem };
    }

    const cacheFile = this.certDir ? path.join(this.certDir, 'zioncast-https-cert.json') : null;
    if (cacheFile && fs.existsSync(cacheFile)) {
      try {
        const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        const missingIp = cleanIps.some(ip => !(cached.ips || []).includes(ip));
        if (!missingIp && cached.cert && cached.key && cached.expiresAt > Date.now()) {
          this.certPem = cached.cert;
          this.keyPem = cached.key;
          this.certIpsKey = ipsKey;
          return { cert: this.certPem, key: this.keyPem };
        }
      } catch (_) {}
    }

    const pki = forge.pki;
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
    const now = new Date();
    cert.validity.notBefore = new Date(now.getTime() - 60000);
    cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000 * 3);

    const attrs = [
      { name: 'commonName', value: 'ZionCast Wireless Camera Studio' },
      { name: 'organizationName', value: 'ZionCast Presentation' }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.setExtensions([
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', keyCertSign: true, digitalSignature: true, keyEncipherment: true, dataEncipherment: true },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          ...cleanIps.map(ip => ({ type: 7, ip }))
        ]
      }
    ]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    this.certPem = pki.certificateToPem(cert);
    this.keyPem = pki.privateKeyToPem(keys.privateKey);
    this.certIpsKey = ipsKey;

    if (cacheFile) {
      try {
        fs.writeFileSync(cacheFile, JSON.stringify({
          ips: cleanIps,
          cert: this.certPem,
          key: this.keyPem,
          expiresAt: Date.now() + 365 * 24 * 60 * 60 * 1000 * 2
        }), 'utf8');
      } catch (_) {}
    }
    return { cert: this.certPem, key: this.keyPem };
  }

  async init(onAction, userDataDir = null) {
    this.onActionCallback = onAction;
    if (userDataDir) this.certDir = userDataDir;
    const [routeIp, wifiSsid] = await Promise.all([
      this.getPrimaryRouteIp(),
      this.getWifiSsid()
    ]);
    this.networkCandidates = this.buildNetworkCandidates(routeIp, wifiSsid);
    this.localIps = this.networkCandidates.map(c => c.ip);
    this.refreshHttpsCertContextIfNeeded(this.localIps);

    const httpOk = await this.startWithPortRetry(3000, 3010);
    await this.startHttpsWithPortRetry(3443, 3453).catch(e => console.warn('[Remote HTTPS]', e));
    return httpOk;
  }

  refreshHttpsCertContextIfNeeded(ips = this.localIps) {
    const cleanCheckKey = Array.from(new Set(['127.0.0.1', ...(ips || []).filter(ip => ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip))])).sort().join(',');
    if (this.httpsServer && cleanCheckKey !== this.certIpsKey) {
      try {
        const creds = this.ensureSelfSignedCert(ips || []);
        if (typeof this.httpsServer.setSecureContext === 'function') {
          this.httpsServer.setSecureContext({ key: creds.key, cert: creds.cert });
        }
        return true;
      } catch (_) {}
    }
    return false;
  }

  startHttpsWithPortRetry(startPort, maxPort) {
    return new Promise((resolve) => {
      let currentPort = startPort;
      let creds;
      try {
        creds = this.ensureSelfSignedCert(this.localIps);
      } catch (e) {
        console.warn('[Remote HTTPS] Cert generation warning:', e);
        return resolve(false);
      }

      const tryListen = () => {
        const srv = https.createServer({ key: creds.key, cert: creds.cert }, (req, res) => this.handleRequest(req, res));
        srv.on('error', (err) => {
          if (err.code === 'EADDRINUSE' && currentPort < maxPort) {
            currentPort++;
            tryListen();
          } else {
            resolve(false);
          }
        });
        srv.listen(currentPort, '0.0.0.0', () => {
          this.httpsServer = srv;
          this.httpsPort = currentPort;
          console.log(`[Remote HTTPS Camera Server] Running on port ${this.httpsPort}`);
          resolve(true);
        });
      };
      tryListen();
    });
  }

  startWithPortRetry(startPort, maxPort) {
    return new Promise((resolve) => {
      let currentPort = startPort;

      const tryListen = () => {
        const srv = http.createServer((req, res) => this.handleRequest(req, res));

        srv.on('connection', (socket) => {
          try {
            socket.setNoDelay(true);
            socket.setKeepAlive(true, 4000);
          } catch (_) {}
        });

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
          this.qrCodeDataUrl = await this.getQrForUrl(primaryUrl);

          if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
          let hbTick = 0;
          this.heartbeatTimer = setInterval(() => {
            hbTick++;
            if (hbTick % 2 === 0) {
              try {
                const liveCands = this.buildNetworkCandidates(null, this.lastWifiSsid);
                const liveIps = liveCands.map(c => c.ip);
                const oldKey = (this.localIps || []).slice().sort().join(',');
                const newKey = liveIps.slice().sort().join(',');
                if (newKey !== oldKey) {
                  this.networkCandidates = liveCands;
                  this.localIps = liveIps;
                  if (this.selectedIp && !liveIps.includes(this.selectedIp)) {
                    this.selectedIp = null;
                  }
                }
                this.refreshHttpsCertContextIfNeeded(this.localIps);
              } catch (_) {}
            }
            for (const client of this.clients) {
              try {
                client.write(': ping\n\n');
              } catch (_) {
                this.clients.delete(client);
              }
            }
            for (const sc of this.camSignalClients) {
              try {
                sc.res.write(': ping\n\n');
              } catch (_) {
                this.camSignalClients.delete(sc);
              }
            }
          }, 3000);

          console.log(`[Remote Server] Running at ${primaryUrl} (bound to 0.0.0.0:${this.port})`);
          resolve(true);
        });
      };

      tryListen();
    });
  }

  updateStatus(status) {
    if (status && status.libraryCatalog) {
      this.currentLibrary = status.libraryCatalog;
    }
    const cleanStatus = { ...(status || {}) };
    delete cleanStatus.libraryCatalog;
    this.currentStatus = { ...this.currentStatus, ...cleanStatus };
    this.broadcastSSE({
      type: 'status',
      data: this.currentStatus
    });
    this.broadcastCamSignal({
      type: 'tally-status',
      status: {
        meetCueText: this.currentStatus.meetCueText || '',
        meetCueTime: this.currentStatus.meetCueTime || 0,
        wcamLiveSlot: this.currentStatus.wcamLiveSlot || '',
        talkbackActive: !!this.currentStatus.talkbackActive,
        activeCamCount: this.offlineCams.size
      }
    });
  }

  assignAvailablePublisherSlot(requestedSlot, pubId) {
    const cleanReq = String(requestedSlot || '1');
    const isTakenByOther = (s) => {
      for (const sc of this.camSignalClients) {
        if (sc.role === 'publisher' && sc.slot === s && (!pubId || !sc.pubId || sc.pubId !== pubId)) {
          return true;
        }
      }
      // Also protect slots currently in the 10-second Wi-Fi blip grace window from being stolen by a different phone
      if (this.camDisconnectTimers.has(s)) {
        const existing = this.offlineCams.get(s);
        if (existing && (!pubId || !existing.pubId || existing.pubId !== pubId)) {
          return true;
        }
      }
      return false;
    };
    if (!isTakenByOther(cleanReq)) return cleanReq;
    for (let n = 1; n <= 16; n++) {
      const candidate = String(n);
      if (!isTakenByOther(candidate) && !this.offlineCams.has(candidate)) {
        return candidate;
      }
    }
    for (let n = 1; n <= 16; n++) {
      const candidate = String(n);
      if (!isTakenByOther(candidate)) return candidate;
    }
    return cleanReq;
  }

  broadcastActiveCamCountTally() {
    this.broadcastCamSignal({
      type: 'tally-status',
      status: {
        meetCueText: this.currentStatus.meetCueText || '',
        meetCueTime: this.currentStatus.meetCueTime || 0,
        wcamLiveSlot: this.currentStatus.wcamLiveSlot || '',
        talkbackActive: !!this.currentStatus.talkbackActive,
        activeCamCount: this.offlineCams.size
      }
    });
  }

  broadcastCamSignal(msg) {
    const payload = `data: ${JSON.stringify(msg)}\n\n`;
    for (const sc of this.camSignalClients) {
      try {
        if (msg.targetRole && sc.role !== msg.targetRole) continue;
        if (msg.targetRole === 'publisher' && msg.slot && sc.slot !== String(msg.slot)) continue;
        if (msg.targetRole === 'viewer' && msg.viewerId && sc.viewerId !== msg.viewerId) continue;
        sc.res.write(payload);
      } catch (_) {
        this.camSignalClients.delete(sc);
      }
    }
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

  async getInfo(preferredIp = null) {
    if (preferredIp === 'auto') {
      this.selectedIp = null;
    } else if (preferredIp) {
      this.selectedIp = preferredIp;
    }

    const [routeIp, wifiSsid] = await Promise.all([
      this.getPrimaryRouteIp(),
      this.getWifiSsid()
    ]);

    this.networkCandidates = this.buildNetworkCandidates(routeIp, wifiSsid);
    this.localIps = this.networkCandidates.map(c => c.ip);

    // Refresh self-signed HTTPS cert SANs if Wi-Fi/hotspot switched to a new IP after startup
    this.refreshHttpsCertContextIfNeeded(this.localIps);

    let activeIp = this.localIps[0] || '127.0.0.1';
    if (this.selectedIp && this.localIps.includes(this.selectedIp)) {
      activeIp = this.selectedIp;
    } else {
      this.selectedIp = null;
    }

    const primaryUrl = `http://${activeIp}:${this.port}`;
    this.qrCodeDataUrl = await this.getQrForUrl(primaryUrl);

    return {
      isRunning: this.isRunning,
      port: this.port,
      httpsPort: this.httpsPort,
      primaryIp: activeIp,
      selectedIp: activeIp,
      wifiSsid: wifiSsid || '',
      localIps: this.localIps,
      networkCandidates: this.networkCandidates,
      primaryUrl,
      offlineCamBaseUrl: `https://${activeIp}:${this.httpsPort}/cam`,
      caCertUrl: `http://${activeIp}:${this.port}/zioncast-ca.crt`,
      offlineCams: Array.from(this.offlineCams.values()),
      stageUrl: `http://${activeIp}:${this.port}/stage`,
      lowerThirdsUrl: `http://${activeIp}:${this.port}/lower-thirds`,
      connectedCount: this.clients.size,
      qrCodeDataUrl: this.qrCodeDataUrl,
      currentStatus: this.currentStatus
    };
  }

  executeRemoteAction(action, data) {
    if (action === 'stage-message' && data && data.text) {
      this.updateStatus({ stageMessage: data.text, stageMessageActive: true });
    } else if (action === 'clear-stage-message') {
      this.updateStatus({ stageMessage: '', stageMessageActive: false });
    }
    if (this.onActionCallback) {
      this.onActionCallback(action, data || {});
    }
  }

  handleRequest(req, res) {
    // Enable CORS & prevent caching on mobile routers/proxies
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cache-Control');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // 0. Wireless Wi-Fi Phone Camera Page (/cam) + CA Certificate + Offline WebRTC Signaling
    if (url.pathname === '/zioncast-ca.crt' || url.pathname === '/zioncast-ca.cer') {
      const creds = this.ensureSelfSignedCert(this.localIps);
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="ZionCast-Camera-Cert.crt"'
      });
      res.end(creds.cert);
      return;
    }

    if (url.pathname === '/cam' || url.pathname === '/camera') {
      const hostHeader = String(req.headers.host || '');
      const bareHost = hostHeader.replace(/:\d+$/, '');
      if (!req.socket.encrypted && bareHost && bareHost !== '127.0.0.1' && bareHost !== 'localhost') {
        res.writeHead(302, {
          Location: `https://${bareHost}:${this.httpsPort}${url.pathname}${url.search}`
        });
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getOfflineCamHtml());
      return;
    }

    if (url.pathname === '/api/wcam-list' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, cams: Array.from(this.offlineCams.values()) }));
      return;
    }

    if (url.pathname === '/api/cam-events') {
      const role = url.searchParams.get('role') || 'viewer';
      const requestedSlot = String(url.searchParams.get('slot') || '');
      const viewerId = url.searchParams.get('viewerId') || '';
      const pubId = url.searchParams.get('pubId') || '';
      const slot = (role === 'publisher')
        ? this.assignAvailablePublisherSlot(requestedSlot || '1', pubId)
        : requestedSlot;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      const clientObj = { res, role, slot, viewerId, pubId };
      this.camSignalClients.add(clientObj);

      // If another phone already holds requestedSlot, seamlessly move this new phone to a free slot
      if (role === 'publisher' && requestedSlot && slot !== requestedSlot) {
        res.write(`data: ${JSON.stringify({ type: 'slot-assigned', slot, previousSlot: requestedSlot })}\n\n`);
      }

      // If publisher reconnected within the grace window, cancel pending disconnect teardown
      if (role === 'publisher' && slot && this.camDisconnectTimers.has(slot)) {
        clearTimeout(this.camDisconnectTimers.get(slot));
        this.camDisconnectTimers.delete(slot);
      }

      // Send current active wireless cams & status immediately
      res.write(`data: ${JSON.stringify({
        type: 'wcam-sync',
        assignedSlot: role === 'publisher' ? slot : undefined,
        cams: Array.from(this.offlineCams.values()),
        crewMicSlots: Array.from(this.crewMicSlots),
        camZooms: Object.fromEntries(this.camZoomBySlot.entries()),
        status: {
          meetCueText: this.currentStatus.meetCueText || '',
          meetCueTime: this.currentStatus.meetCueTime || 0,
          wcamLiveSlot: this.currentStatus.wcamLiveSlot || '',
          talkbackActive: !!this.currentStatus.talkbackActive,
          activeCamCount: this.offlineCams.size
        }
      })}\n\n`);

      req.on('close', () => {
        this.camSignalClients.delete(clientObj);
        if (role === 'publisher' && slot) {
          // If another publisher SSE for this slot is already open, ignore stale close
          const hasOtherPub = Array.from(this.camSignalClients).some(c => c.role === 'publisher' && c.slot === slot);
          if (hasOtherPub) return;
          // 10-second grace period so brief mobile Wi-Fi/Safari SSE resets never kill a live WebRTC feed
          if (this.camDisconnectTimers.has(slot)) {
            clearTimeout(this.camDisconnectTimers.get(slot));
          }
          const timer = setTimeout(() => {
            this.camDisconnectTimers.delete(slot);
            const stillOpen = Array.from(this.camSignalClients).some(c => c.role === 'publisher' && c.slot === slot);
            if (stillOpen) return;
            if (this.crewMicSlots.has(slot)) {
              this.crewMicSlots.delete(slot);
              this.broadcastCamSignal({ type: 'crew-mic-stop', targetRole: 'viewer', slot });
            }
            if (this.offlineCams.has(slot)) {
              this.offlineCams.delete(slot);
              this.camZoomBySlot.delete(slot);
              this.broadcastCamSignal({ type: 'cam-left', slot, cams: Array.from(this.offlineCams.values()) });
              this.broadcastActiveCamCountTally();
              if (this.onActionCallback) {
                this.onActionCallback('wcam-offline-changed', { cams: Array.from(this.offlineCams.values()) });
              }
            }
          }, 10000);
          this.camDisconnectTimers.set(slot, timer);
        }
      });
      return;
    }

    if (url.pathname === '/api/cam-signal' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          const msg = JSON.parse(body || '{}');
          let slot = String(msg.slot || '1');
          if (msg.pubId && (msg.type === 'hello' || msg.type === 'bye')) {
            for (const c of this.camSignalClients) {
              if (c.role === 'publisher' && c.pubId === msg.pubId && c.slot) {
                slot = String(c.slot);
                break;
              }
            }
          }
          if (msg.type === 'hello') {
            if (this.camDisconnectTimers.has(slot)) {
              clearTimeout(this.camDisconnectTimers.get(slot));
              this.camDisconnectTimers.delete(slot);
            }
            const camInfo = {
              slot,
              pubId: msg.pubId || '',
              label: msg.label || `Wi-Fi Phone Cam ${slot}`,
              connectedAt: Date.now()
            };
            this.offlineCams.set(slot, camInfo);
            this.broadcastCamSignal({ type: 'cam-joined', slot, cam: camInfo, trackChanged: !!msg.trackChanged, cams: Array.from(this.offlineCams.values()) });
            this.broadcastActiveCamCountTally();
            if (this.onActionCallback) {
              this.onActionCallback('wcam-offline-changed', { cams: Array.from(this.offlineCams.values()) });
            }
          } else if (msg.type === 'bye') {
            if (this.camDisconnectTimers.has(slot)) {
              clearTimeout(this.camDisconnectTimers.get(slot));
              this.camDisconnectTimers.delete(slot);
            }
            this.offlineCams.delete(slot);
            this.camZoomBySlot.delete(slot);
            if (this.crewMicSlots.delete(slot)) {
              this.broadcastCamSignal({ type: 'crew-mic-stop', targetRole: 'viewer', slot });
            }
            this.broadcastCamSignal({ type: 'cam-left', slot, cams: Array.from(this.offlineCams.values()) });
            this.broadcastActiveCamCountTally();
            if (this.onActionCallback) {
              this.onActionCallback('wcam-offline-changed', { cams: Array.from(this.offlineCams.values()) });
            }
          } else {
            if (msg.type === 'crew-mic-start') this.crewMicSlots.add(slot);
            else if (msg.type === 'crew-mic-stop') this.crewMicSlots.delete(slot);
            else if (msg.type === 'cam-zoom') {
              const z = Math.max(1, Math.min(5, Number(msg.zoom) || 1));
              this.camZoomBySlot.set(slot, z);
              msg.zoom = z;
            }
            this.broadcastCamSignal(msg);
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

    // 1. Server-Sent Events (SSE) Stream
    if (url.pathname === '/api/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
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

    // 3. Action API (commands from phone - supports both POST JSON and GET query fallback)
    if (url.pathname === '/api/action') {
      if (req.method === 'GET') {
        try {
          const action = url.searchParams.get('action') || '';
          const rawData = url.searchParams.get('data') || '{}';
          const parsedData = JSON.parse(rawData);
          this.executeRemoteAction(action, parsedData);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: err.message }));
        }
        return;
      }

      if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const parsed = JSON.parse(body || '{}');
            this.executeRemoteAction(parsed.action, parsed.data || {});
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
          } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
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

    // 5a. Main ZionCast Library Catalog API for Mobile Order of Service Builder
    if (url.pathname === '/api/library' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        libraryVersion: this.currentStatus.libraryVersion || 0,
        library: this.currentLibrary
      }));
      return;
    }

    // 5b. Bible Books List API
    if (url.pathname === '/api/bible/books' && req.method === 'GET') {
      const ver = url.searchParams.get('v') || url.searchParams.get('version') || 'kjv';
      const bData = this.getBibleData(ver);
      if (!bData || !bData.books) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Bible version not loaded' }));
        return;
      }
      const books = Object.keys(bData.books).map(name => ({
        name,
        chapters: Object.keys(bData.books[name] || {}).length
      }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        version: ver.toLowerCase(),
        versionAbbr: bData.abbreviation || ver.toUpperCase(),
        books
      }));
      return;
    }

    // 5c. Bible Chapter Verses API
    if (url.pathname === '/api/bible/chapter' && req.method === 'GET') {
      const ver = url.searchParams.get('v') || url.searchParams.get('version') || 'kjv';
      const bookReq = url.searchParams.get('book') || 'John';
      const chReq = url.searchParams.get('chapter') || '3';
      const bData = this.getBibleData(ver);
      if (!bData || !bData.books) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, error: 'Bible version not loaded' }));
        return;
      }
      const bookKey = Object.keys(bData.books).find(b => b.toLowerCase() === bookReq.toLowerCase()) || Object.keys(bData.books)[0];
      const bookObj = bData.books[bookKey] || {};
      const chKey = bookObj[chReq] ? chReq : (Object.keys(bookObj)[0] || '1');
      const chObj = bookObj[chKey] || {};
      const versionAbbr = bData.abbreviation || ver.toUpperCase();
      const verses = Object.keys(chObj)
        .sort((a, b) => Number(a) - Number(b))
        .map(vNum => ({
          verse: vNum,
          text: chObj[vNum]
        }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        book: bookKey,
        chapter: chKey,
        version: ver.toLowerCase(),
        versionAbbr,
        verses
      }));
      return;
    }

    // 5d. Bible Lookup API for Mobile Phone Remote (Supports single verse, verse ranges & chapters)
    if (url.pathname === '/api/bible/lookup' && req.method === 'GET') {
      const q = url.searchParams.get('q') || url.searchParams.get('query') || '';
      const ver = url.searchParams.get('v') || url.searchParams.get('version') || 'kjv';
      const result = this.lookupBible(q, ver);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result));
      return;
    }

    // 6. Direct Clean YouTube Embed Proxy
    if (url.pathname === '/embed') {
      const vid = url.searchParams.get('v') || '';
      const autoplay = url.searchParams.get('autoplay') || '1';
      const mute = url.searchParams.get('mute') || '0';
      const loop = url.searchParams.get('loop') || '0';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(this.getEmbedHtml(vid, autoplay, mute, 'hd720', loop));
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
  <meta name="theme-color" content="#0a0e17">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <title>ZionCast Mobile Control</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&display=swap" rel="stylesheet">
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-tap-highlight-color: transparent;
    }

    input, textarea {
      -webkit-user-select: text !important;
      user-select: text !important;
    }

    body {
      background: #080c14;
      color: #f1f5f9;
      font-family: 'Outfit', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
      padding-bottom: calc(env(safe-area-inset-bottom, 12px) + 18px);
    }

    /* Sticky Top Header */
    header.remote-header {
      padding: 11px 14px;
      background: rgba(11, 15, 25, 0.96);
      backdrop-filter: blur(14px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 60;
    }

    .brand-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .brand-logo-icon {
      width: 28px;
      height: 28px;
      border-radius: 8px;
      background: linear-gradient(135deg, #fbbf24, #d97706);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 15px;
      font-weight: 900;
      color: #090d16;
      box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);
    }

    .brand-title {
      font-size: 0.96rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      color: #ffffff;
    }

    .connection-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 0.7rem;
      font-weight: 700;
      background: rgba(16, 185, 129, 0.14);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.32);
    }

    .connection-badge.disconnected {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.35);
    }

    .pulse-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px #10b981;
      animation: pulse 1.6s infinite;
    }

    .connection-badge.disconnected .pulse-dot {
      background: #ef4444;
      box-shadow: none;
      animation: none;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(1.3); }
    }

    /* 4-Column Master Quick Bar */
    .quick-actions-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      padding: 8px 12px;
      background: #0d1320;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    }

    .btn-quick {
      background: #172033;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #cbd5e1;
      padding: 8px 4px;
      border-radius: 9px;
      font-family: inherit;
      font-size: 0.72rem;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      cursor: pointer;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .btn-quick:active { transform: scale(0.96); }

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
      box-shadow: 0 0 12px rgba(217, 119, 6, 0.45);
    }

    .btn-quick.active-theme {
      background: #0284c7 !important;
      color: #ffffff !important;
      border-color: #38bdf8 !important;
      box-shadow: 0 0 12px rgba(2, 132, 199, 0.45);
    }

    .btn-quick.active-clock {
      background: rgba(16, 185, 129, 0.22) !important;
      color: #34d399 !important;
      border-color: #10b981 !important;
    }

    /* Sticky 4-Tab Primary Navigation */
    .remote-tabs-nav {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      padding: 8px 12px;
      background: rgba(11, 16, 27, 0.96);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      position: sticky;
      top: 50px;
      z-index: 55;
    }

    .remote-tab-btn {
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #94a3b8;
      padding: 9px 4px;
      border-radius: 10px;
      font-family: inherit;
      font-size: 0.76rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      cursor: pointer;
      transition: all 0.18s ease;
    }

    .remote-tab-btn.active {
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(217, 119, 6, 0.14));
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.55);
      box-shadow: 0 2px 10px rgba(245, 158, 11, 0.16);
    }

    .tab-count-pill {
      background: rgba(245, 158, 11, 0.25);
      color: #fde68a;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 0.65rem;
      font-weight: 800;
    }

    /* Tab Panes */
    main.remote-content {
      flex: 1;
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .remote-pane {
      display: none;
      flex-direction: column;
      gap: 12px;
    }

    .remote-pane.active {
      display: flex;
    }

    /* Shared Card Styles */
    .r-card {
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 12px 14px;
    }

    .r-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }

    .r-card-title {
      font-size: 0.78rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: #fbbf24;
    }

    /* LIVE PANE */
    .item-header-card {
      background: linear-gradient(145deg, #151e30, #0f1624);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 13px;
      padding: 11px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .item-title-text {
      font-size: 0.92rem;
      font-weight: 800;
      color: #fbbf24;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .slide-counter-pill {
      background: rgba(245, 158, 11, 0.16);
      color: #fde68a;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 0.73rem;
      font-weight: 800;
      flex-shrink: 0;
    }

    .monitor-card {
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 14px;
      padding: 13px 15px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .monitor-card.live-card {
      border-color: rgba(16, 185, 129, 0.45);
      box-shadow: 0 4px 18px rgba(16, 185, 129, 0.09);
    }

    .monitor-tag {
      font-size: 0.68rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .monitor-tag.live { color: #34d399; }
    .monitor-tag.next { color: #94a3b8; }

    .slide-body-preview {
      font-size: 0.96rem;
      font-weight: 600;
      line-height: 1.45;
      color: #ffffff;
      white-space: pre-wrap;
      min-height: 52px;
    }

    .monitor-card.next-card .slide-body-preview {
      font-size: 0.84rem;
      color: #94a3b8;
      min-height: 32px;
    }

    .transport-controls {
      display: grid;
      grid-template-columns: 1fr 1.35fr;
      gap: 10px;
    }

    .btn-transport {
      border: none;
      border-radius: 14px;
      padding: 18px 12px;
      font-family: inherit;
      font-size: 1rem;
      font-weight: 900;
      letter-spacing: 0.03em;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
    }

    .btn-transport:active { transform: scale(0.97); }

    .btn-prev {
      background: #1e293b;
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.14);
    }

    .btn-next {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      color: #090d16;
      box-shadow: 0 6px 18px rgba(245, 158, 11, 0.35);
    }

    .slides-list-grid {
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .slide-item-btn {
      background: #131b2b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 11px;
      padding: 10px 12px;
      text-align: left;
      color: #e2e8f0;
      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
    }

    .slide-item-btn.active {
      background: rgba(16, 185, 129, 0.14);
      border-color: #10b981;
    }

    .slide-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.72rem;
      font-weight: 800;
      color: #fbbf24;
    }

    .slide-item-btn.active .slide-item-top { color: #34d399; }

    .slide-item-lyrics {
      font-size: 0.82rem;
      color: #cbd5e1;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* ORDER OF SERVICE PANE */
    .svc-item-card {
      background: #151e30;
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 12px;
      padding: 10px 11px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      transition: border-color 0.15s ease;
    }

    .svc-item-card.is-live {
      background: linear-gradient(145deg, rgba(16, 185, 129, 0.14), rgba(15, 23, 42, 0.95));
      border-color: #10b981;
      box-shadow: 0 0 16px rgba(16, 185, 129, 0.15);
    }

    .svc-item-main {
      display: flex;
      align-items: center;
      gap: 9px;
    }

    .svc-num {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(245, 158, 11, 0.18);
      color: #fbbf24;
      font-size: 0.72rem;
      font-weight: 800;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .svc-item-card.is-live .svc-num {
      background: #10b981;
      color: #052e16;
    }

    .svc-info {
      flex: 1;
      min-width: 0;
      cursor: pointer;
    }

    .svc-title {
      font-size: 0.86rem;
      font-weight: 700;
      color: #f8fafc;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .svc-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
      font-size: 0.66rem;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 700;
    }

    .svc-type-badge {
      padding: 1px 6px;
      border-radius: 5px;
      background: rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
    }

    .svc-actions {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
    }

    .btn-svc-live {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #090d16;
      border: none;
      border-radius: 8px;
      padding: 7px 10px;
      font-family: inherit;
      font-size: 0.72rem;
      font-weight: 900;
      cursor: pointer;
    }

    .svc-item-card.is-live .btn-svc-live {
      background: #10b981;
      color: #052e16;
    }

    .btn-icon-sm {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      border-radius: 7px;
      padding: 6px 7px;
      font-family: inherit;
      font-size: 0.7rem;
      font-weight: 800;
      cursor: pointer;
    }

    .btn-icon-sm.danger { color: #f87171; }

    /* Inline slide pills inside active service item */
    .svc-inline-slides {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      padding-top: 7px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .btn-inline-slide {
      background: rgba(255, 255, 255, 0.07);
      border: 1px solid rgba(255, 255, 255, 0.14);
      color: #e2e8f0;
      padding: 5px 9px;
      border-radius: 7px;
      font-family: inherit;
      font-size: 0.7rem;
      font-weight: 700;
      cursor: pointer;
    }

    .btn-inline-slide.current {
      background: #10b981;
      border-color: #34d399;
      color: #052e16;
      font-weight: 900;
    }

    /* Sub-tabs & Forms */
    .sub-pill-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
      margin-bottom: 10px;
    }

    .sub-pill-btn {
      background: #182235;
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      padding: 7px 4px;
      border-radius: 8px;
      font-family: inherit;
      font-size: 0.7rem;
      font-weight: 800;
      cursor: pointer;
      text-align: center;
    }

    .sub-pill-btn.active {
      background: rgba(56, 189, 248, 0.18);
      border-color: #38bdf8;
      color: #e0f2fe;
    }

    .r-input, .r-select, .r-textarea {
      width: 100%;
      background: #0b101b;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 9px;
      padding: 9px 11px;
      color: #ffffff;
      font-family: inherit;
      font-size: 0.85rem;
      outline: none;
    }

    .r-input:focus, .r-select:focus, .r-textarea:focus {
      border-color: #f59e0b;
    }

    .lib-row {
      background: #162033;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 9px 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .lib-row-info {
      flex: 1;
      min-width: 0;
    }

    .lib-row-title {
      font-size: 0.83rem;
      font-weight: 700;
      color: #f8fafc;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .lib-row-sub {
      font-size: 0.68rem;
      color: #94a3b8;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .btn-sm-action {
      background: #1e293b;
      border: 1px solid rgba(255, 255, 255, 0.16);
      color: #f8fafc;
      padding: 6px 9px;
      border-radius: 7px;
      font-family: inherit;
      font-size: 0.7rem;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-sm-action.gold {
      background: rgba(245, 158, 11, 0.2);
      border-color: rgba(245, 158, 11, 0.55);
      color: #fbbf24;
    }

    .btn-sm-action.red-live {
      background: #dc2626;
      border-color: #ef4444;
      color: #ffffff;
    }

    /* BIBLE PANE */
    .ver-pills {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
    }

    .ver-pill-btn {
      background: #172033;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      padding: 8px;
      border-radius: 9px;
      font-family: inherit;
      font-size: 0.76rem;
      font-weight: 800;
      cursor: pointer;
    }

    .ver-pill-btn.active {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      color: #090d16;
      border-color: #fbbf24;
    }

    .chip-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .ref-chip {
      background: #182235;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #cbd5e1;
      padding: 5px 9px;
      border-radius: 999px;
      font-family: inherit;
      font-size: 0.7rem;
      font-weight: 700;
      cursor: pointer;
    }

    .verse-card {
      background: #151f32;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 10px;
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 7px;
    }

    .verse-card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .verse-ref-tag {
      font-size: 0.75rem;
      font-weight: 800;
      color: #fbbf24;
    }

    .verse-text-body {
      font-size: 0.86rem;
      line-height: 1.45;
      color: #f1f5f9;
    }

    /* Toast Feedback */
    #remote-toast {
      position: fixed;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: rgba(15, 23, 42, 0.96);
      border: 1px solid rgba(245, 158, 11, 0.6);
      color: #fde68a;
      padding: 9px 16px;
      border-radius: 999px;
      font-size: 0.78rem;
      font-weight: 800;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.7);
      opacity: 0;
      pointer-events: none;
      transition: all 0.22s ease;
      z-index: 200;
      max-width: 92vw;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #remote-toast.show {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    #remote-director-cue-banner {
      display: none;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin: 8px 12px 2px 12px;
      padding: 11px 13px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(220, 38, 38, 0.28), rgba(245, 158, 11, 0.25));
      border: 2px solid #fbbf24;
      color: #ffffff;
      box-shadow: 0 0 22px rgba(245, 158, 11, 0.45);
      animation: cue-flash-pulse 1.1s ease-in-out infinite;
    }

    #remote-director-cue-banner.visible {
      display: flex;
    }

    @keyframes cue-flash-pulse {
      0%, 100% { border-color: #fbbf24; box-shadow: 0 0 18px rgba(245, 158, 11, 0.4); }
      50% { border-color: #f87171; box-shadow: 0 0 26px rgba(239, 68, 68, 0.65); }
    }
  </style>
</head>
<body>

  <header class="remote-header">
    <div class="brand-wrap">
      <div class="brand-logo-icon">✦</div>
      <span class="brand-title">ZionCast Remote</span>
    </div>
    <div id="conn-badge" class="connection-badge">
      <span class="pulse-dot"></span>
      <span id="conn-text">Connected</span>
    </div>
  </header>

  <!-- Master Quick Bar -->
  <div class="quick-actions-bar">
    <button id="btn-blackout" class="btn-quick">⬛ Blackout</button>
    <button id="btn-clear" class="btn-quick">👁️ Clear</button>
    <button id="btn-theme" class="btn-quick">🌌 Theme</button>
    <button id="btn-clock" class="btn-quick">🕒 TV Clock</button>
  </div>

  <!-- 4-Tab Primary Navigation -->
  <nav class="remote-tabs-nav">
    <button class="remote-tab-btn active" data-tab="live">🎛️ Live</button>
    <button class="remote-tab-btn" data-tab="service">📋 Service <span id="service-tab-count" class="tab-count-pill">0</span></button>
    <button class="remote-tab-btn" data-tab="bible">📖 Bible</button>
    <button class="remote-tab-btn" data-tab="tools">🛠️ Tools</button>
  </nav>

  <!-- High-Visibility Flashing Director Cue Banner (Visible on ALL Tabs) -->
  <div id="remote-director-cue-banner" role="alert">
    <div style="flex: 1; min-width: 0;">
      <div style="font-size: 0.62rem; font-weight: 900; letter-spacing: 0.08em; color: #fde68a; text-transform: uppercase;">📣 LIVE DIRECTOR CUE</div>
      <div id="remote-director-cue-text" style="font-size: 0.9rem; font-weight: 800; color: #ffffff; margin-top: 2px; line-height: 1.3;"></div>
    </div>
    <button id="btn-ack-director-cue" style="flex-shrink: 0; padding: 7px 11px; border-radius: 7px; border: 1px solid #34d399; background: #10b981; color: #052e16; font-size: 0.74rem; font-weight: 900; cursor: pointer;">✓ Got It</button>
  </div>

  <main class="remote-content">

    <!-- =====================================================================
         TAB 1: LIVE CONTROLLER
         ===================================================================== -->
    <section id="pane-live" class="remote-pane active">
      <div class="item-header-card">
        <div id="active-title" class="item-title-text">ZionCast Broadcast</div>
        <div id="slide-counter" class="slide-counter-pill">1 / 1</div>
      </div>

      <div class="monitor-card live-card">
        <div class="monitor-tag live">
          <span>● LIVE ON TV</span>
          <span id="cur-label">Slide 1</span>
        </div>
        <div id="cur-body" class="slide-body-preview">Ready for worship service</div>
      </div>

      <div class="monitor-card next-card">
        <div class="monitor-tag next">
          <span>UP NEXT</span>
          <span id="next-label">End</span>
        </div>
        <div id="next-body" class="slide-body-preview">No upcoming slide</div>
      </div>

      <div class="transport-controls">
        <button id="btn-prev" class="btn-transport btn-prev">◀ PREV</button>
        <button id="btn-next" class="btn-transport btn-next">NEXT ▶</button>
      </div>

      <div class="r-card">
        <div class="r-card-header" style="margin-bottom: 8px;">
          <span class="r-card-title">All Slides in Active Item</span>
        </div>
        <div id="slides-list" class="slides-list-grid"></div>
      </div>
    </section>

    <!-- =====================================================================
         TAB 2: MAIN ZIONCAST ORDER OF SERVICE
         ===================================================================== -->
    <section id="pane-service" class="remote-pane">
      <div class="r-card">
        <div class="r-card-header">
          <div>
            <div class="r-card-title">📋 Order of Service</div>
            <div id="remote-service-title" style="font-size: 0.85rem; font-weight: 700; color: #f8fafc; margin-top: 2px;">Sunday Worship Service</div>
          </div>
          <span id="remote-service-count" class="slide-counter-pill">0 items</span>
        </div>
        <div id="remote-service-list" style="display: flex; flex-direction: column; gap: 8px;"></div>
      </div>

      <!-- Add From Main ZionCast Library into Order of Service -->
      <div class="r-card">
        <div class="r-card-header">
          <span class="r-card-title">➕ Add to Order of Service</span>
        </div>

        <div class="sub-pill-bar">
          <button class="sub-pill-btn active" data-libcat="songs">🎵 Songs</button>
          <button class="sub-pill-btn" data-libcat="media">🎬 Flyers</button>
          <button class="sub-pill-btn" data-libcat="custom">📢 Notices</button>
          <button class="sub-pill-btn" data-libcat="new">✍️ Custom</button>
        </div>

        <div id="lib-browser-wrap">
          <input type="text" id="lib-search-input" class="r-input" placeholder="Search main ZionCast library..." style="margin-bottom: 9px;">
          <div id="lib-items-list" style="display: flex; flex-direction: column; gap: 7px; max-height: 300px; overflow-y: auto;"></div>
        </div>

        <div id="lib-new-custom-wrap" style="display: none; flex-direction: column; gap: 8px;">
          <input type="text" id="custom-note-title" class="r-input" placeholder="Title (e.g. Welcome / Altar Call / Offering)">
          <textarea id="custom-note-body" class="r-textarea" rows="3" placeholder="Type slide text to add to Order of Service or project live..."></textarea>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button id="btn-custom-add-svc" class="btn-sm-action gold" style="padding: 10px;">➕ Add to Service</button>
            <button id="btn-custom-go-live" class="btn-sm-action red-live" style="padding: 10px;">⚡ Project Live</button>
          </div>
        </div>
      </div>
    </section>

    <!-- =====================================================================
         TAB 3: HOLY BIBLE SCRIPTURES (KJV, RSV, GNT)
         ===================================================================== -->
    <section id="pane-bible" class="remote-pane">
      <div class="r-card" style="display: flex; flex-direction: column; gap: 10px;">
        <div class="r-card-header" style="margin-bottom: 0;">
          <span class="r-card-title">📖 Holy Bible Scriptures</span>
          <span id="bible-active-ver-badge" class="slide-counter-pill">KJV</span>
        </div>

        <!-- Translation Selector -->
        <div class="ver-pills">
          <button class="ver-pill-btn active" data-ver="kjv">KJV</button>
          <button class="ver-pill-btn" data-ver="rsv">RSV</button>
          <button class="ver-pill-btn" data-ver="gnt">GNT</button>
        </div>

        <!-- Quick Reference Search -->
        <div style="display: flex; gap: 6px;">
          <input type="text" id="bible-search-input" class="r-input" placeholder="e.g. John 3:16 or Psalm 23:1-6">
          <button id="btn-bible-search" class="btn-svc-live" style="padding: 0 16px; font-size: 0.82rem;">Find</button>
        </div>

        <div class="chip-row">
          <button class="ref-chip" data-ref="John 3:16">John 3:16</button>
          <button class="ref-chip" data-ref="Psalm 23:1-6">Psalm 23:1-6</button>
          <button class="ref-chip" data-ref="Romans 8:28">Rom 8:28</button>
          <button class="ref-chip" data-ref="Philippians 4:13">Phil 4:13</button>
          <button class="ref-chip" data-ref="Jeremiah 29:11">Jer 29:11</button>
          <button class="ref-chip" data-ref="Proverbs 3:5-6">Prov 3:5-6</button>
        </div>

        <!-- Book -> Chapter -> Verse Picker -->
        <div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 10px;">
          <div style="font-size: 0.7rem; font-weight: 700; color: #94a3b8; margin-bottom: 6px;">OR SELECT BOOK, CHAPTER & VERSE:</div>
          <div style="display: grid; grid-template-columns: 1.5fr 0.85fr 0.95fr; gap: 6px;">
            <select id="sel-bible-book" class="r-select"></select>
            <select id="sel-bible-chapter" class="r-select"></select>
            <select id="sel-bible-verse" class="r-select"></select>
          </div>
        </div>
      </div>

      <!-- Selected Scripture Result & Actions -->
      <div id="bible-result-card" class="r-card" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <span id="bible-res-ref" style="font-size: 0.9rem; font-weight: 900; color: #fbbf24;">John 3:16 (KJV)</span>
          <div style="display: flex; gap: 6px;">
            <button id="btn-bible-add-svc" class="btn-sm-action gold">➕ + Service</button>
            <button id="btn-bible-proj-live" class="btn-sm-action red-live">🔴 Project Live</button>
          </div>
        </div>
        <div id="bible-verses-container" style="display: flex; flex-direction: column; gap: 7px; max-height: 360px; overflow-y: auto;"></div>
      </div>
    </section>

    <!-- =====================================================================
         TAB 4: TOOLS (COUNTDOWN TIMER, SECRET STAGE NOTE, TV ALERT)
         ===================================================================== -->
    <section id="pane-tools" class="remote-pane">
      <!-- Pre-Service Countdown Timer -->
      <div class="r-card" style="display: flex; flex-direction: column; gap: 10px;">
        <div class="r-card-header" style="margin-bottom: 0;">
          <span class="r-card-title">⏱️ Pre-Service Countdown</span>
          <span id="remote-cd-status" class="slide-counter-pill">READY</span>
        </div>

        <div style="background: #090d16; border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 12px; text-align: center;">
          <div id="remote-cd-digits" style="font-size: 2.2rem; font-weight: 900; font-variant-numeric: tabular-nums; color: #ffffff;">05:00</div>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px;">
          <button class="btn-icon-sm cd-preset-btn" data-min="5">5m</button>
          <button class="btn-icon-sm cd-preset-btn" data-min="10">10m</button>
          <button class="btn-icon-sm cd-preset-btn" data-min="15">15m</button>
          <button class="btn-icon-sm cd-preset-btn" data-min="20">20m</button>
        </div>

        <div style="display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 6px;">
          <select id="remote-cd-pos" class="r-select">
            <option value="top-right">↗ Top-Right (Flyer Safe)</option>
            <option value="top-left">↖ Top-Left</option>
            <option value="bottom-left">↙ Bottom-Left</option>
            <option value="bottom-center">⬇ Bottom-Center</option>
            <option value="center">🎯 Center Card</option>
          </select>
          <select id="remote-cd-size" class="r-select">
            <option value="compact">Compact Pill</option>
            <option value="medium">Medium Card</option>
            <option value="large">Large Card</option>
          </select>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px;">
          <button id="btn-cd-start" class="btn-sm-action" style="background: #10b981; color: #052e16; border-color: #34d399; padding: 9px;">▶ Start</button>
          <button id="btn-cd-pause" class="btn-sm-action" style="padding: 9px;">⏸ Pause</button>
          <button id="btn-cd-reset" class="btn-sm-action" style="padding: 9px;">⏹ Reset</button>
        </div>

        <button id="btn-cd-toggle-tv" class="btn-sm-action gold" style="padding: 10px; width: 100%; text-align: center;">🔴 Show Countdown on TV</button>
      </div>

      <!-- Private Preacher Stage Note -->
      <div class="r-card" style="display: flex; flex-direction: column; gap: 9px;">
        <div class="r-card-header" style="margin-bottom: 0;">
          <span class="r-card-title" style="color: #f87171;">🤫 Secret Preacher Stage Note</span>
        </div>
        <div style="font-size: 0.72rem; color: #94a3b8;">Flashes ONLY on the Pastor's Stage Monitor (invisible on Audience TV).</div>
        <div class="chip-row">
          <button class="ref-chip stage-preset-chip" data-msg="Pastor: 5 minutes remaining">5 Mins Left</button>
          <button class="ref-chip stage-preset-chip" data-msg="Pastor: Please wrap up now">Wrap Up</button>
          <button class="ref-chip stage-preset-chip" data-msg="Praise Team: Prepare for Altar Call">Altar Call</button>
          <button class="ref-chip stage-preset-chip" data-msg="Mic battery low - switching to Mic 2">Mic Low</button>
        </div>
        <div style="display: flex; gap: 6px;">
          <input type="text" id="stage-msg-input" class="r-input" placeholder="Type private note to pulpit...">
          <button id="btn-send-stage-msg" class="btn-sm-action red-live">Flash</button>
          <button id="btn-clear-stage-msg" class="btn-sm-action">Clear</button>
        </div>
        <div id="stage-msg-active-status" style="display: none; font-size: 0.74rem; font-weight: 700; color: #f87171;"></div>
      </div>

      <!-- Crew Google Meet Voice Comms Card -->
      <div id="remote-meet-card" class="r-card" style="display: none; flex-direction: column; gap: 8px;">
        <div class="r-card-header" style="margin-bottom: 0;">
          <span class="r-card-title">Crew Voice Intercom (Meet)</span>
          <span id="remote-meet-code" class="slide-counter-pill">LIVE</span>
        </div>
        <div style="font-size: 0.72rem; color: #94a3b8; line-height: 1.4;">
          Join on a <strong>2nd / earpiece device</strong> if another phone is streaming camera video (mobile OS pauses background cameras).
        </div>
        <a id="btn-remote-join-meet" href="#" target="_blank" rel="noopener noreferrer" class="btn-sm-action" style="display: block; text-align: center; text-decoration: none; background: #1e293b; color: #f8fafc; border-color: rgba(56, 189, 248, 0.35); font-weight: 700; padding: 9px;">
          Open Crew Google Meet
        </a>
        <div id="remote-meet-cue-box" style="display: none; padding: 7px 10px; border-radius: 6px; background: #161d2b; border: 1px solid rgba(255, 255, 255, 0.14); color: #f8fafc; font-size: 0.76rem; font-weight: 700; text-align: center;"></div>
      </div>

      <!-- Audience TV Alert Banner -->
      <div class="r-card" style="display: flex; flex-direction: column; gap: 9px;">
        <div class="r-card-header" style="margin-bottom: 0;">
          <span class="r-card-title">📢 Audience TV Alert Banner</span>
        </div>
        <div style="display: flex; gap: 6px;">
          <input type="text" id="alert-input" class="r-input" placeholder="Parent needed in Nursery / Parking notice...">
          <button id="btn-send-alert" class="btn-sm-action gold">Show</button>
          <button id="btn-clear-alert" class="btn-sm-action">Clear</button>
        </div>
      </div>
    </section>

  </main>

  <div id="remote-toast"></div>

  <script>
    (function() {
      var connBadge = document.getElementById('conn-badge');
      var connText = document.getElementById('conn-text');
      var toastEl = document.getElementById('remote-toast');

      var btnBlackout = document.getElementById('btn-blackout');
      var btnClear = document.getElementById('btn-clear');
      var btnTheme = document.getElementById('btn-theme');
      var btnClock = document.getElementById('btn-clock');

      var activeTitle = document.getElementById('active-title');
      var slideCounter = document.getElementById('slide-counter');
      var curLabel = document.getElementById('cur-label');
      var curBody = document.getElementById('cur-body');
      var nextLabel = document.getElementById('next-label');
      var nextBody = document.getElementById('next-body');
      var slidesListEl = document.getElementById('slides-list');

      var serviceTabCount = document.getElementById('service-tab-count');
      var remoteServiceTitle = document.getElementById('remote-service-title');
      var remoteServiceCount = document.getElementById('remote-service-count');
      var remoteServiceList = document.getElementById('remote-service-list');

      var libSearchInput = document.getElementById('lib-search-input');
      var libItemsList = document.getElementById('lib-items-list');
      var libBrowserWrap = document.getElementById('lib-browser-wrap');
      var libNewCustomWrap = document.getElementById('lib-new-custom-wrap');

      var currentAppState = {};
      var libraryCatalog = { songs: [], media: [], custom: [] };
      var loadedLibraryVersion = -1;
      var activeLibCategory = 'songs';

      // Bible State
      var NL = String.fromCharCode(10);
      var activeBibleVer = 'kjv';
      var bibleBooksCache = {};
      var currentPassagePayload = null;

      function showToast(msg) {
        if (!toastEl) return;
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastEl.__t);
        toastEl.__t = setTimeout(function() {
          toastEl.classList.remove('show');
        }, 2400);
      }

      function escapeHtml(str) {
        if (!str) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      }

      function sendAction(action, data) {
        try {
          if (navigator.vibrate && navigator.userActivation && navigator.userActivation.isActive) {
            navigator.vibrate(20);
          }
        } catch (e) {}
        var payloadObj = data || {};
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function() { controller.abort(); }, 3500) : null;
        return fetch('/api/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          signal: controller ? controller.signal : undefined,
          body: JSON.stringify({ action: action, data: payloadObj })
        }).then(function(r) {
          if (timeoutId) clearTimeout(timeoutId);
          if (!r.ok) throw new Error('HTTP ' + r.status);
          connBadge.classList.remove('disconnected');
          connText.textContent = 'Connected';
          return r;
        }).catch(function() {
          if (timeoutId) clearTimeout(timeoutId);
          // Fallback to GET query params if POST body was dropped on guest/church Wi-Fi
          var qs = '?action=' + encodeURIComponent(action) +
            '&data=' + encodeURIComponent(JSON.stringify(payloadObj)) +
            '&_t=' + Date.now();
          return fetch('/api/action' + qs, {
            method: 'GET',
            cache: 'no-store'
          }).then(function(r2) {
            if (r2 && r2.ok) {
              connBadge.classList.remove('disconnected');
              connText.textContent = 'Connected';
            }
            return r2;
          }).catch(function(err2) {
            console.error('Action failed:', err2);
            connBadge.classList.add('disconnected');
            connText.textContent = 'Reconnecting...';
            showToast('⚠️ Connection lost — check Wi-Fi or rescan QR code on laptop');
          });
        });
      }

      // Primary 4-Tab Switching
      var tabBtns = document.querySelectorAll('.remote-tab-btn');
      var panes = document.querySelectorAll('.remote-pane');
      tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          var target = btn.getAttribute('data-tab');
          tabBtns.forEach(function(b) { b.classList.toggle('active', b === btn); });
          panes.forEach(function(p) { p.classList.toggle('active', p.id === 'pane-' + target); });
          if (target === 'service' && loadedLibraryVersion < 0) {
            fetchLibraryCatalog();
          }
          if (target === 'bible' && !bibleBooksCache[activeBibleVer]) {
            initBibleBooks(activeBibleVer);
          }
        });
      });

      // Master Quick Controls
      btnBlackout.addEventListener('click', function() { sendAction('blackout'); });
      btnClear.addEventListener('click', function() { sendAction('clear'); });
      btnTheme.addEventListener('click', function() { sendAction('theme'); });
      btnClock.addEventListener('click', function() { sendAction('toggle-clock'); });

      document.getElementById('btn-prev').addEventListener('click', function() { sendAction('prev'); });
      var btnRemoteCamPreacher = document.getElementById('btn-remote-cam-preacher');
      if (btnRemoteCamPreacher) {
        btnRemoteCamPreacher.addEventListener('click', function() {
          sendAction('switch-camera', { mode: 'preacher' });
        });
      }
      var btnRemoteCamWorship = document.getElementById('btn-remote-cam-worship');
      if (btnRemoteCamWorship) {
        btnRemoteCamWorship.addEventListener('click', function() {
          sendAction('switch-camera', { mode: 'background' });
        });
      }
      var btnRemoteCamOff = document.getElementById('btn-remote-cam-off');
      if (btnRemoteCamOff) {
        btnRemoteCamOff.addEventListener('click', function() {
          sendAction('switch-camera', { mode: 'none' });
        });
      }

      document.getElementById('btn-next').addEventListener('click', function() { sendAction('next'); });

      // =====================================================================
      // ORDER OF SERVICE & MAIN ZIONCAST LIBRARY CATALOG
      // =====================================================================
      function fetchLibraryCatalog() {
        fetch('/api/library')
          .then(function(r) { return r.json(); })
          .then(function(res) {
            if (res && res.success && res.library) {
              libraryCatalog = res.library;
              loadedLibraryVersion = res.libraryVersion || 0;
              renderLibraryBrowser();
            }
          })
          .catch(function() {});
      }

      function renderServiceOrder(state) {
        var list = Array.isArray(state.serviceOrder) ? state.serviceOrder : [];
        serviceTabCount.textContent = String(list.length);
        remoteServiceCount.textContent = list.length + (list.length === 1 ? ' item' : ' items');
        if (state.serviceTitle) {
          remoteServiceTitle.textContent = state.serviceTitle;
        }

        remoteServiceList.innerHTML = '';
        if (list.length === 0) {
          remoteServiceList.innerHTML = '<div style="text-align:center; padding:18px 10px; color:#94a3b8; font-size:0.8rem;">Order of Service is empty.<br>Add Songs, Flyers, Notices, or Bible Scriptures below!</div>';
          return;
        }

        list.forEach(function(item, idx) {
          var card = document.createElement('div');
          card.className = 'svc-item-card' + (item.isLive ? ' is-live' : '');

          var mainRow = document.createElement('div');
          mainRow.className = 'svc-item-main';

          var numEl = document.createElement('div');
          numEl.className = 'svc-num';
          numEl.textContent = String(idx + 1);

          var infoEl = document.createElement('div');
          infoEl.className = 'svc-info';
          infoEl.innerHTML =
            '<div class="svc-title">' + escapeHtml(item.title) + '</div>' +
            '<div class="svc-meta">' +
              '<span class="svc-type-badge">' + escapeHtml(item.type || 'item') + '</span>' +
              '<span style="white-space:nowrap;">' + (item.slideCount || 1) + ((item.slideCount || 1) === 1 ? ' slide' : ' slides') + '</span>' +
              (item.isLive ? '<span style="color:#34d399; white-space:nowrap;">● ON AIR</span>' : '') +
            '</div>';
          infoEl.addEventListener('click', function() {
            sendAction('service-launch', { index: idx });
            showToast('⚡ Live on TV: ' + item.title);
          });

          var actionsEl = document.createElement('div');
          actionsEl.className = 'svc-actions';

          var btnLive = document.createElement('button');
          btnLive.className = 'btn-svc-live';
          btnLive.textContent = item.isLive ? '● LIVE' : '▶ LIVE';
          btnLive.addEventListener('click', function() {
            sendAction('service-launch', { index: idx });
            showToast('⚡ Live on TV: ' + item.title);
          });

          var btnUp = document.createElement('button');
          btnUp.className = 'btn-icon-sm';
          btnUp.textContent = '▲';
          btnUp.disabled = idx === 0;
          btnUp.addEventListener('click', function() {
            sendAction('service-move', { index: idx, direction: -1 });
          });

          var btnDown = document.createElement('button');
          btnDown.className = 'btn-icon-sm';
          btnDown.textContent = '▼';
          btnDown.disabled = idx === list.length - 1;
          btnDown.addEventListener('click', function() {
            sendAction('service-move', { index: idx, direction: 1 });
          });

          var btnDel = document.createElement('button');
          btnDel.className = 'btn-icon-sm danger';
          btnDel.textContent = '✕';
          btnDel.addEventListener('click', function() {
            sendAction('service-remove', { index: idx });
            showToast('Removed from Service');
          });

          actionsEl.appendChild(btnLive);
          actionsEl.appendChild(btnUp);
          actionsEl.appendChild(btnDown);
          actionsEl.appendChild(btnDel);

          mainRow.appendChild(numEl);
          mainRow.appendChild(infoEl);
          mainRow.appendChild(actionsEl);
          card.appendChild(mainRow);

          // If this Order of Service item is currently LIVE and has multiple slides, show inline slide controls!
          if (item.isLive && Array.isArray(state.slidesList) && state.slidesList.length > 1) {
            var inlineStrip = document.createElement('div');
            inlineStrip.className = 'svc-inline-slides';

            var prevMini = document.createElement('button');
            prevMini.className = 'btn-inline-slide';
            prevMini.textContent = '◀ Prev';
            prevMini.addEventListener('click', function() { sendAction('prev'); });
            inlineStrip.appendChild(prevMini);

            state.slidesList.forEach(function(sl, sIdx) {
              var sBtn = document.createElement('button');
              sBtn.className = 'btn-inline-slide' + (sIdx === state.currentSlideIndex ? ' current' : '');
              sBtn.textContent = sl.label || ('S' + (sIdx + 1));
              sBtn.addEventListener('click', function() {
                sendAction('goto', { index: sIdx });
              });
              inlineStrip.appendChild(sBtn);
            });

            var nextMini = document.createElement('button');
            nextMini.className = 'btn-inline-slide';
            nextMini.textContent = 'Next ▶';
            nextMini.addEventListener('click', function() { sendAction('next'); });
            inlineStrip.appendChild(nextMini);

            card.appendChild(inlineStrip);
          }

          remoteServiceList.appendChild(card);
        });
      }

      // Library Category Sub-Tabs
      var subPillBtns = document.querySelectorAll('.sub-pill-btn');
      subPillBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          activeLibCategory = btn.getAttribute('data-libcat');
          subPillBtns.forEach(function(b) { b.classList.toggle('active', b === btn); });
          if (activeLibCategory === 'new') {
            libBrowserWrap.style.display = 'none';
            libNewCustomWrap.style.display = 'flex';
          } else {
            libBrowserWrap.style.display = 'block';
            libNewCustomWrap.style.display = 'none';
            renderLibraryBrowser();
          }
        });
      });

      libSearchInput.addEventListener('input', renderLibraryBrowser);

      function renderLibraryBrowser() {
        var q = (libSearchInput.value || '').trim().toLowerCase();
        var items = [];
        if (activeLibCategory === 'songs') items = libraryCatalog.songs || [];
        else if (activeLibCategory === 'media') items = libraryCatalog.media || [];
        else if (activeLibCategory === 'custom') items = libraryCatalog.custom || [];

        var filtered = items.filter(function(it) {
          return (it.title || '').toLowerCase().includes(q) ||
                 (it.subtitle || '').toLowerCase().includes(q);
        });

        libItemsList.innerHTML = '';
        if (filtered.length === 0) {
          libItemsList.innerHTML = '<div style="text-align:center; padding:14px; color:#94a3b8; font-size:0.78rem;">No matching items in main ZionCast library.</div>';
          return;
        }

        filtered.forEach(function(it) {
          var row = document.createElement('div');
          row.className = 'lib-row';
          row.innerHTML =
            '<div class="lib-row-info">' +
              '<div class="lib-row-title">' + escapeHtml(it.title) + '</div>' +
              '<div class="lib-row-sub">' + escapeHtml(it.subtitle || '') + '</div>' +
            '</div>';

          var btns = document.createElement('div');
          btns.style.cssText = 'display:flex; gap:5px; flex-shrink:0;';

          var bAdd = document.createElement('button');
          bAdd.className = 'btn-sm-action gold';
          bAdd.textContent = '+ Service';
          bAdd.addEventListener('click', function() {
            sendAction('service-add-library-item', { category: activeLibCategory, id: it.id, goLive: false });
            showToast('➕ Added "' + it.title + '" to Order of Service');
          });

          var bLive = document.createElement('button');
          bLive.className = 'btn-sm-action red-live';
          bLive.textContent = '⚡ Live';
          bLive.addEventListener('click', function() {
            sendAction('service-add-library-item', { category: activeLibCategory, id: it.id, goLive: true });
            showToast('⚡ Live on TV: ' + it.title);
          });

          btns.appendChild(bAdd);
          btns.appendChild(bLive);
          row.appendChild(btns);
          libItemsList.appendChild(row);
        });
      }

      // Create Custom Slide from Phone -> Order of Service or Live
      function submitPhoneCustomSlide(goLive) {
        var titleEl = document.getElementById('custom-note-title');
        var bodyEl = document.getElementById('custom-note-body');
        var title = (titleEl.value || '').trim() || 'Sanctuary Notice';
        var body = (bodyEl.value || '').trim();
        if (!body && !titleEl.value.trim()) {
          showToast('Please enter a slide title or message');
          return;
        }
        sendAction('service-add-custom-note', { title: title, body: body || title, goLive: !!goLive });
        titleEl.value = '';
        bodyEl.value = '';
        showToast(goLive ? ('⚡ Projected "' + title + '" Live!') : ('➕ Added "' + title + '" to Order of Service!'));
      }

      document.getElementById('btn-custom-add-svc').addEventListener('click', function() { submitPhoneCustomSlide(false); });
      document.getElementById('btn-custom-go-live').addEventListener('click', function() { submitPhoneCustomSlide(true); });

      // =====================================================================
      // HOLY BIBLE SCRIPTURES (SEARCH + BOOK/CHAPTER/VERSE PICKER)
      // =====================================================================
      var selBook = document.getElementById('sel-bible-book');
      var selChapter = document.getElementById('sel-bible-chapter');
      var selVerse = document.getElementById('sel-bible-verse');
      var bibleSearchInput = document.getElementById('bible-search-input');
      var bibleResRef = document.getElementById('bible-res-ref');
      var bibleVersesContainer = document.getElementById('bible-verses-container');
      var bibleVerBadge = document.getElementById('bible-active-ver-badge');

      var currentChapterData = null;

      function initBibleBooks(ver, preserveBook) {
        fetch('/api/bible/books?v=' + encodeURIComponent(ver))
          .then(function(r) { return r.json(); })
          .then(function(res) {
            if (!res || !res.success || !Array.isArray(res.books)) return;
            bibleBooksCache[ver] = res.books;
            var prevBook = preserveBook ? selBook.value : 'John';
            selBook.innerHTML = '';
            res.books.forEach(function(b) {
              var opt = document.createElement('option');
              opt.value = b.name;
              opt.textContent = b.name;
              opt.setAttribute('data-chapters', String(b.chapters));
              selBook.appendChild(opt);
            });
            var hasPrev = res.books.some(function(b) { return b.name === prevBook; });
            selBook.value = hasPrev ? prevBook : (res.books[42] ? res.books[42].name : res.books[0].name);
            populateChaptersDropdown(preserveBook ? selChapter.value : '3', preserveBook ? selVerse.value : '16');
          })
          .catch(function() {});
      }

      function populateChaptersDropdown(targetCh, targetVerse) {
        var books = bibleBooksCache[activeBibleVer] || [];
        var chosen = books.find(function(b) { return b.name === selBook.value; });
        var count = chosen ? chosen.chapters : 1;
        selChapter.innerHTML = '';
        for (var i = 1; i <= count; i++) {
          var opt = document.createElement('option');
          opt.value = String(i);
          opt.textContent = 'Ch ' + i;
          selChapter.appendChild(opt);
        }
        selChapter.value = (targetCh && Number(targetCh) <= count) ? String(targetCh) : '1';
        loadChapterVerses(selBook.value, selChapter.value, targetVerse || 'all');
      }

      function loadChapterVerses(book, chapter, targetVerse) {
        fetch('/api/bible/chapter?v=' + encodeURIComponent(activeBibleVer) + '&book=' + encodeURIComponent(book) + '&chapter=' + encodeURIComponent(chapter))
          .then(function(r) { return r.json(); })
          .then(function(res) {
            if (!res || !res.success) return;
            currentChapterData = res;
            selVerse.innerHTML = '';
            var allOpt = document.createElement('option');
            allOpt.value = 'all';
            allOpt.textContent = 'All (' + res.verses.length + 'v)';
            selVerse.appendChild(allOpt);

            res.verses.forEach(function(v) {
              var opt = document.createElement('option');
              opt.value = v.verse;
              opt.textContent = 'v. ' + v.verse;
              selVerse.appendChild(opt);
            });

            var exists = targetVerse && targetVerse !== 'all' && res.verses.some(function(v) { return v.verse === String(targetVerse); });
            selVerse.value = exists ? String(targetVerse) : 'all';
            renderSelectedChapterVerses();
          })
          .catch(function() {});
      }

      function renderSelectedChapterVerses() {
        if (!currentChapterData) return;
        var book = currentChapterData.book;
        var ch = currentChapterData.chapter;
        var verAbbr = currentChapterData.versionAbbr || activeBibleVer.toUpperCase();
        var chosenV = selVerse.value;

        var versesToShow = chosenV === 'all'
          ? currentChapterData.verses
          : currentChapterData.verses.filter(function(v) { return v.verse === chosenV; });

        if (versesToShow.length === 0) versesToShow = currentChapterData.verses;

        var verseLabel = chosenV === 'all'
          ? ('1-' + versesToShow[versesToShow.length - 1].verse)
          : chosenV;

        var slides = versesToShow.map(function(v) {
          var lbl = book + ' ' + ch + ':' + v.verse + ' (' + verAbbr + ')';
          return {
            label: lbl,
            body: '"' + v.text + '"' + NL + NL + '— ' + lbl
          };
        });

        currentPassagePayload = {
          book: book,
          chapter: ch,
          verse: verseLabel,
          version: activeBibleVer,
          versionAbbr: verAbbr,
          text: versesToShow[0] ? versesToShow[0].text : '',
          slides: slides
        };

        bibleResRef.textContent = book + ' ' + ch + ':' + verseLabel + ' (' + verAbbr + ')';
        renderVerseCardsList(book, ch, verAbbr, versesToShow);
      }

      function renderVerseCardsList(book, ch, verAbbr, versesArr) {
        bibleVersesContainer.innerHTML = '';
        versesArr.forEach(function(v) {
          var vCard = document.createElement('div');
          vCard.className = 'verse-card';
          var singlePayload = {
            book: book,
            chapter: ch,
            verse: v.verse,
            version: activeBibleVer,
            versionAbbr: verAbbr,
            text: v.text
          };

          var top = document.createElement('div');
          top.className = 'verse-card-top';
          top.innerHTML = '<span class="verse-ref-tag">' + escapeHtml(book + ' ' + ch + ':' + v.verse) + '</span>';

          var actWrap = document.createElement('div');
          actWrap.style.cssText = 'display:flex; gap:5px;';

          var bSvc = document.createElement('button');
          bSvc.className = 'btn-sm-action gold';
          bSvc.textContent = '+ Service';
          bSvc.addEventListener('click', function() {
            sendAction('add-scripture-service', singlePayload);
            showToast('➕ Added ' + book + ' ' + ch + ':' + v.verse + ' to Service');
          });

          var bLive = document.createElement('button');
          bLive.className = 'btn-sm-action red-live';
          bLive.textContent = '⚡ Live';
          bLive.addEventListener('click', function() {
            sendAction('project-scripture', singlePayload);
            showToast('📖 Live on TV: ' + book + ' ' + ch + ':' + v.verse);
          });

          actWrap.appendChild(bSvc);
          actWrap.appendChild(bLive);
          top.appendChild(actWrap);

          var body = document.createElement('div');
          body.className = 'verse-text-body';
          body.textContent = v.text;

          vCard.appendChild(top);
          vCard.appendChild(body);
          bibleVersesContainer.appendChild(vCard);
        });
      }

      function runBibleQuery(rawQuery) {
        var q = (rawQuery || bibleSearchInput.value || '').trim();
        if (!q) return;
        fetch('/api/bible/lookup?q=' + encodeURIComponent(q) + '&v=' + encodeURIComponent(activeBibleVer))
          .then(function(r) { return r.json(); })
          .then(function(res) {
            if (!res || !res.success) {
              showToast(res && res.error ? res.error : 'Scripture not found');
              return;
            }
            var verAbbr = res.versionAbbr || activeBibleVer.toUpperCase();
            var versesArr = Array.isArray(res.verses) && res.verses.length > 0
              ? res.verses
              : [{ verse: res.verse, text: res.text }];

            currentPassagePayload = {
              book: res.book,
              chapter: res.chapter,
              verse: res.verse,
              version: res.version || activeBibleVer,
              versionAbbr: verAbbr,
              text: res.text,
              slides: res.slides || versesArr.map(function(v) {
                var lbl = res.book + ' ' + res.chapter + ':' + v.verse + ' (' + verAbbr + ')';
                return { label: lbl, body: '"' + v.text + '"' + NL + NL + '— ' + lbl };
              })
            };

            bibleResRef.textContent = res.reference || (res.book + ' ' + res.chapter + ':' + res.verse + ' (' + verAbbr + ')');
            renderVerseCardsList(res.book, res.chapter, verAbbr, versesArr);

            // Sync dropdowns silently if loaded
            if (bibleBooksCache[activeBibleVer]) {
              selBook.value = res.book;
            }
          })
          .catch(function() {
            showToast('Lookup error');
          });
      }

      // Wire Bible UI Events
      document.querySelectorAll('.ver-pill-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          activeBibleVer = btn.getAttribute('data-ver') || 'kjv';
          bibleVerBadge.textContent = activeBibleVer.toUpperCase();
          document.querySelectorAll('.ver-pill-btn').forEach(function(b) { b.classList.toggle('active', b === btn); });
          if (bibleSearchInput.value.trim()) {
            runBibleQuery(bibleSearchInput.value.trim());
          } else {
            initBibleBooks(activeBibleVer, true);
          }
        });
      });

      document.getElementById('btn-bible-search').addEventListener('click', function() {
        runBibleQuery();
      });
      bibleSearchInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') runBibleQuery();
      });

      document.querySelectorAll('.ref-chip[data-ref]').forEach(function(chip) {
        chip.addEventListener('click', function() {
          var ref = chip.getAttribute('data-ref');
          bibleSearchInput.value = ref;
          runBibleQuery(ref);
        });
      });

      selBook.addEventListener('change', function() {
        bibleSearchInput.value = '';
        populateChaptersDropdown('1', 'all');
      });
      selChapter.addEventListener('change', function() {
        bibleSearchInput.value = '';
        loadChapterVerses(selBook.value, selChapter.value, 'all');
      });
      selVerse.addEventListener('change', function() {
        bibleSearchInput.value = '';
        renderSelectedChapterVerses();
      });

      document.getElementById('btn-bible-proj-live').addEventListener('click', function() {
        if (!currentPassagePayload) return;
        sendAction('project-scripture', currentPassagePayload);
        showToast('📖 Projected ' + bibleResRef.textContent + ' Live!');
      });

      document.getElementById('btn-bible-add-svc').addEventListener('click', function() {
        if (!currentPassagePayload) return;
        sendAction('add-scripture-service', currentPassagePayload);
        showToast('➕ Added ' + bibleResRef.textContent + ' to Order of Service!');
      });

      // =====================================================================
      // TOOLS TAB (COUNTDOWN, PRIVATE STAGE NOTE, TV ALERT)
      // =====================================================================
      document.getElementById('btn-cd-start').addEventListener('click', function() {
        sendAction('countdown-control', { cmd: 'start' });
        showToast('⏱️ Countdown Started on TV');
      });
      document.getElementById('btn-cd-pause').addEventListener('click', function() {
        sendAction('countdown-control', { cmd: 'pause' });
      });
      document.getElementById('btn-cd-reset').addEventListener('click', function() {
        sendAction('countdown-control', { cmd: 'reset' });
      });
      document.getElementById('btn-cd-toggle-tv').addEventListener('click', function() {
        sendAction('countdown-control', { cmd: 'toggle-project' });
      });

      document.querySelectorAll('.cd-preset-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var mins = parseInt(btn.getAttribute('data-min'), 10) || 5;
          sendAction('countdown-control', { cmd: 'set-minutes', minutes: mins });
          showToast('⏱️ Set Countdown to ' + mins + ' mins');
        });
      });

      document.getElementById('remote-cd-pos').addEventListener('change', function(e) {
        sendAction('countdown-control', { cmd: 'set-style', position: e.target.value });
      });
      document.getElementById('remote-cd-size').addEventListener('change', function(e) {
        sendAction('countdown-control', { cmd: 'set-style', size: e.target.value });
      });

      // Private Preacher Stage Note
      var stageMsgInput = document.getElementById('stage-msg-input');
      document.getElementById('btn-send-stage-msg').addEventListener('click', function() {
        var txt = (stageMsgInput.value || '').trim();
        if (!txt) return;
        sendAction('stage-message', { text: txt });
        stageMsgInput.value = '';
        showToast('🤫 Flashed to Preacher Stage Monitor');
      });
      document.getElementById('btn-clear-stage-msg').addEventListener('click', function() {
        sendAction('clear-stage-message');
        showToast('Cleared Stage Note');
      });
      document.querySelectorAll('.stage-preset-chip').forEach(function(chip) {
        chip.addEventListener('click', function() {
          var msg = chip.getAttribute('data-msg');
          if (msg) {
            sendAction('stage-message', { text: msg });
            showToast('🤫 Sent: ' + msg);
          }
        });
      });

      // Audience TV Alert Banner
      var alertInput = document.getElementById('alert-input');
      document.getElementById('btn-send-alert').addEventListener('click', function() {
        var txt = (alertInput.value || '').trim();
        if (!txt) return;
        sendAction('alert', { text: txt });
        alertInput.value = '';
        showToast('📢 Alert Shown on Audience TV');
      });
      document.getElementById('btn-clear-alert').addEventListener('click', function() {
        sendAction('clear-alert');
        showToast('Alert Banner Cleared');
      });

      // =====================================================================
      // REAL-TIME SSE UI RENDERER
      // =====================================================================
      function formatTimer(sec) {
        var s = Math.max(0, Math.floor(sec || 0));
        var m = Math.floor(s / 60);
        var r = s % 60;
        return String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
      }

      
      // Render Cameras Pane
      function renderCamerasUI(state) {
        var statusEl = document.getElementById('remote-cam-status-text');
        var counterEl = document.getElementById('remote-cam-counter');
        var quickRow = document.getElementById('remote-cam-quick-row');
        var listContainer = document.getElementById('remote-cam-list-container');
        var cams = Array.isArray(state.availableCameras) ? state.availableCameras : [];

        if (counterEl) {
          counterEl.textContent = cams.length + (cams.length === 1 ? ' Cam' : ' Cams');
        }

        if (statusEl) {
          if (state.cameraActive) {
            var activeLbl = state.cameraDeviceLabel || 'Live Camera';
            var modeLbl = state.cameraMode === 'preacher' ? 'Preacher Mode' : 'Worship BG';
            statusEl.textContent = '🔴 ON AIR: ' + activeLbl + ' (' + modeLbl + ')';
            statusEl.style.color = state.cameraMode === 'preacher' ? '#f87171' : '#22d3ee';
          } else {
            statusEl.textContent = 'Camera: Standby (Off)';
            statusEl.style.color = '#94a3b8';
          }
        }

        // Quick row buttons
        if (quickRow) {
          quickRow.innerHTML = '';
          cams.forEach(function(cam) {
            var btn = document.createElement('button');
            btn.className = 'btn-quick';
            btn.style.flex = '1';
            btn.style.padding = '8px 10px';
            btn.style.fontSize = '0.78rem';
            btn.style.fontWeight = '700';

            var isLive = state.cameraActive && (cam.isLive || cam.id === state.cameraDeviceId);
            if (isLive) {
              btn.style.background = state.cameraMode === 'preacher' ? '#ef4444' : '#06b6d4';
              btn.style.color = '#ffffff';
              btn.style.borderColor = '#ffffff';
            }

            var icon = cam.type && cam.type.includes('Iriun') ? '📱 ' : '📹 ';
            btn.textContent = icon + 'Cam ' + (cam.camNumber || 1);
            btn.addEventListener('click', function() {
              var targetMode = state.cameraActive && state.cameraMode !== 'none' ? state.cameraMode : 'preacher';
              sendAction('switch-camera', { deviceId: cam.id, label: cam.name, mode: targetMode });
            });
            quickRow.appendChild(btn);
          });
        }

        // Detailed camera list
        if (listContainer) {
          listContainer.innerHTML = '';
          if (cams.length === 0) {
            listContainer.innerHTML = '<div style="text-align:center; padding:18px; color:#94a3b8; font-size:0.8rem;">No cameras detected on ZionCast.<br>Open Iriun Webcam or connect webcam to laptop.</div>';
            return;
          }

          cams.forEach(function(cam) {
            var card = document.createElement('div');
            card.style.background = 'rgba(30, 41, 59, 0.7)';
            card.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            card.style.borderRadius = '8px';
            card.style.padding = '10px 12px';
            card.style.display = 'flex';
            card.style.flexDirection = 'column';
            card.style.gap = '8px';

            var isLive = state.cameraActive && (cam.isLive || cam.id === state.cameraDeviceId);
            if (isLive) {
              card.style.borderColor = state.cameraMode === 'preacher' ? '#ef4444' : '#06b6d4';
            }

            var topRow = document.createElement('div');
            topRow.style.display = 'flex';
            topRow.style.alignItems = 'center';
            topRow.style.justifyContent = 'space-between';

            var titleDiv = document.createElement('div');
            titleDiv.style.fontWeight = '700';
            titleDiv.style.fontSize = '0.82rem';
            titleDiv.style.color = '#f8fafc';
            titleDiv.textContent = cam.name || cam.rawLabel || 'Camera';

            var badge = document.createElement('span');
            badge.style.fontSize = '0.68rem';
            badge.style.fontWeight = '800';
            badge.style.padding = '2px 6px';
            badge.style.borderRadius = '4px';

            if (isLive) {
              badge.style.background = state.cameraMode === 'preacher' ? '#ef4444' : '#06b6d4';
              badge.style.color = '#fff';
              badge.textContent = state.cameraMode === 'preacher' ? '🔴 ON AIR' : '🎵 WORSHIP BG';
            } else {
              badge.style.background = 'rgba(16, 185, 129, 0.15)';
              badge.style.color = '#34d399';
              badge.textContent = 'READY';
            }

            topRow.appendChild(titleDiv);
            topRow.appendChild(badge);
            card.appendChild(topRow);

            var btnsRow = document.createElement('div');
            btnsRow.style.display = 'flex';
            btnsRow.style.gap = '6px';

            var btnPreacher = document.createElement('button');
            btnPreacher.className = 'btn-quick';
            btnPreacher.style.flex = '1';
            btnPreacher.style.padding = '6px';
            btnPreacher.style.fontSize = '0.72rem';
            btnPreacher.style.fontWeight = '700';
            btnPreacher.textContent = '🔴 Preacher';
            btnPreacher.addEventListener('click', function() {
              sendAction('switch-camera', { deviceId: cam.id, label: cam.name, mode: 'preacher' });
            });

            var btnWorship = document.createElement('button');
            btnWorship.className = 'btn-quick';
            btnWorship.style.flex = '1';
            btnWorship.style.padding = '6px';
            btnWorship.style.fontSize = '0.72rem';
            btnWorship.style.fontWeight = '700';
            btnWorship.textContent = '🎵 Worship BG';
            btnWorship.addEventListener('click', function() {
              sendAction('switch-camera', { deviceId: cam.id, label: cam.name, mode: 'background' });
            });

            btnsRow.appendChild(btnPreacher);
            btnsRow.appendChild(btnWorship);
            card.appendChild(btnsRow);

            listContainer.appendChild(card);
          });
        }
      }

      function renderUI(state) {
        currentAppState = state || {};

        activeTitle.textContent = state.activeItemTitle || 'ZionCast Broadcast';
        var curIdx = (state.currentSlideIndex || 0) + 1;
        var tot = state.totalSlides || 1;
        slideCounter.textContent = curIdx + ' / ' + tot;

        curLabel.textContent = state.currentSlideLabel || ('Slide ' + curIdx);
        curBody.textContent = state.currentSlideBody || '(Media / Graphic Active on TV)';
        nextLabel.textContent = state.nextSlideLabel || 'End';
        nextBody.textContent = state.nextSlideBody || 'End of item';

        btnBlackout.classList.toggle('active-blackout', !!state.blackout);
        btnClear.classList.toggle('active-clear', !!state.clearText);
        btnTheme.classList.toggle('active-theme', !!state.themeOnly);
        btnClock.classList.toggle('active-clock', !!state.showClockOnTv);

        // Render Active Item Slide List
        slidesListEl.innerHTML = '';
        if (Array.isArray(state.slidesList)) {
          state.slidesList.forEach(function(s, idx) {
            var btn = document.createElement('button');
            btn.className = 'slide-item-btn' + (idx === state.currentSlideIndex ? ' active' : '');
            btn.innerHTML =
              '<div class="slide-item-top">' +
                '<span>' + escapeHtml(s.label || ('Slide ' + (idx + 1))) + '</span>' +
                '<span>' + (idx === state.currentSlideIndex ? '● ON AIR' : ('#' + (idx + 1))) + '</span>' +
              '</div>' +
              '<div class="slide-item-lyrics">' + escapeHtml(s.body || '(Graphic / Media Slide)') + '</div>';
            btn.addEventListener('click', function() {
              sendAction('goto', { index: idx });
            });
            slidesListEl.appendChild(btn);
          });
        }

        // Render Order of Service
        renderServiceOrder(state);

        // Refresh library catalog automatically whenever desktop library changes
        if (typeof state.libraryVersion === 'number' && state.libraryVersion !== loadedLibraryVersion) {
          fetchLibraryCatalog();
        }

renderCamerasUI(state);
        // Countdown Sync
        var cdDigits = document.getElementById('remote-cd-digits');
        var cdStatus = document.getElementById('remote-cd-status');
        var btnCdTv = document.getElementById('btn-cd-toggle-tv');
        var selCdPos = document.getElementById('remote-cd-pos');
        var selCdSize = document.getElementById('remote-cd-size');

        if (cdDigits) cdDigits.textContent = formatTimer(state.countdownRemaining);
        if (cdStatus) {
          cdStatus.textContent = state.countdownRunning ? 'RUNNING' : (state.countdownProjected ? 'ON TV' : 'READY');
        }
        if (btnCdTv) {
          if (state.countdownProjected) {
            btnCdTv.textContent = '🟢 Showing on TV (Tap to Hide)';
            btnCdTv.style.background = 'rgba(16, 185, 129, 0.22)';
            btnCdTv.style.borderColor = '#10b981';
            btnCdTv.style.color = '#34d399';
          } else {
            btnCdTv.textContent = '🔴 Hidden on TV (Tap to Show)';
            btnCdTv.style.background = '';
            btnCdTv.style.borderColor = '';
            btnCdTv.style.color = '';
          }
        }
        if (selCdPos && state.countdownPosition && document.activeElement !== selCdPos) {
          selCdPos.value = state.countdownPosition;
        }
        if (selCdSize && state.countdownSize && document.activeElement !== selCdSize) {
          selCdSize.value = state.countdownSize;
        }

        // Stage Note Status
        var stageStatus = document.getElementById('stage-msg-active-status');
        if (stageStatus) {
          if (state.stageMessageActive && state.stageMessage) {
            stageStatus.style.display = 'block';
            stageStatus.textContent = '● Active on Stage: "' + state.stageMessage + '"';
          } else {
            stageStatus.style.display = 'none';
          }
        }

        // Crew Google Meet Sync + Live Camera Cue
        var meetCard = document.getElementById('remote-meet-card');
        var meetCodeEl = document.getElementById('remote-meet-code');
        var meetJoinBtn = document.getElementById('btn-remote-join-meet');
        var meetCueBox = document.getElementById('remote-meet-cue-box');
        var directorBanner = document.getElementById('remote-director-cue-banner');
        var directorCueText = document.getElementById('remote-director-cue-text');
        if (meetCard) {
          if (state.meetUrl) {
            meetCard.style.display = 'flex';
            if (meetCodeEl) meetCodeEl.textContent = state.meetCode || 'ACTIVE';
            if (meetJoinBtn) meetJoinBtn.href = state.meetUrl;
          } else {
            meetCard.style.display = 'none';
          }
        }
        if (state.meetCueText) {
          if (meetCueBox) {
            meetCueBox.style.display = 'block';
            meetCueBox.textContent = state.meetCueText;
          }
          var isAcked = state.meetCueTime && window.__ackedCueTime === state.meetCueTime;
          if (directorBanner && directorCueText && !isAcked) {
            directorCueText.textContent = state.meetCueText;
            directorBanner.classList.add('visible');
          } else if (directorBanner && isAcked) {
            directorBanner.classList.remove('visible');
          }
          if (state.meetCueTime && window.__lastMeetCueTime !== state.meetCueTime) {
            window.__lastMeetCueTime = state.meetCueTime;
            try {
              if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
                navigator.vibrate([120, 60, 120]);
              }
            } catch (_) {}
            showToast(state.meetCueText);
          }
        } else {
          if (meetCueBox) meetCueBox.style.display = 'none';
          if (directorBanner) directorBanner.classList.remove('visible');
        }

        var btnAckCue = document.getElementById('btn-ack-director-cue');
        if (btnAckCue && !btnAckCue.__bound) {
          btnAckCue.__bound = true;
          btnAckCue.addEventListener('click', function() {
            window.__ackedCueTime = (currentAppState && currentAppState.meetCueTime) || window.__lastMeetCueTime || Date.now();
            if (directorBanner) directorBanner.classList.remove('visible');
            sendAction('cue-ack', { text: (currentAppState && currentAppState.meetCueText) || '' });
            showToast('✓ Acknowledged to ZionCast operator');
          });
        }
      }

      var activeEventSource = null;
      var sseReconnectTimer = null;
      var statusPollInterval = null;

      function pollStatus() {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timeoutId = controller ? setTimeout(function() { controller.abort(); }, 3000) : null;
        fetch('/api/status?_t=' + Date.now(), {
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        })
          .then(function(r) {
            if (timeoutId) clearTimeout(timeoutId);
            return r.json();
          })
          .then(function(res) {
            if (res && res.status) {
              connBadge.classList.remove('disconnected');
              connText.textContent = 'Connected';
              renderUI(res.status);
            }
          })
          .catch(function() {
            if (timeoutId) clearTimeout(timeoutId);
            connBadge.classList.add('disconnected');
            connText.textContent = 'Reconnecting...';
          });
      }

      function connectSSE() {
        if (sseReconnectTimer) {
          clearTimeout(sseReconnectTimer);
          sseReconnectTimer = null;
        }
        if (!statusPollInterval) {
          statusPollInterval = setInterval(pollStatus, 2500);
        }
        if (activeEventSource) {
          try { activeEventSource.close(); } catch (e) {}
          activeEventSource = null;
        }

        var es = new EventSource('/api/events');
        activeEventSource = es;
        es.onopen = function() {
          connBadge.classList.remove('disconnected');
          connText.textContent = 'Connected';
        };
        es.onmessage = function(e) {
          try {
            var payload = JSON.parse(e.data);
            if (payload.type === 'status') {
              connBadge.classList.remove('disconnected');
              connText.textContent = 'Connected';
              renderUI(payload.data);
            }
          } catch (err) {}
        };
        es.onerror = function() {
          connBadge.classList.add('disconnected');
          connText.textContent = 'Reconnecting...';
          try { es.close(); } catch (e) {}
          if (activeEventSource === es) activeEventSource = null;
          if (!sseReconnectTimer) {
            sseReconnectTimer = setTimeout(connectSSE, 1800);
          }
        };
      }

      // Immediately reconnect when phone screen wakes up or Wi-Fi reconnects
      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
          pollStatus();
          if (!activeEventSource || activeEventSource.readyState === 2) {
            connectSSE();
          }
        }
      });
      window.addEventListener('online', function() {
        pollStatus();
        connectSSE();
      });

      // Initial Boot
      connectSSE();
      fetchLibraryCatalog();
      initBibleBooks('kjv', false);
    })();
  </script>
</body>
</html>`;
  }

  getBibleData(version = 'kjv') {
    const safeVer = ['kjv', 'rsv', 'gnt'].includes(String(version).toLowerCase()) ? String(version).toLowerCase() : 'kjv';
    if (this.bibleCache[safeVer]) return this.bibleCache[safeVer];
    try {
      const p = path.join(__dirname, 'assets', 'bibles', `${safeVer}.json`);
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf-8');
        this.bibleCache[safeVer] = JSON.parse(raw);
        return this.bibleCache[safeVer];
      }
    } catch (e) {
      console.warn('[Remote Server] Error loading bible:', e.message);
    }
    return null;
  }

  lookupBible(query, version = 'kjv') {
    if (!query || typeof query !== 'string') return { success: false, error: 'Query required' };
    const bData = this.getBibleData(version);
    if (!bData || !bData.books) return { success: false, error: 'Bible version not loaded' };

    let queryClean = query.trim();
    const verMatch = queryClean.match(/\b(kjv|rsv|gnt)\b/i);
    let targetVer = version;
    if (verMatch) {
      targetVer = verMatch[1].toLowerCase();
      queryClean = queryClean.replace(/\b(kjv|rsv|gnt)\b/gi, '').trim();
    }

    const bible = (targetVer !== version) ? (this.getBibleData(targetVer) || bData) : bData;
    const versionAbbr = bible.abbreviation || targetVer.toUpperCase();

    // Parse e.g. "John 3:16", "Psalm 23:1-6", "1 Cor 13:4-8", "Song of Solomon 2:1", "Psalm 23"
    const match = queryClean.match(/^([1-3]?\s*[a-zA-Z]+(?:\s+of\s+[a-zA-Z]+)?)\s*(\d+)?(?:\s*:\s*(\d+)(?:\s*-\s*(\d+))?)?/i);
    if (!match) return { success: false, error: 'Could not parse reference (try e.g. John 3:16 or Psalm 23:1-6)' };

    const rawBook = match[1].trim().toLowerCase().replace(/\s+/g, ' ');
    const allBooks = Object.keys(bible.books);

    let foundBook = allBooks.find(b => b.toLowerCase() === rawBook);
    if (!foundBook) {
      foundBook = allBooks.find(b => b.toLowerCase().startsWith(rawBook));
    }
    if (!foundBook) {
      const abbrMap = {
        'gen': 'Genesis', 'exo': 'Exodus', 'lev': 'Leviticus', 'num': 'Numbers', 'deu': 'Deuteronomy', 'deut': 'Deuteronomy',
        'jos': 'Joshua', 'josh': 'Joshua', 'jdg': 'Judges', 'judg': 'Judges', 'rut': 'Ruth',
        '1sa': '1 Samuel', '1sam': '1 Samuel', '2sa': '2 Samuel', '2sam': '2 Samuel',
        '1ki': '1 Kings', '1kgs': '1 Kings', '2ki': '2 Kings', '2kgs': '2 Kings',
        '1ch': '1 Chronicles', '1chr': '1 Chronicles', '2ch': '2 Chronicles', '2chr': '2 Chronicles',
        'ezr': 'Ezra', 'neh': 'Nehemiah', 'est': 'Esther', 'esth': 'Esther',
        'psa': 'Psalms', 'ps': 'Psalms', 'psalms': 'Psalms', 'psalm': 'Psalms',
        'pro': 'Proverbs', 'prov': 'Proverbs', 'ecc': 'Ecclesiastes', 'eccl': 'Ecclesiastes',
        'sos': 'Song of Solomon', 'song': 'Song of Solomon',
        'isa': 'Isaiah', 'jer': 'Jeremiah', 'lam': 'Lamentations',
        'ezk': 'Ezekiel', 'ezek': 'Ezekiel', 'dan': 'Daniel', 'hos': 'Hosea', 'joe': 'Joel', 'amo': 'Amos',
        'oba': 'Obadiah', 'jon': 'Jonah', 'mic': 'Micah', 'nah': 'Nahum', 'hab': 'Habakkuk',
        'zep': 'Zephaniah', 'hag': 'Haggai', 'zec': 'Zechariah', 'mal': 'Malachi',
        'mat': 'Matthew', 'matt': 'Matthew', 'mt': 'Matthew', 'mrk': 'Mark', 'mk': 'Mark',
        'luk': 'Luke', 'lk': 'Luke', 'joh': 'John', 'jn': 'John', 'act': 'Acts',
        'rom': 'Romans', '1co': '1 Corinthians', '1cor': '1 Corinthians', '2co': '2 Corinthians', '2cor': '2 Corinthians',
        'gal': 'Galatians', 'eph': 'Ephesians', 'php': 'Philippians', 'phil': 'Philippians', 'col': 'Colossians',
        '1th': '1 Thessalonians', '1thess': '1 Thessalonians', '2th': '2 Thessalonians', '2thess': '2 Thessalonians',
        '1ti': '1 Timothy', '1tim': '1 Timothy', '2ti': '2 Timothy', '2tim': '2 Timothy',
        'tit': 'Titus', 'phm': 'Philemon', 'heb': 'Hebrews', 'jas': 'James', 'jam': 'James',
        '1pe': '1 Peter', '1pet': '1 Peter', '2pe': '2 Peter', '2pet': '2 Peter',
        '1jo': '1 John', '1jn': '1 John', '2jo': '2 John', '2jn': '2 John', '3jo': '3 John', '3jn': '3 John',
        'jde': 'Jude', 'rev': 'Revelation'
      };
      const mapped = abbrMap[rawBook.replace(/\s+/g, '')];
      if (mapped && bible.books[mapped]) foundBook = mapped;
    }

    if (!foundBook) return { success: false, error: 'Book "' + match[1].trim() + '" not found' };

    const bookObj = bible.books[foundBook];
    const chNum = match[2] || '1';
    const chObj = bookObj[chNum];
    if (!chObj) return { success: false, error: 'Chapter ' + chNum + ' not found in ' + foundBook };

    const startV = match[3] ? parseInt(match[3], 10) : null;
    const endV = match[4] ? parseInt(match[4], 10) : startV;

    let selectedKeys = [];
    if (startV === null) {
      // Whole chapter requested (e.g. "Psalm 23")
      selectedKeys = Object.keys(chObj).sort((a, b) => Number(a) - Number(b));
    } else {
      const lo = Math.min(startV, endV || startV);
      const hi = Math.max(startV, endV || startV);
      for (let v = lo; v <= hi; v++) {
        if (chObj[String(v)]) selectedKeys.push(String(v));
      }
      if (selectedKeys.length === 0 && chObj['1']) {
        selectedKeys = ['1'];
      }
    }

    const verses = selectedKeys.map(vNum => ({
      verse: vNum,
      text: chObj[vNum]
    }));

    const verseLabel = verses.length > 1
      ? (verses[0].verse + '-' + verses[verses.length - 1].verse)
      : (verses[0] ? verses[0].verse : '1');

    const slides = verses.map(v => {
      const lbl = foundBook + ' ' + chNum + ':' + v.verse + ' (' + versionAbbr + ')';
      return {
        label: lbl,
        body: '"' + v.text + '"\n\n— ' + lbl
      };
    });

    return {
      success: true,
      book: foundBook,
      chapter: chNum,
      verse: verseLabel,
      version: targetVer,
      versionAbbr,
      reference: foundBook + ' ' + chNum + ':' + verseLabel + ' (' + versionAbbr + ')',
      text: verses.map(v => (verses.length > 1 ? ('[' + v.verse + '] ' + v.text) : v.text)).join(' '),
      verses,
      slides
    };
  }

  getEmbedHtml(vid, autoplay = '1', mute = '0', quality = 'hd720', loop = '0') {
    const safe = String(vid).replace(/[^A-Za-z0-9_-]/g, '');
    const autoPlayParam = autoplay === '0' ? 0 : 1;
    const muteParam = mute === '1' ? 1 : 0;
    const loopParam = loop === '1' ? `&loop=1&playlist=${safe}` : '';
    const vqParam = quality || 'hd720';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>YouTube Live Stream</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; overflow: hidden; }
    html, body, iframe { width: 100%; height: 100%; border: 0; background: #000; }
  </style>
</head>
<body>
  <iframe
    id="yt-embed-player"
    src="https://www.youtube-nocookie.com/embed/${safe}?autoplay=${autoPlayParam}&mute=${muteParam}${loopParam}&controls=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1&vq=${vqParam}"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
    referrerpolicy="strict-origin-when-cross-origin"
    allowfullscreen></iframe>
  <script>
    const iframe = document.getElementById('yt-embed-player');
    let desiredVol = null;
    let userPaused = false;
    let lastCurrentTime = 0;
    let lastDuration = 0;
    const sendCmd = (func, args) => {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'command', func, args: args || [] }), '*');
      } catch (_) {}
    };
    const subscribeListening = () => {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*');
      } catch (_) {}
    };
    iframe.addEventListener('load', () => {
      subscribeListening();
      setTimeout(subscribeListening, 700);
      if (desiredVol !== null) {
        setTimeout(() => sendCmd('setVolume', [desiredVol]), 600);
        setTimeout(() => sendCmd('setVolume', [desiredVol]), 1400);
      }
    });
    window.addEventListener('message', (event) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;
        if (data.type === 'yt-volume' && typeof data.volume === 'number') {
          desiredVol = Math.max(0, Math.min(100, Math.round(data.volume)));
          sendCmd('setVolume', [desiredVol]);
          return;
        }
        if (data.type === 'yt-pause') {
          userPaused = true;
          sendCmd('pauseVideo', []);
          return;
        }
        if (data.type === 'yt-play') {
          userPaused = false;
          sendCmd('playVideo', []);
          return;
        }
        if (data.type === 'yt-seek' && typeof data.seconds === 'number') {
          const target = Math.max(0, data.seconds);
          lastCurrentTime = target;
          sendCmd('seekTo', [target, true]);
          return;
        }
        if (data.type === 'yt-seek-delta' && typeof data.delta === 'number') {
          const maxT = lastDuration > 0 ? Math.max(0, lastDuration - 1) : 999999;
          const target = Math.max(0, Math.min(maxT, lastCurrentTime + data.delta));
          lastCurrentTime = target;
          sendCmd('seekTo', [target, true]);
          return;
        }
        if (data.type === 'yt-stop') {
          userPaused = true;
          sendCmd('stopVideo', []);
          return;
        }
        if (data.event === 'infoDelivery' && data.info) {
          if (typeof data.info.currentTime === 'number') lastCurrentTime = data.info.currentTime;
          if (typeof data.info.duration === 'number' && data.info.duration > 0) lastDuration = data.info.duration;
          if (window.parent && window.parent !== window) {
            window.parent.postMessage({
              type: 'yt-progress',
              currentTime: lastCurrentTime,
              duration: lastDuration,
              playerState: data.info.playerState
            }, '*');
          }
        }
        if (data.event === 'onReady' && desiredVol !== null) {
          sendCmd('setVolume', [desiredVol]);
        }
        if (data.event === 'onStateChange' && data.info === 2 && ${autoPlayParam} && !userPaused) {
          setTimeout(() => { if (!userPaused) sendCmd('playVideo', []); }, 2000);
        }
      } catch (_) {}
    });
  </script>
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

  getOfflineCamHtml() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>ZionCast Wi-Fi Phone Camera</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    html, body { width: 100%; height: 100%; background: #070b12; color: #f8fafc; overflow: hidden; }
    .cam-root { display: flex; flex-direction: column; height: 100%; position: relative; }
    .cam-top-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 14px; background: rgba(13, 19, 32, 0.92);
      border-bottom: 1px solid rgba(255,255,255,0.1); z-index: 20;
    }
    .slot-pill {
      font-size: 0.78rem; font-weight: 800; padding: 4px 10px; border-radius: 999px;
      background: rgba(56, 189, 248, 0.16); border: 1px solid rgba(56, 189, 248, 0.45); color: #38bdf8;
    }
    .tally-pill {
      font-size: 0.78rem; font-weight: 900; padding: 4px 12px; border-radius: 999px;
      background: rgba(148, 163, 184, 0.16); border: 1px solid rgba(148, 163, 184, 0.3); color: #cbd5e1;
    }
    .tally-pill.on-air {
      background: #dc2626; border-color: #f87171; color: #ffffff;
      box-shadow: 0 0 18px rgba(239, 68, 68, 0.75);
      animation: pulse-tally 1.1s infinite;
    }
    @keyframes pulse-tally { 0%,100% { opacity: 1; } 50% { opacity: 0.75; } }
    .cam-stage {
      flex: 1; position: relative; background: #000; display: flex; align-items: center; justify-content: center; overflow: hidden;
    }
    .cam-stage.on-air-frame { box-shadow: inset 0 0 0 6px #ef4444; }
    video#local-cam-video { width: 100%; height: 100%; object-fit: cover; transition: transform 0.12s ease-out; transform-origin: center center; }
    .zoom-bar {
      position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 6px; padding: 6px 10px;
      border-radius: 999px; background: rgba(7, 11, 18, 0.78);
      border: 1px solid rgba(255,255,255,0.16); backdrop-filter: blur(8px);
      z-index: 22; max-width: calc(100% - 20px);
    }
    .zoom-pill {
      padding: 4px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.16);
      background: rgba(30, 41, 59, 0.85); color: #e2e8f0; font-size: 0.72rem; font-weight: 800; cursor: pointer;
    }
    .zoom-pill.active {
      background: #0284c7; border-color: #38bdf8; color: #fff;
    }
    .zoom-slider { width: 96px; accent-color: #38bdf8; }
    .zoom-val { font-size: 0.72rem; font-weight: 800; color: #38bdf8; min-width: 32px; text-align: center; }
    .top-badges { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .audio-pill {
      font-size: 0.72rem; font-weight: 800; padding: 4px 10px; border-radius: 999px; cursor: pointer;
      background: #161d2b; border: 1px solid rgba(255,255,255,0.16); color: #cbd5e1;
    }
    .audio-pill.live {
      background: rgba(56, 189, 248, 0.22); border-color: #38bdf8; color: #e0f2fe;
    }
    .audio-pill.muted {
      background: rgba(239, 68, 68, 0.16); border-color: rgba(239, 68, 68, 0.4); color: #fca5a5;
    }
    .cue-overlay {
      position: absolute; top: 12px; left: 12px; right: 12px; display: none;
      align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 12px; border-radius: 10px;
      background: rgba(15, 23, 42, 0.94); border: 2px solid #ef4444;
      color: #f8fafc; font-weight: 800; font-size: 0.88rem;
      box-shadow: 0 10px 28px rgba(0,0,0,0.72); z-index: 30;
    }
    .cue-ack-btn {
      padding: 6px 12px; border-radius: 7px; border: 1px solid rgba(255,255,255,0.2);
      background: #1e293b; color: #f8fafc; font-size: 0.75rem; font-weight: 800;
      cursor: pointer; white-space: nowrap; flex-shrink: 0;
    }
    .talkback-banner {
      position: absolute; bottom: 14px; left: 12px; right: 12px; display: none;
      padding: 12px 14px; border-radius: 10px;
      background: rgba(14, 165, 233, 0.96); border: 2px solid #7dd3fc;
      color: #ffffff; font-weight: 900; font-size: 0.88rem; text-align: center;
      box-shadow: 0 10px 28px rgba(0,0,0,0.72); z-index: 32; cursor: pointer;
    }
    .setup-box {
      position: absolute; inset: 16px; margin: auto; max-width: 380px; height: fit-content;
      background: rgba(15, 23, 42, 0.95); border: 1px solid rgba(255,255,255,0.14);
      border-radius: 14px; padding: 18px; text-align: center; z-index: 25;
      display: flex; flex-direction: column; gap: 10px;
    }
    .cam-controls {
      display: flex; align-items: center; gap: 8px; padding: 12px 14px;
      background: rgba(13, 19, 32, 0.95); border-top: 1px solid rgba(255,255,255,0.1); z-index: 20;
    }
    .c-btn {
      padding: 10px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
      background: #1e293b; color: #f8fafc; font-weight: 700; font-size: 0.8rem; cursor: pointer;
    }
    .c-btn.mic-live {
      background: #dc2626; border-color: #f87171; color: #ffffff;
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.55);
    }
    .c-btn.primary { flex: 1; background: #10b981; color: #052e16; border-color: #34d399; font-weight: 900; }
    .c-btn.stop { flex: 1; background: #ef4444; color: #fff; border-color: #f87171; }
    .c-select {
      padding: 10px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.15);
      background: #0f172a; color: #f8fafc; font-size: 0.78rem; font-weight: 700;
    }
  </style>
</head>
<body>
  <div class="cam-root">
    <div class="cam-top-bar">
      <div class="top-badges">
        <span id="cam-slot-badge" class="slot-pill">WI-FI CAM 1</span>
        <span id="cam-res-badge" style="font-size: 0.66rem; color: #94a3b8; font-weight: 700;"></span>
        <span id="cam-orient-hint" style="display: none; font-size: 0.65rem; color: #fbbf24; font-weight: 800;">📱 Rotate sideways for 16:9 HD</span>
        <button id="btn-cam-talkback-mute" type="button" class="audio-pill">🔊 Earpiece</button>
      </div>
      <span id="cam-tally-badge" class="tally-pill">STANDBY</span>
    </div>

    <div id="cam-stage" class="cam-stage">
      <video id="local-cam-video" autoplay playsinline muted></video>
      <audio id="cam-talkback-audio" autoplay playsinline></audio>
      <audio id="cam-audio-unlock" playsinline style="display:none;"></audio>
      <div id="cam-cue-overlay" class="cue-overlay">
        <span id="cam-cue-text" style="flex: 1; text-align: left;"></span>
        <button id="btn-cam-cue-ack" type="button" class="cue-ack-btn">✓ Got It</button>
      </div>
      <button id="cam-talkback-banner" type="button" class="talkback-banner">🔊 TAP HERE TO HEAR DIRECTOR IN EARPIECE</button>
      <div id="cam-zoom-bar" class="zoom-bar" style="display: none;">
        <button type="button" class="zoom-pill active" data-zoom="1">1×</button>
        <button type="button" class="zoom-pill" data-zoom="1.5">1.5×</button>
        <button type="button" class="zoom-pill" data-zoom="2">2×</button>
        <button type="button" class="zoom-pill" data-zoom="3">3×</button>
        <input id="cam-zoom-slider" class="zoom-slider" type="range" min="1" max="5" step="0.1" value="1">
        <span id="cam-zoom-val" class="zoom-val">1.0×</span>
      </div>
      <div id="cam-setup-box" class="setup-box">
        <div style="font-size: 1.8rem;">📹</div>
        <div style="font-size: 1rem; font-weight: 800;">ZionCast Offline Wi-Fi Camera</div>
        <p id="cam-setup-msg" style="font-size: 0.78rem; color: #94a3b8; line-height: 1.45;">
          Tap below to turn your phone into a live ZionCast camera over church Wi-Fi (keeps live Director Cues &amp; Earpiece Intercom on screen).
        </p>
        <button id="btn-start-cam-big" class="c-btn primary" style="padding: 12px;">▶ Start Camera Feed</button>
      </div>
    </div>

    <div class="cam-controls">
      <button id="btn-flip-lens" class="c-btn">🔄 Rear</button>
      <select id="sel-cam-device" class="c-select" style="max-width: 118px; display: none;" title="Choose exact phone camera lens">
        <option value="">Auto Lens</option>
      </select>
      <select id="sel-cam-res" class="c-select">
        <option value="2160">4K</option>
        <option value="1080" selected>1080p</option>
        <option value="720">720p</option>
        <option value="480">480p</option>
      </select>
      <button id="btn-crew-mic" class="c-btn" type="button" title="Talk to ZionCast desk operator (private — never goes to TV)">🎙️ Mic</button>
      <button id="btn-toggle-stream" class="c-btn primary">▶ Go Live</button>
    </div>
  </div>

  <script>
    (function() {
      var params = new URLSearchParams(window.location.search);
      var slot = String(params.get('slot') || '1');
      var pubId = 'pub-' + Math.random().toString(36).slice(2, 9);
      var facingMode = params.get('lens') === 'user' ? 'user' : 'environment';
      var activeCamCount = 1;
      var isOnAir = false;
      var localStream = null;
      var crewMicStream = null;
      var crewMicPc = null;
      var crewMicActive = false;
      var crewMicRetryTimer = null;
      var pendingCrewIceByViewer = {};
      var peers = {};
      var pendingIce = {};
      var talkbackPc = null;
      var pendingTalkIceByViewer = {};
      var talkbackMuted = false;
      var sse = null;
      var sseOpenCallbacks = [];
      var isStreaming = false;
      var userStopped = true;
      var resumeTimer = null;
      var screenWakeLock = null;
      var camStartSeq = 0;
      var crewMicBusy = false;
      var currentZoom = 1.0;
      var lastZoomSentAt = 0;
      var zoomSendTimer = null;
      var zoomBarEl = document.getElementById('cam-zoom-bar');
      var zoomSliderEl = document.getElementById('cam-zoom-slider');
      var zoomValEl = document.getElementById('cam-zoom-val');
      var zoomPills = document.querySelectorAll('.zoom-pill[data-zoom]');
      var ackedCueTime = 0;
      var activeCueText = '';
      var activeCueTime = 0;

      var slotBadge = document.getElementById('cam-slot-badge');
      var resBadge = document.getElementById('cam-res-badge');
      var tallyBadge = document.getElementById('cam-tally-badge');
      var btnTalkbackAudio = document.getElementById('btn-cam-talkback-mute');
      var talkbackAudioEl = document.getElementById('cam-talkback-audio');
      var audioUnlockEl = document.getElementById('cam-audio-unlock');
      var talkbackBannerEl = document.getElementById('cam-talkback-banner');
      var camStage = document.getElementById('cam-stage');
      var videoEl = document.getElementById('local-cam-video');
      var cueOverlay = document.getElementById('cam-cue-overlay');
      var cueTextEl = document.getElementById('cam-cue-text');
      var btnCueAck = document.getElementById('btn-cam-cue-ack');
      var setupBox = document.getElementById('cam-setup-box');
      var setupMsg = document.getElementById('cam-setup-msg');
      var btnStartBig = document.getElementById('btn-start-cam-big');
      var btnCrewMic = document.getElementById('btn-crew-mic');
      var btnToggle = document.getElementById('btn-toggle-stream');
      var btnFlip = document.getElementById('btn-flip-lens');
      var selDevice = document.getElementById('sel-cam-device');
      var selRes = document.getElementById('sel-cam-res');
      var selectedDeviceId = '';
      var autoPickedMainBack = false;
      var talkbackIsActiveOnServer = false;
      var audioGestureConfirmed = false;

      slotBadge.textContent = 'WI-FI CAM ' + slot;

      function boostVideoSdp(sdpStr, kbps) {
        try {
          if (!sdpStr) return sdpStr;
          var lines = sdpStr.split(/\\r?\\n/);
          var videoPts = [];
          var h264Pts = [];
          for (var i = 0; i < lines.length; i++) {
            var mh = lines[i].match(/^a=rtpmap:(\\d+)\\s+H264\\//i);
            if (mh) { h264Pts.push(mh[1]); videoPts.push(mh[1]); }
            var mv = lines[i].match(/^a=rtpmap:(\\d+)\\s+(VP8|VP9)\\//i);
            if (mv) videoPts.push(mv[1]);
          }
          var out = [];
          var inVideo = false;
          var hasBandwidth = false;
          var hasTias = false;
          for (var j = 0; j < lines.length; j++) {
            var line = lines[j];
            if (line.indexOf('m=video ') === 0) {
              inVideo = true;
              hasBandwidth = false;
              hasTias = false;
              if (h264Pts.length > 0) {
                var parts = line.split(' ');
                var head = parts.slice(0, 3);
                var pts = parts.slice(3);
                var reordered = [];
                h264Pts.forEach(function(pt) { if (pts.indexOf(pt) !== -1) reordered.push(pt); });
                pts.forEach(function(pt) { if (reordered.indexOf(pt) === -1) reordered.push(pt); });
                line = head.concat(reordered).join(' ');
              }
              out.push(line);
              continue;
            }
            if (line.indexOf('m=') === 0) inVideo = false;
            if (inVideo && line.indexOf('b=AS:') === 0) {
              out.push('b=AS:' + kbps);
              hasBandwidth = true;
              continue;
            }
            if (inVideo && line.indexOf('b=TIAS:') === 0) {
              out.push('b=TIAS:' + (kbps * 1000));
              hasTias = true;
              continue;
            }
            if (inVideo && line.indexOf('a=fmtp:') === 0 && videoPts.length > 0) {
              var fMatch = line.match(/^a=fmtp:(\\d+)\\s+(.*)$/);
              if (fMatch && videoPts.indexOf(fMatch[1]) !== -1 && line.indexOf('x-google-max-bitrate') === -1) {
                line = line + ';x-google-min-bitrate=1000;x-google-start-bitrate=3000;x-google-max-bitrate=' + kbps;
              }
            }
            out.push(line);
            if (inVideo && line.indexOf('c=IN ') === 0) {
              if (!hasBandwidth) { out.push('b=AS:' + kbps); hasBandwidth = true; }
              if (!hasTias) { out.push('b=TIAS:' + (kbps * 1000)); hasTias = true; }
            }
          }
          return out.join('\\r\\n');
        } catch (_) {
          return sdpStr;
        }
      }

      function refreshTalkbackPrompt() {
        if (!talkbackBannerEl) return;
        var hasAudio = !!(talkbackAudioEl && talkbackAudioEl.srcObject);
        var needsTap = talkbackIsActiveOnServer && !talkbackMuted && (!audioGestureConfirmed || !hasAudio || (talkbackAudioEl && talkbackAudioEl.paused));
        talkbackBannerEl.style.display = needsTap ? 'block' : 'none';
        if (needsTap) {
          talkbackBannerEl.textContent = hasAudio
            ? '🔊 TAP HERE TO HEAR DIRECTOR IN EARPIECE'
            : '🎙️ DIRECTOR TALKING — TAP HERE TO CONNECT EARPIECE';
        }
      }

      function unlockTalkbackAudio() {
        audioGestureConfirmed = true;
        try {
          if (audioUnlockEl) {
            // Play tiny valid silent WAV on a separate unlock element so WebRTC srcObject stays untouched on iOS Safari
            audioUnlockEl.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
            audioUnlockEl.play().catch(function() {});
          }
          if (talkbackAudioEl) {
            talkbackAudioEl.muted = talkbackMuted;
            talkbackAudioEl.volume = 1.0;
            if (talkbackAudioEl.srcObject) {
              talkbackAudioEl.play().then(function() {
                updateAudioPillUI(talkbackIsActiveOnServer);
                refreshTalkbackPrompt();
              }).catch(function() {});
            }
          }
        } catch (_) {}
        refreshTalkbackPrompt();
      }

      async function populateCameraLenses() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
        try {
          var devs = await navigator.mediaDevices.enumerateDevices();
          var cams = devs.filter(function(d) { return d.kind === 'videoinput'; });
          var activeTrack = localStream && localStream.getVideoTracks()[0];
          var activeId = activeTrack && activeTrack.getSettings ? (activeTrack.getSettings().deviceId || '') : '';
          var activeLabel = (activeTrack && activeTrack.label) || '';
          if (resBadge && activeTrack && activeTrack.getSettings) {
            var st = activeTrack.getSettings();
            if (st.width && st.height) {
              resBadge.textContent = st.width + '×' + st.height;
            }
          }
          if (facingMode === 'environment' && !selectedDeviceId && !autoPickedMainBack && /ultra\\s*wide|0\\.5|dual\\s*wide|triple|telephoto|macro/i.test(activeLabel)) {
            var mainRear = cams.find(function(c) {
              var lbl = c.label || '';
              return (/\\bback\\b|rear/i.test(lbl)) && !/ultra|wide\\s*angle|0\\.5|dual|triple|telephoto|macro|front/i.test(lbl);
            });
            if (mainRear && mainRear.deviceId && mainRear.deviceId !== activeId) {
              autoPickedMainBack = true;
              selectedDeviceId = mainRear.deviceId;
              setTimeout(function() { if (!userStopped) startCamera(true); }, 60);
              return;
            }
          }
          if (!selDevice) return;
          if (cams.length <= 1) {
            selDevice.style.display = 'none';
            return;
          }
          selDevice.innerHTML = '<option value="">Auto Lens</option>';
          cams.forEach(function(c, idx) {
            var opt = document.createElement('option');
            opt.value = c.deviceId;
            opt.textContent = c.label || ('Lens ' + (idx + 1));
            if (selectedDeviceId ? (c.deviceId === selectedDeviceId) : (activeId && c.deviceId === activeId)) {
              opt.selected = true;
            }
            selDevice.appendChild(opt);
          });
          selDevice.style.display = 'inline-block';
        } catch (_) {}
      }

      function updateAudioPillUI(talkbackActive) {
        if (!btnTalkbackAudio) return;
        if (talkbackMuted) {
          btnTalkbackAudio.textContent = '🔇 Earpiece Muted';
          btnTalkbackAudio.className = 'audio-pill muted';
        } else if (talkbackActive) {
          btnTalkbackAudio.textContent = '🎙️ Director Live';
          btnTalkbackAudio.className = 'audio-pill live';
        } else {
          btnTalkbackAudio.textContent = '🔊 Earpiece';
          btnTalkbackAudio.className = 'audio-pill';
        }
      }

      if (btnTalkbackAudio) {
        btnTalkbackAudio.addEventListener('click', function() {
          talkbackMuted = !talkbackMuted;
          if (talkbackAudioEl) {
            talkbackAudioEl.muted = talkbackMuted;
            if (!talkbackMuted && talkbackAudioEl.srcObject) talkbackAudioEl.play().catch(function() {});
          }
          unlockTalkbackAudio();
          updateAudioPillUI(talkbackIsActiveOnServer);
          refreshTalkbackPrompt();
          if (!talkbackMuted && talkbackIsActiveOnServer && !talkbackPc) {
            sendSignal({ type: 'talkback-request', targetRole: 'viewer', slot: slot });
          }
        });
      }

      if (talkbackBannerEl) {
        talkbackBannerEl.addEventListener('click', function() {
          talkbackMuted = false;
          unlockTalkbackAudio();
          if (talkbackAudioEl && talkbackAudioEl.srcObject) {
            talkbackAudioEl.muted = false;
            talkbackAudioEl.play().then(function() {
              updateAudioPillUI(true);
              refreshTalkbackPrompt();
            }).catch(function() {});
          }
          if (talkbackIsActiveOnServer && !talkbackPc) {
            sendSignal({ type: 'talkback-request', targetRole: 'viewer', slot: slot });
          }
        });
      }

      if (btnCueAck) {
        btnCueAck.addEventListener('click', function() {
          ackedCueTime = activeCueTime || Date.now();
          cueOverlay.style.display = 'none';
          fetch('/api/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cue-ack', data: { text: activeCueText, slot: slot } })
          }).catch(function() {});
        });
      }

      function sendSignal(payload) {
        return fetch('/api/cam-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function() {});
      }

      function updateTallyUI(status) {
        if (!status) return;
        var isLive = String(status.wcamLiveSlot || '') === slot;
        var nextCamCount = Math.max(1, parseInt(status.activeCamCount, 10) || activeCamCount || 1);
        var tierChanged = (isLive !== isOnAir) || (nextCamCount !== activeCamCount);
        isOnAir = isLive;
        activeCamCount = nextCamCount;
        if (tierChanged) {
          Object.keys(peers).forEach(function(k) { applySenderHdParams(peers[k]); });
        }
        tallyBadge.textContent = isLive ? '🔴 ON AIR (TV)' : (isStreaming ? '🟢 READY ON ZIONCAST' : 'STANDBY');
        tallyBadge.className = 'tally-pill' + (isLive ? ' on-air' : '');
        if (isLive) {
          camStage.classList.add('on-air-frame');
        } else {
          camStage.classList.remove('on-air-frame');
        }
        talkbackIsActiveOnServer = !!status.talkbackActive;
        updateAudioPillUI(talkbackIsActiveOnServer);
        refreshTalkbackPrompt();
        activeCueText = status.meetCueText || '';
        activeCueTime = status.meetCueTime || 0;
        if (activeCueText && activeCueTime !== ackedCueTime) {
          cueOverlay.style.display = 'flex';
          if (cueTextEl) cueTextEl.textContent = 'DIRECTOR CUE: ' + activeCueText;
        } else {
          cueOverlay.style.display = 'none';
        }
      }

      async function handleTalkbackOffer(msg) {
        var senderId = msg.viewerId || 'default';
        if (talkbackPc) {
          try { talkbackPc.close(); } catch (_) {}
          talkbackPc = null;
        }
        if (!pendingTalkIceByViewer[senderId]) pendingTalkIceByViewer[senderId] = [];
        var pc = new RTCPeerConnection({ iceServers: [] });
        talkbackPc = pc;
        pc.ontrack = function(ev) {
          var stream = (ev.streams && ev.streams[0]) ? ev.streams[0] : new MediaStream([ev.track]);
          if (talkbackAudioEl) {
            talkbackAudioEl.srcObject = stream;
            talkbackAudioEl.muted = talkbackMuted;
            talkbackAudioEl.volume = 1.0;
            talkbackAudioEl.play().then(function() {
              updateAudioPillUI(true);
              refreshTalkbackPrompt();
            }).catch(function() {
              if (btnTalkbackAudio) {
                btnTalkbackAudio.textContent = '🔊 Tap to Hear Director';
                btnTalkbackAudio.className = 'audio-pill live';
              }
              if (talkbackBannerEl && !talkbackMuted) {
                talkbackBannerEl.textContent = '🔊 TAP HERE TO HEAR DIRECTOR IN EARPIECE';
                talkbackBannerEl.style.display = 'block';
              }
            });
          }
        };
        pc.oniceconnectionstatechange = function() {
          if (talkbackPc !== pc) return;
          var st = pc.iceConnectionState;
          if ((st === 'connected' || st === 'completed') && talkbackAudioEl && !talkbackMuted && talkbackAudioEl.srcObject) {
            talkbackAudioEl.play().then(function() {
              updateAudioPillUI(true);
              refreshTalkbackPrompt();
            }).catch(function() {
              refreshTalkbackPrompt();
            });
          } else if (st === 'failed') {
            if (talkbackBannerEl && !talkbackMuted) {
              talkbackBannerEl.textContent = '🔄 AUDIO RECONNECTING — TAP TO RETRY';
              talkbackBannerEl.style.display = 'block';
            }
            sendSignal({ type: 'talkback-request', targetRole: 'viewer', slot: slot });
          }
        };
        pc.onicecandidate = function(ev) {
          if (ev.candidate) {
            sendSignal({
              type: 'talkback-ice',
              targetRole: 'viewer',
              viewerId: senderId,
              slot: slot,
              candidate: ev.candidate
            });
          }
        };
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        var q = pendingTalkIceByViewer[senderId] || [];
        if (q.length) {
          pendingTalkIceByViewer[senderId] = [];
          for (var i = 0; i < q.length; i++) {
            await pc.addIceCandidate(new RTCIceCandidate(q[i])).catch(function() {});
          }
        }
        var ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        await sendSignal({
          type: 'talkback-answer',
          targetRole: 'viewer',
          viewerId: senderId,
          slot: slot,
          sdp: pc.localDescription
        });
      }

      function getTargetVideoParams() {
        var hVal = parseInt(selRes.value, 10) || 1080;
        var baseBps = hVal >= 2160 ? 10000000 : (hVal >= 1080 ? 6000000 : (hVal >= 720 ? 3500000 : 1800000));
        var fps = 30;
        var degPref = 'balanced';
        // Smooth, zero-bufferbloat Wi-Fi broadcast bitrates: crisp 6 Mbps H.264 High 1080p30 with zero Wi-Fi freezes
        if (activeCamCount >= 3) {
          baseBps = isOnAir ? Math.min(baseBps, 4500000) : Math.min(baseBps, 1500000);
          fps = isOnAir ? 30 : 20;
        } else if (activeCamCount === 2) {
          baseBps = isOnAir ? Math.min(baseBps, 5000000) : Math.min(baseBps, 2000000);
          fps = isOnAir ? 30 : 24;
        }
        return { maxBps: baseBps, maxFps: fps, kbps: Math.round(baseBps / 1000), degPref: degPref };
      }

      function applySenderHdParams(pc) {
        if (!pc || !pc.getSenders) return;
        var vp = getTargetVideoParams();
        pc.getSenders().forEach(function(sender) {
          if (sender.track && sender.track.kind === 'video' && sender.getParameters && sender.setParameters) {
            try {
              var p = sender.getParameters() || {};
              if (!p.encodings || !p.encodings.length) p.encodings = [{}];
              p.encodings[0].maxBitrate = vp.maxBps;
              p.encodings[0].maxFramerate = vp.maxFps;
              p.encodings[0].scaleResolutionDownBy = 1.0;
              p.degradationPreference = vp.degPref || 'maintain-resolution';
              sender.setParameters(p).catch(function() {
                try {
                  var p2 = sender.getParameters() || {};
                  if (!p2.encodings || !p2.encodings.length) p2.encodings = [{}];
                  p2.encodings[0].maxBitrate = vp.maxBps;
                  p2.encodings[0].maxFramerate = vp.maxFps;
                  p2.encodings[0].scaleResolutionDownBy = 1.0;
                  sender.setParameters(p2).catch(function() {});
                } catch (_) {}
              });
            } catch (_) {}
          }
        });
      }

      async function requestScreenWakeLock() {
        try {
          if (navigator.wakeLock && navigator.wakeLock.request && !screenWakeLock) {
            screenWakeLock = await navigator.wakeLock.request('screen');
            if (screenWakeLock) {
              screenWakeLock.addEventListener('release', function() { screenWakeLock = null; });
            }
          }
        } catch (_) {}
      }

      function releaseScreenWakeLock() {
        try {
          if (screenWakeLock) {
            screenWakeLock.release().catch(function() {});
            screenWakeLock = null;
          }
        } catch (_) {}
      }

      async function handleCrewMicOffer(msg) {
        var viewerId = msg.viewerId || 'default';
        if (!crewMicStream || !crewMicActive) return;
        if (crewMicRetryTimer) {
          clearTimeout(crewMicRetryTimer);
          crewMicRetryTimer = null;
        }
        if (crewMicPc) {
          try { crewMicPc.close(); } catch (_) {}
          crewMicPc = null;
        }
        if (!pendingCrewIceByViewer[viewerId]) pendingCrewIceByViewer[viewerId] = [];
        var pc = new RTCPeerConnection({ iceServers: [] });
        crewMicPc = pc;
        crewMicStream.getAudioTracks().forEach(function(track) {
          pc.addTrack(track, crewMicStream);
        });
        pc.onicecandidate = function(ev) {
          if (ev.candidate) {
            sendSignal({
              type: 'crew-mic-ice',
              targetRole: 'viewer',
              viewerId: viewerId,
              slot: slot,
              candidate: ev.candidate
            });
          }
        };
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        var q = pendingCrewIceByViewer[viewerId] || [];
        if (q.length) {
          pendingCrewIceByViewer[viewerId] = [];
          for (var i = 0; i < q.length; i++) {
            await pc.addIceCandidate(new RTCIceCandidate(q[i])).catch(function() {});
          }
        }
        var ans = await pc.createAnswer();
        await pc.setLocalDescription(ans);
        await sendSignal({
          type: 'crew-mic-answer',
          targetRole: 'viewer',
          viewerId: viewerId,
          slot: slot,
          sdp: pc.localDescription
        });
      }

      function stopCrewMic(notifyDesk) {
        crewMicActive = false;
        if (crewMicRetryTimer) {
          clearTimeout(crewMicRetryTimer);
          crewMicRetryTimer = null;
        }
        if (crewMicPc) {
          try { crewMicPc.close(); } catch (_) {}
          crewMicPc = null;
        }
        if (crewMicStream) {
          crewMicStream.getTracks().forEach(function(t) { t.stop(); });
          crewMicStream = null;
        }
        if (btnCrewMic) {
          btnCrewMic.textContent = '🎙️ Mic';
          btnCrewMic.className = 'c-btn';
        }
        if (notifyDesk) {
          sendSignal({ type: 'crew-mic-stop', targetRole: 'viewer', slot: slot });
        }
      }

      function scheduleCrewMicRetry(attempt) {
        if (crewMicRetryTimer) {
          clearTimeout(crewMicRetryTimer);
          crewMicRetryTimer = null;
        }
        if (!crewMicActive || crewMicPc || attempt >= 4) return;
        crewMicRetryTimer = setTimeout(function() {
          crewMicRetryTimer = null;
          if (!crewMicActive || crewMicPc) return;
          connectSignalSSE(function() {
            if (!crewMicActive || crewMicPc) return;
            sendSignal({ type: 'crew-mic-start', targetRole: 'viewer', slot: slot });
            scheduleCrewMicRetry(attempt + 1);
          });
        }, 1100);
      }

      async function toggleCrewMic() {
        if (crewMicBusy) return;
        crewMicBusy = true;
        unlockTalkbackAudio();
        if (crewMicActive) {
          stopCrewMic(true);
          crewMicBusy = false;
          return;
        }
        try {
          crewMicStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
            video: false
          });
          crewMicActive = true;
          if (btnCrewMic) {
            btnCrewMic.textContent = '🔴 Talk LIVE';
            btnCrewMic.className = 'c-btn mic-live';
          }
          // Wait until publisher SSE is OPEN before signaling crew-mic-start so Desk's crew-mic-offer cannot be dropped
          connectSignalSSE(async function() {
            if (!crewMicActive) return;
            await sendSignal({ type: 'crew-mic-start', targetRole: 'viewer', slot: slot });
            scheduleCrewMicRetry(0);
          });
          if (videoEl && localStream && videoEl.paused) {
            videoEl.play().catch(function() {});
          }
        } catch (err) {
          stopCrewMic(false);
          tallyBadge.textContent = '⚠️ MIC DENIED';
          setTimeout(function() { updateTallyUI({ wcamLiveSlot: '' }); }, 2000);
        } finally {
          crewMicBusy = false;
        }
      }

      async function handleOffer(msg) {
        var viewerId = msg.viewerId;
        if (!viewerId || !localStream) return;
        if (peers[viewerId]) {
          try { peers[viewerId].close(); } catch (_) {}
        }
        if (!pendingIce[viewerId]) pendingIce[viewerId] = [];
        var pc = new RTCPeerConnection({ iceServers: [] });
        peers[viewerId] = pc;
        localStream.getTracks().forEach(function(track) {
          if (track.kind === 'video') {
            try { track.contentHint = 'motion'; } catch (_) {}
          }
          pc.addTrack(track, localStream);
        });
        pc.onconnectionstatechange = function() {
          if (peers[viewerId] !== pc) return;
          if (pc.connectionState === 'connected') {
            applySenderHdParams(pc);
          } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            try { pc.close(); } catch (_) {}
            if (peers[viewerId] === pc) delete peers[viewerId];
          }
        };
        pc.oniceconnectionstatechange = function() {
          if (peers[viewerId] !== pc) return;
          if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
            try { pc.close(); } catch (_) {}
            if (peers[viewerId] === pc) delete peers[viewerId];
          }
        };
        pc.onicecandidate = function(ev) {
          if (ev.candidate) {
            sendSignal({
              type: 'ice',
              targetRole: 'viewer',
              viewerId: viewerId,
              slot: slot,
              candidate: ev.candidate
            });
          }
        };
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        if (pendingIce[viewerId] && pendingIce[viewerId].length) {
          var queued = pendingIce[viewerId].slice();
          pendingIce[viewerId] = [];
          for (var i = 0; i < queued.length; i++) {
            await pc.addIceCandidate(new RTCIceCandidate(queued[i])).catch(function() {});
          }
        }
        var answer = await pc.createAnswer();
        var vp = getTargetVideoParams();
        answer = new RTCSessionDescription({ type: answer.type, sdp: boostVideoSdp(answer.sdp, vp.kbps) });
        await pc.setLocalDescription(answer);
        applySenderHdParams(pc);
        await sendSignal({
          type: 'answer',
          targetRole: 'viewer',
          viewerId: viewerId,
          slot: slot,
          sdp: pc.localDescription
        });
      }

      function connectSignalSSE(onReadyHello) {
        if (sse && sse.readyState === 1) {
          if (onReadyHello) onReadyHello();
          return;
        }
        if (onReadyHello) {
          sseOpenCallbacks.push(onReadyHello);
        }
        if (sse && sse.readyState === 0) {
          return;
        }
        if (sse) { try { sse.close(); } catch (_) {} }
        sse = new EventSource('/api/cam-events?role=publisher&slot=' + encodeURIComponent(slot) + '&pubId=' + encodeURIComponent(pubId));
        var sseSynced = false;
        var flushSseCallbacks = function() {
          if (sseSynced) return;
          sseSynced = true;
          var cbs = sseOpenCallbacks.splice(0, sseOpenCallbacks.length);
          for (var i = 0; i < cbs.length; i++) {
            try { cbs[i](); } catch (_) {}
          }
          if (cbs.length === 0 && isStreaming) {
            sendSignal({ type: 'hello', slot: slot, pubId: pubId, label: 'Wi-Fi Phone Cam ' + slot });
          }
        };
        sse.onopen = function() {
          // Wait briefly for initial wcam-sync / slot-assigned before firing hello so we never send a stale slot
          setTimeout(flushSseCallbacks, 80);
        };
        sse.onmessage = function(ev) {
          try {
            var msg = JSON.parse(ev.data);
            if (msg.type === 'slot-assigned' && msg.slot) {
              slot = String(msg.slot);
              if (slotBadge) slotBadge.textContent = 'WI-FI CAM ' + slot;
              try {
                var u = new URL(window.location.href);
                u.searchParams.set('slot', slot);
                window.history.replaceState(null, '', u.toString());
              } catch (_) {}
            } else if (msg.type === 'wcam-sync') {
              if (msg.assignedSlot && String(msg.assignedSlot) !== slot) {
                slot = String(msg.assignedSlot);
                if (slotBadge) slotBadge.textContent = 'WI-FI CAM ' + slot;
              }
              updateTallyUI(msg.status);
              flushSseCallbacks();
            } else if (msg.type === 'tally-status') {
              updateTallyUI(msg.status);
            } else if (msg.type === 'offer') {
              handleOffer(msg);
            } else if (msg.type === 'talkback-offer') {
              handleTalkbackOffer(msg);
            } else if (msg.type === 'crew-mic-offer') {
              handleCrewMicOffer(msg);
            } else if (msg.type === 'crew-mic-ice' && msg.candidate) {
              var cmSenderId = msg.viewerId || 'default';
              if (crewMicPc && crewMicPc.remoteDescription && crewMicPc.remoteDescription.type) {
                crewMicPc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function() {});
              } else {
                if (!pendingCrewIceByViewer[cmSenderId]) pendingCrewIceByViewer[cmSenderId] = [];
                pendingCrewIceByViewer[cmSenderId].push(msg.candidate);
              }
            } else if (msg.type === 'talkback-ice' && msg.candidate) {
              var tbSenderId = msg.viewerId || 'default';
              if (talkbackPc && talkbackPc.remoteDescription && talkbackPc.remoteDescription.type) {
                talkbackPc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function() {});
              } else {
                if (!pendingTalkIceByViewer[tbSenderId]) pendingTalkIceByViewer[tbSenderId] = [];
                pendingTalkIceByViewer[tbSenderId].push(msg.candidate);
              }
            } else if (msg.type === 'talkback-bye') {
              if (talkbackPc) { try { talkbackPc.close(); } catch (_) {} talkbackPc = null; }
              if (talkbackAudioEl) talkbackAudioEl.srcObject = null;
              talkbackIsActiveOnServer = false;
              updateAudioPillUI(false);
              refreshTalkbackPrompt();
            } else if (msg.type === 'viewer-bye' && msg.viewerId) {
              if (peers[msg.viewerId]) {
                try { peers[msg.viewerId].close(); } catch (_) {}
                delete peers[msg.viewerId];
              }
              delete pendingIce[msg.viewerId];
            } else if (msg.type === 'ice' && msg.viewerId && msg.candidate) {
              var targetPc = peers[msg.viewerId];
              if (targetPc && targetPc.remoteDescription && targetPc.remoteDescription.type) {
                targetPc.addIceCandidate(new RTCIceCandidate(msg.candidate)).catch(function() {});
              } else {
                if (!pendingIce[msg.viewerId]) pendingIce[msg.viewerId] = [];
                pendingIce[msg.viewerId].push(msg.candidate);
              }
            }
          } catch (_) {}
        };
        sse.onerror = function() {
          try { sse.close(); } catch (_) {}
          sse = null;
          setTimeout(function() { connectSignalSSE(); }, 1000);
        };
      }

      function pollCamStatus() {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var tid = controller ? setTimeout(function() { controller.abort(); }, 2500) : null;
        fetch('/api/status?_t=' + Date.now(), {
          cache: 'no-store',
          signal: controller ? controller.signal : undefined
        })
          .then(function(r) {
            if (tid) clearTimeout(tid);
            return r.json();
          })
          .then(function(res) {
            if (res && res.status) updateTallyUI(res.status);
          })
          .catch(function() {
            if (tid) clearTimeout(tid);
          });
      }

      function scheduleAutoResume() {
        if (userStopped || document.visibilityState !== 'visible') return;
        var hasLiveTrack = localStream && localStream.getVideoTracks().some(function(t) { return t.readyState === 'live'; });
        if (hasLiveTrack) return;
        if (resumeTimer) clearTimeout(resumeTimer);
        tallyBadge.textContent = '🔄 RECONNECTING...';
        resumeTimer = setTimeout(function() {
          if (!userStopped && document.visibilityState === 'visible') {
            startCamera(true);
          }
        }, 400);
      }

      function pushZoomSignal(digitalZ) {
        var now = Date.now();
        var sendNow = function() {
          lastZoomSentAt = Date.now();
          sendSignal({ type: 'cam-zoom', targetRole: 'viewer', slot: slot, zoom: Number(digitalZ.toFixed(2)) });
        };
        if (now - lastZoomSentAt >= 75) {
          if (zoomSendTimer) { clearTimeout(zoomSendTimer); zoomSendTimer = null; }
          sendNow();
        } else {
          if (zoomSendTimer) clearTimeout(zoomSendTimer);
          zoomSendTimer = setTimeout(sendNow, 75);
        }
      }

      async function applyCameraZoom(rawZ) {
        var z = Math.max(1.0, Math.min(5.0, Math.round((Number(rawZ) || 1.0) * 10) / 10));
        currentZoom = z;
        if (zoomSliderEl && Number(zoomSliderEl.value) !== z) zoomSliderEl.value = String(z);
        if (zoomValEl) zoomValEl.textContent = z.toFixed(1) + '×';
        zoomPills.forEach(function(p) {
          p.classList.toggle('active', Math.abs(Number(p.dataset.zoom) - z) < 0.06);
        });

        var digitalZ = z;
        var track = localStream && localStream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function' && typeof track.applyConstraints === 'function') {
          try {
            var caps = track.getCapabilities();
            if (caps && caps.zoom && typeof caps.zoom.min === 'number' && typeof caps.zoom.max === 'number' && caps.zoom.max > caps.zoom.min) {
              var hwZ = Math.max(caps.zoom.min, Math.min(caps.zoom.max, z));
              await track.applyConstraints({ advanced: [{ zoom: hwZ }] });
              digitalZ = z > caps.zoom.max ? Math.min(5.0, z / hwZ) : 1.0;
            }
          } catch (_) {
            digitalZ = z;
          }
        }
        if (videoEl) {
          videoEl.style.transform = digitalZ > 1.01 ? ('scale(' + digitalZ.toFixed(2) + ')') : 'none';
        }
        pushZoomSignal(digitalZ);
      }

      if (zoomSliderEl) {
        zoomSliderEl.addEventListener('input', function() { applyCameraZoom(zoomSliderEl.value); });
      }
      zoomPills.forEach(function(pill) {
        pill.addEventListener('click', function() { applyCameraZoom(pill.dataset.zoom); });
      });

      // Pinch-to-zoom directly on camera viewfinder
      var pinchStartDist = 0;
      var pinchStartZoom = 1.0;
      if (camStage) {
        camStage.addEventListener('touchstart', function(ev) {
          if (ev.touches && ev.touches.length === 2) {
            var dx = ev.touches[0].clientX - ev.touches[1].clientX;
            var dy = ev.touches[0].clientY - ev.touches[1].clientY;
            pinchStartDist = Math.hypot(dx, dy);
            pinchStartZoom = currentZoom;
          }
        }, { passive: true });
        camStage.addEventListener('touchmove', function(ev) {
          if (ev.touches && ev.touches.length === 2 && pinchStartDist > 10) {
            var dx = ev.touches[0].clientX - ev.touches[1].clientX;
            var dy = ev.touches[0].clientY - ev.touches[1].clientY;
            var dist = Math.hypot(dx, dy);
            var nextZ = pinchStartZoom * (dist / pinchStartDist);
            applyCameraZoom(nextZ);
          }
        }, { passive: true });
        camStage.addEventListener('touchend', function(ev) {
          if (!ev.touches || ev.touches.length < 2) pinchStartDist = 0;
        }, { passive: true });
      }

      async function startCamera(isAutoResume) {
        if (!isAutoResume) unlockTalkbackAudio();
        userStopped = false;
        var myStartSeq = ++camStartSeq;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setupBox.style.display = 'flex';
          setupMsg.innerHTML = 'Camera blocked because this browser requires HTTPS.<br>On iPhone, download the 1-time certificate from ZionCast -> Trust in Settings -> Certificate Trust Settings.';
          return;
        }
        var targetH = parseInt(selRes.value, 10) || 1080;
        var targetW = Math.round(targetH * 16 / 9);
        var isLand = (window.innerWidth || 1) >= (window.innerHeight || 1);
        var reqW = isLand ? targetW : targetH;
        var reqH = isLand ? targetH : targetW;
        var minW = isLand ? 1280 : 720;
        var minH = isLand ? 720 : 1280;
        var prevStream = localStream;
        if (prevStream) {
          prevStream.getTracks().forEach(function(t) {
            t.__intentionallyReplaced = true;
            try { t.stop(); } catch (_) {}
          });
          localStream = null;
        }
        try {
          var attempts = [];
          if (selectedDeviceId) {
            if (targetH >= 720) {
              attempts.push({ video: { deviceId: { exact: selectedDeviceId }, width: { min: minW, ideal: reqW }, height: { min: minH, ideal: reqH }, frameRate: { ideal: 30 } }, audio: false });
            }
            attempts.push({ video: { deviceId: { exact: selectedDeviceId }, width: { ideal: reqW }, height: { ideal: reqH }, frameRate: { ideal: 30 } }, audio: false });
          }
          if (targetH >= 720) {
            attempts.push({ video: { facingMode: { exact: facingMode }, width: { min: minW, ideal: reqW }, height: { min: minH, ideal: reqH }, frameRate: { ideal: 30 } }, audio: false });
          }
          attempts.push({ video: { facingMode: { exact: facingMode }, width: { ideal: reqW }, height: { ideal: reqH }, frameRate: { ideal: 30 } }, audio: false });
          attempts.push({ video: { facingMode: { ideal: facingMode }, width: { ideal: reqW }, height: { ideal: reqH }, frameRate: { ideal: 30 } }, audio: false });
          attempts.push({ video: { facingMode: { ideal: facingMode }, width: { ideal: isLand ? 1280 : 720 }, height: { ideal: isLand ? 720 : 1280 }, frameRate: { ideal: 30 } }, audio: false });
          attempts.push({ video: true, audio: false });
          var stream = null;
          var lastCamErr = null;
          for (var i = 0; i < attempts.length; i++) {
            try {
              stream = await navigator.mediaDevices.getUserMedia(attempts[i]);
              if (stream) break;
            } catch (e) {
              lastCamErr = e;
            }
          }
          if (myStartSeq !== camStartSeq || userStopped) {
            if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
            return;
          }
          if (!stream) throw lastCamErr || new Error('Could not open camera');
          localStream = stream;
          populateCameraLenses();
          var newVideoTrack = localStream.getVideoTracks()[0];
          if (newVideoTrack) {
            try { newVideoTrack.contentHint = 'motion'; } catch (_) {}
            // Lock continuous optical autofocus, auto-exposure, and auto-white-balance where supported
            if (typeof newVideoTrack.getCapabilities === 'function' && typeof newVideoTrack.applyConstraints === 'function') {
              try {
                var tCaps = newVideoTrack.getCapabilities() || {};
                var adv = {};
                if (Array.isArray(tCaps.focusMode) && tCaps.focusMode.indexOf('continuous') !== -1) adv.focusMode = 'continuous';
                if (Array.isArray(tCaps.exposureMode) && tCaps.exposureMode.indexOf('continuous') !== -1) adv.exposureMode = 'continuous';
                if (Array.isArray(tCaps.whiteBalanceMode) && tCaps.whiteBalanceMode.indexOf('continuous') !== -1) adv.whiteBalanceMode = 'continuous';
                if (Object.keys(adv).length > 0) {
                  newVideoTrack.applyConstraints({ advanced: [adv] }).catch(function() {});
                }
              } catch (_) {}
            }
            newVideoTrack.addEventListener('ended', function() {
              if (!newVideoTrack.__intentionallyReplaced) scheduleAutoResume();
            });
          }
          btnFlip.textContent = facingMode === 'environment' ? '🔄 Rear' : '🤳 Front';
          videoEl.srcObject = localStream;
          var orientHintEl = document.getElementById('cam-orient-hint');
          var syncResAndOrientBadge = function() {
            if (resBadge && videoEl.videoWidth && videoEl.videoHeight) {
              resBadge.textContent = videoEl.videoWidth + '×' + videoEl.videoHeight;
            }
            if (orientHintEl && videoEl.videoWidth && videoEl.videoHeight) {
              orientHintEl.style.display = (isStreaming && videoEl.videoHeight > videoEl.videoWidth) ? 'inline-block' : 'none';
            }
          };
          videoEl.onloadedmetadata = syncResAndOrientBadge;
          videoEl.onresize = syncResAndOrientBadge;
          await videoEl.play().catch(function() {});
          isStreaming = true;
          requestScreenWakeLock();
          setupBox.style.display = 'none';
          if (zoomBarEl) zoomBarEl.style.display = 'flex';
          btnToggle.textContent = '⏹ Stop';
          btnToggle.className = 'c-btn stop';
          applyCameraZoom(currentZoom);

          // Seamlessly hot-swap video track on all connected peers (ZERO freeze when switching 1080p/720p/4K/Rear/Front!)
          var peerKeys = Object.keys(peers);
          var replacedCount = 0;
          if (newVideoTrack && peerKeys.length > 0) {
            for (var pk = 0; pk < peerKeys.length; pk++) {
              var pObj = peers[peerKeys[pk]];
              var st = pObj ? (pObj.iceConnectionState || pObj.connectionState) : '';
              if (pObj && (st === 'connected' || st === 'completed')) {
                var vSender = null;
                if (pObj.getTransceivers) {
                  var vTr = pObj.getTransceivers().find(function(t) {
                    return (t.sender && t.sender.track && t.sender.track.kind === 'video') ||
                           (t.receiver && t.receiver.track && t.receiver.track.kind === 'video');
                  });
                  if (vTr) vSender = vTr.sender;
                }
                if (!vSender && pObj.getSenders) {
                  vSender = pObj.getSenders().find(function(s) { return s.track && s.track.kind === 'video'; });
                }
                if (vSender && typeof vSender.replaceTrack === 'function') {
                  try {
                    await vSender.replaceTrack(newVideoTrack);
                    applySenderHdParams(pObj);
                    replacedCount++;
                  } catch (_) {}
                }
              }
            }
          }
          if (replacedCount === 0 || replacedCount < peerKeys.length) {
            connectSignalSSE(function() {
              if (isStreaming) {
                sendSignal({ type: 'hello', slot: slot, pubId: pubId, trackChanged: true, label: 'Wi-Fi Phone Cam ' + slot });
              }
            });
          }
          tallyBadge.textContent = '🟢 READY ON ZIONCAST';
        } catch (err) {
          if (myStartSeq !== camStartSeq) return;
          isStreaming = false;
          setupBox.style.display = 'flex';
          if (zoomBarEl) zoomBarEl.style.display = 'none';
          setupMsg.textContent = isAutoResume
            ? 'Phone paused camera while you switched apps. Tap Start below to resume feed (no QR re-scan needed).'
            : 'Camera error: ' + (err.message || err.name) + '. Make sure Chrome/Safari has Camera permission enabled.';
          btnStartBig.textContent = isAutoResume ? '▶ Resume Camera Feed' : '▶ Start Camera Feed';
        }
      }

      function stopCamera() {
        userStopped = true;
        camStartSeq++;
        releaseScreenWakeLock();
        if (resumeTimer) { clearTimeout(resumeTimer); resumeTimer = null; }
        isStreaming = false;
        currentZoom = 1.0;
        if (zoomBarEl) zoomBarEl.style.display = 'none';
        if (videoEl) videoEl.style.transform = 'none';
        Object.keys(peers).forEach(function(k) {
          try { peers[k].close(); } catch (_) {}
        });
        peers = {};
        if (talkbackPc) { try { talkbackPc.close(); } catch (_) {} talkbackPc = null; }
        if (talkbackAudioEl) talkbackAudioEl.srcObject = null;
        stopCrewMic(true);
        if (localStream) {
          localStream.getTracks().forEach(function(t) { t.__intentionallyReplaced = true; t.stop(); });
          localStream = null;
        }
        videoEl.srcObject = null;
        setupBox.style.display = 'flex';
        btnStartBig.textContent = '▶ Start Camera Feed';
        btnToggle.textContent = '▶ Go Live';
        btnToggle.className = 'c-btn primary';
        tallyBadge.textContent = 'STANDBY';
        tallyBadge.className = 'tally-pill';
        camStage.classList.remove('on-air-frame');
        sendSignal({ type: 'bye', slot: slot });
      }

      document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
          if (isStreaming) requestScreenWakeLock();
          if (talkbackAudioEl && !talkbackMuted && talkbackAudioEl.srcObject) {
            talkbackAudioEl.play().catch(function() {});
          }
          scheduleAutoResume();
        }
      });
      window.addEventListener('pageshow', scheduleAutoResume);

      btnStartBig.addEventListener('click', function() { startCamera(false); });
      if (btnCrewMic) {
        btnCrewMic.addEventListener('click', function() { toggleCrewMic(); });
      }
      btnToggle.addEventListener('click', function() {
        if (isStreaming) stopCamera(); else startCamera(false);
      });
      btnFlip.addEventListener('click', function() {
        selectedDeviceId = '';
        if (selDevice) selDevice.value = '';
        facingMode = facingMode === 'environment' ? 'user' : 'environment';
        btnFlip.textContent = facingMode === 'environment' ? '🔄 Rear' : '🤳 Front';
        if (isStreaming) startCamera(false);
      });
      if (selDevice) {
        selDevice.addEventListener('change', function() {
          selectedDeviceId = selDevice.value || '';
          if (isStreaming) startCamera(false);
        });
      }
      selRes.addEventListener('change', function() {
        if (isStreaming) startCamera(false);
      });
      window.addEventListener('beforeunload', function() {
        if (crewMicActive) sendSignal({ type: 'crew-mic-stop', targetRole: 'viewer', slot: slot });
        if (isStreaming) sendSignal({ type: 'bye', slot: slot });
      });

      setInterval(async function() {
        if (!isStreaming || !resBadge) return;
        var vIds = Object.keys(peers);
        if (!vIds.length) return;
        var pc = peers[vIds[0]];
        if (!pc || !pc.getStats) return;
        try {
          var stats = await pc.getStats();
          var fw = 0, fh = 0, sentBytes = 0;
          stats.forEach(function(r) {
            if (r.type === 'outbound-rtp' && (r.kind === 'video' || r.mediaType === 'video')) {
              fw = r.frameWidth || fw;
              fh = r.frameHeight || fh;
              sentBytes = r.bytesSent || sentBytes;
            }
          });
          var prev = pc.__lastTx || { bytes: 0, ts: Date.now() };
          var dt = Math.max(0.5, (Date.now() - prev.ts) / 1000);
          var mbps = sentBytes > prev.bytes ? (((sentBytes - prev.bytes) * 8) / dt / 1000000).toFixed(1) : '';
          pc.__lastTx = { bytes: sentBytes, ts: Date.now() };
          var rw = (fw && fh) ? (fw + '×' + fh) : (videoEl.videoWidth ? (videoEl.videoWidth + '×' + videoEl.videoHeight) : '');
          if (rw) resBadge.textContent = rw + (mbps ? (' • ' + mbps + 'M') : '');
        } catch (_) {}
      }, 2000);

      connectSignalSSE();
      pollCamStatus();
      setInterval(pollCamStatus, 3000);
    })();
  </script>
</body>
</html>`;
  }

  stop() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.camDisconnectTimers) {
      for (const t of this.camDisconnectTimers.values()) clearTimeout(t);
      this.camDisconnectTimers.clear();
    }
    if (this.httpsServer) {
      this.httpsServer.close();
      this.httpsServer = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
      this.isRunning = false;
    }
  }
}

module.exports = new RemoteServer();
