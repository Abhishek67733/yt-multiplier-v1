"""
APScheduler jobs:
  - Every 6 hours: scan source channels for viral Shorts (multi-scan trending)
  - Every 30 minutes: refresh reach stats for uploaded videos
  - Every 5 minutes: execute any pending upload jobs whose scheduled_at has passed
"""
import os
import httpx
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

def _get_api_base():
    """Resolve API base URL: env var > Railway domain > localhost fallback."""
    explicit = os.getenv("MULTIPLIER_API_BASE_URL", "")
    if explicit:
        return explicit
    domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")
    if domain:
        return f"https://{domain}"
    port = os.getenv("PORT", "8001")
    return f"http://localhost:{port}"

API_BASE = _get_api_base()

scheduler = BackgroundScheduler()


def _call(method: str, path: str):
    try:
        resp = httpx.request(method, f"{API_BASE}{path}", timeout=300)
        resp.raise_for_status()
        print(f"[scheduler] {method} {path} → {resp.status_code}")
    except Exception as e:
        print(f"[scheduler] Error calling {path}: {e}")


def job_scan():
    _call("POST", "/shorts/scan")


def job_refresh_reach():
    _call("POST", "/reach/refresh")


def job_refresh_uploaded_stats():
    """Refresh real views/likes for all uploaded copies every 3 hours."""
    _call("POST", "/upload/refresh-stats")


def job_execute_due_uploads():
    """Find pending jobs whose scheduled_at <= now and execute them."""
    from datetime import datetime, timezone
    from database import db

    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        due_jobs = conn.execute(
            """SELECT id FROM upload_jobs
               WHERE status='pending' AND scheduled_at <= ?""",
            (now,),
        ).fetchall()

    for job in due_jobs:
        try:
            resp = httpx.post(f"{API_BASE}/upload/execute/{job['id']}", timeout=30)
            resp.raise_for_status()
            print(f"[scheduler] Triggered job {job['id']}")
        except Exception as e:
            print(f"[scheduler] Failed to trigger job {job['id']}: {e}")


def start_scheduler():
    scheduler.add_job(job_scan, IntervalTrigger(hours=6), id="scan", replace_existing=True)
    scheduler.add_job(job_refresh_reach, IntervalTrigger(minutes=30), id="reach_refresh", replace_existing=True)
    scheduler.add_job(job_execute_due_uploads, IntervalTrigger(minutes=5), id="execute_uploads", replace_existing=True)
    scheduler.add_job(job_refresh_uploaded_stats, IntervalTrigger(hours=3), id="uploaded_stats_refresh", replace_existing=True)
    scheduler.start()
    print("[scheduler] Started — scan every 6h, reach refresh every 30min, upload check every 5min, uploaded stats refresh every 3h")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
