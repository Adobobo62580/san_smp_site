const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "Adosaurus3614";
const DATA_FILE = path.join(__dirname, "site-data.json");

app.use(express.json());
app.use(express.static(__dirname));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "change-cette-cle-secrete",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

function createId() {
  return crypto.randomUUID();
}

function defaultData() {
  return {
    users: [],
    messages: [],
    notifications: [],
    launchRequests: [],
    staffApplications: []
  };
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) {
    const data = defaultData();
    saveData(data);
    return data;
  }

  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return defaultData();
  }
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function isAdminUsername(username) {
  return username === ADMIN_USERNAME;
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    isBanned: user.isBanned
  };
}

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({
      error: "Tu dois être connecté."
    });
  }

  const data = loadData();
  const user = data.users.find((item) => item.id === req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({
      error: "Session invalide."
    });
  }

  if (user.isBanned) {
    req.session.destroy(() => {});
    return res.status(403).json({
      error: "Ton compte est banni."
    });
  }

  req.currentUser = user;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.currentUser?.isAdmin) {
    return res.status(403).json({
      error: "Accès réservé à l'administrateur."
    });
  }

  next();
}

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

/* UTILISATEUR CONNECTÉ */

app.get("/api/me", (req, res) => {
  const data = loadData();

  if (!req.session.userId) {
    return res.json({ user: null });
  }

  const user = data.users.find(
    (item) => item.id === req.session.userId
  );

  if (!user || user.isBanned) {
    return res.json({ user: null });
  }

  res.json({
    user: publicUser(user)
  });
});

/* INSCRIPTION */

app.post("/api/register", async (req, res) => {
  const username = cleanText(req.body.username, 24);
  const password = req.body.password;

  if (username.length < 3) {
    return res.status(400).json({
      error: "Le pseudo doit contenir au moins 3 caractères."
    });
  }

  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return res.status(400).json({
      error: "Le pseudo ne peut contenir que des lettres, chiffres et _."
    });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      error: "Le mot de passe doit contenir au moins 6 caractères."
    });
  }

  const data = loadData();

  const existingUser = data.users.find(
    (user) => user.username === username
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
    passwordHash,
    isAdmin: isAdminUsername(username),
    isBanned: false,
    createdAt: new Date().toISOString()
  };

  data.users.push(user);
  saveData(data);

  res.status(201).json({
    message: "Compte créé avec succès."
  });
});

/* CONNEXION */

app.post("/api/login", async (req, res) => {
  const username = cleanText(req.body.username, 24);
  const password = req.body.password;

  const data = loadData();

  const user = data.users.find(
    (item) => item.username === username
  );

  if (!user) {
    return res.status(401).json({
      error: "Pseudo ou mot de passe incorrect."
    });
  }

  if (user.isBanned) {
    return res.status(403).json({
      error: "Ton compte est banni."
    });
  }

  const passwordCorrect = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!passwordCorrect) {
    return res.status(401).json({
      error: "Pseudo ou mot de passe incorrect."
    });
  }

  req.session.userId = user.id;

  res.json({
    message: "Connexion réussie.",
    user: publicUser(user)
  });
});

/* DÉCONNEXION */

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({
      message: "Déconnexion réussie."
    });
  });
});

/* LISTE DES MEMBRES */

app.get("/api/users", requireLogin, (req, res) => {
  const data = loadData();

  const users = data.users
    .filter(
      (user) =>
        user.id !== req.currentUser.id &&
        !user.isBanned
    )
    .map(publicUser);

  res.json({ users });
});

/* ENVOYER UN MESSAGE */

app.post("/api/messages", requireLogin, (req, res) => {
  const receiverId = cleanText(req.body.receiverId, 100);
  const content = cleanText(req.body.content, 500);

  if (!receiverId || !content) {
    return res.status(400).json({
      error: "Le destinataire et le message sont obligatoires."
    });
  }

  const data = loadData();

  const receiver = data.users.find(
    (user) =>
      user.id === receiverId &&
      !user.isBanned
  );

  if (!receiver) {
    return res.status(404).json({
      error: "Destinataire introuvable."
    });
  }

  const message = {
    id: createId(),
    senderId: req.currentUser.id,
    senderUsername: req.currentUser.username,
    receiverId: receiver.id,
    receiverUsername: receiver.username,
    content,
    createdAt: new Date().toISOString()
  };

  data.messages.push(message);
  saveData(data);

  res.status(201).json({
    message: "Message envoyé.",
    sentMessage: message
  });
});

/* RÉCUPÉRER UNE CONVERSATION */

app.get("/api/messages/:userId", requireLogin, (req, res) => {
  const otherUserId = req.params.userId;
  const data = loadData();

  const otherUser = data.users.find(
    (user) =>
      user.id === otherUserId &&
      !user.isBanned
  );

  if (!otherUser) {
    return res.status(404).json({
      error: "Utilisateur introuvable."
    });
  }

  const messages = data.messages.filter((message) => {
    const conversation =
      message.senderId === req.currentUser.id &&
      message.receiverId === otherUserId;

    const reverseConversation =
      message.senderId === otherUserId &&
      message.receiverId === req.currentUser.id;

    return conversation || reverseConversation;
  });

  res.json({ messages });
});

