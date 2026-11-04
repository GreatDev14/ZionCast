const { app, BrowserWindow, screen, ipcMain, dialog, Menu, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const remoteServer = require('./remote-server.js');

// Ensure high-performance GPU acceleration & zero background throttling
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');

let controlWindow = null;
let displayWindow = null;
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
      backgroundThrottling: false
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

function launchDisplayWindow(targetDisplayId = null) {
  if (targetDisplayId) selectedDisplayId = targetDisplayId;

  const targetDisplay = resolveTargetDisplay(selectedDisplayId);
  const primaryDisplay = screen.getPrimaryDisplay();
  const isSecondary = targetDisplay.id !== primaryDisplay.id;

  if (displayWindow && !displayWindow.isDestroyed()) {
    // Reposition existing window to target display
    displayWindow.setFullScreen(false);
    displayWindow.setBounds(targetDisplay.bounds);
    if (isSecondary) {
      displayWindow.setFullScreen(true);
      displayWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    displayWindow.show();
    displayWindow.webContents.send('display-state-update', currentDisplayState);
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
    title: 'ZionCast - Live Projector / TV Output',
    icon: path.join(__dirname, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
      backgroundThrottling: false
    }
  });

  displayWindow.loadFile('display.html');

  displayWindow.once('ready-to-show', () => {
    displayWindow.setBounds(targetDisplay.bounds);
    if (isSecondary) {
      displayWindow.setFullScreen(true);
      displayWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    displayWindow.show();
    displayWindow.webContents.send('display-state-update', currentDisplayState);
    notifyControlDisplayStatus();
  });

  displayWindow.on('closed', () => {
    displayWindow = null;
    notifyControlDisplayStatus();
  });

  notifyControlDisplayStatus();
  return { success: true, isSecondary, bounds: targetDisplay.bounds };
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
    overlay.show();
    overlayWindows.push(overlay);
  });

  setTimeout(() => {
    overlayWindows.forEach(win => {
      if (!win.isDestroyed()) win.close();
    });
  }, 3500);
}

// App lifecycle
app.whenReady().then(() => {
  // Fix YouTube Embed Error 153: bypass missing file:// referrer by injecting valid origin & referer
  const ytFilter = {
    urls: [
      '*://*.youtube.com/*',
      '*://*.youtube-nocookie.com/*',
      '*://*.googlevideo.com/*'
    ]
  };

  session.defaultSession.webRequest.onBeforeSendHeaders(ytFilter, (details, callback) => {
    details.requestHeaders['Referer'] = 'https://www.youtube.com/';
    details.requestHeaders['Origin'] = 'https://www.youtube.com';
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });

  createControlWindow();

  // Initialize Mobile Remote Server
  remoteServer.init((action, data) => {
    if (controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.webContents.send('remote-action', { action, data });
    }
  });

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

// IPC Handlers
ipcMain.handle('get-displays', () => {
  return getDisplayInfo();
});

ipcMain.handle('launch-display', (event, displayId) => {
  return launchDisplayWindow(displayId);
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

// Real-time State Synchronization Handler (Auto-wakes display if not open)
ipcMain.on('sync-to-display', (event, payload) => {
  currentDisplayState = { ...currentDisplayState, ...payload };

  // If displayWindow is not open, automatically launch it on the projector!
  if (!displayWindow || displayWindow.isDestroyed()) {
    launchDisplayWindow(selectedDisplayId);
    return;
  }

  displayWindow.webContents.send('display-state-update', currentDisplayState);
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
  return await dialog.showOpenDialog(controlWindow, {
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
});

ipcMain.handle('save-file-dialog', async (event, options = {}) => {
  if (!controlWindow) return null;
  return await dialog.showSaveDialog(controlWindow, {
    title: options.title || 'Save File',
    defaultPath: options.defaultPath || 'ServiceOrder.json',
    filters: options.filters || [
      { name: 'ZionCast Service Order', extensions: ['json'] },
      { name: 'Text File', extensions: ['txt'] }
    ]
  });
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

// In-app Update Checker (queries official GitHub Releases API)
ipcMain.handle('check-for-updates', async () => {
  return new Promise((resolve) => {
    const currentVersion = app.getVersion();
    const options = {
      hostname: 'api.github.com',
      path: '/repos/GreatDev14/ZionCast/releases/latest',
      headers: {
        'User-Agent': `ZionCast-Desktop/${currentVersion}`,
        'Accept': 'application/vnd.github+json'
      },
      timeout: 8000
    };

    const req = https.get(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          if (res.statusCode === 200) {
            const data = JSON.parse(body);
            const latestTag = data.tag_name || '';
            const latestVer = latestTag.replace(/^v/, '');
            let downloadUrl = 'https://github.com/GreatDev14/ZionCast/releases/latest';
            if (Array.isArray(data.assets)) {
              const exeAsset = data.assets.find(a => a.name.endsWith('.exe') && !a.name.includes('Portable'));
              if (exeAsset && exeAsset.browser_download_url) {
                downloadUrl = exeAsset.browser_download_url;
              }
            }

            const parseVer = v => v.split('.').map(n => parseInt(n, 10) || 0);
            const curParts = parseVer(currentVersion);
            const latParts = parseVer(latestVer);
            let hasUpdate = false;
            for (let i = 0; i < Math.max(curParts.length, latParts.length); i++) {
              const c = curParts[i] || 0;
              const l = latParts[i] || 0;
              if (l > c) { hasUpdate = true; break; }
              if (l < c) { hasUpdate = false; break; }
            }

            resolve({
              success: true,
              hasUpdate,
              currentVersion,
              latestVersion: latestVer,
              releaseName: data.name || latestTag,
              releaseNotes: data.body || '',
              releaseUrl: data.html_url || 'https://github.com/GreatDev14/ZionCast/releases',
              downloadUrl
            });
          } else {
            resolve({ success: false, error: `GitHub HTTP ${res.statusCode}`, currentVersion });
          }
        } catch (e) {
          resolve({ success: false, error: e.message, currentVersion });
        }
      });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message, currentVersion });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Check request timed out', currentVersion });
    });
  });
});

