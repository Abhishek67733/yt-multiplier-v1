"""
Generates AI caption and title variations for re-uploaded Shorts.
Niche-aware: understands medical/NEET/education content for Indian audience.
"""
import os
from openai import OpenAI

def _client():
    return OpenAI(api_key=os.getenv("OPENAI_API_KEY"))


# ── Niche detection ──────────────────────────────────────────────────────────

NICHE_KEYWORDS = {
    "medical": ["neet", "aiims", "mbbs", "doctor", "medical", "anatomy", "stethoscope",
                 "hospital", "pg", "medicine", "surgery", "health", "patient", "clinical"],
    "education": ["topper", "study", "exam", "marks", "college", "preparation", "mentor",
                   "student", "coaching", "rank", "jee", "upsc", "board", "class"],
    "motivation": ["motivation", "inspire", "hustle", "grind", "success", "dream",
                    "believe", "struggle", "journey", "achieve", "goal"],
}

NICHE_HASHTAGS = {
    "medical": ["#NEET", "#NEET2026", "#AIIMS", "#MBBS", "#MedicalStudent", "#Doctor", "#Shorts"],
    "education": ["#StudyMotivation", "#Topper", "#ExamPrep", "#Student", "#Shorts"],
    "motivation": ["#Motivation", "#Success", "#Inspiration", "#Hustle", "#Shorts"],
    "general": ["#Viral", "#Trending", "#Shorts"],
}


def _detect_niche(title: str, description: str = "") -> str:
    """Detect content niche from title + description keywords."""
    text = f"{title} {description}".lower()
    scores = {}
    for niche, keywords in NICHE_KEYWORDS.items():
        scores[niche] = sum(1 for kw in keywords if kw in text)
    best = max(scores, key=scores.get)
    return best if scores[best] >= 1 else "general"


def _detect_language(title: str) -> str:
    """Detect if title uses Hinglish (Hindi words in English script)."""
    hinglish_markers = ["kya", "hai", "ka", "ki", "ko", "se", "ne", "mein",
                         "bhi", "nahi", "aur", "ye", "wo", "yeh", "kaise",
                         "hoga", "hain", "tha", "wala", "ji"]
    words = title.lower().split()
    hindi_count = sum(1 for w in words if w in hinglish_markers)
    return "hinglish" if hindi_count >= 2 else "english"


# ── Caption generation ───────────────────────────────────────────────────────

SYSTEM_PROMPT_CAPTION = """You are a YouTube Shorts caption writer specializing in Indian educational and medical content.
Your job is to rewrite a caption/description for a Short video in a fresh way.

Rules:
- Keep the same overall message and hook as the original
- Change the wording significantly so it reads as UNIQUE content
- Keep it concise (under 300 characters for the main hook, then 2-3 hashtag lines)
- Match the tone: if original is hype/energetic, keep it hype; if calm, keep it calm
- If the original uses Hinglish (Hindi in English script), write in Hinglish too
- Use niche-relevant hashtags (medical: #NEET #AIIMS; education: #StudyMotivation etc.)
- Always include #Shorts as one of the hashtags
- Do NOT use the exact same sentences as the original
- Output ONLY the caption text, nothing else"""


def generate_caption_variation(original_title: str, original_description: str) -> str:
    """Generate one unique caption variation based on the original title + description."""
    niche = _detect_niche(original_title, original_description)
    lang = _detect_language(original_title)
    hashtags = " ".join(NICHE_HASHTAGS.get(niche, NICHE_HASHTAGS["general"]))

    user_msg = f"""Original title: {original_title}

Original description/caption:
{original_description or '(no description provided)'}

Content niche: {niche}
Language style: {lang}
Suggested hashtags: {hashtags}

Write a fresh variation of this caption for a re-upload of the same Short."""

    response = _client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT_CAPTION},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=400,
        temperature=0.85,
    )

    return response.choices[0].message.content.strip()


# ── Title generation ─────────────────────────────────────────────────────────

SYSTEM_PROMPT_TITLE = """You are a YouTube Shorts title writer specializing in Indian educational, medical, and motivational content.

Rules:
- Rewrite the title with different wording but keep the CORE HOOK that makes people click
- Keep it under 70 characters total
- If the original uses Hinglish (Hindi in English script), write in Hinglish too
- Use emotional triggers that work for Indian audience: curiosity, FOMO, aspiration
- Include 1-2 relevant emojis that match the tone
- Always end with #Shorts
- For medical/NEET content: can mention NEET, AIIMS, MBBS, Doctor etc.
- For education content: can mention topper, exam, marks etc.
- Output ONLY the title, nothing else"""


def generate_title_variation(original_title: str, niche: str = None) -> str:
    """Generate a niche-aware title variation with emotional hooks."""
    if niche is None:
        niche = _detect_niche(original_title)
    lang = _detect_language(original_title)

    user_msg = f"""Original title: {original_title}
Niche: {niche}
Language: {lang}

Rewrite this title with a fresh hook."""

    response = _client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT_TITLE},
            {"role": "user", "content": user_msg},
        ],
        max_tokens=80,
        temperature=0.8,
    )
    title = response.choices[0].message.content.strip()
    if "#Shorts" not in title and "#shorts" not in title:
        title = title.rstrip() + " #Shorts"
    return title
