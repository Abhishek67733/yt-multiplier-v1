import os
import json
import base64
import tempfile
import traceback
import math
import random
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

import httpx
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build as google_build
from google.oauth2.credentials import Credentials

from database import supabase
from yt_client import get_channel_shorts, channel_info, get_video_stats, download_video_bytes
from caption_ai import generate_caption_variation, generate_title_variation
from youtube_upload import upload_short, get_video_stats_from_api
from video_processor import process_video, get_processing_info

WEBHOOK_URL = os.getenv(
    "WEBHOOK_URL",
    "https://pwl.app.n8n.cloud/webhook/5c621a46-4d53-4279-9b5f-f1d76d96a440",
)

# ── IST Peak Hours for smart scheduling ──────────────────────────────────────
PEAK_HOURS_IST = [12, 13, 18, 19, 20, 21]
IST_OFFSET = timedelta(hours=5, minutes=30)

app = FastAPI(title="YouTube Shorts Multiplier API", version="2.0.0")

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


# ── User Resolution ──────────────────────────────────────────────────────────

DEFAULT_USER_ID: str | None = None

def _ensure_default_user() -> str:
    """Create or fetch a default user on startup."""
    global DEFAULT_USER_ID
    if DEFAULT_USER_ID:
        return DEFAULT_USER_ID
    # Check if any user exists
    existing = supabase.table("users").select("id").limit(1).execute().data
    if existing:
        DEFAULT_USER_ID = existing[0]["id"]
    else:
        result = supabase.table("users").insert({"email": "default@ytmultiplier.app", "name": "Default User"}).execute()
        DEFAULT_USER_ID = result.data[0]["id"]
    return DEFAULT_USER_ID


def get_user_id(x_user_id: str = Header(None)) -> str:
    """Get user_id from x-user-id header, or fall back to default user."""
    if x_user_id:
        # Validate it exists
        existing = supabase.table("users").select("id").eq("id", x_user_id).execute().data
        if existing:
            return existing[0]["id"]
    return _ensure_default_user()


def get_optional_user_id(x_user_id: str = Header(None)) -> Optional[str]:
    """Same as get_user_id but never raises."""
    try:
        return get_user_id(x_user_id)
    except Exception:
        return None


# ── Startup ────────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    _ensure_default_user()
    from scheduler import start_scheduler
    start_scheduler()


@app.on_event("shutdown")
def shutdown():
    from scheduler import stop_scheduler
    stop_scheduler()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/auth/me")
def get_or_create_me():
    """Return current user_id. Creates a default user if none exists."""
    uid = _ensure_default_user()
    return {"user_id": uid}


# ── Request / Response Models ──────────────────────────────────────────────────

class AddSourceChannel(BaseModel):
    url: str

class AddTargetChannel(BaseModel):
    channel_name: str
    oauth_credentials: dict

class StartUploadRequest(BaseModel):
    video_id: str
    n_channels: int
    gap_hours: float

class BulkMultiplierRequest(BaseModel):
    video_ids: list[str]
    n_channels: int
    gap_hours: float
    duration_hours: float

class WebhookTestRequest(BaseModel):
    video_ids: list[str]
    n_channels: int = 30
    process_video: bool = True
    use_peak_hours: bool = True

class MultiplyViaWebhookRequest(BaseModel):
    video_ids: list[str]
    n_channels: int = 5
    gap_hours: float = 2
    process_video: bool = True
    use_peak_hours: bool = True


# ── Source Channels ────────────────────────────────────────────────────────────

@app.get("/channels/source")
def list_source_channels(user_id: str = Depends(get_user_id)):
    result = supabase.table("source_channels").select("*").eq("user_id", user_id).order("added_at", desc=True).execute()
    return result.data


@app.post("/channels/source", status_code=201)
def add_source_channel(body: AddSourceChannel, user_id: str = Depends(get_user_id)):
    try:
        info = channel_info(body.url)
    except Exception:
        info = {"channel_id": "", "name": "", "thumbnail": ""}

    channel_id = info.get("channel_id") or body.url
    name = info.get("name") or body.url
    thumbnail = info.get("thumbnail") or ""

    existing = supabase.table("source_channels").select("id").eq("user_id", user_id).or_(f"id.eq.{channel_id},url.eq.{body.url}").execute()
    if existing.data:
        raise HTTPException(400, "Channel already added")

    supabase.table("source_channels").insert({
        "id": channel_id,
        "user_id": user_id,
        "name": name,
        "url": body.url,
        "thumbnail": thumbnail,
    }).execute()
    return {"id": channel_id, "name": name, "url": body.url}


@app.post("/channels/source/enrich")
def enrich_source_channels(user_id: str = Depends(get_user_id)):
    YT_DLP_BASE = os.getenv("YT_DLP_API_BASE_URL", "http://localhost:8000")
    rows = supabase.table("source_channels").select("id, url").eq("user_id", user_id).execute().data
    updated = 0
    for row in rows:
        try:
            resp = httpx.get(f"{YT_DLP_BASE}/channel/list", params={"url": row["url"], "limit": 1}, timeout=30)
            data = resp.json()
            name = data.get("channel") or data.get("channel_name") or data.get("uploader") or ""
            thumbnail = data.get("thumbnail") or ""
            if name:
                supabase.table("source_channels").update({"name": name, "thumbnail": thumbnail}).eq("id", row["id"]).eq("user_id", user_id).execute()
                updated += 1
        except Exception:
            pass
    return {"updated": updated}


