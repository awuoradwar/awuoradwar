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
