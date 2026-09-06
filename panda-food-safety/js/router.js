import { initAssociateApp } from "./app.js";
import { initAdminApp } from "./admin.js";

function route() {
  const isAdmin = location.hash.startsWith("#/admin");
  document.getElementById("associate-root").hidden = isAdmin;
  document.getElementById("admin-root").hidden = !isAdmin;
  if (isAdmin) {
    initAdminApp();
  } else {
    initAssociateApp();
  }
}

window.addEventListener("hashchange", route);
route();

// ---------- New-version detection ----------
// A tab left open for a while (this is meant to stay open during a
// shift) otherwise keeps running whatever JS it loaded at open time,
// even after a new deploy — nobody thinks to manually reload. This
// polls a version marker (the deploy commit SHA, written fresh by
// GitHub Actions on every push) and prompts a one-tap reload once it
// changes. It only prompts, never reloads on its own — someone could be
// mid-walkthrough or mid-edit, and an unannounced reload could interrupt
// that (already-saved answers are safe either way, but the interruption
// itself isn't).
let loadedVersion = null;

async function fetchVersion() {
  try {
    const res = await fetch("version.json", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()).version;
  } catch {
    return null;
  }
}

function showUpdateBanner() {
  if (document.getElementById("update-banner")) return;
  const bar = document.createElement("div");
  bar.id = "update-banner";
  bar.className = "update-banner";
  bar.innerHTML = `<span>${t("updateAvailableLabel")}</span><button class="btn btn-sm btn-primary" id="btn-reload-update">${t("reloadButton")}</button>`;
  document.body.appendChild(bar);
  bar.querySelector("#btn-reload-update").addEventListener("click", () => location.reload());
}

async function checkForUpdate() {
  if (!loadedVersion) return;
  const current = await fetchVersion();
  if (current && current !== loadedVersion) showUpdateBanner();
}

(async () => {
  loadedVersion = await fetchVersion();
  if (!loadedVersion) return;
  setInterval(checkForUpdate, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
})();