@app.delete("/channels/source/{channel_id}", status_code=204)
def remove_source_channel(channel_id: str, user_id: str = Depends(get_user_id)):
    supabase.table("source_channels").delete().eq("id", channel_id).eq("user_id", user_id).execute()


# ── YouTube OAuth Connect Flow ─────────────────────────────────────────────────

@app.get("/auth/youtube/connect")
def youtube_oauth_connect(x_user_id: str = Header(None)):
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(500, "Google OAuth credentials not configured on the server")

    redirect_uri = OAUTH_REDIRECT_URI or "http://localhost:8001/auth/youtube/callback"
    scopes = " ".join(YOUTUBE_SCOPES)
    state_data = x_user_id or _ensure_default_user()
    state = secrets.token_urlsafe(22)
    # Store user_id in state so callback can resolve user
    # Format: random_token|user_id
    combined_state = f"{state}|{state_data}"
    auth_url = (
        f"https://accounts.google.com/o/oauth2/auth"
        f"?response_type=code"
        f"&client_id={GOOGLE_CLIENT_ID}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={scopes}"
        f"&access_type=offline"
        f"&prompt=consent"
        f"&state={combined_state}"
    )
    return {"auth_url": auth_url, "state": combined_state}


@app.get("/auth/youtube/callback")
def youtube_oauth_callback(code: str = Query(...), state: str = Query(None)):
    try:
        user_id_from_state = ""
        if state and "|" in state:
            _, user_id_from_state = state.split("|", 1)

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

        youtube = google_build("youtube", "v3", credentials=creds)
        channels_resp = youtube.channels().list(part="snippet", mine=True).execute()
        items = channels_resp.get("items", [])

        if not items:
            return RedirectResponse(f"{FRONTEND_URL}/dashboard?youtube_connect=error&reason=no_channel")

        channel = items[0]
        channel_name = channel["snippet"]["title"]
        channel_id = channel["id"]

        creds_data = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
        }

        # Resolve user
        user_id = user_id_from_state or _ensure_default_user()

        # Upsert target channel
        existing = supabase.table("target_channels").select("id").eq("channel_id", channel_id).eq("user_id", user_id).execute()
        if existing.data:
            supabase.table("target_channels").update({
                "oauth_credentials": creds_data,
                "channel_name": channel_name,
            }).eq("id", existing.data[0]["id"]).execute()
        else:
            supabase.table("target_channels").insert({
                "user_id": user_id,
                "channel_name": channel_name,
                "channel_id": channel_id,
                "oauth_credentials": creds_data,
            }).execute()

        return RedirectResponse(f"{FRONTEND_URL}/dashboard?youtube_connect=success&channel={channel_name}")

    except Exception as e:
        print(f"[oauth] Callback error: {traceback.format_exc()}")
        return RedirectResponse(f"{FRONTEND_URL}/dashboard?youtube_connect=error&reason={str(e)[:100]}")


# ── Target Channels ────────────────────────────────────────────────────────────

@app.get("/channels/target")
def list_target_channels(user_id: str = Depends(get_user_id)):
    result = supabase.table("target_channels").select("id, channel_name, channel_id, upload_count, added_at").eq("user_id", user_id).execute()
    return result.data


@app.post("/channels/target", status_code=201)
def add_target_channel(body: AddTargetChannel, user_id: str = Depends(get_user_id)):
    result = supabase.table("target_channels").insert({
        "user_id": user_id,
        "channel_name": body.channel_name,
        "oauth_credentials": body.oauth_credentials,
    }).execute()
    row = result.data[0]
    return {"id": row["id"], "channel_name": body.channel_name}


@app.delete("/channels/target/{channel_id}", status_code=204)
def remove_target_channel(channel_id: int, user_id: str = Depends(get_user_id)):
    supabase.table("target_channels").delete().eq("id", channel_id).eq("user_id", user_id).execute()


# ── Shorts Scan ────────────────────────────────────────────────────────────────

VIEWS_THRESHOLD = int(os.getenv("VIEWS_THRESHOLD", "500"))
_scan_state: dict = {"running": False, "last_result": None}


@app.post("/shorts/scan")
def scan_shorts(background_tasks: BackgroundTasks, user_id: str = Depends(get_user_id)):
    if _scan_state["running"]:
        return {"status": "already_running"}
    _scan_state["running"] = True
    _scan_state["last_result"] = None
    background_tasks.add_task(_run_scan, user_id)
    return {"status": "scan_started"}


@app.get("/shorts/scan/status")
def scan_status():
    return {"running": _scan_state["running"], "last_result": _scan_state["last_result"]}


def _calculate_velocity(views_now, views_discovery, published, scan_history, delta):
    hours_alive = 24.0
    if published and len(str(published)) >= 8:
        try:
            pub_str = str(published)[:8]
            pub_date = datetime(int(pub_str[:4]), int(pub_str[4:6]), int(pub_str[6:8]), tzinfo=timezone.utc)
            hours_alive = max((datetime.now(timezone.utc) - pub_date).total_seconds() / 3600, 1)
        except Exception:
            pass

    growth_rate = delta / max(hours_alive, 1)
    relative_gain = delta / max(views_discovery, 1)
    velocity_score = growth_rate * relative_gain * 100

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


