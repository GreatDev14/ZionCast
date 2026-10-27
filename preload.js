const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zionApi', {
  // Dual-screen & window management
  getDisplays: () => ipcRenderer.invoke('get-displays'),
  launchDisplay: (displayId) => ipcRenderer.invoke('launch-display', displayId),
  closeDisplay: () => ipcRenderer.invoke('close-display'),
  getDisplayStatus: () => ipcRenderer.invoke('get-display-status'),
  onDisplaysChanged: (callback) => {
    ipcRenderer.on('displays-changed', (event, data) => callback(data));
  },
  onDisplayStatusUpdate: (callback) => {
    ipcRenderer.on('display-status-update', (event, data) => callback(data));
  },
  identifyScreens: () => ipcRenderer.invoke('identify-screens'),
  moveControlToPrimary: () => ipcRenderer.invoke('move-control-to-primary'),

  // State synchronization between Control Desk and Audience Display
  sendToDisplay: (payload) => ipcRenderer.send('sync-to-display', payload),
  onDisplayStateUpdate: (callback) => {
    ipcRenderer.on('display-state-update', (event, data) => callback(data));
  },
  sendToControl: (payload) => ipcRenderer.send('sync-to-control', payload),
  onControlStateUpdate: (callback) => {
    ipcRenderer.on('control-state-update', (event, data) => callback(data));
  },

  // Window utilities
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),

  // Native File dialogs & System operations
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

  // Bundled asset providers
  getBibleData: (version = 'kjv') => ipcRenderer.invoke('get-bible-data', version),
  getBackgroundPresets: () => ipcRenderer.invoke('get-background-presets'),

  // Native Disk Persistence
  loadUserData: () => ipcRenderer.invoke('load-user-data'),
  saveUserData: (data) => ipcRenderer.invoke('save-user-data', data),

  // Platform
  platform: process.platform
});
