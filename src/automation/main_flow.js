const { session } = require('electron');
const login = require('./login');
const voting = require('./voting');
const screenshot = require('./screenshot');
const logout = require('./logout');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const CONSTANTS = require('../constants');

function isScreenshotExists(nationalId, code, outputDir) {
    let baseDir = outputDir;
    if (!baseDir) {
        baseDir = path.join(app.getPath('documents'), '投票證明');
    }
    const dir = path.join(baseDir, nationalId);
    if (!fs.existsSync(dir)) return false;

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `${nationalId}_${dateStr}_${code}.png`;
    return fs.existsSync(path.join(dir, filename));
}

async function run(webContents, ids, preference, sendLog, sendProgress, isStopRequested, outputDir, stockCodes = null) {
    for (let i = 0; i < ids.length; i++) {
        if (isStopRequested()) {
            sendLog('停止請求已被接收，終止執行。');
            break;
        }

        const id = ids[i];
        const maskedId = id.substring(0, 4) + '****' + id.substring(8);
        
        // 0. Maintenance Check (00:00 - 07:00 Taiwan Time UTC+8)
        const now = new Date();
        // Calculate Taiwan hour (UTC+8)
        const utcHour = now.getUTCHours();
        const taiwanHour = (utcHour + 8) % 24;
        
        if (taiwanHour >= 0 && taiwanHour < 7) {
            sendLog('目前為系統維護時間 (00:00~07:00)，停止自動作業。', 'error');
            break;
        }

        sendLog(`[正在處理] 身分證: ${maskedId}`);
        sendProgress({ currentIdIndex: i, totalIds: ids.length, currentCompanyIndex: 0, totalCompanies: 0 });

        try {
            // 1. Clear Session for isolation
            sendLog('正在清空 Session 資訊...');
            await webContents.session.clearStorageData();
            await webContents.session.clearCache();

            // 2. Login
            const loggedIn = await login.execute(webContents, id, sendLog);
            if (!loggedIn) {
              sendLog(`[失敗] ${maskedId} 登入失敗，跳過。`, 'error');
              continue;
            }

            // 3. Determine companies to process
            let targetCodes = [];
            if (stockCodes && stockCodes.length > 0) {
                targetCodes = stockCodes;
                sendLog(`使用指定股號清單: ${targetCodes.join(', ')}`);
            } else {
                sendLog('正在抓取公司清單...');
                const companies = await voting.getCompanyList(webContents, sendLog);
                
                const pendingCodes = companies.filter(c => c.status === 'pending').map(c => c.code);
                const votedCodes = companies.filter(c => c.status === 'voted').map(c => c.code);
                
                const votedNeedScreenshot = votedCodes.filter(code => !isScreenshotExists(id, code, outputDir));
                
                targetCodes = [...pendingCodes, ...votedNeedScreenshot];
                sendLog(`找到 ${pendingCodes.length} 家需投票，${votedNeedScreenshot.length} 家需補截圖。共需處理 ${targetCodes.length} 家。`);
            }
            
            // 4. Process each company using Search-based logic for reliability
            for (let j = 0; j < targetCodes.length; j++) {
                if (isStopRequested()) break;

                const code = targetCodes[j];
                sendProgress({ 
                    currentIdIndex: i, 
                    totalIds: ids.length, 
                    currentCompanyIndex: j, 
                    totalCompanies: targetCodes.length 
                });

                if (isScreenshotExists(id, code, outputDir)) {
                    sendLog(`[略過] 股號 ${code} 已有截圖存檔，跳過。`);
                    continue;
                }

                sendLog(`[步驟] 搜尋股號: ${code} ...`);
                
                try {
                    // Navigate to search results for this stock
                    const navResult = await voting.searchAndNavigate(webContents, code, sendLog);
                    
                    if (navResult.type === 'vote') {
                        sendLog(`[投票] 偵測到未投票，開始執行投票程序...`);
                        await voting.voteForCompany(webContents, { code: code, name: '查詢中', rowIndex: 0 }, preference, sendLog, true);
                        sendLog(`[完成] ${code} 投票成功。`);
                        
                        // 點擊 "Confirm" / id="go" 返回列表後，再點擊查詢以進行截圖
                        sendLog('[導航] 準備返回列表頁面...');
                        const goBackScript = `
                            (() => {
                                const goBtn = document.getElementById('go');
                                if (goBtn) {
                                    goBtn.click();
                                    return true;
                                }
                                return false;
                            })()
                        `;
                        const clickedGo = await webContents.executeJavaScript(goBackScript);
                        if (!clickedGo) {
                            sendLog('[導航] 找不到 id="go" 按鈕，嘗試回上頁');
                            await webContents.goBack();
                        }
                        await new Promise(r => setTimeout(r, 3000));
                        
                        // 點擊查詢
                        sendLog(`[查詢] 準備點擊 ${code} 查詢以截圖...`);
                        const qryScript = `
                            (() => {
                                const link = document.querySelector('a[onclick*="\\'${code}\\',\\'qry\\'"]');
                                if (link) {
                                    link.click();
                                    return true;
                                }
                                return false;
                            })()
                        `;
                        const clickedQry = await webContents.executeJavaScript(qryScript);
                        if (!clickedQry) {
                             throw new Error(`找不到股號 ${code} 的查詢連結`);
                        }
                        await new Promise(r => setTimeout(r, 3000));
                    } else {
                        sendLog(`[檢視] 偵測到已投過，已在查詢頁面...`);
                    }
                    
                    // 5. Screenshot (Precise detection)
                    sendLog(`[截圖] 正在擷取 ${code} 投票證明...`);
                    const screenshotPath = await screenshot.execute(webContents, id, { code: code, name: '股東會' }, outputDir);
                    sendLog(`[存檔] 截圖已儲存: ${screenshotPath.split('\\').pop()}`);

                } catch (procError) {
                    sendLog(`[錯誤] 處理股號 ${code} 發生異常: ${procError.message}，將繼續下一間公司。`, 'error');
                    // 發生錯誤不中斷整個迴圈，繼續處理下一間公司
                }

                // 無論成功或失敗，都延遲並回到列表準備下一次搜尋
                if (!isStopRequested()) {
                    await new Promise(r => setTimeout(r, 1500));
                    
                    sendLog('[導航] 準備返回列表頁面 (截圖後)...');
                    const returnListScript = `
                        (() => {
                            // 1. 優先尋找 name="button2" 或文字為 Back 的按鈕
                            const exactBackBtn = document.querySelector('button[name="button2"]') || 
                                                 Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Back'));
                            if (exactBackBtn) {
                                exactBackBtn.click();
                                return true;
                            }

                            // 2. 原有的 fallback 邏輯
                            const btns = Array.from(document.querySelectorAll('a, button, input[type="button"], .btn, .c-actBtn'));
                            const backBtn = btns.find(el => {
                                const t = (el.innerText || el.value || '').replace(/\\s+/g, '');
                                return t.includes('回列表') || 
                                       t.includes('回未投票') || 
                                       t.includes('回清單') || 
                                       t.includes('回查詢') || 
                                       t.includes('回股東會') || 
                                       t.includes('回上頁') || 
                                       t.includes('回前頁') || 
                                       t.includes('回上一頁') ||
                                       t.includes('回首頁');
                            });
                            if (backBtn) {
                                backBtn.click();
                                return true;
                            }
                            return false;
                        })()
                    `;
                    
                    try {
                        const clickedBack = await webContents.executeJavaScript(returnListScript);
                        if (!clickedBack) {
                            sendLog('[導航] 找不到回列表按鈕，嘗試使用回上一頁...');
                            await webContents.goBack();
                        }
                    } catch (e) {
                        sendLog(`[導航] 執行返回腳本失敗: ${e.message}，嘗試 goBack...`);
                        await webContents.goBack();
                    }
                    
                    await new Promise(r => setTimeout(r, 3000));
                }
            }
            
            // 6. Logout
            await logout.execute(webContents, sendLog);
            
            // 確保登出後的跳轉或 API 請求有時間完成，再進入下一個帳號 (回到初始狀態)
            await new Promise(r => setTimeout(r, 2000));
            
            // 強制導航回登入頁面，確保畫面回到初始狀態
            sendLog('導航回初始登入頁面...');
            await webContents.loadURL(CONSTANTS.URLS.LOGIN);
            await new Promise(r => setTimeout(r, 1000));

            sendLog(`[完畢] ${maskedId} 處理流程結束。`, 'info');

        } catch (error) {
            sendLog(`[全局錯誤] 處理 ${maskedId} 時發生異常: ${error.message}`, 'error');
        }
    }
}

module.exports = { run };

