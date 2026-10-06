const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");
const https = require("https");
const crypto = require("crypto");
const AdmZip = require("adm-zip");
const { getMinecraftServerStatus } = require("mc-server-util");
const { Launch } = require("minecraft-java-core");
const accounts = require("./account-store");

const ROOT = path.join(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content");
const ERAS_DIR = path.join(CONTENT_DIR, "eras");
const CONFIG_FILE = path.join(ROOT, "config", "launcher.json");
const SUPPORTED_ERAS = ["steamy-times", "a-new-era"];
const MODPACK_FOLDERS = ["mods", "config", "resourcepacks", "datapacks", "essential", "fancymenu_data", "shaderpacks"];
const REMOTE_MANIFEST_MAX_BYTES = 1024 * 1024;
const DOWNLOAD_CHUNK_BYTES = 1024 * 1024;
let mainWindow;
let updaterReady = false;

function readConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")); }
  catch { return { server: { host: "", port: 25565 }, social: {}, memory: { min: "2G", max: "6G" } }; }
}

function ensureContentLayout() {
  for (const era of SUPPORTED_ERAS) {
    for (const folder of MODPACK_FOLDERS) fs.mkdirSync(path.join(ERAS_DIR, era, folder), { recursive: true });
    const manifest = path.join(ERAS_DIR, era, "modpack.json");
    if (!fs.existsSync(manifest)) {
      fs.writeFileSync(manifest, JSON.stringify({
        id: era,
        name: era === "steamy-times" ? "Steamy Times" : "A New Era",
        minecraftVersion: "",
        loader: "",
        loaderBuild: "latest",
        version: "0.0.0",
        remoteManifestUrl: ""
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

function httpsGet(url, maxBytes = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "User-Agent": "Steampunk-SMP-Launcher" } }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(httpsGet(new URL(response.headers.location, url).toString(), maxBytes));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Download failed (HTTP ${response.statusCode}).`));
      }
      const chunks = [];
      let total = 0;
      response.on("data", chunk => {
        total += chunk.length;
        if (maxBytes && total > maxBytes) {
          request.destroy(new Error("Remote manifest is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(30000, () => request.destroy(new Error("Network timeout.")));
  });
}

async function fetchJson(url) {
  const buffer = await httpsGet(url, REMOTE_MANIFEST_MAX_BYTES);
  try { return JSON.parse(buffer.toString("utf8")); }
  catch { throw new Error("Remote Era manifest is invalid JSON."); }
}

function sha256File(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("data", chunk => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function downloadFile(url, destination, expectedSha256) {
  return new Promise((resolve, reject) => {
    const temp = destination + ".download";
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const start = fs.existsSync(temp) ? fs.statSync(temp).size : 0;
    const headers = { "User-Agent": "Steampunk-SMP-Launcher" };
    if (start > 0) headers.Range = `bytes=${start}-`;

    const request = https.get(url, { headers }, response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(downloadFile(new URL(response.headers.location, url).toString(), destination, expectedSha256));
      }

      const append = start > 0 && response.statusCode === 206;
      if (response.statusCode !== 200 && !append) {
        response.resume();
        return reject(new Error(`Modpack download failed (HTTP ${response.statusCode}).`));
      }

      const total = Number(response.headers["content-length"] || 0) + (append ? start : 0);
      const stream = fs.createWriteStream(temp, { flags: append ? "a" : "w" });
      let downloaded = append ? start : 0;

      response.on("data", chunk => {
        downloaded += chunk.length;
        const percent = total ? Math.min(99, Math.round(downloaded / total * 100)) : 0;
        sendUpdate("modpack-progress", { percent, downloaded, total });
      });
      response.pipe(stream);
      stream.on("finish", async () => {
        stream.close();
        try {
          if (expectedSha256) {
            const actual = await sha256File(temp);
            if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
              fs.rmSync(temp, { force: true });
              throw new Error("Modpack SHA-256 controle mislukt.");
            }
          }
          fs.renameSync(temp, destination);
          sendUpdate("modpack-progress", { percent: 100, downloaded: total, total });
          resolve();
        } catch (error) { reject(error); }
      });
      stream.on("error", reject);
    });
    request.on("error", reject);
    request.setTimeout(60000, () => request.destroy(new Error("Modpack download timeout.")));
  });
}

function safeExtract(zipPath, destination) {
  const zip = new AdmZip(zipPath);
  const root = path.resolve(destination) + path.sep;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const target = path.resolve(destination, entry.entryName);
    if (!target.startsWith(root)) throw new Error("Onveilige ZIP-inhoud geblokkeerd.");
  }
  zip.extractAllTo(destination, true);
}

async function installModpackArchive(era, archivePath, version) {
  const eraDir = path.join(ERAS_DIR, era);
  const extractDir = path.join(eraDir, ".update-extracted");
  fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  try {
    safeExtract(archivePath, extractDir);
    const candidates = fs.existsSync(path.join(extractDir, "mods")) ? extractDir :
      (fs.existsSync(path.join(extractDir, "overrides")) ? path.join(extractDir, "overrides") : extractDir);

    for (const folder of MODPACK_FOLDERS) {
      const source = path.join(candidates, folder);
      const target = path.join(eraDir, folder);
      if (fs.existsSync(source)) {
        fs.mkdirSync(target, { recursive: true });
        fs.cpSync(source, target, { recursive: true, force: true });
      }
    }

    fs.writeFileSync(path.join(eraDir, ".installed-version"), version, "utf8");
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

function readLocalManifest(era) {
  const file = path.join(ERAS_DIR, era, "modpack.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

async function resolveEra(era) {
  if (!SUPPORTED_ERAS.includes(era)) throw new Error("Invalid Era.");
  const local = readLocalManifest(era);
  if (!local.remoteManifestUrl) return local;
  try {
    const remote = await fetchJson(local.remoteManifestUrl);
    if (!remote || remote.id !== era || !remote.latestVersion || !remote.versions?.[remote.latestVersion]) {
      throw new Error("Remote Era manifest is incomplete.");
    }
    return { ...local, ...remote };
  } catch (error) {
    if (local.version && local.version !== "0.0.0") {
      sendUpdate("manifest-offline", { message: error.message });
      return local;
    }
    throw error;
  }
}

async function syncModpack(era, manifest) {
  const version = manifest.latestVersion || manifest.version;
  const versionInfo = manifest.versions?.[version];
  if (!version || !versionInfo?.url) return;

  const eraDir = path.join(ERAS_DIR, era);
  const stateFile = path.join(eraDir, ".installed-version");
  const installedVersion = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, "utf8").trim() : "";
  const archive = path.join(eraDir, ".downloads", `${version}.zip`);

  if (installedVersion === version && fs.existsSync(archive)) return;

  sendUpdate("modpack-start", { version, installedVersion });
  await downloadFile(versionInfo.url, archive, versionInfo.sha256 || null);
  await installModpackArchive(era, archive, version);
  sendUpdate("modpack-ready", { version });
}

async function resolveEraManifest(era) {
  if (!["steamy-times", "a-new-era"].includes(era)) throw new Error("Invalid Era.");
  const local = JSON.parse(fs.readFileSync(path.join(ERAS_DIR, era, "modpack.json"), "utf8"));
  if (!local.remoteManifestUrl) return local;
  try {
    const remote = await modpacks.fetchManifest(local.remoteManifestUrl);
    if (!remote || remote.id !== era || !remote.latestVersion || !remote.versions || !remote.versions[remote.latestVersion]) throw new Error("Remote Era manifest is incomplete.");
    return { ...local, ...remote };
  } catch (error) {
    if (local.version && local.version !== "0.0.0") return local;
    throw error;
  }
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

  ipcMain.handle("get-affiliate-banners", () => {
    const file = path.join(ROOT, "config", "affiliates.json");
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        enabled: data.enabled !== false,
        rotationSeconds: Math.max(5, Number(data.rotationSeconds) || 15),
        campaigns: Array.isArray(data.campaigns) ? data.campaigns.filter(c =>
          c && c.enabled !== false && typeof c.title === "string" && typeof c.url === "string"
        ) : []
      };
    } catch {
      return { enabled: false, rotationSeconds: 15, campaigns: [] };
    }
  });

  ipcMain.handle("get-era-manifest", async (_, era) => resolveEra(era));

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
    if (!SUPPORTED_ERAS.includes(payload.era)) throw new Error("Invalid Era.");
    const account = await accounts.getAccount(payload.accountId);
    await accounts.saveRefreshed(account);

    const manifest = await resolveEra(payload.era);
    if (!manifest.minecraftVersion) throw new Error("Deze Era heeft nog geen Minecraft-versie ingesteld.");
    if (manifest.loader && !manifest.loaderBuild) throw new Error("Deze Era heeft geen loader build ingesteld.");

    await syncModpack(payload.era, manifest);

    const gamePath = path.join(app.getPath("userData"), "minecraft", "instances", payload.era);
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
      detached: false,
      instance: payload.era
    };

    if (manifest.loader) {
      options.loader = {
        type: manifest.loader,
        build: manifest.loaderBuild || "latest",
        enable: true
      };
    }

    await launcher.launch(options);
    return { ok: true, version: manifest.latestVersion || manifest.version };
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
