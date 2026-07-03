import os
import sys
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import ErosionData
from .serializers import ErosionDataSerializer

# Add workspace root to sys.path so we can import the agent layer
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from agent import geospatial_workflow

@api_view(['GET'])
def get_erosion_stats(request):  # <--- Check this name carefully!
    data = ErosionData.objects.all().order_by('year')
    serializer = ErosionDataSerializer(data, many=True)
    return Response(serializer.data)

@api_view(['POST'])
def agent_chat(request):
    """POST API endpoint to handle user natural language queries.
    Passes the query to the Google ADK workflow, returning the final state (gis_params, risk_report, error messages).
    """
    query = request.data.get('query', '')
    if not query:
        return Response({'error': 'No query provided'}, status=400)

    try:
        session_service = InMemorySessionService()
        runner = Runner(
            agent=geospatial_workflow,
            session_service=session_service,
            app_name="geodrishti_agent_app",
            auto_create_session=True
        )

        message = types.Content(role="user", parts=[types.Part.from_text(text=query)])

        # Run workflow synchronously
        for event in runner.run(new_message=message, user_id="web_user", session_id="web_session"):
            pass

        session = session_service.get_session_sync(user_id="web_user", app_name="geodrishti_agent_app", session_id="web_session")
        state = session.state

        gis_params = state.get("gis_params")
        if gis_params and not isinstance(gis_params, dict):
            gis_params = gis_params.model_dump()

        risk_report = state.get("risk_report")
        if risk_report and not isinstance(risk_report, dict):
            risk_report = risk_report.model_dump()

        return Response({
            'status': state.get('status'),
            'gis_params': gis_params,
            'mcp_payload': state.get('mcp_payload'),
            'risk_report': risk_report,
            'sanitization_error': state.get('sanitization_error'),
            'validation_error': state.get('validation_error')
        })
    except Exception as e:
        return Response({'error': str(e)}, status=500)