def _run_scan(user_id: str):
    try:
        channels = supabase.table("source_channels").select("id, url").eq("user_id", user_id).execute().data
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
                published = s.get("upload_date") or ""

                existing = supabase.table("shorts").select("video_id, views_last_check, views_at_discovery, scan_history").eq("video_id", vid_id).eq("user_id", user_id).execute().data

                if not existing:
                    supabase.table("shorts").insert({
                        "video_id": vid_id,
                        "user_id": user_id,
                        "channel_id": ch["id"],
                        "title": s.get("title", ""),
                        "url": short_url,
                        "description": s.get("description", ""),
                        "views_at_discovery": views_now,
                        "views_last_check": views_now,
                        "views_delta": 0,
                        "likes": int(s.get("likes") or 0),
                        "comments": int(s.get("comments") or 0),
                        "duration": duration,
                        "thumbnail": s.get("thumbnail", ""),
                        "published_at": published,
                        "scan_history": [],
                    }).execute()
                    new_count += 1
                else:
                    row = existing[0]
                    delta = views_now - (row["views_last_check"] or 0)
                    history = row.get("scan_history") or []
                    if isinstance(history, str):
                        try:
                            history = json.loads(history)
                        except Exception:
                            history = []
                    history.append(delta)
                    history = history[-10:]

                    vel_score, growth_rate, trend = _calculate_velocity(
                        views_now, row["views_at_discovery"] or 1, published, history, delta
                    )

                    new_status = "queued" if delta >= VIEWS_THRESHOLD else "monitoring"
                    update_data = {
                        "views_last_check": views_now,
                        "views_delta": delta,
                        "likes": int(s.get("likes") or 0),
                        "comments": int(s.get("comments") or 0),
                        "last_checked": datetime.now(timezone.utc).isoformat(),
                        "velocity_score": vel_score,
                        "growth_rate": growth_rate,
                        "trend": trend,
                        "scan_history": history,
                    }
                    # Don't overwrite 'done' status
                    current_status_result = supabase.table("shorts").select("status").eq("video_id", vid_id).eq("user_id", user_id).execute()
                    if current_status_result.data and current_status_result.data[0]["status"] != "done":
                        update_data["status"] = new_status

                    supabase.table("shorts").update(update_data).eq("video_id", vid_id).eq("user_id", user_id).execute()
                    if new_status == "queued":
                        queued_count += 1

        result = {"channels_scanned": len(channels), "new_shorts": new_count, "queued_shorts": queued_count, "errors": errors}
        print(f"[scan] Completed: {result}")
        _scan_state["last_result"] = result

    except Exception as e:
        _scan_state["last_result"] = {"error": str(e)}
        print(f"[scan] Fatal error: {e}")
    finally:
        _scan_state["running"] = False


# ── Shorts Listing ─────────────────────────────────────────────────────────────

@app.get("/shorts/all")
def list_all_shorts(channel_id: Optional[str] = None, user_id: str = Depends(get_user_id)):
    q = supabase.table("shorts").select("*").eq("user_id", user_id)
    if channel_id:
        q = q.eq("channel_id", channel_id)
    result = q.order("views_delta", desc=True).execute()
    return result.data


@app.get("/shorts/queue")
def list_queued_shorts(user_id: str = Depends(get_user_id)):
    result = supabase.table("shorts").select("*").eq("user_id", user_id).eq("status", "queued").order("views_delta", desc=True).execute()
    return result.data


# ── Multiplier Room ───────────────────────────────────────────────────────────

MULTIPLIER_THRESHOLD = int(os.getenv("MULTIPLIER_THRESHOLD", "1000"))


@app.get("/shorts/multiplier-room")
def multiplier_room(user_id: str = Depends(get_user_id)):
    shorts_result = supabase.table("shorts").select("*, source_channels(name)").eq("user_id", user_id).gte("views_delta", MULTIPLIER_THRESHOLD).neq("status", "done").order("velocity_score", desc=True).execute()

    result = []
    for r in shorts_result.data:
        r["channel_name"] = r.get("source_channels", {}).get("name", "") if r.get("source_channels") else ""
        titles_result = supabase.table("ai_titles").select("id, title").eq("video_id", r["video_id"]).eq("user_id", user_id).order("generated_at", desc=True).execute()
        r["ai_titles"] = titles_result.data
        if "source_channels" in r:
            del r["source_channels"]
        result.append(r)
    return result


@app.post("/shorts/{video_id}/generate-titles")
def generate_titles_for_short(video_id: str, user_id: str = Depends(get_user_id)):
    short = supabase.table("shorts").select("title, description").eq("video_id", video_id).eq("user_id", user_id).execute().data
    if not short:
        raise HTTPException(404, "Short not found")

    titles = [generate_title_variation(short[0]["title"] or "Short Video") for _ in range(5)]

    supabase.table("ai_titles").delete().eq("video_id", video_id).eq("user_id", user_id).execute()
    for t in titles:
        supabase.table("ai_titles").insert({"user_id": user_id, "video_id": video_id, "title": t}).execute()

    return {"video_id": video_id, "titles": titles}


