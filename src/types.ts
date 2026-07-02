// Domain model (safe/public shapes only). The biomechanics thresholds and drill
// mapping that turn a pose into a diagnosis are the proprietary "coaching brain"
// and live server-side — the client sends keypoints up and gets a Diagnosis back.

export type CameraView = "face-on" | "down-the-line";

export type Screen = "home" | "record" | "analyzing" | "result";

export type PoseStatus = "idle" | "loading" | "streaming" | "error";

export interface Flaw {
  id: string;
  title: string;
  explanation: string; // plain language
  strokeImpact: number; // 0-100, drives ranking
  bestEffort: boolean; // depth-axis flaws are lower-confidence on one camera
}

export interface Drill {
  id: string;
  title: string;
  cue: string;
  videoUrl?: string;
}

export interface Diagnosis {
  topFlaw: Flaw;
  otherFlaws: Flaw[];
  drills: Drill[];
}

// TEMPORARY placeholder until the server-side analysis endpoint exists.
// Lets the whole screen flow work end-to-end before the backend is built.
export function stubDiagnosis(): Promise<Diagnosis> {
  return Promise.resolve({
    topFlaw: {
      id: "under_rotation",
      title: "Incomplete shoulder turn",
      explanation:
        "You're stopping your backswing early — your shoulders turn about 70° " +
        "when a full turn is closer to 90°. That robs you of power and makes " +
        "your arms do the work.",
      strokeImpact: 62,
      bestEffort: false,
    },
    otherFlaws: [
      {
        id: "head_sway",
        title: "Slight head sway",
        explanation: "Your head drifts away from the target on the backswing.",
        strokeImpact: 28,
        bestEffort: false,
      },
    ],
    drills: [
      {
        id: "wall_drill",
        title: "Wall turn drill",
        cue: "Feel your lead shoulder touch under your chin at the top.",
      },
    ],
  });
}
