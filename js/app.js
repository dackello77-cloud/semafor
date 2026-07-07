import { supabaseClient } from "./supabase.js";

const storageKeys = {
  companies: "semafor-admin-companies",
  vehicles: "semafor-admin-vehicles",
  administrators: "semafor-admin-users",
  tasks: "semafor-active-tasks",
  driverDocuments: "semafor-driver-documents",
  bolRequests: "semafor-bol-requests",
  customerTask: "semafor-customer-active-task",
  typeChangedTasks: "semafor-type-changed-tasks",
  session: "semafor-active-session",
};

const dbTables = {
  companies: "semafor_companies",
  vehicles: "semafor_vehicles",
  administrators: "semafor_administrators",
  tasks: "semafor_tasks",
  driverDocuments: "semafor_driver_documents",
  bolRequests: "semafor_bol_requests",
  pushTokens: "semafor_push_tokens",
};

const bolBucket = "semafor-bol";
const maxBolFileSize = 150 * 1024 * 1024;

const defaultAdministrators = [
  {
    id: "default-admin",
    username: "admin",
    password: "admin123",
    createdAt: new Date().toISOString(),
  },
];

let companies = readStorage(storageKeys.companies);
let vehicles = readStorage(storageKeys.vehicles);
let administrators = readAdministrators();
let tasks = readStorage(storageKeys.tasks);
let driverDocuments = readStorage(storageKeys.driverDocuments);
let bolRequests = readStorage(storageKeys.bolRequests);
let typeChangedTaskIds = new Set(readStorage(storageKeys.typeChangedTasks));
let customerPhoneLast7 = "";
let timerIntervalId = null;
let databaseReady = false;
let bolDatabaseReady = false;
let bolRequestsDatabaseReady = false;
let pendingRequestType = "";
let pendingTaskChoice = null;
let pendingBol = null;
let pendingBolPurpose = "new-task";
let cameraBolTaskMode = false;
let customerAudioContext = null;
let customerAudioUnlocked = false;
let customerPermissionRequestStarted = false;
let customerTaskSubmitting = false;
const notifiedBolRequestIds = new Set();
const notifiedFinishedTaskIds = new Set();
let pushNotificationsReady = false;
const remotePushEnabled = false;

const body = document.body;
const loginScreen = document.querySelector("#portal-login");
const loginForm = document.querySelector("#portal-login-form");
const loginIdentity = document.querySelector("#login-identity");
const loginPassword = document.querySelector("#login-password");
const loginError = document.querySelector("#portal-login-error");
const dbStatus = document.querySelector("#db-status");
const adminScreen = document.querySelector("#admin-screen");
const customerScreen = document.querySelector("#customer-screen");
const adminLogout = document.querySelector("#admin-logout");
const customerLogout = document.querySelector("#customer-logout");
const cameraButton = document.querySelector("#camera-btn");
const pwaPushButton = document.querySelector("#pwa-push-btn");
const cameraInput = document.querySelector("#camera-input");
const customerCode = document.querySelector("#customer-code");
const optionsCode = document.querySelector("#options-code");
const timerCode = document.querySelector("#timer-code");
const customerHomePanel = document.querySelector("#customer-home-panel");
const customerOptionsPanel = document.querySelector("#customer-options-panel");
const customerLldPanel = document.querySelector("#customer-lld-panel");
const customerBolPanel = document.querySelector("#customer-bol-panel");
const customerTimerPanel = document.querySelector("#customer-timer-panel");
const shiftButton = document.querySelector("#shift-button");
const hoursButton = document.querySelector("#hours-button");
const optionsBack = document.querySelector("#options-back");
const lldBack = document.querySelector("#lld-back");
const lldCode = document.querySelector("#lld-code");
const bolBack = document.querySelector("#bol-back");
const bolCamera = document.querySelector("#bol-camera");
const bolDocument = document.querySelector("#bol-document");
const bolNone = document.querySelector("#bol-none");
const bolMessage = document.querySelector("#bol-message");
const bolCameraInput = document.querySelector("#bol-camera-input");
const bolDocumentInput = document.querySelector("#bol-document-input");
const requestGrid = document.querySelector("#request-grid");
const timerValue = document.querySelector("#timer-value");
const customerBolRequestButton = document.querySelector("#customer-bol-request-button");
const customerDoneCheck = document.querySelector("#customer-done-check");
const tabs = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");
const tasksTable = document.querySelector("#tasks-table");
const companiesTable = document.querySelector("#companies-table");
const vehiclesTable = document.querySelector("#vehicles-table");
const administratorsTable = document.querySelector("#administrators-table");
const bolList = document.querySelector("#bol-list");
const bolViewer = document.querySelector("#bol-viewer");
const bolViewerTitle = document.querySelector("#bol-viewer-title");
const bolViewerCount = document.querySelector("#bol-viewer-count");
const bolViewerImage = document.querySelector("#bol-viewer-image");
const bolViewerMessage = document.querySelector("#bol-viewer-message");
const bolViewerImageWrap = document.querySelector(".bol-viewer-image-wrap");
const bolViewerClose = document.querySelector("#bol-viewer-close");
const bolPrev = document.querySelector("#bol-prev");
const bolNext = document.querySelector("#bol-next");
const bolZoomIn = document.querySelector("#bol-zoom-in");
const bolZoomOut = document.querySelector("#bol-zoom-out");
const vehicleCompany = document.querySelector("#vehicle-company");
const editVehicleCompany = document.querySelector("#edit-vehicle-company");
const passwordAdminUsername = document.querySelector("#password-admin-username");
const contextMenu = document.querySelector("#context-menu");
const contextProperties = document.querySelector("#context-properties");
const companyForm = document.querySelector("#company-form");
const vehicleForm = document.querySelector("#vehicle-form");
const editCompanyForm = document.querySelector("#edit-company-form");
const editVehicleForm = document.querySelector("#edit-vehicle-form");
const adminForm = document.querySelector("#admin-form");
const passwordForm = document.querySelector("#password-form");
let contextTarget = null;
let currentBolViewerDocuments = [];
let currentBolViewerIndex = 0;
let currentBolZoom = 1;
let currentBolViewerCanZoom = false;
let currentBolRenderRequestId = 0;
let pdfJsPromise = null;
let pwaPushRegistrationStarted = false;
let pwaServiceWorkerRegistrationPromise = null;

configureNativeCustomerApp();
preparePwaServiceWorker()?.catch((error) => {
  console.warn("Service worker registration failed:", error.message || error);
});

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const identity = loginIdentity.value.trim();
  const password = loginPassword.value;

  if (password.trim() && !isNativeCustomerApp()) {
    const admin = administrators.find(
      (item) => item.username.toLowerCase() === identity.toLowerCase() && item.password === password,
    );

    if (!admin) {
      loginError.textContent = "Wrong admin username or password.";
      loginPassword.focus();
      return;
    }

    saveSession({ role: "admin", username: admin.username });
    showAdmin();
    return;
  }

  const phoneLast7 = getLastSevenDigits(identity);

  if (!phoneLast7) {
    loginError.textContent = "Enter phone number or admin password.";
    loginIdentity.focus();
    return;
  }

  saveSession({ role: "customer", phoneLast7 });
  showCustomer(phoneLast7);
});

adminLogout.addEventListener("click", logout);
customerLogout.addEventListener("click", logout);
pwaPushButton.addEventListener("click", () => {
  registerPwaPushNotifications().catch((error) => {
    console.warn("Web push registration failed:", error.message || error);
    updatePwaPushButtonState();
  });
});
customerScreen.addEventListener("pointerdown", unlockCustomerAudio, { passive: true });
customerScreen.addEventListener("keydown", unlockCustomerAudio);

cameraButton.addEventListener("click", () => {
  const activeTask = findActiveTaskForCustomer(customerPhoneLast7);

  if (activeTask && activeTask.type !== "BOL") {
    showTimer(activeTask);
    return;
  }

  showBolPrompt("BOL", "camera-task");
});

shiftButton.addEventListener("click", () => startCustomerRequest("SHIFT"));
hoursButton.addEventListener("click", () => startCustomerRequest("HOURS"));
optionsBack.addEventListener("click", showCustomerHome);
lldBack.addEventListener("click", () => showRequestOptions(pendingRequestType));
bolBack.addEventListener("click", () => {
  if (pendingBolPurpose === "active-task") {
    restoreCustomerTask();
    return;
  }

  showCustomerHome();
});
bolCamera.addEventListener("click", () => bolCameraInput.click());
bolDocument.addEventListener("click", () => bolDocumentInput.click());
bolNone.addEventListener("click", () => {
  if (pendingBolPurpose === "active-task") {
    runCustomerAction(() => completeActiveTaskBolRequest(null, "none"));
    return;
  }

  if (pendingBolPurpose === "camera-task") {
    runCustomerAction(() => createCameraBolTask(null, "none"));
    return;
  }

  pendingBol = { mode: "none", file: null };
  showRequestOptions(pendingRequestType);
});
bolCameraInput.addEventListener("change", () => runCustomerAction(() => handleBolFileChoice(bolCameraInput, "camera")));
bolDocumentInput.addEventListener("change", () => runCustomerAction(() => handleBolFileChoice(bolDocumentInput, "file")));
customerBolRequestButton.addEventListener("click", showActiveTaskBolPrompt);
customerDoneCheck.addEventListener("click", () => {
  localStorage.removeItem(storageKeys.customerTask);
  showCustomerHome();
});

requestGrid.addEventListener("click", (event) => {
  const option = event.target.closest(".request-option");

  if (!option) return;

  if (option.dataset.nextType) {
    showRequestOptions(option.dataset.nextType);
    return;
  }

  showLldOptions(option.dataset.type, option.dataset.desc);
});

customerLldPanel.addEventListener("click", (event) => {
  const choice = event.target.closest("[data-lld-choice]");

  if (!choice || !pendingTaskChoice || customerTaskSubmitting) return;

  runCustomerAction(() => createCustomerTask(pendingTaskChoice.type, appendLldDescription(pendingTaskChoice.desc, choice.dataset.lldChoice)));
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => showView(tab.dataset.view));
});

tasksTable.addEventListener("click", (event) => {
  const finishButton = event.target.closest("[data-finish-task]");

  if (!finishButton) return;

  finishTask(finishButton.dataset.finishTask);
});

tasksTable.addEventListener("contextmenu", (event) => {
  const cell = event.target.closest("[data-properties-kind]");

  if (!cell) return;

  event.preventDefault();
  contextTarget = {
    kind: cell.dataset.propertiesKind,
    taskId: cell.dataset.taskId,
  };
  showContextMenu(event.clientX, event.clientY);
});

companiesTable.addEventListener("contextmenu", (event) => {
  const row = event.target.closest("[data-company-id]");

  if (!row) return;

  event.preventDefault();
  contextTarget = {
    kind: "company",
    companyId: row.dataset.companyId,
  };
  showContextMenu(event.clientX, event.clientY);
});

vehiclesTable.addEventListener("contextmenu", (event) => {
  const row = event.target.closest("[data-vehicle-id]");

  if (!row) return;

  event.preventDefault();
  contextTarget = {
    kind: "vehicle",
    vehicleId: row.dataset.vehicleId,
  };
  showContextMenu(event.clientX, event.clientY);
});

vehiclesTable.addEventListener("click", (event) => {
  const bolButton = event.target.closest("[data-open-bol]");

  if (!bolButton) return;

  openBolDocuments(bolButton.dataset.openBol);
});

tasksTable.addEventListener("click", (event) => {
  const bolButton = event.target.closest("[data-open-task-bol]");

  if (!bolButton) return;

  openBolDocumentsForTask(bolButton.dataset.openTaskBol);
});

