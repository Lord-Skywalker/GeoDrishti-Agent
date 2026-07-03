import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, ImageOverlay, LayersControl, ScaleControl, Marker, Popup, FeatureGroup } from 'react-leaflet';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import 'leaflet/dist/leaflet.css'; 
import './App.css';

// --- FIX FOR BROKEN MAP ICONS ---
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});
// --------------------------------

function App() {
  const [selectedYear, setSelectedYear] = useState(2022);
  const [erosionStats, setErosionStats] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [realErosionShapes, setRealErosionShapes] = useState(null);
  const [floodShapes, setFloodShapes] = useState(null); 
  
  const [isPanelOpen, setIsPanelOpen] = useState(true); 
  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false); // NEW: Dropdown State

  // --- AGENT CHAT STATE ---
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'agent',
      text: 'Hello! I am your GeoDrishti Copilot. You can ask me to analyze erosion risks, evaluate flood zones, or check NDVI vegetation indices on Majuli Island for specific time frames.'
    }
  ]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const majuliPosition = [26.95, 94.28];
  const majuliBounds = [[26.80, 93.90], [27.15, 94.60]]; 

  const landmarks = [
    { name: "Kamalabari", pos: [26.931, 94.215] },
    { name: "Garmur", pos: [26.963, 94.225] },
    { name: "Auniati Satra", pos: [26.895, 94.165] },
    { name: "Dakshinpat Satra", pos: [26.865, 94.295] }
  ];

  // Helper to dynamically resolve backend host based on current environment
  const getApiUrl = (path) => {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const host = isLocal ? 'http://127.0.0.1:8000' : 'https://geodrishti-backend.onrender.com';
    return `${host}${path}`;
  };

  const handleSendChat = (text) => {
    if (!text.trim()) return;
    
    // Add user message
    const userMsg = { sender: 'user', text };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);

    fetch(getApiUrl('/api/agent-chat/'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: text })
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        return res.json();
      })
      .then(data => {
        setIsChatLoading(false);
        
        // 1. Check for sanitization errors
        if (data.sanitization_error) {
          setMessages(prev => [...prev, {
            sender: 'system-error',
            text: `⚠️ Security Gate: ${data.sanitization_error}`
          }]);
          return;
        }

        // 2. Check for validation bounds errors
        if (data.validation_error) {
          setMessages(prev => [...prev, {
            sender: 'system-error',
            text: `⚠️ Validation Gate: ${data.validation_error}`
          }]);
          return;
        }

        // 3. Process normal agent response
        if (data.status === 'data_retrieved' && data.risk_report) {
          const report = data.risk_report;
          const severityTag = `[${report.severity} RISK]`;
          const responseText = `${severityTag} ${report.risk_report}`;
          
          setMessages(prev => [...prev, {
            sender: 'agent',
            text: responseText,
            findings: report.findings,
            gisParams: data.gis_params
          }]);

          // Dynamic Insight Loop: Automatically switch year to matching endpoint temporal boundary
          if (data.gis_params && data.gis_params.end_date) {
            const endYear = new Date(data.gis_params.end_date).getFullYear();
            if (endYear >= 2018 && endYear <= 2025) {
              setSelectedYear(endYear);
            }
          }
        } else {
          setMessages(prev => [...prev, {
            sender: 'agent',
            text: 'I received the request, but could not retrieve a structured risk report from the environmental analyst.'
          }]);
        }
      })
      .catch(err => {
        setIsChatLoading(false);
        setMessages(prev => [...prev, {
          sender: 'system-error',
          text: `Error contacting agent layer: ${err.message}. Make sure the backend Django server is running locally.`
        }]);
      });
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    handleSendChat(chatInput);
  };

  const handleQuickPrompt = (promptText) => {
    handleSendChat(promptText);
  };

  useEffect(() => {
    fetch(getApiUrl('/api/erosion-stats/'))
      .then(res => res.json())
      .then(data => {
        setErosionStats(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error("Django offline");
        setIsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch(`/erosion_${selectedYear}.json`)
      .then(res => res.json())
      .then(data => setRealErosionShapes(data))
      .catch(() => setRealErosionShapes(null));

    fetch(`/flood_${selectedYear}.json`)
      .then(res => res.json())
      .then(data => setFloodShapes(data))
      .catch(() => setFloodShapes(null)); 
  }, [selectedYear]);

  const currentData = erosionStats.find(d => d.year === selectedYear);
  const prevData = erosionStats.find(d => d.year === selectedYear - 1);

  const calculateChange = () => {
    if (!currentData || !prevData) return null;
    const change = ((currentData.hectares - prevData.hectares) / prevData.hectares) * 100;
    return change.toFixed(1);
  };

  const change = calculateChange();
  
  const erosionStyle = { color: "#ff3333", weight: 1.5, fillColor: "#ff0000", fillOpacity: 0.5 };
  const floodStyle = { color: "#3b82f6", weight: 1.5, fillColor: "#2563eb", fillOpacity: 0.4 }; 

  return (
    <div className="dashboard-container">
      
      <MapContainer center={majuliPosition} zoom={11} className="map-container" zoomControl={false}>
        <LayersControl position="bottomleft">
          
          <LayersControl.BaseLayer checked name="Satellite Imagery">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Standard Map">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          </LayersControl.BaseLayer>

          <LayersControl.Overlay checked name="High Erosion Risk (Red)">
            <FeatureGroup>
              {realErosionShapes && (
                <GeoJSON key={`erosion-${selectedYear}`} data={realErosionShapes} style={erosionStyle} onEachFeature={(f, l) => l.bindPopup(`Erosion Risk (${selectedYear})`)} />
              )}
            </FeatureGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay name="Monsoon Flood Inundation (Blue)">
            <FeatureGroup>
              {floodShapes && (
                <GeoJSON key={`flood-${selectedYear}`} data={floodShapes} style={floodStyle} onEachFeature={(f, l) => l.bindPopup(`Flood Zone (${selectedYear})`)} />
              )}
            </FeatureGroup>
          </LayersControl.Overlay>

          <LayersControl.Overlay name="NDVI Vegetation Loss (Raster)">
            <ImageOverlay url={`/ndvi_${selectedYear}.png`} bounds={majuliBounds} opacity={0.6} zIndex={10} />
          </LayersControl.Overlay>

          <LayersControl.Overlay name="DEM Slope Topography (Raster)">
            <ImageOverlay url="/slope_map.png" bounds={majuliBounds} opacity={0.6} zIndex={9} />
          </LayersControl.Overlay>

        </LayersControl>

        {landmarks.map((place, idx) => (
          <Marker key={idx} position={place.pos}>
            <Popup><strong>{place.name}</strong><br/>Majuli, Assam</Popup>
          </Marker>
        ))}

        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>

      {/* AGENT CHAT TOGGLE BUTTON */}
      <button 
        className={`agent-drawer-toggle-btn ${isAgentDrawerOpen ? 'drawer-open' : ''}`} 
        onClick={() => setIsAgentDrawerOpen(!isAgentDrawerOpen)}
      >
        🛰️ {isAgentDrawerOpen ? 'Close Drawer' : 'Ask Copilot'}
      </button>

      {/* AGENT CHAT DRAWER */}
      <div className={`agent-drawer ${!isAgentDrawerOpen ? 'collapsed' : ''}`}>
        <div className="agent-drawer-header">
          <h2>🛰️ GeoDrishti Copilot</h2>
          <p>Autonomous Geospatial Assistant</p>
        </div>
        <div className="agent-chat-messages">
          {messages.map((m, idx) => (
            <div key={idx} className={`chat-message ${m.sender}`}>
              {m.gisParams && (
                <div className="gis-params-tag">
                  <strong>Parsed Parameters:</strong><br/>
                  • Range: {m.gisParams.start_date} to {m.gisParams.end_date}<br/>
                  • BBox: Lat [{m.gisParams.latitude_min.toFixed(2)}, {m.gisParams.latitude_max.toFixed(2)}] | Lon [{m.gisParams.longitude_min.toFixed(2)}, {m.gisParams.longitude_max.toFixed(2)}]<br/>
                  • Indices: {m.gisParams.indices.join(', ')}
                </div>
              )}
              <div>{m.text}</div>
              {m.findings && m.findings.length > 0 && (
                <ul className="findings-list">
                  {m.findings.map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              )}
            </div>
          ))}
          {isChatLoading && (
            <div className="chat-loading-spinner">
              <div className="chat-spinner"></div>
              <span>Agent is thinking...</span>
            </div>
          )}
        </div>
        <div className="agent-chat-input-area">
          <div className="quick-prompts">
            <button className="quick-prompt-btn" onClick={() => handleQuickPrompt("Analyze Kamalabari region erosion risk for 2023")}>Kamalabari 2023</button>
            <button className="quick-prompt-btn" onClick={() => handleQuickPrompt("Show me historical trends from 2018 to 2025")}>Full Trends</button>
            <button className="quick-prompt-btn" onClick={() => handleQuickPrompt("Show NDVI anomaly for Garmur region in 2022")}>NDVI 2022</button>
          </div>
          <form onSubmit={handleFormSubmit} className="chat-input-form">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask about erosion, dates, or NDVI..."
              className="chat-text-input"
              disabled={isChatLoading}
            />
            <button type="submit" className="chat-send-btn" disabled={isChatLoading || !chatInput.trim()}>Send</button>
          </form>
        </div>
      </div>

      {/* FLOATING HEADER */}
      <div className={`floating-header ${isAgentDrawerOpen ? 'shifted' : ''}`}>
        <h1>GeoDrishti</h1>
        <p>NIT Silchar Research | Majuli Island</p>
      </div>

      {/* STATIC MAP LEGEND */}
      <div className={`map-legend ${isAgentDrawerOpen ? 'shifted' : ''}`}>
        <h4>Map Legend</h4>
        
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#ff0000', opacity: 0.5 }}></span>
          <span>Erosion Risk Area</span>
        </div>
        
        <div className="legend-item">
          <span className="legend-color" style={{ background: '#2563eb', opacity: 0.4 }}></span>
          <span>Monsoon Flood Zone</span>
        </div>
 
        <div className="legend-item gradient-block">
          <span>NDVI (Vegetation Cover)</span>
          <div className="gradient-bar ndvi-gradient"></div>
          <div className="gradient-labels">
            <span>Water/Bare</span>
            <span>Dense Forest</span>
          </div>
        </div>
 
        <div className="legend-item gradient-block">
          <span>Terrain Slope (DEM)</span>
          <div className="gradient-bar slope-gradient"></div>
          <div className="gradient-labels">
            <span>Flat (0°)</span>
            <span>Steep (&gt;10°)</span>
          </div>
        </div>
      </div>

      {/* DOWNLOAD MENU (Only visible when panel is open) */}
      {isPanelOpen && (
        <div className="download-container">
          <button className="download-btn" onClick={() => setIsDownloadMenuOpen(!isDownloadMenuOpen)}>
            📥 Timelapses
          </button>
          
          {isDownloadMenuOpen && (
            <div className="download-dropdown">
              <p>Download 2018-2025 (.gif)</p>
              <a href="/timelapse_ndvi.gif" download>🌿 NDVI Evolution</a>
              <a href="/timelapse_flood.gif" download>🌊 Flood Patterns</a>
              <a href="/timelapse_erosion.gif" download>⚠️ Erosion Extent</a>
            </div>
          )}
        </div>
      )}

      {/* TOGGLE BUTTON & SIDE PANEL */}
      <button className={`panel-toggle-btn ${isPanelOpen ? 'panel-open' : ''}`} onClick={() => {
        setIsPanelOpen(!isPanelOpen);
        setIsDownloadMenuOpen(false); // Close dropdown if panel closes
      }}>
        {isPanelOpen ? '✕' : '☰'}
      </button>

      <div className={`side-panel ${!isPanelOpen ? 'collapsed' : ''}`}>
        <div className="panel-content">
          {isLoading ? (
            <div className="loader-container">
              <div className="spinner"></div>
              <p style={{ fontWeight: 'bold', color: '#38bdf8' }}>🛰️ Fetching Satellite Data...</p>
              <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '8px' }}>Waking up secure backend server. This may take up to 50 seconds.</p>
            </div>
          ) : (
            <>
              <div className="stats-grid">
                <div className="stat-card">
                  <h4>Risk Area Detected</h4>
                  <p>{currentData ? `${currentData.hectares.toLocaleString()} Ha` : 'N/A'}</p>
                </div>
                <div className="stat-card">
                  <h4>Annual Change</h4>
                  <p className={change > 0 ? 'trend-up' : 'trend-down'}>{change ? `${change > 0 ? '↑' : '↓'} ${Math.abs(change)}%` : '--'}</p>
                </div>
                <div className="stat-card">
                  <h4>Status</h4>
                  <p style={{ color: currentData?.hectares > 15000 ? '#ef4444' : '#fbbf24' }}>{currentData?.hectares > 15000 ? 'CRITICAL' : 'HIGH'}</p>
                </div>
              </div>

              <div className="panel-card" style={{marginTop: '20px'}}>
                <h2 style={{fontSize: '18px', marginBottom: '10px'}}>Temporal Trends</h2>
                <div style={{ width: '100%', height: 180 }}>
                  <ResponsiveContainer>
                    <AreaChart data={erosionStats}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="year" stroke="#94a3b8" fontSize={10}/>
                      <YAxis stroke="#94a3b8" fontSize={10}/>
                      <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }} />
                      <Area type="monotone" dataKey="hectares" stroke="#ef4444" fill="#ef4444" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                <div className="metadata-box" style={{marginTop: '25px', fontSize: '12px', color: '#94a3b8', background: '#1e293b', padding: '15px', borderRadius: '8px'}}>
                  <strong style={{color: 'white'}}>Data Layers:</strong><br/><br/>
                  • Erosion Risk: Sentinel-1 & 2 (GeoJSON)<br/>
                  • Flood Extent: Sentinel-1 SAR (GeoJSON)<br/>
                  • Vegetation (NDVI): Sentinel-2 (Raster)<br/>
                  • Slope (DEM): SRTM 30m (Raster)
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* FLOATING BOTTOM TIMELINE */}
      <div className="floating-bottom-bar">
        <h3>Year Selection: {selectedYear}</h3>
        <input type="range" min="2018" max="2025" step="1" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="year-slider" />
      </div>
      
    </div>
  );
}

export default App;