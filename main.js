// Moon Phase desktop widget for macOS and Windows (Electron).
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, shell, nativeImage, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

const WIDGET_W = 300;
const WIDGET_H = 380;
const isMac = process.platform === 'darwin';

let widget = null;
let calendar = null;
let tray = null;

// ---------- Saved settings (position, keep on top) ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function saveSettings(patch) {
  const next = { ...loadSettings(), ...patch };
  try { fs.writeFileSync(settingsFile(), JSON.stringify(next, null, 2)); } catch { /* ignore */ }
  return next;
}

// Make sure a saved position is still on a connected screen
function isOnScreen(x, y) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    x >= a.x && y >= a.y && x + WIDGET_W <= a.x + a.width && y + WIDGET_H <= a.y + a.height);
}
function defaultPosition() {
  const a = screen.getPrimaryDisplay().workArea;
  return { x: a.x + a.width - WIDGET_W - 24, y: a.y + 24 };   // top-right corner
}

// ---------- Windows ----------
function createWidget() {
  const s = loadSettings();
  const pos = (s.x !== undefined && isOnScreen(s.x, s.y)) ? { x: s.x, y: s.y } : defaultPosition();

  widget = new BrowserWindow({
    width: WIDGET_W,
    height: WIDGET_H,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: true,
    alwaysOnTop: !!s.keepOnTop,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isMac) widget.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  widget.loadFile(path.join(__dirname, 'widget.html'));
  widget.once('ready-to-show', () => widget.showInactive());

  // Remember where the user drags it
  widget.on('moved', () => {
    const [x, y] = widget.getPosition();
    saveSettings({ x, y });
  });
  widget.on('closed', () => { widget = null; });
}

function openCalendar() {
  if (calendar) { calendar.show(); calendar.focus(); return; }
  calendar = new BrowserWindow({
    width: 900,
    height: 860,
    minWidth: 380,
    minHeight: 500,
    title: 'Moon Phase Calendar',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  calendar.loadFile(path.join(__dirname, 'index.html'));
  // Links (like the GitHub one) open in the normal browser
  calendar.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  calendar.on('closed', () => { calendar = null; });
}

// ---------- Menu (tray icon + right-click on widget) ----------
function buildMenu() {
  const s = loadSettings();
  const login = app.getLoginItemSettings().openAtLogin;
  return Menu.buildFromTemplate([
    { label: 'Show widget', click: () => { if (!widget) createWidget(); else widget.show(); } },
    { label: 'Open calendar', click: openCalendar },
    { type: 'separator' },
    {
      label: 'Keep on top of other windows', type: 'checkbox', checked: !!s.keepOnTop,
      click: (item) => { saveSettings({ keepOnTop: item.checked }); if (widget) widget.setAlwaysOnTop(item.checked); },
    },
    {
      label: 'Start when computer starts', type: 'checkbox', checked: login,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    {
      label: 'Reset position', click: () => {
        const p = defaultPosition();
        if (widget) widget.setPosition(p.x, p.y);
        saveSettings(p);
      },
    },
    { type: 'separator' },
    { label: 'Quit Moon Phase', click: () => app.quit() },
  ]);
}

function createTray() {
  const file = isMac ? 'trayTemplate.png' : 'tray.png';
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', file));
  tray = new Tray(icon);
  tray.setToolTip('Moon Phase');
  tray.on('click', () => tray.popUpContextMenu(buildMenu()));
  tray.on('right-click', () => tray.popUpContextMenu(buildMenu()));
}

ipcMain.on('open-calendar', openCalendar);
ipcMain.on('show-menu', () => { if (widget) buildMenu().popup({ window: widget }); });

// ---------- App lifecycle ----------
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (widget) widget.show(); else createWidget(); });

  app.whenReady().then(() => {
    if (isMac && app.dock) app.dock.hide();   // widget only, no Dock icon
    // First launch: start with the computer by default
    const s = loadSettings();
    if (!s.initialized) {
      app.setLoginItemSettings({ openAtLogin: true });
      saveSettings({ initialized: true });
    }
    createTray();
    createWidget();

    // When the computer wakes up or is unlocked, redraw with the current date and time zone
    const refresh = () => { if (widget) widget.webContents.reload(); };
    powerMonitor.on('resume', refresh);
    powerMonitor.on('unlock-screen', refresh);
  });

  // Keep running in the tray when windows are closed
  app.on('window-all-closed', () => {});
}