tasksTable.addEventListener("click", (event) => {
  const bolRequestButton = event.target.closest("[data-request-task-bol]");

  if (!bolRequestButton || bolRequestButton.disabled) return;

  event.stopPropagation();
  handleTaskBolRequestClick(bolRequestButton);
});

vehiclesTable.addEventListener("click", (event) => {
  const bolRequestButton = event.target.closest("[data-request-bol]");

  if (!bolRequestButton || bolRequestButton.disabled) return;

  event.stopPropagation();
  handleVehicleBolRequestClick(bolRequestButton);
});

document.addEventListener("click", (event) => {
  if (!event.target.closest) return;

  const taskBolRequestButton = event.target.closest("[data-request-task-bol]");

  if (taskBolRequestButton && !taskBolRequestButton.disabled) {
    handleTaskBolRequestClick(taskBolRequestButton);
    return;
  }

  const vehicleBolRequestButton = event.target.closest("[data-request-bol]");

  if (vehicleBolRequestButton && !vehicleBolRequestButton.disabled) {
    handleVehicleBolRequestClick(vehicleBolRequestButton);
  }
});

bolList.addEventListener("click", (event) => {
  const preview = event.target.closest("[data-bol-document-index]");

  if (!preview) return;

  openBolDocumentViewer(Number(preview.dataset.bolDocumentIndex));
});

bolList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  const preview = event.target.closest("[data-bol-document-index]");

  if (!preview) return;

  event.preventDefault();
  openBolDocumentViewer(Number(preview.dataset.bolDocumentIndex));
});

bolViewerClose.addEventListener("click", closeBolDocumentViewer);
bolPrev.addEventListener("click", () => {
  if (currentBolViewerIndex < currentBolViewerDocuments.length - 1) {
    showBolDocument(currentBolViewerIndex + 1);
  }
});
bolNext.addEventListener("click", () => {
  if (currentBolViewerIndex > 0) {
    showBolDocument(currentBolViewerIndex - 1);
  }
});
bolZoomIn.addEventListener("click", () => {
  if (currentBolViewerCanZoom) setBolZoom(currentBolZoom + 0.15);
});
bolZoomOut.addEventListener("click", () => {
  if (currentBolViewerCanZoom) setBolZoom(currentBolZoom - 0.15);
});

function handleTaskBolRequestClick(button) {
  button.disabled = true;
  button.classList.add("is-requested");
  button.textContent = "REQUESTED";

  markBolRequestSentForTask(button.dataset.requestTaskBol).catch((error) => {
    console.warn("BOL request failed:", error.message || error);
    renderTasks();
  });
}

function handleVehicleBolRequestClick(button) {
  button.disabled = true;
  button.classList.add("is-requested");
  button.textContent = "REQUESTED";

  markBolRequestSent(button.dataset.requestBol).catch((error) => {
    console.warn("BOL request failed:", error.message || error);
    renderVehicles();
  });
}

contextProperties.addEventListener("click", () => {
  hideContextMenu();
  openPropertiesForContext();
});

document.addEventListener("click", (event) => {
  if (!contextMenu.hidden && !event.target.closest("#context-menu")) {
    hideContextMenu();
  }
});

document.querySelectorAll("[data-open-modal]").forEach((button) => {
  button.addEventListener("click", () => openModal(button.dataset.openModal));
});

document.querySelectorAll("[data-close-modal]").forEach((button) => {
  button.addEventListener("click", () => closeModal(button.closest(".modal")));
});

document.querySelectorAll(".modal").forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal(modal);
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (!bolViewer.hidden) {
    if (event.key === "ArrowLeft") {
      if (currentBolViewerIndex < currentBolViewerDocuments.length - 1) {
        showBolDocument(currentBolViewerIndex + 1);
      }
      return;
    }

    if (event.key === "ArrowRight") {
      if (currentBolViewerIndex > 0) {
        showBolDocument(currentBolViewerIndex - 1);
      }
      return;
    }

    if (event.key === "+" || event.key === "=") {
      if (currentBolViewerCanZoom) setBolZoom(currentBolZoom + 0.15);
      return;
    }

    if (event.key === "-") {
      if (currentBolViewerCanZoom) setBolZoom(currentBolZoom - 0.15);
      return;
    }

    if (event.key === "Escape") {
      closeBolDocumentViewer();
      return;
    }
  }

  if (event.key === "Escape") {
    document.querySelectorAll(".modal.is-open").forEach(closeModal);
    hideContextMenu();
  }
});

companyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(companyForm);
  const name = formData.get("company").trim();

  if (!name) return;

  const company = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
  };

  companies = [...companies, company];

  writeStorage(storageKeys.companies, companies);
  await saveCompanyToDatabase(company);
  companyForm.reset();
  closeModal(document.querySelector("#company-modal"));
  render();
});

vehicleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(vehicleForm);

  const vehicle = {
    id: crypto.randomUUID(),
    company: formData.get("company"),
    truckNumber: formData.get("truckNumber").trim(),
    driverName: formData.get("driverName").trim(),
    driverPhone: formData.get("driverPhone").trim(),
  };

  if (!vehicle.company || !vehicle.truckNumber || !vehicle.driverName || !vehicle.driverPhone) {
    return;
  }

  vehicles = [...vehicles, vehicle];
  writeStorage(storageKeys.vehicles, vehicles);
  await saveVehicleToDatabase(vehicle);
  vehicleForm.reset();
  closeModal(document.querySelector("#vehicle-modal"));
  render();
});

editCompanyForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(editCompanyForm);
  const companyId = formData.get("id");
  const originalName = formData.get("originalName");
  const name = formData.get("company").trim();

  if (!companyId || !name) return;

  const company = companies.find((item) => item.id === companyId);

  if (!company) return;

  company.name = name;
  vehicles = vehicles.map((vehicle) => (vehicle.company === originalName ? { ...vehicle, company: name } : vehicle));
  tasks = tasks.map((task) => (task.company === originalName ? { ...task, company: name } : task));
  writeStorage(storageKeys.companies, companies);
  writeStorage(storageKeys.vehicles, vehicles);
  writeStorage(storageKeys.tasks, tasks);
  await updateCompanyInDatabase(company, originalName);
  closeModal(document.querySelector("#edit-company-modal"));
  render();
});

editVehicleForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(editVehicleForm);
  const vehicleId = formData.get("id");
  const originalTruckNumber = formData.get("originalTruckNumber");
  const nextVehicle = {
    id: vehicleId,
    company: formData.get("company"),
    truckNumber: formData.get("truckNumber").trim(),
    driverName: formData.get("driverName").trim(),
    driverPhone: formData.get("driverPhone").trim(),
  };

  if (!nextVehicle.id || !nextVehicle.company || !nextVehicle.truckNumber || !nextVehicle.driverName || !nextVehicle.driverPhone) {
    return;
  }

  const existingVehicle = vehicles.find((vehicle) => vehicle.id === nextVehicle.id);

  if (!existingVehicle) return;

  const updatedVehicle = {
    ...existingVehicle,
    ...nextVehicle,
  };

  vehicles = vehicles.map((vehicle) => (vehicle.id === updatedVehicle.id ? updatedVehicle : vehicle));
  tasks = tasks.map((task) =>
    task.vehicle === originalTruckNumber
      ? {
          ...task,
          company: updatedVehicle.company,
          vehicle: updatedVehicle.truckNumber,
          driver: updatedVehicle.driverName,
          phoneLast7: getLastSevenDigits(updatedVehicle.driverPhone) || task.phoneLast7,
        }
      : task,
  );
  writeStorage(storageKeys.vehicles, vehicles);
  writeStorage(storageKeys.tasks, tasks);
  await updateVehicleInDatabase(updatedVehicle, originalTruckNumber);
  closeModal(document.querySelector("#edit-vehicle-modal"));
  render();
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(adminForm);
  const username = formData.get("username").trim();
  const password = formData.get("password");

  if (!username || !password) return;

  const exists = administrators.some((admin) => admin.username.toLowerCase() === username.toLowerCase());

  if (exists) {
    alert("Administrator already exists.");
    return;
  }

  administrators = [
    ...administrators,
    {
      id: crypto.randomUUID(),
      username,
      password,
      createdAt: new Date().toISOString(),
    },
  ];

  writeStorage(storageKeys.administrators, administrators);
  await saveAdministratorToDatabase(administrators.at(-1));
  adminForm.reset();
  closeModal(document.querySelector("#admin-modal"));
  render();
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(passwordForm);
  const username = formData.get("username");
  const password = formData.get("password");

  if (!username || !password) return;

  administrators = administrators.map((admin) => (admin.username === username ? { ...admin, password } : admin));
  writeStorage(storageKeys.administrators, administrators);
  await updateAdministratorPasswordInDatabase(username, password);
  passwordForm.reset();
  closeModal(document.querySelector("#password-modal"));
  render();
});

render();
restoreSession();
initializeDatabase();
updateDatabaseStatus("checking");

window.addEventListener("storage", (event) => {
  if (event.key === storageKeys.tasks) {
    tasks = readStorage(storageKeys.tasks);
    renderTasks();

    syncCustomerTaskView();
    return;
  }

  if (event.key === storageKeys.bolRequests) {
    bolRequests = readStorage(storageKeys.bolRequests);
    renderTasks();
    renderVehicles();
    syncCustomerTaskView();
  }
});

function restoreSession() {
  const session = readSession();

  if (isNativeCustomerApp() && session?.role === "admin") {
    localStorage.removeItem(storageKeys.session);
    showLogin();
    return;
  }

  if (session?.role === "admin") {
    showAdmin();
    return;
  }

  if (session?.role === "customer" && session.phoneLast7) {
    showCustomer(session.phoneLast7);
  }
}

function showLogin() {
  body.classList.remove("customer-mode");
  loginScreen.hidden = false;
  adminScreen.hidden = true;
  customerScreen.hidden = true;
  loginError.textContent = "";
}

function isNativeCustomerApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

function configureNativeCustomerApp() {
  if (!isNativeCustomerApp()) return;

  document.querySelector(".portal-login-panel h1").textContent = "Semafor customer";
  loginIdentity.placeholder = "phone number";
  loginPassword.value = "";
  loginPassword.closest("label").hidden = true;
}

function showAdmin() {
  body.classList.remove("customer-mode");
  loginScreen.hidden = true;
  adminScreen.hidden = false;
  customerScreen.hidden = true;
  loginError.textContent = "";
}

function showCustomer(phoneLast7) {
  body.classList.add("customer-mode");
  loginScreen.hidden = true;
  adminScreen.hidden = true;
  customerScreen.hidden = false;
  customerPhoneLast7 = phoneLast7;
  customerCode.textContent = `YR BOL MULTI DOC v37 - ${phoneLast7}`;
  optionsCode.textContent = `YR BOL MULTI DOC v37 - ${phoneLast7}`;
  lldCode.textContent = `YR BOL MULTI DOC v37 - ${phoneLast7}`;
  document.querySelector("#bol-code").textContent = `YR BOL MULTI DOC v37 - ${phoneLast7}`;
  timerCode.textContent = `YR BOL MULTI DOC v37 - ${phoneLast7}`;
  loginError.textContent = "";
  requestNativeCustomerPermissionsOnce();
  updatePwaPushButtonState();
  syncExistingPwaPushSubscription().catch((error) => {
    console.warn("Web push sync failed:", error.message || error);
  });
  restoreCustomerTask();
}

function logout() {
  localStorage.removeItem(storageKeys.session);
  localStorage.removeItem(storageKeys.customerTask);
  stopTimer();
  loginIdentity.value = "";
  loginPassword.value = "";
  showLogin();
}

function saveSession(session) {
  localStorage.setItem(storageKeys.session, JSON.stringify(session));
}

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.session));
  } catch {
    return null;
  }
}

function showView(viewName) {
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === viewName));
  views.forEach((view) => view.classList.toggle("is-active", view.id === `${viewName}-view`));
}

