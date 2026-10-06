const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app, safeStorage } = require("electron");
const { Microsoft } = require("minecraft-java-core");

const file = () => path.join(app.getPath("userData"), "accounts.dat");
const eraFile = () => path.join(app.getPath("userData"), "era-accounts.json");

function readAccounts() {
  try {
    if (!fs.existsSync(file())) return [];
    const raw = fs.readFileSync(file());
    const json = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString("utf8");
    return JSON.parse(json);
  } catch {
    return [];
  }
}

function writeAccounts(accounts) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  const json = JSON.stringify(accounts);
  const out = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, "utf8");
  fs.writeFileSync(file(), out);
}

function readEraAccounts() {
  try {
    if (!fs.existsSync(eraFile())) return {};
    return JSON.parse(fs.readFileSync(eraFile(), "utf8"));
  } catch {
    return {};
  }
}

function writeEraAccounts(data) {
  fs.mkdirSync(path.dirname(eraFile()), { recursive: true });
  fs.writeFileSync(eraFile(), JSON.stringify(data, null, 2), "utf8");
}

function accountView(account, index) {
  return {
    id: account.id,
    name: account.name,
    uuid: account.uuid || null,
    avatarUrl: account.avatarUrl || null,
    skinUrl: account.skinUrl || null,
    index
  };
}

async function enrichProfile(account) {
  if (!account?.auth?.access_token || !account.uuid) return account;
  try {
    const https = require("https");
    const profile = await new Promise((resolve, reject) => {
      const request = https.get("https://api.minecraftservices.com/minecraft/profile", {
        headers: {
          Authorization: "Bearer " + account.auth.access_token,
          "User-Agent": "Steampunk-SMP-Launcher"
        }
      }, response => {
        const chunks = [];
        response.on("data", chunk => chunks.push(chunk));
        response.on("end", () => {
          if (response.statusCode !== 200) return reject(new Error("Profile request failed."));
          try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
          catch { reject(new Error("Invalid Minecraft profile response.")); }
        });
      });
      request.on("error", reject);
      request.setTimeout(15000, () => request.destroy(new Error("Profile request timeout.")));
    });
    account.uuid = profile.id || account.uuid;
    account.name = profile.name || account.name;
    const activeSkin = Array.isArray(profile.skins) ? profile.skins.find(skin => skin.state === "ACTIVE") || profile.skins[0] : null;
    account.skinUrl = activeSkin?.url || account.skinUrl || null;
    account.avatarUrl = account.uuid ? "https://mc-heads.net/avatar/" + account.uuid + "/64" : null;
  } catch {}
  return account;
}

async function login() {
  const microsoft = new Microsoft();
  const auth = await microsoft.getAuth();

  if (!auth || auth.error) {
    throw new Error(auth?.errorMessage || auth?.error || "Microsoft login failed.");
  }

  const name = auth.name || auth.username || "Minecraft Account";
  const uuid = auth.uuid || auth.id || crypto.createHash("sha256").update(name).digest("hex").slice(0, 32);
  const account = {
    id: crypto.randomUUID(),
    name,
    uuid,
    auth,
    avatarUrl: null,
    skinUrl: null
  };
  await enrichProfile(account);

  const accounts = readAccounts();
  accounts.push(account);
  writeAccounts(accounts);

  return accountView(account, accounts.length - 1);
}

async function refreshAccount(account) {
  if (!account?.auth?.refresh_token) return account;
  const microsoft = new Microsoft();
  const refreshed = await microsoft.refresh(account.auth);
  if (!refreshed || refreshed.error) {
    throw new Error(refreshed?.errorMessage || refreshed?.error || "Microsoft token refresh failed.");
  }
  account.auth = refreshed;
  await enrichProfile(account);
  return account;
}

async function getAccount(id) {
  const accounts = readAccounts();
  const account = accounts.find(a => a.id === id);
  if (!account) throw new Error("Minecraft account not found.");
  return refreshAccount(account);
}

async function listAccounts() {
  const accounts = readAccounts();
  return accounts.map(accountView);
}

async function removeAccount(id) {
  const accounts = readAccounts().filter(a => a.id !== id);
  writeAccounts(accounts);
  return accounts.map(accountView);
}

async function saveRefreshed(account) {
  const accounts = readAccounts();
  const index = accounts.findIndex(a => a.id === account.id);
  if (index >= 0) {
    accounts[index] = account;
    writeAccounts(accounts);
  }
}

function getEraAccount(era) {
  const data = readEraAccounts();
  return typeof data[era] === "string" ? data[era] : null;
}

function setEraAccount(era, id) {
  const data = readEraAccounts();
  if (id) data[era] = id;
  else delete data[era];
  writeEraAccounts(data);
  return data[era] || null;
}

module.exports = { login, listAccounts, getAccount, saveRefreshed, removeAccount, getEraAccount, setEraAccount };
