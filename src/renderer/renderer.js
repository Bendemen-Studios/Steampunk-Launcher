const $ = id => document.getElementById(id);

const i18n = {
  nl: {
    updateTitle:"Launcher bijwerken", checking:"Controleren op updates...", loading:"Launcher voorbereiden...",
    done:"Klaar", current:"Je gebruikt de nieuwste versie.", available:"Nieuwe launcher gevonden",
    downloaded:"Update klaar om te installeren", heroTitle:"Kies jouw Era",
    heroText:"Elke Era heeft zijn eigen avontuur, modpack en configuratie.", launch:"▶ Minecraft starten",
    noAccount:"Geen account geselecteerd", server:"Controleren...", online:"Online", offline:"Offline",
    notConfigured:"Server nog niet ingesteld", players:n=>"spelers online", login:"Inloggen...",
    modpackChecking:"Modpack controleren...", modpackDownloading:"Modpack downloaden...",
    modpackInstalling:"Modpack installeren...", modpackReady:"Modpack klaar",
    updateAvailable:"Update beschikbaar", upToDate:"Up-to-date", checkingModpack:"Modpack controleren...",
    repairChecking:"Repair Center controleert...", repairReady:"Controle voltooid", repairDone:"Modpack hersteld",
    retrying:"Download opnieuw proberen"
  },
  en: {
    updateTitle:"Updating launcher", checking:"Checking for updates...", loading:"Preparing launcher...",
    done:"Ready", current:"You are using the latest version.", available:"New launcher version found",
    downloaded:"Update ready to install", heroTitle:"Choose your Era",
    heroText:"Each Era has its own adventure, modpack and configuration.", launch:"▶ Launch Minecraft",
    noAccount:"No account selected", server:"Checking...", online:"Online", offline:"Offline",
    notConfigured:"Server not configured yet", players:n=>"players online", login:"Signing in...",
    modpackChecking:"Checking modpack...", modpackDownloading:"Downloading modpack...",
    modpackInstalling:"Installing modpack...", modpackReady:"Modpack ready",
    updateAvailable:"Update available", upToDate:"Up to date", checkingModpack:"Checking modpack...",
    repairChecking:"Repair Center checking...", repairReady:"Check completed", repairDone:"Modpack repaired",
    retrying:"Retrying download"
  }
};

let language = "nl";
let selectedEra = "steamy-times";
let selectedAccountId = null;
let accountsList = [];
let affiliateState = { campaigns: [], index: 0, timer: null, currentUrl: null };
let updaterResolved = false;
let updaterResolve;
const updaterReadyPromise = new Promise(resolve => { updaterResolve = resolve; });

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
  progress(8, i18n[language].checking);
  await updaterReadyPromise;
  if (!updaterResolved) return;
  progress(100, i18n[language].done);
  await new Promise(r => setTimeout(r, 350));
  await loadAccounts();
  await loadEra();
  await loadServerStatus();
  await loadTools();
  await loadSocial();
  await loadAffiliates();
  showMain();
}

async function loadAccounts() {
  accountsList = await window.launcherAPI.listAccounts();
  if (!accountsList.length) {
    selectedAccountId = null;
    renderAccount();
    return;
  }
  const remembered = await window.launcherAPI.getEraAccount(selectedEra);
  selectedAccountId = accountsList.some(a => a.id === remembered) ? remembered : accountsList[0].id;
  await window.launcherAPI.setEraAccount(selectedEra, selectedAccountId);
  renderAccount();
}

function renderAccount() {
  const account = accountsList.find(a => a.id === selectedAccountId);
  if (!account) {
    $("profileName").textContent = i18n[language].noAccount;
    $("profileAvatar").removeAttribute("src");
    $("profileAvatar").classList.add("avatar-fallback");
    $("profileAvatar").alt = "";
    return;
  }
  $("profileName").textContent = account.name;
  $("profileAvatar").classList.remove("avatar-fallback");
  $("profileAvatar").src = account.avatarUrl || account.skinUrl || "";
  $("profileAvatar").alt = account.name + " Minecraft skin";
  if (!account.avatarUrl && !account.skinUrl) {
    $("profileAvatar").classList.add("avatar-fallback");
    $("profileAvatar").alt = "";
  }
  $("profileAvatar").onerror = () => {
    $("profileAvatar").removeAttribute("src");
    $("profileAvatar").classList.add("avatar-fallback");
  };
}

