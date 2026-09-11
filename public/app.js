
const $ = s => document.querySelector(s);

let currentUser = null;

// ====================
// UTILITAIRES
// ====================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  let data = {};
  try {
    data = await response.json();
  } catch {}

  return {
    ok: response.ok,
    status: response.status,
    data
  };
}

function showMessage(selector, message, success = false) {
  const element = $(selector);
  if (!element) return;

  element.textContent = message;
  element.style.color = success ? "green" : "crimson";
}

// ====================
// COPIER L'IP
// ====================

async function copyIP() {
  const ip = "2SanSmp.aternos.me";

  try {
    await navigator.clipboard.writeText(ip);
    alert("Adresse copiée !");
  } catch {
    alert("Adresse du serveur : " + ip);
  }
}

// ====================
// MODALE LANCEMENT
// ====================

function openModal() {
  if (!currentUser) {
    alert("Connecte-toi pour envoyer une demande.");
    location.hash = "compte";
    return;
  }

  const modal = $("#modal");
  if (modal) modal.style.display = "flex";
}

function closeModal() {
  const modal = $("#modal");
  if (modal) modal.style.display = "none";
}

// ====================
// COMPTES
// ====================

async function checkSession() {
  const result = await api("/api/me");

  currentUser = result.data.user || null;

  updateAccountUI();

  if (currentUser) {
    await loadNotifications();

    if (currentUser.isAdmin) {
      await loadAdminPanel();
    }
  }
}

function updateAccountUI() {
  const authForms = $("#authForms");
  const loggedArea = $("#loggedArea");
  const usernameDisplay = $("#usernameDisplay");
  const adminLink = $("#adminLink");
  const adminSection = $("#admin");
  const notifications = $("#notifications");

  if (currentUser) {
    if (authForms) authForms.hidden = true;
    if (loggedArea) loggedArea.hidden = false;

    if (usernameDisplay) {
      usernameDisplay.textContent = currentUser.username;
    }

    if (notifications) notifications.hidden = false;

    if (currentUser.isAdmin) {
      if (adminLink) adminLink.hidden = false;
      if (adminSection) adminSection.hidden = false;
    } else {
      if (adminLink) adminLink.hidden = true;
      if (adminSection) adminSection.hidden = true;
    }
  } else {
    if (authForms) authForms.hidden = false;
    if (loggedArea) loggedArea.hidden = true;
    if (notifications) notifications.hidden = true;
    if (adminLink) adminLink.hidden = true;
    if (adminSection) adminSection.hidden = true;
  }
}

// Création de compte

$("#registerForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const form = new FormData(e.target);

  const result = await api("/api/register", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form))
  });

  if (!result.ok) {
    showMessage(
      "#registerResult",
      result.data.error || "Impossible de créer le compte."
    );
    return;
  }

  currentUser = result.data.user;

  showMessage(
    "#registerResult",
    "Compte créé avec succès !",
    true
  );

  e.target.reset();

  updateAccountUI();
  await loadNotifications();

  if (currentUser.isAdmin) {
    await loadAdminPanel();
  }
});

// Connexion

$("#loginForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  const form = new FormData(e.target);

  const result = await api("/api/login", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form))
  });

  if (!result.ok) {
    showMessage(
      "#loginResult",
      result.data.error || "Impossible de se connecter."
    );
    return;
  }

  currentUser = result.data.user;

  showMessage(
    "#loginResult",
    "Connexion réussie !",
    true
  );

  e.target.reset();

  updateAccountUI();
  await loadNotifications();

  if (currentUser.isAdmin) {
    await loadAdminPanel();
  }
});

// Déconnexion

async function logout() {
  const result = await api("/api/logout", {
    method: "POST"
  });

  if (!result.ok) {
    alert("Impossible de se déconnecter.");
    return;
  }

  currentUser = null;

  updateAccountUI();

  $("#notificationsList").innerHTML = "";

  $("#adminLaunchRequests").innerHTML = "";
  $("#adminStaffApplications").innerHTML = "";

  alert("Tu es déconnecté.");
}

// ====================
// NOTIFICATIONS
// ====================

async function loadNotifications() {
  if (!currentUser) return;

  const result = await api("/api/notifications");

  if (!result.ok) return;

  const notifications = result.data;

  const container = $("#notificationsList");
  if (!container) return;

  if (!notifications.length) {
    container.innerHTML = "<p>Aucune notification pour le moment.</p>";
    return;
  }

  container.innerHTML = notifications.map(notification => `
    <div class="notification ${notification.isRead ? "read" : "unread"}">
      <b>${escapeHTML(notification.title)}</b>
      <p>${escapeHTML(notification.message)}</p>
      <small>${new Date(notification.createdAt).toLocaleString("fr-FR")}</small>
      ${
        notification.isRead
          ? ""
          : `<button onclick="markNotificationRead('${notification.id}')">
               Marquer comme lue
             </button>`
      }
    </div>
  `).join("");
}

async function markNotificationRead(id) {
  const result = await api(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST"
  });

  if (result.ok) {
    await loadNotifications();
  }
}

