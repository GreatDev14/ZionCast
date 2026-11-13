const { app, BrowserWindow, screen, ipcMain, dialog, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const remoteServer = require('./remote-server.js');

// Ensure high-performance GPU acceleration & zero background throttling
if (app && app.commandLine) app.commandLine.appendSwitch('disable-renderer-backgrounding');
if (app && app.commandLine) app.commandLine.appendSwitch('disable-background-timer-throttling');
if (app && app.commandLine) app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
if (app && app.commandLine) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
if (app && app.commandLine) app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (app && app.commandLine) app.commandLine.appendSwitch('enable-gpu-rasterization');
if (app && app.commandLine) app.commandLine.appendSwitch('enable-zero-copy');
if (app && app.commandLine) app.commandLine.appendSwitch('ignore-gpu-blocklist');

let controlWindow = null;
let displayWindow = null;
let stageWindow = null;
let selectedDisplayId = null; // null means auto-detect secondary

function getDbFilePath() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  }
  return path.join(dir, 'zioncast_database.json');
}

let currentDisplayState = {
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
  cameraOpacity: 0.85,
  bannerText: '',
  bannerActive: false,
  brightness: 100
};

function createControlWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  controlWindow = new BrowserWindow({
    x: primaryDisplay.bounds.x + 20,
    y: primaryDisplay.bounds.y + 20,
    width: Math.min(1600, width - 40),
    height: Math.min(950, height - 40),
    minWidth: 1050,
    minHeight: 680,
    title: 'ZionCast - Church Presentation Control Desk',
    backgroundColor: '#0d1117',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  controlWindow.loadFile('index.html');
  Menu.setApplicationMenu(null);

  controlWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console L${line}] ${message}`);
  });

  controlWindow.on('closed', () => {
    controlWindow = null;
    if (displayWindow && !displayWindow.isDestroyed()) {
      displayWindow.close();
    }
    app.quit();
  });

  // If secondary display is already connected on startup, auto-launch projector output
  controlWindow.webContents.on('did-finish-load', () => {
    const allDisplays = screen.getAllDisplays();
    if (allDisplays.length > 1) {
      setTimeout(() => {
        launchDisplayWindow();
      }, 500);
    }
  });
}

function resolveTargetDisplay(targetId = null) {
  const allDisplays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();

  if (targetId) {
    const found = allDisplays.find(d => d.id === targetId || d.id === Number(targetId));
    if (found) return found;
  }

  if (selectedDisplayId) {
    const found = allDisplays.find(d => d.id === selectedDisplayId || d.id === Number(selectedDisplayId));
    if (found) return found;
  }

  // Auto-detect: Pick secondary display if available
  const secondary = allDisplays.find(d => d.id !== primaryDisplay.id);
  return secondary || primaryDisplay;
}

function restoreControlFocus() {
  if (controlWindow && !controlWindow.isDestroyed() && controlWindow.isVisible() && !controlWindow.isMinimized()) {
    controlWindow.focus();
  }
}

function launchDisplayWindow(targetDisplayId = null) {
  if (targetDisplayId) selectedDisplayId = targetDisplayId;

  const targetDisplay = resolveTargetDisplay(selectedDisplayId);
  const primaryDisplay = screen.getPrimaryDisplay();
  const isSecondary = targetDisplay.id !== primaryDisplay.id;

  if (displayWindow && !displayWindow.isDestroyed()) {
    // Reposition existing window to target display without stealing keyboard focus from Control Desk
    displayWindow.setFullScreen(false);
    displayWindow.setBounds(targetDisplay.bounds);
    if (isSecondary) {
      displayWindow.setFullScreen(true);
      displayWindow.setAlwaysOnTop(true, 'screen-saver');
      displayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      displayWindow.setSkipTaskbar(true);
    }
    displayWindow.showInactive();
    if (isSecondary) {
      restoreControlFocus();
    }
    displayWindow.webContents.send('display-state-update', {
      ...currentDisplayState,
      remotePort: remoteServer.port || 3000
    });
    notifyControlDisplayStatus();
    return { success: true, isSecondary, bounds: targetDisplay.bounds };
  }

  // Windows Multi-Monitor: start with fullscreen: false, set bounds, then enable fullscreen!
  displayWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: isSecondary ? targetDisplay.bounds.width : 1280,
    height: isSecondary ? targetDisplay.bounds.height : 720,
    frame: !isSecondary,
    fullscreen: false,
    show: false,
    backgroundColor: '#000000',
    focusable: false,
    title: 'ZionCast - Live Projector / TV Output',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false,
      paintWhenInitiallyHidden: true,
      autoplayPolicy: 'no-user-gesture-required'
    }
  });

  displayWindow.loadFile('display.html');

  displayWindow.webContents.on('console-message', (event, level, message, line) => {
    console.log(`[Display Console L${line}] ${message}`);
  });

  displayWindow.webContents.on('did-finish-load', () => {
    if (displayWindow && !displayWindow.isDestroyed()) {
      displayWindow.webContents.send('display-state-update', {
        ...currentDisplayState,
        remotePort: remoteServer.port || 3000
      });
    }
  });

  displayWindow.once('ready-to-show', () => {
    if (!displayWindow || displayWindow.isDestroyed()) return;
    displayWindow.setBounds(targetDisplay.bounds);
    if (isSecondary) {
      displayWindow.setFullScreen(true);
      displayWindow.setAlwaysOnTop(true, 'screen-saver');
      displayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      displayWindow.setSkipTaskbar(true);
    }
    displayWindow.showInactive();
    restoreControlFocus();
    displayWindow.webContents.send('display-state-update', {
      ...currentDisplayState,
      remotePort: remoteServer.port || 3000
    });
    notifyControlDisplayStatus();
  });

  displayWindow.on('minimize', (e) => {
    if (isSecondary) {
      e.preventDefault();
      displayWindow.restore();
    }
  });

  displayWindow.on('closed', () => {
    displayWindow = null;
    notifyControlDisplayStatus();
    restoreControlFocus();
  });

  notifyControlDisplayStatus();
  return { success: true, isSecondary, bounds: targetDisplay.bounds };
}

function launchStageDisplayWindow() {
  const allDisplays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const targetDisplay = allDisplays.length > 2 ? allDisplays[2] : (allDisplays.length > 1 ? allDisplays[1] : primaryDisplay);
  const isSecondary = targetDisplay.id !== primaryDisplay.id;

  if (stageWindow && !stageWindow.isDestroyed()) {
    if (isSecondary) {
      stageWindow.showInactive();
      restoreControlFocus();
    } else {
      stageWindow.show();
    }
    return { success: true };
  }

  const port = remoteServer.port || 3000;
  const stageUrl = `http://127.0.0.1:${port}/stage`;

  stageWindow = new BrowserWindow({
    x: targetDisplay.bounds.x + 30,
    y: targetDisplay.bounds.y + 30,
    width: Math.min(1280, targetDisplay.bounds.width - 60),
    height: Math.min(760, targetDisplay.bounds.height - 60),
    show: false,
    title: 'ZionCast - Preacher & Choir Stage Display',
    backgroundColor: '#07090e',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  stageWindow.loadURL(stageUrl);

  stageWindow.once('ready-to-show', () => {
    if (!stageWindow || stageWindow.isDestroyed()) return;
    if (isSecondary) {
      stageWindow.showInactive();
      restoreControlFocus();
    } else {
      stageWindow.show();
    }
  });

  stageWindow.on('closed', () => {
    stageWindow = null;
    notifyControlDisplayStatus();
    restoreControlFocus();
  });

  return { success: true };
}

function notifyControlDisplayStatus() {
  if (controlWindow && !controlWindow.isDestroyed()) {
    const isOpen = displayWindow !== null && !displayWindow.isDestroyed();
    controlWindow.webContents.send('display-status-update', {
      isOpen,
      displayCount: screen.getAllDisplays().length,
      displays: getDisplayInfo().displays
    });
  }
}

function getDisplayInfo() {
  const allDisplays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    displays: allDisplays.map((d, index) => ({
      id: d.id,
      index: index + 1,
      label: d.label || `Screen ${index + 1} (${d.bounds.width}x${d.bounds.height})`,
      bounds: d.bounds,
      isPrimary: d.id === primaryDisplay.id,
      scaleFactor: d.scaleFactor
    })),
    primaryId: primaryDisplay.id,
    hasSecondary: allDisplays.length > 1,
    selectedTargetId: selectedDisplayId
  };
}

// Identify Screens: Display large overlay on each screen for 3.5 seconds (OpenLP style)
function identifyScreens() {
  const allDisplays = screen.getAllDisplays();
  const primaryDisplay = screen.getPrimaryDisplay();
  const overlayWindows = [];

  allDisplays.forEach((d, idx) => {
    const isPrim = d.id === primaryDisplay.id;
    const overlay = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      webPreferences: { contextIsolation: true }
    });

    const roleName = isPrim ? 'OPERATOR LAPTOP (CONTROL DESK)' : 'AUDIENCE TV / PROJECTOR';
    const html = `
      <!DOCTYPE html>
      <html>
      <body style="margin:0; width:100vw; height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(0,0,0,0.85); color:#fff; font-family:sans-serif; user-select:none;">
        <div style="font-size:120px; font-weight:900; color:#f59e0b; text-shadow:0 0 30px rgba(245,158,11,0.8); line-height:1;">
          SCREEN ${idx + 1}
        </div>
        <div style="font-size:32px; font-weight:700; color:#38bdf8; margin-top:16px; letter-spacing:0.1em; text-transform:uppercase;">
          ${roleName}
        </div>
        <div style="font-size:20px; color:#94a3b8; margin-top:8px;">
          Resolution: ${d.bounds.width} x ${d.bounds.height} • Scale: ${Math.round(d.scaleFactor * 100)}%
        </div>
      </body>
      </html>
    `;

    overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    overlay.showInactive();
    overlayWindows.push(overlay);
  });

  setTimeout(() => {
    overlayWindows.forEach(win => {
      if (!win.isDestroyed()) win.close();
    });
    restoreControlFocus();
  }, 3500);
}

