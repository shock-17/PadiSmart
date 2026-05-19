import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
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

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
        return res.status(500).json({ error: "Gemini API Key not configured. Please set it in the Secrets panel." });
      }

      const ai = new GoogleGenAI({ apiKey });
      // const model = ai.models.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `
        Analyze this image of a paddy plant. 
        Identify if it has one of these 6 conditions: 
        1. Blast
        2. HDB (Bacterial Leaf Blight)
        3. Tungro
        4. Brown Planthopper (Wereng Cokelat)
        5. Golden Apple Snail (Keong Mas)
        6. Nitrogen Deficiency
        
        Or if it looks Healthy.
        
        Return a JSON object with:
        - condition: string (one of the above or "Healthy" or "Unknown")
        - confidence: number (0-100)
        - treatment: string (specific advice in Indonesian)
        - description: string (brief description of what is seen)
      `;

      // Remove header if present (data:image/jpeg;base64,)
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
          ],
        },
        config: {
          responseMimeType: "application/json",
        }
      });

      const responseText = response.text;
      if (!responseText) throw new Error("No response text");
      res.json(JSON.parse(responseText));
    } catch (error: any) {
      console.error("Analysis error:", error);
      let errorMessage = error.message || "Failed to analyze image";

      // Try to parse JSON error message from GoogleGenAI
      if (typeof errorMessage === 'string' && errorMessage.includes('{"error"')) {
        try {
          const jsonStr = errorMessage.substring(errorMessage.indexOf('{'));
          const parsed = JSON.parse(jsonStr);
          if (parsed.error?.message) {
            errorMessage = parsed.error.message;
          }
        } catch (e) {
          // ignore parsing error
        }
      }

      // Add user-friendly translation for 503 high demand errors
      if (errorMessage.includes("high demand") || errorMessage.includes("503")) {
        errorMessage = "Sistem AI sedang sibuk (kapasitas penuh). Silakan coba lagi dalam beberapa menit.";
      }

      res.status(500).json({ error: errorMessage });
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
