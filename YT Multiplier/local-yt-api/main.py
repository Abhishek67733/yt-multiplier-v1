import os
import tempfile
import re
import subprocess
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import yt_dlp
import cloudinary
import cloudinary.uploader

# Cloudinary config
cloudinary.config(
    cloud_name="dbmhfkfto",
    api_key="735143126157491",
    api_secret="bkzJrAGf-0GgT5xCKA63AubuBdY"
)

app = FastAPI(title="Local yt-dlp API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_ydl_opts():
    return {
        "quiet": True,
        "no_warnings": True,
        "socket_timeout": 60,
        "extractor_args": {"youtube": {"player_client": ["android"]}},
    }


@app.get("/")
def health():
    return {"status": "running", "location": "local"}


@app.get("/info")
def get_info(url: str):
    try:
        ydl_opts = get_ydl_opts()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title"),
                "thumbnail": info.get("thumbnail"),
                "duration": info.get("duration"),
                "uploader": info.get("uploader"),
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/direct-url")
def get_direct_url(url: str):
    try:
        ydl_opts = get_ydl_opts()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            video_url = None
            for f in reversed(info.get("formats", [])):
                if f.get("url"):
                    video_url = f.get("url")
                    break
            return {"title": info.get("title"), "direct_url": video_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/video")
def download_video(url: str):
    try:
        temp_dir = tempfile.mkdtemp()
        ydl_opts = get_ydl_opts()
        ydl_opts["outtmpl"] = os.path.join(temp_dir, "%(id)s.%(ext)s")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "video")
            title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).strip()[:50]
            video_id = info.get("id", "video")
            ext = info.get("ext", "mp4")

        downloaded_file = os.path.join(temp_dir, f"{video_id}.{ext}")

        if not os.path.exists(downloaded_file):
            for f in os.listdir(temp_dir):
                downloaded_file = os.path.join(temp_dir, f)
                break

        if not os.path.exists(downloaded_file):
            raise HTTPException(status_code=500, detail="Download failed")

        return FileResponse(
            downloaded_file,
            media_type="video/mp4",
            filename=f"{title}.mp4"
        )

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/formats")
def get_formats(url: str):
    try:
        ydl_opts = get_ydl_opts()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            formats = []
            for f in info.get("formats", []):
                formats.append({
                    "id": f.get("format_id"),
                    "ext": f.get("ext"),
                    "res": f.get("resolution"),
                    "h": f.get("height"),
                })
            return {"formats": formats}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def sanitize_filename(title):
    return re.sub(r'[^\w\s-]', '', title).strip().replace(' ', '_')[:50]


