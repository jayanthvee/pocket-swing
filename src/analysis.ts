// Swing angle analysis from pose landmarks.
//
// This is commodity geometry (joint angles from keypoints) — the interpretation
// layer (what the numbers mean, thresholds, drills) lives server-side.
//
// Landmarks are MediaPipe world landmarks (meters, hip-centered), 33 points.

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

export interface FrameSample {
  t: number; // ms timestamp
  lm: Point3[]; // 33 world landmarks
}

// MediaPipe pose landmark indices we use.
const NOSE = 0;
const L_SHOULDER = 11;
const R_SHOULDER = 12;
const L_HIP = 23;
const R_HIP = 24;
const L_WRIST = 15;
const R_WRIST = 16;

export interface SwingPhases {
  address: number; // frame indices into the sample buffer
  top: number;
  impact: number;
  finish: number;
}

export interface SwingMetrics {
  /** Detected camera view at address. */
  view: "face-on" | "down-the-line";
  /** Rotation metrics need depth; from a DTL view z-noise dominates. */
  rotationConfidence: "high" | "low";
  /** Peak shoulder-line rotation vs address, degrees (about vertical axis). */
  shoulderTurnMax: number;
  /** Peak hip-line rotation vs address, degrees. */
  hipTurnMax: number;
  /** Shoulder–hip separation at the top of the backswing, degrees. */
  xFactorAtTop: number;
  /** Peak lateral head drift vs address, as a fraction of shoulder width. */
  headSwayMax: number;
  /** Trunk side-tilt range through the swing, degrees (in the camera plane). */
  spineTiltRange: number;
  phases: SwingPhases;
  frameCount: number;
  durationMs: number;
}

const deg = (rad: number) => (rad * 180) / Math.PI;

/** Yaw (rotation about the vertical axis) of the line a→b, in degrees. */
function lineYaw(a: Point3, b: Point3): number {
  return deg(Math.atan2(b.z - a.z, b.x - a.x));
}

