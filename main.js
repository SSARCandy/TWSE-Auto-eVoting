const { app, BrowserWindow, BrowserView, ipcMain, shell, Notification, Menu, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');

const pkg = require('./package.json');
const CONSTANTS = require('./src/constants');
const automation = require('./src/automation/main_flow');
const { calculateProgress } = require('./src/automation/utils');

const APP_VERSION = pkg.version;
const APP_TITLE = '股東會投票幫手';
const ICON_PATH = path.join(__dirname, 'assets/icons/icon.png');
const DEFAULT_CONFIG = { outputDir: '', ids: '', folderStructure: 'by_id', filenamePattern: '{id}_{code}' };

let mainWindow;
let browserView;
let stopRequested = false;

const isMainWindowAlive = () => mainWindow && !mainWindow.isDestroyed();

function sendLog(msg, type = '') {
  if (!isMainWindowAlive()) return;
  mainWindow.webContents.send('log', String(msg), type);
}

/**
 * Shows a system notification, but only when the user is not looking at the app.
 * @param {string} title
 * @param {string} body
 */
function notifyIfUnfocused(title, body) {
  if (mainWindow.isFocused() || !Notification.isSupported()) return;
  new Notification({ title, body, icon: ICON_PATH }).show();
}

async function checkForUpdates() {
  sendLog('[系統] 正在檢查更新...', 'info');

  const fetchRelease = () => new Promise((resolve, reject) => {
    const req = net.request({
      method: 'GET',
      url: CONSTANTS.URLS.GITHUB_API_LATEST,
      headers: { 'User-Agent': 'TWSE-Auto-eVoting-App' },
    });
    req.on('response', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(res.statusCode));
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });

  try {
    const release = await fetchRelease();
    const latestVersion = release.tag_name.replace('v', '');

    if (!isNewerVersion(latestVersion, APP_VERSION)) {
      sendLog(`[系統] 目前已是最新版本 v${APP_VERSION}`, 'info');
      return;
    }

    sendLog(`[更新] 發現新版本 v${latestVersion}`, 'info');

    const { response } = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '發現新版本',
      message: `偵測到新版本 v${latestVersion}`,
      detail: `建議前往 GitHub 下載最新版本 v${latestVersion} 以確保功能正常。\n目前版本: v${APP_VERSION}`,
      buttons: ['前往下載', '稍後'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response !== 0) return;
    shell.openExternal(`${CONSTANTS.URLS.GITHUB_REPO}/releases/latest`);
  } catch (err) {
    sendLog(`[系統] 檢查更新失敗: ${err.message}`, 'error');
  }
}

function isNewerVersion(latest, current) {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (l[i] > (c[i] || 0)) return true;
    if (l[i] < (c[i] || 0)) return false;
  }
  return false;
}

// Mask Electron User-Agent
app.userAgentFallback = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
app.setAppUserModelId(APP_TITLE);

const getConfigPath = () => path.join(app.getPath('userData'), 'config.json');

function getConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return DEFAULT_CONFIG;

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!config) return DEFAULT_CONFIG;

    // Migrate old includeCompanyName if exists
    if (config.filenamePattern === undefined && config.includeCompanyName !== undefined) {
      config.filenamePattern = config.includeCompanyName ? '{id}_{code}_{name}' : '{id}_{code}';
      delete config.includeCompanyName;
    }

    return { ...DEFAULT_CONFIG, ...config };
  } catch (e) {
    console.error('Failed to read config:', e);
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config) {
  try {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
    return true;
  } catch (e) {
    console.error('Failed to save config:', e);
    return false;
  }
}

const handleDevToolsShortcut = (targetWebContents) => (event, input) => {
  if (input.type !== 'keyDown') return;

  const isF12 = input.key === 'F12';
  const isCtrlShiftI = input.key.toLowerCase() === 'i' && (input.control || input.meta) && input.shift;
  if (isF12 || isCtrlShiftI) {
    targetWebContents.toggleDevTools();
    event.preventDefault();
  }
};

function createBrowserView() {
  if (!isMainWindowAlive()) return;

  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false, 
      contextIsolation: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.setBrowserView(browserView);

  const updateBounds = () => {
    if (!isMainWindowAlive()) return;
    const { width, height } = mainWindow.getContentBounds();
    browserView.setBounds({ x: 450, y: 0, width: width - 450, height: height });
  };

  updateBounds();
  mainWindow.on('resize', updateBounds);
  browserView.webContents.on('before-input-event', handleDevToolsShortcut(browserView.webContents));

  browserView.webContents.on('dom-ready', () => {
    browserView.webContents.insertCSS('::-webkit-scrollbar { display: none; }');
  });

  browserView.webContents.loadURL(CONSTANTS.URLS.LOGIN);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 850,
    minWidth: 900,
    minHeight: 850,
    resizable: false,
    show: true,
    backgroundColor: '#1a1a2e',
    paintWhenInitiallyHidden: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
    title: APP_TITLE,
  });

  mainWindow.loadFile(path.join(__dirname, 'src/renderer/index.html'));
  mainWindow.webContents.on('before-input-event', handleDevToolsShortcut(mainWindow.webContents));

  mainWindow.webContents.on('did-finish-load', () => {
    checkForUpdates();
  });

  setTimeout(createBrowserView, 400);
}

// Auto-pick the first client certificate so login never blocks on a picker
app.on('select-client-certificate', (event, webContents, url, list, callback) => {
  event.preventDefault();
  if (list && list.length > 0) callback(list[0]);
});

app.whenReady().then(() => {
  createWindow();
  Menu.setApplicationMenu(null);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('get-app-version', () => APP_VERSION);

ipcMain.handle('start-voting', async (event, params) => {
  const { ids, outputDir, folderStructure, filenamePattern } = params;
  stopRequested = false;

  let maxPercent = 0;
  const sendProgress = (progress) => {
    if (!isMainWindowAlive()) return;
    // Never let the percentage go backwards (e.g. on account retry)
    maxPercent = Math.max(maxPercent, calculateProgress(progress));
    mainWindow.webContents.send('progress', JSON.parse(JSON.stringify({ ...progress, percent: maxPercent })));
    mainWindow.setTitle(`(${maxPercent}%) ${APP_TITLE}`);
  };

  try {
    const stats = await automation.run(
      browserView.webContents,
      ids,
      sendLog,
      sendProgress,
      () => stopRequested,
      outputDir,
      folderStructure,
      filenamePattern
    );

    if (!isMainWindowAlive()) return { success: true };

    mainWindow.setTitle(APP_TITLE);
    const msg = `累計投票: ${stats.voted}，累計截圖: ${stats.screenshoted}`;
    sendLog(`[系統] 完成。${msg}`);
    notifyIfUnfocused('投票完成', msg);

    return { success: true };
  } catch (error) {
    if (isMainWindowAlive()) {
      mainWindow.setTitle(APP_TITLE);
      notifyIfUnfocused('投票錯誤', error.message);
    }

    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-config', async () => getConfig());
ipcMain.handle('save-config', async (event, config) => saveConfig(config));

ipcMain.handle('open-about', async () => {
  const aboutWindow = new BrowserWindow({
    width: 400,
    height: 450,
    resizable: false,
    autoHideMenuBar: true,
    title: `關於${APP_TITLE}`,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  aboutWindow.loadFile(path.join(__dirname, 'src/renderer/about.html'));
  return { success: true };
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

ipcMain.handle('stop-voting', () => {
  stopRequested = true;
  if (browserView?.webContents && !browserView.webContents.isDestroyed()) {
    browserView.webContents.stop();
  }
  return { success: true };
});
