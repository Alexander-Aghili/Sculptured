// The chooser page's only bridge to the app: report the choice; nothing else is exposed.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('sculptured', {
  defaultOrigin: process.env.SCULPTURED_ACCOUNT_ORIGIN || '',
  choose: (mode, origin) => ipcRenderer.invoke('sculptured:choose', { mode, origin }),
});
