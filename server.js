const express = require("express");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "Adosaurus3614";

const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "site-data.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(
    dataFile,
    JSON.stringify(
      {
        users: [],
        launchRequests: [],
        staffApplications: [],
        notifications: [],
        messages: [],
        staffMembers: [],
        bans: []
      },
      null,
      2
    ),
    "utf8"
  );
}

function emptyData() {
  return {
    users: [],
    launchRequests: [],
    staffApplications: [],
    notifications: [],
    messages: [],
    staffMembers: [],
    bans: []
  };
}

function readData() {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

    const defaults = emptyData();

    for (const key of Object.keys(defaults)) {
      if (!Array.isArray(data[key])) {
        data[key] = [];
      }
    }

    return data;
  } catch (error) {
    console.error("Erreur lecture des données :", error);
    return emptyData();
  }
}

function saveData(data) {
  const temporaryFile = `${dataFile}.tmp`;

  fs.writeFileSync(
    temporaryFile,
    JSON.stringify(data, null, 2),
    "utf8"
  );

  fs.renameSync(temporaryFile, dataFile);
}

function cleanUsername(value) {
  return String(value || "").trim();
}

function normalizeUsername(value) {
  return cleanUsername(value).toLowerCase();
}

function cleanText(value) {
  return String(value || "").trim();
}

function isAdminUsername(username) {
  return normalizeUsername(username) === normalizeUsername(ADMIN_USERNAME);
}

function updateAdminStatus(user) {
  user.isAdmin = isAdminUsername(user.username);
  return user;
}

function getAdmin(data) {
  return data.users.find(user => isAdminUsername(user.username));
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createNotification(data, userId, title, message, type = "general") {
  data.notifications.unshift({
    id: createId(),
    userId,
    title,
    message,
    type,
    isRead: false,
    createdAt: new Date().toISOString()
  });
}

function isUserBanned(data, userId) {
  const ban = data.bans.find(
    item =>
      String(item.userId) === String(userId) &&
      item.active === true
  );

  if (!ban) {
    return null;
  }

  if (ban.expiresAt) {
    const expiration = new Date(ban.expiresAt).getTime();

    if (Date.now() >= expiration) {
      ban.active = false;
      saveData(data);
      return null;
    }
  }

  return ban;
}

function ensureConfiguredAdmin() {
  const data = readData();
  let changed = false;

  for (const user of data.users) {
    const oldStatus = Boolean(user.isAdmin);

    updateAdminStatus(user);

    if (oldStatus !== user.isAdmin) {
      changed = true;
    }
  }

  if (changed) {
    saveData(data);
  }
}

app.use(express.json({ limit: "30kb" }));

app.set("trust proxy", 1);

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "CHANGE-ME-IMMEDIATELY-ON-RENDER",
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ====================
// MIDDLEWARES
// ====================

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "Tu dois être connecté."
    });
  }

  const data = readData();
  const ban = isUserBanned(data, req.session.user.id);

  if (ban) {
    req.session.destroy(() => {});

    return res.status(403).json({
      error: `Ton compte est banni. Raison : ${ban.reason || "Aucune raison indiquée."}`
    });
  }

  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || !req.session.user.isAdmin) {
    return res.status(403).json({
      error: "Accès réservé à l'administrateur."
    });
  }

  next();
}

function requireStaffOrAdmin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "Tu dois être connecté."
    });
  }

  const data = readData();

  if (req.session.user.isAdmin) {
    return next();
  }

  const isStaff = data.staffMembers.some(
    member =>
      String(member.userId) === String(req.session.user.id) &&
      member.active === true
  );

  if (!isStaff) {
    return res.status(403).json({
      error: "Accès réservé au Staff."
    });
  }

  next();
}

// ====================
// COMPTES
// ====================