function openModal(modalId) {
  if (modalId === "vehicle-modal") {
    renderCompanyOptions();
  }

  if (modalId === "password-modal") {
    renderAdministratorOptions();
  }

  const modal = document.querySelector(`#${modalId}`);
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  modal.querySelector('input:not([type="hidden"]), select')?.focus();
}

function closeModal(modal) {
  if (modal.id === "bol-modal") {
    closeBolDocumentViewer();
  }

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
}

function render() {
  renderTasks();
  renderCompanies();
  renderVehicles();
  renderAdministrators();
  renderCompanyOptions();
  renderAdministratorOptions();
}

function renderTasks() {
  const rows = tasks.filter((task) => task.status !== "Done");

  if (!rows.length) {
    tasksTable.innerHTML = `<tr class="empty-row"><td colspan="7">No active tasks yet.</td></tr>`;
    return;
  }

  tasksTable.innerHTML = rows
    .map((task) => {
      const docs = getRecentBolDocumentsForPhone(task.phoneLast7);
      const taskDocs = getRecentBolDocumentsForTask(task.id);
      const vehicle = findVehicleForTask(task.id);
      const hasBolDocuments = taskDocs.length > 0;
      const requestSent = hasRecentBolRequestForTask(task, vehicle);
      const bolButtonClass = hasBolDocuments ? "is-sent" : requestSent ? "is-requested" : "";

      return `
        <tr>
          <td>${escapeHtml(task.company || "")}</td>
          <td class="properties-cell" data-properties-kind="vehicle" data-task-id="${escapeAttribute(task.id)}">${escapeHtml(task.vehicle || "")}</td>
          <td>${escapeHtml(task.driver || "")}</td>
          <td>${escapeHtml(task.type || "")}</td>
          <td>${escapeHtml(task.desc || "")}</td>
          <td>
            <div class="bol-actions">
              <button
                class="bol-btn ${bolButtonClass}"
                type="button"
                data-request-task-bol="${escapeAttribute(task.id)}"
                ${hasBolDocuments || requestSent ? "disabled" : ""}
              >
                ${hasBolDocuments ? "BOL SENT" : requestSent ? "REQUESTED" : "BOL SEND"}
              </button>
              <button
                class="bol-image-btn"
                type="button"
                data-open-task-bol="${escapeAttribute(task.id)}"
                aria-label="Open task BOL documents"
                title="Open task BOL documents"
              >
                <span class="bol-image-icon" aria-hidden="true"></span>
                <span class="bol-count">${docs.length}</span>
              </button>
            </div>
          </td>
          <td>
            <span class="status-pill">${escapeHtml(task.status || "Active")}</span>
            <button class="finish-btn" type="button" data-finish-task="${escapeAttribute(task.id)}">Finish</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCompanies() {
  if (!companies.length) {
    companiesTable.innerHTML = `<tr class="empty-row"><td colspan="2">No companies yet.</td></tr>`;
    return;
  }

  companiesTable.innerHTML = companies
    .map(
      (company) => `
        <tr data-company-id="${escapeAttribute(company.id)}">
          <td>${escapeHtml(company.name)}</td>
          <td>${formatDate(company.createdAt)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderVehicles() {
  if (!vehicles.length) {
    vehiclesTable.innerHTML = `<tr class="empty-row"><td colspan="5">No vehicles yet.</td></tr>`;
    return;
  }

  vehiclesTable.innerHTML = vehicles
    .map((vehicle) => {
      const docs = getRecentBolDocumentsForVehicle(vehicle);
      const activeTask = findActiveTaskForVehicle(vehicle);
      const hasBolDocuments = activeTask ? getRecentBolDocumentsForTask(activeTask.id).length > 0 : false;
      const requestSent = hasRecentBolRequest(vehicle);
      const bolButtonClass = hasBolDocuments ? "is-sent" : requestSent ? "is-requested" : "";

      return `
        <tr data-vehicle-id="${escapeAttribute(vehicle.id)}">
          <td>${escapeHtml(vehicle.company)}</td>
          <td>${escapeHtml(vehicle.truckNumber)}</td>
          <td>${escapeHtml(vehicle.driverName)}</td>
          <td>${escapeHtml(vehicle.driverPhone)}</td>
          <td>
            <div class="bol-actions">
              <button
                class="bol-btn ${bolButtonClass}"
                type="button"
                data-request-bol="${escapeAttribute(vehicle.id)}"
                ${hasBolDocuments || requestSent ? "disabled" : ""}
              >
                ${hasBolDocuments ? "BOL SENT" : requestSent ? "REQUESTED" : "BOL SEND"}
              </button>
              <button
                class="bol-image-btn"
                type="button"
                data-open-bol="${escapeAttribute(vehicle.id)}"
                aria-label="Open BOL documents"
                title="Open BOL documents"
              >
                <span class="bol-image-icon" aria-hidden="true"></span>
                <span class="bol-count">${docs.length}</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderAdministrators() {
  administratorsTable.innerHTML = administrators
    .map(
      (admin) => `
        <tr>
          <td>${escapeHtml(admin.username)}</td>
          <td>${formatDate(admin.createdAt)}</td>
        </tr>
      `,
    )
    .join("");
}

function renderCompanyOptions() {
  if (!companies.length) {
    vehicleCompany.innerHTML = `<option value="">Create a company first</option>`;
    editVehicleCompany.innerHTML = `<option value="">Create a company first</option>`;
    vehicleCompany.disabled = true;
    editVehicleCompany.disabled = true;
    return;
  }

  vehicleCompany.disabled = false;
  editVehicleCompany.disabled = false;
  const options = [
    `<option value="">Select company</option>`,
    ...companies.map((company) => `<option value="${escapeAttribute(company.name)}">${escapeHtml(company.name)}</option>`),
  ].join("");
  vehicleCompany.innerHTML = options;
  editVehicleCompany.innerHTML = options;
}

function renderAdministratorOptions() {
  passwordAdminUsername.innerHTML = administrators
    .map((admin) => `<option value="${escapeAttribute(admin.username)}">${escapeHtml(admin.username)}</option>`)
    .join("");
}

function showContextMenu(x, y) {
  contextMenu.hidden = false;
  const menuWidth = contextMenu.offsetWidth;
  const menuHeight = contextMenu.offsetHeight;
  const left = Math.min(x, window.innerWidth - menuWidth - 8);
  const top = Math.min(y, window.innerHeight - menuHeight - 8);
  contextMenu.style.left = `${Math.max(8, left)}px`;
  contextMenu.style.top = `${Math.max(8, top)}px`;
}

function hideContextMenu() {
  contextMenu.hidden = true;
}

function openPropertiesForContext() {
  if (!contextTarget) return;

  if (contextTarget.kind === "company") {
    const company = contextTarget.companyId
      ? companies.find((item) => item.id === contextTarget.companyId)
      : findCompanyForTask(contextTarget.taskId);

    if (!company) {
      alert("Company was not found.");
      return;
    }

    openCompanyProperties(company);
    return;
  }

  if (contextTarget.kind === "vehicle") {
    const vehicle = contextTarget.vehicleId
      ? vehicles.find((item) => item.id === contextTarget.vehicleId)
      : findVehicleForTask(contextTarget.taskId);

    if (!vehicle) {
      alert("Vehicle was not found.");
      return;
    }

    openVehicleProperties(vehicle);
  }
}

function openCompanyProperties(company) {
  document.querySelector("#edit-company-id").value = company.id;
  document.querySelector("#edit-company-original-name").value = company.name;
  document.querySelector("#edit-company-name").value = company.name;
  openModal("edit-company-modal");
}

function openVehicleProperties(vehicle) {
  renderCompanyOptions();
  document.querySelector("#edit-vehicle-id").value = vehicle.id;
  document.querySelector("#edit-vehicle-original-truck").value = vehicle.truckNumber;
  editVehicleCompany.value = vehicle.company;
  document.querySelector("#edit-truck-number").value = vehicle.truckNumber;
  document.querySelector("#edit-driver-name").value = vehicle.driverName;
  document.querySelector("#edit-driver-phone").value = vehicle.driverPhone;
  openModal("edit-vehicle-modal");
}

function findCompanyForTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task) return null;

  return companies.find((company) => company.name === task.company) || null;
}

function findVehicleForTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task) return null;

  return (
    vehicles.find((vehicle) => vehicle.truckNumber === task.vehicle && vehicle.company === task.company) ||
    vehicles.find((vehicle) => vehicle.truckNumber === task.vehicle) ||
    null
  );
}

function findActiveTaskForVehicle(vehicle) {
  return (
    tasks.find(
      (task) =>
        task.status !== "Done" &&
        task.vehicle === vehicle.truckNumber &&
        (!task.company || !vehicle.company || task.company === vehicle.company),
    ) || null
  );
}

function getRecentBolDocumentsForVehicle(vehicle) {
  const activeTask = findActiveTaskForVehicle(vehicle);
  return getRecentBolDocumentsForPhone(getLastSevenDigits(vehicle.driverPhone) || activeTask?.phoneLast7 || "");
}

function getRecentBolDocumentsForTask(taskId) {
  const cutoff = getBolCutoffTime();

  return driverDocuments
    .filter((document) => document.fileUrl && document.taskId === taskId && new Date(document.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function getRecentBolDocumentsForPhone(phoneLast7) {
  const cutoff = getBolCutoffTime();

  return driverDocuments
    .filter((document) => document.fileUrl && document.phoneLast7 === phoneLast7 && new Date(document.createdAt).getTime() >= cutoff)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function hasRecentBolRequest(vehicle) {
  const activeTask = findActiveTaskForVehicle(vehicle);
  const phoneLast7 = getLastSevenDigits(vehicle.driverPhone) || activeTask?.phoneLast7 || "";

  return Boolean(getActiveBolRequestForCustomer(phoneLast7, vehicle.id));
}

function hasRecentBolRequestForTask(task, vehicle = null) {
  const vehicleRequest = vehicle ? getActiveBolRequestForCustomer(task.phoneLast7, vehicle.id) : null;

  return Boolean(vehicleRequest || getActiveBolRequestForCustomer(task.phoneLast7));
}

function getActiveBolRequestForCustomer(phoneLast7, vehicleId = "") {
  const cutoff = getBolCutoffTime();

  return (
    bolRequests.find(
      (request) =>
        request.phoneLast7 === phoneLast7 &&
        (!vehicleId || request.vehicleId === vehicleId) &&
        (request.status || "requested") === "requested" &&
        new Date(request.requestedAt).getTime() >= cutoff,
    ) || null
  );
}

async function markBolRequestSent(vehicleId) {
  const vehicle = vehicles.find((item) => item.id === vehicleId);

  if (!vehicle) throw new Error("Vehicle not found for BOL request.");

  const matchingTask = tasks.find(
    (task) =>
      task.status !== "Done" &&
      task.vehicle === vehicle.truckNumber &&
      (!task.company || !vehicle.company || task.company === vehicle.company),
  );
  const phoneLast7 = getLastSevenDigits(vehicle.driverPhone) || matchingTask?.phoneLast7 || "";

  await createBolRequest({
    phoneLast7,
    vehicleId: vehicle.id,
  });
}

async function markBolRequestSentForTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task) throw new Error("Task not found for BOL request.");

  const vehicle = findVehicleForTask(task.id);

  await createBolRequest({
    phoneLast7: task.phoneLast7,
    vehicleId: vehicle?.id || null,
  });
}

async function createBolRequest({ phoneLast7, vehicleId = null }) {
  const normalizedPhoneLast7 = getLastSevenDigits(phoneLast7) || phoneLast7;

  if (!normalizedPhoneLast7) throw new Error("Phone number missing for BOL request.");

  const cutoff = getBolCutoffTime();
  const request = {
    id: crypto.randomUUID(),
    vehicleId,
    phoneLast7: normalizedPhoneLast7,
    status: "requested",
    requestedAt: new Date().toISOString(),
    fulfilledAt: "",
  };

  bolRequests = [
    request,
    ...bolRequests.filter(
      (request) =>
        new Date(request.requestedAt).getTime() >= cutoff &&
        !(request.vehicleId === vehicleId && request.phoneLast7 === normalizedPhoneLast7 && (request.status || "requested") === "requested"),
    ),
  ];

  writeStorage(storageKeys.bolRequests, bolRequests);
  renderTasks();
  renderVehicles();
  syncCustomerTaskView();
  notifyCustomerByPush(normalizedPhoneLast7, "BOL requested", "Please send BOL: camera, file, or none.");
  await saveBolRequestToDatabase(request);
}

async function fulfillBolRequestsForPhone(phoneLast7) {
  const now = new Date().toISOString();
  const requestIds = bolRequests
    .filter((request) => request.phoneLast7 === phoneLast7 && (request.status || "requested") === "requested")
    .map((request) => request.id)
    .filter(Boolean);

  bolRequests = bolRequests.map((request) =>
    request.phoneLast7 === phoneLast7 && (request.status || "requested") === "requested"
      ? {
          ...request,
          status: "fulfilled",
          fulfilledAt: now,
        }
      : request,
  );

  writeStorage(storageKeys.bolRequests, bolRequests);

  if (requestIds.length) {
    await fulfillBolRequestsInDatabase(requestIds, now);
  }

  renderTasks();
  renderVehicles();
}

async function openBolDocuments(vehicleId) {
  const vehicle = vehicles.find((item) => item.id === vehicleId);

  if (!vehicle) return;

  await cleanupOldBolDocuments();
  renderVehicles();
  const docs = getRecentBolDocumentsForVehicle(vehicle);
  renderBolDocumentsModal(docs);
}

async function openBolDocumentsForTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (!task) return;

  await cleanupOldBolDocuments();
  renderTasks();
  const docs = getRecentBolDocumentsForPhone(task.phoneLast7);
  renderBolDocumentsModal(docs);
}

function renderBolDocumentsModal(docs) {
  currentBolViewerDocuments = docs.filter((document) => isViewableBolDocument(document));
  currentBolViewerIndex = 0;
  currentBolZoom = 1;
  closeBolDocumentViewer();

  bolList.innerHTML = docs.length
    ? docs
        .map((document) => {
          const documentIndex = currentBolViewerDocuments.findIndex((item) => item.id === document.id);

          return `
            <div class="bol-item">
              ${renderBolPreview(document, documentIndex)}
              <div class="bol-item-meta">
                <div>
                  <strong>${formatBolDocumentDate(document.createdAt)}</strong>
                  <span>${escapeHtml(document.mode || "")}</span>
                </div>
                ${
                  document.fileUrl
                    ? `<a href="${escapeAttribute(document.fileUrl)}" target="_blank" rel="noreferrer">Open</a>`
                    : `<span>Local only</span>`
                }
              </div>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-row"><span>No BOL documents in the last 7 days.</span></div>`;

  openModal("bol-modal");
}

function renderBolPreview(document, documentIndex = -1) {
  if (!document.fileUrl) {
    return `<div class="bol-preview bol-preview-empty">Local only</div>`;
  }

  const fileName = document.fileName || "";
  const fileUrl = escapeAttribute(document.fileUrl);
  const label = escapeAttribute(fileName || "BOL document");

  if (isImageFile(fileName)) {
    return `<button class="bol-preview bol-preview-image" type="button" data-bol-document-index="${documentIndex}"><img src="${fileUrl}" alt="${label}" loading="lazy" referrerpolicy="no-referrer" /><span>Open image</span></button>`;
  }

  if (isPdfFile(fileName)) {
    const pdfPreviewUrl = escapeAttribute(`${document.fileUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH&page=1`);
    return `<div class="bol-preview bol-preview-pdf" role="button" tabindex="0" data-bol-document-index="${documentIndex}"><iframe src="${pdfPreviewUrl}" title="${label}" loading="lazy"></iframe><span>Open PDF</span></div>`;
  }

  return `<a class="bol-preview bol-preview-file" href="${fileUrl}" target="_blank" rel="noreferrer">FILE</a>`;
}

function openBolDocumentViewer(index) {
  if (!currentBolViewerDocuments.length || index < 0 || index >= currentBolViewerDocuments.length) return;

  showBolDocument(index);
  bolViewer.hidden = false;
  bolViewer.closest(".modal-panel")?.classList.add("is-viewing-image");
}

function closeBolDocumentViewer() {
  currentBolRenderRequestId += 1;
  currentBolViewerCanZoom = false;
  bolViewer.hidden = true;
  bolViewer.closest(".modal-panel")?.classList.remove("is-viewing-image", "is-zoomed");
  bolViewerImage.removeAttribute("src");
  bolViewerImage.removeAttribute("style");
  bolViewerImage.hidden = false;
  bolViewerMessage.hidden = true;
  bolViewerMessage.textContent = "";
  bolZoomIn.disabled = true;
  bolZoomOut.disabled = true;
}

function showBolDocument(index) {
  if (!currentBolViewerDocuments.length) return;

  currentBolViewerIndex = Math.min(currentBolViewerDocuments.length - 1, Math.max(0, index));
  currentBolZoom = 1;
  currentBolRenderRequestId += 1;
  const renderRequestId = currentBolRenderRequestId;

  const document = currentBolViewerDocuments[currentBolViewerIndex];
  const fileName = document.fileName || "";
  const isImage = isImageFile(fileName);

  currentBolViewerCanZoom = false;
  bolViewerImage.removeAttribute("style");
  bolViewerImage.removeAttribute("src");
  bolViewerImage.hidden = false;
  bolViewerMessage.hidden = true;
  bolViewerMessage.textContent = "";
  bolZoomIn.disabled = true;
  bolZoomOut.disabled = true;
  bolViewer.closest(".modal-panel")?.classList.remove("is-zoomed");

  if (isImage) {
    currentBolViewerCanZoom = true;
    bolZoomIn.disabled = false;
    bolZoomOut.disabled = false;
    bolViewerImage.onload = () => {
      if (renderRequestId === currentBolRenderRequestId) setBolZoom(currentBolZoom);
    };
    bolViewerImage.src = document.fileUrl;
    bolViewerImage.alt = formatBolDocumentDate(document.createdAt);
  } else {
    bolViewerImage.hidden = true;
    showBolViewerMessage("Loading PDF preview...");
    renderPdfFirstPage(document, renderRequestId);
  }

  bolViewerTitle.textContent = formatBolDocumentDate(document.createdAt);
  bolViewerCount.textContent = `${currentBolViewerIndex + 1} / ${currentBolViewerDocuments.length}`;
  bolPrev.disabled = currentBolViewerIndex >= currentBolViewerDocuments.length - 1;
  bolNext.disabled = currentBolViewerIndex <= 0;
}

function setBolZoom(zoom) {
  if (!currentBolViewerCanZoom) return;

  const previousScrollWidth = Math.max(bolViewerImageWrap.scrollWidth, bolViewerImageWrap.clientWidth, 1);
  const previousScrollHeight = Math.max(bolViewerImageWrap.scrollHeight, bolViewerImageWrap.clientHeight, 1);
  const previousCenterX = (bolViewerImageWrap.scrollLeft + bolViewerImageWrap.clientWidth / 2) / previousScrollWidth;
  const previousCenterY = (bolViewerImageWrap.scrollTop + bolViewerImageWrap.clientHeight / 2) / previousScrollHeight;
  currentBolZoom = Math.min(3, Math.max(0.75, zoom));
  const panel = bolViewer.closest(".modal-panel");

  panel?.classList.toggle("is-zoomed", currentBolZoom > 1);

  window.requestAnimationFrame(() => {
    const naturalWidth = bolViewerImage.naturalWidth;
    const naturalHeight = bolViewerImage.naturalHeight;
    const availableWidth = bolViewerImageWrap.clientWidth;
    const availableHeight = bolViewerImageWrap.clientHeight;

    if (!naturalWidth || !naturalHeight || !availableWidth || !availableHeight) {
      return;
    }

    const fitScale = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
    const displayWidth = Math.round(naturalWidth * fitScale * currentBolZoom);
    const displayHeight = Math.round(naturalHeight * fitScale * currentBolZoom);
    const marginLeft = currentBolZoom > 1 ? Math.max(0, Math.floor((availableWidth - displayWidth) / 2)) : 0;
    const marginTop = currentBolZoom > 1 ? Math.max(0, Math.floor((availableHeight - displayHeight) / 2)) : 0;

    bolViewerImage.style.width = `${displayWidth}px`;
    bolViewerImage.style.height = `${displayHeight}px`;
    bolViewerImage.style.marginLeft = `${marginLeft}px`;
    bolViewerImage.style.marginTop = `${marginTop}px`;
    bolViewerImage.style.marginRight = `${marginLeft}px`;
    bolViewerImage.style.marginBottom = `${marginTop}px`;
    bolViewerImage.style.transform = "none";

    window.requestAnimationFrame(() => {
      const nextScrollWidth = Math.max(bolViewerImageWrap.scrollWidth, bolViewerImageWrap.clientWidth, 1);
      const nextScrollHeight = Math.max(bolViewerImageWrap.scrollHeight, bolViewerImageWrap.clientHeight, 1);
      bolViewerImageWrap.scrollLeft = Math.max(0, previousCenterX * nextScrollWidth - bolViewerImageWrap.clientWidth / 2);
      bolViewerImageWrap.scrollTop = Math.max(0, previousCenterY * nextScrollHeight - bolViewerImageWrap.clientHeight / 2);
    });
  });
}

async function renderPdfFirstPage(document, renderRequestId) {
  try {
    const pdfjsLib = await loadPdfJs();

    if (renderRequestId !== currentBolRenderRequestId) return;

    const pdf = await pdfjsLib.getDocument({ url: document.fileUrl }).promise;

    if (renderRequestId !== currentBolRenderRequestId) {
      pdf.destroy();
      return;
    }

    const page = await pdf.getPage(1);
    const baseViewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.max(1200, Math.min(2400, Math.round(bolViewerImageWrap.clientWidth * 2)));
    const viewport = page.getViewport({ scale: targetWidth / baseViewport.width });
    const canvas = window.document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({ canvasContext: context, viewport }).promise;
    pdf.destroy();

    if (renderRequestId !== currentBolRenderRequestId) return;

    bolViewerImage.onload = () => {
      if (renderRequestId !== currentBolRenderRequestId) return;

      currentBolViewerCanZoom = true;
      bolZoomIn.disabled = false;
      bolZoomOut.disabled = false;
      setBolZoom(currentBolZoom);
    };
    bolViewerImage.alt = `${document.fileName || "BOL PDF"} - page 1`;
    bolViewerImage.src = canvas.toDataURL("image/png");
    bolViewerImage.hidden = false;
    bolViewerMessage.hidden = true;
    bolViewerMessage.textContent = "";
  } catch (error) {
    console.error("PDF preview failed", error);

    if (renderRequestId !== currentBolRenderRequestId) return;

    bolViewerImage.hidden = true;
    showBolViewerMessage("PDF preview is not available. Use Open to view the file.");
  }
}

async function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs";
      return pdfjsLib;
    });
  }

  return pdfJsPromise;
}

function showBolViewerMessage(message) {
  bolViewerMessage.textContent = message;
  bolViewerMessage.hidden = false;
}

function isViewableBolDocument(document) {
  const fileName = document.fileName || "";

  return Boolean(document.fileUrl && (isImageFile(fileName) || isPdfFile(fileName)));
}

function isImageFile(fileName) {
  return /\.(avif|gif|jpeg|jpg|png|webp)$/i.test(fileName);
}

function isPdfFile(fileName) {
  return /\.pdf$/i.test(fileName);
}

function getBolContentType(fileName) {
  const extension = fileName.split(".").pop()?.toLowerCase();
  const types = {
    avif: "image/avif",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    jpeg: "image/jpeg",
    jpg: "image/jpeg",
    pdf: "application/pdf",
    png: "image/png",
    webp: "image/webp",
  };

  return types[extension] || "application/octet-stream";
}

async function uploadBolDocument(task, file, mode) {
  const createdAt = new Date().toISOString();
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${task.phoneLast7}/${task.id}/${Date.now()}-${safeFileName}`;
  let fileUrl = "";

  try {
    const { error } = await supabaseClient.storage.from(bolBucket).upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type || getBolContentType(file.name),
      upsert: true,
    });

    if (!error) {
      const { data } = supabaseClient.storage.from(bolBucket).getPublicUrl(filePath);
      fileUrl = data.publicUrl;
    } else {
      console.warn("BOL upload failed:", error.message);
    }
  } catch (error) {
    console.warn("BOL upload failed:", error.message || error);
  }

  const document = {
    id: crypto.randomUUID(),
    taskId: task.id,
    phoneLast7: task.phoneLast7,
    company: task.company,
    vehicle: task.vehicle,
    driver: task.driver,
    mode,
    fileName: file.name,
    filePath,
    fileUrl,
    size: file.size,
    createdAt,
  };

  if (!fileUrl) {
    return document;
  }

  driverDocuments = [document, ...driverDocuments];
  writeStorage(storageKeys.driverDocuments, driverDocuments);
  await saveDriverDocumentToDatabase(document);
  renderTasks();
  renderVehicles();
  return document;
}

async function cleanupOldBolDocuments() {
  const cutoff = getBolCutoffTime();
  const cutoffIso = new Date(cutoff).toISOString();
  const oldDocuments = driverDocuments.filter((document) => new Date(document.createdAt).getTime() < cutoff);

  driverDocuments = driverDocuments.filter((document) => new Date(document.createdAt).getTime() >= cutoff);
  bolRequests = bolRequests.filter((request) => new Date(request.requestedAt).getTime() >= cutoff);
  writeStorage(storageKeys.driverDocuments, driverDocuments);
  writeStorage(storageKeys.bolRequests, bolRequests);

  if (databaseReady && bolRequestsDatabaseReady) {
    await supabaseClient.from(dbTables.bolRequests).delete().lt("requested_at", cutoffIso);
  }

  if (!databaseReady || !bolDatabaseReady) return;

  const { data: staleDocuments, error: selectError } = await supabaseClient
    .from(dbTables.driverDocuments)
    .select("file_path")
    .lt("created_at", cutoffIso);

  if (selectError) {
    console.warn("Old BOL document lookup failed:", selectError.message);
    return;
  }

  const { error: deleteError } = await supabaseClient
    .from(dbTables.driverDocuments)
    .delete()
    .lt("created_at", cutoffIso);

  if (deleteError) {
    console.warn("Old BOL document cleanup failed:", deleteError.message);
  }

  const paths = [
    ...oldDocuments.map((document) => document.filePath),
    ...(staleDocuments || []).map((document) => document.file_path),
  ].filter(Boolean);

  if (paths.length) {
    await supabaseClient.storage.from(bolBucket).remove(paths);
  }
}

function getBolCutoffTime() {
  return Date.now() - 7 * 24 * 60 * 60 * 1000;
}

function startCustomerRequest(type) {
  const activeTask = findActiveTaskForCustomer(customerPhoneLast7);

  if (activeTask) {
    if (activeTask.type === "BOL") {
      pendingRequestType = type;
      pendingTaskChoice = null;
      pendingBol = { mode: "none", file: null };
      pendingBolPurpose = "new-task";
      showRequestOptions(type);
      return;
    }

    localStorage.setItem(storageKeys.customerTask, JSON.stringify({ id: activeTask.id, phoneLast7: customerPhoneLast7 }));
    showTimer(activeTask);
    return;
  }

  if (getActiveBolRequestForCustomer(customerPhoneLast7)) {
    showBolPrompt(type);
    return;
  }

  pendingRequestType = type;
  pendingTaskChoice = null;
  pendingBol = { mode: "none", file: null };
  pendingBolPurpose = "new-task";
  showRequestOptions(type);
}

function showCustomerHome() {
  stopTimer();
  setCustomerSubmitting(false);
  customerHomePanel.hidden = false;
  customerOptionsPanel.hidden = true;
  customerLldPanel.hidden = true;
  customerBolPanel.hidden = true;
  customerTimerPanel.hidden = true;
  customerDoneCheck.hidden = true;
  pendingRequestType = "";
  pendingTaskChoice = null;
  pendingBol = null;
  pendingBolPurpose = "new-task";
  bolMessage.textContent = "";
}

function showBolPrompt(type, purpose = "new-task") {
  setCustomerSubmitting(false);
  pendingRequestType = type;
  pendingTaskChoice = null;
  pendingBol = null;
  pendingBolPurpose = purpose;
  bolCameraInput.value = "";
  bolDocumentInput.value = "";
  bolMessage.textContent = "";
  customerHomePanel.hidden = true;
  customerOptionsPanel.hidden = true;
  customerLldPanel.hidden = true;
  customerBolPanel.hidden = false;
  customerTimerPanel.hidden = true;
  customerDoneCheck.hidden = true;
}

async function handleBolFileChoice(input, mode) {
  const file = input.files?.[0];

  if (!file) return;

  if (file.size > maxBolFileSize) {
    bolMessage.textContent = "File is larger than 150MB.";
    input.value = "";
    return;
  }

  if (pendingBolPurpose === "active-task") {
    await completeActiveTaskBolRequest(file, mode);
    return;
  }

  if (pendingBolPurpose === "camera-task") {
    await createCameraBolTask(file, mode);
    return;
  }

  pendingBol = { mode, file };
  bolMessage.textContent = `${file.name} selected.`;
  showRequestOptions(pendingRequestType);
}

function showRequestOptions(type) {
  setCustomerSubmitting(false);
  pendingRequestType = type;
  pendingTaskChoice = null;
  customerHomePanel.hidden = true;
  customerOptionsPanel.hidden = false;
  customerLldPanel.hidden = true;
  customerBolPanel.hidden = true;
  customerTimerPanel.hidden = true;
  customerDoneCheck.hidden = true;

  requestGrid.innerHTML = buildRequestOptions(type)
    .map(
      (option) => `
        <button
          class="request-option ${getRequestOptionClass(option)}"
          type="button"
          data-type="${escapeAttribute(option.type)}"
          data-desc="${escapeAttribute(option.desc)}"
          ${option.nextType ? `data-next-type="${escapeAttribute(option.nextType)}"` : ""}
        >
          ${escapeHtml(option.label)}
        </button>
      `,
    )
    .join("");
}

function showLldOptions(type, desc) {
  setCustomerSubmitting(false);
  pendingTaskChoice = { type, desc };
  customerHomePanel.hidden = true;
  customerOptionsPanel.hidden = true;
  customerLldPanel.hidden = false;
  customerBolPanel.hidden = true;
  customerTimerPanel.hidden = true;
  customerDoneCheck.hidden = true;
}

function appendLldDescription(desc, lldChoice) {
  const choice = lldChoice === "EMPTY" ? "EMPTY" : "LLD";

  return desc ? `${desc} / ${choice}` : choice;
}

function buildRequestOptions(type) {
  if (type === "HOURS") {
    return [
      { label: "B", type, desc: "BREAK", variant: "hours" },
      ...Array.from({ length: 7 }, (_, index) => {
        const label = `${index + 1}+`;
        return { label, type, desc: label, variant: "hours" };
      }),
    ];
  }

  const hourOptions = getNextHourLabels().map((label) => ({
    label,
    type,
    desc: label === "N" ? "NOW" : label,
  }));

  if (type === "SHIFT") {
    return [
      { label: "N", type, desc: "NOW" },
      ...hourOptions.filter((option) => option.label !== "N"),
      { label: "CF", type: "CYCLE FULL", desc: "", variant: "cycle", nextType: "CYCLE FULL" },
      { label: "C5", type: "CYCLE 50+", desc: "", variant: "cycle", nextType: "CYCLE 50+" },
    ];
  }

  return hourOptions.map((option) => ({ ...option, variant: "cycle" }));
}

function getRequestOptionClass(option) {
  if (option.variant === "cycle") {
    return "is-cycle";
  }

  if (option.variant === "hours") {
    return "is-hours";
  }

  return "";
}

function getNextHourLabels() {
  const now = new Date();
  const firstHour = now.getMinutes() > 0 || now.getSeconds() > 0 ? now.getHours() + 1 : now.getHours();
  const labels = ["N"];

  for (let index = 0; index < 9; index += 1) {
    labels.push(formatHourLabel(firstHour + index));
  }

  return labels;
}

function formatHourLabel(hourValue) {
  const hour = ((hourValue % 24) + 24) % 24;
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}${suffix}`;
}

async function createCameraBolTask(file, mode) {
  const existingBolTask = findCameraBolTaskForCustomer(customerPhoneLast7);

  if (existingBolTask) {
    await completeActiveTaskBolRequest(file, mode);
    showCustomerHome();
    return;
  }

  pendingBol = { mode, file };
  cameraBolTaskMode = true;

  try {
    await createCustomerTask("BOL", getBolDescription({ mode }));
  } finally {
    cameraBolTaskMode = false;
  }
}

async function createCustomerTask(type, desc) {
  if (customerTaskSubmitting) return;
  setCustomerSubmitting(true);

  const activeTask = findActiveTaskForCustomer(customerPhoneLast7);

  try {
    if (activeTask) {
      if (activeTask.type === "BOL" && type !== "BOL") {
        await updateCameraBolTaskToRequest(activeTask, type, desc);
        return;
      }

      localStorage.setItem(storageKeys.customerTask, JSON.stringify({ id: activeTask.id, phoneLast7: customerPhoneLast7 }));
      showTimer(activeTask);
      return;
    }

    const vehicle = findVehicleForCustomer();
    const bolRequired = Boolean(getActiveBolRequestForCustomer(customerPhoneLast7));
    const bol = pendingBol || { mode: "none", file: null };
    const bolDescription = bolRequired ? getBolDescription(bol) : "";
    const task = {
      id: crypto.randomUUID(),
      phoneLast7: customerPhoneLast7,
      company: vehicle?.company || "Customer",
      vehicle: vehicle?.truckNumber || customerPhoneLast7,
      driver: vehicle?.driverName || "",
      type,
      desc: bolDescription ? `${desc} | ${bolDescription}` : desc,
      status: "Active",
      originalType: type,
      bolMode: bol.mode,
      bolFileName: bol.file?.name || "",
      bolFileUrl: "",
      bolUploadedAt: "",
      createdAt: new Date().toISOString(),
    };

    if (bol.file) {
      const document = await uploadBolDocument(task, bol.file, bol.mode);
      task.bolFileUrl = document?.fileUrl || "";
      task.bolFileName = document?.fileName || bol.file.name;
      task.bolUploadedAt = document?.createdAt || "";

      if (!task.bolFileUrl) {
        bolMessage.textContent = "BOL file was saved locally, but upload failed. Try again after refreshing.";
        return;
      }
    }

    tasks = [task, ...tasks.filter((item) => item.status !== "Done")];
    writeStorage(storageKeys.tasks, tasks);
    await saveTaskToDatabase(task);

    if (bolRequired) {
      await fulfillBolRequestsForPhone(task.phoneLast7);
    }

    localStorage.setItem(storageKeys.customerTask, JSON.stringify({ id: task.id, phoneLast7: customerPhoneLast7 }));
    pendingTaskChoice = null;
    renderTasks();
    if (cameraBolTaskMode) {
      showCustomerHome();
      return;
    }

    showTimer(task);
  } catch (error) {
    console.warn("Customer task failed:", error.message || error);
    bolMessage.textContent = "Request was not sent. Try again.";
  } finally {
    setCustomerSubmitting(false);
  }
}

function getBolDescription(bol) {
  return bol?.mode === "none" ? "EMPTY" : "BOL";
}

function showTimer(task) {
  customerHomePanel.hidden = true;
  customerOptionsPanel.hidden = true;
  customerLldPanel.hidden = true;
  customerBolPanel.hidden = true;
  customerTimerPanel.hidden = false;
  customerDoneCheck.hidden = task.status !== "Done";
  pendingBolPurpose = "new-task";
  updateTimer(task);
  updateCustomerBolRequestButton(task);
  stopTimer();
  timerIntervalId = window.setInterval(() => {
    const latestTask = tasks.find((item) => item.id === task.id) || readStorage(storageKeys.tasks).find((item) => item.id === task.id);

    if (latestTask?.status === "Done") {
      notifyCustomerTaskFinished(latestTask);
      customerDoneCheck.hidden = false;
      customerBolRequestButton.hidden = true;
      stopTimer();
      return;
    }

    updateTimer(latestTask || task);
    updateCustomerBolRequestButton(latestTask || task);
  }, 1000);
}

function updateCustomerBolRequestButton(task) {
  const activeRequest = getActiveBolRequestForCustomer(task?.phoneLast7 || customerPhoneLast7);
  const shouldRequestBol = Boolean(activeRequest && task?.status !== "Done");

  customerBolRequestButton.hidden = !shouldRequestBol;

  if (shouldRequestBol && task && customerTimerPanel && !customerTimerPanel.hidden) {
    notifyCustomerBolRequest(activeRequest);
    showBolPrompt(task.type || "BOL", "active-task");
  }
}

function unlockCustomerAudio() {
  if (!customerAudioUnlocked) {
    customerAudioUnlocked = true;
    getCustomerAudioContext()?.resume?.();
  }

  requestNativeCustomerPermissionsOnce();
}

function getCustomerAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) return null;

  if (!customerAudioContext) {
    customerAudioContext = new AudioContextClass();
  }

  return customerAudioContext;
}

