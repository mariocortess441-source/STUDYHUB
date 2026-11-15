const express = require("express");
const multer = require("multer");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));

// Serve the AdSense seller authorization file explicitly at the domain root.
app.get("/ads.txt", (req, res) => {
  res.type("text/plain").sendFile(path.join(__dirname, "public", "ads.txt"));
});

// Serve crawler discovery files explicitly with their correct content types.
app.get("/sitemap.xml", (req, res) => {
  res.type("application/xml").sendFile(path.join(__dirname, "public", "sitemap.xml"));
});
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").sendFile(path.join(__dirname, "public", "robots.txt"));
});

app.use(express.static(path.join(__dirname, "public")));
app.use("/api/", rateLimit({ windowMs: 15 * 60 * 1000, limit: 120 }));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).slice(0, 12))
});
const upload = multer({
  storage,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 2 * 1024 * 1024 * 1024), files: 1 }
});

function safeName(name) {
  return path.basename(name).replace(/[^\w.\- ()áéíóúÁÉÍÓÚñÑ]/g, "_").slice(0, 180) || "archivo";
}
function readMeta() {
  const file = path.join(DATA_DIR, "shares.json");
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}
function writeMeta(data) {
  fs.writeFileSync(path.join(DATA_DIR, "shares.json"), JSON.stringify(data, null, 2));
}
function publicBase(req) {
  return (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
}


const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, value) {
  const temp = file + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function cookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 30 * 24 * 60 * 60 * 1000 };
}
function publicUser(user) { return { id: user.id, name: user.name, email: user.email }; }
function sessionUser(req) {
  const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("sh_session="))?.slice("sh_session=".length);
  if (!token) return null;
  const sessions = readJson(SESSIONS_FILE);
  const session = sessions[crypto.createHash("sha256").update(decodeURIComponent(token)).digest("hex")];
  if (!session || session.expiresAt < Date.now()) return null;
  const user = Object.values(readJson(USERS_FILE)).find(u => u.id === session.userId);
  return user ? publicUser(user) : null;
}
function requireAuth(req, res, next) {
  const user = sessionUser(req);
  if (!user) return res.status(401).json({ error: "Inicia sesión para continuar." });
  req.user = user;
  next();
}
function makePassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve({ salt, hash: key.toString("hex") })));
}
async function verifyPassword(password, stored) {
  const derived = await makePassword(password, stored.salt);
  return crypto.timingSafeEqual(Buffer.from(derived.hash, "hex"), Buffer.from(stored.hash, "hex"));
}
app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 60);
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  if (name.length < 2) return res.status(400).json({ error: "Escribe un nombre de al menos 2 caracteres." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Introduce un correo válido." });
  if (password.length < 10) return res.status(400).json({ error: "La contraseña debe tener al menos 10 caracteres." });
  const users = readJson(USERS_FILE);
  if (users[email]) return res.status(409).json({ error: "Ya existe una cuenta con ese correo." });
  const credentials = await makePassword(password);
  const user = { id: crypto.randomUUID(), name, email, ...credentials, createdAt: Date.now() };
  users[email] = user;
  writeJson(USERS_FILE, users);
  const token = crypto.randomBytes(32).toString("hex");
  const sessions = readJson(SESSIONS_FILE);
  sessions[crypto.createHash("sha256").update(token).digest("hex")] = { userId: user.id, expiresAt: Date.now() + cookieOptions().maxAge };
  writeJson(SESSIONS_FILE, sessions);
  res.cookie("sh_session", token, cookieOptions()).status(201).json({ user: publicUser(user) });
});
app.post("/api/auth/login", async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = readJson(USERS_FILE)[email];
  if (!user || !(await verifyPassword(password, user))) return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  const token = crypto.randomBytes(32).toString("hex");
  const sessions = readJson(SESSIONS_FILE);
  sessions[crypto.createHash("sha256").update(token).digest("hex")] = { userId: user.id, expiresAt: Date.now() + cookieOptions().maxAge };
  writeJson(SESSIONS_FILE, sessions);
  res.cookie("sh_session", token, cookieOptions()).json({ user: publicUser(user) });
});
app.get("/api/auth/me", (req, res) => {
  const user = sessionUser(req);
  res.json({ user });
});
app.post("/api/auth/logout", (req, res) => {
  const token = (req.headers.cookie || "").split(";").map(x => x.trim()).find(x => x.startsWith("sh_session="))?.slice("sh_session=".length);
  if (token) {
    const sessions = readJson(SESSIONS_FILE);
    delete sessions[crypto.createHash("sha256").update(decodeURIComponent(token)).digest("hex")];
    writeJson(SESSIONS_FILE, sessions);
  }
  res.clearCookie("sh_session", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" }).json({ ok: true });
});
// Anonymous aggregate presence metrics. Browser IDs are random tokens; no names or emails are stored.
const PRESENCE_FILE = path.join(DATA_DIR, "presence.json");
app.post("/api/presence", (req, res) => {
  const id = String(req.body.id || "");
  if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) return res.status(400).json({ error: "Identificador no válido." });
  const all = readJson(PRESENCE_FILE, {}), now = Date.now(), day = new Date(now).toISOString().slice(0,10);
  const item = all[id] || { days: [] };
  item.lastSeen = now; item.days = [...new Set([...(item.days || []).filter(d => d >= new Date(now-30*86400000).toISOString().slice(0,10)), day])].slice(-30);
  all[id] = item;
  for (const [key, value] of Object.entries(all)) if (!value.lastSeen || value.lastSeen < now-45*86400000) delete all[key];
  writeJson(PRESENCE_FILE, all);
  res.json({ ok: true });
});
app.get("/api/presence/stats", (req, res) => {
  const values = Object.values(readJson(PRESENCE_FILE, {})), now = Date.now(), cutoff = now-5*60*1000;
  res.set("Cache-Control", "no-store").json({ active: values.filter(x => x.lastSeen >= cutoff).length, regular: values.filter(x => (x.days || []).length >= 3).length });
});

