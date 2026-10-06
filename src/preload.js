const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcherAPI", {
  openSocial: (url) => ipcRenderer.invoke("open-social", url),
  getEraManifest: (era) => ipcRenderer.invoke("get-era-manifest", era),
  launchMinecraft: (payload) => ipcRenderer.invoke("launch-minecraft", payload)
});
