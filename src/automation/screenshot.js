const path = require('path');
const fs = require('fs');
const { BrowserWindow } = require('electron');
const { delay, getScreenshotDir } = require('./utils');

const DEFAULT_PATTERN = '{id}_{code}';

/**
 * Generates a screenshot filename based on pattern.
 * Pattern supports: {id}, {code}, {name}, {date}
 * @param {string} pattern - Filename pattern.
 * @param {string} nationalId - User's national ID.
 * @param {object} company - Company object with 'code', 'name', 'meetingDate'.
 * @returns {string} The formatted filename.
 */
function formatFilename(pattern, nationalId, company) {
  // Sanitize company name: replace forbidden chars and whitespace with underscores,
  // then collapse repeated underscores and trim them from both ends
  const safeName = (company.name || '')
    .trim()
    .replace(/[\\/:*?"<>| \t\n\r\f\v\x00-\x1F\x7F]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return (pattern || DEFAULT_PATTERN)
    .replace(/{id}/g, nationalId || 'unknown')
    .replace(/{code}/g, company.code || 'unknown')
    .replace(/{name}/g, safeName || 'noname')
    .replace(/{date}/g, company.meetingDate || 'nodate');
}

/**
 * Scrolls the barcode block into view and reports whether a barcode is on the page.
 * @param {object} webContents - The Electron webContents instance.
 * @returns {Promise<boolean>}
 */
function scrollToBarcode(webContents) {
  return webContents.executeJavaScript(`
    (() => {
      const barcodeContainer = document.querySelector('.is-warning') || 
                               document.querySelector('#barCodeAccountNoAndStockId')?.closest('div');
                               
      const hasBarcode = !!document.querySelector('#barCodeAccountNo, #barCodeStockId, #barCodeAccountNoAndStockId');

      if (barcodeContainer) {
        // Use 'instant' instead of 'smooth' to prevent motion blur during capture
        barcodeContainer.scrollIntoView({ behavior: 'instant', block: 'center' });
      }

      return hasBarcode;
    })()
  `);
}

/**
 * Captures the page, throwing if the image is empty.
 * @param {object} webContents - The Electron webContents instance.
 * @returns {Promise<Electron.NativeImage>}
 */
async function capturePageOrThrow(webContents) {
  const image = await webContents.capturePage();
  if (image.isEmpty()) throw new Error('Screenshot empty');
  return image;
}

/**
 * Fallback capture for when the window is minimized/hidden and has no render surface.
 * Temporarily shows the window invisibly (opacity 0, not focusable), retries capture,
 * then restores the original window state.
 * @param {object} webContents - The Electron webContents instance.
 * @param {Error} originalErr - Error from the first capture attempt.
 * @returns {Promise<Electron.NativeImage>}
 */
async function captureWithWindowRestore(webContents, originalErr) {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) throw originalErr;

  const isMinimized = win.isMinimized();
  const isVisible = win.isVisible();
  const needsRestore = isMinimized || !isVisible;
  const originalOpacity = win.getOpacity();
  const originalFocusable = win.isFocusable();

  if (needsRestore) {
    // Prevent stealing focus and make it invisible to user but active for OS
    win.setOpacity(0);
    win.setFocusable(false);
  }

  try {
    if (isMinimized) win.restore();
    if (!isVisible) win.showInactive();

    // Force a redraw and wait for rendering surface to be allocated
    await webContents.executeJavaScript('window.dispatchEvent(new Event("resize"));');
    await delay(800);

    const maxRetries = 3;
    for (let retry = 0; ; retry++) {
      try {
        return await capturePageOrThrow(webContents);
      } catch (captureErr) {
        if (retry === maxRetries - 1) throw captureErr;
        // Force repaint again
        await webContents.executeJavaScript('document.body.style.opacity = "0.99"; setTimeout(() => document.body.style.opacity = "1", 50);');
        await delay(1200);
      }
    }
  } finally {
    if (isMinimized) win.minimize();
    else if (!isVisible) win.hide();

    if (needsRestore) {
      win.setOpacity(originalOpacity);
      win.setFocusable(originalFocusable);
    }
  }
}

/**
 * Captures a screenshot of the voting proof page.
 * @param {object} webContents - The Electron webContents instance.
 * @param {string} nationalId - The user's national ID.
 * @param {object} company - The company object containing 'code'.
 * @param {string} outputDir - The base output directory.
 * @param {string} folderStructure - Folder structure type ('by_id' or 'flat').
 * @param {string} filenamePattern - Pattern for the filename.
 * @returns {Promise<string|null>} The absolute path to the saved screenshot, or null if no barcode.
 */
async function execute(webContents, nationalId, company, outputDir, folderStructure = 'by_id', filenamePattern = DEFAULT_PATTERN) {
  const dir = getScreenshotDir(nationalId, outputDir, folderStructure);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filepath = path.join(dir, `${formatFilename(filenamePattern, nationalId, company)}.png`);

  const barcodeExists = await scrollToBarcode(webContents);
  if (!barcodeExists) return null;

  // Wait for font rendering to settle after scroll
  await delay(800);

  let image;
  try {
    image = await capturePageOrThrow(webContents);
  } catch (err) {
    image = await captureWithWindowRestore(webContents, err);
  }

  fs.writeFileSync(filepath, image.toPNG());
  return filepath;
}

module.exports = { execute, formatFilename };