app.post("/api/register", async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || "");

    if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
      return res.status(400).json({
        error:
          "Pseudo invalide. Utilise uniquement des lettres, chiffres et _."
      });
    }

    if (password.length < 8 || password.length > 100) {
      return res.status(400).json({
        error:
          "Le mot de passe doit contenir entre 8 et 100 caractères."
      });
    }

    const data = readData();
    const usernameNormalized = normalizeUsername(username);

    const existingUser = data.users.find(
      user =>
        normalizeUsername(user.username) === usernameNormalized
    );

    if (existingUser) {
      return res.status(409).json({
        error: "Ce pseudo est déjà utilisé."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = {
      id: createId(),
      username,
      usernameNormalized,
      passwordHash,
      isAdmin: isAdminUsername(username),
      createdAt: new Date().toISOString()
    };

    data.users.push(user);
    saveData(data);

    req.session.regenerate(error => {
      if (error) {
        console.error(error);

        return res.status(500).json({
          error: "Impossible de créer la session."
        });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin
      };

      req.session.save(sessionError => {
        if (sessionError) {
          console.error(sessionError);

          return res.status(500).json({
            error: "Impossible de sauvegarder la session."
          });
        }

        res.json({
          ok: true,
          user: req.session.user
        });
      });
    });
  } catch (error) {
    console.error("Erreur création compte :", error);

    res.status(500).json({
      error: "Impossible de créer le compte."
    });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const username = cleanUsername(req.body.username);
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({
        error: "Entre ton pseudo et ton mot de passe."
      });
    }

    const data = readData();
    const usernameNormalized = normalizeUsername(username);

    const user = data.users.find(
      item =>
        normalizeUsername(item.username) === usernameNormalized ||
        item.usernameNormalized === usernameNormalized
    );

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        error: "Pseudo ou mot de passe incorrect."
      });
    }

    const ban = isUserBanned(data, user.id);

    if (ban) {
      return res.status(403).json({
        error: `Compte banni. Raison : ${ban.reason || "Aucune raison indiquée."}`
      });
    }

    const passwordIsCorrect = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordIsCorrect) {
      return res.status(401).json({
        error: "Pseudo ou mot de passe incorrect."
      });
    }

    const oldAdminStatus = Boolean(user.isAdmin);

    updateAdminStatus(user);

    if (oldAdminStatus !== user.isAdmin) {
      saveData(data);
    }

    req.session.regenerate(error => {
      if (error) {
        return res.status(500).json({
          error: "Impossible de créer la session."
        });
      }

      req.session.user = {
        id: user.id,
        username: user.username,
        isAdmin: user.isAdmin
      };

      req.session.save(sessionError => {
        if (sessionError) {
          return res.status(500).json({
            error: "Impossible de sauvegarder la session."
          });
        }

        res.json({
          ok: true,
          user: req.session.user
        });
      });
    });
  } catch (error) {
    console.error("Erreur connexion :", error);

    res.status(500).json({
      error: "Impossible de se connecter."
    });
  }
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(error => {
    if (error) {
      return res.status(500).json({
        error: "Impossible de se déconnecter."
      });
    }

    res.clearCookie("connect.sid");

    res.json({
      ok: true
    });
  });
});

app.get("/api/me", (req, res) => {
  res.json({
    user: req.session.user || null
  });
});

// ====================
// DEMANDES DE LANCEMENT
// ====================

app.get("/api/launch-requests", requireAdmin, (req, res) => {
  const data = readData();

  res.json(data.launchRequests);
});

app.post("/api/launch-requests", requireLogin, (req, res) => {
  const pseudo = cleanUsername(req.body.pseudo);
  const message = cleanText(req.body.message);

  if (!pseudo || pseudo.length > 32 || message.length > 300) {
    return res.status(400).json({
      error: "Informations invalides."
    });
  }

  const data = readData();

  const request = {
    id: createId(),
    userId: req.session.user.id,
    pseudo,
    message,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.launchRequests.unshift(request);

  const admin = getAdmin(data);

  if (admin) {
    createNotification(
      data,
      admin.id,
      "Nouvelle demande de lancement",
      `${pseudo} demande de lancer le serveur.`,
      "launch"
    );
  }

  saveData(data);

  res.json({
    ok: true
  });
});

app.post(
  "/api/admin/launch-requests/:id/status",
  requireAdmin,
  (req, res) => {
    const data = readData();

    const request = data.launchRequests.find(
      item => String(item.id) === String(req.params.id)
    );

    if (!request) {
      return res.status(404).json({
        error: "Demande introuvable."
      });
    }

    const status = req.body.status;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        error: "Statut invalide."
      });
    }

    request.status = status;

    createNotification(
      data,
      request.userId,
      status === "accepted"
        ? "Demande de lancement acceptée"
        : "Demande de lancement refusée",
      status === "accepted"
        ? "Ta demande de lancement a été acceptée."
        : "Ta demande de lancement a été refusée.",
      "launch"
    );

    saveData(data);

    res.json({
      ok: true
    });
  }
);

