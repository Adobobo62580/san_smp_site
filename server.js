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
        notifications: []
      },
      null,
      2
    )
  );
}

function readData() {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));

    data.users = Array.isArray(data.users) ? data.users : [];
    data.launchRequests = Array.isArray(data.launchRequests)
      ? data.launchRequests
      : [];
    data.staffApplications = Array.isArray(data.staffApplications)
      ? data.staffApplications
      : [];
    data.notifications = Array.isArray(data.notifications)
      ? data.notifications
      : [];

    return data;
  } catch (error) {
    console.error("Erreur lecture des données :", error);

    return {
      users: [],
      launchRequests: [],
      staffApplications: [],
      notifications: []
    };
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

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function cleanUsername(value) {
  return String(value || "").trim();
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

function ensureConfiguredAdmin() {
  const data = readData();
  let changed = false;

  for (const user of data.users) {
    const previousStatus = Boolean(user.isAdmin);

    updateAdminStatus(user);

    if (previousStatus !== user.isAdmin) {
      changed = true;
    }
  }

  if (changed) {
    saveData(data);
    console.log("Les droits administrateur ont été corrigés.");
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

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({
      error: "Tu dois être connecté."
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

function createNotification(data, userId, title, message, type) {
  data.notifications.unshift({
    id: `${Date.now()}-${Math.random()}`,
    userId,
    title,
    message,
    type,
    isRead: false,
    createdAt: new Date().toISOString()
  });
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
    const normalizedUsername = normalizeUsername(username);

    const existingUser = data.users.find(
      user => normalizeUsername(user.username) === normalizedUsername
    );

    if (existingUser) {
      return res.status(409).json({
        error: "Ce pseudo est déjà utilisé."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = {
      id: `${Date.now()}-${Math.random()}`,
      username,
      usernameNormalized: normalizedUsername,
      passwordHash,
      isAdmin: isAdminUsername(username),
      createdAt: new Date().toISOString()
    };

    data.users.push(user);
    saveData(data);

    req.session.regenerate(error => {
      if (error) {
        console.error("Erreur régénération session :", error);

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
          console.error("Erreur sauvegarde session :", sessionError);

          return res.status(500).json({
            error: "Impossible de sauvegarder la session."
          });
        }

        return res.json({
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
    const normalizedUsername = normalizeUsername(username);

    const user = data.users.find(
      user =>
        normalizeUsername(user.username) === normalizedUsername ||
        user.usernameNormalized === normalizedUsername
    );

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        error: "Pseudo ou mot de passe incorrect."
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
        console.error("Erreur régénération session :", error);

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
          console.error("Erreur sauvegarde session :", sessionError);

          return res.status(500).json({
            error: "Impossible de sauvegarder la session."
          });
        }

        return res.json({
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
      console.error("Erreur déconnexion :", error);

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
    id: `${Date.now()}-${Math.random()}`,
    userId: req.session.user.id,
    pseudo,
    message,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.launchRequests.unshift(request);

  const admin = data.users.find(user => isAdminUsername(user.username));

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
    id: `${Date.now()}-${Math.random()}`,
    userId: req.session.user.id,
    pseudo,
    reason,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.staffApplications.unshift(application);

  const admin = data.users.find(user => isAdminUsername(user.username));

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

// ====================
// ADMIN : ACCEPTER / REFUSER
// ====================

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

    createNotification(
      data,
      application.userId,
      status === "accepted"
        ? "Candidature Staff acceptée"
        : "Candidature Staff refusée",
      status === "accepted"
        ? "Félicitations ! Ta candidature Staff a été acceptée."
        : "Ta candidature Staff a été refusée.",
      "staff"
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
      String(notification.userId) === String(req.session.user.id)
  );

  res.json(notifications);
});

app.post("/api/notifications/:id/read", requireLogin, (req, res) => {
  const data = readData();

  const notification = data.notifications.find(
    item =>
      String(item.id) === String(req.params.id) &&
      String(item.userId) === String(req.session.user.id)
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
});

// ====================
// DÉMARRAGE
// ====================

ensureConfiguredAdmin();

app.listen(PORT, () => {
  console.log(`SAN SMP lancé sur le port ${PORT}`);
});
