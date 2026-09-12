const state = {
  user: null,
  selectedUser: null,
  users: [],
  messages: []
};

const sections = {
  home: document.getElementById("homeSection"),
  login: document.getElementById("loginSection"),
  register: document.getElementById("registerSection"),
  messages: document.getElementById("messagesSection"),
  notifications: document.getElementById("notificationsSection"),
  launch: document.getElementById("launchSection"),
  staff: document.getElementById("staffSection"),
  admin: document.getElementById("adminSection")
};

const $ = (id) => document.getElementById(id);

function showSection(sectionName) {
  Object.values(sections).forEach((section) => {
    section.classList.add("hidden");
  });

  if (sections[sectionName]) {
    sections[sectionName].classList.remove("hidden");
  }
}

function setMessage(id, message, success = false) {
  const element = $(id);

  if (!element) return;

  element.textContent = message;
  element.className = success
    ? "message success"
    : "message error";
}

function showGlobalMessage(message, success = false) {
  const element = $("globalMessage");

  element.textContent = message;
  element.className = success
    ? "global-message success"
    : "global-message error";

  setTimeout(() => {
    element.textContent = "";
    element.className = "global-message";
  }, 4000);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }

  return data;
}

function updateNavigation() {
  const loggedIn = Boolean(state.user);

  $("loginNavBtn").classList.toggle("hidden", loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);

  $("messagesBtn").classList.toggle("hidden", !loggedIn);
  $("notificationsBtn").classList.toggle("hidden", !loggedIn);

  if (state.user?.isAdmin) {
    $("adminSection").classList.remove("hidden");
  } else {
    $("adminSection").classList.add("hidden");
  }
}

async function loadCurrentUser() {
  try {
    const data = await api("/api/me");
    state.user = data.user || null;
  } catch {
    state.user = null;
  }

  updateNavigation();
}

async function loadNotifications() {
  const list = $("notificationsList");

  list.innerHTML = `<p class="muted">Chargement...</p>`;

  try {
    const data = await api("/api/notifications");

    if (!data.notifications || data.notifications.length === 0) {
      list.innerHTML = `<p class="muted">Aucune notification.</p>`;
      return;
    }

    list.innerHTML = "";

    data.notifications.forEach((notification) => {
      const article = document.createElement("article");
      article.className = "notification-card";

      article.innerHTML = `
        <h3>${escapeHtml(notification.title)}</h3>
        <p>${escapeHtml(notification.content)}</p>
        <small>${formatDate(notification.createdAt)}</small>
      `;

      list.appendChild(article);
    });
  } catch (error) {
    list.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

async function loadUsers() {
  const list = $("usersList");

  list.innerHTML = `<p class="muted">Chargement des membres...</p>`;

  try {
    const data = await api("/api/users");
    state.users = data.users || [];

    if (state.users.length === 0) {
      list.innerHTML = `<p class="muted">Aucun autre membre.</p>`;
      return;
    }

    list.innerHTML = "";

    state.users.forEach((user) => {
      const button = document.createElement("button");
      button.className = "user-button";
      button.textContent = user.username;

      if (state.selectedUser?.id === user.id) {
        button.classList.add("active");
      }

      button.addEventListener("click", () => {
        selectUser(user);
      });

      list.appendChild(button);
    });
  } catch (error) {
    list.innerHTML = `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

async function selectUser(user) {
  state.selectedUser = user;

  $("chatTitle").textContent = `Conversation avec ${user.username}`;
  $("chatMessages").innerHTML =
    `<p class="muted">Chargement des messages...</p>`;

  await loadUsers();
  await loadConversation();
}

async function loadConversation() {
  if (!state.selectedUser) return;

  try {
    const data = await api(
      `/api/messages/${encodeURIComponent(state.selectedUser.id)}`
    );

    state.messages = data.messages || [];
    renderMessages();
  } catch (error) {
    $("chatMessages").innerHTML =
      `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

function renderMessages() {
  const container = $("chatMessages");
  container.innerHTML = "";

  if (state.messages.length === 0) {
    container.innerHTML =
      `<p class="muted">Aucun message dans cette conversation.</p>`;
    return;
  }

  state.messages.forEach((message) => {
    const element = document.createElement("div");

    const ownMessage = message.senderId === state.user.id;

    element.className = ownMessage
      ? "chat-message own-message"
      : "chat-message";

    element.innerHTML = `
      <strong>${escapeHtml(message.senderUsername)}</strong>
      <p>${escapeHtml(message.content)}</p>
      <small>${formatDate(message.createdAt)}</small>
    `;

    container.appendChild(element);
  });

  container.scrollTop = container.scrollHeight;
}

async function sendMessage(event) {
  event.preventDefault();

  if (!state.selectedUser) {
    setMessage("messageStatus", "Sélectionne un membre.");
    return;
  }

  const input = $("messageInput");
  const content = input.value.trim();

  if (!content) return;

  try {
    await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({
        receiverId: state.selectedUser.id,
        content
      })
    });

    input.value = "";
    setMessage("messageStatus", "Message envoyé.", true);

    await loadConversation();
  } catch (error) {
    setMessage("messageStatus", error.message);
  }
}

async function submitLogin(event) {
  event.preventDefault();

  const username = $("loginUsername").value.trim();
  const password = $("loginPassword").value;

  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    state.user = data.user;

    updateNavigation();
    $("loginForm").reset();
    setMessage("loginMessage", "Connexion réussie.", true);

    showSection("home");

    if (state.user.isAdmin) {
      await loadAdminData();
    }
  } catch (error) {
    setMessage("loginMessage", error.message);
  }
}

async function submitRegister(event) {
  event.preventDefault();

  const username = $("registerUsername").value.trim();
  const password = $("registerPassword").value;
  const passwordConfirm = $("registerPasswordConfirm").value;

  if (password !== passwordConfirm) {
    setMessage(
      "registerMessage",
      "Les deux mots de passe ne correspondent pas."
    );
    return;
  }

  try {
    await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password
      })
    });

    $("registerForm").reset();

    setMessage(
      "registerMessage",
      "Compte créé. Tu peux maintenant te connecter.",
      true
    );

    showSection("login");
  } catch (error) {
    setMessage("registerMessage", error.message);
  }
}

