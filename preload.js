const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  startVoting: (ids, outputDir, folderStructure, includeCompanyName) => ipcRenderer.invoke('start-voting', { ids, outputDir, folderStructure, includeCompanyName }),
  stopVoting: () => ipcRenderer.invoke('stop-voting'),
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openAbout: () => ipcRenderer.invoke('open-about'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onLog: (callback) => ipcRenderer.on('log', (_event, msg, type) => {
    callback(String(msg), type);
  }),
  onProgress: (callback) => ipcRenderer.on('progress', (_event, value) => {
    // Deep copy to ensure serializable data only
    callback(JSON.parse(JSON.stringify(value)));
  }),
});
