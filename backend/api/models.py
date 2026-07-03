from django.db import models

class ErosionData(models.Model):
    # This creates a column for the Year (e.g., 2018, 2019)
    # unique=True ensures we don't accidentally add the same year twice!
    year = models.IntegerField(unique=True)
    
    # This creates a column for the area lost (e.g., 7510.0, 16810.0)
    hectares = models.FloatField()

    # This just makes the data look readable in the admin panel later
    def __str__(self):
        return f"{self.year} - {self.hectares} ha"