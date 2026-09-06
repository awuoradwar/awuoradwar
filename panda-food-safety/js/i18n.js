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
  photoProofLabel: { en: "This item always needs a photo as proof", es: "Este elemento siempre necesita una foto como prueba" },
  takePhoto: { en: "Take / Upload Photo", es: "Tomar / Subir Foto" },
  retakePhoto: { en: "Replace Photo", es: "Reemplazar Foto" },
  uploadingPhoto: { en: "Uploading…", es: "Subiendo…" },
  noteLabel: { en: "Course of action", es: "Curso de acción" },
  notePlaceholder: { en: "Describe the course of action taken", es: "Describa el curso de acción tomado" },
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
  signUpTitle: { en: "Create Admin Account", es: "Crear Cuenta de Administrador" },
  signUpButton: { en: "Create Account", es: "Crear Cuenta" },
  switchToSignUp: { en: "New admin? Create an account", es: "¿Nuevo administrador? Cree una cuenta" },
  switchToLogin: { en: "Already have an account? Log in", es: "¿Ya tiene una cuenta? Inicie sesión" },
  emailLabel: { en: "Email", es: "Correo electrónico" },
  passwordLabel: { en: "Password", es: "Contraseña" },
  loginButton: { en: "Log In", es: "Iniciar Sesión" },
  logoutButton: { en: "Log Out", es: "Cerrar Sesión" },
  loginError: { en: "Incorrect email or password.", es: "Correo electrónico o contraseña incorrectos." },
  notAnAdmin: { en: "This account isn't authorized as an admin yet. Ask the owner to add your email under Manage Admins first.", es: "Esta cuenta aún no está autorizada como administrador. Pida al propietario que agregue su correo en Administrar Administradores primero." },
  manageAdminsTitle: { en: "Manage Admins", es: "Administrar Administradores" },
  ownerNote: { en: "Only the owner account can add or remove admins here. Every admin added below has the same access as the owner to view, edit, and export data.", es: "Solo la cuenta propietaria puede agregar o eliminar administradores aquí. Cada administrador agregado abajo tiene el mismo acceso que el propietario para ver, editar y exportar datos." },
  adminEmailLabel: { en: "Admin's email", es: "Correo del administrador" },
  addAdmin: { en: "Add Admin", es: "Agregar Administrador" },
  ownerRole: { en: "Owner", es: "Propietario" },
  adminRole: { en: "Admin", es: "Administrador" },
  confirmRemoveAdmin: { en: "Remove this admin's access? They can be re-added later.", es: "¿Eliminar el acceso de este administrador? Puede volver a agregarse más tarde." },
  todayStatusTitle: { en: "Today's Status", es: "Estado de Hoy" },
  storesSubmittedCount: { en: "{done} of {total} stores submitted today", es: "{done} de {total} tiendas enviaron hoy" },
  submittedStatus: { en: "Submitted", es: "Enviado" },
  missingStatus: { en: "Missing", es: "Falta" },
  historyTitle: { en: "History", es: "Historial" },
  weeklySummaryTitle: { en: "Weekly Summary", es: "Resumen Semanal" },
  last7DaysLabel: { en: "Last 7 days", es: "Últimos 7 días" },
  previousWeek: { en: "‹ Previous", es: "‹ Anterior" },
  nextWeek: { en: "Next ›", es: "Siguiente ›" },
  viewWeeklySummary: { en: "📊 View this week's summary", es: "📊 Ver el resumen de esta semana" },
  hideWeeklySummary: { en: "Hide summary", es: "Ocultar resumen" },
  daysSubmittedLabel: { en: "{done} of {total} days submitted", es: "{done} de {total} días enviados" },
  flaggedThisWeekLabel: { en: "{n} item(s) flagged this week", es: "{n} elemento(s) marcados esta semana" },
  noDataThisWeek: { en: "No submissions yet in the last 7 days.", es: "Aún no hay envíos en los últimos 7 días." },
  weeklyFlaggedColumn: { en: "Flagged", es: "Marcados" },
  weeklyDaysColumn: { en: "Days submitted", es: "Días enviados" },
  weeklyLastSubmission: { en: "Last submission", es: "Último envío" },
  weeklyNever: { en: "Never this week", es: "Nunca esta semana" },
  noMatchingStores: { en: "No matching stores", es: "No hay tiendas coincidentes" },
  quickRangeLabel: { en: "Jump to a week:", es: "Ir a una semana:" },
  thisWeek: { en: "This week", es: "Esta semana" },
  lastWeek: { en: "Last week", es: "Semana pasada" },
  weeksAgo: { en: "{n} weeks ago", es: "Hace {n} semanas" },
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
  editButton: { en: "Edit", es: "Editar" },
  optionalLabel: { en: "optional", es: "opcional" },
  deleteButton: { en: "Remove", es: "Eliminar" },
  confirmDeleteStore: { en: "Remove this store from the list? Past submissions are kept.", es: "¿Eliminar esta tienda de la lista? Los envíos anteriores se conservan." },
  exportCsv: { en: "Export CSV", es: "Exportar CSV" },
  flaggedItems: { en: "Flagged items", es: "Elementos marcados" },
  viewDetail: { en: "View", es: "Ver" },
  deleteSubmission: { en: "Delete this submission", es: "Eliminar este envío" },
  confirmDeleteSubmission: { en: "Permanently delete the submission for store {store} on {date}? This cannot be undone.", es: "¿Eliminar permanentemente el envío de la tienda {store} del {date}? Esto no se puede deshacer." },
  closeButton: { en: "Close", es: "Cerrar" },
  conductedByColumn: { en: "Conducted by", es: "Realizado por" },
  dateColumn: { en: "Date", es: "Fecha" },
  statusColumn: { en: "Status", es: "Estado" },
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
