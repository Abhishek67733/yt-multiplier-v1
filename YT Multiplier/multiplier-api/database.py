import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.dirname(__file__), "multiplier.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS source_channels (
                id TEXT PRIMARY KEY,
                name TEXT,
                url TEXT NOT NULL,
                thumbnail TEXT,
                added_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS target_channels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_name TEXT NOT NULL,
                channel_id TEXT,
                oauth_credentials TEXT,
                upload_count INTEGER DEFAULT 0,
                added_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS shorts (
                video_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                title TEXT,
                url TEXT,
                description TEXT,
                views_at_discovery INTEGER DEFAULT 0,
                views_last_check INTEGER DEFAULT 0,
                views_delta INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                duration INTEGER DEFAULT 0,
                thumbnail TEXT,
                published_at TEXT,
                last_checked TEXT DEFAULT (datetime('now')),
                status TEXT DEFAULT 'monitoring',
                velocity_score REAL DEFAULT 0,
                growth_rate REAL DEFAULT 0,
                trend TEXT DEFAULT 'flat',
                scan_history TEXT DEFAULT '[]',
                FOREIGN KEY (channel_id) REFERENCES source_channels(id)
            );

            CREATE TABLE IF NOT EXISTS upload_jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                target_channel_id INTEGER NOT NULL,
                caption_variation TEXT,
                scheduled_at TEXT,
                uploaded_at TEXT,
                youtube_video_id TEXT,
                status TEXT DEFAULT 'pending',
                error_message TEXT,
                FOREIGN KEY (video_id) REFERENCES shorts(video_id),
                FOREIGN KEY (target_channel_id) REFERENCES target_channels(id),
                UNIQUE (video_id, target_channel_id)
            );

            CREATE TABLE IF NOT EXISTS reach_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                upload_job_id INTEGER NOT NULL,
                views INTEGER DEFAULT 0,
                likes INTEGER DEFAULT 0,
                comments INTEGER DEFAULT 0,
                fetched_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (upload_job_id) REFERENCES upload_jobs(id)
            );

            CREATE TABLE IF NOT EXISTS ai_titles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                title TEXT NOT NULL,
                generated_at TEXT DEFAULT (datetime('now')),
                FOREIGN KEY (video_id) REFERENCES shorts(video_id)
            );

            CREATE TABLE IF NOT EXISTS title_performance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                title_used TEXT NOT NULL,
                upload_job_id INTEGER,
                views_gained INTEGER DEFAULT 0,
                updated_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS webhook_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                original_title TEXT,
                new_title TEXT,
                caption TEXT,
                channel_number INTEGER,
                channel_name TEXT,
                total_channels INTEGER,
                file_size_bytes INTEGER DEFAULT 0,
                video_processed INTEGER DEFAULT 0,
                scheduled_at TEXT,
                webhook_status INTEGER,
                webhook_url TEXT,
                velocity_score REAL DEFAULT 0,
                trend TEXT,
                thumbnail TEXT,
                error_message TEXT,
                status TEXT DEFAULT 'sent',
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)

        # Migrations for existing databases
        migrations = [
            "ALTER TABLE shorts ADD COLUMN published_at TEXT",
            "ALTER TABLE target_channels ADD COLUMN last_upload_at TEXT",
            "ALTER TABLE shorts ADD COLUMN velocity_score REAL DEFAULT 0",
            "ALTER TABLE shorts ADD COLUMN growth_rate REAL DEFAULT 0",
            "ALTER TABLE shorts ADD COLUMN trend TEXT DEFAULT 'flat'",
            "ALTER TABLE shorts ADD COLUMN scan_history TEXT DEFAULT '[]'",
            # Uploaded video tracking for real stats
            "ALTER TABLE webhook_logs ADD COLUMN uploaded_video_id TEXT",
            "ALTER TABLE webhook_logs ADD COLUMN uploaded_views INTEGER DEFAULT 0",
            "ALTER TABLE webhook_logs ADD COLUMN uploaded_likes INTEGER DEFAULT 0",
            "ALTER TABLE webhook_logs ADD COLUMN stats_updated_at TEXT",
        ]
        for sql in migrations:
            try:
                conn.execute(sql)
            except Exception:
                pass


if __name__ == "__main__":
    init_db()
    print(f"Database initialised at {DB_PATH}")
