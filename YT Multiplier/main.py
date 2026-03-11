import os
import json
import base64
import tempfile
import traceback
import math
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build as google_build
from google.oauth2.credentials import Credentials

from database import init_db, db
from yt_client import get_channel_shorts, channel_info, get_video_stats, download_video_bytes
from caption_ai import generate_caption_variation, generate_title_variation
from youtube_upload import upload_short, get_video_stats_from_api
from video_processor import process_video, get_processing_info
from scheduler import start_scheduler, stop_scheduler

WEBHOOK_URL = os.getenv(
    "WEBHOOK_URL",
    "https://pwl.app.n8n.cloud/webhook/5c621a46-4d53-4279-9b5f-f1d76d96a440",
)

# ── IST Peak Hours for smart scheduling ──────────────────────────────────────
# Peak YouTube viewing hours in India (IST = UTC+5:30)
PEAK_HOURS_IST = [12, 13, 18, 19, 20, 21]  # 12-2 PM, 6-10 PM IST
IST_OFFSET = timedelta(hours=5, minutes=30)

app = FastAPI(title="YouTube Shorts Multiplier API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── YouTube OAuth Config ──────────────────────────────────────────────────────
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3001")

OAUTH_REDIRECT_URI = os.getenv("OAUTH_REDIRECT_URI", "")

YOUTUBE_SCOPES = [
    "https://www.googleapis.com/auth/youtube.upload",
    "https://www.googleapis.com/auth/youtube.readonly",
]

def _build_oauth_flow(state: str = None) -> Flow:
    """Build a Google OAuth flow for YouTube channel connection."""
    redirect_uri = OAUTH_REDIRECT_URI
    if not redirect_uri:
        redirect_uri = "http://localhost:8001/auth/youtube/callback"
    flow = Flow.from_client_config(
        {
            "web": {
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": [redirect_uri],
            }
        },
        scopes=YOUTUBE_SCOPES,
        state=state,
    )
    flow.redirect_uri = redirect_uri
    return flow

# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()
    start_scheduler()


@app.on_event("shutdown")
def shutdown():
    stop_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}


# ── Request / Response Models ──────────────────────────────────────────────────

class AddSourceChannel(BaseModel):
    url: str  # YouTube channel URL

class AddTargetChannel(BaseModel):
    channel_name: str
    oauth_credentials: dict  # full OAuth token dict

class StartUploadRequest(BaseModel):
    video_id: str
    n_channels: int  # 1–5
    gap_hours: float  # hours between each upload

class BulkMultiplierRequest(BaseModel):
    video_ids: list[str]  # list of short video_ids
    n_channels: int  # per-video channel count
    gap_hours: float  # gap between uploads per video
    duration_hours: float  # total campaign duration

class WebhookTestRequest(BaseModel):
    video_ids: list[str]  # shorts to test-upload
    n_channels: int = 30  # simulate sending to N channels
    process_video: bool = True  # apply ffmpeg fingerprint avoidance
    use_peak_hours: bool = True  # schedule during IST peak hours

class MultiplyViaWebhookRequest(BaseModel):
    video_ids: list[str]
    n_channels: int = 5
    gap_hours: float = 2
    process_video: bool = True
    use_peak_hours: bool = True


# ── Source Channels ────────────────────────────────────────────────────────────

@app.get("/channels/source")
def list_source_channels():
    with db() as conn:
        rows = conn.execute("SELECT * FROM source_channels ORDER BY added_at DESC").fetchall()
    return [dict(r) for r in rows]


@app.post("/channels/source", status_code=201)
def add_source_channel(body: AddSourceChannel):
    # Try to resolve channel info from yt-dlp API — fall back gracefully if unavailable
    try:
        info = channel_info(body.url)
    except Exception:
        info = {"channel_id": "", "name": "", "thumbnail": ""}

    channel_id = info.get("channel_id") or body.url  # fallback to URL as ID
    name = info.get("name") or body.url
    thumbnail = info.get("thumbnail") or ""

    with db() as conn:
        existing = conn.execute(
            "SELECT id FROM source_channels WHERE id=? OR url=?", (channel_id, body.url)
        ).fetchone()
        if existing:
            raise HTTPException(400, "Channel already added")
        conn.execute(
            "INSERT INTO source_channels (id, name, url, thumbnail) VALUES (?,?,?,?)",
            (channel_id, name, body.url, thumbnail),
        )
    return {"id": channel_id, "name": name, "url": body.url}


@app.post("/channels/source/enrich")
def enrich_source_channels():
    """Re-fetch name + thumbnail for all source channels from yt-dlp API."""
    import httpx as _httpx
    YT_DLP_BASE = os.getenv("YT_DLP_API_BASE_URL", "http://localhost:8000")
    with db() as conn:
        rows = conn.execute("SELECT id, url FROM source_channels").fetchall()
    updated = 0
    for row in rows:
        try:
            resp = _httpx.get(f"{YT_DLP_BASE}/channel/list", params={"url": row["url"], "limit": 1}, timeout=30)
            data = resp.json()
            # /channel/list returns {"channel": "Channel Name", ...}
            name = data.get("channel") or data.get("channel_name") or data.get("uploader") or ""
            thumbnail = data.get("thumbnail") or ""
            if name:
                with db() as conn:
                    conn.execute(
                        "UPDATE source_channels SET name=?, thumbnail=? WHERE id=?",
                        (name, thumbnail, row["id"]),
                    )
                updated += 1
        except Exception:
            pass
    return {"updated": updated}


@app.delete("/channels/source/{channel_id}", status_code=204)
def remove_source_channel(channel_id: str):
    with db() as conn:
        conn.execute("DELETE FROM source_channels WHERE id=?", (channel_id,))


# ── YouTube OAuth Connect Flow ─────────────────────────────────────────────────

