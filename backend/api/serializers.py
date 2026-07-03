from rest_framework import serializers
from .models import ErosionData

class ErosionDataSerializer(serializers.ModelSerializer):
    class Meta:
        model = ErosionData
        fields = ['year', 'hectares']