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
const DATA_DIR = path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "2mb" }));

// Serve the AdSense seller authorization file explicitly at the domain root.
app.get("/ads.txt", (req, res) => {
  res.type("text/plain").sendFile(path.join(__dirname, "public", "ads.txt"));
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
// El acceso es opcional: las funciones de conversión y compartir también están disponibles como invitado.

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
