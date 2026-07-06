import os
import sys
import django
from fastmcp import FastMCP

# Initialize Django settings
sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "bhoomi_api.settings")
django.setup()

from api.models import ErosionData

mcp = FastMCP("GeoDrishtiMCP")

@mcp.tool()
def get_erosion_stats(year: int = None) -> str:
    """Retrieve erosion statistics (hectares lost per year) from the database.
    If a specific year is provided, returns statistics for that year.
    Otherwise, returns statistics for all available years.
    """
    import json
    if year is not None:
        try:
            item = ErosionData.objects.get(year=int(year))
            return json.dumps([{"year": item.year, "hectares": item.hectares, "water_area_ha": item.water_area_ha, "raw_delta_ha": item.raw_delta_ha}])
        except ErosionData.DoesNotExist:
            return json.dumps([])
        except ValueError:
            return json.dumps({"error": "Invalid year format"})
    else:
        data = ErosionData.objects.all().order_by("year")
        return json.dumps([{"year": item.year, "hectares": item.hectares, "water_area_ha": item.water_area_ha, "raw_delta_ha": item.raw_delta_ha} for item in data])

@mcp.tool()
def get_gis_config() -> str:
    """Retrieve GIS configuration metadata, including geographic bounds for Majuli Island,
    important landmarks, list of available temporal years, and remote sensing indices details.
    """
    import json
    config = {
        "region": "Majuli Island, Assam, India",
        "bounding_box": {
            "latitude_min": 26.80,
            "latitude_max": 27.15,
            "longitude_min": 93.90,
            "longitude_max": 94.60
        },
        "landmarks": [
            {"name": "Kamalabari", "coordinates": [26.931, 94.215]},
            {"name": "Garmur", "coordinates": [26.963, 94.225]},
            {"name": "Auniati Satra", "coordinates": [26.895, 94.165]},
            {"name": "Dakshinpat Satra", "coordinates": [26.865, 94.295]}
        ],
        "available_years": [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
        "remote_sensing_indices": [
            {"name": "NDVI", "description": "Normalized Difference Vegetation Index for vegetation density/loss"},
            {"name": "NDWI", "description": "Normalized Difference Water Index for flood inundation and surface water"},
            {"name": "Erosion", "description": "High-risk bankline erosion boundaries (GeoJSON)"},
            {"name": "DEM Slope", "description": "Slope topography from SRTM 30m"}
        ]
    }
    return json.dumps(config)

@mcp.tool()
def get_gee_satellite_metrics(latitude: float, longitude: float) -> str:
    """Retrieve live satellite metrics (NDWI, NDVI) from Google Earth Engine (GEE)
    for the specified latitude and longitude coordinates.
    """
    import ee
    import json
    from google.oauth2 import service_account
    
    try:
        import base64
        import tempfile
        
        # Check GEE service account credentials from environment variables
        gee_secret_json = os.environ.get("GEE_SERVICE_ACCOUNT_KEY")
        gee_creds_b64 = os.environ.get("GEE_CREDENTIALS_BASE64")
        
        if gee_secret_json:
            # Parse service account JSON directly from Secret Manager environment variable (in-memory)
            try:
                import json
                info = json.loads(gee_secret_json)
                creds = service_account.Credentials.from_service_account_info(
                    info,
                    scopes=["https://www.googleapis.com/auth/earthengine"]
                )
            except Exception as err:
                return json.dumps({"error": f"Failed to load credentials from GEE_SERVICE_ACCOUNT_KEY: {str(err)}"})
        elif gee_creds_b64:
            # Decode and write to a temporary file
            try:
                creds_json = base64.b64decode(gee_creds_b64).decode("utf-8")
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=".json", mode="w", encoding="utf-8")
                temp_file.write(creds_json)
                temp_file.close()
                creds_path = temp_file.name
                
                # Load credentials
                creds = service_account.Credentials.from_service_account_file(
                    creds_path,
                    scopes=["https://www.googleapis.com/auth/earthengine"]
                )
                
                # Clean up the temp file immediately as the credentials are loaded in memory
                try:
                    os.unlink(creds_path)
                except Exception:
                    pass
            except Exception as err:
                return json.dumps({"error": f"Failed to load credentials from GEE_CREDENTIALS_BASE64: {str(err)}"})
        else:
            # Resolve credential path relative to this file's directory
            base_dir = os.path.dirname(os.path.abspath(__file__))
            creds_path = os.path.join(base_dir, "gee-credentials.json")
            if not os.path.exists(creds_path):
                return json.dumps({"error": f"Credentials file not found at {creds_path} and GEE environment variables are not set."})
            
            # Load credentials from file
            creds = service_account.Credentials.from_service_account_file(
                creds_path,
                scopes=["https://www.googleapis.com/auth/earthengine"]
            )
        ee.Initialize(creds)
        
        point = ee.Geometry.Point(longitude, latitude)
        
        # Load Sentinel-2 harmonized dataset
        collection = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
                      .filterBounds(point)
                      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
                      .sort('system:time_start', False))
        
        # Check size
        if collection.size().getInfo() == 0:
            return json.dumps({"error": f"No cloud-free Sentinel-2 imagery found at lat={latitude}, lon={longitude}."})
            
        image = collection.first()
        
        # Calculate indices
        ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
        ndwi = image.normalizedDifference(['B3', 'B8']).rename('NDWI')
        
        combined = image.addBands([ndvi, ndwi])
        
        # Sample the point (scale=30m)
        sampled = combined.select(['NDVI', 'NDWI']).sample(point, 30).first().getInfo()
        
        # Get metadata
        date_str = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd').getInfo()
        cloud_pct = image.get('CLOUDY_PIXEL_PERCENTAGE').getInfo()
        if cloud_pct is not None:
            cloud_pct = round(float(cloud_pct), 2)
        
        # Extract features
        properties = sampled.get('properties', {}) if sampled else {}
        ndvi_val = properties.get('NDVI', None)
        if ndvi_val is not None:
            ndvi_val = round(float(ndvi_val), 4)
            
        ndwi_val = properties.get('NDWI', None)
        if ndwi_val is not None:
            ndwi_val = round(float(ndwi_val), 4)
        
        res = {
            "latitude": latitude,
            "longitude": longitude,
            "date": date_str,
            "cloud_cover_percentage": cloud_pct,
            "NDVI": ndvi_val,
            "NDWI": ndwi_val
        }
        return json.dumps(res)
    except Exception as e:
        return json.dumps({"error": str(e)})

