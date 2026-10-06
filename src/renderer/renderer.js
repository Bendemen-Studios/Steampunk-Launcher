const $ = id => document.getElementById(id);

const i18n = {
  nl: { updateTitle:"Launcher bijwerken", checking:"Controleren op updates...", loading:"Launcher voorbereiden...", done:"Klaar", current:"Je gebruikt de nieuwste versie.", available:"Nieuwe launcher gevonden", downloaded:"Update klaar om te installeren", heroTitle:"Kies jouw Era", heroText:"Elke Era heeft zijn eigen avontuur, modpack en configuratie.", launch:"▶ Minecraft starten", noAccount:"Geen account geselecteerd", server:"Controleren...", online:"Online", offline:"Offline", notConfigured:"Server nog niet ingesteld", players:n=>"spelers online", login:"Inloggen..." },
  en: { updateTitle:"Updating launcher", checking:"Checking for updates...", loading:"Preparing launcher...", done:"Ready", current:"You are using the latest version.", available:"New launcher version found", downloaded:"Update ready to install", heroTitle:"Choose your Era", heroText:"Each Era has its own adventure, modpack and configuration.", launch:"▶ Launch Minecraft", noAccount:"No account selected", server:"Checking...", online:"Online", offline:"Offline", notConfigured:"Server not configured yet", players:n=>"players online", login:"Signing in..." }
};

let language = "nl";
let selectedEra = "steamy-times";
let selectedAccountId = null;
let accountsList = [];

function setLanguage(next) {
  language = next;
  const t = i18n[language];
  $("updateTitle").textContent = t.updateTitle;
  $("heroTitle").textContent = t.heroTitle;
  $("heroText").textContent = t.heroText;
  $("launchButton").textContent = t.launch;
  if (!selectedAccountId) $("profileName").textContent = t.noAccount;
}

function progress(value, label) {
  $("progressBar").style.width = value + "%";
  $("progressPercent").textContent = value + "%";
  $("progressLabel").textContent = label;
}

function showMain() {
  $("updateScreen").classList.add("hidden");
  $("mainScreen").classList.remove("hidden");
}

async function startup() {
  progress(20, i18n[language].checking);
  await new Promise(r => setTimeout(r, 250));
  progress(60, i18n[language].loading);
  await new Promise(r => setTimeout(r, 250));
  progress(100, i18n[language].done);
  await new Promise(r => setTimeout(r, 350));
  await loadAccounts();
  await loadEra();
  await loadServerStatus();
  await loadSocial();
  showMain();
}

async function loadAccounts() {
  accountsList = await window.launcherAPI.listAccounts();
  if (!accountsList.length) return;
  selectedAccountId = accountsList[0].id;
  renderAccount();
}

function renderAccount() {
  const account = accountsList.find(a => a.id === selectedAccountId);
  if (!account) {
    $("profileName").textContent = i18n[language].noAccount;
    $("profileAvatar").textContent = "?";
    return;
  }
  $("profileName").textContent = account.name;
  $("profileAvatar").textContent = account.name.charAt(0).toUpperCase();
}

async function loadEra() {
  selectedEra = $("eraChooser").value;
  const manifest = await window.launcherAPI.getEraManifest(selectedEra);
  $("modpackVersion").textContent = manifest?.version && manifest.version !== "0.0.0" ? manifest.version : "Nog niet geïnstalleerd";
  $("minecraftVersion").textContent = manifest?.minecraftVersion || "Wordt later ingesteld";
}

async function loadServerStatus() {
  const status = await window.launcherAPI.getServerStatus();
  const t = i18n[language];
  $("serverState").textContent = !status.configured ? t.notConfigured : status.online ? t.online : t.offline;
  $("serverPlayers").textContent = status.online ? `${status.players.online}/${status.players.max} ${t.players(status.players.online)}` : "Minecraft server";
  $("serverDot").style.background = status.online ? "#63bd68" : "#a34d38";
}

async function loadSocial() {
  const links = await window.launcherAPI.getSocialLinks();
  for (const [id, key] of [["discord","discord"],["instagram","instagram"],["whatsapp","whatsapp"]]) {
    if (links[key]) $(id).onclick = () => window.launcherAPI.openSocial(links[key]);
  }
}

$("language").addEventListener("change", e => setLanguage(e.target.value));
$("eraChooser").addEventListener("change", loadEra);

$("loginAccount").addEventListener("click", async () => {
  $("loginAccount").disabled = true;
  $("loginAccount").textContent = i18n[language].login;
  try {
    const account = await window.launcherAPI.loginAccount();
    accountsList.push(account);
    selectedAccountId = account.id;
    renderAccount();
  } catch (error) {
    $("launchStatus").textContent = error.message || "Microsoft login failed.";
  } finally {
    $("loginAccount").disabled = false;
    $("loginAccount").textContent = "+ Microsoft-account toevoegen";
  }
});

$("switchProfile").addEventListener("click", () => {
  if (!accountsList.length) return;
  const current = accountsList.findIndex(a => a.id === selectedAccountId);
  selectedAccountId = accountsList[(current + 1) % accountsList.length].id;
  renderAccount();
});

$("removeAccount").addEventListener("click", async () => {
  if (!selectedAccountId) return;
  accountsList = await window.launcherAPI.removeAccount(selectedAccountId);
  selectedAccountId = accountsList[0]?.id || null;
  renderAccount();
});

$("launchButton").addEventListener("click", async () => {
  if (!selectedAccountId) {
    $("launchStatus").textContent = language === "nl" ? "Log eerst in met een Microsoft-account." : "Sign in with a Microsoft account first.";
    return;
  }
  $("launchButton").disabled = true;
  $("launchStatus").textContent = language === "nl" ? "Minecraft wordt voorbereid..." : "Preparing Minecraft...";
  try {
    await window.launcherAPI.launchMinecraft({ era:selectedEra, accountId:selectedAccountId });
    $("launchStatus").textContent = language === "nl" ? "Minecraft is gestart." : "Minecraft has started.";
  } catch (error) {
    $("launchStatus").textContent = error.message || "Minecraft launch failed.";
  } finally {
    $("launchButton").disabled = false;
  }
});

window.launcherAPI.onUpdate(data => {
  if (data.event === "checking") progress(10, i18n[language].checking);
  if (data.event === "available") {
    progress(25, `${i18n[language].available}: v${data.version}`);
  }
  if (data.event === "progress") progress(Math.max(25, data.percent), `${i18n[language].loading} ${data.percent}%`);
  if (data.event === "current") progress(100, i18n[language].current);
  if (data.event === "downloaded") {
    progress(100, i18n[language].downloaded);
    $("updateInstall").classList.remove("hidden");
  }
  if (data.event === "error") progress(100, i18n[language].done);
});

$("updateInstall").addEventListener("click", () => window.launcherAPI.installUpdate());

setLanguage("nl");
startup();