// ====================
// DEMANDES DE LANCEMENT
// ====================

async function loadRequests() {
  const container = $("#requests");
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = "<p>Connecte-toi pour envoyer une demande.</p>";
    return;
  }

  // Les demandes sont privées à l'admin.
  // On ne tente donc pas de charger cette liste pour les joueurs.
  if (!currentUser.isAdmin) {
    container.innerHTML = "<p>Tu peux envoyer une demande de lancement ci-dessous.</p>";
    return;
  }

  const result = await api("/api/launch-requests");

  if (!result.ok) {
    container.textContent = "Impossible de charger les demandes.";
    return;
  }

  const data = result.data;

  container.innerHTML = data.length
    ? data.map(x => `
        <div class="request">
          <b>${escapeHTML(x.pseudo)}</b>
          <p>${escapeHTML(x.message || "")}</p>
          <small>Statut : ${escapeHTML(x.status)}</small>
        </div>
      `).join("")
    : "Aucune demande pour le moment.";
}

$("#launchForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  if (!currentUser) {
    showMessage("#launchResult", "Connecte-toi d'abord.");
    return;
  }

  const form = new FormData(e.target);

  const result = await api("/api/launch-requests", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form))
  });

  if (!result.ok) {
    showMessage(
      "#launchResult",
      result.data.error || "Erreur lors de l'envoi."
    );
    return;
  }

  showMessage(
    "#launchResult",
    "Demande envoyée !",
    true
  );

  e.target.reset();

  closeModal();
});

// ====================
// CANDIDATURES STAFF
// ====================

$("#staffForm")?.addEventListener("submit", async e => {
  e.preventDefault();

  if (!currentUser) {
    showMessage(
      "#staffResult",
      "Connecte-toi avant d'envoyer ta candidature."
    );
    location.hash = "compte";
    return;
  }

  const form = new FormData(e.target);

  const result = await api("/api/staff-applications", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form))
  });

  if (!result.ok) {
    showMessage(
      "#staffResult",
      result.data.error || "Erreur lors de l'envoi."
    );
    return;
  }

  showMessage(
    "#staffResult",
    "Candidature envoyée !",
    true
  );

  e.target.reset();
});

// ====================
// PANEL ADMIN
// ====================

async function loadAdminPanel() {
  if (!currentUser || !currentUser.isAdmin) return;

  const launchResult = await api("/api/launch-requests");
  const staffResult = await api("/api/staff-applications");

  renderAdminLaunchRequests(
    launchResult.ok ? launchResult.data : []
  );

  renderAdminStaffApplications(
    staffResult.ok ? staffResult.data : []
  );
}

function renderAdminLaunchRequests(requests) {
  const container = $("#adminLaunchRequests");
  if (!container) return;

  if (!requests.length) {
    container.innerHTML = "<p>Aucune demande de lancement.</p>";
    return;
  }

  container.innerHTML = requests.map(request => `
    <div class="admin-item">
      <h4>${escapeHTML(request.pseudo)}</h4>
      <p>${escapeHTML(request.message || "")}</p>
      <p>Statut : <b>${escapeHTML(request.status)}</b></p>

      ${
        request.status === "pending"
          ? `
            <button onclick="updateLaunchStatus('${request.id}', 'accepted')">
              Accepter
            </button>

            <button onclick="updateLaunchStatus('${request.id}', 'rejected')">
              Refuser
            </button>
          `
          : ""
      }
    </div>
  `).join("");
}

function renderAdminStaffApplications(applications) {
  const container = $("#adminStaffApplications");
  if (!container) return;

  if (!applications.length) {
    container.innerHTML = "<p>Aucune candidature Staff.</p>";
    return;
  }

  container.innerHTML = applications.map(application => `
    <div class="admin-item">
      <h4>${escapeHTML(application.pseudo)}</h4>
      <p>${escapeHTML(application.reason)}</p>
      <p>Statut : <b>${escapeHTML(application.status)}</b></p>

      ${
        application.status === "pending"
          ? `
            <button onclick="updateStaffStatus('${application.id}', 'accepted')">
              Accepter
            </button>

            <button onclick="updateStaffStatus('${application.id}', 'rejected')">
              Refuser
            </button>
          `
          : ""
      }
    </div>
  `).join("");
}

async function updateLaunchStatus(id, status) {
  if (!currentUser?.isAdmin) return;

  const result = await api(`/api/admin/launch-requests/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });

  if (!result.ok) {
    alert(result.data.error || "Erreur.");
    return;
  }

  await loadAdminPanel();
  await loadNotifications();
}

async function updateStaffStatus(id, status) {
  if (!currentUser?.isAdmin) return;

  const result = await api(`/api/admin/staff-applications/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });

  if (!result.ok) {
    alert(result.data.error || "Erreur.");
    return;
  }

  await loadAdminPanel();
  await loadNotifications();
}

// ====================
// DÉMARRAGE
// ====================

async function init() {
  await checkSession();
  await loadRequests();
}

init();
