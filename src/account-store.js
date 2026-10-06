const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { app, safeStorage } = require("electron");
const { Microsoft } = require("minecraft-java-core");

const file = () => path.join(app.getPath("userData"), "accounts.dat");

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

function accountView(account, index) {
  return {
    id: account.id,
    name: account.name,
    uuid: account.uuid || null,
    index
  };
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
    auth
  };

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

module.exports = { login, listAccounts, getAccount, saveRefreshed, removeAccount };
