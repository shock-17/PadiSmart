import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import axios from "axios";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Gemini client once at module level (avoid re-creating per request)
const geminiApiKey = process.env.GEMINI_API_KEY;
const ai =
  geminiApiKey && geminiApiKey !== "MY_GEMINI_API_KEY"
    ? new GoogleGenAI({ apiKey: geminiApiKey })
    : null;

// RiceAPI endpoint — set this to your deployed RiceAPI URL
const RICE_API_URL = process.env.RICE_API_URL || "http://localhost:8000";

// --- Input validation helpers ---
function validateSchedule(body: any): string | null {
  const { farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng } = body;
  if (!farmerName || typeof farmerName !== "string" || farmerName.length > 200)
    return "farmerName is required (string, max 200 chars)";
  if (!variety || typeof variety !== "string")
    return "variety is required";
  if (!plantingDate || isNaN(Date.parse(plantingDate)))
    return "plantingDate must be a valid date string";
  if (!harvestDate || isNaN(Date.parse(harvestDate)))
    return "harvestDate must be a valid date string";
  if (areaSize !== undefined && (typeof areaSize !== "number" || areaSize < 0))
    return "areaSize must be a non-negative number";
  if (lat !== undefined && (typeof lat !== "number" || lat < -90 || lat > 90))
    return "lat must be a number between -90 and 90";
  if (lng !== undefined && (typeof lng !== "number" || lng < -180 || lng > 180))
    return "lng must be a number between -180 and 180";
  return null;
}

function validateBooking(body: any): string | null {
  const { resourceType, farmerName, date } = body;
  if (!resourceType || !['harvester', 'drying_floor'].includes(resourceType))
    return "resourceType must be 'harvester' or 'drying_floor'";
  if (!farmerName || typeof farmerName !== "string" || farmerName.length > 200)
    return "farmerName is required (string, max 200 chars)";
  if (!date || isNaN(Date.parse(date)))
    return "date must be a valid date string";
  return null;
}

// Initialize Database
const db = new Database("padiguard.db");
db.pragma("journal_mode = WAL");

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmerName TEXT NOT NULL,
    variety TEXT NOT NULL,
    plantingDate TEXT NOT NULL,
    harvestDate TEXT NOT NULL,
    areaSize REAL,
    lat REAL,
    lng REAL
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resourceType TEXT NOT NULL, -- 'harvester' or 'drying_floor'
    farmerName TEXT NOT NULL,
    date TEXT NOT NULL,
    status TEXT DEFAULT 'confirmed'
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    farmerName TEXT NOT NULL,
    diseaseName TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    date TEXT NOT NULL
  );
