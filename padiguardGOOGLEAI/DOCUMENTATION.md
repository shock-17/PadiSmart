# PadiGuard - Project Documentation

## 1. Project Overview
**PadiGuard** is a smart paddy monitoring web application designed to help farmers optimize their crop health and resources. It provides Edge AI-powered disease detection, Smart Irrigation (AWD) alerts based on weather data, geographic mapping of fields, and community-based scheduling. 

## 2. Updated Features
1. **Deteksi Penyakit (Edge AI Simulation)**: Uses Gemini 2.5 Flash AI to analyze images of paddy plants and identify 6 common issues (Blast, HDB, Tungro, Wereng Cokelat, Keong Mas, Nitrogen Deficiency) along with actionable treatment advice.
2. **Smart Irrigation (AWD)**: Integrates with Open-Meteo API to fetch weather forecasts. Advises farmers when to irrigate or hold off based on upcoming rainfall, including critical alerts during the flowering phase. Displays a responsive 7-day rainfall bar chart.
3. **Peta Lahan (Interactive Mapping)**: Uses Leaflet and OpenStreetMap to plot coordinates of community paddy fields. Shows interactive markers that display ownership, crop variety, area size, and estimated harvest dates on click.
4. **Community Sync**: 
   * **Jadwal Tanam (Planting Schedule)**: A collaborative dashboard to log planting dates, auto-calculate harvest estimates (+115 days), and pick exact land locations via an interactive map picker.

## 3. Technology Stack
* **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Recharts (for charts), React-Leaflet (for mapping), Framer Motion (for animations), `react-webcam`.
* **Backend**: Express.js, SQLite (via `better-sqlite3`), `@google/genai` SDK.
* **External APIs**: Google Gemini API (for image classification), Open-Meteo API (for weather forecasting).
* **UI/UX Considerations**: Modals and layouts are strictly mobile-first. Max-heights (`max-h-[90vh]`) and `overflow-y-auto` ensure scrollability on small phone screens.

## 4. Database Schema
Powered by `better-sqlite3` operating in WAL (Write-Ahead Logging) mode.
* **schedules** table: `id`, `farmerName`, `variety`, `plantingDate`, `harvestDate`, `areaSize`, `lat` (latitude), `lng` (longitude).

## 5. Environment Setup
To run this application locally or in production, you must set up the `.env` file based on `.env.example`.
* `GEMINI_API_KEY`: Required for the AI-powered disease detection feature. Obtain this from Google AI Studio.

---

## 6. Software Configuration Management (SCM) Methods
For a small team of 3 people, SCM should be lightweight, agile, and automated where possible to avoid overhead. Here are the recommended SCM methods:

### A. Version Control System (VCS)
* **Tool**: **Git** hosted on **GitHub** or **GitLab**.
* **Method**: Every piece of code, database schema, and documentation must reside in the centralized repository.

### B. Branching Strategy
Given the small team size, heavy strategies like GitFlow are often unnecessary.
1. **GitHub Flow** (Recommended): 
   * A single, stable `main` branch.
   * Developers create short-lived feature branches (e.g., `feat/map-view`, `fix/camera-bug`).
   * Code is merged into `main` via Pull Requests (PRs) after a brief review by at least 1 other team member.
2. **Trunk-Based Development**:
   * If the team is highly experienced, developers commit directly to `main` (the trunk) in small, frequent batches.

### C. Issue Tracking & Configuration Accounting
* **Tools**: **GitHub Projects**, **Trello**, or **Notion**.
* **Method**: Use a simple Kanban board (To Do, In Progress, In Review, Done). Every feature, bug, or configuration change should be documented as a ticket. PRs should reference the specific ticket they solve.

### D. Continuous Integration and Continuous Deployment (CI/CD)
* **Tools**: **GitHub Actions** or **Vercel/Render** automated deployments.
* **Method**: 
  * **CI (Continuous Integration)**: Configure a script to automatically run `npm run lint` and `npm run build` whenever code is pushed. This ensures no one breaks the build.
  * **CD (Continuous Deployment)**: Automatically deploy the `main` branch to a staging or production URL (like Cloud Run or Vercel) so all 3 members can immediately see the latest stable version.

### E. Environment Configuration Management
* **Method**: Use `.env` files. Do NOT commit the `.env` file to the repository. Maintain an `.env.example` file that tracks the keys required for the project to run (e.g., `GEMINI_API_KEY`). Whenever a new environment variable is added, the developer must update `.env.example` and inform the team.
