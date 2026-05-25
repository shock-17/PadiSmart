import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Database
const dbPath = process.env.DB_PATH || "padiguard.db";
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    lat REAL,
    lng REAL
  );

  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmerName TEXT NOT NULL,
    variety TEXT NOT NULL,
    plantingDate TEXT NOT NULL,
    harvestDate TEXT NOT NULL,
    areaSize REAL,
    lat REAL,
    lng REAL,
    polygon TEXT
  );

  CREATE TABLE IF NOT EXISTS disease_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmerName TEXT NOT NULL,
    diseaseName TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    date TEXT NOT NULL
  );
`);

// Migration to add columns if the table was created before
try {
  db.exec('ALTER TABLE schedules ADD COLUMN lat REAL');
  db.exec('ALTER TABLE schedules ADD COLUMN lng REAL');
} catch (e) {
  // Columns likely already exist
}

try {
  db.exec('ALTER TABLE schedules ADD COLUMN polygon TEXT');
} catch (e) {}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT as string, 10) || 3000;

  app.use(express.json({ limit: "10mb" }));

  // Auth Routes
  const hashPwd = (p: string) => crypto.createHash('sha256').update(p).digest('hex');

  app.post('/api/auth/register', (req, res) => {
    const { username, password, lat, lng } = req.body;
    if (!username || !password) return res.status(400).json({error: 'Username dan password wajib diisi'});
    try {
      const stmt = db.prepare('INSERT INTO users (username, password, lat, lng) VALUES (?, ?, ?, ?)');
      stmt.run(username, hashPwd(password), lat, lng);
      res.json({ success: true, user: { username, lat, lng } });
    } catch (e: any) {
      if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        res.status(400).json({ error: 'Username sudah digunakan' });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan' });
      }
    }
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare('SELECT username, lat, lng FROM users WHERE username = ? AND password = ?');
    const user = stmt.get(username, hashPwd(password));
    if (user) {
      res.json({ success: true, user });
    } else {
      res.status(401).json({ error: 'Username atau password salah' });
    }
  });

  // API Routes

  // 1. Analyze Image (Gemini)
  app.post("/api/analyze", async (req, res) => {
    try {
      const { image } = req.body; // base64 image
      if (!image) return res.status(400).json({ error: "No image provided" });

      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, "base64");
      const blob = new Blob([buffer], { type: "image/jpeg" });
      const form = new FormData();
      form.append('file', blob, 'image.jpg');

      const fetchRes = await fetch("https://riceapi-production.up.railway.app/predict", {
        method: "POST",
        body: form,
      });

      if (!fetchRes.ok) {
        throw new Error(`API returned status: ${fetchRes.status}`);
      }

      const result = await fetchRes.json();
      
      let condition = result.prediction;
      let treatment = "";
      let description = "Klasifikasi gambar: " + condition;
      const normalizedCondition = String(condition).toLowerCase();
      const confidence = Number(result.confidence ?? result.all_scores?.[0]?.confidence ?? 0);
      const isNotRice = /not.*rice|bukan.*padi|unknown|uncertain|unclear|non[- ]rice/i.test(normalizedCondition) || confidence < 0.35;
      
      if (isNotRice) {
        condition = "Not Rice";
        treatment = "Foto yang diunggah tampaknya bukan daun padi atau hasil klasifikasi tidak meyakinkan. Silakan unggah foto daun padi yang jelas dan coba lagi.";
        description = "Bukan tanaman padi atau kualitas gambar kurang jelas untuk klasifikasi penyakit padi.";
      } else {
        switch (condition) {
          case "Healthy Rice Leaf":
            condition = "Healthy";
            treatment = "Tanaman sehat. Pertahankan nutrisi dan sistem pengairan yang baik untuk pertumbuhan optimal.";
            description = "Daun padi terlihat sehat tanpa gejala penyakit. Terus pantau lahan secara rutin.";
            break;
          case "Brown Spot":
            treatment = "Gunakan fungisida berbahan aktif trisiklazol atau propikonazol. Kurangi kelembapan lingkungan lahan, pastikan jarak tanam yang baik.";
            break;
          case "Leaf scald":
            treatment = "Gunakan benih tahan penyakit dan dapat diobati dengan fungisida pelindung. Hindari pemupukan nitrogen yang terlalu berlebihan.";
            break;
          case "Leaf Blast":
            condition = "Blast";
            treatment = "Segera semprotkan fungisida trisiklazol atau benomil. Hindari pemupukan Urea (nitrogen) secara berlebihan pada fase rentan.";
            break;
          case "Bacterial Leaf Blight":
            condition = "HDB (Bacterial Leaf Blight)";
            treatment = "Kurangi pupuk nitrogen, gunakan agens hayati bakteri antagonis atau bakterisida. Jaga drainase pesawahan agar tidak tergenang berlebihan.";
            break;
          case "Sheath Blight":
            treatment = "Kurangi tingkat kelembaban kanopi, aplikasikan fungisida heksakonazol atau validamisin sesuai anjuran dosis sesegera mungkin.";
            break;
          default:
            treatment = "Tingkatkan observasi lapangan. Perhatikan asupan air dan pola pemupukan untuk mitigasi tahap awal.";
        }
      }
      
      res.json({
        condition: condition,
        confidence: confidence,
        treatment: treatment,
        description: description
      });
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze image" });
    }
  });

  // 2. Community Schedules
  app.get("/api/schedules", (req, res) => {
    const stmt = db.prepare("SELECT * FROM schedules ORDER BY plantingDate DESC");
    const schedules = stmt.all();
    res.json(schedules);
  });

  app.post("/api/schedules", (req, res) => {
    const { farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng, polygon } = req.body;
    let polygonStr = null;
    if (polygon && Array.isArray(polygon) && polygon.length > 0) {
      polygonStr = JSON.stringify(polygon);
    }
    const stmt = db.prepare(`
      INSERT INTO schedules (farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng, polygon)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng, polygonStr);
    res.json({ id: info.lastInsertRowid });
  });

  // 3. Disease Reports
  app.get("/api/reports", (req, res) => {
    const stmt = db.prepare("SELECT * FROM disease_reports ORDER BY date DESC");
    res.json(stmt.all());
  });

  app.post("/api/reports", (req, res) => {
    const { farmerName, diseaseName, lat, lng, date } = req.body;
    const stmt = db.prepare(`
      INSERT INTO disease_reports (farmerName, diseaseName, lat, lng, date)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(farmerName, diseaseName, lat, lng, date);
    res.json({ id: info.lastInsertRowid });
  });

  // Vite Middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static file serving (if needed, though usually handled by build)
    app.use(express.static(path.join(__dirname, "dist")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
