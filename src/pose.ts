// On-device pose tracking: draws a live skeleton over the camera feed.
// Uses Google's pre-trained MediaPipe Pose model, running in the browser.
// Nothing proprietary lives here — the diagnosis logic is server-side.

import {
  PoseLandmarker,
  FilesetResolver,
  DrawingUtils,
} from "@mediapipe/tasks-vision";
import type { FrameSample } from "./analysis";

let stream: MediaStream | null = null;
let landmarker: PoseLandmarker | null = null;
let rafId = 0;
let recording: FrameSample[] = [];

async function getLandmarker(): Promise<PoseLandmarker> {
  if (landmarker) return landmarker;
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm"
  );
  landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU",
    },
    runningMode: "VIDEO",
    numPoses: 1,
  });
  return landmarker;
}

/** Start the camera into `video` and draw the skeleton onto `canvas`. */
export async function startCameraWithPose(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): Promise<void> {
  stopCamera(); // never leave a previous stream running
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: "environment",
      // The downswing is ~0.25s, so 30fps under-samples it. Ask for high fps.
      frameRate: { ideal: 120, min: 60 },
      width: { ideal: 1080 },
      height: { ideal: 1920 },
    },
  });
  video.srcObject = stream;
  await video.play();

  const lm = await getLandmarker();
  const ctx = canvas.getContext("2d")!;
  const draw = new DrawingUtils(ctx);
  let lastTime = -1;

  const loop = () => {
    if (!stream) return;
    canvas.width = video.videoWidth || canvas.clientWidth;
    canvas.height = video.videoHeight || canvas.clientHeight;

    if (video.currentTime !== lastTime) {
      lastTime = video.currentTime;
      const now = performance.now();
      const result = lm.detectForVideo(video, now);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const landmarks of result.landmarks) {
        draw.drawConnectors(landmarks, PoseLandmarker.POSE_CONNECTIONS, {
          color: "#39d98a",
          lineWidth: 4,
        });
        draw.drawLandmarks(landmarks, { color: "#ffffff", radius: 3 });
      }
      // Record the metric-grade (world) landmarks for post-swing analysis.
      const world = result.worldLandmarks?.[0];
      if (world) {
        recording.push({
          t: now,
          lm: world.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        });
        // Keep a rolling ~15s window so memory stays bounded.
        if (recording.length > 1800) recording.shift();
      }
    }
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
}

/** Stop the camera stream and the render loop. */
export function stopCamera(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

/** The landmark timeline recorded since the camera started (rolling window). */
export function getRecording(): FrameSample[] {
  return recording;
}

/** Clear the recorded landmark timeline (call when starting a new swing). */
export function clearRecording(): void {
  recording = [];
}
