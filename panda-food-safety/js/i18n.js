// UI copy, English/Spanish. Checklist item text lives in checklist-data.js.

const STRINGS = {
  appTitle: { en: "Panda Food Safety Checklist", es: "Lista de Verificación de Seguridad Alimentaria" },
  storeLabel: { en: "Store #", es: "Tienda #" },
  storeSelectPlaceholder: { en: "Select your store…", es: "Seleccione su tienda…" },
  noStoresConfigured: { en: "No stores are set up yet. Ask an admin to add stores.", es: "Aún no hay tiendas configuradas. Pida a un administrador que agregue tiendas." },
  conductedByLabel: { en: "Your name", es: "Su nombre" },
  conductedByPlaceholder: { en: "Full name", es: "Nombre completo" },
  dateTimeLabel: { en: "Date & time", es: "Fecha y hora" },
  startButton: { en: "Start Walkthrough", es: "Iniciar Recorrido" },
  resumeButton: { en: "Resume Walkthrough", es: "Continuar Recorrido" },
  loadingButton: { en: "Loading…", es: "Cargando…" },
  alreadySubmittedTitle: { en: "Today's walkthrough is already complete", es: "El recorrido de hoy ya está completo" },
  alreadySubmittedBody: { en: "Submitted by {name} at {time}.", es: "Enviado por {name} a las {time}." },
  viewSubmission: { en: "View it", es: "Verlo" },
  editAnyway: { en: "Edit anyway", es: "Editar de todos modos" },
  progressLabel: { en: "{done} of {total} complete", es: "{done} de {total} completado" },
  yes: { en: "Yes", es: "Sí" },
  no: { en: "No", es: "No" },
  na: { en: "N/A", es: "N/A" },
  photoRequiredLabel: { en: "This needs a photo of the work order before you continue", es: "Esto necesita una foto de la orden de trabajo antes de continuar" },
  takePhoto: { en: "Take / Upload Photo", es: "Tomar / Subir Foto" },
  retakePhoto: { en: "Replace Photo", es: "Reemplazar Foto" },
  uploadingPhoto: { en: "Uploading…", es: "Subiendo…" },
  noteLabel: { en: "What did you do about it?", es: "¿Qué hizo al respecto?" },
  notePlaceholder: { en: "Describe the corrective action taken", es: "Describa la acción correctiva tomada" },
  additionalNotesLabel: { en: "Additional notes (optional)", es: "Notas adicionales (opcional)" },
  additionalNotesPlaceholder: { en: "Anything else worth noting…", es: "Algo más que valga la pena anotar…" },
  submitButton: { en: "Submit Walkthrough", es: "Enviar Recorrido" },
  itemsRemaining: { en: "{n} item(s) left before you can submit", es: "{n} elemento(s) pendientes antes de poder enviar" },
  savedIndicator: { en: "Saved", es: "Guardado" },
  savingIndicator: { en: "Saving…", es: "Guardando…" },
  submitConfirmTitle: { en: "Walkthrough Submitted", es: "Recorrido Enviado" },
  submitConfirmBody: { en: "Thank you! {flagged} item(s) were flagged and logged for follow-up.", es: "¡Gracias! Se marcaron y registraron {flagged} elemento(s) para seguimiento." },
  submitConfirmBodyClean: { en: "Thank you! Every item passed today.", es: "¡Gracias! Todos los elementos pasaron hoy." },
  doneButton: { en: "Done", es: "Listo" },
  startAnotherStore: { en: "Start another store", es: "Iniciar otra tienda" },
  adminLink: { en: "Admin", es: "Administrador" },
  backToChecklist: { en: "← Back to checklist", es: "← Volver a la lista" },
  loginTitle: { en: "Admin Login", es: "Inicio de Sesión de Administrador" },
  emailLabel: { en: "Email", es: "Correo electrónico" },
  passwordLabel: { en: "Password", es: "Contraseña" },
  loginButton: { en: "Log In", es: "Iniciar Sesión" },
  logoutButton: { en: "Log Out", es: "Cerrar Sesión" },
  loginError: { en: "Incorrect email or password.", es: "Correo electrónico o contraseña incorrectos." },
  notAnAdmin: { en: "This account doesn't have admin access.", es: "Esta cuenta no tiene acceso de administrador." },
  todayStatusTitle: { en: "Today's Status", es: "Estado de Hoy" },
  storesSubmittedCount: { en: "{done} of {total} stores submitted today", es: "{done} de {total} tiendas enviaron hoy" },
  submittedStatus: { en: "Submitted", es: "Enviado" },
  missingStatus: { en: "Missing", es: "Falta" },
  submittedAt: { en: "at {time} by {name}", es: "a las {time} por {name}" },
  historyTitle: { en: "History", es: "Historial" },
  filterStore: { en: "Store", es: "Tienda" },
  filterAllStores: { en: "All stores", es: "Todas las tiendas" },
  filterFrom: { en: "From", es: "Desde" },
  filterTo: { en: "To", es: "Hasta" },
  noSubmissionsFound: { en: "No submissions in this range.", es: "No hay envíos en este rango." },
  manageStoresTitle: { en: "Manage Stores", es: "Administrar Tiendas" },
  addStore: { en: "Add Store", es: "Agregar Tienda" },
  storeNumberLabel: { en: "Store number", es: "Número de tienda" },
  storeNameLabel: { en: "Store name / location", es: "Nombre de tienda / ubicación" },
  saveButton: { en: "Save", es: "Guardar" },
  cancelButton: { en: "Cancel", es: "Cancelar" },
  deleteButton: { en: "Remove", es: "Eliminar" },
  confirmDeleteStore: { en: "Remove this store from the list? Past submissions are kept.", es: "¿Eliminar esta tienda de la lista? Los envíos anteriores se conservan." },
  exportCsv: { en: "Export CSV", es: "Exportar CSV" },
  flaggedItems: { en: "Flagged items", es: "Elementos marcados" },
  noFlagged: { en: "Nothing flagged — full pass.", es: "Nada marcado — aprobado completo." },
  noSubmissionYet: { en: "No submission for this store today yet.", es: "Aún no hay envío para esta tienda hoy." },
  viewDetail: { en: "View", es: "Ver" },
  closeButton: { en: "Close", es: "Cerrar" },
  conductedByColumn: { en: "Conducted by", es: "Realizado por" },
  dateColumn: { en: "Date", es: "Fecha" },
  statusColumn: { en: "Status", es: "Estado" },
  itemNumber: { en: "Item #{n}", es: "Elemento #{n}" },
  securityNote: {
    en: "Store data is shared across your Firebase project. Anyone with the app link can submit a walkthrough; only these two admin logins can manage stores and browse every store's history.",
    es: "Los datos de la tienda se comparten en su proyecto de Firebase. Cualquiera con el enlace de la app puede enviar un recorrido; solo estos dos inicios de sesión de administrador pueden administrar tiendas y ver el historial de todas las tiendas.",
  },
};

let currentLang = localStorage.getItem("pfs_lang") || "en";

function setLang(lang) {
  currentLang = lang === "es" ? "es" : "en";
  localStorage.setItem("pfs_lang", currentLang);
}

function getLang() {
  return currentLang;
}

// t("key", {name: "Bob", time: "3:04 PM"}) — simple {placeholder} interpolation.
function t(key, vars) {
  const entry = STRINGS[key];
  if (!entry) return key;
  let str = entry[currentLang] || entry.en || key;
  if (vars) {
    for (const k in vars) {
      str = str.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
    }
  }
  return str;
}

// Pick the localized text field ("en"/"es") off a checklist item/section object.
function tf(obj) {
  return obj[currentLang] || obj.en;
}
