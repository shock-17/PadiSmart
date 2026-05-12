# Product Requirements Document (PRD) - PadiGuard

## 1. Product Overview
**Product Name:** PadiGuard  
**Product Version:** 1.0.0 (Current Build)  
**Platform:** Web Application (Mobile-responsive SPA)  
**Target Audience:** Paddy farmers (Petani Padi) and Farmer Communities (Kelompok Tani) in Indonesia.  

**Vision:** To empower paddy farmers with smart, accessible, data-driven tools that reduce crop failure, optimize water usage, and streamline community coordination, ultimately leading to better yields and economic stability.

---

## 2. Problem Statement
* Farmers often misdiagnose plant diseases, leading to incorrect pesticide use and crop loss.
* Water is often wasted due to continuous flooding instead of utilizing Alternate Wetting and Drying (AWD) methods.
* Uncoordinated community planting leads to massive simultaneous harvests, crashing local grain prices, and causing scheduling conflicts for shared agricultural machinery.

---

## 3. Core Features & Requirements (Current Build)

### 3.1. Deteksi Penyakit (Disease Detection)
* **Goal:** Enable farmers to quickly identify paddy plant conditions using their smartphone camera.
* **Requirements:**
  * Must utilize the device's camera (rear-facing by default) to capture images directly from the browser.
  * Must connect to an AI processing backend (Google Gemini 2.5 Flash API).
  * Must classify the image into one of 7 states:
    1. Blast
    2. HDB (Bacterial Leaf Blight)
    3. Tungro
    4. Wereng Cokelat (Brown Planthopper)
    5. Keong Mas (Golden Apple Snail)
    6. Defisiensi Nitrogen (Nitrogen Deficiency)
    7. Healthy (Sehat)
  * Must display the detected condition, Confidence level (%), Description, and Specific Treatment advice in Indonesian.

### 3.2. Smart Irrigation / AWD (Alternate Wetting and Drying)
* **Goal:** Optimize water usage by providing weather-backed irrigation suggestions.
* **Requirements:**
  * Must fetch the user's current GPS location via the browser's Geolocation API (falls back to Jakarta if denied).
  * Must integrate with a weather API (Open-Meteo) to fetch the 7-day precipitation and temperature forecast.
  * Must provide a definitive action status:
    * **"Tunda Irigasi" (Delay)**: If >10mm rain is expected today or tomorrow.
    * **"Perlu Irigasi" (Irrigate)**: If weather is dry.
  * Must visualize the 7-day rainfall forecast using a bar chart.
  * Must show alert for critical phases (e.g., Warning not to dry the field during the flowering/pembungaan phase).

### 3.3. Peta Lahan (Geographic Field Mapping)
* **Goal:** Provide a visual overview of community land plots.
* **Requirements:**
  * Must display an interactive map (Leaflet / OpenStreetMap).
  * Must plot markers for every registered schedule that contains latitude and longitude coordinates.
  * Marker popups must display: Farmer name, variety planted, area size in Hectares, and estimated harvest date.

### 3.4. Komunitas Tani (Community Sync)
* **Goal:** Coordinate planting schedules and shared resource usage among village farmers.
* **Requirements:**
  * **Jadwal Tanam (Planting Schedule):**
    * Display active planting schedules across the community.
    * Form inputs: Farmer Name, Variety (Ciherang, Inpari 32, Inpari 42, Mekongga), Area Size, Planting Date, and Map Picker for Location.
    * System must auto-calculate the estimated Harvest Date (+115 days based on variety).
  * **Sewa Alat (Resource Booking):**
    * Display available unit limits (e.g., 2 Combine Harvesters, 5 Drying Floors).
    * List confirmed ongoing bookings.
    * Form inputs: Farmer Name, Equipment Type, Booking Date.
  * Must display community recommendations (e.g., suggesting specific planting dates to avoid simultaneous harvest).

---

## 4. Technical Architecture & Constraints
* **Frontend:** React 19 (TypeScript, Vite). Styled with Tailwind CSS. Charts powered by Recharts. Maps powered by React-Leaflet.
* **Backend:** Express.js Node server handling API proxies.
* **Database:** SQLite (`better-sqlite3`) utilizing Write-Ahead Logging (WAL) for concurrent read/write performance.
* **Storage Schema:**
  * `schedules`: id, farmerName, variety, plantingDate, harvestDate, areaSize, lat, lng
  * `bookings`: id, resourceType, farmerName, date, status
* **AI Integration:** `@google/genai` Node SDK proxying the user prompt and image stream. Base64 images are sent with `application/json` response expectations.

---

## 5. Out of Scope (Future Roadmap)
* **True Edge AI / Offline Inference:** The current build streams images to the Gemini cloud API. A future native mobile version (Android/iOS) will utilize an on-device TFLite model to comply strictly with the "no internet" edge AI requirement.
* **User Authentication:** Currently, the app assumes a trusted community environment with no login gate. Future builds will incorporate Firebase Auth/Clerk for farmer identity verification.
* **SMS/WhatsApp Notifications:** Push notifications and automated SMS for irrigation reminders are mocked visually but not yet connected to a communications gateway like Twilio.
