import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

export default function ReactiveOrb({ isLive, micStream }) {
  const [volume, setVolume] = useState(0);
  const animationRef = useRef(null);

  useEffect(() => {
    if (!micStream) return;

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(micStream);
    const analyser = audioContext.createAnalyser();

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);

    const tick = () => {
      analyser.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }

      const avg = sum / bufferLength;
      setVolume(avg / 255);

      animationRef.current = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationRef.current);
      audioContext.close();
    };
  }, [micStream]);

  const reactiveScale = 1 + volume * 0.8;

  return (
    <motion.div
      className="orb-container"
      animate={{ scale: isLive ? reactiveScale : 1 }}
      transition={{ type: "spring", stiffness: 100, damping: 18 }}
    >
      {/* OUTER BLOOM */}
      <div className="orb-bloom" />

      {/* COLOR SPLIT LIGHT */}
      <div className="orb-split" />

      {/* HORIZONTAL ENERGY WAVE */}
      {isLive && <div className="orb-wave" />}

      {/* ROTATING RING */}
      <motion.div
        className="orb-ring"
        animate={{ rotate: isLive ? 360 : 0 }}
        transition={{
          duration: 10,
          repeat: isLive ? Infinity : 0,
          ease: "linear",
        }}
      />

      {/* CORE */}
      <div className="orb-core" />

      {/* FLOOR GLOW */}
      <div className="orb-floor-glow" />
    </motion.div>
  );
}