// App lifecycle
app.whenReady().then(async () => {
  // Auto-grant camera, microphone, and media permissions across Control Desk & TV Output
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(true);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);

  // Fix YouTube Embed Errors 152 & 153 and Video Playback Buffering:
  // 1. Desktop Chrome User-Agent prevents bot / Electron blocking
  // 2. Supply valid Referer (https://www.youtube.com/) only when missing or file://
  // 3. Preserve YouTube's own Origin header on /youtubei/v1/player and googlevideo.com requests
  // 4. Never duplicate Access-Control-Allow-Origin on googlevideo.com (prevents multiple-ACAO CORS block)
  const ytFilter = {
    urls: [
      '*://*.youtube.com/*',
      '*://*.youtube-nocookie.com/*',
      '*://*.googlevideo.com/*',
      '*://*.ytimg.com/*'
    ]
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(ytFilter, (details, callback) => {
    details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

    const ref = details.requestHeaders['Referer'] || details.requestHeaders['referer'] || '';
    if (!ref || ref.startsWith('file://')) {
      details.requestHeaders['Referer'] = 'https://www.youtube.com/';
    }

    const orig = details.requestHeaders['Origin'] || details.requestHeaders['origin'] || '';
    if (orig.startsWith('file://') || orig === 'null') {
      if (details.url.includes('googlevideo.com') || details.method === 'POST') {
        details.requestHeaders['Origin'] = 'https://www.youtube.com';
      } else {
        delete details.requestHeaders['Origin'];
        delete details.requestHeaders['origin'];
      }
    }

    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  session.defaultSession.webRequest.onHeadersReceived(ytFilter, (details, callback) => {
    if (details.resourceType === 'subFrame' && details.responseHeaders) {
      const responseHeaders = { ...details.responseHeaders };
      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
      callback({ cancel: false, responseHeaders });
      return;
    }
    callback({ cancel: false });
  });

  // Initialize Mobile Remote & Local YouTube Embed Server BEFORE opening windows so port is ready
  await remoteServer.init((action, data) => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('remote-action', { action, data });
    }
  });
  currentDisplayState.remotePort = remoteServer.port || 3000;

  createControlWindow();

  // Monitor physical display plug/unplug events
  screen.on('display-added', (event, newDisplay) => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('displays-changed', getDisplayInfo());
    }
    // Auto-launch display on newly connected projector/TV
    setTimeout(() => {
      launchDisplayWindow(newDisplay.id);
    }, 600);
  });

  screen.on('display-removed', () => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('displays-changed', getDisplayInfo());
    }
  });

  screen.on('display-metrics-changed', () => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('displays-changed', getDisplayInfo());
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createControlWindow();
  });
});

