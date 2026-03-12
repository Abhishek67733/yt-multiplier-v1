import os
from supabase import create_client, Client

# ---------------------------------------------------------------------------
# Supabase client (singleton)
# ---------------------------------------------------------------------------

SUPABASE_URL: str = os.environ.get(
    "SUPABASE_URL",
    "https://qesplajqdahlcigoapmh.supabase.co",
)
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlc3BsYWpxZGFobGNpZ29hcG1oIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI1NDIyNiwiZXhwIjoyMDg4ODMwMjI2fQ.dn6Nz9BCsYWaeGt1MhXhBaMWEepIxrcS1lIy1usvB34",
)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_or_create_user(
    email: str,
    name: str | None = None,
    avatar_url: str | None = None,
) -> str:
    """Upsert a user by email and return their UUID.

    If a row with the given email already exists it is updated with any new
    name / avatar_url values supplied.  Otherwise a new row is inserted.

    Returns the user's ``id`` (UUID).
    """
    row = {"email": email}
    if name is not None:
        row["name"] = name
    if avatar_url is not None:
        row["avatar_url"] = avatar_url

    result = (
        supabase.table("users")
        .upsert(row, on_conflict="email")
        .execute()
    )

    return result.data[0]["id"]
