from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from livekit.api import (
    AccessToken,
    VideoGrants,
    RoomConfiguration,
    RoomAgentDispatch,
)
from openai import OpenAI
from datetime import datetime
import os
import json
from dotenv import load_dotenv

from db import sessions_collection  # Mongo connection

load_dotenv()

app = FastAPI()
client = OpenAI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------
# TOKEN ENDPOINT
# ---------------------------
@app.get("/token")
def get_token(room: str, identity: str):

    token = AccessToken(
        os.getenv("LIVEKIT_API_KEY"),
        os.getenv("LIVEKIT_API_SECRET"),
    ).with_identity(identity).with_grants(
        VideoGrants(
            room_join=True,
            room=room,
        )
    )

    room_config = RoomConfiguration(
        agents=[
            RoomAgentDispatch(agent_name="my-agent")
        ]
    )

    token = token.with_room_config(room_config)

    return {"token": token.to_jwt()}


# ---------------------------
# GENERATE SUMMARY
# ---------------------------
@app.post("/generate-summary/{room}")
async def generate_summary(room: str):

    session_data = sessions_collection.find_one({"room": room})

    if not session_data:
        raise HTTPException(status_code=404, detail="Session not found")

    messages = session_data.get("messages", [])

    if not messages:
        raise HTTPException(status_code=400, detail="No messages in session")

    # Safely construct conversation text
    conversation_lines = []
    for m in messages:
        sender = m.get("sender")
        text = m.get("text")

        if sender and text:
            conversation_lines.append(f"{sender}: {text}")

    if not conversation_lines:
        raise HTTPException(status_code=400, detail="No valid messages found")

    conversation_text = "\n".join(conversation_lines)

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": """
Generate a structured hospital call summary in JSON format:

{
  "summary": "short paragraph",
  "topics": ["topic1", "topic2"],
  "action_items": ["item1", "item2"],
  "sentiment": "positive | neutral | negative"
}
"""
                },
                {
                    "role": "user",
                    "content": conversation_text
                }
            ],
            response_format={"type": "json_object"}
        )

        summary_json_str = response.choices[0].message.content
        summary_json = json.loads(summary_json_str)

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summary generation failed: {str(e)}")

    # Duration calculation
    start_time = session_data.get("start_time")
    end_time = datetime.utcnow()

    duration_str = None

    if start_time:
        duration_seconds = int((end_time - start_time).total_seconds())
        minutes = duration_seconds // 60
        seconds = duration_seconds % 60
        duration_str = f"{minutes}m {seconds}s"

    # Update Mongo document
    sessions_collection.update_one(
        {"room": room},
        {
            "$set": {
                "summary": summary_json,
                "duration": duration_str,
                "end_time": end_time
            }
        }
    )

    return {
        "summary": summary_json,
        "duration": duration_str
    }


# ---------------------------
# GET ALL SESSIONS
# ---------------------------
@app.get("/sessions")
def get_sessions():
    sessions = list(sessions_collection.find({}, {"_id": 0}))
    return sessions