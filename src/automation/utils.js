const { app } = require('electron');
const path = require('path');
const fs = require('fs');

/**
 * Utility functions for automation delays and navigation.
 */

/**
 * Returns a fixed delay in milliseconds.
 * 
 * @param {number} ms Milliseconds to wait
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns a randomized delay to simulate human pacing and avoid triggering anti-bot
 * signatures characterized by static interval interactions.
 * 
 * @param {number} min Minimum milliseconds to wait
 * @param {number} max Maximum milliseconds to wait
 * @returns {Promise<void>}
 */
function randomDelay(min = 400, max = 800) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return delay(ms);
}

/**
 * Halts execution natively until Electron signals that a new page navigation 
 * has finished loading. This replaces arbitrary 2000-3000ms waits that 
 * bottleneck the script.
 * 
 * @param {object} webContents The Electron WebContents instance
 * @param {number} timeoutMs Maximum time to wait before timing out (defaults to 30s)
 * @returns {Promise<boolean>} True if loaded successfully, false if timed out
 */
function waitForNavigation(webContents, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let timer = null;

    // Resolve false on failure/timeout to keep the boolean check flow
    const finish = (result) => {
      clearTimeout(timer);
      webContents.removeListener('did-finish-load', onFinish);
      webContents.removeListener('did-fail-load', onFail);
      resolve(result);
    };
    const onFinish = () => finish(true);
    const onFail = () => finish(false);

    timer = setTimeout(() => finish(false), timeoutMs);
    webContents.once('did-finish-load', onFinish);
    webContents.once('did-fail-load', onFail);
  });
}

/**
 * Safely executes JavaScript in the given webContents with a timeout.
 * 
 * @param {object} webContents The Electron WebContents instance
 * @param {string} script The JavaScript code to execute
 * @param {number} timeoutMs Maximum time to wait before timing out
 * @returns {Promise<any>} The result of the script or an error string
 */
async function safeExecute(webContents, script, timeoutMs = 3000) {
  let timer = null;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs);
    });
    return await Promise.race([webContents.executeJavaScript(script), timeoutPromise]);
  } catch (err) {
    return `ERROR: ${err.message}`;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks if the current time is within TDCC maintenance window (00:00 - 07:00 UTC+8).
 * @returns {boolean}
 */
function isMaintenanceTime() {
  const taiwanHour = (new Date().getUTCHours() + 8) % 24;
  return taiwanHour < 7;
}

/**
 * Resolves the folder where screenshots for an account are stored.
 *
 * @param {string} nationalId User's national ID
 * @param {string} outputDir Base output directory (defaults to Documents/投票證明)
 * @param {string} folderStructure 'by_id' (sub-folder per ID) or 'flat'
 * @returns {string} Absolute folder path
 */
function getScreenshotDir(nationalId, outputDir, folderStructure = 'by_id') {
  const baseDir = outputDir || path.join(app.getPath('documents'), '投票證明');
  return folderStructure === 'flat' ? baseDir : path.join(baseDir, nationalId);
}

const dirCache = new Map();

/**
 * Checks if a screenshot proof already exists for a given ID and stock code/company.
 * Uses fuzzy matching to find any file containing both ID and Code.
 *
 * @param {string} nationalId User's national ID
 * @param {string|object} company Stock code or company object with 'code'
 * @param {string} outputDir Base output directory
 * @param {string} folderStructure 'by_id' or 'flat'
 * @returns {boolean}
 */
function isScreenshotExists(nationalId, company, outputDir, folderStructure = 'by_id') {
  const dir = getScreenshotDir(nationalId, outputDir, folderStructure);
  if (!fs.existsSync(dir)) return false;

  const code = typeof company === 'string' ? company : company.code;

  // Performance: cache directory file list per execution loop
  if (!dirCache.has(dir)) {
    dirCache.set(dir, fs.readdirSync(dir));
    // Clear cache after a short delay to ensure fresh data for next run but fast for current loop
    setTimeout(() => dirCache.delete(dir), 5000);
  }

  const files = dirCache.get(dir);

  // Fuzzy match: check if segments (split by _) match both nationalId AND company code exactly
  return files.some(file => {
    if (!file.endsWith('.png')) return false;
    const parts = file.slice(0, -'.png'.length).split('_');
    return parts.includes(nationalId) && parts.includes(code);
  });
}

/**
 * Calculates unified progress percentage (0-100).
 * 
 * @param {object} data Progress data from sendProgress
 * @returns {number} 0-100 percentage
 */
function calculateProgress(data) {
  const { id, vote, screenshot, status } = data;
  if (!id || id.total <= 0) return 0;

  const base = Math.max(0, id.current - 1);
  let accountProgress = 0;

  if (status === 'finished') {
    accountProgress = 1;
  } else if (status === 'initializing') {
    accountProgress = 0;
  } else {
    const hasVote = vote?.total > 0;
    const hasShot = screenshot?.total > 0;

    if (hasVote && hasShot) {
      accountProgress = (vote.current / vote.total * 0.5) + (screenshot.current / screenshot.total * 0.5);
    } else if (hasVote) {
      accountProgress = vote.current / vote.total;
    } else if (hasShot) {
      accountProgress = screenshot.current / screenshot.total;
    }
  }

  const percent = Math.floor(((base + accountProgress) / id.total) * 100);
  return Math.min(100, Math.max(0, isNaN(percent) ? 0 : percent));
}

module.exports = {
  delay,
  randomDelay,
  waitForNavigation,
  safeExecute,
  isMaintenanceTime,
  getScreenshotDir,
  isScreenshotExists,
  calculateProgress,
};