function playCustomerTone(sequence) {
  const audioContext = getCustomerAudioContext();

  if (!audioContext) return;

  audioContext.resume?.();

  const startTime = audioContext.currentTime + 0.02;

  sequence.forEach((note, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const noteStart = startTime + index * 0.16;
    const noteEnd = noteStart + 0.12;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(note.frequency, noteStart);
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.22, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteEnd + 0.02);
  });
}

function notifyCustomerBolRequest(request) {
  if (!request?.id || notifiedBolRequestIds.has(request.id)) return;

  notifiedBolRequestIds.add(request.id);
  playCustomerTone([{ frequency: 740 }, { frequency: 980 }]);
  sendCustomerNotification("BOL requested", "Please send BOL: camera, file, or none.");
}

function notifyCustomerTaskFinished(task) {
  if (!task?.id || notifiedFinishedTaskIds.has(task.id)) return;

  notifiedFinishedTaskIds.add(task.id);
  playCustomerTone([{ frequency: 1040 }, { frequency: 820 }, { frequency: 1040 }]);
  sendCustomerNotification("Task finished", "Your task has been closed.");
}

async function requestNativeCustomerPermissions() {
  const plugins = window.Capacitor?.Plugins;

  try {
    await plugins?.LocalNotifications?.requestPermissions?.();

    if (remotePushEnabled) {
      await registerNativePushNotifications();
    }
  } catch (error) {
    console.warn("Native permission request failed:", error.message || error);
  }
}

