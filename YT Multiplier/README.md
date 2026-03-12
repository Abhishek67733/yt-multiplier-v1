# YT Multiplier

Automate YouTube Shorts repurposing across multiple channels. Monitor source channels for viral Shorts, generate AI-powered title/caption variations, and upload directly to your connected YouTube channels via OAuth.

## Architecture

```
multiplier-api/          # FastAPI backend (Python) — deployed on Railway
multiplier-ui/           # Next.js frontend (TypeScript) — deployed on Vercel
local-yt-api/            # Local yt-dlp utility for video downloads
Dockerfile               # Railway container build
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | FastAPI, Python 3.11, APScheduler |
| **Frontend** | Next.js 14 (App Router), Tailwind CSS, TypeScript |
| **Database** | Supabase (PostgreSQL) |
| **Auth** | NextAuth (Google OAuth) + YouTube OAuth for uploads |
| **AI** | OpenAI GPT-4 for title/caption generation |
| **Video** | yt-dlp for downloads, FFmpeg for processing |
| **Hosting** | Railway (backend), Vercel (frontend) |

## Key Features

- **Source Channel Monitoring** — Add any YouTube channel, auto-scan for new Shorts
- **Direct YouTube Upload** — OAuth-based, no webhooks needed. Authenticate your Google account and upload directly
- **AI Title/Caption Generation** — Each target channel gets unique variations via GPT-4
- **Multi-Channel Publishing** — Connect unlimited YouTube channels as upload targets
- **Smart Scheduling** — IST peak-hour scheduling (12-1 PM, 6-9 PM)
- **Upload Queue** — Visual queue with status tracking, retry logic
- **Reach Stats** — Track views, likes, and performance across all uploads

## Project Structure

```
multiplier-api/
  main.py               # FastAPI app — all API endpoints
  database.py            # Supabase client singleton
  caption_ai.py          # OpenAI-powered title/caption generation
  video_processor.py     # FFmpeg video processing
  youtube_upload.py      # YouTube Data API upload logic
  oauth_helper.py        # Google OAuth flow helper
  yt_client.py           # YouTube channel/video data fetching
  scheduler.py           # APScheduler background jobs
  requirements.txt       # Python dependencies

multiplier-ui/
  app/
    page.tsx             # Landing page with animated hero
    layout.tsx           # Root layout with providers
    providers.tsx        # SessionProvider + user identification
    login/page.tsx       # Google OAuth login page
    dashboard/page.tsx   # Main dashboard with tab navigation
    api/auth/[...nextauth]/route.ts  # NextAuth config with email whitelist
    components/
      SourceChannelsPage.tsx    # Add/manage source channels
      TargetChannelsPage.tsx    # Connect YouTube channels via OAuth
      MultiplierRoomPage.tsx    # View shorts, generate titles, queue uploads
      UploadQueuePage.tsx       # Monitor upload queue status
      ReachStatsPage.tsx        # View reach/performance stats
      ui/                       # Reusable UI components
  middleware.ts          # Auth middleware — protects /dashboard

local-yt-api/
  main.py               # Standalone yt-dlp download API
  fetch_chat.py          # YouTube live chat fetcher
```

## Environment Variables

### Backend (Railway)

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
YT_DLP_API_BASE_URL=
OPENAI_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FRONTEND_URL=
OAUTH_REDIRECT_URI=
```

### Frontend (Vercel)

```env
NEXT_PUBLIC_API_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
ALLOWED_EMAILS=       # Comma-separated list of authorized emails
```

## API Flow

```
1. Add Source Channel → GET /channels/source
2. Scan for Shorts   → POST /shorts/scan
3. Generate Titles   → POST /shorts/{id}/generate-title
4. Connect Target    → GET /auth/youtube/connect (OAuth)
5. Queue Upload      → POST /upload/queue
6. Auto-Execute      → Scheduler runs every 5 min
7. Track Stats       → GET /reach/stats
```

## Local Development

```bash
# Backend
cd multiplier-api
pip install -r requirements.txt
uvicorn main:app --reload --port 8001

# Frontend
cd multiplier-ui
npm install
npm run dev    # runs on port 3001
```

## Deployment

- **Backend**: Auto-deploys on Railway from `main` branch (Dockerfile build)
- **Frontend**: Auto-deploys on Vercel from `main` branch
- **Database**: Supabase managed PostgreSQL (no migrations needed — tables auto-created)