// Per-account academic data. On-disk persistence requires a persistent volume in production.
const STUDY_DATA_FILE = path.join(DATA_DIR, "study-data.json");
app.get("/api/study-data", requireAuth, (req,res) => {
  const all = readJson(STUDY_DATA_FILE, {});
  res.json({ data: all[req.user.id] || {} });
});
app.put("/api/study-data/:key", requireAuth, (req,res) => {
  const key = String(req.params.key || "");
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(key)) return res.status(400).json({error:"Clave no válida."});
  const raw = JSON.stringify(req.body.value);
  if (raw.length > 500000) return res.status(413).json({error:"El contenido supera el límite permitido."});
  const all = readJson(STUDY_DATA_FILE, {});
  all[req.user.id] = all[req.user.id] || {};
  all[req.user.id][key] = req.body.value;
  writeJson(STUDY_DATA_FILE, all);
  res.json({ok:true});
});

// El acceso es opcional: las funciones de conversión y compartir también están disponibles como invitado.


// Google Calendar OAuth: refresh tokens are encrypted at rest with AES-256-GCM.
const GOOGLE_TOKENS_FILE=path.join(DATA_DIR,"google-tokens.json"),GOOGLE_STATES_FILE=path.join(DATA_DIR,"google-oauth-states.json");
function googleConfigReady(){return Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&process.env.GOOGLE_TOKEN_ENCRYPTION_KEY&&/^[a-f0-9]{64}$/i.test(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY))}
function googleRedirectUri(req){return process.env.GOOGLE_REDIRECT_URI||(publicBase(req)+"/api/google/callback")}
function encryptGoogleToken(value){const key=Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,"hex"),iv=crypto.randomBytes(12),cipher=crypto.createCipheriv("aes-256-gcm",key,iv),data=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);return{iv:iv.toString("hex"),tag:cipher.getAuthTag().toString("hex"),data:data.toString("hex")}}
function decryptGoogleToken(value){const key=Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY,"hex"),decipher=crypto.createDecipheriv("aes-256-gcm",key,Buffer.from(value.iv,"hex"));decipher.setAuthTag(Buffer.from(value.tag,"hex"));return Buffer.concat([decipher.update(Buffer.from(value.data,"hex")),decipher.final()]).toString("utf8")}
async function googleAccessToken(userId){const record=readJson(GOOGLE_TOKENS_FILE,{})[userId];if(!record?.refreshToken)throw new Error("Conecta primero tu cuenta de Google Calendar.");const body=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:decryptGoogleToken(record.refreshToken),grant_type:"refresh_token"}),response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}),data=await response.json();if(!response.ok||!data.access_token)throw new Error("Google no ha podido renovar el permiso. Vuelve a conectar tu cuenta.");return data.access_token}
app.get("/api/google/status",requireAuth,(req,res)=>{const record=readJson(GOOGLE_TOKENS_FILE,{})[req.user.id];res.set("Cache-Control","no-store").json({configured:googleConfigReady(),connected:Boolean(record?.refreshToken),email:record?.email||""})});
app.get("/api/google/connect",requireAuth,(req,res)=>{if(!googleConfigReady())return res.status(503).send("La conexión de Google aún no está configurada en el servidor.");const state=crypto.randomBytes(32).toString("hex"),states=readJson(GOOGLE_STATES_FILE,{});states[state]={userId:req.user.id,expiresAt:Date.now()+600000};writeJson(GOOGLE_STATES_FILE,states);const params=new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,redirect_uri:googleRedirectUri(req),response_type:"code",scope:"openid email https://www.googleapis.com/auth/calendar.events",access_type:"offline",prompt:"consent",include_granted_scopes:"true",state});res.redirect("https://accounts.google.com/o/oauth2/v2/auth?"+params)});
app.get("/api/google/callback",async(req,res)=>{const states=readJson(GOOGLE_STATES_FILE,{}),state=String(req.query.state||""),record=states[state];delete states[state];writeJson(GOOGLE_STATES_FILE,states);if(!record||record.expiresAt<Date.now())return res.redirect("/?google=error&reason=state");if(req.query.error)return res.redirect("/?google=error&reason=cancelled");try{if(!googleConfigReady())throw Error("not_configured");const body=new URLSearchParams({code:String(req.query.code||""),client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,redirect_uri:googleRedirectUri(req),grant_type:"authorization_code"}),response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body}),token=await response.json();if(!response.ok||!token.refresh_token)throw Error("token_exchange_failed");const profileRes=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+token.access_token}}),profile=await profileRes.json(),all=readJson(GOOGLE_TOKENS_FILE,{});all[record.userId]={refreshToken:encryptGoogleToken(token.refresh_token),email:String(profile.email||""),connectedAt:Date.now()};writeJson(GOOGLE_TOKENS_FILE,all);res.redirect("/?google=connected")}catch(err){console.error("Google Calendar OAuth error:",err.message);res.redirect("/?google=error&reason=authorization")}});
app.post("/api/google/disconnect",requireAuth,(req,res)=>{const all=readJson(GOOGLE_TOKENS_FILE,{});delete all[req.user.id];writeJson(GOOGLE_TOKENS_FILE,all);res.json({ok:true})});
app.get("/api/google/events",requireAuth,async(req,res)=>{try{const token=await googleAccessToken(req.user.id),now=new Date(),params=new URLSearchParams({timeMin:req.query.timeMin||new Date(now.getTime()-30*86400000).toISOString(),timeMax:req.query.timeMax||new Date(now.getTime()+365*86400000).toISOString(),singleEvents:"true",orderBy:"startTime",maxResults:"2500"}),response=await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events?"+params,{headers:{Authorization:"Bearer "+token}}),data=await response.json();if(!response.ok)throw Error(data.error?.message||"No se han podido leer los eventos.");res.set("Cache-Control","no-store").json({events:data.items||[]})}catch(err){res.status(502).json({error:err.message})}});
app.post("/api/google/events",requireAuth,async(req,res)=>{try{const{title,date,time,end,googleEventId}=req.body||{};if(!String(title||"").trim()||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(String(date||""))||!/^[0-9]{2}:[0-9]{2}$/.test(String(time||"")))return res.status(400).json({error:"El evento necesita título, fecha y hora."});const start=new Date(date+"T"+time+":00"),finish=end&&/^[0-9]{2}:[0-9]{2}$/.test(end)?new Date(date+"T"+end+":00"):new Date(start.getTime()+3600000);if(!Number.isFinite(start.getTime())||!Number.isFinite(finish.getTime())||finish<=start)return res.status(400).json({error:"La hora de fin debe ser posterior al inicio."});const token=await googleAccessToken(req.user.id),payload={summary:String(title).slice(0,200),start:{dateTime:start.toISOString(),timeZone:"Europe/Madrid"},end:{dateTime:finish.toISOString(),timeZone:"Europe/Madrid"}},url=googleEventId?"https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(googleEventId):"https://www.googleapis.com/calendar/v3/calendars/primary/events",response=await fetch(url,{method:googleEventId?"PUT":"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)}),data=await response.json();if(!response.ok)throw Error(data.error?.message||"No se pudo guardar el evento.");res.status(googleEventId?200:201).json({id:data.id,htmlLink:data.htmlLink||""})}catch(err){res.status(502).json({error:err.message})}});
app.delete("/api/google/events/:id",requireAuth,async(req,res)=>{try{const token=await googleAccessToken(req.user.id),response=await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events/"+encodeURIComponent(req.params.id),{method:"DELETE",headers:{Authorization:"Bearer "+token}});if(!response.ok&&response.status!==410&&response.status!==404){const data=await response.json().catch(()=>({}));throw Error(data.error?.message||"No se pudo borrar el evento.")}res.json({ok:true})}catch(err){res.status(502).json({error:err.message})}});

app.get("/api/health", (_, res) => res.json({ ok: true, service: "AULIVRA", version: "1.0.0" }));

// Upload a file and create a time-limited share link. The file is stored on this server.
app.post("/api/shares", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Selecciona un archivo." });
  const hours = Math.min(168, Math.max(1, Number(req.body.expiryHours || 72)));
  const id = crypto.randomBytes(18).toString("hex");
  const meta = readMeta();
  meta[id] = {
    storedName: req.file.filename,
    originalName: safeName(req.file.originalname),
    size: req.file.size,
    mime: req.file.mimetype,
    createdAt: Date.now(),
    expiresAt: Date.now() + hours * 3600000
  };
  writeMeta(meta);
  const link = `${publicBase(req)}/d/${id}`;
  let emailed = false;
  if (req.body.email) {
    const email = String(req.body.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "El correo no parece válido." });
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587),
        secure: String(process.env.SMTP_SECURE || "false") === "true",
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      await transporter.sendMail({
        from: process.env.MAIL_FROM || process.env.SMTP_USER, to: email,
        subject: "Te han compartido un archivo en AULIVRA",
        text: `Puedes descargar "${meta[id].originalName}" desde este enlace: ${link}\nEl enlace caduca en ${hours} horas.`
      });
      emailed = true;
    }
  }
  res.status(201).json({ id, link, emailed, expiresAt: meta[id].expiresAt,
    message: emailed ? "Enlace creado y correo enviado." : "Enlace creado. Copia el enlace para compartirlo; el envío por correo requiere configurar SMTP." });
});

app.get("/d/:id", (req, res) => {
  const meta = readMeta()[req.params.id];
  if (!meta) return res.status(404).send("Este enlace no existe o ya no está disponible.");
  if (Date.now() > meta.expiresAt) return res.status(410).send("Este enlace ha caducado.");
  const filePath = path.join(UPLOAD_DIR, path.basename(meta.storedName));
  if (!fs.existsSync(filePath)) return res.status(404).send("El archivo ya no está disponible.");
  res.download(filePath, meta.originalName);
});

// Optional server-side office conversion. Requires LibreOffice installed on the host.
app.post("/api/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Selecciona un archivo." });
  const target = String(req.body.to || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const allowed = new Set(["pdf", "docx", "doc", "odt", "rtf", "txt", "xlsx", "xls", "csv", "pptx", "ppt", "png", "jpg"]);
  if (!allowed.has(target)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: "Formato de destino no admitido." });
  }
  const outDir = path.join(DATA_DIR, "converted", crypto.randomUUID());
  fs.mkdirSync(outDir, { recursive: true });
  try {
    await execFileAsync(process.env.LIBREOFFICE_BIN || "soffice", [
      "--headless", "--convert-to", target, "--outdir", outDir, req.file.path
    ], { timeout: 120000, maxBuffer: 2 * 1024 * 1024 });
    const files = fs.readdirSync(outDir);
    if (!files.length) throw new Error("LibreOffice no generó el archivo.");
    const output = path.join(outDir, files[0]);
    res.download(output, safeName(path.parse(req.file.originalname).name + "." + target), () => {
      fs.rm(outDir, { recursive: true, force: true }, () => {});
      fs.unlink(req.file.path, () => {});
    });
  } catch (err) {
    fs.rm(outDir, { recursive: true, force: true }, () => {});
    fs.unlink(req.file.path, () => {});
    res.status(501).json({ error: "No se pudo convertir en el servidor. Comprueba que LibreOffice esté instalado y que admita ambos formatos.", detail: err.message });
  }
});

// Expired uploads are removed periodically.
setInterval(() => {
  const meta = readMeta();
  let changed = false;
  for (const [id, item] of Object.entries(meta)) {
    if (Date.now() > item.expiresAt) {
      fs.unlink(path.join(UPLOAD_DIR, path.basename(item.storedName)), () => {});
      delete meta[id]; changed = true;
    }
  }
  if (changed) writeMeta(meta);
}, 60 *  60 * 1000).unref();

app.listen(PORT, () => console.log(`AULIVRA running on http://localhost:${PORT}`));
