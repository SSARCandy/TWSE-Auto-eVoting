# CLAUDE.md - TWSE eVoting Project

Taiwan Shareholder Voting Automation system using Electron.

## Build and Run Commands

### Development
- `npm start`: Launch the Electron application.
- `npm run dev`: Launch the Electron application (alias for start).

### Dependencies
- `npm install`: Install required dependencies (Electron).

## Coding Guidelines

### Architecture
- **Main Process**: `main.js` handles window management, BrowserView setup, and IPC. Loads `src/constants.js` for URL constants.
- **Preload**: `preload.js` bridges Electron IPC to the renderer securely via `contextBridge`.
- **Renderer**: `src/renderer/` contains HTML/CSS/JS for the UI.
- **Automation**: `src/automation/` contains the logic for site interaction, login, logout, screenshot, and voting flows.

### Code Style & Structure
- **JavaScript**: CommonJS (`require`/`module.exports`) is used for the main process and automation logic.
- **Indentation**: Consistent indentation across the project. 
- **Naming**: `camelCase` for variables and functions. `UPPER_SNAKE_CASE` for constants.
- **Constants**: Shared configurations (like target URLs) are maintained in `src/constants.js`.
- **Error Handling**: Use `try/catch` blocks for automation flows and IPC handlers. Log errors via `sendLog`.
- **Communication**: Use `ipcMain.handle` / `ipcRenderer.invoke` (via preload) for main-renderer communication.
- **DOM Interaction**: `webContents.executeJavaScript` is the primary method for DOM querying and manipulation.

### Automation Workflows
- **Login (`login.js`)**: Auto-fills national ID, selects certificate type, handles "duplicate login" modals.
- **Voting (`voting.js`)**: Scrapes target companies, clicks voting links, handles voting preference (agree, against, abstained, random), submits votes.
- **Screenshot (`screenshot.js`)**: Uses `webContents.capturePage` with precise DOM rects to capture voting proof. Saved to user-defined `outputDir` or `Documents/投票證明`.
- **Logout (`logout.js`)**: Auto-clicks logout elements and handles sweetalert prompts.
- **Main Flow (`main_flow.js`)**: Orchestrates the above, handles session isolation (`session.clearStorageData()`), and respects Taiwan specific rules (e.g. 00:00-07:00 maintenance skip).

### UI & Styling
- Pure HTML and Vanilla CSS in `src/renderer`.
- Modern CSS variables for styling.
- Responsive layout with a fixed sidebar (400px) and a dynamic `BrowserView` for the target website.