async function loadModpackUpdateInfo() {
  try {
    const info = await window.launcherAPI.getModpackUpdateInfo(selectedEra);
    if (!info.latestVersion) {
      $("updateInfo").textContent = "Deze Era heeft nog geen modpack.";
      return info;
    }
    const status = info.updateAvailable
      ? i18n[language].updateAvailable + ": " + info.latestVersion
      : i18n[language].upToDate + ": " + info.latestVersion;
    const files = info.fileCount ? ` • ${info.changedFiles} wijzigingen • ${info.addedFiles} nieuw • ${info.deletedFiles} verwijderd` : "";
    $("updateInfo").textContent = status + " • " + info.downloadSizeLabel + files;
    return info;
  } catch (error) {
    $("updateInfo").textContent = error.message || "Modpackstatus unavailable.";
    return null;
  }
}

async function loadRepairStatus() {
  try {
    const info = await window.launcherAPI.getRepairStatus(selectedEra);
    $("repairInstalled").textContent = info.installedVersion || "Niet geïnstalleerd";
    $("repairLatest").textContent = info.latestVersion || "—";
    $("repairArchive").textContent = info.archiveReady ? (info.archiveValid ? "OK" : "SHA fout") : "Ontbreekt";
    $("repairDisk").textContent = info.freeDiskLabel || "—";
    $("repairChanges").textContent = `${info.changedFiles || 0} gewijzigd • ${info.addedFiles || 0} nieuw • ${info.deletedFiles || 0} verwijderd`;
    $("repairBackups").textContent = info.backups?.length ? String(info.backups.length) : "Geen";
    return info;
  } catch (error) {
    $("maintenanceStatus").textContent = error.message || "Repair status unavailable.";
    return null;
  }
}

async function applyEraVisuals(era, animate = true) {
  const visuals = await window.launcherAPI.getEraVisuals(era);
  if (!visuals) return;
  const root = document.documentElement;
  const base = "../../content/eras/" + era + "/";
  const nextBackground = "url(" + JSON.stringify(base + visuals.background) + ")";
  const nextLogo = base + visuals.logo;
  if (animate) {
    $("eraTransitionLogo").src = nextLogo;
    $("eraTransition").classList.remove("hidden");
    $("eraTransition").classList.remove("era-enter");
    void $("eraTransition").offsetWidth;
    $("eraTransition").classList.add("era-enter");
    await new Promise(r => setTimeout(r, 420));
  }
  root.style.setProperty("--era-bg", nextBackground);
  root.style.setProperty("--era-accent", visuals.accent || "#c18a51");
  $("eraLogo").src = nextLogo;
  $("eraLogo").alt = visuals.id || era;
  $("eraTransition").classList.add("hidden");
}

async function loadEra() {
  selectedEra = $("eraChooser").value;
  await applyEraVisuals(selectedEra, false);
  try {
    const manifest = await window.launcherAPI.getEraManifest(selectedEra);
    const version = manifest?.latestVersion || manifest?.version;
    $("modpackVersion").textContent = version && version !== "0.0.0" ? version : "Nog niet geïnstalleerd";
    $("minecraftVersion").textContent = manifest?.minecraftVersion || "Wordt later ingesteld";
    $("launchStatus").textContent = manifest?.loader ? manifest.loader + " " + (manifest.loaderBuild || "latest") + " • Minecraft " + (manifest.minecraftVersion || "?") : "";
    $("launchStatus").textContent = manifest?.loader
      ? `${manifest.loader} ${manifest.loaderBuild || "latest"} • Minecraft ${manifest.minecraftVersion || "?"}`
      : "";
    await Promise.all([loadModpackUpdateInfo(), loadRepairStatus()]);
  } catch (error) {
    $("modpackVersion").textContent = "Manifest niet bereikbaar";
    $("minecraftVersion").textContent = "—";
    $("launchStatus").textContent = error.message || "Manifest unavailable.";
  }
}

async function loadTools() {
  try {
    const settings = await window.launcherAPI.getSettings();
    $("ramMin").value = settings.memory?.min || "2G";
    $("ramMax").value = settings.memory?.max || "6G";
    $("fpsLimit").value = settings.fps || 120;
    $("resolution").value = settings.resolution || "";
    $("javaVersion").value = settings.javaVersion || "";
    $("javaPath").value = settings.javaPath || "";
    $("javaArgs").value = settings.javaArgs || "";
    $("fullscreen").checked = !!settings.fullscreen;
    $("vsync").checked = settings.vsync !== false;

    const hw = await window.launcherAPI.getHardwareInfo();
    $("hardwareInfo").textContent = `${hw.cpu} • ${hw.cores} cores • ${hw.ramGB} GB RAM • ${hw.freeDiskGB} GB vrije schijfruimte${hw.gpu?.length ? " • " + hw.gpu[0] : ""}`;
    const logs = await window.launcherAPI.getEraLogs(selectedEra);
    const crashes = await window.launcherAPI.getCrashReports(selectedEra);
    $("logInfo").textContent = `${logs.length} recente logbestanden • ${crashes.length} crash reports`;
  } catch (error) {
    $("hardwareInfo").textContent = error.message || "Systeeminformatie niet beschikbaar.";
  }
}