/** Smallest signed difference between two angles in degrees. */
function angleDelta(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

function mid(a: Point3, b: Point3): Point3 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/** Trunk side-tilt vs vertical in the camera (x,y) plane, degrees. */
function trunkTilt(lm: Point3[]): number {
  const hips = mid(lm[L_HIP], lm[R_HIP]);
  const shoulders = mid(lm[L_SHOULDER], lm[R_SHOULDER]);
  return deg(Math.atan2(shoulders.x - hips.x, hips.y - shoulders.y));
}

/** Median filter to suppress single-frame tracking glitches (motion blur). */
function medianFilter(xs: number[], k = 5): number[] {
  const half = Math.floor(k / 2);
  return xs.map((_, i) => {
    const w = xs.slice(Math.max(0, i - half), i + half + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

/**
 * Segment the swing. MediaPipe world y increases downward, so "highest
 * hands" = smallest y.
 *
 * Anchor on IMPACT first: nothing moves the hands faster than the downswing,
 * so the frame of peak downward wrist velocity is unambiguous — unlike wrist
 * height, which peaks at BOTH the top and the finish (anchoring on the global
 * height peak grabs the finish and mislabels everything). Then top = highest
 * hands shortly before impact; address = last frame before top with hands
 * still low. Validated against pro reference footage.
 */
export function detectPhases(samples: FrameSample[]): SwingPhases {
  const n = samples.length;
  const wristY = medianFilter(
    samples.map((s) => Math.min(s.lm[L_WRIST].y, s.lm[R_WRIST].y))
  );

  // Impact: peak downward wrist velocity.
  let impact = 1;
  for (let i = 1; i < n - 1; i++) {
    if (wristY[i + 1] - wristY[i] > wristY[impact] - wristY[impact - 1]) {
      impact = i + 1;
    }
  }

  // Top: highest hands in the ~1s window before impact.
  let top = Math.max(0, impact - 35);
  for (let i = top + 1; i < impact; i++) {
    if (wristY[i] < wristY[top]) top = i;
  }

  // Address: hands back near their pre-swing low baseline.
  const lo = Math.max(0, top - 90);
  let baseline = -Infinity;
  for (let i = lo; i <= top; i++) baseline = Math.max(baseline, wristY[i]);
  let address = lo;
  for (let i = top; i >= lo; i--) {
    if (wristY[i] >= baseline - 0.05) {
      address = i;
      break;
    }
  }

  return { address, top, impact, finish: n - 1 };
}

/** Compute swing metrics from a recorded landmark timeline. */
export function computeMetrics(samples: FrameSample[]): SwingMetrics | null {
  if (samples.length < 10) return null; // not enough signal

  const phases = detectPhases(samples);
  const at = (i: number) => samples[i].lm;
  const addressLm = at(phases.address);

  const shoulderYaw0 = lineYaw(addressLm[L_SHOULDER], addressLm[R_SHOULDER]);
  const hipYaw0 = lineYaw(addressLm[L_HIP], addressLm[R_HIP]);
  const shoulderWidth = Math.hypot(
    addressLm[L_SHOULDER].x - addressLm[R_SHOULDER].x,
    addressLm[L_SHOULDER].y - addressLm[R_SHOULDER].y
  );

  let shoulderTurnMax = 0;
  let hipTurnMax = 0;
  let headSwayMax = 0;
  let tiltMin = Infinity;
  let tiltMax = -Infinity;

  // Scan the backswing (address → top) for rotation peaks; address → just
  // past impact for head sway and trunk tilt (not to the end of the clip —
  // post-swing movement would poison those numbers).
  const end = Math.min(phases.impact + 5, samples.length - 1);
  for (let i = phases.address; i <= end; i++) {
    const lm = at(i);
    if (i <= phases.top) {
      const st = Math.abs(
        angleDelta(lineYaw(lm[L_SHOULDER], lm[R_SHOULDER]), shoulderYaw0)
      );
      const ht = Math.abs(angleDelta(lineYaw(lm[L_HIP], lm[R_HIP]), hipYaw0));
      if (st > shoulderTurnMax) shoulderTurnMax = st;
      if (ht > hipTurnMax) hipTurnMax = ht;
    }
    const sway =
      Math.abs(lm[NOSE].x - addressLm[NOSE].x) / (shoulderWidth || 1);
    if (sway > headSwayMax) headSwayMax = sway;

    const tilt = trunkTilt(lm);
    if (tilt < tiltMin) tiltMin = tilt;
    if (tilt > tiltMax) tiltMax = tilt;
  }

  const topLm = at(phases.top);
  const xFactorAtTop = Math.abs(
    angleDelta(
      angleDelta(lineYaw(topLm[L_SHOULDER], topLm[R_SHOULDER]), shoulderYaw0),
      angleDelta(lineYaw(topLm[L_HIP], topLm[R_HIP]), hipYaw0)
    )
  );

  // Face-on shows the shoulder line across the image (x); DTL points it into
  // the scene (z).
  const view =
    Math.abs(addressLm[L_SHOULDER].x - addressLm[R_SHOULDER].x) >=
    Math.abs(addressLm[L_SHOULDER].z - addressLm[R_SHOULDER].z)
      ? ("face-on" as const)
      : ("down-the-line" as const);

  return {
    view,
    rotationConfidence: view === "face-on" ? "high" : "low",
    shoulderTurnMax: Math.round(shoulderTurnMax),
    hipTurnMax: Math.round(hipTurnMax),
    xFactorAtTop: Math.round(xFactorAtTop),
    headSwayMax: Math.round(headSwayMax * 100) / 100,
    spineTiltRange: Math.round(tiltMax - tiltMin),
    phases,
    frameCount: samples.length,
    durationMs: samples[samples.length - 1].t - samples[0].t,
  };
}
