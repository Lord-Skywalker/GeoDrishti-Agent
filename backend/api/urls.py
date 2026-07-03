from django.urls import path
from .views import get_erosion_stats, agent_chat # <--- Must match views.py exactly

urlpatterns = [
    path('erosion-stats/', get_erosion_stats, name='erosion-stats'),
    path('agent-chat/', agent_chat, name='agent-chat'),
]