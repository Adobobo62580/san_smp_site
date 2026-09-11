const $ = selector => document.querySelector(selector);

let currentUser = null;

// ====================
// UTILITAIRES
// ====================

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

async function api(url, options = {}) {
  try {
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
    } catch {
      data = {};
    }

    return {
      ok: response.ok,
      status: response.status,
      data
    };
  } catch (error) {
    console.error("Erreur API :", error);

    return {
      ok: false,
      status: 0,
      data: {
        error: "Impossible de contacter le serveur."
      }
    };
  }
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

  if (modal) {
    modal.style.display = "flex";
  }
}

function closeModal() {
  const modal = $("#modal");

  if (modal) {
    modal.style.display = "none";
  }
}

// ====================
// COMPTES
// ====================

async function checkSession() {
  const result = await api("/api/me");

  if (!result.ok) {
    currentUser = null;
    updateAccountUI();
    return;
  }

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

    if (notifications) {
      notifications.hidden = false;
    }

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

// ====================
// CRÉATION DE COMPTE
// ====================

$("#registerForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.target);

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

  event.target.reset();

  updateAccountUI();
  await loadNotifications();

  if (currentUser.isAdmin) {
    await loadAdminPanel();
  }
});

// ====================
// CONNEXION
// ====================

$("#loginForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.target);

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

  event.target.reset();

  updateAccountUI();
  await loadNotifications();

  if (currentUser.isAdmin) {
    await loadAdminPanel();
  }
});

// ====================
// DÉCONNEXION
// ====================

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

  const notificationsList = $("#notificationsList");
  const adminLaunchRequests = $("#adminLaunchRequests");
  const adminStaffApplications = $("#adminStaffApplications");

  if (notificationsList) {
    notificationsList.innerHTML = "";
  }

  if (adminLaunchRequests) {
    adminLaunchRequests.innerHTML = "";
  }

  if (adminStaffApplications) {
    adminStaffApplications.innerHTML = "";
  }

  alert("Tu es déconnecté.");
}

// ====================
// NOTIFICATIONS
// ====================

async function loadNotifications() {
  const container = $("#notificationsList");

  if (!container) return;

  if (!currentUser) {
    container.innerHTML = "<p>Connecte-toi pour voir tes notifications.</p>";
    return;
  }

  container.innerHTML = "<p>Chargement des notifications...</p>";

  const result = await api("/api/notifications");

  if (!result.ok) {
    container.innerHTML = `
      <p style="color: crimson;">
        Impossible de charger les notifications.
        ${escapeHTML(result.data.error || "Erreur inconnue.")}
      </p>
    `;
    return;
  }

  const notifications = Array.isArray(result.data)
    ? result.data
    : [];

  if (notifications.length === 0) {
    container.innerHTML = "<p>Aucune notification pour le moment.</p>";
    return;
  }

  container.innerHTML = notifications.map(notification => `
    <article class="notification ${notification.isRead ? "read" : "unread"}">
      <h4>${escapeHTML(notification.title)}</h4>
      <p>${escapeHTML(notification.message)}</p>
      <small>
        ${notification.createdAt
          ? new Date(notification.createdAt).toLocaleString("fr-FR")
          : ""}
      </small>

      ${
        notification.isRead
          ? ""
          : `
            <button
              type="button"
              onclick="markNotificationRead('${escapeHTML(notification.id)}')"
            >
              Marquer comme lue
            </button>
          `
      }
    </article>
  `).join("");
}

async function markNotificationRead(id) {
  const result = await api(`/api/notifications/${encodeURIComponent(id)}/read`, {
    method: "POST"
  });

  if (!result.ok) {
    alert(result.data.error || "Impossible de modifier la notification.");
    return;
  }

  await loadNotifications();
}

// ====================
// DEMANDE DE LANCEMENT
// ====================

$("#launchForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.target);

  const result = await api("/api/launch-requests", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form))
  });

  if (!result.ok) {
    showMessage(
      "#launchResult",
      result.data.error || "Impossible d'envoyer la demande."
    );
    return;
  }

  showMessage(
    "#launchResult",
    "Demande envoyée avec succès !",
    true
  );

  event.target.reset();
  closeModal();
});

// ====================
// CANDIDATURE STAFF
// ====================

