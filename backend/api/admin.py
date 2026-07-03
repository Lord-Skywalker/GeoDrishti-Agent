from django.contrib import admin
from .models import ErosionData

# This tells Django to put our new table inside the Admin dashboard
admin.site.register(ErosionData)