async function logout() {
  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch {
    // Même en cas d'erreur, on nettoie l'état local.
  }

  state.user = null;
  state.selectedUser = null;
  state.users = [];
  state.messages = [];

  updateNavigation();
  showSection("home");
  showGlobalMessage("Tu es déconnecté.", true);
}

async function submitLaunchRequest(event) {
  event.preventDefault();

  const reason = $("launchReason").value.trim();

  try {
    await api("/api/launch-requests", {
      method: "POST",
      body: JSON.stringify({ reason })
    });

    $("launchForm").reset();
    setMessage(
      "launchMessage",
      "Ta demande a été envoyée.",
      true
    );
  } catch (error) {
    setMessage("launchMessage", error.message);
  }
}

async function submitStaffApplication(event) {
  event.preventDefault();

  const age = Number($("staffAge").value);
  const experience = $("staffExperience").value.trim();
  const motivation = $("staffMotivation").value.trim();

  try {
    await api("/api/staff-applications", {
      method: "POST",
      body: JSON.stringify({
        age,
        experience,
        motivation
      })
    });

    $("staffForm").reset();

    setMessage(
      "staffMessage",
      "Ta candidature a été envoyée.",
      true
    );
  } catch (error) {
    setMessage("staffMessage", error.message);
  }
}

async function loadAdminData() {
  if (!state.user?.isAdmin) return;

  await Promise.all([
    loadAdminLaunchRequests(),
    loadAdminStaffApplications(),
    loadAdminUsers()
  ]);
}

async function loadAdminLaunchRequests() {
  const container = $("adminLaunchRequests");

  try {
    const data = await api("/api/admin/launch-requests");
    const requests = data.requests || [];

    container.innerHTML = "";

    if (requests.length === 0) {
      container.innerHTML = `<p class="muted">Aucune demande.</p>`;
      return;
    }

    requests.forEach((request) => {
      const card = document.createElement("div");
      card.className = "admin-item";

      card.innerHTML = `
        <h4>${escapeHtml(request.username)}</h4>
        <p>${escapeHtml(request.reason)}</p>
        <small>Statut : ${escapeHtml(request.status)}</small>
        <div class="admin-actions">
          <button data-status="accepted">Accepter</button>
          <button data-status="rejected">Refuser</button>
        </div>
      `;

      card.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
          await updateLaunchRequest(
            request.id,
            button.dataset.status
          );
        });
      });

      container.appendChild(card);
    });
  } catch (error) {
    container.innerHTML =
      `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

async function updateLaunchRequest(id, status) {
  try {
    await api(`/api/admin/launch-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    await loadAdminLaunchRequests();
    showGlobalMessage("Demande mise à jour.", true);
  } catch (error) {
    showGlobalMessage(error.message);
  }
}