@app.post("/shorts/generate-all-titles")
def generate_all_titles_in_room(background_tasks: BackgroundTasks, user_id: str = Depends(get_user_id)):
    background_tasks.add_task(_generate_all_titles, user_id)
    return {"status": "generation_started"}


def _generate_all_titles(user_id: str):
    shorts = supabase.table("shorts").select("video_id, title").eq("user_id", user_id).gte("views_delta", MULTIPLIER_THRESHOLD).neq("status", "done").execute().data

    for s in shorts:
        existing = supabase.table("ai_titles").select("id", count="exact").eq("video_id", s["video_id"]).eq("user_id", user_id).execute()
        if existing.count and existing.count >= 5:
            continue
        try:
            titles = [generate_title_variation(s["title"] or "Short Video") for _ in range(5)]
            supabase.table("ai_titles").delete().eq("video_id", s["video_id"]).eq("user_id", user_id).execute()
            for t in titles:
                supabase.table("ai_titles").insert({"user_id": user_id, "video_id": s["video_id"], "title": t}).execute()
            print(f"[ai] Generated 5 titles for {s['video_id']}")
        except Exception as e:
            print(f"[ai] Failed for {s['video_id']}: {e}")


# ── Upload Jobs ────────────────────────────────────────────────────────────────

def _smart_select_channels(user_id: str, n: int, exclude_video_id: str = "") -> list:
    # Get channels not already assigned to this video
    all_targets = supabase.table("target_channels").select("id, upload_count, last_upload_at").eq("user_id", user_id).order("last_upload_at", desc=False, nullsfirst=True).order("upload_count").execute().data

    if exclude_video_id:
        existing_jobs = supabase.table("upload_jobs").select("target_channel_id").eq("video_id", exclude_video_id).eq("user_id", user_id).in_("status", ["pending", "uploading", "done"]).execute().data
        used_ids = {j["target_channel_id"] for j in existing_jobs}
        all_targets = [t for t in all_targets if t["id"] not in used_ids]

    return all_targets[:n]


@app.post("/upload/start")
def start_upload_campaign(body: StartUploadRequest, user_id: str = Depends(get_user_id)):
    if not (1 <= body.n_channels <= 5):
        raise HTTPException(400, "n_channels must be between 1 and 5")

    short = supabase.table("shorts").select("*").eq("video_id", body.video_id).eq("user_id", user_id).execute().data
    if not short:
        raise HTTPException(404, "Short not found")

    targets = _smart_select_channels(user_id, body.n_channels, body.video_id)
    if not targets:
        raise HTTPException(400, "No target channels available")

    created_jobs = []
    now = datetime.now(timezone.utc)
    for i, target in enumerate(targets):
        scheduled = now + timedelta(hours=body.gap_hours * i)
        try:
            result = supabase.table("upload_jobs").insert({
                "user_id": user_id,
                "video_id": body.video_id,
                "target_channel_id": target["id"],
                "scheduled_at": scheduled.isoformat(),
            }).execute()
            created_jobs.append({
                "job_id": result.data[0]["id"],
                "target_channel_id": target["id"],
                "scheduled_at": scheduled.isoformat(),
            })
        except Exception:
            pass

    return {"jobs_created": len(created_jobs), "jobs": created_jobs}


@app.post("/upload/bulk-multiplier")
def bulk_multiplier(body: BulkMultiplierRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_user_id)):
    if not body.video_ids:
        raise HTTPException(400, "No video_ids provided")

    total_jobs = len(body.video_ids) * body.n_channels
    time_per_job = (body.duration_hours * 3600) / max(total_jobs, 1)

    all_created = []
    now = datetime.now(timezone.utc)
    job_index = 0

    targets_all = supabase.table("target_channels").select("id").eq("user_id", user_id).execute().data
    if not targets_all:
        raise HTTPException(400, "No target channels configured")

    for vid_id in body.video_ids:
        short = supabase.table("shorts").select("video_id").eq("video_id", vid_id).eq("user_id", user_id).execute().data
        if not short:
            continue
        channels = _smart_select_channels(user_id, body.n_channels, vid_id)
        for ch in channels:
            scheduled = now + timedelta(seconds=time_per_job * job_index)
            try:
                result = supabase.table("upload_jobs").insert({
                    "user_id": user_id,
                    "video_id": vid_id,
                    "target_channel_id": ch["id"],
                    "scheduled_at": scheduled.isoformat(),
                }).execute()
                all_created.append({
                    "job_id": result.data[0]["id"],
                    "video_id": vid_id,
                    "target_channel_id": ch["id"],
                    "scheduled_at": scheduled.isoformat(),
                })
                job_index += 1
            except Exception:
                pass

    return {"jobs_created": len(all_created), "total_duration_hours": body.duration_hours, "jobs": all_created}


