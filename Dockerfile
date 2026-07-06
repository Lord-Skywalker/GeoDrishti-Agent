# =============================================================================
# Production Dockerfile for GeoDrishti Backend on Google Cloud Run
# =============================================================================

# Multi-stage build to keep the image minimal
FROM python:3.12-slim AS builder

WORKDIR /app

# Install system dependencies needed for compiling python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies into /root/.local
COPY backend/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Final runtime image
FROM python:3.12-slim AS runner

WORKDIR /app

# Copy installed python packages from builder
COPY --from=builder /root/.local /root/.local
ENV PATH=/root/.local/bin:$PATH

# Copy backend and agent source code
COPY agent.py mcp_server.py /app/
COPY backend/ /app/backend/

# Ensure SQLite database file is copied as read-only data
RUN chmod 444 /app/backend/db.sqlite3

# Set environment variables for production
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Run collectstatic for Django staticfiles
RUN python backend/manage.py collectstatic --noinput

EXPOSE 8080

# Start Django backend server with Gunicorn, listening on PORT injected by Cloud Run
CMD gunicorn --bind 0.0.0.0:$PORT --chdir backend bhoomi_api.wsgi:application