async function loadAdminStaffApplications() {
  const container = $("adminStaffApplications");

  try {
    const data = await api("/api/admin/staff-applications");
    const applications = data.applications || [];

    container.innerHTML = "";

    if (applications.length === 0) {
      container.innerHTML = `<p class="muted">Aucune candidature.</p>`;
      return;
    }

    applications.forEach((application) => {
      const card = document.createElement("div");
      card.className = "admin-item";

      card.innerHTML = `
        <h4>${escapeHtml(application.username)}</h4>
        <p><strong>Âge :</strong> ${application.age}</p>
        <p><strong>Expérience :</strong> ${escapeHtml(application.experience)}</p>
        <p><strong>Motivations :</strong> ${escapeHtml(application.motivation)}</p>
        <small>Statut : ${escapeHtml(application.status)}</small>
        <div class="admin-actions">
          <button data-status="accepted">Accepter</button>
          <button data-status="rejected">Refuser</button>
        </div>
      `;

      card.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
          await updateStaffApplication(
            application.id,
            button.dataset.status
          );
        });
      });

      container.appendChild(card);
    });
  } catch (error) {
    container.innerHTML =
      `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

async function updateStaffApplication(id, status) {
  try {
    await api(`/api/admin/staff-applications/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });

    await loadAdminStaffApplications();
    showGlobalMessage("Candidature mise à jour.", true);
  } catch (error) {
    showGlobalMessage(error.message);
  }
}

async function loadAdminUsers() {
  const container = $("adminUsers");

  try {
    const data = await api("/api/admin/users");
    const users = data.users || [];

    container.innerHTML = "";

    users.forEach((user) => {
      const card = document.createElement("div");
      card.className = "admin-item";

      card.innerHTML = `
        <h4>${escapeHtml(user.username)}</h4>
        <p>Admin : ${user.isAdmin ? "Oui" : "Non"}</p>
        <p>Banni : ${user.isBanned ? "Oui" : "Non"}</p>
        <div class="admin-actions">
          <button data-ban="true">Bannir</button>
          <button data-ban="false">Débannir</button>
        </div>
      `;

      card.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
          await updateUserBan(
            user.id,
            button.dataset.ban === "true"
          );
        });
      });

      container.appendChild(card);
    });
  } catch (error) {
    container.innerHTML =
      `<p class="message error">${escapeHtml(error.message)}</p>`;
  }
}

async function updateUserBan(userId, isBanned) {
  try {
    await api(`/api/admin/users/${userId}/ban`, {
      method: "PATCH",
      body: JSON.stringify({ isBanned })
    });

    await loadAdminUsers();
    showGlobalMessage("Utilisateur mis à jour.", true);
  } catch (error) {
    showGlobalMessage(error.message);
  }
}

async function publishNotification(event) {
  event.preventDefault();

  const title = $("notificationTitle").value.trim();
  const content = $("notificationContent").value.trim();

  try {
    await api("/api/admin/notifications", {
      method: "POST",
      body: JSON.stringify({
        title,
        content
      })
    });

    $("notificationForm").reset();

    setMessage(
      "notificationMessage",
      "Notification publiée.",
      true
    );
  } catch (error) {
    setMessage("notificationMessage", error.message);
  }
}

function formatDate(date) {
  if (!date) return "";

  return new Date(date).toLocaleString("fr-FR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Navigation
$("homeBtn").addEventListener("click", () => {
  showSection("home");
});

$("loginNavBtn").addEventListener("click", () => {
  showSection("login");
});

$("messagesBtn").addEventListener("click", async () => {
  if (!state.user) {
    showSection("login");
    return;
  }

  showSection("messages");
  $("messagesLoginNotice").classList.add("hidden");
  $("messagesContent").classList.remove("hidden");

  await loadUsers();
});

$("notificationsBtn").addEventListener("click", async () => {
  if (!state.user) {
    showSection("login");
    return;
  }

  showSection("notifications");
  await loadNotifications();
});

$("launchBtn").addEventListener("click", () => {
  if (!state.user) {
    showSection("login");
    showGlobalMessage("Connecte-toi pour faire une demande.");
    return;
  }

  showSection("launch");
});

$("staffBtn").addEventListener("click", () => {
  if (!state.user) {
    showSection("login");
    showGlobalMessage("Connecte-toi pour envoyer une candidature.");
    return;
  }

  showSection("staff");
});

$("logoutBtn").addEventListener("click", logout);

$("showRegisterBtn").addEventListener("click", () => {
  showSection("register");
});

$("showLoginBtn").addEventListener("click", () => {
  showSection("login");
});

$("adminSection").addEventListener("click", () => {
  if (state.user?.isAdmin) {
    loadAdminData();
  }
});

// Formulaires
$("loginForm").addEventListener("submit", submitLogin);
$("registerForm").addEventListener("submit", submitRegister);
$("messageForm").addEventListener("submit", sendMessage);
$("launchForm").addEventListener("submit", submitLaunchRequest);
$("staffForm").addEventListener("submit", submitStaffApplication);
$("notificationForm").addEventListener("submit", publishNotification);

// Initialisation
(async function init() {
  await loadCurrentUser();

  if (state.user?.isAdmin) {
    await loadAdminData();
  }
})();
