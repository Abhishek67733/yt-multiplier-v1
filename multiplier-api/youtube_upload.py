"""
YouTube Data API v3 upload logic.
Each target channel has its own OAuth credentials stored in the DB.
"""
import os
import json
import tempfile
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def _build_youtube_client(oauth_credentials_json: str):
    """Build an authenticated YouTube API client from stored OAuth JSON."""
    creds_data = json.loads(oauth_credentials_json)
    creds = Credentials(
        token=creds_data.get("token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=creds_data.get("token_uri", "https://oauth2.googleapis.com/token"),
        client_id=creds_data.get("client_id"),
        client_secret=creds_data.get("client_secret"),
        scopes=SCOPES,
    )
    # Refresh if expired
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build("youtube", "v3", credentials=creds), creds


def upload_short(
    video_path: str,
    title: str,
    description: str,
    oauth_credentials_json: str,
) -> dict:
    """
    Upload an MP4 file as a YouTube Short to the channel authenticated by oauth_credentials_json.
    Returns dict with youtube_video_id and updated credentials (token may have refreshed).
    """
    youtube, creds = _build_youtube_client(oauth_credentials_json)

    body = {
        "snippet": {
            "title": title[:100],  # YouTube max 100 chars
            "description": description[:5000],
            "categoryId": "22",  # People & Blogs
            "tags": ["Shorts", "viral", "trending"],
        },
        "status": {
            "privacyStatus": "public",
            "madeForKids": False,
            "selfDeclaredMadeForKids": False,
        },
    }

    media = MediaFileUpload(video_path, mimetype="video/mp4", resumable=True)
    insert_request = youtube.videos().insert(
        part=",".join(body.keys()),
        body=body,
        media_body=media,
    )

    response = None
    while response is None:
        _, response = insert_request.next_chunk()

    video_id = response["id"]

    # Return updated creds so the caller can persist the refreshed token
    updated_creds = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
    }

    return {"youtube_video_id": video_id, "updated_credentials": updated_creds}


def get_video_stats_from_api(youtube_video_id: str, oauth_credentials_json: str) -> dict:
    """
    Fetch current stats (views, likes, comments) for an uploaded video.
    """
    youtube, _ = _build_youtube_client(oauth_credentials_json)
    resp = youtube.videos().list(
        part="statistics",
        id=youtube_video_id,
    ).execute()

    items = resp.get("items", [])
    if not items:
        return {"views": 0, "likes": 0, "comments": 0}

    stats = items[0].get("statistics", {})
    return {
        "views": int(stats.get("viewCount", 0)),
        "likes": int(stats.get("likeCount", 0)),
        "comments": int(stats.get("commentCount", 0)),
    }