function isPwaPushSupported() {
  return (
    !isNativeCustomerApp() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext
  );
}

function isIosSafariLike() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalonePwa() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function shouldShowInstallBeforePushState() {
  return isIosSafariLike() && !isStandalonePwa();
}

function preparePwaServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext || isNativeCustomerApp()) return null;

  if (!pwaServiceWorkerRegistrationPromise) {
    pwaServiceWorkerRegistrationPromise = navigator.serviceWorker.register("./sw.js").catch((error) => {
      pwaServiceWorkerRegistrationPromise = null;
      throw error;
    });
  }

  return pwaServiceWorkerRegistrationPromise;
}

async function getPwaServiceWorkerRegistration() {
  const registration = await preparePwaServiceWorker();

  if (!registration) return null;

  return navigator.serviceWorker.ready;
}

async function updatePwaPushButtonState() {
  if (!pwaPushButton) return;

  pwaPushButton.hidden = isNativeCustomerApp();
  pwaPushButton.classList.remove("is-enabled", "is-unavailable");
  pwaPushButton.disabled = false;

  if (!isPwaPushSupported()) {
    pwaPushButton.classList.add("is-unavailable");
    pwaPushButton.disabled = true;
    pwaPushButton.title = "Notifications unavailable";
    pwaPushButton.setAttribute("aria-label", "Notifications unavailable");
    return;
  }

  if (shouldShowInstallBeforePushState()) {
    pwaPushButton.classList.add("is-unavailable");
    pwaPushButton.disabled = true;
    pwaPushButton.title = "Add to Home Screen, then open from the app icon";
    pwaPushButton.setAttribute("aria-label", "Add to Home Screen before enabling notifications");
    return;
  }

  if (Notification.permission === "denied") {
    pwaPushButton.classList.add("is-unavailable");
    pwaPushButton.disabled = true;
    pwaPushButton.title = "Notifications blocked";
    pwaPushButton.setAttribute("aria-label", "Notifications blocked");
    return;
  }

  try {
    const registration = await getPwaServiceWorkerRegistration();
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      pwaPushButton.classList.add("is-enabled");
      pwaPushButton.title = "Notifications enabled";
      pwaPushButton.setAttribute("aria-label", "Notifications enabled");
      return;
    }
  } catch (error) {
    console.warn("Web push status failed:", error.message || error);
  }

  pwaPushButton.title = "Enable notifications";
  pwaPushButton.setAttribute("aria-label", "Enable notifications");
}