// ====================
// CANDIDATURES STAFF
// ====================

app.get("/api/staff-applications", requireAdmin, (req, res) => {
  const data = readData();

  res.json(data.staffApplications);
});

app.post("/api/staff-applications", requireLogin, (req, res) => {
  const pseudo = cleanUsername(req.body.pseudo);
  const reason = cleanText(req.body.reason);

  if (
    !pseudo ||
    !reason ||
    pseudo.length > 32 ||
    reason.length > 1000
  ) {
    return res.status(400).json({
      error: "Remplis tous les champs correctement."
    });
  }

  const data = readData();

  const application = {
    id: createId(),
    userId: req.session.user.id,
    pseudo,
    reason,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.staffApplications.unshift(application);

  const admin = getAdmin(data);

  if (admin) {
    createNotification(
      data,
      admin.id,
      "Nouvelle candidature Staff",
      `${pseudo} a envoyé une candidature Staff.`,
      "staff"
    );
  }

  saveData(data);

  res.json({
    ok: true
  });
});

// Accepter ou refuser une candidature
app.post(
  "/api/admin/staff-applications/:id/status",
  requireAdmin,
  (req, res) => {
    const data = readData();

    const application = data.staffApplications.find(
      item => String(item.id) === String(req.params.id)
    );

    if (!application) {
      return res.status(404).json({
        error: "Candidature introuvable."
      });
    }

    const status = req.body.status;

    if (!["accepted", "rejected"].includes(status)) {
      return res.status(400).json({
        error: "Statut invalide."
      });
    }

    application.status = status;
    application.updatedAt = new Date().toISOString();

    if (status === "accepted") {
      const alreadyStaff = data.staffMembers.find(
        member =>
          String(member.userId) === String(application.userId) &&
          member.active === true
      );

      if (!alreadyStaff) {
        data.staffMembers.push({
          id: createId(),
          userId: application.userId,
          username: application.pseudo,
          applicationId: application.id,
          active: true,
          acceptedAt: new Date().toISOString()
        });
      }

      createNotification(
        data,
        application.userId,
        "Candidature Staff acceptée",
        "Félicitations ! Ta candidature Staff a été acceptée.",
        "staff"
      );
    }

    if (status === "rejected") {
      data.staffMembers = data.staffMembers.filter(
        member =>
          String(member.userId) !== String(application.userId)
      );

      createNotification(
        data,
        application.userId,
        "Candidature Staff refusée",
        "Ta candidature Staff a été refusée.",
        "staff"
      );
    }

    saveData(data);

    res.json({
      ok: true,
      status
    });
  }
);

// ====================
// MON STAFF
// ====================

app.get("/api/admin/staff-members", requireAdmin, (req, res) => {
  const data = readData();

  const staff = data.staffMembers
    .filter(member => member.active === true)
    .map(member => {
      const user = data.users.find(
        item => String(item.id) === String(member.userId)
      );

      return {
        ...member,
        username: user ? user.username : member.username,
        userExists: Boolean(user)
      };
    });

  res.json(staff);
});

app.post(
  "/api/admin/staff-members/:userId/remove",
  requireAdmin,
  (req, res) => {
    const data = readData();

    const member = data.staffMembers.find(
      item =>
        String(item.userId) === String(req.params.userId) &&
        item.active === true
    );

    if (!member) {
      return res.status(404).json({
        error: "Membre Staff introuvable."
      });
    }

    member.active = false;
    member.removedAt = new Date().toISOString();

    createNotification(
      data,
      member.userId,
      "Retrait du Staff",
      "Tu as été retiré du Staff.",
      "staff"
    );

    saveData(data);

    res.json({
      ok: true
    });
  }
);

// ====================
// MESSAGERIE
// ====================

// Voir les conversations accessibles
app.get("/api/messages/conversations", requireLogin, (req, res) => {
  const data = readData();
  const currentUser = req.session.user;

  let allowedUserIds = [];

  if (currentUser.isAdmin) {
    allowedUserIds = data.staffMembers
      .filter(member => member.active === true)
      .map(member => String(member.userId));
  } else {
    const isStaff = data.staffMembers.some(
      member =>
        String(member.userId) === String(currentUser.id) &&
        member.active === true
    );

    if (!isStaff) {
      return res.status(403).json({
        error: "Tu ne fais pas partie du Staff."
      });
    }

    const admin = getAdmin(data);

    if (admin) {
      allowedUserIds.push(String(admin.id));
    }
  }

  const conversations = allowedUserIds.map(userId => {
    const user = data.users.find(
      item => String(item.id) === String(userId)
    );

    const messages = data.messages
      .filter(
        message =>
          (String(message.senderId) === String(currentUser.id) &&
            String(message.receiverId) === String(userId)) ||
          (String(message.senderId) === String(userId) &&
            String(message.receiverId) === String(currentUser.id))
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
      );

    return {
      userId,
      username: user ? user.username : "Utilisateur inconnu",
      lastMessage: messages[0] || null,
      unreadCount: messages.filter(
        message =>
          String(message.receiverId) === String(currentUser.id) &&
          message.isRead === false
      ).length
    };
  });

  res.json(conversations);
});

// Voir les messages avec un utilisateur
app.get(
  "/api/messages/:userId",
  requireLogin,
  (req, res) => {
    const data = readData();
    const currentUser = req.session.user;
    const targetUserId = String(req.params.userId);

    const targetUser = data.users.find(
      user => String(user.id) === targetUserId
    );

    if (!targetUser) {
      return res.status(404).json({
        error: "Utilisateur introuvable."
      });
    }

    const isAdmin = currentUser.isAdmin;

    const isStaff = data.staffMembers.some(
      member =>
        String(member.userId) === String(currentUser.id) &&
        member.active === true
    );

    const targetIsStaff = data.staffMembers.some(
      member =>
        String(member.userId) === targetUserId &&
        member.active === true
    );

    const allowed =
      (isAdmin && targetIsStaff) ||
      (isStaff && targetUserId === String(getAdmin(data)?.id));

    if (!allowed) {
      return res.status(403).json({
        error: "Tu ne peux pas accéder à cette conversation."
      });
    }

    const messages = data.messages
      .filter(
        message =>
          (String(message.senderId) === String(currentUser.id) &&
            String(message.receiverId) === targetUserId) ||
          (String(message.senderId) === targetUserId &&
            String(message.receiverId) === String(currentUser.id))
      )
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime()
      );

    for (const message of messages) {
      if (
        String(message.receiverId) === String(currentUser.id)
      ) {
        message.isRead = true;
      }
    }

    saveData(data);

    res.json({
      user: {
        id: targetUser.id,
        username: targetUser.username
      },
      messages
    });
  }
);

