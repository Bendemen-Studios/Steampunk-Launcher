const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const CONTENT_DIR = path.join(__dirname, "..", "content");
const ERAS_DIR = path.join(CONTENT_DIR, "eras");

function ensureContentLayout() {
  for (const era of ["steamy-times", "a-new-era"]) {
    for (const folder of ["mods", "config", "resourcepacks"]) {
      fs.mkdirSync(path.join(ERAS_DIR, era, folder), { recursive: true });
    }
    const manifest = path.join(ERAS_DIR, era, "modpack.json");
    if (!fs.existsSync(manifest)) {
      fs.writeFileSync(manifest, JSON.stringify({
        id: era,
        name: era === "steamy-times" ? "Steamy Times" : "A New Era",
        minecraftVersion: "",
        loader: "",
        version: "0.0.0"
      }, null, 2));
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: "#17110d",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  ensureContentLayout();

  ipcMain.handle("open-social", async (_, url) => {
    await shell.openExternal(url);
  });

  ipcMain.handle("get-era-manifest", async (_, era) => {
    const file = path.join(ERAS_DIR, era, "modpack.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  });

  ipcMain.handle("launch-minecraft", async (_, payload) => {
    // Launcher/runtime integration is intentionally isolated here.
    // The era-specific directory is passed through so each Era remains independent.
    const eraDir = path.join(ERAS_DIR, payload.era);
    return {
      ok: true,
      status: "ready",
      era: payload.era,
      eraDir
    };
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
