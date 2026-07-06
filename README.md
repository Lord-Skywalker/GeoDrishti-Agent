# GeoDrishti: Autonomous Multi-Agent Geospatial Assistant

GeoDrishti is an AI-first, autonomous multi-agent geospatial assistant designed to simplify and automate the monitoring of riverine bankline erosion, seasonal flooding patterns, and real-time vegetation/water indexes on **Majuli Island, Assam, India** (the world's largest river island). Developed as a research prototype under **NIT Silchar Research** by **Anubhav (2315094)**, this workspace implements a consolidated geospatial stack comprising a React-based interactive visualizer, a Django REST Framework backend, a local Model Context Protocol (MCP) server wrapping SQLite metrics, and a multi-agent orchestration pipeline powered by the **Google Agentic Design Kit (ADK)** and the Gemini API.

---

## 🚀 Key Features

* **Three-Agent Orchestration Pipeline:** Natural language requests are parsed, validated, analyzed, and planned sequentially by three specialized agents (GIS Operator $\rightarrow$ Environmental Analyst $\rightarrow$ Resource Planner).
* **Real Satellite-Derived Historical Data:** Displays actual bankline erosion maps and SAR flood inundation polygons (2018–2025) derived from Sentinel-2 dry-season water-boundary analysis.
* **Dual Analysis Modes (Local vs. Global):** Connects to localized historical database records for Majuli Island, and automatically switches to live Google Earth Engine telemetry (NDVI/NDWI) for any global coordinates.
* **Automated Mitigation Action Plans:** Dynamically estimates mitigation material requirements (geo-bags, bamboo tons, and INR budget) based on deterministic land loss calculations.
* **Simulated Emergency Dispatch:** Enables users to conversationalize emergency notifications (e.g. "email this report to DDMA"), triggers a mock transactional dispatch service, and displays Toast alert notifications.
* **Dynamic Visualization Loop:** Automatically flies Leaflet maps to coordinates, updates time timeline sliders, and adapts UI layout states dynamically based on the agent's parsed parameters.

---

## 🏗️ System Architecture & Workflow

```
+-------------------+      User Query       +-------------------------------+
|   React Frontend  | --------------------> |         Django Backend        |
|   (Chat Drawer)   | <-------------------- |     (api/views.py Endpoint)   |
+-------------------+     Final Response    +-------------------------------+
          ^                                                 |
          |                                                 v
          |                                  +------------------------------+
          |                                  |     Google ADK Workflow      |
          |                                  +------------------------------+
          |                                                 |
          |                                                 v
          |                                  +------------------------------+
          |                                  |  1. Input Sanitization Gate  |
          |                                  +------------------------------+
          |                                                 |
          |                                                 v
          |                                  +------------------------------+
          |                                  |   2. Agent A (GIS Operator)  |
          |                                  +------------------------------+
          |                                                 |
          |                                                 v
          |                                  +------------------------------+
          |                                  |   3. Bounds-Check & Capping  |
          |                                  +------------------------------+
          |                                                 |
          |                                                 v
          |                                  +------------------------------+
          |                                  |   4. MCP Server Subprocess   |
          |                                  |     (Stdio JSON-RPC Client)  |
          |                                  +------------------------------+
          |                                                 |
          |                                                 v
          |                                  +------------------------------+
          |                                  |   5. Agent B (Env. Analyst)  |
          |                                  +------------------------------+
          |                                                 |
          |                                                 v
          |                                  +------------------------------+
          |                                  |  6. Agent C (Resource Plan)  |
          |                                  +------------------------------+
```

### The Three-Agent Pipeline
1. **Agent A (GIS Operator):** Translates user queries into structured geospatial parameter bounds (`GISParams`). Handles clamping temporal scopes (max 5 years) and mapping locations to coordinates. If a query is gibberish or off-topic, it returns a clarification warning.
2. **Agent B (Environmental Analyst):** Reviews GEE indices (NDVI/NDWI) and database metrics. Produces a formal `RiskReport`. It enforces separation between historical database metrics and live telemetry snapshots, aggregates multi-year statistics correctly, and maps the output to a Python-computed severity.
3. **Agent C (Resource Planner):** Generates `ResourcePlan` estimates. If queries are global live-telemetry, it bypasses calculations. Otherwise, it calls `calculate_mitigation_cost` to estimate material and budgets.

### Reliability & Security Guardrails
* **Prompt Injection Sanitizer:** Scans natural language queries for injection signatures (e.g. `"ignore instructions"`, `"system prompt"`). If flagged, it aborts execution early.
* **Off-Topic / Gibberish Clarification:** If Agent A cannot identify any place or coordinate, the system skips all GEE/database queries and returns a clarification request, cleanly wiping all prior analysis states.
* **Deterministic Severity Rule:** The backend calculates severity using a fixed Python threshold on total hectares lost:
  * `hectares_lost > 1000` $\rightarrow$ `"HIGH"`
  * `hectares_lost > 300` $\rightarrow$ `"MEDIUM"`
  * `hectares_lost >= 0` $\rightarrow$ `"LOW"`
  Agent B is strictly instructed to map its output severity to this computed severity.
* **Session Leak Protection:** The ADK engine utilizes a merge-delta model for session state updates. All short-circuit and early-exit paths explicitly clear previous analysis data (`risk_report`, `resource_plan`, `mcp_payload`, `dispatch_confirmation` set to `None`), preventing data leakage between consecutive queries in a single session.

---

## 📊 Data & Methodology

The historical database stats (2018–2025) for Majuli Island are stored in the Django backend sqlite database.
* **Methodology:** The water boundaries are derived from Google Earth Engine Sentinel-2 dry-season (January–March) NDWI median composite overlays. By focusing on the dry season, the system isolates long-term geomorphological soil erosion from temporary seasonal monsoon inundation.
* **Erosion vs. Accretion:** In the `ErosionData` model, `hectares` captures erosion-only land loss. The signed variable `raw_delta_ha` tracks the net water-area change (positive values indicate net land lost to water erosion, while negative values capture sandbar emergence and vegetation gain—accretion).

---

## 🛠️ Tech Stack

* **Frontend:** React 19.2.4 (JSX), Vite 8.0.1 (Bundler), Leaflet 1.9.4 & React-Leaflet 5.0.0 (Geospatial maps), Recharts 3.8.1 (Charts).
* **Backend:** Django 6.0.6, Django REST Framework 3.17.1, SQLite.
* **AI & Agentic Layer:** Google Agentic Design Kit (ADK) 2.3.0, Gemini 3.1 Flash Lite API.
* **MCP Integration:** FastMCP 3.4.2 (Stdio JSON-RPC).
* **GIS Telemetry:** Google Earth Engine Python API.

---

## ⚙️ Setup and Installation

### Prerequisites
* Python 3.11 or higher
* Node.js v18 or higher
* A Gemini API Key ([obtain here](https://aistudio.google.com/))
* A Google Earth Engine Service Account private key JSON file.

### 1. Configure Credentials
1. Copy `.env.example` to `.env` in the project root:
   ```bash
   cp .env.example .env
   ```
   Add your API key inside `.env`:
   ```env
   GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere
   ```
2. Place your Google Earth Engine service account key file in the root of the workspace under the filename:
   `gee-credentials.json`
   *(This filename is explicitly gitignored in `.gitignore` to prevent secret leakage)*.

### 2. Configure & Run Backend
1. Create a virtual environment and install requirements:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate      # On Linux/macOS: source .venv/bin/activate
   pip install -r backend/requirements.txt
   ```
2. Run database migrations:
   ```bash
   python backend/manage.py migrate
   ```
3. Start the Django API backend:
   ```bash
   python backend/manage.py runserver
   ```
   The backend API runs on `http://127.0.0.1:8000`.

### 3. Configure & Run Frontend
1. Navigate to the frontend folder, install dependencies, and run:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The React dashboard runs on `http://localhost:5173`. Open this URL, click **"Ask Copilot"**, and start querying.

---

## 💡 Usage Examples

* **Local Erosion Analysis:** 
  > *"Show me erosion risk for Majuli region in 2020"*
  * Demonstrates local historical database statistics fetch. Synced year range is mapped, the status card shows "HIGH", and the mitigation plan is calculated for 1751.84 hectares.
* **Multi-Year Trend Analysis:** 
  > *"Show me historical trends for Majuli from 2018 to 2022"*
  * Demonstrates multi-year temporal aggregation. The Analyst agent summarizes individual erosion/accretion years, maps cumulative loss to 1872.97 hectares, and triggers corresponding mitigation geo-bag allocations.
* **Global Live Telemetry:** 
  > *"Show me flood risk near Tokyo"*
  * Demonstrates global mode. The map flies to Tokyo, skips database stats (localized only to Majuli), queries Earth Engine Sentinel-2 imagery live, and returns rounded coordinates, scene date, NDVI, and NDWI.
* **Emergency Dispatcher:** 
  > *"email this report to the District Disaster Management Authority"*
  * Demonstrates dispatch capability. Simulates email dispatch, updates session status, and pops up a confirmation Toast notification in the frontend.

---

## 🔮 Future Directions

* **Brahmaputra Valley Expansion:** The architecture is region-agnostic. By replacing the static polygon files and extending database bounds, the system could easily monitor Kaziranga, Dibrugarh, or the entire Brahmaputra Valley.
* **SendGrid/SMTP Integration:** The dispatch system is simulated for prototype demo reliability; the underlying architecture can easily hook into a transactional mailer client in production.
