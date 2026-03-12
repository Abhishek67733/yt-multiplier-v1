FROM python:3.11-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for caching
COPY multiplier-api/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code from multiplier-api/
COPY multiplier-api/main.py .
COPY multiplier-api/caption_ai.py .
COPY multiplier-api/database.py .
COPY multiplier-api/oauth_helper.py .
COPY multiplier-api/video_processor.py .
COPY multiplier-api/youtube_upload.py .
COPY multiplier-api/yt_client.py .
COPY multiplier-api/scheduler.py .

# Start command
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
