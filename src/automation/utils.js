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
 * @param {number} timeoutMs Maximum time to wait before timing out (defaults to 10s)
 * @returns {Promise<boolean>} True if loaded successfully, false if timed out
 */
function waitForNavigation(webContents, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        webContents.removeListener('did-finish-load', onFinish);
        resolve(false);
      }
    }, timeoutMs);

    const onFinish = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve(true);
      }
    };

    webContents.once('did-finish-load', onFinish);
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
  try {
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs));
    const execPromise = webContents.executeJavaScript(script);
    return await Promise.race([execPromise, timeoutPromise]);
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
}

module.exports = {
  delay,
  randomDelay,
  waitForNavigation,
  safeExecute,
};