async function registerPwaPushNotifications() {
  if (!isPwaPushSupported() || pwaPushRegistrationStarted || !customerPhoneLast7) return;

  if (shouldShowInstallBeforePushState()) {
    updatePwaPushButtonState();
    return;
  }

  pwaPushRegistrationStarted = true;
  pwaPushButton.disabled = true;

  try {
    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      return;
    }

    const registration = await getPwaServiceWorkerRegistration();

    if (!registration) {
      throw new Error("Service worker is not available.");
    }

    const publicKey = await getWebPushPublicKey();
    const subscription =
      (await registration.pushManager.getSubscription()) ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    await saveWebPushSubscriptionToDatabase(subscription);
  } finally {
    pwaPushRegistrationStarted = false;
    updatePwaPushButtonState();
  }
}

async function getWebPushPublicKey() {
  const { data, error } = await supabaseClient.functions.invoke("send-customer-push", {
    body: { action: "web-push-config" },
  });

  if (error) {
    throw error;
  }

  if (!data?.publicKey) {
    throw new Error("Missing VAPID public key.");
  }

  return data.publicKey;
}

async function saveWebPushSubscriptionToDatabase(subscription) {
  if (!subscription || !customerPhoneLast7) return;

  await waitForDatabaseReady();

  const subscriptionJson = subscription.toJSON();
  const endpoint = subscriptionJson.endpoint || subscription.endpoint;

  if (!endpoint) return;

  const { error } = await supabaseClient.from(dbTables.pushTokens).upsert(
    {
      phone_last7: customerPhoneLast7,
      token: endpoint,
      platform: "web",
      app_id: "semafor-pwa",
      subscription: subscriptionJson,
      user_agent: navigator.userAgent,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) {
    throw error;
  }
}

async function syncExistingPwaPushSubscription() {
  if (!isPwaPushSupported() || !customerPhoneLast7 || Notification.permission !== "granted") return;

  const registration = await getPwaServiceWorkerRegistration();
  const subscription = await registration?.pushManager.getSubscription();

  if (subscription) {
    await saveWebPushSubscriptionToDatabase(subscription);
  }
}

async function waitForDatabaseReady() {
  const startedAt = Date.now();

  while (!databaseReady && Date.now() - startedAt < 5000) {
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }

  if (!databaseReady) {
    throw new Error("Database is not ready.");
  }
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    output[index] = rawData.charCodeAt(index);
  }

  return output;
}

function requestNativeCustomerPermissionsOnce() {
  if (customerPermissionRequestStarted) return;

  customerPermissionRequestStarted = true;
  requestNativeCustomerPermissions();
}

async function registerNativePushNotifications() {
  const pushNotifications = window.Capacitor?.Plugins?.PushNotifications;

  if (!remotePushEnabled || !pushNotifications || pushNotificationsReady || !customerPhoneLast7) return;

  pushNotificationsReady = true;

  await pushNotifications.addListener("registration", async (token) => {
    await savePushTokenToDatabase(token.value);
  });

  await pushNotifications.addListener("registrationError", (error) => {
    console.warn("Push registration failed:", error.error || error.message || error);
  });

  let permission = await pushNotifications.checkPermissions();

  if (permission.receive === "prompt") {
    permission = await pushNotifications.requestPermissions();
  }

  if (permission.receive === "granted") {
    await pushNotifications.register();
  }
}

