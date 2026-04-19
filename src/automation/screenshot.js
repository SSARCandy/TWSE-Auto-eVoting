const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { delay } = require('./utils');

/**
 * Captures a screenshot of the voting proof page.
 * @param {object} webContents - The Electron webContents instance.
 * @param {string} nationalId - The user's national ID.
 * @param {object} company - The company object containing 'code'.
 * @param {string} outputDir - The base output directory.
 * @returns {string} The absolute path to the saved screenshot.
 */
async function execute(webContents, nationalId, company, outputDir, folderStructure = 'by_id') {
  const baseDir = outputDir || path.join(app.getPath('documents'), '投票證明');
  const dir = folderStructure === 'flat' ? baseDir : path.join(baseDir, nationalId);
  
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const filename = `${nationalId}_${company.code}.png`;
  const filepath = path.join(dir, filename);

  // Use executeJavaScript to scroll the barcode block into view before capturing
  await webContents.executeJavaScript(`
    (() => {
      const barcodeContainer = document.querySelector('.is-warning') || 
                               document.querySelector('#barCodeAccountNoAndStockId')?.closest('div');
                               
      if (barcodeContainer) {
        barcodeContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    })()
  `);

  // Wait a bit after scrolling
  await delay(500);

  // Capture the entire visible page
  const image = await webContents.capturePage();
  fs.writeFileSync(filepath, image.toPNG());
  
  return filepath;
}

module.exports = { execute };
