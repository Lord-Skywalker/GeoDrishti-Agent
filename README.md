# GeoDrishti: Autonomous Multi-Agent Geospatial Assistant

GeoDrishti is an AI-first, Autonomous Multi-Agent Geospatial Assistant designed to simplify and automate the monitoring of riverine erosion and seasonal flooding patterns on **Majuli Island, Assam, India** (the world's largest river island).

This workspace holds the complete Capstone Project implementation: a production-ready stack comprising a React-based interactive geospatial visualizer, a Django REST Framework backend with spatial endpoints, a local Model Context Protocol (MCP) server wrapping database metrics, and an agent layer powered by the **Google Agentic Design Kit (ADK)** and the Gemini API.

---

## 1. Problem Statement
Majuli Island faces extreme geomorphological changes due to seasonal monsoon flooding and rapid soil erosion along the Brahmaputra River. 
Traditionally, assessing risk factors requires:
1. Manually toggling layer configurations (SAR flood extents, DEM slopes, NDVI vegetation density).
2. Manually calculating temporal land loss percentages.
3. Engaging specialized GIS analysts to interpret raster metrics.

**GeoDrishti solves this manual overhead** by introducing a conversational agent layer directly on top of the map. Users query the dashboard in natural language, and the system dynamically retrieves backend statistics, interprets anomalies, suggests risk severity levels, and snaps the visual map layers to the relevant epochs automatically.

---

## 2. Solution Overview
The GeoDrishti Agent Layer consists of three core components:
1. **Agent Chat Drawer (React UI):** A sliding workspace side drawer providing quick action buttons, loading indicators, and markdown chat bubbles. It coordinates the visual state of the map based on the agent's insights.
2. **Multi-Agent Orchestration (Google ADK):** A sequential pipeline containing:
   - **Agent A (GIS Operator):** Translates natural language requests into structured GIS API parameters (date ranges, coordinates, target indices).
   - **Agent B (Environmental Analyst):** Reviews the gathered metrics, highlights anomalies, and generates comprehensive risk assessments.
3. **Model Context Protocol (MCP) Server:** A Python stdio FastMCP server wrapping Django database models. The ADK workflow queries the MCP server dynamically to pull historical erosion statistics.

---

## 3. System Architecture & Flow

```
+------------------+     User Query     +-----------------------------+
|  React Frontend  | -----------------> |       Django Backend        |
|  (Chat Drawer)   | <----------------- |    (api/views.py endpoint)  |
+------------------+    Final Report    +-----------------------------+
         ^                                             |
         |                                             v
         |                              +-----------------------------+
         |                              |     Google ADK Workflow     |
         |                              +-----------------------------+
         |                                             |
         |  Dynamic map sync                           v
         |  (setSelectedYear)           +-----------------------------+
         |                                | 1. Input Sanitization Gate  |
         |                                +-----------------------------+
         |                                             |
         |                                             v
         |                              +-----------------------------+
         |                              |   2. Agent A (GIS Operator) |
         |                              +-----------------------------+
         |                                             |
         |                                             v
         |                              +-----------------------------+
         |                              | 3. Bounds-Check & Capping   |
         |                              +-----------------------------+
         |                                             |
         |                                             v
         |                              +-----------------------------+
         |                              |   4. MCP Server Subprocess  |
         |                              |      (Stdio JSON-RPC)       |
         |                              +-----------------------------+
         |                                             |
         |                                             v
         |                              +-----------------------------+
         |                              |   5. Django SQLite Database |
         |                              +-----------------------------+
         |                                             |
         |                                             v
         |                              +-----------------------------+
         |                              | 6. Agent B (Env. Analyst)   |
         |                              +-----------------------------+
```

### End-to-End Execution Sequence
1. The user asks a question in the chat drawer (e.g., *"Show me the erosion risk for Garmur in 2023"*).
2. The request hits the Django view `/api/agent-chat/` which kicks off the Google ADK workflow.
3. **Sanitization Gate:** Checks for prompt injection keywords. If clean, passes to Agent A.
4. **Agent A (GIS Operator):** Extracts parameters like dates (`2023-01-01` to `2023-12-31`), coordinates, and required indices (`['Erosion']`).
5. **Validation & Capping Gate:** Checks if coordinates lie within Majuli Island bounding box. Clamps date ranges exceeding 5 years.
6. **MCP Client Session:** Launches `mcp_server.py` in a stdio subprocess, invokes `get_erosion_stats` and `get_gis_config` tools, and fetches raw Django SQLite stats.
7. **Agent B (Environmental Analyst):** Evaluates the database metrics, flags anomalies, and formats a structured `RiskReport` JSON (severity, findings, narrative).
8. **Frontend Sync:** The frontend displays the report and automatically sets `selectedYear` to `2023`, instantly showing the corresponding high-risk red polygons on the Leaflet map.

---

## 4. Graded Security Guardrails
We have implemented real, programmatically enforced security gates inside [agent.py](file:///D:/agy2-projects/Geodrishti-geospatial-agent/agent.py) to prevent crash loops and database exposure:

- **Input Sanitization:** Intercepts input strings in the `sanitize_input` node. Blocks queries containing prompt injection sequences (e.g., `"ignore instructions"`, `"bypass validation"`), returning a `security_flagged` status.
- **Coordinate Bounding:** Strictly bounds coordinate queries to Majuli Island coordinates: Latitude `[26.70, 27.20]` and Longitude `[93.80, 94.70]` (with a safe margin). Requests outside this box are immediately rejected before querying the backend.
- **Date Range Restrictions:** Date ranges must fall strictly within `[2018-01-01]` and `[2026-12-31]` (reflecting actual satellite observation assets).
- **Query Capping:** Any query spanning a temporal range greater than 5 years is dynamically clamped to exactly 5 years from its start date to protect the backend from heavy database sweeps.

---

## 5. Local Setup & Installation

### Prerequisites
- Python 3.11 or higher
- Node.js v18 or higher
- A Google Gemini API Key (obtained from [Google AI Studio](https://aistudio.google.com/))

### Step 1: Clone and Configure Environment
Copy `.env.example` to `.env` in the root folder and add your Gemini API Key:
```bash
cp .env.example .env
```
Inside `.env`:
```env
GEMINI_API_KEY=AIzaSyYourGeminiApiKeyHere
```

### Step 2: Install Backend Dependencies
Set up your virtual environment and install the requirements:
```bash
python -m venv .venv
.venv\Scripts\activate      # On Linux/macOS: source .venv/bin/activate
pip install -r backend/requirements.txt
```

### Step 3: Run the Django API & MCP Server
Start the Django backend local server. It serves both the stats REST endpoints and wraps the ADK workflows:
```bash
python backend/manage.py runserver
```
The backend server runs locally on `http://127.0.0.1:8000`.

### Step 4: Run the React Frontend
Open a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
The React development server runs locally on `http://localhost:5173`. Open this URL in your web browser. Click the **"Ask Copilot"** button in the top left to open the agent chat drawer and start interacting!

---

## 6. Project Verification Status
All phases have been fully tested and verified locally:
- **FastMCP Server Verification:** Handshake and JSON-RPC tool calls completed successfully.
- **ADK Workflow Verification:** Correctly parsed queries, validated coordinates, fetched SQLite metrics, and produced structured analyst reports.
- **Frontend Compilation:** Vite successfully built assets (`npm run build`) without compilation or package import issues.