async function savePushTokenToDatabase(token) {
  if (!token || !databaseReady || !customerPhoneLast7) return;

  const platform = window.Capacitor?.getPlatform?.() || "web";
  const { error } = await supabaseClient.from(dbTables.pushTokens).upsert(
    {
      phone_last7: customerPhoneLast7,
      token,
      platform,
      app_id: "com.semafor.customer",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" },
  );

  if (error) {
    console.warn("Push token was not saved:", error.message);
  }
}

async function sendCustomerNotification(title, bodyText) {
  const localNotifications = window.Capacitor?.Plugins?.LocalNotifications;

  if (!localNotifications) return;

  try {
    await localNotifications.schedule({
      notifications: [
        {
          id: Date.now() % 2147483647,
          title,
          body: bodyText,
          schedule: { at: new Date(Date.now() + 250) },
          sound: "default",
        },
      ],
    });
  } catch (error) {
    console.warn("Native notification failed:", error.message || error);
  }
}

function showActiveTaskBolPrompt() {
  const task = getCurrentCustomerTask();

  if (!task || !getActiveBolRequestForCustomer(task.phoneLast7)) return;

  showBolPrompt(task.type || "BOL", "active-task");
}

async function completeActiveTaskBolRequest(file, mode) {
  const task = getCurrentCustomerTask();

  if (!task) {
    restoreCustomerTask();
    return;
  }

  bolMessage.textContent = file ? "Uploading BOL..." : "Saving BOL response...";

  if (file) {
    const document = await uploadBolDocument(task, file, mode);
    task.bolMode = mode;
    task.bolFileUrl = document?.fileUrl || task.bolFileUrl || "";
    task.bolFileName = document?.fileName || file.name;
    task.bolUploadedAt = document?.createdAt || new Date().toISOString();

    if (!document?.fileUrl) {
      bolMessage.textContent = "BOL file was saved locally, but upload failed. Refresh and try again.";
      return;
    }
  }

  task.desc = appendBolResponseDescription(task.desc, mode);
  await fulfillBolRequestsForPhone(task.phoneLast7);
  tasks = tasks.map((item) => (item.id === task.id ? task : item));
  writeStorage(storageKeys.tasks, tasks);
  await saveTaskToDatabase(task);
  renderTasks();
  showTimer(task);
}

function getCurrentCustomerTask() {
  const savedTask = readCustomerTask();
  const activeTask = findActiveTaskForCustomer(customerPhoneLast7);

  if (!savedTask) return activeTask;

  return tasks.find((item) => item.id === savedTask.id && item.phoneLast7 === customerPhoneLast7) || activeTask;
}

function appendBolResponseDescription(desc, mode) {
  const response = mode === "none" ? "EMPTY" : "BOL";
  const value = (desc || "")
    .replace(/\s*\/\s*SEND BOL/g, " / BOL")
    .replace(/\s*\|\s*SEND BOL/g, " | BOL")
    .replace(/\s*\/\s*EMPTY NO BOL/g, " / EMPTY")
    .replace(/\s*\|\s*EMPTY NO BOL/g, " | EMPTY");

  if (value.split(/\s*[|/]\s*/).includes(response)) {
    return value;
  }

  return value ? `${value} / ${response}` : response;
}

async function updateCameraBolTaskToRequest(task, type, desc) {
  markTaskTypeChanged(task.id);

  const updatedTask = {
    ...task,
    type,
    desc,
    originalType: task.originalType || "BOL",
    typeChangedFromBol: true,
  };

  tasks = tasks.map((item) => (item.id === task.id ? updatedTask : item));
  writeStorage(storageKeys.tasks, tasks);
  await saveTaskToDatabase(updatedTask);
  localStorage.setItem(storageKeys.customerTask, JSON.stringify({ id: updatedTask.id, phoneLast7: customerPhoneLast7 }));
  pendingTaskChoice = null;
  renderTasks();
  showTimer(updatedTask);
}

function markTaskTypeChanged(taskId) {
  typeChangedTaskIds.add(taskId);
  writeStorage(storageKeys.typeChangedTasks, [...typeChangedTaskIds]);
}

function restoreCustomerTask() {
  const savedTask = readCustomerTask();
  const savedActiveTask = savedTask
    ? tasks.find((item) => item.id === savedTask.id && item.phoneLast7 === customerPhoneLast7 && item.status !== "Done")
    : null;
  const task = savedActiveTask || findActiveTaskForCustomer(customerPhoneLast7);

  if (task) {
    localStorage.setItem(storageKeys.customerTask, JSON.stringify({ id: task.id, phoneLast7: customerPhoneLast7 }));

    if (task.type === "BOL") {
      showCustomerHome();
      return;
    }

    showTimer(task);
    return;
  }

  showCustomerHome();
}

function findActiveTaskForCustomer(phoneLast7) {
  return tasks.find((task) => task.phoneLast7 === phoneLast7 && task.status !== "Done") || null;
}

function findCameraBolTaskForCustomer(phoneLast7) {
  return tasks.find((task) => task.phoneLast7 === phoneLast7 && task.status !== "Done" && task.type === "BOL") || null;
}

function updateTimer(task) {
  const startedAt = new Date(task.createdAt).getTime();
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  timerValue.textContent = `${minutes}:${seconds}`;
}

function stopTimer() {
  if (timerIntervalId) {
    window.clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

function setCustomerSubmitting(isSubmitting) {
  customerTaskSubmitting = isSubmitting;
  customerScreen.classList.toggle("is-submitting", isSubmitting);
}

async function runCustomerAction(action) {
  if (customerTaskSubmitting) return;

  try {
    await action();
  } catch (error) {
    console.warn("Customer action failed:", error.message || error);
    bolMessage.textContent = "Action failed. Try again.";
    setCustomerSubmitting(false);
  }
}

function isCustomerChoosingRequest() {
  return (
    !customerOptionsPanel.hidden ||
    !customerLldPanel.hidden ||
    (!customerBolPanel.hidden && pendingBolPurpose !== "active-task")
  );
}

async function finishTask(taskId) {
  const task = tasks.find((item) => item.id === taskId);

  if (
    shouldWarnTypeChangedBeforeFinish(task) &&
    !window.confirm("Da li ste primetili da je TYPE promenjen u medjuvremenu?")
  ) {
    return;
  }

  tasks = tasks.map((task) => (task.id === taskId ? { ...task, status: "Done", finishedAt: new Date().toISOString() } : task));
  writeStorage(storageKeys.tasks, tasks);
  typeChangedTaskIds.delete(taskId);
  writeStorage(storageKeys.typeChangedTasks, [...typeChangedTaskIds]);
  notifyCustomerByPush(task?.phoneLast7, "Task finished", "Your task has been closed.");
  await finishTaskInDatabase(taskId);
  renderTasks();

  const activeCustomerTask = readCustomerTask();

  if (activeCustomerTask?.id === taskId) {
    customerDoneCheck.hidden = false;
  }
}

function shouldWarnTypeChangedBeforeFinish(task) {
  if (!task) return false;

  if (task.typeChangedFromBol || typeChangedTaskIds.has(task.id)) {
    return true;
  }

  const hasBolTrace =
    task.bolMode !== "none" ||
    Boolean(task.bolFileUrl || task.bolFileName || task.bolUploadedAt) ||
    String(task.desc || "")
      .split(/\s*[|/]\s*/)
      .some((part) => part === "BOL" || part === "EMPTY");

  return task.type !== "BOL" && hasBolTrace;
}

async function notifyCustomerByPush(phoneLast7, title, bodyText) {
  if (!databaseReady || !phoneLast7) return;

  try {
    const { error } = await supabaseClient.functions.invoke("send-customer-push", {
      body: {
        phoneLast7,
        title,
        body: bodyText,
      },
    });

    if (error) {
      console.warn("Remote push failed:", error.message || error);
    }
  } catch (error) {
    console.warn("Remote push failed:", error.message || error);
  }
}

async function initializeDatabase() {
  databaseReady = await loadFromDatabase();

  if (!databaseReady) {
    console.warn("Supabase tables are not ready. The app is using localStorage fallback.");
    updateDatabaseStatus("offline");
    return;
  }

  await migrateLocalDataToDatabase();
  await cleanupOldBolDocuments();
  await loadFromDatabase();
  subscribeToDatabaseChanges();
  render();
  updateDatabaseStatus(bolDatabaseReady && bolRequestsDatabaseReady ? "online" : "partial");

  const session = readSession();

  if (session?.role === "customer" && session.phoneLast7) {
    restoreCustomerTask();
  }
}

function updateDatabaseStatus(status) {
  dbStatus.classList.remove("is-online", "is-offline");

  if (status === "online") {
    dbStatus.textContent = "Database connected";
    dbStatus.classList.add("is-online");
    return;
  }

  if (status === "partial") {
    dbStatus.textContent = "Database connected, BOL setup missing";
    dbStatus.classList.add("is-offline");
    return;
  }

  if (status === "offline") {
    dbStatus.textContent = "Database not ready, saving locally";
    dbStatus.classList.add("is-offline");
    return;
  }

  dbStatus.textContent = "Checking database...";
}

async function loadFromDatabase() {
  try {
    const localCompanies = [...companies];
    const localVehicles = [...vehicles];
    const localAdministrators = [...administrators];
    const localTasks = [...tasks];
    const localDriverDocuments = [...driverDocuments];
    const localBolRequests = [...bolRequests];
    const [companiesResult, vehiclesResult, administratorsResult, tasksResult] = await Promise.all([
      supabaseClient.from(dbTables.companies).select("*").order("created_at", { ascending: true }),
      supabaseClient.from(dbTables.vehicles).select("*").order("created_at", { ascending: true }),
      supabaseClient.from(dbTables.administrators).select("*").order("created_at", { ascending: true }),
      supabaseClient.from(dbTables.tasks).select("*").order("created_at", { ascending: false }),
    ]);

    const error = companiesResult.error || vehiclesResult.error || administratorsResult.error || tasksResult.error;

    if (error) {
      throw error;
    }

    const driverDocumentsResult = await supabaseClient
      .from(dbTables.driverDocuments)
      .select("*")
      .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });

    bolDatabaseReady = !driverDocumentsResult.error;

    const bolRequestsResult = await supabaseClient
      .from(dbTables.bolRequests)
      .select("*")
      .gte("requested_at", new Date(getBolCutoffTime()).toISOString())
      .order("requested_at", { ascending: false });

    bolRequestsDatabaseReady = !bolRequestsResult.error;

    companies = companiesResult.data.map(mapCompanyFromDatabase);
    vehicles = vehiclesResult.data.map(mapVehicleFromDatabase);
    administrators = administratorsResult.data.map(mapAdministratorFromDatabase);
    tasks = tasksResult.data.map(mapTaskFromDatabase);
    driverDocuments = bolDatabaseReady ? driverDocumentsResult.data.map(mapDriverDocumentFromDatabase) : localDriverDocuments;
    bolRequests = bolRequestsDatabaseReady ? bolRequestsResult.data.map(mapBolRequestFromDatabase) : localBolRequests;

    if (!companies.length && localCompanies.length) {
      companies = localCompanies;
    }

    if (!vehicles.length && localVehicles.length) {
      vehicles = localVehicles;
    }

    if (!administrators.length && localAdministrators.length) {
      administrators = localAdministrators;
    }

    if (!tasks.length && localTasks.length) {
      tasks = localTasks;
    }

    if (!driverDocuments.length && localDriverDocuments.length) {
      driverDocuments = localDriverDocuments;
    }

    if (!bolRequests.length && localBolRequests.length) {
      bolRequests = localBolRequests;
    }

    if (!administrators.length) {
      administrators = [...defaultAdministrators];
      await saveAdministratorToDatabase(administrators[0], true);
    }

    writeStorage(storageKeys.companies, companies);
    writeStorage(storageKeys.vehicles, vehicles);
    writeStorage(storageKeys.administrators, administrators);
    writeStorage(storageKeys.tasks, tasks);
    writeStorage(storageKeys.driverDocuments, driverDocuments);
    writeStorage(storageKeys.bolRequests, bolRequests);
    return true;
  } catch (error) {
    console.warn("Database load failed:", error.message || error);
    return false;
  }
}

async function migrateLocalDataToDatabase() {
  await Promise.all([
    ...companies.map((company) => saveCompanyToDatabase(company)),
    ...vehicles.map((vehicle) => saveVehicleToDatabase(vehicle)),
    ...administrators.map((admin) => saveAdministratorToDatabase(admin)),
    ...tasks.map((task) => saveTaskToDatabase(task)),
    ...(bolDatabaseReady ? driverDocuments.map((document) => saveDriverDocumentToDatabase(document)) : []),
    ...(bolRequestsDatabaseReady ? bolRequests.map((request) => saveBolRequestToDatabase(request)) : []),
  ]);
}

function subscribeToDatabaseChanges() {
  const channel = supabaseClient
    .channel("semafor-db-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: dbTables.companies }, refreshCompaniesFromDatabase)
    .on("postgres_changes", { event: "*", schema: "public", table: dbTables.vehicles }, refreshVehiclesFromDatabase)
    .on("postgres_changes", { event: "*", schema: "public", table: dbTables.administrators }, refreshAdministratorsFromDatabase)
    .on("postgres_changes", { event: "*", schema: "public", table: dbTables.tasks }, refreshTasksFromDatabase);

  if (bolDatabaseReady) {
    channel.on("postgres_changes", { event: "*", schema: "public", table: dbTables.driverDocuments }, refreshDriverDocumentsFromDatabase);
  }

  if (bolRequestsDatabaseReady) {
    channel.on("postgres_changes", { event: "*", schema: "public", table: dbTables.bolRequests }, refreshBolRequestsFromDatabase);
  }

  channel.subscribe();
}

async function refreshCompaniesFromDatabase() {
  const { data, error } = await supabaseClient.from(dbTables.companies).select("*").order("created_at", { ascending: true });

  if (error) return;

  companies = data.map(mapCompanyFromDatabase);
  writeStorage(storageKeys.companies, companies);
  renderCompanies();
  renderCompanyOptions();
}

async function refreshVehiclesFromDatabase() {
  const { data, error } = await supabaseClient.from(dbTables.vehicles).select("*").order("created_at", { ascending: true });

  if (error) return;

  vehicles = data.map(mapVehicleFromDatabase);
  writeStorage(storageKeys.vehicles, vehicles);
  renderTasks();
  renderVehicles();
}

async function refreshAdministratorsFromDatabase() {
  const { data, error } = await supabaseClient.from(dbTables.administrators).select("*").order("created_at", { ascending: true });

  if (error) return;

  administrators = data.map(mapAdministratorFromDatabase);
  writeStorage(storageKeys.administrators, administrators);
  renderAdministrators();
  renderAdministratorOptions();
}

async function refreshTasksFromDatabase() {
  const { data, error } = await supabaseClient.from(dbTables.tasks).select("*").order("created_at", { ascending: false });

  if (error) return;

  tasks = data.map(mapTaskFromDatabase);
  writeStorage(storageKeys.tasks, tasks);
  renderTasks();
  syncCustomerTaskView();
}

async function refreshDriverDocumentsFromDatabase() {
  const { data, error } = await supabaseClient
    .from(dbTables.driverDocuments)
    .select("*")
    .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });

  if (error) return;

  driverDocuments = data.map(mapDriverDocumentFromDatabase);
  writeStorage(storageKeys.driverDocuments, driverDocuments);
  renderTasks();
  renderVehicles();
}