`);

// Migration to add lat/lng if the table was created before
try {
  db.exec('ALTER TABLE schedules ADD COLUMN lat REAL');
  db.exec('ALTER TABLE schedules ADD COLUMN lng REAL');
} catch (e: any) {
  // Only swallow "duplicate column" errors; re-throw anything unexpected
  if (!e.message?.includes("duplicate column name")) {
    throw e;
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000", 10);

  app.use(express.json({ limit: "10mb" }));

  // API Routes

  // 1. Analyze Image — try RiceAPI first, fall back to Gemini
  app.post("/api/analyze", async (req, res) => {
    try {
      const { image } = req.body; // base64 image
      if (!image) return res.status(400).json({ error: "No image provided" });

      // Remove data URL header if present (data:image/jpeg;base64,...)
      const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
      const imageBuffer = Buffer.from(base64Data, "base64");

      // --- Step 1: Try RiceAPI ---
      try {
        const formData = new FormData();
        const blob = new Blob([imageBuffer], { type: "image/jpeg" });
        formData.append("file", blob, "image.jpg");

        const riceResponse = await axios.post(
          `${RICE_API_URL}/predict`,
          formData,
          { timeout: 30000 } // 30s timeout
        );

        const data = riceResponse.data;

        // If RiceAPI returned a Gemini-sourced result, it already has the right shape
        if (data.source === "gemini" && data.condition) {
          return res.json(data);
        }

        // If RiceAPI returned a local-model result, map to the expected format
        if (data.prediction) {
          return res.json({
            condition: data.prediction,
            confidence: data.confidence,
            treatment: data.message || "Lihat hasil klasifikasi untuk detail lebih lanjut.",
            description: `Terdeteksi oleh model RiceAPI (validated by: ${data.validated_by})`,
            source: "riceapi",
          });
        }

        // Unexpected response shape — fall through to Gemini
        console.warn("RiceAPI returned unexpected format, falling back to Gemini:", data);
      } catch (riceError: any) {
        console.warn("RiceAPI unavailable, falling back to Gemini:", riceError.message);
      }

      // --- Step 2: Fallback to direct Gemini call ---
      if (!ai) {
        return res.status(500).json({
          error: "RiceAPI is unavailable and Gemini API Key is not configured.",
        });
      }

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

      // Check for safety-filter blocks or empty response
      const responseText = response.text;
      if (!responseText) {
        const blockReason = (response as any).candidates?.[0]?.finishReason;
        throw new Error(
          blockReason === "SAFETY"
            ? "Image was flagged by safety filters"
            : "No response from AI model"
        );
      }
      res.json(JSON.parse(responseText));
    } catch (error: any) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze image. Please try again." });
    }
  });

  // 2. Community Schedules
  app.get("/api/schedules", (req, res) => {
    const stmt = db.prepare("SELECT * FROM schedules ORDER BY plantingDate DESC");
    const schedules = stmt.all();
    res.json(schedules);
  });

  app.post("/api/schedules", (req, res) => {
    const validationError = validateSchedule(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng } = req.body;
    const stmt = db.prepare(`
      INSERT INTO schedules (farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(farmerName, variety, plantingDate, harvestDate, areaSize ?? null, lat ?? null, lng ?? null);
    res.json({ id: info.lastInsertRowid });
  });

  // 3. Bookings
  app.get("/api/bookings", (req, res) => {
    const stmt = db.prepare("SELECT * FROM bookings ORDER BY date ASC");
    const bookings = stmt.all();
    res.json(bookings);
  });

  app.post("/api/bookings", (req, res) => {
    const validationError = validateBooking(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const { resourceType, farmerName, date } = req.body;
    const stmt = db.prepare(`
      INSERT INTO bookings (resourceType, farmerName, date)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(resourceType, farmerName, date);
    res.json({ id: info.lastInsertRowid });
  });

  // 4. Auth
  app.post("/api/auth/register", (req, res) => {
    const { username, password, lat, lng } = req.body;
    if (!username || typeof username !== "string" || username.length > 100) {
      return res.status(400).json({ error: "Username wajib diisi (maks 100 karakter)" });
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      return res.status(400).json({ error: "Password minimal 4 karakter" });
    }
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "Lokasi (lat/lng) wajib diisi" });
    }

    // Check if username already exists
    const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
    if (existing) {
      return res.status(409).json({ error: "Username sudah terdaftar" });
    }

    const stmt = db.prepare("INSERT INTO users (username, password, lat, lng) VALUES (?, ?, ?, ?)");
    stmt.run(username, password, lat, lng);
    res.json({ user: { username, lat, lng } });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi" });
    }

    const user = db.prepare("SELECT username, password, lat, lng FROM users WHERE username = ?").get(username) as any;
    if (!user) {
      return res.status(401).json({ error: "Username tidak ditemukan" });
    }
    if (user.password !== password) {
      return res.status(401).json({ error: "Password salah" });
    }
    res.json({ user: { username: user.username, lat: user.lat, lng: user.lng } });
  });

  // 5. Disease Reports
  app.get("/api/reports", (req, res) => {
    const reports = db.prepare("SELECT * FROM reports ORDER BY date DESC").all();
    res.json(reports);
  });

  app.post("/api/reports", (req, res) => {
    const { farmerName, diseaseName, lat, lng, date } = req.body;
    if (!farmerName || !diseaseName || typeof lat !== "number" || typeof lng !== "number" || !date) {
      return res.status(400).json({ error: "Data laporan tidak lengkap" });
    }
    const stmt = db.prepare("INSERT INTO reports (farmerName, diseaseName, lat, lng, date) VALUES (?, ?, ?, ?, ?)");
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

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Graceful shutdown: close HTTP server and DB on termination
  const shutdown = () => {
    console.log("Shutting down gracefully...");
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
