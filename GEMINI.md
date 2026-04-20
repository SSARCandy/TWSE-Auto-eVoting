# TWSE eVoting Auto Project

## What Is
Electron desktop app. Automate TDCC e-Voting. Login with ID. Find pending/voted company. Vote agree/against/abstain. Take screenshot proof. Logout safe.

### Architecture
- **Main (`main.js`)**: Manage window. Set `BrowserView`. Handle IPC.
- **Preload (`preload.js`)**: Secure bridge renderer ↔ main (`contextBridge`).
- **Renderer (`src/renderer/`)**: UI. HTML, Vanilla CSS, JS. No big framework.
- **Auto Engine (`src/automation/`)**: Interact with TDCC.
  - `main_flow.js`: Control flow. Clear session. Respect TDCC maintenance time (00:00 - 07:00 UTC+8).
  - `login.js`: Auto login. Select cert. Handle native dialogs.
  - `voting.js`: Scrape target companies. Navigate vote form. Submit vote.
  - `screenshot.js`: Capture full-page proof. Save local.
  - `logout.js`: Find logout button. Click confirm. End session.
  - `utils.js`: Reusable tools. `delay`, `randomDelay`, `safeExecute` (timeout prevent hang), `waitForNavigation`.

## Run App
Use Node + Electron.
1. Install: `npm install`
2. Dev run: `npm start` or `npm run dev`

## Dev Rules
- **Clean + Mod**: Small helper functions. JSDoc them.
- **Variables**: `const` mostly. `let` only if mutate.
- **Early Return**: Avoid deep `if/else`. Bail early if DOM missing.
- **Fast**: No long fixed `delay()`. Use `waitForNavigation`, `safeExecute`, active polling. `some()`, `find()` for text match.
- **Module**: CommonJS (`require`/`module.exports`).
- **DOM**: Execute via `webContents.executeJavaScript`.
- **Async**: `async/await`. Polling wait for dynamic element.
- **Block Dialogs**: `window.alert` block JS thread. Override them first in injected script.
- **No Crash**: `try/catch` automation steps. `sendLog` error to UI. Move to next account.
- **Config**: Put URL in `src/constants.js`.
- **UI**: Vanilla JS/CSS. No Tailwind.
- **Style**: ESLint enforce `comma-dangle` object multiline.

## Use
AI read this. Keep auto engine robust. DOM parsing break if site change. Time async careful.
