#!/usr/bin/env python3
"""Standalone script to fetch YouTube live chat"""
import sys
import json
import pytchat
import time

def fetch_chat(video_id, max_messages=300, timeout=45):
    messages = []
    try:
        chat = pytchat.create(video_id=video_id)
        start = time.time()

        while chat.is_alive() and time.time() - start < timeout:
            for c in chat.get().sync_items():
                messages.append({
                    "author": c.author.name,
                    "message": c.message,
                    "time": str(c.datetime)
                })
                if len(messages) >= max_messages:
                    break
            if len(messages) >= max_messages:
                break
            time.sleep(0.3)
    except Exception as e:
        pass

    return messages

if __name__ == "__main__":
    video_id = sys.argv[1] if len(sys.argv) > 1 else ""
    max_msgs = int(sys.argv[2]) if len(sys.argv) > 2 else 300

    messages = fetch_chat(video_id, max_msgs)
    print(json.dumps(messages))
