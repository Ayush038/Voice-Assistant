import { useState, useRef } from "react";
import { Room, RoomEvent } from "livekit-client";
import ReactiveOrb from "../components/ReactiveOrb";
import { Mic, MicOff, PhoneOff } from "lucide-react";

export default function VoicePage() {
  const [sessionState, setSessionState] = useState("PRE");
  const [username, setUsername] = useState("");
  const [isMicOn, setIsMicOn] = useState(false);
  const [micStream, setMicStream] = useState(null);

  const [summaryData, setSummaryData] = useState(null);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const roomRef = useRef(null);
  const ROOM_NAME = `hospital-room-${username}`;

  // ==============================
  // START SESSION
  // ==============================
  const startSession = async () => {
    if (!username.trim()) return;

    try {
      setSessionState("CONNECTING");

      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/token?room=${ROOM_NAME}&identity=${username}`
      );

      if (!res.ok) throw new Error("Token generation failed");

      const data = await res.json();

      const room = new Room();
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === "audio") {
          const el = track.attach();
          el.play().catch(() => {});
        }
      });

      await room.connect(
        process.env.REACT_APP_LIVEKIT_URL,
        data.token
      );

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });

      setMicStream(stream);
      await room.localParticipant.setMicrophoneEnabled(true);

      setIsMicOn(true);
      setSessionState("LIVE");
    } catch (err) {
      console.error("Session start error:", err);
      setSessionState("ERROR");
    }
  };

  // ==============================
  // TOGGLE MIC
  // ==============================
  const toggleMic = async () => {
    if (!roomRef.current) return;

    try {
      if (isMicOn) {
        await roomRef.current.localParticipant.setMicrophoneEnabled(false);
        micStream?.getTracks().forEach((t) => t.stop());
        setMicStream(null);
        setIsMicOn(false);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });

        setMicStream(stream);
        await roomRef.current.localParticipant.setMicrophoneEnabled(true);
        setIsMicOn(true);
      }
    } catch (err) {
      console.error("Mic toggle error:", err);
    }
  };

  // ==============================
  // END SESSION
  // ==============================
  const endSession = async () => {
    if (!roomRef.current || isGeneratingSummary) return;

    try {
      setIsGeneratingSummary(true);

      micStream?.getTracks().forEach((t) => t.stop());
      await roomRef.current.localParticipant.setMicrophoneEnabled(false);

      await roomRef.current.disconnect();
      roomRef.current = null;

      setMicStream(null);
      setIsMicOn(false);

      await new Promise((resolve) => setTimeout(resolve, 600));

      const res = await fetch(
        `${process.env.REACT_APP_BACKEND_URL}/generate-summary/${ROOM_NAME}`,
        { method: "POST" }
      );

      if (!res.ok) {
        setSessionState("ERROR");
        return;
      }

      const data = await res.json();

      setSummaryData({
        ...data.summary,
        duration: data.duration,
      });

      setSessionState("SUMMARY");
    } catch (err) {
      console.error("Session end failed:", err);
      setSessionState("ERROR");
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  const resetSession = () => {
    setSummaryData(null);
    setUsername("");
    setSessionState("PRE");
  };

  // ==========================================================
  // UI
  // ==========================================================
  return (
    <div className="voice-wrapper">
      <div className="glass-frame">

        {/* HEADER (Hidden in PRE) */}
        {sessionState !== "PRE" && (
          <div className="header">
            {/* <button className="back-btn">←</button> */}

            <h1>
              {sessionState === "SUMMARY"
                ? "Session Summary"
                : "Hospital AI Assistant"}
            </h1>

            {sessionState === "LIVE" && (
              <div className="live-indicator">
                <span className="live-dot" />
                Live
              </div>
            )}
          </div>
        )}

        {/* ================= PRE ================= */}
        {sessionState === "PRE" && (
          <div className="pre-layout">

            <h1 className="pre-title">
              City Hospital AI Assistant
            </h1>

            <div className="orb-wrapper">
              <ReactiveOrb isLive={false} micStream={null} />
            </div>

            <div className="pre-card">
              <input
                placeholder="Enter your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />

              <button
                className="primary-btn"
                onClick={startSession}
              >
                Start Conversation
              </button>
            </div>

          </div>
        )}

        {/* ================= LIVE ================= */}
        {sessionState === "LIVE" && (
          <>
            <div className="live-layout">

              <div className="orb-wrapper">
                <ReactiveOrb
                  isLive={true}
                  micStream={micStream}
                />
              </div>

              <p className="live-status">
                {isMicOn ? "Listening..." : "Mic Muted"}
              </p>

              <div className="live-info">
                <span className="info-dot" />
                <div>
                  <strong>AI is ready to assist you</strong>
                  <p>You can speak now...</p>
                </div>
              </div>

            </div>

            <div className="live-controls">

              <button
                onClick={toggleMic}
                className={`control-btn ${isMicOn ? "active" : ""}`}
              >
                {isMicOn ? <Mic size={20} /> : <MicOff size={20} />}
                <span>{isMicOn ? "Mute" : "Unmute"}</span>
              </button>

              <button
                onClick={endSession}
                className="end-call-btn"
                disabled={isGeneratingSummary}
              >
                <PhoneOff size={18} />
                End Call
              </button>

            </div>
          </>
        )}

        {/* ================= SUMMARY ================= */}
        {sessionState === "SUMMARY" && summaryData && (
          <div className="summary-layout">

            <h1 className="summary-title">Session Summary</h1>

            <div className="orb-wrapper">
              <ReactiveOrb isLive={false} micStream={null} />
            </div>

            <div className="summary-panel">

              <div className="summary-duration">
                {summaryData.duration}
              </div>
              <div className="summary-content">
              {/* Doctor Summary */}
              <div className="summary-block">
                <div className="summary-block-header">
                  Doctor Summary
                </div>
                <p className="summary-text">
                  {summaryData.summary}
                </p>
              </div>

              {/* Topics */}
              {summaryData.topics?.length > 0 && (
                <div className="summary-block">
                  <div className="summary-block-header">
                    Topics Discussed
                  </div>
                  <ul>
                    {summaryData.topics.map((topic, i) => (
                      <li key={i}>{topic}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Items */}
              {summaryData.action_items?.length > 0 && (
                <div className="summary-block">
                  <div className="summary-block-header">
                    Follow-Up Advice
                  </div>
                  <ul>
                    {summaryData.action_items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
              </div>
              <button
                className="primary-btn"
                onClick={resetSession}
              >
                Start New Session
              </button>

            </div>
          </div>
        )}

        {sessionState === "ERROR" && (
          <p className="error-text">
            Something went wrong
          </p>
        )}

      </div>
    </div>
  );
}