/* NOTIFICATIONS */

app.get("/api/notifications", requireLogin, (req, res) => {
  const data = loadData();

  const notifications = [...data.notifications].reverse();

  res.json({ notifications });
});

/* DEMANDE DE LANCEMENT */

app.post("/api/launch-requests", requireLogin, (req, res) => {
  const reason = cleanText(req.body.reason, 1000);

  if (!reason) {
    return res.status(400).json({
      error: "Explique pourquoi tu demandes le lancement."
    });
  }

  const data = loadData();

  const request = {
    id: createId(),
    userId: req.currentUser.id,
    username: req.currentUser.username,
    reason,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.launchRequests.push(request);
  saveData(data);

  res.status(201).json({
    message: "Demande envoyée."
  });
});

/* CANDIDATURE STAFF */

app.post("/api/staff-applications", requireLogin, (req, res) => {
  const age = Number(req.body.age);
  const experience = cleanText(req.body.experience, 1500);
  const motivation = cleanText(req.body.motivation, 1500);

  if (!Number.isInteger(age) || age < 13 || age > 100) {
    return res.status(400).json({
      error: "Âge invalide."
    });
  }

  if (!experience || !motivation) {
    return res.status(400).json({
      error: "Tous les champs sont obligatoires."
    });
  }

  const data = loadData();

  const application = {
    id: createId(),
    userId: req.currentUser.id,
    username: req.currentUser.username,
    age,
    experience,
    motivation,
    status: "pending",
    createdAt: new Date().toISOString()
  };

  data.staffApplications.push(application);
  saveData(data);

  res.status(201).json({
    message: "Candidature envoyée."
  });
});

/* ADMIN : DEMANDES DE LANCEMENT */

app.get(
  "/api/admin/launch-requests",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const data = loadData();

    res.json({
      requests: [...data.launchRequests].reverse()
    });
  }
);

app.patch(
  "/api/admin/launch-requests/:id",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const status = req.body.status;

    if (!["accepted", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        error: "Statut invalide."
      });
    }

    const data = loadData();

    const request = data.launchRequests.find(
      (item) => item.id === req.params.id
    );

    if (!request) {
      return res.status(404).json({
        error: "Demande introuvable."
      });
    }

    request.status = status;
    saveData(data);

    res.json({
      message: "Demande mise à jour."
    });
  }
);

/* ADMIN : CANDIDATURES STAFF */

app.get(
  "/api/admin/staff-applications",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const data = loadData();

    res.json({
      applications: [...data.staffApplications].reverse()
    });
  }
);

app.patch(
  "/api/admin/staff-applications/:id",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const status = req.body.status;

    if (!["accepted", "rejected", "pending"].includes(status)) {
      return res.status(400).json({
        error: "Statut invalide."
      });
    }

    const data = loadData();

    const application = data.staffApplications.find(
      (item) => item.id === req.params.id
    );

    if (!application) {
      return res.status(404).json({
        error: "Candidature introuvable."
      });
    }

    application.status = status;
    saveData(data);

    res.json({
      message: "Candidature mise à jour."
    });
  }
);

/* ADMIN : UTILISATEURS */

app.get(
  "/api/admin/users",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const data = loadData();

    res.json({
      users: data.users.map(publicUser)
    });
  }
);

app.patch(
  "/api/admin/users/:id/ban",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const isBanned = Boolean(req.body.isBanned);

    const data = loadData();

    const user = data.users.find(
      (item) => item.id === req.params.id
    );

    if (!user) {
      return res.status(404).json({
        error: "Utilisateur introuvable."
      });
    }

    if (user.username === ADMIN_USERNAME) {
      return res.status(403).json({
        error: "Le compte administrateur ne peut pas être banni."
      });
    }

    user.isBanned = isBanned;
    saveData(data);

    res.json({
      message: "Utilisateur mis à jour."
    });
  }
);

/* ADMIN : NOTIFICATIONS */

app.post(
  "/api/admin/notifications",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const title = cleanText(req.body.title, 100);
    const content = cleanText(req.body.content, 1000);

    if (!title || !content) {
      return res.status(400).json({
        error: "Le titre et le contenu sont obligatoires."
      });
    }

    const data = loadData();

    const notification = {
      id: createId(),
      title,
      content,
      createdAt: new Date().toISOString(),
      author: req.currentUser.username
    };

    data.notifications.push(notification);
    saveData(data);

    res.status(201).json({
      message: "Notification publiée."
    });
  }
);

/* PAGE PRINCIPALE */

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`SAN SMP lancé sur http://localhost:${PORT}`);
});
