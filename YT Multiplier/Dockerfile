FROM python:3.11-slim

# Install ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY main.py .
COPY caption_ai.py .
COPY database.py .
COPY oauth_helper.py .
COPY video_processor.py .
COPY youtube_upload.py .
COPY yt_client.py .
COPY scheduler.py .

# Expose port
EXPOSE $PORT

# Start command
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