// Envoyer un message
app.post("/api/messages", requireLogin, (req, res) => {
  const data = readData();
  const currentUser = req.session.user;

  const receiverId = String(req.body.receiverId || "");
  const content = cleanText(req.body.content);

  if (!receiverId || !content || content.length > 2000) {
    return res.status(400).json({
      error: "Message invalide."
    });
  }

  const receiver = data.users.find(
    user => String(user.id) === receiverId
  );

  if (!receiver) {
    return res.status(404).json({
      error: "Destinataire introuvable."
    });
  }

  const senderIsAdmin = currentUser.isAdmin;

  const senderIsStaff = data.staffMembers.some(
    member =>
      String(member.userId) === String(currentUser.id) &&
      member.active === true
  );

  const receiverIsStaff = data.staffMembers.some(
    member =>
      String(member.userId) === receiverId &&
      member.active === true
  );

  const allowed =
    (senderIsAdmin && receiverIsStaff) ||
    (senderIsStaff && isAdminUsername(receiver.username));

  if (!allowed) {
    return res.status(403).json({
      error: "Tu ne peux pas envoyer de message à cet utilisateur."
    });
  }

  const message = {
    id: createId(),
    senderId: currentUser.id,
    senderUsername: currentUser.username,
    receiverId,
    receiverUsername: receiver.username,
    content,
    isRead: false,
    createdAt: new Date().toISOString()
  };

  data.messages.push(message);

  createNotification(
    data,
    receiverId,
    "Nouveau message",
    `${currentUser.username} t'a envoyé un message.`,
    "message"
  );

  saveData(data);

  res.json({
    ok: true,
    message
  });
});