@app.get("/auth/youtube/connect")
def youtube_oauth_connect():
    """
    Step 1: Redirect user to Google's OAuth consent screen.
    The frontend opens this URL in a new window/popup.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth credentials not configured on the server")

    redirect_uri = OAUTH_REDIRECT_URI or "http://localhost:8001/auth/youtube/callback"
    scopes = " ".join(YOUTUBE_SCOPES)
    import secrets
    state = secrets.token_urlsafe(22)
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth"
        f"?response_type=code"
        f"&client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scopes}"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={state}"
    )
    return {"auth_url": auth_url, "state": state}


@app.get("/auth/youtube/callback")
def youtube_oauth_callback(code: str = Query(...), state: str = Query(None)):
    """
    Step 2: Google redirects here after user authorizes.
    We exchange the code for tokens, fetch channel info, and store it.
    Then redirect to the frontend with a success message.
    """
    try:
        redirect_uri = OAUTH_REDIRECT_URI or "http://localhost:8001/auth/youtube/callback"
        token_resp = httpx.post("https://oauth2.googleapis.com/token", data={
            "code": code,
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        })
        token_data = token_resp.json()
        if "error" in token_data:
            raise Exception(f"{token_data['error']}: {token_data.get('error_description', '')}")

        creds = Credentials(
            token=token_data["access_token"],
            refresh_token=token_data.get("refresh_token"),
            token_uri="https://oauth2.googleapis.com/token",
            client_id=GOOGLE_CLIENT_ID,
            client_secret=GOOGLE_CLIENT_SECRET,
        )

        # Fetch the user's YouTube channel info
        youtube = google_build("youtube", "v3", credentials=creds)
        channels_resp = youtube.channels().list(part="snippet", mine=True).execute()
        items = channels_resp.get("items", [])

        if not items:
            return RedirectResponse(
                f"{FRONTEND_URL}/dashboard?youtube_connect=error&reason=no_channel"
            )

        channel = items[0]
        channel_name = channel["snippet"]["title"]
        channel_id = channel["id"]

        # Build credentials dict to store
        creds_data = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
        }
        creds_json = json.dumps(creds_data)

        # Store in DB — skip if channel already connected
        with db() as conn:
            existing = conn.execute(
                "SELECT id FROM target_channels WHERE channel_id = ?", (channel_id,)
            ).fetchone()
            if existing:
                # Update credentials (token may have changed)
                conn.execute(
                    "UPDATE target_channels SET oauth_credentials = ?, channel_name = ? WHERE id = ?",
                    (creds_json, channel_name, existing["id"]),
                )
            else:
                conn.execute(
                    "INSERT INTO target_channels (channel_name, channel_id, oauth_credentials) VALUES (?, ?, ?)",
                    (channel_name, channel_id, creds_json),
                )

        return RedirectResponse(
            f"{FRONTEND_URL}/dashboard?youtube_connect=success&channel={channel_name}"
        )

    except Exception as e:
        print(f"[oauth] Callback error: {traceback.format_exc()}")
        return RedirectResponse(
            f"{FRONTEND_URL}/dashboard?youtube_connect=error&reason={str(e)[:100]}"
        )


# ── Target Channels ────────────────────────────────────────────────────────────

@app.get("/channels/target")
def list_target_channels():
    with db() as conn:
        rows = conn.execute("SELECT id, channel_name, channel_id, upload_count, added_at FROM target_channels").fetchall()
    return [dict(r) for r in rows]


@app.post("/channels/target", status_code=201)
def add_target_channel(body: AddTargetChannel):
    creds_json = json.dumps(body.oauth_credentials)
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO target_channels (channel_name, oauth_credentials) VALUES (?,?)",
            (body.channel_name, creds_json),
        )
    return {"id": cur.lastrowid, "channel_name": body.channel_name}


@app.delete("/channels/target/{channel_id}", status_code=204)
def remove_target_channel(channel_id: int):
    with db() as conn:
        conn.execute("DELETE FROM target_channels WHERE id=?", (channel_id,))


# ── Shorts Scan ────────────────────────────────────────────────────────────────

VIEWS_THRESHOLD = int(os.getenv("VIEWS_THRESHOLD", "500"))

# Shared scan state
_scan_state: dict = {"running": False, "last_result": None}

@app.post("/shorts/scan")
def scan_shorts(background_tasks: BackgroundTasks):
    """
    Trigger a scan of all source channels.
    Runs in background — returns immediately.
    Poll /shorts/scan/status for progress.
    """
    if _scan_state["running"]:
        return {"status": "already_running"}
    _scan_state["running"] = True
    _scan_state["last_result"] = None
    background_tasks.add_task(_run_scan)
    return {"status": "scan_started"}


@app.get("/shorts/scan/status")
def scan_status():
    return {
        "running": _scan_state["running"],
        "last_result": _scan_state["last_result"],
    }


def _calculate_velocity(views_now: int, views_discovery: int, published: str,
                        scan_history: list, delta: int) -> tuple:
    """
    Calculate velocity score and trend.
    Returns (velocity_score, growth_rate, trend).

    velocity_score = growth_rate * relative_gain
    growth_rate    = views_delta / hours_since_published
    trend          = accelerating | stable | decelerating | flat
    """
    # Hours since published
    hours_alive = 24.0  # default
    if published and len(published) >= 8:
        try:
            pub_str = published[:8]
            pub_date = datetime(int(pub_str[:4]), int(pub_str[4:6]), int(pub_str[6:8]),
                                tzinfo=timezone.utc)
            hours_alive = max((datetime.now(timezone.utc) - pub_date).total_seconds() / 3600, 1)
        except Exception:
            pass

    growth_rate = delta / max(hours_alive, 1)
    relative_gain = delta / max(views_discovery, 1)
    velocity_score = growth_rate * relative_gain * 100  # scale up for readability

    # Trend detection from scan history (list of deltas)
    trend = "flat"
    if len(scan_history) >= 2:
        recent = scan_history[-2:]
        if recent[-1] > recent[-2] * 1.2:
            trend = "accelerating"
        elif recent[-1] > recent[-2] * 0.8:
            trend = "stable"
        else:
            trend = "decelerating"
    elif delta > 0:
        trend = "stable"

    return round(velocity_score, 2), round(growth_rate, 2), trend


def _run_scan():
    try:
        with db() as conn:
            channels = conn.execute("SELECT id, url FROM source_channels").fetchall()

        errors = []
        new_count = 0
        queued_count = 0

        for ch in channels:
            try:
                shorts = get_channel_shorts(ch["url"], limit=50)
            except Exception as e:
                msg = f"Could not fetch {ch['url']}: {e}"
                print(f"[scan] {msg}")
                errors.append(msg)
                continue

            for s in shorts:
                vid_id = s.get("id") or s.get("video_id")
                if not vid_id:
                    continue
                views_now = int(s.get("views") or s.get("view_count") or 0)
                duration = int(s.get("duration") or s.get("duration_seconds") or 0)
                short_url = s.get("url") or f"https://www.youtube.com/shorts/{vid_id}"

                published = s.get("upload_date") or ""  # YYYYMMDD from yt-dlp

                with db() as conn:
                    existing = conn.execute(
                        "SELECT video_id, views_last_check, views_at_discovery, scan_history FROM shorts WHERE video_id=?", (vid_id,)
                    ).fetchone()

                    if not existing:
                        conn.execute(
                            """INSERT INTO shorts
                               (video_id, channel_id, title, url, description, views_at_discovery,
                                views_last_check, views_delta, likes, comments, duration, thumbnail,
                                published_at, last_checked, scan_history)
                               VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,datetime('now'),'[]')""",
                            (
                                vid_id, ch["id"],
                                s.get("title", ""), short_url,
                                s.get("description", ""),
                                views_now, views_now,
                                int(s.get("likes") or 0),
                                int(s.get("comments") or 0),
                                duration,
                                s.get("thumbnail", ""),
                                published,
                            ),
                        )
                        new_count += 1
                    else:
                        delta = views_now - (existing["views_last_check"] or 0)

                        # Update scan history for trend detection
                        try:
                            history = json.loads(existing["scan_history"] or "[]")
                        except Exception:
                            history = []
                        history.append(delta)
                        history = history[-10:]  # keep last 10 scans

                        # Calculate velocity
                        vel_score, growth_rate, trend = _calculate_velocity(
                            views_now, existing["views_at_discovery"] or 1,
                            published, history, delta
                        )

                        new_status = "queued" if delta >= VIEWS_THRESHOLD else "monitoring"
                        conn.execute(
                            """UPDATE shorts SET views_last_check=?, views_delta=?, likes=?,
                               comments=?, last_checked=datetime('now'),
                               velocity_score=?, growth_rate=?, trend=?,
                               scan_history=?,
                               status=CASE WHEN status='done' THEN 'done' ELSE ? END
                               WHERE video_id=?""",
                            (
                                views_now, delta,
                                int(s.get("likes") or 0),
                                int(s.get("comments") or 0),
                                vel_score, growth_rate, trend,
                                json.dumps(history),
                                new_status, vid_id,
                            ),
                        )
                        if new_status == "queued":
                            queued_count += 1

        result = {
            "channels_scanned": len(channels),
            "new_shorts": new_count,
            "queued_shorts": queued_count,
            "errors": errors,
        }
        print(f"[scan] Completed: {result}")
        _scan_state["last_result"] = result

    except Exception as e:
        _scan_state["last_result"] = {"error": str(e)}
        print(f"[scan] Fatal error: {e}")
    finally:
        _scan_state["running"] = False


# ── Shorts Listing ─────────────────────────────────────────────────────────────

@app.get("/shorts/all")
def list_all_shorts(channel_id: Optional[str] = None):
    with db() as conn:
        if channel_id:
            rows = conn.execute(
                "SELECT * FROM shorts WHERE channel_id=? ORDER BY views_delta DESC", (channel_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM shorts ORDER BY views_delta DESC"
            ).fetchall()
    return [dict(r) for r in rows]


@app.get("/shorts/queue")
def list_queued_shorts():
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM shorts WHERE status='queued' ORDER BY views_delta DESC"
        ).fetchall()
    return [dict(r) for r in rows]


# ── Multiplier Room ───────────────────────────────────────────────────────────

MULTIPLIER_THRESHOLD = int(os.getenv("MULTIPLIER_THRESHOLD", "1000"))

@app.get("/shorts/multiplier-room")
def multiplier_room():
    """
    Shorts with views_delta >= MULTIPLIER_THRESHOLD.
    Sorted by velocity_score (smart) then views_delta (fallback).
    Includes pre-generated AI title variations.
    """
    with db() as conn:
        rows = conn.execute(
            """SELECT s.*, sc.name as channel_name
               FROM shorts s
               LEFT JOIN source_channels sc ON sc.id = s.channel_id
               WHERE s.views_delta >= ? AND s.status != 'done'
               ORDER BY s.velocity_score DESC, s.views_delta DESC""",
            (MULTIPLIER_THRESHOLD,),
        ).fetchall()

        result = []
        for r in rows:
            row = dict(r)
            titles = conn.execute(
                "SELECT id, title FROM ai_titles WHERE video_id=? ORDER BY generated_at DESC",
                (row["video_id"],),
            ).fetchall()
            row["ai_titles"] = [{"id": t["id"], "title": t["title"]} for t in titles]
            result.append(row)

    return result


@app.post("/shorts/{video_id}/generate-titles")
def generate_titles_for_short(video_id: str):
    """Generate 5 AI title variations for a short."""
    with db() as conn:
        short = conn.execute("SELECT title, description FROM shorts WHERE video_id=?", (video_id,)).fetchone()
        if not short:
            raise HTTPException(404, "Short not found")

    titles = []
    for _ in range(5):
        t = generate_title_variation(short["title"] or "Short Video")
        titles.append(t)

    with db() as conn:
        conn.execute("DELETE FROM ai_titles WHERE video_id=?", (video_id,))
        for t in titles:
            conn.execute(
                "INSERT INTO ai_titles (video_id, title) VALUES (?,?)",
                (video_id, t),
            )

    return {"video_id": video_id, "titles": titles}


@app.post("/shorts/generate-all-titles")
def generate_all_titles_in_room(background_tasks: BackgroundTasks):
    """Generate AI titles for all shorts in the multiplier room."""
    background_tasks.add_task(_generate_all_titles)
    return {"status": "generation_started"}


def _generate_all_titles():
    with db() as conn:
        shorts = conn.execute(
            "SELECT video_id, title FROM shorts WHERE views_delta >= ? AND status != 'done'",
            (MULTIPLIER_THRESHOLD,),
        ).fetchall()

    for s in shorts:
        with db() as conn:
            existing = conn.execute(
                "SELECT COUNT(*) as cnt FROM ai_titles WHERE video_id=?", (s["video_id"],)
            ).fetchone()
            if existing["cnt"] >= 5:
                continue

        try:
            titles = []
            for _ in range(5):
                t = generate_title_variation(s["title"] or "Short Video")
                titles.append(t)

            with db() as conn:
                conn.execute("DELETE FROM ai_titles WHERE video_id=?", (s["video_id"],))
                for t in titles:
                    conn.execute(
                        "INSERT INTO ai_titles (video_id, title) VALUES (?,?)",
                        (s["video_id"], t),
                    )
            print(f"[ai] Generated 5 titles for {s['video_id']}")
        except Exception as e:
            print(f"[ai] Failed for {s['video_id']}: {e}")


# ── Upload Jobs ────────────────────────────────────────────────────────────────

def _smart_select_channels(conn, n: int, exclude_video_id: str = "") -> list:
    """
    Pick target channels smartly based on:
    1. Least recent upload (last_upload_at ASC NULLS FIRST)
    2. Lowest upload count as tiebreaker
    3. Exclude channels that already have this video queued
    """
    rows = conn.execute(
        """SELECT tc.id, tc.upload_count, tc.last_upload_at
           FROM target_channels tc
           WHERE tc.id NOT IN (
               SELECT target_channel_id FROM upload_jobs
               WHERE video_id = ? AND status IN ('pending', 'uploading', 'done')
           )
           ORDER BY
               CASE WHEN tc.last_upload_at IS NULL THEN 0 ELSE 1 END,
               tc.last_upload_at ASC,
               tc.upload_count ASC
           LIMIT ?""",
        (exclude_video_id, n),
    ).fetchall()
    return rows


@app.post("/upload/start")
def start_upload_campaign(body: StartUploadRequest):
    """
    Create upload_jobs for the given short spread across n_channels target channels,
    with gap_hours between each scheduled upload.
    Smart channel selection avoids spamming any single channel.
    """
    if not (1 <= body.n_channels <= 5):
        raise HTTPException(400, "n_channels must be between 1 and 5")

    with db() as conn:
        short = conn.execute("SELECT * FROM shorts WHERE video_id=?", (body.video_id,)).fetchone()
        if not short:
            raise HTTPException(404, "Short not found")

        targets = _smart_select_channels(conn, body.n_channels, body.video_id)

        if not targets:
            raise HTTPException(400, "No target channels available (all may already have this video)")

        created_jobs = []
        now = datetime.now(timezone.utc)

        for i, target in enumerate(targets):
            scheduled = now + timedelta(hours=body.gap_hours * i)
            try:
                cur = conn.execute(
                    """INSERT INTO upload_jobs (video_id, target_channel_id, scheduled_at)
                       VALUES (?,?,?)""",
                    (body.video_id, target["id"], scheduled.isoformat()),
                )
                created_jobs.append({
                    "job_id": cur.lastrowid,
                    "target_channel_id": target["id"],
                    "scheduled_at": scheduled.isoformat(),
                })
            except Exception:
                pass

    return {"jobs_created": len(created_jobs), "jobs": created_jobs}


@app.post("/upload/bulk-multiplier")
def bulk_multiplier(body: BulkMultiplierRequest, background_tasks: BackgroundTasks):
    """
    Schedule uploads for multiple shorts across channels.
    Spreads them evenly over duration_hours, picking channels smartly.
    """
    if not body.video_ids:
        raise HTTPException(400, "No video_ids provided")
    if not (1 <= body.n_channels <= 5):
        raise HTTPException(400, "n_channels must be between 1 and 5")

    total_jobs = len(body.video_ids) * body.n_channels
    time_per_job = (body.duration_hours * 3600) / max(total_jobs, 1)

    all_created = []
    now = datetime.now(timezone.utc)
    job_index = 0

    with db() as conn:
        targets_all = conn.execute(
            "SELECT id, channel_name, upload_count, last_upload_at FROM target_channels"
        ).fetchall()
        if not targets_all:
            raise HTTPException(400, "No target channels configured")

        for vid_id in body.video_ids:
            short = conn.execute("SELECT video_id FROM shorts WHERE video_id=?", (vid_id,)).fetchone()
            if not short:
                continue

            channels = _smart_select_channels(conn, body.n_channels, vid_id)

            for ch in channels:
                scheduled = now + timedelta(seconds=time_per_job * job_index)
                try:
                    cur = conn.execute(
                        """INSERT INTO upload_jobs (video_id, target_channel_id, scheduled_at)
                           VALUES (?,?,?)""",
                        (vid_id, ch["id"], scheduled.isoformat()),
                    )
                    all_created.append({
                        "job_id": cur.lastrowid,
                        "video_id": vid_id,
                        "target_channel_id": ch["id"],
                        "scheduled_at": scheduled.isoformat(),
                    })
                    job_index += 1
                except Exception:
                    pass

    return {
        "jobs_created": len(all_created),
        "total_duration_hours": body.duration_hours,
        "jobs": all_created,
    }


@app.get("/upload/jobs")
def list_upload_jobs():
    with db() as conn:
        rows = conn.execute(
            """SELECT uj.*, s.title as short_title, tc.channel_name,
                      s.thumbnail as short_thumbnail
               FROM upload_jobs uj
               JOIN shorts s ON s.video_id = uj.video_id
               JOIN target_channels tc ON tc.id = uj.target_channel_id
               ORDER BY uj.scheduled_at ASC"""
        ).fetchall()
    return [dict(r) for r in rows]


@app.post("/upload/execute/{job_id}")
def execute_upload(job_id: int, background_tasks: BackgroundTasks):
    """Trigger the actual download → caption → upload pipeline for a job."""
    with db() as conn:
        job = conn.execute("SELECT * FROM upload_jobs WHERE id=?", (job_id,)).fetchone()
        if not job:
            raise HTTPException(404, "Job not found")
        if job["status"] not in ("pending", "failed"):
            raise HTTPException(400, f"Job status is '{job['status']}', cannot execute")
        conn.execute("UPDATE upload_jobs SET status='uploading' WHERE id=?", (job_id,))

    background_tasks.add_task(_run_upload, job_id)
    return {"status": "upload_started", "job_id": job_id}


def _run_upload(job_id: int):
    with db() as conn:
        job = conn.execute(
            """SELECT uj.*, s.title, s.description, s.url as video_url,
                      tc.oauth_credentials, tc.id as tc_id
               FROM upload_jobs uj
               JOIN shorts s ON s.video_id = uj.video_id
               JOIN target_channels tc ON tc.id = uj.target_channel_id
               WHERE uj.id=?""",
            (job_id,),
        ).fetchone()

    if not job:
        return

    try:
        # 1. Download video
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name
        download_video_bytes(job["video_url"], tmp_path)

        # 2. Generate AI caption + title
        caption = generate_caption_variation(job["title"] or "", job["description"] or "")
        new_title = generate_title_variation(job["title"] or "Short Video")

        # 3. Upload to YouTube
        result = upload_short(
            video_path=tmp_path,
            title=new_title,
            description=caption,
            oauth_credentials_json=job["oauth_credentials"],
        )

        yt_video_id = result["youtube_video_id"]

        # 4. Persist results
        with db() as conn:
            conn.execute(
                """UPDATE upload_jobs
                   SET status='done', youtube_video_id=?, caption_variation=?,
                       uploaded_at=datetime('now')
                   WHERE id=?""",
                (yt_video_id, caption, job_id),
            )
            conn.execute(
                "UPDATE target_channels SET upload_count=upload_count+1, last_upload_at=datetime('now') WHERE id=?",
                (job["tc_id"],),
            )
            conn.execute(
                "UPDATE shorts SET status='done' WHERE video_id=?",
                (job["video_id"],),
            )
            # Update creds if token refreshed
            conn.execute(
                "UPDATE target_channels SET oauth_credentials=? WHERE id=?",
                (json.dumps(result["updated_credentials"]), job["tc_id"]),
            )

        print(f"[upload] Job {job_id} done — yt:{yt_video_id}")

    except Exception as e:
        print(f"[upload] Job {job_id} failed: {e}")
        with db() as conn:
            conn.execute(
                "UPDATE upload_jobs SET status='failed', error_message=? WHERE id=?",
                (str(e), job_id),
            )
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ── Webhook Test Upload ───────────────────────────────────────────────────────

_webhook_state: dict = {"running": False, "last_result": None}


@app.post("/upload/webhook-test")
def webhook_test_upload(body: WebhookTestRequest, background_tasks: BackgroundTasks):
    """
    Test upload pipeline: downloads video, generates AI titles/caption,
    then sends FULL payload (including video file as base64) to the n8n webhook
    for each of the N simulated channels. No YouTube API needed.
    """
    if _webhook_state["running"]:
        return {"status": "already_running"}
    if not body.video_ids:
        raise HTTPException(400, "No video_ids provided")

    _webhook_state["running"] = True
    _webhook_state["last_result"] = None
    background_tasks.add_task(
        _run_webhook_test, body.video_ids, body.n_channels,
        body.process_video, body.use_peak_hours
    )
    return {
        "status": "webhook_test_started",
        "videos": len(body.video_ids),
        "channels_per_video": body.n_channels,
        "total_webhooks": len(body.video_ids) * body.n_channels,
        "webhook_url": WEBHOOK_URL,
        "ffmpeg_processing": body.process_video,
    }


@app.get("/upload/webhook-test/status")
def webhook_test_status():
    return {
        "running": _webhook_state["running"],
        "last_result": _webhook_state["last_result"],
    }


def _next_peak_slot(base_time: datetime, slot_index: int, gap_hours: float,
                     use_peak: bool) -> datetime:
    """
    Calculate the next upload time. If use_peak=True, snaps to IST peak hours.
    Peak hours: 12-2 PM IST, 6-10 PM IST.
    """
    candidate = base_time + timedelta(hours=gap_hours * slot_index)
    if not use_peak:
        return candidate

    ist_time = candidate + IST_OFFSET
    hour = ist_time.hour

    if hour in PEAK_HOURS_IST:
        return candidate  # already in peak

    # Find next peak hour
    for offset_h in range(1, 25):
        test = ist_time + timedelta(hours=offset_h)
        if test.hour in PEAK_HOURS_IST:
            return candidate + timedelta(hours=offset_h)

    return candidate


def _run_webhook_test(video_ids: list[str], n_channels: int,
                      do_process: bool = True, use_peak: bool = True,
                      video_available_channels: dict = None):
    results = []
    errors = []
    cleanup_files = []

    # Load actual target channel names (use them if available)
    target_channel_names = []
    with db() as conn:
        rows = conn.execute(
            "SELECT channel_name FROM target_channels ORDER BY id ASC"
        ).fetchall()
        target_channel_names = [r["channel_name"] for r in rows]

    for vid_id in video_ids:
        # 1. Get short info from DB
        with db() as conn:
            short = conn.execute(
                "SELECT * FROM shorts WHERE video_id=?", (vid_id,)
            ).fetchone()
            if not short:
                errors.append(f"{vid_id}: not found in DB")
                continue
            short = dict(short)

            # Get AI titles
            ai_titles = conn.execute(
                "SELECT title FROM ai_titles WHERE video_id=?", (vid_id,)
            ).fetchall()
            ai_title_list = [t["title"] for t in ai_titles]

        # 2. Generate AI titles if none exist
        if not ai_title_list:
            try:
                for _ in range(5):
                    t = generate_title_variation(short["title"] or "Short Video")
                    ai_title_list.append(t)
                with db() as conn:
                    for t in ai_title_list:
                        conn.execute(
                            "INSERT INTO ai_titles (video_id, title) VALUES (?,?)",
                            (vid_id, t),
                        )
                print(f"[webhook] Generated 5 AI titles for {vid_id}")
            except Exception as e:
                print(f"[webhook] AI title generation failed for {vid_id}: {e}")
                ai_title_list = [short["title"]]

        # 3. Generate AI caption
        try:
            caption = generate_caption_variation(
                short["title"] or "", short["description"] or ""
            )
        except Exception:
            caption = short["description"] or short["title"] or ""

        # 4. Download video binary
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                tmp_path = tmp.name
            cleanup_files.append(tmp_path)
            video_url = short["url"] or f"https://www.youtube.com/shorts/{vid_id}"
            print(f"[webhook] Downloading {vid_id} from {video_url}...")
            download_video_bytes(video_url, tmp_path)
            print(f"[webhook] Downloaded {vid_id}: {os.path.getsize(tmp_path) / 1024:.0f} KB")
        except Exception as e:
            errors.append(f"{vid_id}: download failed - {e}")
            print(f"[webhook] Download failed for {vid_id}: {e}")
            continue

        # 5. Send to webhook for each channel — randomized order, titles & timing
        now = datetime.now(timezone.utc)

        # Use only available channels (skip already-uploaded ones)
        if video_available_channels and vid_id in video_available_channels:
            channel_numbers = list(video_available_channels[vid_id])
        else:
            channel_numbers = list(range(1, n_channels + 1))
        random.shuffle(channel_numbers)

        # Randomize title assignment — shuffle a copy of the title list
        shuffled_titles = list(ai_title_list)
        random.shuffle(shuffled_titles)

        for slot_idx, ch_num in enumerate(channel_numbers):
            # Use real target channel name if available, else fallback
            if ch_num <= len(target_channel_names):
                channel_name = target_channel_names[ch_num - 1]
            else:
                channel_name = f"Channel {ch_num}"

            # Pick title from shuffled list (each channel gets a different one)
            picked_title = shuffled_titles[slot_idx % len(shuffled_titles)]

            # Add random jitter ±30min to scheduled time for organic feel
            jitter_minutes = random.randint(-30, 30)
            scheduled_at = _next_peak_slot(now, slot_idx, 2, use_peak) + timedelta(minutes=jitter_minutes)

            # Process video with ffmpeg for uniqueness per channel
            send_path = tmp_path
            if do_process:
                try:
                    processed_path = process_video(tmp_path, channel_num=ch_num)
                    if processed_path != tmp_path:
                        cleanup_files.append(processed_path)
                        send_path = processed_path
                except Exception as e:
                    print(f"[webhook] Video processing skipped for ch{ch_num}: {e}")

            video_size = os.path.getsize(send_path)

            # Send as multipart form with actual MP4 file + JSON metadata file
            # n8n receives: "video_file" (binary MP4) + "metadata" (JSON file)
            channel_label = f"YT{ch_num}"
            try:
                metadata = {
                    "event": "multiply_upload",
                    "channel_number": ch_num,
                    "channel_label": channel_label,
                    "channel_name": channel_name,
                    "total_channels": n_channels,
                    "video_id": vid_id,
                    "original_title": short["title"] or "",
                    "new_title": picked_title,
                    "all_ai_titles": ai_title_list,
                    "caption": caption,
                    "description": short["description"] or "",
                    "original_url": short["url"] or "",
                    "thumbnail": short["thumbnail"] or "",
                    "views": short["views_last_check"] or 0,
                    "views_delta": short["views_delta"] or 0,
                    "likes": short["likes"] or 0,
                    "duration": short["duration"] or 0,
                    "published_at": short.get("published_at") or "",
                    "velocity_score": short.get("velocity_score") or 0,
                    "trend": short.get("trend") or "flat",
                    "scheduled_at": scheduled_at.isoformat(),
                    "video_processed": do_process,
                    "file_size_bytes": video_size,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                metadata_bytes = json.dumps(metadata, indent=2).encode("utf-8")

                with open(send_path, "rb") as vf:
                    files = [
                        ("video_file", (f"{vid_id}_{channel_label}.mp4", vf, "video/mp4")),
                        ("metadata", ("metadata.json", metadata_bytes, "application/json")),
                    ]

                    resp = httpx.post(
                        WEBHOOK_URL,
                        files=files,
                        timeout=60,
                    )
                resp.raise_for_status()
                results.append({
                    "video_id": vid_id,
                    "channel_label": channel_label,
                    "channel": channel_name,
                    "title_used": picked_title,
                    "webhook_status": resp.status_code,
                    "file_size_kb": round(video_size / 1024),
                    "processed": do_process,
                    "scheduled_at": scheduled_at.isoformat(),
                })
                # Log to DB
                with db() as conn:
                    conn.execute(
                        """INSERT INTO webhook_logs
                           (video_id, original_title, new_title, caption, channel_number,
                            channel_name, total_channels, file_size_bytes, video_processed,
                            scheduled_at, webhook_status, webhook_url, velocity_score,
                            trend, thumbnail, status)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                        (
                            vid_id, short["title"], picked_title, caption, ch_num,
                            channel_name, n_channels, video_size, 1 if do_process else 0,
                            scheduled_at.isoformat(), resp.status_code, WEBHOOK_URL,
                            short.get("velocity_score") or 0, short.get("trend") or "flat",
                            short.get("thumbnail") or "", "sent",
                        ),
                    )
                _multiply_state["progress"]["completed"] = _multiply_state["progress"].get("completed", 0) + 1
                print(f"[webhook] Sent {vid_id} -> {channel_label} ({channel_name}) (HTTP {resp.status_code}, {video_size/1024:.0f}KB)")
            except Exception as e:
                err = f"{vid_id} -> {channel_label} ({channel_name}): webhook failed - {e}"
                errors.append(err)
                _multiply_state["progress"]["completed"] = _multiply_state["progress"].get("completed", 0) + 1
                _multiply_state["progress"]["errors"] = _multiply_state["progress"].get("errors", 0) + 1
                # Log failure to DB
                try:
                    with db() as conn:
                        conn.execute(
                            """INSERT INTO webhook_logs
                               (video_id, original_title, new_title, caption, channel_number,
                                channel_name, total_channels, file_size_bytes, video_processed,
                                scheduled_at, webhook_url, velocity_score, trend, thumbnail,
                                error_message, status)
                               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                            (
                                vid_id, short["title"], picked_title, caption, ch_num,
                                channel_name, n_channels, video_size, 1 if do_process else 0,
                                scheduled_at.isoformat(), WEBHOOK_URL,
                                short.get("velocity_score") or 0, short.get("trend") or "flat",
                                short.get("thumbnail") or "", str(e), "failed",
                            ),
                        )
                except Exception:
                    pass
                print(f"[webhook] {err}")

    # Cleanup all temp files
    for f in cleanup_files:
        try:
            os.unlink(f)
        except Exception:
            pass

    final_result = {
        "total_sent": len(results),
        "total_errors": len(errors),
        "results": results,
        "errors": errors,
    }
    _webhook_state["last_result"] = final_result
    _webhook_state["running"] = False
    _multiply_state["last_result"] = final_result
    _multiply_state["running"] = False
    print(f"[webhook] Done: {len(results)} sent, {len(errors)} errors")


# ── Multiply via n8n Webhook (production flow) ──────────────────────────────

_multiply_state: dict = {"running": False, "last_result": None, "progress": {}}

@app.post("/upload/multiply-via-webhook")
def multiply_via_webhook(body: MultiplyViaWebhookRequest, background_tasks: BackgroundTasks):
    """
    Production multiply flow: downloads video, processes with ffmpeg,
    generates unique AI title per channel, sends MP4 + metadata to n8n webhook.
    n8n handles the actual YouTube upload.
    Prevents duplicate uploads: same video won't be sent to the same channel twice.
    """
    if _multiply_state["running"]:
        return {"status": "already_running"}
    if not body.video_ids:
        raise HTTPException(400, "No video_ids provided")

    # Check how many target channels are available
    with db() as conn:
        target_count = conn.execute("SELECT COUNT(*) FROM target_channels").fetchone()[0]
        # Also check the highest channel number ever used in webhook_logs
        max_used = conn.execute(
            "SELECT COALESCE(MAX(channel_number), 0) FROM webhook_logs"
        ).fetchone()[0]

    # The true channel pool = max of: DB target channels, slider value, highest ever used
    # This ensures channels 4, 5 etc. are always in the pool even if target_channels is empty
    max_channels = max(target_count, body.n_channels, max_used)

    # Smart channel rotation: ALL channels are always available for every video.
    # Channels are sorted by recency — never-used channels first, then least-recently-used.
    # This ensures each batch rotates through fresh channels before reusing old ones.
    #
    # Example with 5 channels, selecting 3 per batch:
    #   Batch 1 (Video A): YT1, YT2, YT3 picked (all never-used, equal priority)
    #   Batch 2 (Video B): YT4, YT5 picked first (never-used), then YT1 (oldest upload)
    #   Batch 3 (Video C): YT2, YT3 picked first (least recent), then YT4 next
    valid_video_ids = []
    video_available_channels = {}

    with db() as conn:
        # For each channel, get the most recent upload timestamp (across ALL videos)
        # Channels with no uploads get NULL → sorted first (never used = top priority)
        last_upload_per_channel = conn.execute(
            """SELECT channel_number, MAX(created_at) as last_upload
               FROM webhook_logs WHERE status='sent'
               GROUP BY channel_number"""
        ).fetchall()
        last_upload_map = {r[0]: r[1] for r in last_upload_per_channel}

    all_channel_nums = list(range(1, max_channels + 1))

    for vid_id in body.video_ids:
        # Sort all channels: never-used first (no entry in map), then oldest upload first
        sorted_channels = sorted(
            all_channel_nums,
            key=lambda ch: last_upload_map.get(ch) or "0000-00-00"  # never-used → sorts first
        )
        # Pick the top n_channels (least recently used)
        available = sorted_channels[:body.n_channels]
        valid_video_ids.append(vid_id)
        video_available_channels[vid_id] = available

    _multiply_state["running"] = True
    _multiply_state["last_result"] = None

    total_new_uploads = sum(len(video_available_channels[v]) for v in valid_video_ids)
    _multiply_state["progress"] = {
        "total_videos": len(valid_video_ids),
        "total_channels": body.n_channels,
        "total_jobs": total_new_uploads,
        "completed": 0,
        "errors": 0,
        "skipped_videos": [],
    }
    background_tasks.add_task(
        _run_webhook_test, valid_video_ids, body.n_channels,
        body.process_video, body.use_peak_hours,
        video_available_channels,
    )
    return {
        "status": "multiply_started",
        "videos": len(valid_video_ids),
        "channels_per_video": body.n_channels,
        "total_webhooks": total_new_uploads,
        "webhook_url": WEBHOOK_URL,
        "ffmpeg_processing": body.process_video,
        "peak_hour_scheduling": body.use_peak_hours,
        "skipped": [],
    }


@app.get("/upload/multiply-via-webhook/status")
def multiply_status():
    return {
        "running": _multiply_state["running"],
        "progress": _multiply_state["progress"],
        "last_result": _multiply_state.get("last_result") or _webhook_state.get("last_result"),
    }


# ── Multiplied Videos View ────────────────────────────────────────────────────

class N8nCallbackRequest(BaseModel):
    webhook_log_id: Optional[int] = None   # webhook_logs.id to update
    video_id: Optional[str] = None         # original source video_id
    channel_number: Optional[int] = None   # which channel this was uploaded to
    uploaded_video_id: str                 # the YouTube video ID of the uploaded copy


@app.post("/upload/n8n-callback")
def n8n_upload_callback(body: N8nCallbackRequest):
    """
    n8n calls this endpoint after successfully uploading a video to YouTube.
    Stores the uploaded YouTube video ID so we can fetch real stats later.
    """
    with db() as conn:
        if body.webhook_log_id:
            conn.execute(
                "UPDATE webhook_logs SET uploaded_video_id=? WHERE id=?",
                (body.uploaded_video_id, body.webhook_log_id),
            )
        elif body.video_id and body.channel_number is not None:
            conn.execute(
                """UPDATE webhook_logs SET uploaded_video_id=?
                   WHERE video_id=? AND channel_number=? AND status='sent'
                   ORDER BY created_at DESC LIMIT 1""",
                (body.uploaded_video_id, body.video_id, body.channel_number),
            )
    print(f"[n8n-callback] Stored uploaded_video_id={body.uploaded_video_id}")
    return {"status": "ok"}


def _refresh_uploaded_video_stats():
    """
    Fetches real views/likes for all uploaded copies that have an uploaded_video_id.
    Called every 3 hours by the scheduler.
    """
    with db() as conn:
        rows = conn.execute(
            """SELECT id, uploaded_video_id FROM webhook_logs
               WHERE uploaded_video_id IS NOT NULL AND uploaded_video_id != ''
               AND status = 'sent'"""
        ).fetchall()

    print(f"[stats-refresh] Refreshing stats for {len(rows)} uploaded videos...")
    updated = 0
    for row in rows:
        try:
            stats = get_video_stats(f"https://www.youtube.com/watch?v={row['uploaded_video_id']}")
            views = stats.get("views", 0) or 0
            likes = stats.get("likes", 0) or 0
            with db() as conn:
                conn.execute(
                    """UPDATE webhook_logs
                       SET uploaded_views=?, uploaded_likes=?, stats_updated_at=?
                       WHERE id=?""",
                    (views, likes, datetime.now(timezone.utc).isoformat(), row["id"]),
                )
            updated += 1
        except Exception as e:
            print(f"[stats-refresh] Failed for {row['uploaded_video_id']}: {e}")

    print(f"[stats-refresh] Done — updated {updated}/{len(rows)} videos")


@app.post("/upload/refresh-stats")
def manual_refresh_stats(background_tasks: BackgroundTasks):
    """Manually trigger a stats refresh for all uploaded videos."""
    background_tasks.add_task(_refresh_uploaded_video_stats)
    return {"status": "refresh_started"}


@app.get("/upload/multiplied-videos")
def get_multiplied_videos():
    """
    Returns all multiplied videos grouped by video_id with real uploaded stats.
    """
    with db() as conn:
        rows = conn.execute(
            """SELECT wl.id, wl.video_id, wl.original_title, wl.channel_number, wl.channel_name,
                      wl.new_title, wl.status, wl.scheduled_at, wl.created_at,
                      wl.uploaded_video_id, wl.uploaded_views, wl.uploaded_likes,
                      wl.stats_updated_at,
                      s.thumbnail, s.url as original_url, s.views_last_check, s.likes,
                      s.velocity_score, s.trend
               FROM webhook_logs wl
               LEFT JOIN shorts s ON s.video_id = wl.video_id
               WHERE wl.status = 'sent'
               ORDER BY wl.created_at DESC"""
        ).fetchall()

    grouped = {}
    for r in rows:
        vid = r["video_id"]
        if vid not in grouped:
            grouped[vid] = {
                "video_id": vid,
                "title": r["original_title"],
                "thumbnail": r["thumbnail"] or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "original_url": r["original_url"] or f"https://www.youtube.com/shorts/{vid}",
                "original_views": r["views_last_check"] or 0,
                "original_likes": r["likes"] or 0,
                "velocity_score": r["velocity_score"] or 0,
                "trend": r["trend"] or "flat",
                "channels": [],
                "total_uploaded_views": 0,
                "total_uploaded_likes": 0,
                "stats_updated_at": None,
            }
        uploaded_views = r["uploaded_views"] or 0
        uploaded_likes = r["uploaded_likes"] or 0
        grouped[vid]["total_uploaded_views"] += uploaded_views
        grouped[vid]["total_uploaded_likes"] += uploaded_likes
        if r["stats_updated_at"] and (
            not grouped[vid]["stats_updated_at"]
            or r["stats_updated_at"] > grouped[vid]["stats_updated_at"]
        ):
            grouped[vid]["stats_updated_at"] = r["stats_updated_at"]

        grouped[vid]["channels"].append({
            "channel_number": r["channel_number"],
            "channel_name": r["channel_name"],
            "new_title": r["new_title"],
            "scheduled_at": r["scheduled_at"],
            "sent_at": r["created_at"],
            "uploaded_video_id": r["uploaded_video_id"],
            "uploaded_views": uploaded_views,
            "uploaded_likes": uploaded_likes,
            "stats_updated_at": r["stats_updated_at"],
        })

    result = list(grouped.values())
    for v in result:
        v["multiplier"] = len(v["channels"])
    return result


# ── Webhook Upload Logs ───────────────────────────────────────────────────────

@app.get("/upload/webhook-logs")
def list_webhook_logs(limit: int = 200):
    """Return the most recent webhook upload logs."""
    with db() as conn:
        rows = conn.execute(
            """SELECT wl.*, s.thumbnail as short_thumbnail
               FROM webhook_logs wl
               LEFT JOIN shorts s ON s.video_id = wl.video_id
               ORDER BY wl.created_at DESC
               LIMIT ?""",
            (limit,),
        ).fetchall()
    return [dict(r) for r in rows]


@app.get("/upload/webhook-logs/summary")
def webhook_logs_summary():
    """Aggregated summary of all webhook uploads."""
    with db() as conn:
        total = conn.execute("SELECT COUNT(*) as cnt FROM webhook_logs").fetchone()["cnt"]
        sent = conn.execute("SELECT COUNT(*) as cnt FROM webhook_logs WHERE status='sent'").fetchone()["cnt"]
        failed = conn.execute("SELECT COUNT(*) as cnt FROM webhook_logs WHERE status='failed'").fetchone()["cnt"]
        unique_videos = conn.execute("SELECT COUNT(DISTINCT video_id) as cnt FROM webhook_logs WHERE status='sent'").fetchone()["cnt"]
        unique_channels = conn.execute("SELECT COUNT(DISTINCT channel_name) as cnt FROM webhook_logs WHERE status='sent'").fetchone()["cnt"]
        total_size = conn.execute("SELECT COALESCE(SUM(file_size_bytes), 0) as total FROM webhook_logs WHERE status='sent'").fetchone()["total"]
    return {
        "total_uploads": total,
        "sent": sent,
        "failed": failed,
        "unique_videos": unique_videos,
        "unique_channels": unique_channels,
        "total_data_sent_mb": round(total_size / (1024 * 1024), 1),
    }


# ── Reach Stats ────────────────────────────────────────────────────────────────

@app.get("/reach/stats")
def get_reach_stats():
    """
    Returns per-short reach multiplication:
    original views vs total views across all uploads.
    """
    with db() as conn:
        jobs_done = conn.execute(
            """SELECT uj.id, uj.video_id, uj.youtube_video_id, uj.target_channel_id,
                      uj.uploaded_at, tc.channel_name,
                      s.title, s.views_last_check as original_views, s.thumbnail
               FROM upload_jobs uj
               JOIN shorts s ON s.video_id = uj.video_id
               JOIN target_channels tc ON tc.id = uj.target_channel_id
               WHERE uj.status='done' AND uj.youtube_video_id IS NOT NULL"""
        ).fetchall()

    result = {}
    for row in jobs_done:
        vid = row["video_id"]
        if vid not in result:
            result[vid] = {
                "video_id": vid,
                "title": row["title"],
                "thumbnail": row["thumbnail"],
                "original_views": row["original_views"],
                "uploaded_views": 0,
                "multiplier": 0.0,
                "uploads": [],
            }

        # Get latest reach_stats entry for this job
        with db() as conn:
            stat = conn.execute(
                "SELECT * FROM reach_stats WHERE upload_job_id=? ORDER BY fetched_at DESC LIMIT 1",
                (row["id"],),
            ).fetchone()

        upload_views = stat["views"] if stat else 0
        result[vid]["uploaded_views"] += upload_views
        result[vid]["uploads"].append({
            "job_id": row["id"],
            "channel_name": row["channel_name"],
            "youtube_video_id": row["youtube_video_id"],
            "uploaded_at": row["uploaded_at"],
            "views": upload_views,
        })

    for vid in result:
        orig = result[vid]["original_views"] or 1
        result[vid]["multiplier"] = round(result[vid]["uploaded_views"] / orig, 2)

    return list(result.values())


@app.post("/reach/refresh")
def refresh_reach_stats(background_tasks: BackgroundTasks):
    """Re-fetch YouTube stats for all uploaded videos."""
    background_tasks.add_task(_refresh_stats)
    return {"status": "refresh_started"}


def _refresh_stats():
    with db() as conn:
        jobs = conn.execute(
            """SELECT uj.id, uj.youtube_video_id, tc.oauth_credentials
               FROM upload_jobs uj
               JOIN target_channels tc ON tc.id = uj.target_channel_id
               WHERE uj.status='done' AND uj.youtube_video_id IS NOT NULL"""
        ).fetchall()

    for job in jobs:
        try:
            stats = get_video_stats_from_api(job["youtube_video_id"], job["oauth_credentials"])
            with db() as conn:
                conn.execute(
                    """INSERT INTO reach_stats (upload_job_id, views, likes, comments)
                       VALUES (?,?,?,?)""",
                    (job["id"], stats["views"], stats["likes"], stats["comments"]),
                )
        except Exception as e:
            print(f"[reach] Failed to refresh job {job['id']}: {e}")

    print(f"[reach] Refreshed stats for {len(jobs)} uploads")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
