"""
Thin wrapper around the existing yt-dlp-api (ngrok or localhost).
All video fetching goes through these helpers — no direct yt-dlp imports needed.
"""
import os
import httpx
from typing import Optional

YT_DLP_BASE = os.getenv("YT_DLP_API_BASE_URL", "http://localhost:8000")
TIMEOUT = 120  # seconds — downloads can be slow


def _get(path: str, params: dict) -> dict:
    url = f"{YT_DLP_BASE}{path}"
    resp = httpx.get(url, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _shorts_url(channel_url: str) -> str:
    """Ensure the URL points to the /shorts tab so yt-dlp returns Shorts."""
    url = channel_url.rstrip("/")
    if "youtube.com" in url and "/shorts" not in url:
        url = url + "/shorts"
    return url


def get_channel_shorts(channel_url: str, limit: int = 50) -> list[dict]:
    """
    Fetch Shorts from a channel using yt-dlp-api /channel/list.
    Filters to duration <= 60 seconds.
    Returns list of video dicts with: id, title, url, thumbnail, duration,
    upload_date, views, likes, description.
    """
    data = _get("/channel/list", {
        "url": _shorts_url(channel_url),
        "limit": limit,
        "type": "shorts",
    })
    videos = data.get("videos", [])
    # Normalize: yt-dlp-api uses duration_seconds; keep both for compatibility
    for v in videos:
        if "duration" not in v or v["duration"] is None:
            v["duration"] = v.get("duration_seconds")
        if "views" not in v or v["views"] is None:
            v["views"] = v.get("view_count", 0)
    # Extra safety: only keep true Shorts (≤60s).
    # If duration is None (flat playlist, already scoped to /shorts tab), include it.
    return [v for v in videos if v.get("duration") is None or v["duration"] <= 60]


def get_video_metadata(video_url: str) -> dict:
    """Full metadata for a single video."""
    return _get("/metadata", {"url": video_url})


def get_video_stats(video_url: str) -> dict:
    """Lightweight stats: views, likes, comments."""
    return _get("/stats", {"url": video_url})


def download_video_bytes(video_url: str, dest_path: str) -> str:
    """
    Download a video file from the yt-dlp-api /video endpoint.
    Streams response to dest_path. Returns the path.
    """
    url = f"{YT_DLP_BASE}/video"
    with httpx.stream("GET", url, params={"url": video_url}, timeout=300) as resp:
        resp.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in resp.iter_bytes(chunk_size=8192):
                f.write(chunk)
    return dest_path


def channel_info(channel_url: str) -> dict:
    """Get basic channel info (name, thumbnail) via /channel/list."""
    data = _get("/channel/list", {"url": channel_url, "limit": 1})
    return {
        "name": data.get("channel_name") or data.get("uploader") or "",
        "thumbnail": data.get("thumbnail") or "",
        "channel_id": data.get("channel_id") or "",
    }