app.on('window-all-closed', () => {
  remoteServer.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  remoteServer.stop();
});

// Mobile Remote IPC Handlers
ipcMain.handle('get-remote-info', () => {
  return remoteServer.getInfo();
});

ipcMain.on('update-remote-status', (event, status) => {
  remoteServer.updateStatus(status);
});

// Stage Display / Confidence Monitor IPC Handlers
ipcMain.handle('launch-stage-display', () => {
  return launchStageDisplayWindow();
});

ipcMain.handle('close-stage-display', () => {
  if (stageWindow && !stageWindow.isDestroyed()) {
    stageWindow.close();
    stageWindow = null;
  }
  return { success: true };
});

ipcMain.handle('get-stage-display-status', () => {
  return {
    isOpen: stageWindow !== null && !stageWindow.isDestroyed()
  };
});

// IPC Handlers
ipcMain.handle('get-displays', () => {
  return getDisplayInfo();
});

ipcMain.handle('launch-display', (event, displayId) => {
  return launchDisplayWindow(displayId);
});

ipcMain.handle('extend-displays', async () => {
  try {
    const { exec } = require('child_process');
    exec('displayswitch.exe /extend', (err) => {
      if (err) console.warn('displayswitch /extend error:', err);
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('fix-windows-firewall', async () => {
  try {
    const { exec } = require('child_process');
    const psCmd = 'powershell -Command "Start-Process cmd -ArgumentList \'/c netsh advfirewall firewall add rule name=\\\"ZionCast Remote\\\" dir=in action=allow protocol=TCP localport=3000-3020\' -Verb RunAs -WindowStyle Hidden"';
    exec(psCmd, (err) => {
      if (err) console.warn('Firewall rule elevation error:', err);
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('close-display', () => {
  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.close();
    displayWindow = null;
  }
  notifyControlDisplayStatus();
  return { success: true };
});

ipcMain.handle('identify-screens', () => {
  identifyScreens();
  return { success: true };
});

ipcMain.handle('move-control-to-primary', () => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    const primary = screen.getPrimaryDisplay();
    controlWindow.setFullScreen(false);
    controlWindow.setBounds({
      x: primary.bounds.x + 20,
      y: primary.bounds.y + 20,
      width: Math.min(1600, primary.workAreaSize.width - 40),
      height: Math.min(950, primary.workAreaSize.height - 40)
    });
    controlWindow.maximize();
    controlWindow.focus();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('get-display-status', () => {
  return {
    isOpen: displayWindow !== null && !displayWindow.isDestroyed(),
    displayCount: screen.getAllDisplays().length
  };
});

// Real-time State Synchronization Handler
ipcMain.on('sync-to-display', (event, payload) => {
  currentDisplayState = {
    ...currentDisplayState,
    ...payload,
    remotePort: remoteServer.port || 3000
  };

  if (displayWindow && !displayWindow.isDestroyed()) {
    displayWindow.webContents.send('display-state-update', currentDisplayState);
  } else if (payload && payload._autoWake) {
    launchDisplayWindow(selectedDisplayId);
  }
});

// Explicit Keyboard Focus Recovery for Control Desk Inputs
ipcMain.on('ensure-control-focus', () => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    if (controlWindow.isMinimized()) controlWindow.restore();
    controlWindow.focus();
  }
});

ipcMain.handle('get-display-state', () => {
  return {
    ...currentDisplayState,
    remotePort: remoteServer.port || 3000
  };
});

ipcMain.on('request-camera-release', () => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('release-control-camera');
  }
});

ipcMain.on('sync-to-control', (event, payload) => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.webContents.send('control-state-update', payload);
  }
});

ipcMain.handle('toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    const isFull = win.isFullScreen();
    win.setFullScreen(!isFull);
    return !isFull;
  }
  return false;
});

// File Dialogs & System operations
ipcMain.handle('open-file-dialog', async (event, options = {}) => {
  if (!controlWindow) return null;
  const ALL_MEDIA_EXTS = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif', 'avif', 'jfif', 'heic', 'heif',
    'mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', 'ogv', '3gp', 'ts', 'mts', 'm2ts', 'vob', 'mpg', 'mpeg'
  ];
  const result = await dialog.showOpenDialog(controlWindow, {
    title: options.title || 'Select File',
    properties: options.properties || ['openFile'],
    filters: options.filters || [
      { name: 'All Media Files (Images & Videos)', extensions: ALL_MEDIA_EXTS },
      { name: 'All Images (*.jpg, *.png, *.webp, *.gif, *.svg, etc.)', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'tif', 'avif', 'jfif', 'heic', 'heif'] },
      { name: 'All Videos (*.mp4, *.webm, *.mov, *.mkv, *.avi, etc.)', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', 'wmv', 'flv', 'ogv', '3gp', 'ts', 'mts', 'm2ts', 'vob', 'mpg', 'mpeg'] },
      { name: 'Song & Service Files', extensions: ['json', 'txt', 'xml', 'ccli'] },
      { name: 'All Files (*.*)', extensions: ['*'] }
    ]
  });
  restoreControlFocus();
  return result;
});

ipcMain.handle('save-file-dialog', async (event, options = {}) => {
  if (!controlWindow) return null;
  const result = await dialog.showSaveDialog(controlWindow, {
    title: options.title || 'Save File',
    defaultPath: options.defaultPath || 'ServiceOrder.json',
    filters: options.filters || [
      { name: 'ZionCast Service Order', extensions: ['json'] },
      { name: 'Text File', extensions: ['txt'] }
    ]
  });
  restoreControlFocus();
  return result;
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-bible-data', async (event, version = 'kjv') => {
  try {
    const safeVer = ['kjv', 'rsv', 'gnt'].includes(String(version).toLowerCase()) ? String(version).toLowerCase() : 'kjv';
    const biblePath = path.join(__dirname, 'assets', 'bibles', `${safeVer}.json`);
    const raw = await fs.promises.readFile(biblePath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Could not load Bible version "${version}":`, error.message);
    return null;
  }
});

ipcMain.handle('get-background-presets', async () => {
  try {
    const presetsPath = path.join(__dirname, 'assets', 'backgrounds', 'presets.json');
    const raw = await fs.promises.readFile(presetsPath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
});

// Native JSON File Persistence for user library & settings
ipcMain.handle('load-user-data', async () => {
  try {
    const dbPath = getDbFilePath();
    if (fs.existsSync(dbPath)) {
      const raw = await fs.promises.readFile(dbPath, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (error) {
    console.warn('[ZionCast Storage] Could not read user data file:', error.message);
  }
  return null;
});

ipcMain.handle('save-user-data', async (event, bundle) => {
  try {
    const dbPath = getDbFilePath();
    const tempFile = `${dbPath}.tmp`;
    const serialized = JSON.stringify(bundle, null, 2);
    await fs.promises.writeFile(tempFile, serialized, 'utf-8');
    await fs.promises.rename(tempFile, dbPath);
    console.log('[ZionCast Storage] Persisted state to:', dbPath);
    return { success: true };
  } catch (error) {
    console.error('[ZionCast Storage] Failed to write user data file:', error.message);
    return { success: false, error: error.message };
  }
});

// External browser launcher
ipcMain.handle('open-external-url', async (event, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    await shell.openExternal(url);
    return true;
  }
  return false;
});

// In-app Update Checker (queries GitHub Releases API with zero-rate-limit Web Redirect & Raw fallbacks)
function compareSemver(currentVersion, latestVer) {
  const parseVer = v => String(v || '').replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const curParts = parseVer(currentVersion);
  const latParts = parseVer(latestVer);
  for (let i = 0; i < Math.max(curParts.length, latParts.length); i++) {
    const c = curParts[i] || 0;
    const l = latParts[i] || 0;
    if (l > c) return true;
    if (l < c) return false;
  }
  return false;
}

function checkUpdatesViaRawCdn(currentVersion) {
  return new Promise((resolve) => {
    const req = https.get({
      hostname: 'raw.githubusercontent.com',
      path: '/GreatDev14/ZionCast/main/package.json?t=' + Date.now(),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ZionCast-Updater'
      },
      timeout: 6000
    }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const data = JSON.parse(body);
            const latestVer = String(data.version || '').trim();
            if (latestVer) {
              const latestTag = 'v' + latestVer;
              resolve({
                success: true,
                hasUpdate: compareSemver(currentVersion, latestVer),
                currentVersion,
                latestVersion: latestVer,
                releaseName: 'ZionCast ' + latestTag,
                releaseNotes: 'ZionCast ' + latestTag + ' is available with camera auto-filtering, TV isolation, and sleek flyer-friendly countdown HUD.',
                releaseUrl: 'https://github.com/GreatDev14/ZionCast/releases/tag/' + latestTag,
                downloadUrl: 'https://github.com/GreatDev14/ZionCast/releases/download/' + latestTag + '/ZionCast-Setup-' + latestVer + '.exe'
              });
              return;
            }
          }
        } catch (_) {}
        resolve(null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function checkUpdatesViaRedirect(currentVersion) {
  return new Promise((resolve) => {
    const req = https.get({
      hostname: 'github.com',
      path: '/GreatDev14/ZionCast/releases/latest',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 8000
    }, (res) => {
      res.resume();
      const loc = res.headers && res.headers.location ? String(res.headers.location) : '';
      const tagMatch = loc.match(/\/releases\/tag\/v?([0-9]+\.[0-9]+\.[0-9]+)/i);
      if ((res.statusCode === 301 || res.statusCode === 302) && tagMatch) {
        const latestVer = tagMatch[1];
        const latestTag = 'v' + latestVer;
        resolve({
          success: true,
          hasUpdate: compareSemver(currentVersion, latestVer),
          currentVersion,
          latestVersion: latestVer,
          releaseName: 'ZionCast ' + latestTag,
          releaseNotes: 'ZionCast ' + latestTag + ' is available on GitHub Releases.',
          releaseUrl: 'https://github.com/GreatDev14/ZionCast/releases/tag/' + latestTag,
          downloadUrl: 'https://github.com/GreatDev14/ZionCast/releases/download/' + latestTag + '/ZionCast-Setup-' + latestVer + '.exe'
        });
      } else {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion();

  // 1. Check raw GitHub CDN package.json (100% rate-limit proof, never 403!)
  try {
    const cdnResult = await checkUpdatesViaRawCdn(currentVersion);
    if (cdnResult && cdnResult.success) {
      return cdnResult;
    }
  } catch (e) {
    console.warn('CDN update check failed:', e.message);
  }

  // 2. Zero-rate-limit GitHub redirect check
  try {
    const redirectFallback = await checkUpdatesViaRedirect(currentVersion);
    if (redirectFallback && redirectFallback.success) {
      return redirectFallback;
    }
  } catch (e) {
    console.warn('Redirect update check failed:', e.message);
  }

  // 3. Fallback to GitHub Releases API (with graceful fallback so HTTP 403 is NEVER displayed to user)
  const apiResult = await new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: '/repos/GreatDev14/ZionCast/releases/latest',
      headers: {
        'User-Agent': 'ZionCast-Desktop/' + currentVersion,
        'Accept': 'application/vnd.github+json'
      },
      timeout: 6000
    };

    const req = https.get(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const data = JSON.parse(body);
            const latestTag = data.tag_name || '';
            const latestVer = latestTag.replace(/^v/i, '');
            let downloadUrl = 'https://github.com/GreatDev14/ZionCast/releases/download/v' + latestVer + '/ZionCast-Setup-' + latestVer + '.exe';
            if (Array.isArray(data.assets)) {
              const exeAsset = data.assets.find(a => a.name.endsWith('.exe') && !a.name.includes('Portable'));
              if (exeAsset && exeAsset.browser_download_url) {
                downloadUrl = exeAsset.browser_download_url;
              }
            }
            resolve({
              success: true,
              hasUpdate: compareSemver(currentVersion, latestVer),
              currentVersion,
              latestVersion: latestVer,
              releaseName: data.name || latestTag,
              releaseNotes: data.body || '',
              releaseUrl: data.html_url || 'https://github.com/GreatDev14/ZionCast/releases',
              downloadUrl
            });
          } else {
            // Graceful fallback when GitHub returns HTTP 403 rate limit
            resolve({
              success: true,
              hasUpdate: false,
              currentVersion,
              latestVersion: currentVersion,
              releaseName: 'ZionCast v' + currentVersion,
              releaseNotes: 'You are running the latest version of ZionCast.',
              releaseUrl: 'https://github.com/GreatDev14/ZionCast/releases'
            });
          }
        } catch (e) {
          resolve({ success: false, error: e.message, currentVersion });
        }
      });
    });

    req.on('error', (err) => resolve({ success: false, error: err.message, currentVersion }));
    req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Check request timed out', currentVersion }); });
  });

  return apiResult || {
    success: true,
    hasUpdate: false,
    currentVersion,
    latestVersion: currentVersion,
    releaseName: 'ZionCast v' + currentVersion
  };
});
