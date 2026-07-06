from django.db import models

class ErosionData(models.Model):
    # This creates a column for the Year (e.g., 2018, 2019)
    # unique=True ensures we don't accidentally add the same year twice!
    year = models.IntegerField(unique=True)
    
    # hectares = erosion-only loss (0 if accretion year). raw_delta_ha preserves the signed YoY water-area change. 
    # Source: Sentinel-2 dry-season (Jan-Mar) NDWI median composite via GEE, see scratch/test_historical_erosion_gee.py for methodology.
    hectares = models.FloatField()
    
    # New fields for Sentinel-2 NDWI historical metrics
    water_area_ha = models.FloatField(default=0.0)
    raw_delta_ha = models.FloatField(default=0.0)

    # This just makes the data look readable in the admin panel later
    def __str__(self):
        return f"{self.year} - {self.hectares} ha (Water: {self.water_area_ha} ha, Delta: {self.raw_delta_ha} ha)"