// ====================
// BANNISSEMENTS
// ====================

// Voir les bannissements
app.get("/api/admin/bans", requireAdmin, (req, res) => {
  const data = readData();

  const bans = data.bans.map(ban => {
    const user = data.users.find(
      item => String(item.id) === String(ban.userId)
    );

    return {
      ...ban,
      username: user ? user.username : "Utilisateur supprimé"
    };
  });

  res.json(bans);
});

// Bannir un compte
app.post("/api/admin/bans", requireAdmin, (req, res) => {
  const data = readData();

  const userId = String(req.body.userId || "");
  const reason = cleanText(req.body.reason);
  const duration = String(req.body.duration || "permanent");

  const user = data.users.find(
    item => String(item.id) === userId
  );

  if (!user) {
    return res.status(404).json({
      error: "Utilisateur introuvable."
    });
  }

  if (isAdminUsername(user.username)) {
    return res.status(400).json({
      error: "Tu ne peux pas bannir le compte administrateur."
    });
  }

  if (!["permanent", "1h", "1d", "7d", "30d"].includes(duration)) {
    return res.status(400).json({
      error: "Durée de bannissement invalide."
    });
  }

  const existingBan = data.bans.find(
    ban =>
      String(ban.userId) === userId &&
      ban.active === true
  );

  if (existingBan) {
    return res.status(409).json({
      error: "Ce compte est déjà banni."
    });
  }

  let expiresAt = null;

  const durations = {
    "1h": 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
    "7d": 7 * 24 * 60 * 60 * 1000,
    "30d": 30 * 24 * 60 * 60 * 1000
  };

  if (duration !== "permanent") {
    expiresAt = new Date(
      Date.now() + durations[duration]
    ).toISOString();
  }

  const ban = {
    id: createId(),
    userId,
    reason: reason || "Aucune raison indiquée.",
    duration,
    expiresAt,
    active: true,
    createdAt: new Date().toISOString(),
    bannedBy: req.session.user.username
  };

  data.bans.push(ban);

  createNotification(
    data,
    userId,
    "Compte banni",
    `Ton compte a été banni. Raison : ${ban.reason}`,
    "ban"
  );

  saveData(data);

  res.json({
    ok: true,
    ban
  });
});

// Débannir un compte
app.post(
  "/api/admin/bans/:userId/unban",
  requireAdmin,
  (req, res) => {
    const data = readData();

    const ban = data.bans.find(
      item =>
        String(item.userId) === String(req.params.userId) &&
        item.active === true
    );

    if (!ban) {
      return res.status(404).json({
        error: "Bannissement introuvable."
      });
    }

    ban.active = false;
    ban.unbannedAt = new Date().toISOString();

    createNotification(
      data,
      ban.userId,
      "Compte débanni",
      "Ton compte a été débanni. Tu peux maintenant te reconnecter.",
      "ban"
    );

    saveData(data);

    res.json({
      ok: true
    });
  }
);

// ====================
// NOTIFICATIONS
// ====================

app.get("/api/notifications", requireLogin, (req, res) => {
  const data = readData();

  const notifications = data.notifications.filter(
    notification =>
      String(notification.userId) ===
      String(req.session.user.id)
  );

  res.json(notifications);
});

app.post(
  "/api/notifications/:id/read",
  requireLogin,
  (req, res) => {
    const data = readData();

    const notification = data.notifications.find(
      item =>
        String(item.id) === String(req.params.id) &&
        String(item.userId) ===
          String(req.session.user.id)
    );

    if (!notification) {
      return res.status(404).json({
        error: "Notification introuvable."
      });
    }

    notification.isRead = true;

    saveData(data);

    res.json({
      ok: true
    });
  }
);

// ====================
// DÉMARRAGE
// ====================

ensureConfiguredAdmin();

app.listen(PORT, () => {
  console.log(`SAN SMP lancé sur le port ${PORT}`);
});
