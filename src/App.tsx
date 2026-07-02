import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  clearRecording,
  getRecording,
  startCameraWithPose,
  stopCamera,
} from "./pose";
import { computeMetrics, type SwingMetrics } from "./analysis";
import {
  stubDiagnosis,
  type CameraView,
  type Diagnosis,
  type PoseStatus,
  type Screen,
} from "./types";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [view, setView] = useState<CameraView>("face-on");
  const [pose, setPose] = useState<PoseStatus>("idle");
  const [diagnosis, setDiagnosis] = useState<Diagnosis | null>(null);
  const [metrics, setMetrics] = useState<SwingMetrics | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Start / stop the camera as we enter / leave the record screen.
  useEffect(() => {
    if (screen !== "record") return;
    let cancelled = false;
    setPose("loading");
    clearRecording();
    (async () => {
      try {
        if (videoRef.current && canvasRef.current) {
          await startCameraWithPose(videoRef.current, canvasRef.current);
          if (!cancelled) setPose("streaming");
        }
      } catch {
        if (!cancelled) setPose("error");
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [screen]);

  const analyze = async () => {
    const samples = getRecording();
    stopCamera();
    setScreen("analyzing");
    // Angles are computed on-device; interpretation (the diagnosis) will come
    // from the server. Stubbed until that endpoint exists.
    setMetrics(computeMetrics(samples));
    const d = await stubDiagnosis();
    setDiagnosis(d);
    setScreen("result");
  };

  return (
    <main className="app">
      {screen === "home" && (
        <section>
          <h1 className="title">Pocket Swing</h1>
          <p className="subtitle">
            Your pocket coach. Film one swing, find the one fix.
          </p>
          <div className="card">
            <h3>This week's focus</h3>
            <p className="muted">Record a swing to start your plan.</p>
          </div>
          <button className="primary" onClick={() => setScreen("record")}>
            Record a swing
          </button>
        </section>
      )}

      {screen === "record" && (
        <section>
          <div className="toggle">
            <button
              className={view === "face-on" ? "pill active" : "pill"}
              onClick={() => setView("face-on")}
            >
              Face-on
            </button>
            <button
              className={view === "down-the-line" ? "pill active" : "pill"}
              onClick={() => setView("down-the-line")}
            >
              Down the line
            </button>
          </div>

          <div className="stage">
            <video ref={videoRef} autoPlay muted playsInline />
            <canvas ref={canvasRef} />
          </div>

          <p className="muted center status">
            {pose === "idle" && "Camera not started"}
            {pose === "loading" && "Starting camera and tracking…"}
            {pose === "streaming" && "Line yourself up and swing"}
            {pose === "error" && "Camera error — check permissions"}
          </p>

          <button className="primary" onClick={analyze}>
            Analyze this swing
          </button>
          <button className="link" onClick={() => setScreen("home")}>
            Cancel
          </button>
        </section>
      )}

      {screen === "analyzing" && (
        <section className="center analyzing">
          <h2>Analyzing your swing…</h2>
          <p className="muted">Finding the one thing costing you the most.</p>
        </section>
      )}

      {screen === "result" && diagnosis && (
        <section>
          <p className="muted label">YOUR #1 FIX</p>
          <h1 className="result-title">{diagnosis.topFlaw.title}</h1>
          <div className="card">
            <p>{diagnosis.topFlaw.explanation}</p>
          </div>
          {metrics && (
            <div className="card">
              <h3 className="no-margin-top">Your numbers</h3>
              {metrics.rotationConfidence === "low" && (
                <p className="muted metric-label">
                  Filmed down-the-line — turn numbers are approximate. Film
                  face-on for accurate rotation.
                </p>
              )}
              <div className="metrics">
                <div>
                  <span className="metric-value">{metrics.shoulderTurnMax}°</span>
                  <span className="muted metric-label">Shoulder turn</span>
                </div>
                <div>
                  <span className="metric-value">{metrics.hipTurnMax}°</span>
                  <span className="muted metric-label">Hip turn</span>
                </div>
                <div>
                  <span className="metric-value">{metrics.xFactorAtTop}°</span>
                  <span className="muted metric-label">X-factor at top</span>
                </div>
                <div>
                  <span className="metric-value">{metrics.spineTiltRange}°</span>
                  <span className="muted metric-label">Spine tilt range</span>
                </div>
              </div>
            </div>
          )}
          <h3>Do this</h3>
          {diagnosis.drills.map((drill) => (
            <div className="card" key={drill.id}>
              <strong>{drill.title}</strong>
              <p className="muted no-margin">{drill.cue}</p>
            </div>
          ))}
          <button className="primary" onClick={() => setScreen("home")}>
            Back to home
          </button>
        </section>
      )}
    </main>
  );
}
