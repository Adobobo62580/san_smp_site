const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const ADMIN_USERNAME = "Adosaurus3614";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "SUPABASE_URL ou SUPABASE_KEY manque dans les variables d'environnement."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

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

let memoryData = defaultData();

function saveData(data) {
  memoryData = data;

  supabase
    .from("site_data")
    .upsert({
      id: 1,
      data,
      updated_at: new Date().toISOString()
    })
    .then(({ error }) => {
      if (error) {
        console.error(
          "Erreur sauvegarde Supabase :",
          error.message
        );
      }
    });
}

function loadData() {
  return memoryData;
}

async function initializeData() {
  const { data, error } = await supabase
    .from("site_data")
    .select("data")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    throw new Error(
      `Impossible de charger Supabase : ${error.message}`
    );
  }

  if (data && data.data) {
    memoryData = data.data;
  } else {
    memoryData = defaultData();
    saveData(memoryData);
  }

  console.log("Données Supabase chargées.");
}
 
function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";

  return value.trim().slice(0, maxLength);
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

  const user = data.users.find(
    (item) => item.id === req.session.userId
  );

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
  if (!req.currentUser || !req.currentUser.isAdmin) {
    return res.status(403).json({
      error: "Accès réservé à l'administrateur."
    });
  }

  next();
}

/* UTILISATEUR CONNECTÉ */

app.get("/api/me", (req, res) => {
  const data = loadData();

  if (!req.session.userId) {
    return res.json({
      user: null
    });
  }

  const user = data.users.find(
    (item) => item.id === req.session.userId
  );

  if (!user || user.isBanned) {
    return res.json({
      user: null
    });
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
      error:
        "Le pseudo ne peut contenir que des lettres, chiffres et _."
    });
  }

  if (typeof password !== "string" || password.length < 6) {
    return res.status(400).json({
      error:
        "Le mot de passe doit contenir au moins 6 caractères."
    });
  }

  const data = loadData();

  const existingUser = data.users.find(
    (user) =>
      user.username.toLowerCase() === username.toLowerCase()
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
    (item) =>
      item.username.toLowerCase() === username.toLowerCase()
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

  res.json({
    users
  });
});

/* MESSAGES */

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

  res.json({
    messages
  });
});

/* NOTIFICATIONS : LECTURE UNIQUEMENT */

app.get("/api/notifications", requireLogin, (req, res) => {
  const data = loadData();

  res.json({
    notifications: [...data.notifications].reverse()
  });
});

/* DEMANDES DE LANCEMENT */

app.post("/api/launch-requests", requireLogin, (req, res) => {
  const reason = cleanText(req.body.reason, 1000);

  if (!reason) {
    return res.status(400).json({
      error: "Explique pourquoi tu demandes le lancement."
    });
  }

  const data = loadData();

  data.launchRequests.push({
    id: createId(),
    userId: req.currentUser.id,
    username: req.currentUser.username,
    reason,
    status: "pending",
    createdAt: new Date().toISOString()
  });

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

  data.staffApplications.push({
    id: createId(),
    userId: req.currentUser.id,
    username: req.currentUser.username,
    age,
    experience,
    motivation,
    status: "pending",
    createdAt: new Date().toISOString()
  });

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

/* ADMIN : BANNIR OU DÉBANNIR UN UTILISATEUR */

app.patch(
  "/api/admin/users/:id/ban",
  requireLogin,
  requireAdmin,
  (req, res) => {
    const targetUserId = String(req.params.id);
    const currentUserId = String(req.currentUser.id);
    const isBanned = Boolean(req.body.isBanned);

    /*
      Protection importante :
      l'administrateur ne peut jamais se bannir lui-même,
      même si la requête est envoyée directement au backend.
    */

    if (targetUserId === currentUserId) {
      return res.status(403).json({
        error: "Tu ne peux pas te bannir toi-même."
      });
    }

    const data = loadData();

    const user = data.users.find(
      (item) => String(item.id) === targetUserId
    );

    if (!user) {
      return res.status(404).json({
        error: "Utilisateur introuvable."
      });
    }

    /*
      Deuxième protection :
      le compte administrateur principal ne peut jamais être banni.
    */

    if (
      user.isAdmin ||
      user.username === ADMIN_USERNAME
    ) {
      return res.status(403).json({
        error: "Le compte administrateur ne peut pas être banni."
      });
    }

    user.isBanned = isBanned;

    saveData(data);

    res.json({
      message: isBanned
        ? "Utilisateur banni."
        : "Utilisateur débanni."
    });
  }
);

/* PAGE PRINCIPALE */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* DÉMARRAGE */

initializeData()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`SAN SMP lancé sur le port ${PORT}`);
    });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
