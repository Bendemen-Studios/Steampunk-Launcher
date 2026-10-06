const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcherAPI", {
  openSocial: (url) => ipcRenderer.invoke("open-social", url),
  getSocialLinks: () => ipcRenderer.invoke("get-social-links"),
  getAffiliateBanners: () => ipcRenderer.invoke("get-affiliate-banners"),
  getEraManifest: (era) => ipcRenderer.invoke("get-era-manifest", era),
  listAccounts: () => ipcRenderer.invoke("list-accounts"),
  loginAccount: () => ipcRenderer.invoke("login-account"),
  removeAccount: (id) => ipcRenderer.invoke("remove-account", id),
  getServerStatus: () => ipcRenderer.invoke("server-status"),
  launchMinecraft: (payload) => ipcRenderer.invoke("launch-minecraft", payload),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdate: (callback) => ipcRenderer.on("launcher-update", (_, data) => callback(data))
});
