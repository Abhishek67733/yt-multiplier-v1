"""
Run this script once per target YouTube channel to generate OAuth tokens.
It will open a browser window for you to authorize the channel, then
print the token JSON you need to paste into the Target Channels UI.

Usage:
    python3 oauth_helper.py
"""

import json
import os
from google_auth_oauthlib.flow import InstalledAppFlow
from google.oauth2.credentials import Credentials

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

# Credentials from Google Cloud Console
CLIENT_CONFIG = {
    "installed": {
        "client_id": os.environ.get("GOOGLE_CLIENT_ID", "YOUR_CLIENT_ID_HERE"),
        "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", "YOUR_CLIENT_SECRET_HERE"),
        "redirect_uris": ["http://localhost:8080"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

PORT = 8080


def main():
    print("=" * 60)
    print("YouTube OAuth Token Generator")
    print("=" * 60)
    print()
    print("REQUIREMENT: In Google Cloud Console → Credentials → your OAuth client,")
    print(f"make sure this exact URI is in 'Authorized redirect URIs':")
    print(f"  http://localhost:{PORT}")
    print()
    print("A browser window will open. Sign in with the YouTube channel")
    print("you want to upload to, then authorize the app.")
    print()

    flow = InstalledAppFlow.from_client_config(CLIENT_CONFIG, SCOPES)
    creds = flow.run_local_server(port=PORT, prompt="consent", access_type="offline")

    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": list(creds.scopes) if creds.scopes else SCOPES,
    }

    print()
    print("=" * 60)
    print("SUCCESS! Copy the JSON below and paste it into the")
    print("'OAuth Credentials JSON' field in Target Channels.")
    print("=" * 60)
    print()
    print(json.dumps(token_data, indent=2))
    print()

    # Also save to a file as backup
    out_file = os.path.join(os.path.dirname(__file__), "oauth_token_output.json")
    with open(out_file, "w") as f:
        json.dump(token_data, f, indent=2)
    print(f"(Also saved to: {out_file})")


if __name__ == "__main__":
    main()
