const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcherAPI", {
  openSocial: (url) => ipcRenderer.invoke("open-social", url),
  getSocialLinks: () => ipcRenderer.invoke("get-social-links"),
  getAffiliateBanners: () => ipcRenderer.invoke("get-affiliate-banners"),
  getEraManifest: (era) => ipcRenderer.invoke("get-era-manifest", era),
  getSettings: () => ipcRenderer.invoke("get-settings"),
  saveSettings: (settings) => ipcRenderer.invoke("save-settings", settings),
  getHardwareInfo: () => ipcRenderer.invoke("get-hardware-info"),
  repairEra: (era) => ipcRenderer.invoke("repair-era", era),
  cleanupEra: (era) => ipcRenderer.invoke("cleanup-era", era),
  getEraLogs: (era) => ipcRenderer.invoke("get-era-logs", era),
  getCrashReports: (era) => ipcRenderer.invoke("get-crash-reports", era),
  listAccounts: () => ipcRenderer.invoke("list-accounts"),
  loginAccount: () => ipcRenderer.invoke("login-account"),
  removeAccount: (id) => ipcRenderer.invoke("remove-account", id),
  getServerStatus: () => ipcRenderer.invoke("server-status"),
  launchMinecraft: (payload) => ipcRenderer.invoke("launch-minecraft", payload),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdate: (callback) => ipcRenderer.on("launcher-update", (_, data) => callback(data))
});
