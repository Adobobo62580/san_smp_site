const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "site-data.json");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, {recursive:true});
if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, JSON.stringify({launchRequests:[],staffApplications:[]}, null, 2));
const readData = () => JSON.parse(fs.readFileSync(dataFile, "utf8"));
const saveData = d => fs.writeFileSync(dataFile, JSON.stringify(d, null, 2));
app.use(express.json({limit:"20kb"}));
app.use(express.static(path.join(__dirname, "public")));
app.get("/api/launch-requests", (req,res) => res.json(readData().launchRequests));
app.post("/api/launch-requests", (req,res) => {
  const pseudo = String(req.body.pseudo||"").trim();
  const message = String(req.body.message||"").trim();
  if (!pseudo || pseudo.length > 32 || message.length > 300) return res.status(400).json({error:"Informations invalides."});
  const d=readData(); d.launchRequests.unshift({id:Date.now(),pseudo,message,createdAt:new Date().toISOString()}); saveData(d);
  res.json({ok:true});
});
app.post("/api/staff-applications", (req,res) => {
  const pseudo = String(req.body.pseudo||"").trim();
  const reason = String(req.body.reason||"").trim();
  if (!pseudo || !reason || pseudo.length>32 || reason.length>1000) return res.status(400).json({error:"Remplis tous les champs correctement."});
  const d=readData(); d.staffApplications.unshift({id:Date.now(),pseudo,reason,createdAt:new Date().toISOString()}); saveData(d);
  res.json({ok:true});
});
app.listen(PORT,()=>console.log(`SAN SMP lancé sur http://localhost:${PORT}`));