@app.get("/upload")
def download_and_upload(url: str):
    """Download video locally and upload to Cloudinary - returns permanent URL"""
    try:
        temp_dir = tempfile.mkdtemp()
        output_path = os.path.join(temp_dir, "video.mp4")

        ydl_opts = get_ydl_opts()
        ydl_opts["format"] = "best[ext=mp4]/best"
        ydl_opts["outtmpl"] = output_path

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            title = info.get("title", "video")

        if not os.path.exists(output_path):
            for f in os.listdir(temp_dir):
                output_path = os.path.join(temp_dir, f)
                break

        if not os.path.exists(output_path):
            raise HTTPException(status_code=500, detail="Download failed")

        # Upload to Cloudinary
        result = cloudinary.uploader.upload(
            output_path,
            resource_type="video",
            folder="yt-dlp-videos",
            public_id=sanitize_filename(title)
        )

        public_url = result.get("secure_url")

        # Cleanup
        os.remove(output_path)
        os.rmdir(temp_dir)

        return {
            "title": title,
            "public_url": public_url,
            "duration": info.get("duration"),
            "thumbnail": info.get("thumbnail"),
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ==========================================
# LIVE STREAM ANALYZER ENDPOINTS
# ==========================================

from datetime import datetime
import pytchat
import time
from concurrent.futures import ThreadPoolExecutor
import asyncio
import google.generativeai as genai

executor = ThreadPoolExecutor(max_workers=4)

# Gemini API configuration
GEMINI_API_KEY = "AIzaSyBxcR5bzx9Hw8jWJZr5mVIhEv-OWYFMX5I"
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel('gemini-1.5-flash')


def get_llm_insights(messages: list) -> dict:
    """Use Gemini to generate comprehensive insights from chat messages"""
    if not messages:
        return None

    # Prepare chat messages for analysis
    chat_text = "\n".join([f"{m.get('author', 'User')}: {m.get('message', '')}" for m in messages[:300]])

    prompt = f"""Analyze these {len(messages)} live YouTube chat messages and provide comprehensive insights.
Respond in JSON format only. No markdown, no code blocks, just pure JSON.

CHAT MESSAGES:
{chat_text}

Provide analysis in this exact JSON structure:
{{
    "executive_summary": "2-3 sentence overview of chat sentiment and main discussion",
    "audience_mood": {{
        "primary_emotion": "one word (excited/curious/frustrated/engaged/bored/supportive)",
        "emoji": "single emoji representing mood",
        "confidence": "high/medium/low"
    }},
    "sentiment_breakdown": {{
        "positive_percent": number,
        "neutral_percent": number,
        "negative_percent": number,
        "trending": "improving/stable/declining"
    }},
    "key_themes": [
        {{"theme": "theme name", "mention_count": number, "sentiment": "positive/neutral/negative"}}
    ],
    "product_insights": {{
        "feature_requests": ["list of features users are asking for"],
        "pain_points": ["issues or complaints mentioned"],
        "praise_points": ["what users love"],
        "improvement_suggestions": ["actionable suggestions"]
    }},
    "audience_questions": [
        {{"question": "actual question from chat", "priority": "high/medium/low", "category": "technical/content/general"}}
    ],
    "engagement_metrics": {{
        "level": "high/medium/low",
        "active_participants": number,
        "conversation_velocity": "fast/moderate/slow",
        "spam_percentage": number
    }},
    "actionable_recommendations": [
        {{"action": "what to do", "priority": "high/medium/low", "impact": "description of expected impact"}}
    ],
    "content_creator_tips": [
        "specific tip based on chat analysis"
    ],
    "notable_messages": [
        {{"author": "username", "message": "the message", "reason": "why it's notable"}}
    ]
}}"""

    try:
        response = gemini_model.generate_content(prompt)
        response_text = response.text

        # Clean up response - remove markdown code blocks if present
        response_text = response_text.strip()
        if response_text.startswith("```json"):
            response_text = response_text[7:]
        if response_text.startswith("```"):
            response_text = response_text[3:]
        if response_text.endswith("```"):
            response_text = response_text[:-3]
        response_text = response_text.strip()

        # Parse JSON
        return json.loads(response_text)
    except Exception as e:
        print(f"LLM analysis error: {e}")
        return None

# Simple sentiment analysis using keyword matching
POSITIVE_WORDS = {'amazing', 'awesome', 'great', 'love', 'best', 'good', 'nice', 'wow', 'excellent', 'fantastic', 'beautiful', 'perfect', 'fire', '🔥', '❤️', '👏', '😍', '🙌', 'thanks', 'thank', 'helpful', 'cool', 'incredible'}
NEGATIVE_WORDS = {'bad', 'hate', 'worst', 'boring', 'terrible', 'awful', 'sucks', 'disappointed', 'annoying', 'trash', 'waste', '👎', '😡', '😤', 'stupid', 'dumb', 'wrong'}
QUESTION_PATTERNS = ['?', 'how', 'what', 'why', 'when', 'where', 'who', 'can you', 'could you', 'will you', 'please explain']


def analyze_sentiment(messages):
    """Analyze sentiment of chat messages"""
    positive = 0
    negative = 0
    neutral = 0
    questions = []
    words_count = {}

    for msg in messages:
        text = msg.get('message', '').lower()
        words = text.split()

        # Count sentiment
        is_positive = any(word in text for word in POSITIVE_WORDS)
        is_negative = any(word in text for word in NEGATIVE_WORDS)

        if is_positive and not is_negative:
            positive += 1
        elif is_negative and not is_positive:
            negative += 1
        else:
            neutral += 1

        # Detect questions
        if any(pattern in text for pattern in QUESTION_PATTERNS):
            if len(text) > 10 and len(questions) < 5:
                questions.append(msg.get('message', ''))

        # Count words for topics
        for word in words:
            if len(word) > 3 and word.isalpha():
                words_count[word] = words_count.get(word, 0) + 1

    total = max(positive + negative + neutral, 1)

    # Get top topics (most frequent words)
    topics = sorted(words_count.items(), key=lambda x: x[1], reverse=True)[:5]
    topics = [word for word, count in topics]

    # Determine engagement and mood
    if positive > neutral + negative:
        engagement = "high"
        mood = "🔥 Excited"
    elif negative > positive + neutral:
        engagement = "low"
        mood = "😐 Mixed"
    else:
        engagement = "medium"
        mood = "👍 Positive"

    return {
        "sentiment": {
            "positive": round(positive / total * 100),
            "neutral": round(neutral / total * 100),
            "negative": round(negative / total * 100)
        },
        "topics": topics if topics else ["chat", "live", "stream"],
        "questions": questions if questions else ["No questions detected"],
        "engagement": engagement,
        "summary": f"Analyzed {len(messages)} messages. {positive} positive, {neutral} neutral, {negative} negative.",
        "mood": mood
    }


def extract_video_id(url: str) -> str:
    """Extract video ID from YouTube URL"""
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})',
        r'([a-zA-Z0-9_-]{11})'
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return url


