"""
YouTube helpers using yt-dlp directly (no external API dependency).
Falls back to external yt-dlp-api if YT_DLP_API_BASE_URL is set.
"""
import os
import subprocess
import json
import tempfile
import httpx
from typing import Optional

YT_DLP_BASE = os.getenv("YT_DLP_API_BASE_URL", "https://yt-dlp-api-production-d650.up.railway.app")
TIMEOUT = 120


# ── Direct yt-dlp helpers ────────────────────────────────────────────────────

def _run_ytdlp(args: list[str], timeout: int = 120) -> str:
    """Run yt-dlp with given args, return stdout."""
    cmd = ["yt-dlp"] + args
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed: {result.stderr[:500]}")
    return result.stdout


def _shorts_url(channel_url: str) -> str:
    """Ensure the URL points to the /shorts tab so yt-dlp returns Shorts."""
    url = channel_url.rstrip("/")
    if "youtube.com" in url and "/shorts" not in url:
        url = url + "/shorts"
    return url


# ── External API helpers (used only if YT_DLP_API_BASE_URL is set) ───────────

def _get(path: str, params: dict) -> dict:
    url = f"{YT_DLP_BASE}{path}"
    resp = httpx.get(url, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    return resp.json()


def _use_external_api() -> bool:
    """Check if external yt-dlp API is configured and reachable."""
    if not YT_DLP_BASE:
        return False
    try:
        resp = httpx.get(YT_DLP_BASE, timeout=5)
        return resp.status_code == 200
    except Exception:
        return False


# ── Public API ───────────────────────────────────────────────────────────────

def get_channel_shorts(channel_url: str, limit: int = 50) -> list[dict]:
    """
    Fetch Shorts from a channel.
    Uses external API if available, otherwise yt-dlp directly.
    """
    if _use_external_api():
        data = _get("/channel/list", {
            "url": _shorts_url(channel_url),
            "limit": limit,
            "type": "shorts",
        })
        videos = data.get("videos", [])
        for v in videos:
            if "duration" not in v or v["duration"] is None:
                v["duration"] = v.get("duration_seconds")
            if "views" not in v or v["views"] is None:
                v["views"] = v.get("view_count", 0)
        return [v for v in videos if v.get("duration") is None or v["duration"] <= 60]

    # Direct yt-dlp
    shorts_url = _shorts_url(channel_url)
    try:
        output = _run_ytdlp([
            "--flat-playlist",
            "--dump-json",
            "--playlist-end", str(limit),
            shorts_url,
        ], timeout=180)
    except Exception as e:
        print(f"[yt_client] yt-dlp channel list failed: {e}")
        return []

    videos = []
    for line in output.strip().split("\n"):
        if not line.strip():
            continue
        try:
            v = json.loads(line)
            videos.append({
                "id": v.get("id", ""),
                "title": v.get("title", ""),
                "url": v.get("url") or v.get("webpage_url") or f"https://www.youtube.com/shorts/{v.get('id', '')}",
                "thumbnail": v.get("thumbnail") or v.get("thumbnails", [{}])[-1].get("url", "") if v.get("thumbnails") else "",
                "duration": v.get("duration"),
                "upload_date": v.get("upload_date", ""),
                "views": v.get("view_count", 0) or 0,
                "likes": v.get("like_count", 0) or 0,
                "description": v.get("description", ""),
            })
        except json.JSONDecodeError:
            continue

    return [v for v in videos if v.get("duration") is None or v["duration"] <= 60]


def get_video_metadata(video_url: str) -> dict:
    """Full metadata for a single video."""
    if _use_external_api():
        return _get("/metadata", {"url": video_url})

    output = _run_ytdlp(["--dump-json", "--no-download", video_url])
    return json.loads(output)


def get_video_stats(video_url: str) -> dict:
    """Lightweight stats: views, likes, comments."""
    if _use_external_api():
        return _get("/stats", {"url": video_url})

    try:
        output = _run_ytdlp(["--dump-json", "--no-download", video_url], timeout=60)
        data = json.loads(output)
        return {
            "views": data.get("view_count", 0) or 0,
            "likes": data.get("like_count", 0) or 0,
            "comments": data.get("comment_count", 0) or 0,
        }
    except Exception as e:
        print(f"[yt_client] get_video_stats failed: {e}")
        return {"views": 0, "likes": 0, "comments": 0}


def download_video_bytes(video_url: str, dest_path: str, oauth_token: str = None) -> str:
    """
    Download a video file. Tries multiple strategies:
    1. yt-dlp with android_vr client (bypasses bot check)
    2. yt-dlp with OAuth token authentication
    3. yt-dlp with tv_embedded client
    4. External API /direct-url fallback
    Returns the path to the downloaded file.
    """
    strategies = [
        # Strategy 1: web_creator client (best for avoiding bot detection)
        {
            "name": "yt-dlp web_creator",
            "args": [
                "-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player_client=web_creator",
                "--no-check-certificates",
                "-o", dest_path,
                "--no-playlist",
                video_url,
            ],
        },
        # Strategy 2: mediaconnect client (newer, often bypasses bot detection)
        {
            "name": "yt-dlp mediaconnect",
            "args": [
                "-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player_client=mediaconnect",
                "--no-check-certificates",
                "-o", dest_path,
                "--no-playlist",
                video_url,
            ],
        },
        # Strategy 3: android_vr client
        {
            "name": "yt-dlp android_vr",
            "args": [
                "-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player_client=android_vr",
                "--no-check-certificates",
                "-o", dest_path,
                "--no-playlist",
                video_url,
            ],
        },
        # Strategy 3: tv_embedded client
        {
            "name": "yt-dlp tv_embedded",
            "args": [
                "-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player_client=tv_embedded",
                "--no-check-certificates",
                "-o", dest_path,
                "--no-playlist",
                video_url,
            ],
        },
        # Strategy 4: mweb client
        {
            "name": "yt-dlp mweb",
            "args": [
                "-f", "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best",
                "--merge-output-format", "mp4",
                "--extractor-args", "youtube:player_client=mweb",
                "--no-check-certificates",
                "-o", dest_path,
                "--no-playlist",
                video_url,
            ],
        },
        # Strategy 5: default with no restrictions
        {
            "name": "yt-dlp default",
            "args": [
                "-f", "best[ext=mp4]/best",
                "--no-check-certificates",
                "-o", dest_path,
                "--no-playlist",
                video_url,
            ],
        },
    ]

    for strategy in strategies:
        # Clean up any partial file from previous attempt
        if os.path.exists(dest_path):
            try:
                os.unlink(dest_path)
            except Exception:
                pass

        try:
            print(f"[yt_client] Trying {strategy['name']}...")
            _run_ytdlp(strategy["args"], timeout=300)
            if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
                print(f"[yt_client] Success with {strategy['name']}: {os.path.getsize(dest_path)/1024:.0f}KB")
                return dest_path
        except Exception as e:
            print(f"[yt_client] {strategy['name']} failed: {str(e)[:200]}")

    # Fallback: use external API /direct-url to get a CDN link, then download it
    if _use_external_api():
        try:
            print(f"[yt_client] Trying external API /direct-url fallback...")
            data = _get("/direct-url", {"url": video_url})
            direct_url = data.get("direct_url")
            if direct_url:
                if os.path.exists(dest_path):
                    try:
                        os.unlink(dest_path)
                    except Exception:
                        pass
                with httpx.stream("GET", direct_url, timeout=300, follow_redirects=True) as resp:
                    resp.raise_for_status()
                    with open(dest_path, "wb") as f:
                        for chunk in resp.iter_bytes(chunk_size=8192):
                            f.write(chunk)
                if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
                    return dest_path
        except Exception as e:
            print(f"[yt_client] External API fallback also failed: {e}")

    # Last resort: try pytubefix if available
    try:
        from pytubefix import YouTube as PyTube
        print(f"[yt_client] Trying pytubefix...")
        yt = PyTube(video_url, use_oauth=False, allow_oauth_cache=False)
        stream = yt.streams.filter(progressive=True, file_extension="mp4").order_by("resolution").desc().first()
        if not stream:
            stream = yt.streams.filter(file_extension="mp4").first()
        if stream:
            if os.path.exists(dest_path):
                os.unlink(dest_path)
            stream.download(filename=dest_path)
            if os.path.exists(dest_path) and os.path.getsize(dest_path) > 1000:
                return dest_path
    except Exception as e:
        print(f"[yt_client] pytubefix failed: {e}")

    raise RuntimeError(f"All download methods failed for {video_url}")


def channel_info(channel_url: str) -> dict:
    """Get basic channel info (name, thumbnail)."""
    if _use_external_api():
        data = _get("/channel/list", {"url": channel_url, "limit": 1})
        return {
            "name": data.get("channel_name") or data.get("uploader") or "",
            "thumbnail": data.get("thumbnail") or "",
            "channel_id": data.get("channel_id") or "",
        }

    try:
        output = _run_ytdlp([
            "--flat-playlist",
            "--dump-json",
            "--playlist-end", "1",
            channel_url,
        ], timeout=60)
        data = json.loads(output.strip().split("\n")[0])
        return {
            "name": data.get("channel") or data.get("uploader") or "",
            "thumbnail": data.get("channel_url", ""),
            "channel_id": data.get("channel_id") or "",
        }
    except Exception as e:
        print(f"[yt_client] channel_info failed: {e}")
        return {"name": "", "thumbnail": "", "channel_id": ""}