async function refreshBolRequestsFromDatabase() {
  const { data, error } = await supabaseClient
    .from(dbTables.bolRequests)
    .select("*")
    .gte("requested_at", new Date(getBolCutoffTime()).toISOString())
    .order("requested_at", { ascending: false });

  if (error) return;

  bolRequests = data.map(mapBolRequestFromDatabase);
  writeStorage(storageKeys.bolRequests, bolRequests);
  renderTasks();
  renderVehicles();
  syncCustomerTaskView();

  if (customerTimerPanel && !customerTimerPanel.hidden) {
    const task = getCurrentCustomerTask();
    updateCustomerBolRequestButton(task);
  }
}

async function saveCompanyToDatabase(company) {
  if (!databaseReady) return;

  const { error } = await supabaseClient.from(dbTables.companies).upsert(toDatabaseCompany(company));

  if (error) {
    console.warn("Company was saved locally, but not in Supabase:", error.message);
  }
}

async function saveVehicleToDatabase(vehicle) {
  if (!databaseReady) return;

  const { error } = await supabaseClient.from(dbTables.vehicles).upsert(toDatabaseVehicle(vehicle));

  if (error) {
    console.warn("Vehicle was saved locally, but not in Supabase:", error.message);
  }
}

async function updateCompanyInDatabase(company, originalName) {
  if (!databaseReady) return;

  const [companyResult, vehiclesResult, tasksResult] = await Promise.all([
    supabaseClient.from(dbTables.companies).update({ name: company.name }).eq("id", company.id),
    supabaseClient.from(dbTables.vehicles).update({ company: company.name }).eq("company", originalName),
    supabaseClient.from(dbTables.tasks).update({ company: company.name }).eq("company", originalName),
  ]);

  const error = companyResult.error || vehiclesResult.error || tasksResult.error;

  if (error) {
    console.warn("Company properties were saved locally, but not fully in Supabase:", error.message);
  }
}

async function updateVehicleInDatabase(vehicle, originalTruckNumber) {
  if (!databaseReady) return;

  const [vehicleResult, tasksResult] = await Promise.all([
    supabaseClient.from(dbTables.vehicles).update(toDatabaseVehicle(vehicle)).eq("id", vehicle.id),
    supabaseClient
      .from(dbTables.tasks)
      .update({
        phone_last7: getLastSevenDigits(vehicle.driverPhone),
        company: vehicle.company,
        vehicle: vehicle.truckNumber,
        driver: vehicle.driverName,
      })
      .eq("vehicle", originalTruckNumber),
  ]);

  const error = vehicleResult.error || tasksResult.error;

  if (error) {
    console.warn("Vehicle properties were saved locally, but not fully in Supabase:", error.message);
  }
}

async function saveAdministratorToDatabase(admin, force = false) {
  if (!databaseReady && !force) return;

  const { error } = await supabaseClient.from(dbTables.administrators).upsert(toDatabaseAdministrator(admin), {
    onConflict: "username",
  });

  if (error) {
    console.warn("Administrator was saved locally, but not in Supabase:", error.message);
  }
}

async function updateAdministratorPasswordInDatabase(username, password) {
  if (!databaseReady) return;

  const { error } = await supabaseClient.from(dbTables.administrators).update({ password }).eq("username", username);

  if (error) {
    console.warn("Administrator password was changed locally, but not in Supabase:", error.message);
  }
}

async function saveTaskToDatabase(task) {
  if (!databaseReady) return;

  const { error } = await supabaseClient.from(dbTables.tasks).upsert(toDatabaseTask(task));

  if (error) {
    const retry = await supabaseClient.from(dbTables.tasks).upsert(toDatabaseTask(task, false));

    if (retry.error) {
      console.warn("Task was saved locally, but not in Supabase:", retry.error.message);
    }
  }
}

async function saveDriverDocumentToDatabase(document) {
  if (!databaseReady || !bolDatabaseReady) return;

  const { error } = await supabaseClient.from(dbTables.driverDocuments).upsert(toDatabaseDriverDocument(document));

  if (error) {
    console.warn("BOL document was saved locally, but not in Supabase:", error.message);
  }
}

async function saveBolRequestToDatabase(request) {
  if (!databaseReady || !bolRequestsDatabaseReady) return;

  const { error } = await supabaseClient.from(dbTables.bolRequests).upsert(toDatabaseBolRequest(request));

  if (error) {
    console.warn("BOL request was saved locally, but not in Supabase:", error.message);
  }
}

async function fulfillBolRequestsInDatabase(requestIds, fulfilledAt) {
  if (!databaseReady || !bolRequestsDatabaseReady || !requestIds.length) return;

  const { error } = await supabaseClient
    .from(dbTables.bolRequests)
    .update({ status: "fulfilled", fulfilled_at: fulfilledAt })
    .in("id", requestIds);

  if (error) {
    console.warn("BOL request was fulfilled locally, but not in Supabase:", error.message);
  }
}

async function finishTaskInDatabase(taskId) {
  if (!databaseReady) return;

  const { error } = await supabaseClient
    .from(dbTables.tasks)
    .update({ status: "Done", finished_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error) {
    console.warn("Task was finished locally, but not in Supabase:", error.message);
  }
}

function revealCustomerDoneIfFinished() {
  const activeCustomerTask = readCustomerTask();

  if (!activeCustomerTask) return;

  const task = tasks.find((item) => item.id === activeCustomerTask.id);

  if (task?.status === "Done") {
    notifyCustomerTaskFinished(task);
    customerDoneCheck.hidden = false;
    stopTimer();
  }
}

function syncCustomerTaskView() {
  if (customerScreen.hidden || !customerPhoneLast7) return;

  if (customerTaskSubmitting || isCustomerChoosingRequest()) {
    return;
  }

  const activeRequest = getActiveBolRequestForCustomer(customerPhoneLast7);
  if (activeRequest) {
    notifyCustomerBolRequest(activeRequest);
  }

  const activeTask = findActiveTaskForCustomer(customerPhoneLast7);

  if (activeTask) {
    localStorage.setItem(storageKeys.customerTask, JSON.stringify({ id: activeTask.id, phoneLast7: customerPhoneLast7 }));

    if (activeTask.type === "BOL") {
      showCustomerHome();
      return;
    }

    if (!(pendingBolPurpose === "active-task" && !customerBolPanel.hidden)) {
      showTimer(activeTask);
    }

    return;
  }

  revealCustomerDoneIfFinished();
}

function mapCompanyFromDatabase(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  };
}

function mapVehicleFromDatabase(row) {
  return {
    id: row.id,
    company: row.company,
    truckNumber: row.truck_number,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    createdAt: row.created_at,
  };
}

function mapAdministratorFromDatabase(row) {
  return {
    id: row.id,
    username: row.username,
    password: row.password,
    createdAt: row.created_at,
  };
}

function mapTaskFromDatabase(row) {
  return {
    id: row.id,
    phoneLast7: row.phone_last7,
    company: row.company,
    vehicle: row.vehicle,
    driver: row.driver,
    type: row.type,
    desc: row.description,
    status: row.status,
    bolMode: row.bol_mode || "none",
    bolFileName: row.bol_file_name || "",
    bolFileUrl: row.bol_file_url || "",
    bolUploadedAt: row.bol_uploaded_at || "",
    createdAt: row.created_at,
    finishedAt: row.finished_at,
  };
}

function mapDriverDocumentFromDatabase(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    phoneLast7: row.phone_last7,
    company: row.company,
    vehicle: row.vehicle,
    driver: row.driver,
    mode: row.mode,
    fileName: row.file_name,
    filePath: row.file_path,
    fileUrl: row.file_url,
    size: row.size,
    createdAt: row.created_at,
  };
}

function mapBolRequestFromDatabase(row) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    phoneLast7: row.phone_last7,
    status: row.status || "requested",
    requestedAt: row.requested_at,
    fulfilledAt: row.fulfilled_at || "",
  };
}

function toDatabaseCompany(company) {
  return {
    id: company.id,
    name: company.name,
    created_at: company.createdAt,
  };
}

function toDatabaseVehicle(vehicle) {
  return {
    id: vehicle.id,
    company: vehicle.company,
    truck_number: vehicle.truckNumber,
    driver_name: vehicle.driverName,
    driver_phone: vehicle.driverPhone,
    created_at: vehicle.createdAt || new Date().toISOString(),
  };
}

function toDatabaseAdministrator(admin) {
  return {
    id: admin.id,
    username: admin.username,
    password: admin.password,
    created_at: admin.createdAt,
  };
}

function toDatabaseTask(task, includeBol = true) {
  const payload = {
    id: task.id,
    phone_last7: task.phoneLast7,
    company: task.company,
    vehicle: task.vehicle,
    driver: task.driver,
    type: task.type,
    description: task.desc,
    status: task.status,
    created_at: task.createdAt,
    finished_at: task.finishedAt || null,
  };

  if (includeBol) {
    payload.bol_mode = task.bolMode || "none";
    payload.bol_file_name = task.bolFileName || "";
    payload.bol_file_url = task.bolFileUrl || "";
    payload.bol_uploaded_at = task.bolUploadedAt || null;
  }

  return payload;
}

function toDatabaseDriverDocument(document) {
  return {
    id: document.id,
    task_id: document.taskId,
    phone_last7: document.phoneLast7,
    company: document.company,
    vehicle: document.vehicle,
    driver: document.driver,
    mode: document.mode,
    file_name: document.fileName,
    file_path: document.filePath,
    file_url: document.fileUrl,
    size: document.size,
    created_at: document.createdAt,
  };
}

function toDatabaseBolRequest(request) {
  return {
    id: request.id,
    vehicle_id: request.vehicleId,
    phone_last7: request.phoneLast7,
    status: request.status || "requested",
    requested_at: request.requestedAt,
    fulfilled_at: request.fulfilledAt || null,
  };
}

function findVehicleForCustomer() {
  return vehicles.find((vehicle) => getLastSevenDigits(vehicle.driverPhone) === customerPhoneLast7);
}

function readCustomerTask() {
  try {
    return JSON.parse(localStorage.getItem(storageKeys.customerTask));
  } catch {
    return null;
  }
}

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

function readAdministrators() {
  const saved = readStorage(storageKeys.administrators);

  if (saved.length) {
    return saved;
  }

  writeStorage(storageKeys.administrators, defaultAdministrators);
  return defaultAdministrators;
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}

function formatBolDocumentDate(value) {
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function getLastSevenDigits(value) {
  const digits = String(value).replace(/\D/g, "");

  if (digits.length < 7) {
    return "";
  }

  return digits.slice(-7);
}