async function loadServerStatus() {
  const status = await window.launcherAPI.getServerStatus();
  const t = i18n[language];
  $("serverState").textContent = !status.configured ? t.notConfigured : status.online ? t.online : t.offline;
  $("serverPlayers").textContent = status.online ? `${status.players.online}/${status.players.max} ${t.players(status.players.online)}` : "Minecraft server";
  $("serverDot").style.background = status.online ? "#63bd68" : "#a34d38";
}

async function loadAffiliates() {
  try {
    const data = await window.launcherAPI.getAffiliateBanners();
    if (!data?.enabled || !Array.isArray(data.campaigns) || !data.campaigns.length) return;
    affiliateState.campaigns = data.campaigns;
    affiliateState.index = 0;
    renderAffiliate();
    const rotationMs = Math.max(5000, Number(data.rotationSeconds || 15) * 1000);
    affiliateState.timer = setInterval(() => {
      affiliateState.index = (affiliateState.index + 1) % affiliateState.campaigns.length;
      renderAffiliate();
    }, rotationMs);
  } catch (error) {
    console.warn("Affiliate banners unavailable:", error);
  }
}

function renderAffiliate() {
  const campaign = affiliateState.campaigns[affiliateState.index];
  if (!campaign) return;
  affiliateState.currentUrl = campaign.url;
  $("affiliateLabel").textContent = campaign.label || "PARTNER";
  $("affiliateTitle").textContent = campaign.title;
  $("affiliateDescription").textContent = campaign.description || "";
  $("affiliateButton").textContent = campaign.button || "Bekijk aanbieding →";
  const image = $("affiliateImage");
  const fallback = $("affiliateFallback");
  if (campaign.image) {
    image.src = campaign.image;
    image.alt = campaign.alt || campaign.title;
    image.classList.remove("hidden");
    fallback.classList.add("hidden");
    image.onerror = () => { image.classList.add("hidden"); fallback.classList.remove("hidden"); };
  } else {
    image.removeAttribute("src");
    image.classList.add("hidden");
    fallback.classList.remove("hidden");
  }
  $("affiliateBanner").classList.remove("hidden");
}

async function openAffiliate() {
  if (affiliateState.currentUrl) await window.launcherAPI.openSocial(affiliateState.currentUrl);
}

async function loadSocial() {
  const links = await window.launcherAPI.getSocialLinks();
  for (const [id, key] of [["discord","discord"],["instagram","instagram"],["whatsapp","whatsapp"]]) {
    if (links[key]) $(id).onclick = () => window.launcherAPI.openSocial(links[key]);
  }
}

$("language").addEventListener("change", e => setLanguage(e.target.value));
$("eraChooser").addEventListener("change", async () => {
  selectedEra = $("eraChooser").value;
  await applyEraVisuals(selectedEra, true);
  await loadAccounts();
  await loadEra();
  await loadTools();
});

