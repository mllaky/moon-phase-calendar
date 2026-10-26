// Safely exposes two small actions from the desktop app to the widget page.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('moonWidget', {
  openCalendar: () => ipcRenderer.send('open-calendar'),
  showMenu: () => ipcRenderer.send('show-menu'),
});
