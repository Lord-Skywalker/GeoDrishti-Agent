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

if __name__ == "__main__":
    mcp.run(transport="stdio")