$("#staffForm")?.addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.target);

  const result = await api("/api/staff-applications", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(form))
  });

  if (!result.ok) {
    showMessage(
      "#staffResult",
      result.data.error || "Impossible d'envoyer la candidature."
    );
    return;
  }

  showMessage(
    "#staffResult",
    "Candidature envoyée avec succès !",
    true
  );

  event.target.reset();
});

// ====================
// PANNEAU ADMIN
// ====================

async function loadAdminPanel() {
  await loadAdminLaunchRequests();
  await loadAdminStaffApplications();
}

async function loadAdminLaunchRequests() {
  const container = $("#adminLaunchRequests");

  if (!container) return;

  container.innerHTML = "<p>Chargement...</p>";

  const result = await api("/api/launch-requests");

  if (!result.ok) {
    container.innerHTML = `
      <p style="color: crimson;">
        ${escapeHTML(result.data.error || "Impossible de charger les demandes.")}
      </p>
    `;
    return;
  }

  const requests = Array.isArray(result.data)
    ? result.data
    : [];

  if (requests.length === 0) {
    container.innerHTML = "<p>Aucune demande de lancement.</p>";
    return;
  }

  container.innerHTML = requests.map(request => `
    <article class="admin-item">
      <h4>${escapeHTML(request.pseudo)}</h4>
      <p>${escapeHTML(request.message || "Aucun message.")}</p>
      <p>
        Statut :
        <strong>${escapeHTML(request.status)}</strong>
      </p>

      ${
        request.status === "pending"
          ? `
            <button
              type="button"
              onclick="changeLaunchStatus('${escapeHTML(request.id)}', 'accepted')"
            >
              Accepter
            </button>

            <button
              type="button"
              onclick="changeLaunchStatus('${escapeHTML(request.id)}', 'rejected')"
            >
              Refuser
            </button>
          `
          : ""
      }
    </article>
  `).join("");
}

async function changeLaunchStatus(id, status) {
  const result = await api(`/api/admin/launch-requests/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });

  if (!result.ok) {
    alert(result.data.error || "Impossible de modifier la demande.");
    return;
  }

  await loadAdminLaunchRequests();
}

// ====================
// CANDIDATURES ADMIN
// ====================

async function loadAdminStaffApplications() {
  const container = $("#adminStaffApplications");

  if (!container) return;

  container.innerHTML = "<p>Chargement...</p>";

  const result = await api("/api/staff-applications");

  if (!result.ok) {
    container.innerHTML = `
      <p style="color: crimson;">
        ${escapeHTML(result.data.error || "Impossible de charger les candidatures.")}
      </p>
    `;
    return;
  }

  const applications = Array.isArray(result.data)
    ? result.data
    : [];

  if (applications.length === 0) {
    container.innerHTML = "<p>Aucune candidature Staff.</p>";
    return;
  }

  container.innerHTML = applications.map(application => `
    <article class="admin-item">
      <h4>${escapeHTML(application.pseudo)}</h4>
      <p>${escapeHTML(application.reason)}</p>
      <p>
        Statut :
        <strong>${escapeHTML(application.status)}</strong>
      </p>

      ${
        application.status === "pending"
          ? `
            <button
              type="button"
              onclick="changeStaffStatus('${escapeHTML(application.id)}', 'accepted')"
            >
              Accepter
            </button>

            <button
              type="button"
              onclick="changeStaffStatus('${escapeHTML(application.id)}', 'rejected')"
            >
              Refuser
            </button>
          `
          : ""
      }
    </article>
  `).join("");
}

async function changeStaffStatus(id, status) {
  const result = await api(`/api/admin/staff-applications/${encodeURIComponent(id)}/status`, {
    method: "POST",
    body: JSON.stringify({ status })
  });

  if (!result.ok) {
    alert(result.data.error || "Impossible de modifier la candidature.");
    return;
  }

  await loadAdminStaffApplications();
}

// ====================
// FERMETURE MODALE
// ====================

window.addEventListener("click", event => {
  const modal = $("#modal");

  if (modal && event.target === modal) {
    closeModal();
  }
});

// ====================
// INITIALISATION
// ====================

document.addEventListener("DOMContentLoaded", () => {
  checkSession();
});
