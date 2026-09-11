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
    if (authForms) {
      authForms.hidden = true;
    }

    if (loggedArea) {
      loggedArea.hidden = false;
    }

    if (usernameDisplay) {
      usernameDisplay.textContent = currentUser.username;
    }

    if (notifications) {
      notifications.hidden = false;
    }

    if (currentUser.isAdmin) {
      if (adminLink) {
        adminLink.hidden = false;
      }

      if (adminSection) {
        adminSection.hidden = false;
      }
    } else {
      if (adminLink) {
        adminLink.hidden = true;
      }

      if (adminSection) {
        adminSection.hidden = true;
      }
    }
  } else {
    if (authForms) {
      authForms.hidden = false;
    }

    if (loggedArea) {
      loggedArea.hidden = true;
    }

    if (notifications) {
      notifications.hidden = true;
    }

    if (adminLink) {
      adminLink.hidden = true;
    }

    if (adminSection) {
      adminSection.hidden = true;
    }
  }
}

// ====================
// CRÉATION DE COMPTE
// ====================

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

// ====================
// CONNEXION
// ====================

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

  if (!container) {
    return;
  }

  if (!currentUser) {
    container.innerHTML =
      "<p>Connecte-toi pour
