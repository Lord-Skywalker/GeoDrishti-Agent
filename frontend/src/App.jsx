import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, ImageOverlay, LayersControl, ScaleControl, Marker, Popup, FeatureGroup, useMap } from 'react-leaflet';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
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
// Helper component to handle flying to a new location in Leaflet
function ChangeView({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom || 11);
    }
  }, [center, zoom, map]);
  return null;
}

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
  const [toast, setToast] = useState(null);
  const [sessionId, setSessionId] = useState('');

  useEffect(() => {
    let session = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try {
        session = crypto.randomUUID();
      } catch (e) {}
    }
    setSessionId(session);
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const majuliPosition = [26.95, 94.28];
  const [mapCenter, setMapCenter] = useState(majuliPosition);
  const [mapZoom, setMapZoom] = useState(11);
  const [customMarker, setCustomMarker] = useState(null);
  const [currentLocation, setCurrentLocation] = useState('Majuli Island');
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [resourcePlan, setResourcePlan] = useState(null);
  const [riskReport, setRiskReport] = useState(null);
  const majuliBounds = [[26.80, 93.90], [27.15, 94.60]]; 

  const landmarks = [
    { name: "Kamalabari", pos: [26.931, 94.215] },
    { name: "Garmur", pos: [26.963, 94.225] },
    { name: "Auniati Satra", pos: [26.895, 94.165] },
    { name: "Dakshinpat Satra", pos: [26.865, 94.295] }
  ];

  // Helper to dynamically resolve backend host based on current environment
  const getApiUrl = (path) => {
    if (import.meta.env.VITE_API_BASE_URL) {
      return `${import.meta.env.VITE_API_BASE_URL}${path}`;
    }
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
      body: JSON.stringify({ query: text, session_id: sessionId })
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
        if (data.status === 'data_retrieved') {
          if (data.dispatch_confirmation && data.dispatch_confirmation.success) {
            setToast({
              recipient: data.dispatch_confirmation.recipient,
              timestamp: data.dispatch_confirmation.timestamp
            });
          }

          if (data.risk_report) {
            const report = data.risk_report;
            setRiskReport(report);
            const severityTag = `[${report.severity} RISK]`;
            const responseText = `${severityTag} ${report.risk_report}`;
            
            setMessages(prev => [...prev, {
              sender: 'agent',
              text: responseText,
              findings: report.findings,
              gisParams: data.gis_params
            }]);

            if (data.gis_params && data.gis_params.location_name) {
              setCurrentLocation(data.gis_params.location_name);
            }

            let liveMetricsData = null;
            if (data.live_gee_satellite_metrics) {
              liveMetricsData = data.live_gee_satellite_metrics;
            } else if (data.mcp_payload) {
              try {
                const parsedMcp = JSON.parse(data.mcp_payload);
                if (parsedMcp && parsedMcp.live_gee_satellite_metrics) {
                  liveMetricsData = parsedMcp.live_gee_satellite_metrics;
                }
              } catch (e) {
                console.error("Error parsing mcp_payload", e);
              }
            }
            if (liveMetricsData) {
              setLiveMetrics(liveMetricsData);
            }

            if (data.resource_plan) {
              setResourcePlan(data.resource_plan);
            } else {
              setResourcePlan(null);
            }

            // Dynamic Insight Loop: Automatically switch year to matching endpoint temporal boundary
            if (data.gis_params && data.gis_params.end_date) {
              const endYear = new Date(data.gis_params.end_date).getFullYear();
              if (endYear >= 2018 && endYear <= 2025) {
                setSelectedYear(endYear);
              }
            }

            // Fly map container to the new location coordinates dynamically
            if (data.gis_params) {
              let lat = data.gis_params.resolved_latitude;
              let lon = data.gis_params.resolved_longitude;
              if (lat === undefined || lon === undefined || lat === null || lon === null) {
                if (data.gis_params.latitude_min !== undefined && data.gis_params.latitude_max !== undefined) {
                  lat = (data.gis_params.latitude_min + data.gis_params.latitude_max) / 2;
                  lon = (data.gis_params.longitude_min + data.gis_params.longitude_max) / 2;
                }
              }
              if (lat !== undefined && lon !== undefined && lat !== null && lon !== null && !isNaN(lat) && !isNaN(lon)) {
                setMapCenter([lat, lon]);
                setMapZoom(11);
                setCustomMarker({
                  position: [lat, lon],
                  name: data.gis_params.location_name || "Queried Location"
                });
              }
            }
          } else {
            // Conversational response fallback (e.g., warning message or dispatch notification)
            const fallbackText = data.notes || 'Operation completed successfully.';
            const isClarification = data.gis_params && !data.gis_params.location_name;
            
            setMessages(prev => [...prev, {
              sender: 'agent',
              text: fallbackText,
              gisParams: isClarification ? null : data.gis_params
            }]);

            if (isClarification) {
              setLiveMetrics(null);
              setResourcePlan(null);
              setRiskReport(null);
              setCustomMarker(null);
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
          text: 'Please refresh the page and try again once or twice. The backend is waking up and loading.'
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
      
      <MapContainer center={mapCenter} zoom={mapZoom} className="map-container" zoomControl={false}>
        <ChangeView center={mapCenter} zoom={mapZoom} />
        <LayersControl position="bottomleft">
          
          <LayersControl.BaseLayer checked name="Satellite Imagery">
            <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" />
          </LayersControl.BaseLayer>

          <LayersControl.BaseLayer name="Standard Map">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
          </LayersControl.BaseLayer>

          {currentLocation.toLowerCase().includes('majuli') ? (
            <>
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
            </>
          ) : null}

        </LayersControl>

        {landmarks.map((place, idx) => (
          <Marker key={idx} position={place.pos}>
            <Popup><strong>{place.name}</strong><br/>Majuli, Assam</Popup>
          </Marker>
        ))}

        {customMarker && (
          <Marker position={customMarker.position}>
            <Popup>
              <strong>{customMarker.name}</strong><br/>
              Latitude: {customMarker.position[0].toFixed(4)}<br/>
              Longitude: {customMarker.position[1].toFixed(4)}
            </Popup>
          </Marker>
        )}

        <ScaleControl position="bottomleft" imperial={false} />
      </MapContainer>

      {/* AGENT CHAT TOGGLE BUTTON */}
      <button 
        className={`agent-drawer-toggle-btn ${isAgentDrawerOpen ? 'drawer-open' : ''}`} 
        onClick={() => {
          setIsAgentDrawerOpen(prev => {
            const next = !prev;
            if (next && window.innerWidth < 768) {
              setIsPanelOpen(false);
            }
            return next;
          });
        }}
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
                  {m.gisParams.location_name && (
                    <>• Location: {m.gisParams.location_name}<br/></>
                  )}
                  {m.gisParams.resolved_latitude !== undefined && m.gisParams.resolved_latitude !== null && (
                    <>• Coordinates: {m.gisParams.resolved_latitude.toFixed(4)}, {m.gisParams.resolved_longitude.toFixed(4)}<br/></>
                  )}
                  {m.gisParams.latitude_min !== undefined && m.gisParams.latitude_min !== null && (
                    <>• BBox: Lat [{m.gisParams.latitude_min.toFixed(2)}, {m.gisParams.latitude_max.toFixed(2)}] | Lon [{m.gisParams.longitude_min.toFixed(2)}, {m.gisParams.longitude_max.toFixed(2)}]<br/></>
                  )}
                  • Indices: {m.gisParams.indices && m.gisParams.indices.length > 0 ? m.gisParams.indices.join(', ') : 'None specified'}
                  {m.gisParams.date_range_adjusted && (
                    <div style={{ fontSize: '11px', color: '#fbbf24', marginTop: '5px', fontWeight: '500' }}>
                      ⚠️ Note: requested date range was adjusted to {m.gisParams.start_date.substring(0, 4)}-{m.gisParams.end_date.substring(0, 4)} due to {m.gisParams.adjustment_reason}.
                    </div>
                  )}
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
        <p>NIT Silchar Research | Anubhav Deb | {currentLocation}</p>
      </div>

      {/* STATIC MAP LEGEND */}
      {currentLocation.toLowerCase().includes('majuli') && (
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
      )}

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

      <button className={`panel-toggle-btn ${isPanelOpen ? 'panel-open' : ''}`} onClick={() => {
        setIsPanelOpen(prev => {
          const next = !prev;
          if (next && window.innerWidth < 768) {
            setIsAgentDrawerOpen(false);
          }
          return next;
        });
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
              {currentLocation.toLowerCase().includes('majuli') ? (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <h4>Erosion Loss</h4>
                      <p>{currentData ? `${currentData.hectares.toLocaleString()} Ha` : 'N/A'}</p>
                      {currentData && currentData.hectares !== currentData.raw_delta_ha && (
                        <span style={{ fontSize: '11px', color: '#38bdf8', marginTop: '2px', display: 'block' }}>
                          Net Change: {currentData.raw_delta_ha > 0 ? '+' : ''}{currentData.raw_delta_ha.toLocaleString()} Ha
                        </span>
                      )}
                    </div>
                    <div className="stat-card">
                      <h4>Annual Change</h4>
                      <p className={currentData?.raw_delta_ha > 0 ? 'trend-up' : 'trend-down'}>
                        {currentData && currentData.raw_delta_ha !== undefined
                          ? `${currentData.raw_delta_ha > 0 ? '↑ +' : '↓ '}${currentData.raw_delta_ha.toLocaleString()} Ha`
                          : '--'}
                      </p>
                    </div>
                    <div className="stat-card">
                      <h4>Status</h4>
                      <p style={{ 
                        color: riskReport
                          ? (riskReport.severity === 'HIGH' 
                              ? '#ef4444' 
                              : (riskReport.severity === 'MEDIUM' ? '#fbbf24' : '#22c55e'))
                          : (currentData
                              ? (currentData.hectares > 1000 
                                  ? '#ef4444' 
                                  : (currentData.hectares > 300 ? '#fbbf24' : '#22c55e'))
                              : '#94a3b8')
                      }}>
                        {riskReport 
                          ? riskReport.severity 
                          : (currentData 
                              ? (currentData.hectares > 1000 
                                  ? 'HIGH' 
                                  : (currentData.hectares > 300 ? 'MEDIUM' : 'LOW'))
                              : 'N/A')}
                      </p>
                    </div>
                  </div>

                  <div className="panel-card" style={{marginTop: '20px'}}>
                    <h2 style={{fontSize: '18px', marginBottom: '10px'}}>Temporal Trends</h2>
                    <div style={{ width: '100%', height: 180 }}>
                      <ResponsiveContainer>
                        <BarChart data={erosionStats} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                          <XAxis dataKey="year" stroke="#94a3b8" fontSize={10}/>
                          <YAxis stroke="#94a3b8" fontSize={10}/>
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                            labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value, name) => [
                              `${value > 0 ? '+' : ''}${value} Ha`, 
                              value > 0 ? 'Erosion Loss' : 'Accretion Gain'
                            ]}
                          />
                          <ReferenceLine y={0} stroke="#475569" />
                          <Bar dataKey="raw_delta_ha">
                            {erosionStats.map((entry, index) => {
                              const isErosion = entry.raw_delta_ha > 0;
                              return (
                                <Cell 
                                  key={`cell-${index}`} 
                                  fill={isErosion ? '#ef4444' : '#38bdf8'} 
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '8px', textAlign: 'center', lineHeight: '1.4' }}>
                      📈 <strong>Legend:</strong> <span style={{ color: '#ef4444' }}>Positive values</span> = land eroded (hectares lost) | <span style={{ color: '#38bdf8' }}>Negative values</span> = land gained (sandbar/char accretion)
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
              ) : (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <h4>NDVI (Vegetation)</h4>
                      <p>{liveMetrics && liveMetrics.NDVI !== null && liveMetrics.NDVI !== undefined ? liveMetrics.NDVI.toFixed(4) : 'N/A'}</p>
                    </div>
                    <div className="stat-card">
                      <h4>NDWI (Water)</h4>
                      <p>{liveMetrics && liveMetrics.NDWI !== null && liveMetrics.NDWI !== undefined ? liveMetrics.NDWI.toFixed(4) : 'N/A'}</p>
                    </div>
                    <div className="stat-card">
                      <h4>Cloud Cover</h4>
                      <p>{liveMetrics && liveMetrics.cloud_cover_percentage !== null && liveMetrics.cloud_cover_percentage !== undefined ? `${liveMetrics.cloud_cover_percentage.toFixed(2)}%` : 'N/A'}</p>
                    </div>
                  </div>

                  <div className="panel-card" style={{marginTop: '20px'}}>
                    <h2 style={{fontSize: '18px', marginBottom: '10px'}}>Live Satellite Telemetry</h2>
                    
                    <div className="metadata-box" style={{fontSize: '13px', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid rgba(56, 189, 248, 0.3)', marginBottom: '20px'}}>
                      <strong>Notice:</strong><br/>
                      Historical temporal overlays are localized to Majuli Island. Displaying live satellite telemetry.
                    </div>

                    <div className="metadata-box" style={{fontSize: '12px', color: '#94a3b8', background: '#1e293b', padding: '15px', borderRadius: '8px'}}>
                      <strong style={{color: 'white'}}>Observation Details:</strong><br/><br/>
                      • Source: Sentinel-2 Multispectral Instrument<br/>
                      • Query Location: {currentLocation}<br/>
                      • Observation Date: {liveMetrics?.date || 'N/A'}<br/>
                      • Coordinates: {liveMetrics?.latitude ? `${liveMetrics.latitude.toFixed(4)}, ${liveMetrics.longitude.toFixed(4)}` : 'N/A'}
                    </div>
                  </div>
                </>
              )}

              {resourcePlan && resourcePlan.applicable === true && (
                <div className="panel-card" style={{ marginTop: '20px', borderLeft: '4px solid #10b981' }}>
                  <h2 style={{ fontSize: '18px', marginBottom: '15px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    🛡️ Mitigation Action Plan
                  </h2>
                  <div className="stats-grid" style={{ marginBottom: '15px' }}>
                    <div className="stat-card">
                      <h4>Geo-Bags Required</h4>
                      <p>{resourcePlan.geo_bags_required ? resourcePlan.geo_bags_required.toLocaleString() : 0}</p>
                    </div>
                    <div className="stat-card">
                      <h4>Bamboo Required</h4>
                      <p>{resourcePlan.bamboo_tons_required ? `${resourcePlan.bamboo_tons_required} Tons` : '0 Tons'}</p>
                    </div>
                    <div className="stat-card" style={{ gridColumn: 'span 3' }}>
                      <h4>Estimated Budget</h4>
                      <p style={{ color: '#10b981', fontSize: '20px', fontWeight: 'bold' }}>
                        ₹{resourcePlan.estimated_budget_lakhs ? resourcePlan.estimated_budget_lakhs.toFixed(2) : '0.00'} Lakhs
                      </p>
                    </div>
                  </div>
                  <div className="metadata-box" style={{ fontSize: '12px', color: '#cbd5e1', background: '#1e293b', padding: '15px', borderRadius: '8px', borderLeft: '2px solid #10b981' }}>
                    <strong style={{ color: 'white' }}>Action Summary:</strong><br/><br/>
                    {resourcePlan.action_summary}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* FLOATING BOTTOM TIMELINE */}
      {currentLocation.toLowerCase().includes('majuli') && !isAgentDrawerOpen && (
        <div className="floating-bottom-bar">
          <h3>Year Selection: {selectedYear}</h3>
          <input type="range" min="2018" max="2025" step="1" value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="year-slider" />
        </div>
      )}

      {/* GLOBAL CONTEXT NOTIFICATION */}
      {!currentLocation.toLowerCase().includes('majuli') && (
        <div className="global-context-banner">
          Global Telemetry Mode: The high-resolution historical erosion zones, flood inundation maps, and temporal trend datasets are exclusively localized to the Majuli Island research scope. You are currently viewing live, real-time Earth Engine satellite telemetry for {currentLocation}.
        </div>
      )}

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          backgroundColor: '#1e293b',
          border: '1px solid #38bdf8',
          borderRadius: '8px',
          padding: '12px 20px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          animation: 'slideIn 0.3s ease-out'
        }}>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
            ✅ {toast.recipient} Notified
          </span>
          <span style={{ color: '#94a3b8', fontSize: '11px', marginTop: '4px' }}>
            Sent at {new Date(toast.timestamp).toLocaleTimeString()}
          </span>
        </div>
      )}
      
    </div>
  );
}

export default App;