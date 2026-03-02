from dotenv import load_dotenv
from datetime import datetime

from livekit.agents import (
    AgentServer,
    AgentSession,
    Agent,
    JobContext,
    cli,
)

from livekit.plugins import openai, silero

from db import sessions_collection

load_dotenv()


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions="""
You are a professional hospital receptionist.

Your role:
- Help patients with appointments, departments, doctor availability, hospital timings, visiting hours, billing desk, insurance queries, and general hospital procedures.
- Provide clear, polite, and helpful responses.
- Keep responses short and suitable for voice conversation.

Important restrictions:
- Do NOT provide medical advice.
- Do NOT diagnose conditions.
- Do NOT suggest treatments or medications.
- If asked medical questions, politely explain that you are not a medical professional and suggest speaking with a doctor.

Important behavior rules:
- Greet the caller only once at the beginning of the session.
- Do NOT repeat "How can I assist you?" after every reply.
- Only ask a follow-up question if clarification is required.
- Do not repeat closing phrases unless the conversation is ending.

If the user describes a serious emergency, advise them to contact emergency services immediately or visit the emergency department.

Stay strictly within receptionist responsibilities.
"""
        )


server = AgentServer()


def prewarm(proc):
    proc.userdata["vad"] = silero.VAD.load()


server.setup_fnc = prewarm


@server.rtc_session(agent_name="my-agent")
async def my_agent(ctx: JobContext):

    room_name = ctx.room.name
    print("ROOM NAME FROM AGENT:", room_name)

    # Initialize session document
    sessions_collection.update_one(
        {"room": room_name},
        {
            "$set": {
                "room": room_name,
                "start_time": datetime.utcnow(),
                "messages": [],
                "summary": None,
                "duration": None,
                "end_time": None,
            }
        },
        upsert=True,
    )

    session = AgentSession(
        stt=openai.STT(),
        llm=openai.LLM(model="gpt-4o-mini"),
        tts=openai.TTS(),
        vad=ctx.proc.userdata["vad"],
    )

    # ✅ Log conversation items properly
    @session.on("conversation_item_added")
    def handle_conversation_item(event):
        try:
            item = getattr(event, "item", None)
            if not item:
                return

            role = getattr(item, "role", None)
            text = getattr(item, "text_content", None)

            print("📌 ROLE:", role)
            print("📌 TEXT:", text)

            if role and text:
                sessions_collection.update_one(
                    {"room": room_name},
                    {
                        "$push": {
                            "messages": {
                                "sender": role,
                                "text": text,
                                "timestamp": datetime.utcnow(),
                            }
                        }
                    },
                )

        except Exception as e:
            print("❌ Conversation logging error:", e)

    # ✅ Proper session close handling
    @session.on("session_closed")
    def handle_session_close(event):
        print("🔒 Session closed")

        sessions_collection.update_one(
            {"room": room_name},
            {
                "$set": {
                    "end_time": datetime.utcnow()
                }
            },
        )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
    )

    await session.generate_reply(
        instructions="Greet the caller and introduce yourself as the hospital reception desk assistant."
    )


if __name__ == "__main__":
    cli.run_app(server)