@mcp.tool()
def calculate_mitigation_cost(hectares_lost: float, risk_severity: str) -> dict:
    """Returns mitigation material and budget estimates. Returns applicable=False if hectares_lost <= 0."""
    if hectares_lost <= 0:
        return {"applicable": False, "reason": "No measurable hectare loss for this query."}

    BASE_GEO_BAGS_PER_HECTARE = 400
    BASE_BAMBOO_TONS_PER_HECTARE = 2.5
    GEO_BAG_COST = 45
    BAMBOO_COST_PER_TON = 3000
    LABOR_OVERHEAD = 0.15

    multiplier = {"CRITICAL": 1.5, "HIGH": 1.2}.get(risk_severity.upper(), 1.0)
    geo_bags = int(BASE_GEO_BAGS_PER_HECTARE * hectares_lost * multiplier)
    bamboo_tons = round(BASE_BAMBOO_TONS_PER_HECTARE * hectares_lost * multiplier, 1)
    material_cost = (geo_bags * GEO_BAG_COST) + (bamboo_tons * BAMBOO_COST_PER_TON)
    total_cost = material_cost * (1 + LABOR_OVERHEAD)

    return {
        "applicable": True,
        "geo_bags_required": geo_bags,
        "bamboo_tons_required": bamboo_tons,
        "estimated_budget_inr": round(total_cost),
        "estimated_budget_lakhs": round(total_cost / 100000, 2),
    }

@mcp.tool()
def send_emergency_report(report_text: str, recipient: str) -> dict:
    """Simulates sending an emergency disaster report to an authority.
    Simulated for demo reliability; real implementation would use smtplib/SendGrid.
    See docstring: a production version would authenticate via SMTP or a transactional
    email API (SendGrid/SES) and require recipient email validation, retry logic, and
    delivery confirmation webhooks.
    """
    import datetime
    if not recipient or not report_text:
        return {"success": False, "error": "Missing recipient or report_text."}
    timestamp = datetime.datetime.now().isoformat()
    # Simulated dispatch — logs only, does not perform real network I/O.
    print(f"[SIMULATED DISPATCH] To: {recipient} | At: {timestamp} | Report length: {len(report_text)} chars")
    return {
        "success": True,
        "recipient": recipient,
        "timestamp": timestamp,
        "message": f"Emergency report successfully dispatched to {recipient}."
    }

if __name__ == "__main__":
    mcp.run(transport="stdio")
