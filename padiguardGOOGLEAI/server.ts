import "dotenv/config";
import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import { GoogleGenAI } from "@google/genai";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
`);

// Migration to add lat/lng if the table was created before
try {
  db.exec('ALTER TABLE schedules ADD COLUMN lat REAL');
  db.exec('ALTER TABLE schedules ADD COLUMN lng REAL');
} catch (e) {
  // Columns likely already exist
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "10mb" }));

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
      // Return the actual error message from Gemini if available
      const errorMessage = error.message || "Failed to analyze image";
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
    const { farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng } = req.body;
    const stmt = db.prepare(`
      INSERT INTO schedules (farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng);
    res.json({ id: info.lastInsertRowid });
  });

  // 3. Bookings
  app.get("/api/bookings", (req, res) => {
    const stmt = db.prepare("SELECT * FROM bookings ORDER BY date ASC");
    const bookings = stmt.all();
    res.json(bookings);
  });

  app.post("/api/bookings", (req, res) => {
    const { resourceType, farmerName, date } = req.body;
    const stmt = db.prepare(`
      INSERT INTO bookings (resourceType, farmerName, date)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(resourceType, farmerName, date);
    res.json({ id: info.lastInsertRowid });
  });

  app.delete("/api/bookings/:id", (req, res) => {
    const { id } = req.params;
    const stmt = db.prepare("DELETE FROM bookings WHERE id = ?");
    stmt.run(id);
    res.json({ success: true });
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
