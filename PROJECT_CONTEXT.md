# GeoDrishti Project Context & Progress Tracking

This document tracks the progress, implementation phases, verification status, and security measures for the GeoDrishti Agent Layer build.

## Project Metadata
- **Deadline:** Jul 7, 12:29 PM GMT+5:30 (Fixed)
- **Status:** In Progress
- **Target OS:** Windows
- **Workspace Root:** `D:\agy2-projects\Geodrishti-geospatial-agent`

---

## Progress Checklist

### PHASE 1 — Agent definitions (Google ADK)
- [x] Implement Agent A (GIS Operator)
  - [x] Input sanitization/validation (natural language)
  - [x] Maps query -> structured parameters (dates, coordinates, indices)
- [x] Implement Agent B (Environmental Analyst)
  - [x] Interprets indices data payload & identifies anomalies
  - [x] Generates risk reports
- [x] Verification status: Verified (Workflow run successfully with safe/unsafe tests)

### PHASE 2 — MCP Server
- [x] Wrap Django backend API endpoints as MCP tools
- [x] Connect agent layer to MCP tools for dynamic data access
- [x] Verification status: Verified (Spun up stdio MCP server subprocess and queried from ADK node)

### PHASE 3 — Frontend Integration
- [x] Add Agent Chat Drawer to the React app
- [x] Wire chat drawer into the natural-language-to-insight loop
- [x] Verification status: Verified (Vite builds successfully; drawer handles user text, calls `/api/agent-chat/`, maps severity risk report, and dynamically updates year slider/map visual state)

### PHASE 4 — Demo & Submission
- [x] Verify complete agent-to-insight loop end-to-end
- [x] Confirm no extraneous deployment/recording steps executed
- [x] Mark build as demo-ready
- [x] Verification status: Verified (Workflow runs, local server serves both endpoints, Vite build compiles cleanly, no deployment done)

---

## Security Guardrails & Implementation Details
- **Input Sanitization (`agent.py:sanitize_input`):** Prior to parsing, user queries are passed through an input sanitization node that scans for common prompt injection phrases (e.g., `"ignore instructions"`, `"bypass validation"`, `"system prompt"`). If detected, execution routes to a security failure fallback node that halts progress and alerts the user.
- **Query Bounds & Constraints (`agent.py:validate_bounds_and_fetch_data`):** Geographic and temporal parameters are strictly bounds-checked:
  - **Coordinates:** Latitudes must fall inside `[26.70, 27.20]` and Longitudes inside `[93.80, 94.70]` (enclosing Majuli Island with a safe margin). Malformed or global coordinates are rejected.
  - **Dates:** Range restricted strictly to `[2018-01-01]` and `[2026-12-31]` (reflecting valid Sentinel imagery periods).
- **Query Capping (`agent.py:validate_bounds_and_fetch_data`):** To avoid resource-exhausting temporal query loops on the Django database/Sentinel payloads, any query spanning more than 5 years is dynamically clamped to exactly 5 years from its start date, with a warning note appended to the session.
- **Judge-friendly Documentation:** Clear comments have been added inside `agent.py`, `mcp_server.py`, and `backend/api/views.py` specifically outlining where input sanitization, boundaries, scope capping, and MCP calls are executed.

---

## Key Decisions & Architecture
- **Workspace Copy:** Copied code from `D:\CODES\bhoomi-backend` and `D:\CODES\bhoomi-dashboard` into the workspace as `backend/` and `frontend/` to consolidate the production stack in our active workspace.
- **FastMCP Stdio Transport:** Used `fastmcp` to expose Django's ORM database queries as standard MCP tools. Spun up the server as a subprocess from the ADK validation node via `mcp.client.stdio` transport.
- **Dynamic Insight Loop:** Wired the React frontend to parse the agent's final `gis_params` response. If a matching end year is parsed from the query, the year slider and Leaflet geospatial overlays dynamically transition to that year instantly.

---

## Noticed, Not Fixing
- **Static Geospatial Layer Files:** Map shapes (e.g. `/erosion_2022.json`, `/ndvi_2022.png`) are served statically from the React public folder. If the user asks for years outside 2018-2025 (e.g. 2026), the agent returns correct textual metrics but the Leaflet map overlay fails to load visual elements (logged, not fixing).
- **Hardcoded Backend Fallback:** Added host resolution logic in the frontend `App.jsx` to dynamically switch backend URLs between `http://127.0.0.1:8000` (for local developer sandbox tests) and Render production API urls.
- **Vite minification chunk warning:** Vite build outputs a chunk larger than 500kB (Leaflet/Recharts bundle). As we are not refactoring, kept it as-is without introducing custom code-splitting routers.