$("loginAccount").addEventListener("click", async () => {
  $("loginAccount").disabled = true;
  $("loginAccount").textContent = i18n[language].login;
  try {
    const account = await window.launcherAPI.loginAccount();
    accountsList.push(account);
    selectedAccountId = account.id;
    await window.launcherAPI.setEraAccount(selectedEra, selectedAccountId);
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
  window.launcherAPI.setEraAccount(selectedEra, selectedAccountId);
  renderAccount();
});

$("removeAccount").addEventListener("click", async () => {
  if (!selectedAccountId) return;
  accountsList = await window.launcherAPI.removeAccount(selectedAccountId);
  selectedAccountId = accountsList[0]?.id || null;
  await window.launcherAPI.setEraAccount(selectedEra, selectedAccountId);
  renderAccount();
});

$("launchButton").addEventListener("click", async () => {
  if (!selectedAccountId) {
    $("launchStatus").textContent = language === "nl" ? "Log eerst in met een Microsoft-account." : "Sign in with a Microsoft account first.";
    return;
  }
  $("launchButton").disabled = true;
  $("launchStatus").textContent = i18n[language].modpackChecking;
  try {
    await window.launcherAPI.setEraAccount(selectedEra, selectedAccountId);
    await window.launcherAPI.launchMinecraft({ era: selectedEra, accountId: selectedAccountId });
    $("launchStatus").textContent = i18n[language].modpackReady;
  } catch (error) {
    $("launchStatus").textContent = error.message || "Minecraft launch failed.";
  } finally {
    $("launchButton").disabled = false;
  }
});

window.launcherAPI.onUpdate(data => {
  if (["dev","current","error"].includes(data.event)) {
    updaterResolved = true;
    updaterResolve();
  }
  if (data.event === "checking") progress(10, i18n[language].checking);
  if (data.event === "available") progress(25, `${i18n[language].available}: v${data.version}`);
  if (data.event === "progress") progress(Math.max(25, data.percent), `${i18n[language].loading} ${data.percent}%`);
  if (data.event === "current") progress(100, i18n[language].current);
  if (data.event === "downloaded") {
    updaterResolved = true;
    updaterResolve();
    progress(100, i18n[language].downloaded);
    $("updateInstall").classList.remove("hidden");
  }
  if (data.event === "error") progress(100, i18n[language].done);
  if (data.event === "modpack-retry") $("launchStatus").textContent = i18n[language].retrying + " (" + data.attempt + "/" + data.attempts + ")";
  if (data.event === "modpack-start") $("launchStatus").textContent = "Modpack voorbereiden: " + data.version;
  if (data.event === "modpack-progress") $("launchStatus").textContent = "Modpack downloaden: " + data.percent + "%";
  if (data.event === "modpack-ready") $("launchStatus").textContent = "Modpack klaar: " + data.version;
  if (data.event === "modpack-start") $("launchStatus").textContent = `${i18n[language].modpackDownloading} ${data.version}`;
  if (data.event === "modpack-progress") $("launchStatus").textContent = `${i18n[language].modpackDownloading} ${data.percent}%`;
  if (data.event === "modpack-ready") $("launchStatus").textContent = `${i18n[language].modpackReady}: ${data.version}`;
});


$("checkModpack").addEventListener("click", async () => {
  $("checkModpack").disabled = true;
  $("updateInfo").textContent = i18n[language].checkingModpack;
  try { await loadModpackUpdateInfo(); await loadRepairStatus(); }
  finally { $("checkModpack").disabled = false; }
});

$("checkRepair").addEventListener("click", async () => {
  $("checkRepair").disabled = true;
  $("maintenanceStatus").textContent = i18n[language].repairChecking;
  try {
    await loadRepairStatus();
    $("maintenanceStatus").textContent = i18n[language].repairReady;
  } finally { $("checkRepair").disabled = false; }
});

$("saveSettings").addEventListener("click", async () => {
  const settings = {
    memory: { min: $("ramMin").value.trim() || "2G", max: $("ramMax").value.trim() || "6G" },
    fps: Math.max(30, Number($("fpsLimit").value) || 120),
    resolution: $("resolution").value.trim(),
    javaVersion: $("javaVersion").value.trim(),
    javaPath: $("javaPath").value.trim(),
    javaArgs: $("javaArgs").value.trim(),
    fullscreen: $("fullscreen").checked,
    vsync: $("vsync").checked
  };
  await window.launcherAPI.saveSettings(settings);
  $("maintenanceStatus").textContent = language === "nl" ? "Instellingen opgeslagen." : "Settings saved.";
});

$("repairEra").addEventListener("click", async () => {
  $("repairEra").disabled = true;
  $("maintenanceStatus").textContent = language === "nl" ? "Modpack wordt gecontroleerd en hersteld..." : "Checking and repairing modpack...";
  try {
    const result = await window.launcherAPI.repairEra(selectedEra);
    $("maintenanceStatus").textContent = result.ok ? `Modpack ${result.version} is hersteld.` : result.message;
    await loadEra();
    await loadTools();
    await loadRepairStatus();
  } catch (error) {
    $("maintenanceStatus").textContent = error.message || "Repair failed.";
  } finally { $("repairEra").disabled = false; }
});

$("cleanupEra").addEventListener("click", async () => {
  const result = await window.launcherAPI.cleanupEra(selectedEra);
  $("maintenanceStatus").textContent = language === "nl"
    ? `${result.removed} oude downloadbestanden verwijderd.`
    : `${result.removed} old download files removed.`;
});

$("updateInstall").addEventListener("click", () => window.launcherAPI.installUpdate());
$("affiliateButton").addEventListener("click", openAffiliate);
$("affiliateBanner").addEventListener("click", event => {
  if (event.target.closest("button")) return;
  openAffiliate();
});
$("affiliateClose").addEventListener("click", () => $("affiliateBanner").classList.add("hidden"));

setLanguage("nl");
startup();
