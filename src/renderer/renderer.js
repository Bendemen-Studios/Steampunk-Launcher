const $ = (id) => document.getElementById(id);

const i18n = {
  nl: {
    updateTitle:"Launcher bijwerken", updateText:"De launcher controleert op updates...", checking:"Controleren", loading:"Launcher voorbereiden", done:"Klaar",
    heroTitle:"Kies jouw Era", heroText:"Elke Era heeft zijn eigen avontuur, modpack en configuratie.",
    launch:"▶ Minecraft starten", profile:"Geen account geselecteerd", status:"Online controleren...", ready:"Launcher is klaar."
  },
  en: {
    updateTitle:"Updating launcher", updateText:"The launcher is checking for updates...", checking:"Checking", loading:"Preparing launcher", done:"Ready",
    heroTitle:"Choose your Era", heroText:"Each Era has its own adventure, modpack and configuration.",
    launch:"▶ Launch Minecraft", profile:"No account selected", status:"Checking online...", ready:"Launcher is ready."
  }
};

let language = "nl";
let selectedEra = "steamy-times";

function setLanguage(next) {
  language = next;
  const t = i18n[language];
  $("updateTitle").textContent = t.updateTitle;
  $("updateText").textContent = t.updateText;
  $("heroTitle").textContent = t.heroTitle;
  $("heroText").textContent = t.heroText;
  $("launchButton").textContent = t.launch;
  if (!$("profileName").dataset.custom) $("profileName").textContent = t.profile;
  $("serverState").textContent = t.status;
}

async function setProgress(value, label) {
  $("progressBar").style.width = value + "%";
  $("progressPercent").textContent = value + "%";
  $("progressLabel").textContent = label;
  await new Promise(r => setTimeout(r, 250));
}

async function startup() {
  const t = i18n[language];
  await setProgress(18, t.checking);
  await setProgress(42, t.checking);
  await setProgress(68, t.loading);
  await setProgress(88, t.loading);
  await setProgress(100, t.done);
  await new Promise(r => setTimeout(r, 450));
  $("updateScreen").classList.add("hidden");
  $("mainScreen").classList.remove("hidden");
  loadEra();
}

async function loadEra() {
  selectedEra = $("eraChooser").value;
  const manifest = await window.launcherAPI.getEraManifest(selectedEra);
  $("modpackVersion").textContent = manifest?.version && manifest.version !== "0.0.0" ? manifest.version : "Nog niet geïnstalleerd";
  $("minecraftVersion").textContent = manifest?.minecraftVersion || "Wordt later ingesteld";
}

$("language").addEventListener("change", e => setLanguage(e.target.value));
$("eraChooser").addEventListener("change", loadEra);

$("launchButton").addEventListener("click", async () => {
  const result = await window.launcherAPI.launchMinecraft({ era:selectedEra });
  $("launchStatus").textContent = result.ok
    ? (language === "nl" ? "Era voorbereid. Minecraft-integratie kan nu aan deze profielconfiguratie worden gekoppeld." : "Era prepared. Minecraft integration can now be connected to this profile configuration.")
    : "Launch failed";
});

document.querySelectorAll(".social").forEach(btn => {
  btn.addEventListener("click", () => window.launcherAPI.openSocial(btn.dataset.url));
});

$("switchProfile").addEventListener("click", () => {
  const name = window.prompt(language === "nl" ? "Naam van lokaal Minecraft-profiel:" : "Name of local Minecraft profile:");
  if (!name) return;
  $("profileName").textContent = name;
  $("profileName").dataset.custom = "true";
});

setLanguage("nl");
startup();
