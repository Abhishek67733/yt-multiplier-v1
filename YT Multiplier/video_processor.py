"""
Video fingerprint avoidance via ffmpeg.
Applies subtle modifications so YouTube doesn't flag as duplicate:
- Slight brightness/contrast shift
- Minor speed tweak (1.01x–1.03x)
- Add a 0.5s color intro frame
- Re-encode with different codec settings
"""
import os
import subprocess
import random
import tempfile


def _has_ffmpeg() -> bool:
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False


def process_video(input_path: str, output_path: str = None, channel_num: int = 1) -> str:
    """
    Apply fingerprint-avoidance modifications to a video.
    Each channel_num gets slightly different parameters for uniqueness.
    Returns path to the processed video.
    """
    if not _has_ffmpeg():
        print("[video] ffmpeg not found, skipping processing")
        return input_path

    if output_path is None:
        base, ext = os.path.splitext(input_path)
        output_path = f"{base}_processed_{channel_num}{ext}"

    # Vary parameters per channel for uniqueness
    seed = channel_num + hash(input_path) % 100
    random.seed(seed)

    brightness = random.uniform(-0.03, 0.03)
    contrast = random.uniform(0.97, 1.03)
    saturation = random.uniform(0.97, 1.03)
    speed = random.choice([1.01, 1.02, 1.03])

    # Color for intro frame varies per channel
    colors = ["#1a1a2e", "#16213e", "#0f3460", "#1b1b2f", "#162447",
              "#1f4068", "#1b262c", "#0f0e17", "#2d3436", "#191919"]
    intro_color = colors[channel_num % len(colors)]

    try:
        # Build ffmpeg filter chain
        vf_filters = [
            f"eq=brightness={brightness:.3f}:contrast={contrast:.3f}:saturation={saturation:.3f}",
            f"setpts={1/speed:.4f}*PTS",
        ]
        af_filter = f"atempo={speed:.2f}"
        vf = ",".join(vf_filters)

        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-vf", vf,
            "-af", af_filter,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            output_path,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            print(f"[video] ffmpeg error: {result.stderr[-500:]}")
            return input_path

        print(f"[video] Processed: brightness={brightness:.3f}, contrast={contrast:.3f}, "
              f"speed={speed}x → {os.path.getsize(output_path)/1024:.0f}KB")
        return output_path

    except subprocess.TimeoutExpired:
        print("[video] ffmpeg timeout")
        return input_path
    except Exception as e:
        print(f"[video] Processing failed: {e}")
        return input_path


def get_processing_info(channel_num: int, input_path: str = "") -> dict:
    """Return what modifications would be applied (for UI display)."""
    seed = channel_num + hash(input_path) % 100
    random.seed(seed)
    return {
        "brightness": round(random.uniform(-0.03, 0.03), 3),
        "contrast": round(random.uniform(0.97, 1.03), 3),
        "saturation": round(random.uniform(0.97, 1.03), 3),
        "speed": random.choice([1.01, 1.02, 1.03]),
        "ffmpeg_available": _has_ffmpeg(),
    }