@app.get("/upload/jobs")
def list_upload_jobs(user_id: str = Depends(get_user_id)):
    result = supabase.table("upload_jobs").select("*, shorts(title, thumbnail), target_channels(channel_name)").eq("user_id", user_id).order("scheduled_at").execute()
    jobs = []
    for r in result.data:
        r["short_title"] = r.get("shorts", {}).get("title", "") if r.get("shorts") else ""
        r["short_thumbnail"] = r.get("shorts", {}).get("thumbnail", "") if r.get("shorts") else ""
        r["channel_name"] = r.get("target_channels", {}).get("channel_name", "") if r.get("target_channels") else ""
        r.pop("shorts", None)
        r.pop("target_channels", None)
        jobs.append(r)
    return jobs


@app.post("/upload/execute/{job_id}")
def execute_upload(job_id: int, background_tasks: BackgroundTasks, user_id: str = Depends(get_user_id)):
    job = supabase.table("upload_jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute().data
    if not job:
        raise HTTPException(404, "Job not found")
    if job[0]["status"] not in ("pending", "failed"):
        raise HTTPException(400, f"Job status is '{job[0]['status']}', cannot execute")
    supabase.table("upload_jobs").update({"status": "uploading"}).eq("id", job_id).execute()
    background_tasks.add_task(_run_upload, job_id, user_id)
    return {"status": "upload_started", "job_id": job_id}


def _run_upload(job_id: int, user_id: str):
    job_data = supabase.table("upload_jobs").select("*, shorts(title, description, url), target_channels(oauth_credentials, id)").eq("id", job_id).execute().data
    if not job_data:
        return
    job = job_data[0]
    short_info = job.get("shorts") or {}
    tc_info = job.get("target_channels") or {}

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
            tmp_path = tmp.name
        download_video_bytes(short_info.get("url", ""), tmp_path)

        caption = generate_caption_variation(short_info.get("title", ""), short_info.get("description", ""))
        new_title = generate_title_variation(short_info.get("title", "") or "Short Video")

        oauth_creds = tc_info.get("oauth_credentials")
        if isinstance(oauth_creds, str):
            oauth_creds = json.loads(oauth_creds)

        result = upload_short(
            video_path=tmp_path,
            title=new_title,
            description=caption,
            oauth_credentials_json=json.dumps(oauth_creds) if isinstance(oauth_creds, dict) else oauth_creds,
        )

        yt_video_id = result["youtube_video_id"]
        supabase.table("upload_jobs").update({
            "status": "done",
            "youtube_video_id": yt_video_id,
            "caption_variation": caption,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", job_id).execute()

        tc_id = tc_info.get("id") or job.get("target_channel_id")
        # Increment upload count
        tc_row = supabase.table("target_channels").select("upload_count").eq("id", tc_id).execute().data
        new_count = (tc_row[0]["upload_count"] or 0) + 1 if tc_row else 1
        supabase.table("target_channels").update({
            "upload_count": new_count,
            "last_upload_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", tc_id).execute()
        supabase.table("shorts").update({"status": "done"}).eq("video_id", job["video_id"]).eq("user_id", user_id).execute()

        if result.get("updated_credentials"):
            supabase.table("target_channels").update({"oauth_credentials": result["updated_credentials"]}).eq("id", tc_id).execute()

        print(f"[upload] Job {job_id} done — yt:{yt_video_id}")

    except Exception as e:
        print(f"[upload] Job {job_id} failed: {e}")
        supabase.table("upload_jobs").update({"status": "failed", "error_message": str(e)}).eq("id", job_id).execute()
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ── Webhook Test Upload ───────────────────────────────────────────────────────

_webhook_state: dict = {"running": False, "last_result": None}
_multiply_state: dict = {"running": False, "last_result": None, "progress": {}}


@app.post("/upload/webhook-test")
def webhook_test_upload(body: WebhookTestRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_user_id)):
    if _webhook_state["running"]:
        return {"status": "already_running"}
    if not body.video_ids:
        raise HTTPException(400, "No video_ids provided")
    _webhook_state["running"] = True
    _webhook_state["last_result"] = None
    background_tasks.add_task(_run_webhook_test, body.video_ids, body.n_channels, body.process_video, body.use_peak_hours, user_id)
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
    return {"running": _webhook_state["running"], "last_result": _webhook_state["last_result"]}


def _next_peak_slot(base_time, slot_index, gap_hours, use_peak):
    candidate = base_time + timedelta(hours=gap_hours * slot_index)
    if not use_peak:
        return candidate
    ist_time = candidate + IST_OFFSET
    hour = ist_time.hour
    if hour in PEAK_HOURS_IST:
        return candidate
    for offset_h in range(1, 25):
        test = ist_time + timedelta(hours=offset_h)
        if test.hour in PEAK_HOURS_IST:
            return candidate + timedelta(hours=offset_h)
    return candidate


def _run_webhook_test(video_ids, n_channels, do_process=True, use_peak=True, user_id=None, video_available_channels=None):
    results = []
    errors = []
    cleanup_files = []

    target_channel_names = []
    if user_id:
        rows = supabase.table("target_channels").select("channel_name").eq("user_id", user_id).order("id").execute().data
        target_channel_names = [r["channel_name"] for r in rows]

    for vid_id in video_ids:
        short_data = supabase.table("shorts").select("*").eq("video_id", vid_id).eq("user_id", user_id).execute().data
        if not short_data:
            errors.append(f"{vid_id}: not found in DB")
            continue
        short = short_data[0]

        ai_titles_data = supabase.table("ai_titles").select("title").eq("video_id", vid_id).eq("user_id", user_id).execute().data
        ai_title_list = [t["title"] for t in ai_titles_data]

        if not ai_title_list:
            try:
                ai_title_list = [generate_title_variation(short["title"] or "Short Video") for _ in range(5)]
                for t in ai_title_list:
                    supabase.table("ai_titles").insert({"user_id": user_id, "video_id": vid_id, "title": t}).execute()
            except Exception as e:
                print(f"[webhook] AI title generation failed for {vid_id}: {e}")
                ai_title_list = [short["title"]]

        try:
            caption = generate_caption_variation(short["title"] or "", short["description"] or "")
        except Exception:
            caption = short.get("description") or short.get("title") or ""

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                tmp_path = tmp.name
            cleanup_files.append(tmp_path)
            video_url = short["url"] or f"https://www.youtube.com/shorts/{vid_id}"
            download_video_bytes(video_url, tmp_path)
        except Exception as e:
            errors.append(f"{vid_id}: download failed - {e}")
            continue

        now = datetime.now(timezone.utc)
        if video_available_channels and vid_id in video_available_channels:
            channel_numbers = list(video_available_channels[vid_id])
        else:
            channel_numbers = list(range(1, n_channels + 1))
        random.shuffle(channel_numbers)

        shuffled_titles = list(ai_title_list)
        random.shuffle(shuffled_titles)

        for slot_idx, ch_num in enumerate(channel_numbers):
            if ch_num <= len(target_channel_names):
                channel_name = target_channel_names[ch_num - 1]
            else:
                channel_name = f"Channel {ch_num}"

            picked_title = shuffled_titles[slot_idx % len(shuffled_titles)]
            jitter_minutes = random.randint(-30, 30)
            scheduled_at = _next_peak_slot(now, slot_idx, 2, use_peak) + timedelta(minutes=jitter_minutes)

            send_path = tmp_path
            if do_process:
                try:
                    processed_path = process_video(tmp_path, channel_num=ch_num)
                    if processed_path != tmp_path:
                        cleanup_files.append(processed_path)
                        send_path = processed_path
                except Exception:
                    pass

            video_size = os.path.getsize(send_path)
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
                    "description": short.get("description") or "",
                    "original_url": short.get("url") or "",
                    "thumbnail": short.get("thumbnail") or "",
                    "views": short.get("views_last_check") or 0,
                    "views_delta": short.get("views_delta") or 0,
                    "likes": short.get("likes") or 0,
                    "duration": short.get("duration") or 0,
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
                    resp = httpx.post(WEBHOOK_URL, files=files, timeout=60)
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
                supabase.table("webhook_logs").insert({
                    "user_id": user_id,
                    "video_id": vid_id,
                    "original_title": short["title"],
                    "new_title": picked_title,
                    "caption": caption,
                    "channel_number": ch_num,
                    "channel_name": channel_name,
                    "total_channels": n_channels,
                    "file_size_bytes": video_size,
                    "video_processed": 1 if do_process else 0,
                    "scheduled_at": scheduled_at.isoformat(),
                    "webhook_status": resp.status_code,
                    "webhook_url": WEBHOOK_URL,
                    "velocity_score": short.get("velocity_score") or 0,
                    "trend": short.get("trend") or "flat",
                    "thumbnail": short.get("thumbnail") or "",
                    "status": "sent",
                }).execute()
                _multiply_state["progress"]["completed"] = _multiply_state["progress"].get("completed", 0) + 1

            except Exception as e:
                err = f"{vid_id} -> {channel_label}: webhook failed - {e}"
                errors.append(err)
                _multiply_state["progress"]["completed"] = _multiply_state["progress"].get("completed", 0) + 1
                _multiply_state["progress"]["errors"] = _multiply_state["progress"].get("errors", 0) + 1
                try:
                    supabase.table("webhook_logs").insert({
                        "user_id": user_id,
                        "video_id": vid_id,
                        "original_title": short["title"],
                        "new_title": picked_title,
                        "caption": caption,
                        "channel_number": ch_num,
                        "channel_name": channel_name,
                        "total_channels": n_channels,
                        "file_size_bytes": video_size,
                        "video_processed": 1 if do_process else 0,
                        "scheduled_at": scheduled_at.isoformat(),
                        "webhook_url": WEBHOOK_URL,
                        "velocity_score": short.get("velocity_score") or 0,
                        "trend": short.get("trend") or "flat",
                        "thumbnail": short.get("thumbnail") or "",
                        "error_message": str(e),
                        "status": "failed",
                    }).execute()
                except Exception:
                    pass

    for f in cleanup_files:
        try:
            os.unlink(f)
        except Exception:
            pass

    final_result = {"total_sent": len(results), "total_errors": len(errors), "results": results, "errors": errors}
    _webhook_state["last_result"] = final_result
    _webhook_state["running"] = False
    _multiply_state["last_result"] = final_result
    _multiply_state["running"] = False


# ── Multiply via n8n Webhook ──────────────────────────────────────────────────

@app.post("/upload/multiply-via-webhook")
def multiply_via_webhook(body: MultiplyViaWebhookRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_user_id)):
    if _multiply_state["running"]:
        return {"status": "already_running"}
    if not body.video_ids:
        raise HTTPException(400, "No video_ids provided")

    target_count = len(supabase.table("target_channels").select("id").eq("user_id", user_id).execute().data)
    max_used_data = supabase.table("webhook_logs").select("channel_number").eq("user_id", user_id).order("channel_number", desc=True).limit(1).execute().data
    max_used = max_used_data[0]["channel_number"] if max_used_data else 0
    max_channels = max(target_count, body.n_channels, max_used)

    last_upload_data = supabase.table("webhook_logs").select("channel_number, created_at").eq("user_id", user_id).eq("status", "sent").execute().data
    last_upload_map = {}
    for r in last_upload_data:
        ch = r["channel_number"]
        if ch not in last_upload_map or r["created_at"] > last_upload_map[ch]:
            last_upload_map[ch] = r["created_at"]

    all_channel_nums = list(range(1, max_channels + 1))
    valid_video_ids = []
    video_available_channels = {}

    for vid_id in body.video_ids:
        sorted_channels = sorted(all_channel_nums, key=lambda ch: last_upload_map.get(ch) or "0000-00-00")
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
    }
    background_tasks.add_task(_run_webhook_test, valid_video_ids, body.n_channels, body.process_video, body.use_peak_hours, user_id, video_available_channels)
    return {
        "status": "multiply_started",
        "videos": len(valid_video_ids),
        "channels_per_video": body.n_channels,
        "total_webhooks": total_new_uploads,
    }


@app.get("/upload/multiply-via-webhook/status")
def multiply_status():
    return {
        "running": _multiply_state["running"],
        "progress": _multiply_state["progress"],
        "last_result": _multiply_state.get("last_result") or _webhook_state.get("last_result"),
    }


# ── N8n Callback ──────────────────────────────────────────────────────────────

class N8nCallbackRequest(BaseModel):
    webhook_log_id: Optional[int] = None
    video_id: Optional[str] = None
    channel_number: Optional[int] = None
    uploaded_video_id: str


@app.post("/upload/n8n-callback")
def n8n_upload_callback(body: N8nCallbackRequest):
    if body.webhook_log_id:
        supabase.table("webhook_logs").update({"uploaded_video_id": body.uploaded_video_id}).eq("id", body.webhook_log_id).execute()
    elif body.video_id and body.channel_number is not None:
        logs = supabase.table("webhook_logs").select("id").eq("video_id", body.video_id).eq("channel_number", body.channel_number).eq("status", "sent").order("created_at", desc=True).limit(1).execute().data
        if logs:
            supabase.table("webhook_logs").update({"uploaded_video_id": body.uploaded_video_id}).eq("id", logs[0]["id"]).execute()
    return {"status": "ok"}


# ── Stats Refresh ─────────────────────────────────────────────────────────────

def _refresh_uploaded_video_stats():
    rows = supabase.table("webhook_logs").select("id, uploaded_video_id").not_.is_("uploaded_video_id", "null").eq("status", "sent").execute().data
    for row in rows:
        if not row["uploaded_video_id"]:
            continue
        try:
            stats = get_video_stats(f"https://www.youtube.com/watch?v={row['uploaded_video_id']}")
            supabase.table("webhook_logs").update({
                "uploaded_views": stats.get("views", 0) or 0,
                "uploaded_likes": stats.get("likes", 0) or 0,
                "stats_updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", row["id"]).execute()
        except Exception as e:
            print(f"[stats-refresh] Failed for {row['uploaded_video_id']}: {e}")


@app.post("/upload/refresh-stats")
def manual_refresh_stats(background_tasks: BackgroundTasks):
    background_tasks.add_task(_refresh_uploaded_video_stats)
    return {"status": "refresh_started"}


# ── Multiplied Videos ─────────────────────────────────────────────────────────

@app.get("/upload/multiplied-videos")
def get_multiplied_videos(user_id: str = Depends(get_user_id)):
    rows = supabase.table("webhook_logs").select("id, video_id, original_title, channel_number, channel_name, new_title, status, scheduled_at, created_at, uploaded_video_id, uploaded_views, uploaded_likes, stats_updated_at").eq("user_id", user_id).eq("status", "sent").order("created_at", desc=True).execute().data

    # Get shorts data for thumbnails etc
    video_ids = list(set(r["video_id"] for r in rows))
    shorts_map = {}
    if video_ids:
        shorts_data = supabase.table("shorts").select("video_id, thumbnail, url, views_last_check, likes, velocity_score, trend").eq("user_id", user_id).in_("video_id", video_ids).execute().data
        shorts_map = {s["video_id"]: s for s in shorts_data}

    grouped = {}
    for r in rows:
        vid = r["video_id"]
        s = shorts_map.get(vid, {})
        if vid not in grouped:
            grouped[vid] = {
                "video_id": vid,
                "title": r["original_title"],
                "thumbnail": s.get("thumbnail") or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                "original_url": s.get("url") or f"https://www.youtube.com/shorts/{vid}",
                "original_views": s.get("views_last_check") or 0,
                "original_likes": s.get("likes") or 0,
                "velocity_score": s.get("velocity_score") or 0,
                "trend": s.get("trend") or "flat",
                "channels": [],
                "total_uploaded_views": 0,
                "total_uploaded_likes": 0,
                "stats_updated_at": None,
            }
        uv = r["uploaded_views"] or 0
        ul = r["uploaded_likes"] or 0
        grouped[vid]["total_uploaded_views"] += uv
        grouped[vid]["total_uploaded_likes"] += ul
        if r["stats_updated_at"] and (not grouped[vid]["stats_updated_at"] or r["stats_updated_at"] > grouped[vid]["stats_updated_at"]):
            grouped[vid]["stats_updated_at"] = r["stats_updated_at"]
        grouped[vid]["channels"].append({
            "channel_number": r["channel_number"],
            "channel_name": r["channel_name"],
            "new_title": r["new_title"],
            "scheduled_at": r["scheduled_at"],
            "sent_at": r["created_at"],
            "uploaded_video_id": r["uploaded_video_id"],
            "uploaded_views": uv,
            "uploaded_likes": ul,
            "stats_updated_at": r["stats_updated_at"],
        })

    result = list(grouped.values())
    for v in result:
        v["multiplier"] = len(v["channels"])
    return result


# ── Webhook Logs ──────────────────────────────────────────────────────────────

@app.get("/upload/webhook-logs")
def list_webhook_logs(limit: int = 200, user_id: str = Depends(get_user_id)):
    result = supabase.table("webhook_logs").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()
    return result.data


@app.get("/upload/webhook-logs/summary")
def webhook_logs_summary(user_id: str = Depends(get_user_id)):
    all_logs = supabase.table("webhook_logs").select("status, video_id, channel_name, file_size_bytes").eq("user_id", user_id).execute().data
    total = len(all_logs)
    sent = [l for l in all_logs if l["status"] == "sent"]
    failed = [l for l in all_logs if l["status"] == "failed"]
    unique_videos = len(set(l["video_id"] for l in sent))
    unique_channels = len(set(l["channel_name"] for l in sent if l["channel_name"]))
    total_size = sum(l.get("file_size_bytes") or 0 for l in sent)
    return {
        "total_uploads": total,
        "sent": len(sent),
        "failed": len(failed),
        "unique_videos": unique_videos,
        "unique_channels": unique_channels,
        "total_data_sent_mb": round(total_size / (1024 * 1024), 1),
    }


# ── Reach Stats ────────────────────────────────────────────────────────────────

@app.get("/reach/stats")
def get_reach_stats(user_id: str = Depends(get_user_id)):
    jobs_done = supabase.table("upload_jobs").select("id, video_id, youtube_video_id, target_channel_id, uploaded_at, target_channels(channel_name), shorts(title, views_last_check, thumbnail)").eq("user_id", user_id).eq("status", "done").not_.is_("youtube_video_id", "null").execute().data

    result = {}
    for row in jobs_done:
        vid = row["video_id"]
        s = row.get("shorts") or {}
        tc = row.get("target_channels") or {}
        if vid not in result:
            result[vid] = {
                "video_id": vid,
                "title": s.get("title"),
                "thumbnail": s.get("thumbnail"),
                "original_views": s.get("views_last_check") or 0,
                "uploaded_views": 0,
                "multiplier": 0.0,
                "uploads": [],
            }

        stat = supabase.table("reach_stats").select("views").eq("upload_job_id", row["id"]).order("fetched_at", desc=True).limit(1).execute().data
        upload_views = stat[0]["views"] if stat else 0
        result[vid]["uploaded_views"] += upload_views
        result[vid]["uploads"].append({
            "job_id": row["id"],
            "channel_name": tc.get("channel_name"),
            "youtube_video_id": row["youtube_video_id"],
            "uploaded_at": row["uploaded_at"],
            "views": upload_views,
        })

    for vid in result:
        orig = result[vid]["original_views"] or 1
        result[vid]["multiplier"] = round(result[vid]["uploaded_views"] / orig, 2)
    return list(result.values())


@app.post("/reach/refresh")
def refresh_reach_stats(background_tasks: BackgroundTasks, user_id: str = Depends(get_user_id)):
    background_tasks.add_task(_refresh_stats, user_id)
    return {"status": "refresh_started"}


def _refresh_stats(user_id: str):
    jobs = supabase.table("upload_jobs").select("id, youtube_video_id, target_channels(oauth_credentials)").eq("user_id", user_id).eq("status", "done").not_.is_("youtube_video_id", "null").execute().data

    for job in jobs:
        try:
            tc = job.get("target_channels") or {}
            oauth_creds = tc.get("oauth_credentials")
            if isinstance(oauth_creds, str):
                oauth_creds = json.loads(oauth_creds)
            stats = get_video_stats_from_api(job["youtube_video_id"], json.dumps(oauth_creds) if isinstance(oauth_creds, dict) else oauth_creds)
            supabase.table("reach_stats").insert({
                "upload_job_id": job["id"],
                "views": stats["views"],
                "likes": stats["likes"],
                "comments": stats["comments"],
            }).execute()
        except Exception as e:
            print(f"[reach] Failed to refresh job {job['id']}: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
