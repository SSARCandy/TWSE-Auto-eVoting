const path = require('path');
const fs = require('fs');
const { app } = require('electron');

async function execute(webContents, nationalId, company, outputDir) {
  // Save to [outputDir]/[身分證字號]/ or fallback to Documents/投票證明/[身分證字號]/
  let baseDir = outputDir;
  if (!baseDir) {
    const documentsPath = app.getPath('documents');
    baseDir = path.join(documentsPath, '投票證明');
  }
  
  const dir = path.join(baseDir, nationalId);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const filename = `${nationalId}_${dateStr}_${company.code}.png`;
  const filepath = path.join(dir, filename);

  // Capture the entire visible page
  const image = await webContents.capturePage();
  
  const png = image.toPNG();
  fs.writeFileSync(filepath, png);
  
  return filepath;
}

module.exports = { execute };

