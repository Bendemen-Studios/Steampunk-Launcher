const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const { getMinecraftServerStatus } = require("mc-server-util");
const { Launch } = require("minecraft-java-core");
const accounts = require("./account-store");

const ROOT = path.join(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content");
const ERAS_DIR = path.join(CONTENT_DIR, "eras");
const CONFIG_FILE = path.join(ROOT, "config", "launcher.json");
let mainWindow;
let updaterReady = false;

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return { server: { host: "", port: 25565 }, social: {}, memory: { min: "2G", max: "6G" } }; }
}

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
        loaderBuild: "latest",
        version: "0.0.0"
      }, null, 2));
    }
  }
}

function sendUpdate(event, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("launcher-update", { event, ...data });
}

function configureUpdater() {
  if (process.env.NODE_ENV === "development" || !app.isPackaged) {
    sendUpdate("dev");
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("checking-for-update", () => sendUpdate("checking"));
  autoUpdater.on("update-available", info => sendUpdate("available", { version: info.version }));
  autoUpdater.on("download-progress", progress => sendUpdate("progress", { percent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", info => {
    updaterReady = true;
    sendUpdate("downloaded", { version: info.version });
  });
  autoUpdater.on("update-not-available", () => sendUpdate("current"));
  autoUpdater.on("error", error => sendUpdate("error", { message: error.message }));
  autoUpdater.checkForUpdates().catch(error => sendUpdate("error", { message: error.message }));
}

async function syncModpack(era) {
  const eraDir = path.join(ERAS_DIR, era);
  const zip = path.join(eraDir, "modpack.zip");
  if (!fs.existsSync(zip)) return;

  const marker = path.join(eraDir, ".modpack-installed");
  const stat = fs.statSync(zip);
  const fingerprint = stat.size + ":" + stat.mtimeMs;
  if (fs.existsSync(marker) && fs.readFileSync(marker, "utf8") === fingerprint) return;

  const extractDir = path.join(eraDir, ".extracted");
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  new AdmZip(zip).extractAllTo(extractDir, true);

  const candidates = fs.existsSync(path.join(extractDir, "mods")) ? extractDir :
    (fs.existsSync(path.join(extractDir, "overrides")) ? path.join(extractDir, "overrides") : extractDir);

  for (const folder of ["mods", "config", "resourcepacks"]) {
    const source = path.join(candidates, folder);
    const target = path.join(eraDir, folder);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, target, { recursive: true, force: true });
  }
  fs.writeFileSync(marker, fingerprint);
  fs.rmSync(extractDir, { recursive: true, force: true });
}

function createWindow() {
  mainWindow = new BrowserWindow({
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
  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
  mainWindow.webContents.on("did-finish-load", () => configureUpdater());
}

app.whenReady().then(() => {
  ensureContentLayout();

  ipcMain.handle("open-social", async (_, url) => shell.openExternal(url));
  ipcMain.handle("get-social-links", () => readConfig().social || {});

  ipcMain.handle("get-era-manifest", async (_, era) => {
    if (!["steamy-times", "a-new-era"].includes(era)) throw new Error("Invalid Era.");
    const file = path.join(ERAS_DIR, era, "modpack.json");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  });

  ipcMain.handle("list-accounts", () => accounts.listAccounts());
  ipcMain.handle("login-account", async () => accounts.login());
  ipcMain.handle("remove-account", async (_, id) => accounts.removeAccount(id));

  ipcMain.handle("server-status", async () => {
    const { host, port } = readConfig().server || {};
    if (!host || host.includes("YOURSERVER")) return { online: false, configured: false };
    try {
      const status = await getMinecraftServerStatus(host, port || 25565);
      return {
        online: true,
        configured: true,
        players: status.players,
        version: status.version,
        description: status.description
      };
    } catch {
      return { online: false, configured: true };
    }
  });

  ipcMain.handle("launch-minecraft", async (_, payload) => {
    if (!["steamy-times", "a-new-era"].includes(payload.era)) throw new Error("Invalid Era.");
    const account = await accounts.getAccount(payload.accountId);
    await accounts.saveRefreshed(account);

    const manifestPath = path.join(ERAS_DIR, payload.era, "modpack.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (!manifest.minecraftVersion) throw new Error("Deze Era heeft nog geen Minecraft-versie ingesteld.");

    await syncModpack(payload.era);

    const gamePath = path.join(app.getPath("userData"), "minecraft", payload.era);
    fs.mkdirSync(gamePath, { recursive: true });

    const launcher = new Launch();
    launcher.on("progress", (progress, size) => {
      if (size > 0) sendUpdate("minecraft-progress", { percent: Math.round(progress / size * 100) });
    });
    launcher.on("data", line => sendUpdate("minecraft-log", { line: String(line) }));
    launcher.on("error", error => sendUpdate("minecraft-error", { message: String(error) }));

    const options = {
      path: gamePath,
      authenticator: account.auth,
      version: manifest.minecraftVersion,
      memory: readConfig().memory || { min: "2G", max: "6G" },
      detached: false
    };

    if (manifest.loader) {
      options.loader = {
        type: manifest.loader,
        build: manifest.loaderBuild || "latest",
        enable: true
      };
    }

    await launcher.launch(options);
    return { ok: true };
  });

  ipcMain.handle("install-update", () => {
    if (!updaterReady) return false;
    autoUpdater.quitAndInstall();
    return true;
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