def fetch_live_chat(url: str, max_messages: int = 100, timeout: int = 15):
    """Fetch live chat messages from YouTube using pytchat"""
    messages = []
    video_id = extract_video_id(url)

    try:
        chat = pytchat.create(video_id=video_id)
        start_time = time.time()

        while chat.is_alive():
            elapsed = time.time() - start_time
            if elapsed > timeout:
                break

            try:
                chat_data = chat.get()
                items = chat_data.sync_items()

                for c in items:
                    messages.append({
                        "author": c.author.name,
                        "message": c.message,
                        "time": str(c.datetime),
                        "timestamp": c.timestamp
                    })

                    if len(messages) >= max_messages:
                        break
            except Exception as inner_e:
                print(f"Inner error: {inner_e}")

            if len(messages) >= max_messages:
                break

            time.sleep(1)

    except Exception as e:
        print(f"Error fetching chat: {e}")
        import traceback
        traceback.print_exc()

    return messages


@app.get("/livechat")
def get_live_chat(url: str, max_messages: int = 300):
    """Fetch live chat messages from a YouTube stream using subprocess"""
    try:
        video_id = extract_video_id(url)

        # Use subprocess to run pytchat in a separate process
        script_path = "/Users/abhishektakkhi/Agentic Flows/local-yt-api/fetch_chat.py"
        result = subprocess.run(
            ["python3", script_path, video_id, str(max_messages)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd="/Users/abhishektakkhi/Agentic Flows/local-yt-api"
        )

        messages = []
        if result.stdout.strip():
            try:
                messages = json.loads(result.stdout.strip())
            except Exception as parse_err:
                print(f"Parse error: {parse_err}, stdout: {result.stdout[:200]}")

        if result.stderr:
            print(f"Subprocess stderr: {result.stderr[:200]}")

        if not messages:
            return {
                "status": "no_chat",
                "message": "No live chat available. Stream may not be live yet or chat is disabled.",
                "url": url
            }

        # Basic sentiment analysis
        basic_analysis = analyze_sentiment(messages)

        # LLM-powered deep analysis
        llm_insights = get_llm_insights(messages)

        return {
            "status": "success",
            "message_count": len(messages),
            "messages": messages[-50:],  # Return last 50 for display
            "analysis": basic_analysis,
            "llm_insights": llm_insights,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/insights")
def get_deep_insights(url: str, max_messages: int = 300):
    """Get comprehensive AI-powered insights from live chat"""
    try:
        video_id = extract_video_id(url)

        # Fetch chat messages
        script_path = "/Users/abhishektakkhi/Agentic Flows/local-yt-api/fetch_chat.py"
        result = subprocess.run(
            ["python3", script_path, video_id, str(max_messages)],
            capture_output=True,
            text=True,
            timeout=60,
            cwd="/Users/abhishektakkhi/Agentic Flows/local-yt-api"
        )

        messages = []
        if result.stdout.strip():
            messages = json.loads(result.stdout.strip())

        if not messages:
            raise HTTPException(status_code=404, detail="No chat messages found")

        # Get video info
        video_info = {}
        try:
            ydl_opts = get_ydl_opts()
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)
                video_info = {
                    "title": info.get("title"),
                    "channel": info.get("uploader"),
                    "thumbnail": info.get("thumbnail"),
                    "is_live": info.get("is_live", False)
                }
        except:
            pass

        # Get LLM insights
        llm_insights = get_llm_insights(messages)

        if not llm_insights:
            raise HTTPException(status_code=500, detail="Failed to generate insights")

        return {
            "status": "success",
            "video_info": video_info,
            "message_count": len(messages),
            "insights": llm_insights,
            "sample_messages": messages[-20:],
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/demo")
def live_demo():
    """Demo endpoint with sample live stream data"""
    return {
        "video_id": "demo123",
        "title": "🔴 LIVE: Building an AI-Powered Dashboard",
        "channel": "Tech Creator",
        "is_live": True,
        "view_count": 12456,
        "like_count": 892,
        "comment_count": 234,
        "thumbnail": "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg",
        "chat_messages": [
            {"author": "User1", "message": "This is amazing! 🔥", "time": "2 min ago"},
            {"author": "CodeFan", "message": "Can you explain that?", "time": "1 min ago"},
            {"author": "TechLover", "message": "Great tutorial!", "time": "30 sec ago"},
            {"author": "DevPro", "message": "Finally someone explains this well", "time": "20 sec ago"},
            {"author": "Student123", "message": "Taking notes 📝", "time": "10 sec ago"},
        ],
        "analysis": {
            "sentiment": {"positive": 72, "neutral": 20, "negative": 8},
            "topics": ["AI", "dashboard", "coding", "tutorial", "python"],
            "questions": ["What IDE are you using?", "Can you share the code?", "Will there be a follow-up?"],
            "engagement": "high",
            "summary": "The audience is highly engaged and positive. Most comments express appreciation for the content.",
            "mood": "🔥 Excited"
        },
        "timestamp": datetime.now().isoformat()
    }


@app.get("/analyze")
def analyze_stream(url: str):
    """Analyze a YouTube video/stream - returns stats and demo analysis"""
    try:
        ydl_opts = get_ydl_opts()
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)

            return {
                "video_id": info.get("id", "unknown"),
                "title": info.get("title", "Unknown"),
                "channel": info.get("uploader", "Unknown"),
                "is_live": info.get("is_live", False),
                "view_count": info.get("view_count", 0),
                "like_count": info.get("like_count", 0),
                "comment_count": info.get("comment_count", 0),
                "thumbnail": info.get("thumbnail", ""),
                "chat_messages": [
                    {"author": "Viewer1", "message": "Great content!", "time": "just now"},
                    {"author": "Fan", "message": "Love this! 🔥", "time": "1 min ago"},
                ],
                "analysis": {
                    "sentiment": {"positive": 65, "neutral": 25, "negative": 10},
                    "topics": ["video", "content", "entertainment"],
                    "questions": ["When's the next video?"],
                    "engagement": "medium",
                    "summary": f"Analysis of '{info.get('title', 'video')}' by {info.get('uploader', 'creator')}",
                    "mood": "👍 Positive"
                },
                "timestamp": datetime.now().isoformat()
            }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
