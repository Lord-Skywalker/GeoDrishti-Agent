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
            return json.dumps([{"year": item.year, "hectares": item.hectares}])
        except ErosionData.DoesNotExist:
            return json.dumps([])
        except ValueError:
            return json.dumps({"error": "Invalid year format"})
    else:
        data = ErosionData.objects.all().order_by("year")
        return json.dumps([{"year": item.year, "hectares": item.hectares} for item in data])

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
        # Resolve credential path relative to this file's directory
        base_dir = os.path.dirname(os.path.abspath(__file__))
        creds_path = os.path.join(base_dir, "gee-credentials.json")
        
        # Load credentials
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
        
        # Extract features
        properties = sampled.get('properties', {}) if sampled else {}
        ndvi_val = properties.get('NDVI', None)
        ndwi_val = properties.get('NDWI', None)
        
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

if __name__ == "__main__":
    mcp.run(transport="stdio")
