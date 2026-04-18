/**
 * 登出自動化邏輯
 */

async function execute(webContents, sendLog) {
  sendLog('正在執行登出程序...');

  const safeExecute = async (script, timeout = 3000) => {
    try {
      const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeout));
      const execPromise = webContents.executeJavaScript(script);
      return await Promise.race([execPromise, timeoutPromise]);
    } catch (err) {
      return "ERROR: " + err.message;
    }
  };

  const logoutScript = `
    (() => {
      // 預防同步 alert 或 confirm 阻擋執行
      window.alert = () => { return true; };
      window.confirm = () => { return true; };

      // 特例檢查：如果已經是在「系統回覆訊息」頁面
      // 特徵：有 doProcess 按鈕，且頁面包含特定的表單或標題
      const doProcessBtn = document.querySelector('button[onclick*="doProcess()"]');
      const isSystemMessagePage = document.querySelector('.c-sysMsg_table') || document.body.innerHTML.includes('SYS_LOGOUT_SUCCESS');
      
      if (doProcessBtn && isSystemMessagePage) {
          // 直接點擊該按鈕
          setTimeout(() => doProcessBtn.click(), 50);
          return "SYS_MSG_CLICKED";
      }

      // 嘗試尋找 Logout 或 登出 按鈕
      let logoutBtn = document.querySelector('.c-header_logout') || 
                      document.querySelector('div[onclick*="logOff"]') ||
                      Array.from(document.querySelectorAll('a, button, div')).find(el => el.innerText.includes('Logout') || el.innerText.includes('登出'));
      
      if (!logoutBtn) {
        logoutBtn = document.querySelector('.c-header__logout') || 
                    document.querySelector('img[src*="logout"]') ||
                    document.querySelector('.fa-sign-out-alt');
      }

      if (logoutBtn) {
        // 使用 setTimeout 確保不會卡住當前的 executeJavaScript
        setTimeout(() => {
            try {
                logoutBtn.click();
            } catch(e) {}
            
            // 延遲 1 秒後處理第一層確認對話框
            setTimeout(() => {
                try {
                    const confirmBtn = document.getElementById('comfirmDialog_okBtn') || 
                                       Array.from(document.querySelectorAll('button, a')).find(el => 
                                         el.innerText === 'Confirm' || el.innerText === '確認' || el.innerText === '確定' || el.innerText.includes('OK')
                                       );
                    if (confirmBtn) {
                        confirmBtn.click();
                    }
                    if (typeof window.logOff === 'function') window.logOff();
                } catch(e) {}
            }, 1000);
            
        }, 50);
        
        return "LOGOUT_INITIATED";
      }
      
      // 若只有 doProcess 按鈕但沒有系統訊息特徵
      if (doProcessBtn) {
          setTimeout(() => doProcessBtn.click(), 50);
          return "SYS_MSG_CLICKED";
      }

      return "NOT_FOUND";
    })()
  `;

  const result = await safeExecute(logoutScript, 4000);
  
  if (result === "SYS_MSG_CLICKED") {
    sendLog('已在登出系統訊息頁面，已點擊最終確認按鈕。');
    await new Promise(r => setTimeout(r, 2000));
  } else if (result === "LOGOUT_INITIATED" || (typeof result === 'string' && result.includes("ERROR:"))) {
    sendLog('已觸發登出指令，等待跳轉...');
    await new Promise(r => setTimeout(r, 4000));
    
    // 跳轉後補刀
    const checkFinalScript = `
      (() => {
        const btn = document.querySelector('button[onclick*="doProcess()"]');
        if (btn) {
            setTimeout(() => btn.click(), 50);
            return true;
        }
        return false;
      })()
    `;
    const isFinalClicked = await safeExecute(checkFinalScript, 2000);
    if (isFinalClicked === true) {
        sendLog('已點擊最後的登出確認 (doProcess) 按鈕。');
        await new Promise(r => setTimeout(r, 2000));
    }
  } else if (result === "NOT_FOUND") {
    sendLog('找不到登出按鈕，可能已經登出。', 'info');
  } else {
    sendLog(`登出流程執行結果: ${result}`, 'warning');
  }
}

module.exports = { execute };
