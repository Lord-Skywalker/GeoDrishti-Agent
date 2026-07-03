from django.contrib import admin
from django.urls import path, include

urlpatterns = [
    # 1. The default Admin panel route
    path('admin/', admin.site.urls),
    
    # 2. THIS IS NEW: Tell Django to look into the 'api' app for any URL starting with 'api/'
    path('api/', include('api.urls')),
]