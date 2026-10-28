# Let's Dance — Meta AI Hackathon Technical Specification

## 1. Product goal

Let's Dance is an AI dance coach for learning one short choreography from a phone or laptop camera.

The hackathon demo must prove one loop:

1. The user watches a 15–20 second reference dance.
2. The user records an attempt.
3. The app scores pose similarity and timing.
4. The app identifies one specific mistake with a timestamp.
5. The user retries the difficult segment and sees an improved score.

The MVP is not intended to judge artistic quality, support arbitrary dances, or provide medical advice.

## 2. Hackathon positioning

Theme: **Push the Frontier**

Pitch: **Turn passive dance videos into interactive lessons with grounded, frame-specific AI coaching.**

The technical novelty is the combination of:

- Meta SAM 3.1 for persistent dancer segmentation and tracking;
- deterministic pose/timing comparison for fast, explainable scores;
- Meta Muse Spark 1.3 for multimodal interpretation and human-friendly coaching;
- a retry loop that verifies whether the learner corrected the detected mistake.

The system must visibly use Meta models in the user experience. The results screen should include a small “Analyzed with SAM 3.1 + coached by Muse Spark 1.3” label, and the demo should show the segmentation overlay and structured Muse response.

## 3. Recommended MVP platform

Build a mobile-first web app/PWA for the hackathon demo.

- Frontend: Next.js, TypeScript, Tailwind CSS
- Camera: browser `MediaRecorder` API
- Pose extraction: MediaPipe Pose Landmarker in the browser or server-side
- Backend: Next.js route handlers or a small FastAPI service
- Storage: local filesystem for development; temporary object storage for deployment
- Meta APIs: `https://api.meta.ai/v1`
- Deployment: Vercel for the web app plus a small Python service only if server-side pose processing is needed

This is faster to ship and easier for judges to open than a native Android build. A Kotlin/CameraX version can follow after the hackathon.

## 4. Model responsibilities

### 4.1 SAM 3.1 (`sam-3.1`) — required

Use SAM 3.1 on the reference clip and recorded attempt with the text prompt `dancer` or `person dancing`.

Outputs used by the application:

- tracked dancer identity across frames;
- bounding box per frame;
- segmentation mask per frame;
- confidence/visibility checks;
- an optional visual overlay for the demo and results screen.

SAM does not provide skeletal joints. It must not be presented as the pose-scoring model.

### 4.2 Muse Spark 1.3 (`muse-spark-1.3`) — required

Muse receives:

- the short reference clip;
- the short attempt clip;
- deterministic metrics from the motion engine;
- the worst three time windows and joint-angle deltas;
- a strict JSON output schema.

Muse returns:

- a one-sentence summary;
- up to three timestamped corrections;
- one prioritized retry instruction;
- encouraging feedback grounded in measured differences.

Muse must not invent numerical scores. All displayed numbers come from the motion engine; Muse only explains them.

Recommended model: `muse-spark-1.3`. However, the hackathon billing dashboard states that content processed while using the $150 free credits may be used for product improvement. Therefore, selecting the normally private Standard model ID must not be presented as a guarantee that hackathon-credit content will be excluded from product improvement.

For the hackathon demo, upload only staged recordings made by the builder or adults who have explicitly agreed to this use. Do not send ordinary users' recordings to Meta while promotional-credit terms apply.

### 4.3 MediaPipe Pose — supporting model

Use MediaPipe to extract body landmarks at 10–15 FPS. This provides the low-latency joint data needed for scoring. It is acceptable for the product to use a supporting non-Meta model because the differentiated analysis and coaching path is powered by Meta models.

### 4.4 Optional Meta models

- `muse-image-1.0`: generate a coach avatar or lesson card; exclude if time is tight.
- `muse-voice-transcribe-1.0`: allow the user to name a problem or ask a question; exclude from the critical path.

Do not add optional models merely to increase the model count.

## 5. System flow

```text
Reference video
  -> SAM 3.1 dancer mask and track
  -> MediaPipe pose landmarks
  -> normalized reference motion timeline

User camera recording
  -> MediaPipe pose landmarks during/after capture
  -> SAM 3.1 dancer mask and track after capture
  -> normalized attempt motion timeline

Reference timeline + attempt timeline
  -> temporal alignment (Dynamic Time Warping)
  -> deterministic scores and error windows
  -> Muse Spark 1.3 with clips + metrics JSON
  -> timestamped coaching response
  -> retry selected segment
```

No cloud model is called for every live camera frame. Live guidance is generated locally from pose thresholds; cloud analysis runs after the recording.

## 6. Motion comparison engine

### 6.1 Pose normalization

For every frame:

1. Translate landmarks so the midpoint of the hips is the origin.
2. Scale coordinates by shoulder width or torso length.
3. Rotate the upper body to reduce small camera-angle differences.
4. Mirror the attempt when the lesson is configured as mirror mode.
5. Drop low-visibility joints rather than scoring them as incorrect.

### 6.2 Features

Calculate:

- normalized landmark coordinates;
- elbow, shoulder, hip, knee, and ankle angles;
- wrist and ankle velocities;
- torso lean;
- left/right symmetry;
- movement energy over time.

### 6.3 Temporal alignment

Use Dynamic Time Warping to align the attempt with the reference. Limit the warping window so a severely late move cannot receive a perfect motion score.

### 6.4 Scores

All scores range from 0 to 100.

- `pose_score`: weighted joint-angle and landmark similarity after alignment;
- `timing_score`: deviation between aligned movement peaks;
- `completion_score`: proportion of required movement windows completed;
- `overall_score`: `0.60 * pose + 0.30 * timing + 0.10 * completion`.

Store the formula and per-window values so every correction is explainable.

### 6.5 Rule-based live hints

During recording, show at most one hint at a time:

- full body is not visible;
- move farther from the camera;
- raise left/right wrist;
- straighten left/right elbow;
- bend left/right knee;
- speed up or slow down.

Require an error to persist for several frames before displaying a hint to prevent flicker.

## 7. Muse structured-output contract

The backend should request JSON matching this shape:

```json
{
  "summary": "Good rhythm; the main issue is the right arm during the second phrase.",
  "corrections": [
    {
      "start_ms": 8200,
      "end_ms": 10400,
      "body_part": "right arm",
      "observation": "The right elbow remained bent while the reference arm extended.",
      "instruction": "Repeat this section at 0.5x speed and fully extend the right elbow on beat three.",
      "evidence_metric": "right_elbow_angle_delta_deg",
      "evidence_value": 31
    }
  ],
  "retry": {
    "start_ms": 7800,
    "end_ms": 10800,
    "focus": "Right-arm extension on beat three"
  }
}
```

Validation rules:

- reject output that does not match the schema;
- allow no more than three corrections;
- require each correction to reference an input metric and time window;
- clamp timestamps to the clip duration;
- never display a Muse-generated score;
- fall back to a deterministic correction if the Meta API is unavailable.

## 8. Backend API

### `POST /api/lessons/reference`

Upload and preprocess the reference video. Returns lesson ID, duration, pose timeline, SAM preview URL, and key movement windows.

### `POST /api/attempts`

Upload a user attempt. Returns attempt ID and processing status.

### `GET /api/attempts/{id}`

Returns deterministic scores, error windows, SAM overlay, and Muse coaching output.

### `POST /api/attempts/{id}/retry`

Uploads a retry for the selected time window and returns before/after metrics.

### `GET /api/health/meta`

Server-side connectivity check for the Meta Model API. It must not expose the API key.

## 9. Security and privacy

- Store `MODEL_API_KEY` only in server environment variables.
- Never call Meta directly from browser code with the secret key.
- Before uploading, show an explicit notice: “This recording will be sent to Meta for AI analysis. While promotional credits are in use, submitted content may be used by Meta for product improvement.”
- Require a separate affirmative checkbox; accepting general app terms is not sufficient for the demo.
- Delete raw attempt clips after the demo session or within a documented short retention period.
- Upload only staged recordings from the builder or consenting adult demo participants while the free-credit notice is active.
- Do not upload recordings of minors, bystanders, crowds, or anyone who has not agreed to the stated Meta processing.
- Keep pose extraction and deterministic scoring local so a privacy-preserving mode can work without uploading video. In that mode, Meta coaching can receive only derived, non-identifying motion metrics if the event rules and applicable terms permit it.
- Do not identify people, infer health conditions, or make biometric identity claims.
- Do not upload copyrighted dance videos or music without permission.

## 10. Credit plan

Meta's published prices at the time of this specification:

- SAM 3.1 video: $0.20 per 1,000 frames;
- Muse Spark 1.3 Standard: $1.25 per 1M input tokens and $4.25 per 1M output tokens;
- Muse Image: $0.01 per image;
- Muse Voice Transcribe: $0.18 per hour.

The public pricing documentation distinguishes Standard and Contributor modes, but the hackathon billing dashboard adds a specific notice that content may be used for product improvement while free credits are in use. The promotional-credit notice must be treated as controlling for this project.

A 20-second clip sampled at 15 FPS contains about 300 frames, or roughly **$0.06 in SAM processing**. Processing a reference and one attempt is about **$0.12** before retries.

Suggested $150 budget guardrails:

| Purpose | Cap |
| --- | ---: |
| SAM reference/attempt experiments | $25 |
| Muse Spark prompt and video experiments | $45 |
| End-to-end testing and demo rehearsals | $25 |
| Final demo traffic | $15 |
| Optional image/voice experiments | $5 |
| Reserve for mistakes and reprocessing | $35 |

Do not try to spend all credits. Add per-user and per-day limits, reuse the processed reference, sample video at 10–15 FPS, and cache identical Muse requests during development.

Partner credits from Baseten, Modal, and Fireworks are separate from the $150 Meta Model API credit. They are useful only if the team chooses to self-host or serve open-weight Meta models. The MVP does not require them; direct Meta Model API access is the shortest path.

## 11. Seven-day delivery plan

### Day 1 — October 28

- Create the mobile-first recording flow.
- Record one legally usable reference choreography.
- Make one successful Muse Spark request and one SAM 3.1 request.

### Day 2

- Extract MediaPipe landmarks from the reference and attempts.
- Implement pose normalization and a basic per-frame score.

### Day 3

- Add DTW alignment and timing score.
- Produce the three worst error windows.

### Day 4

- Add SAM masks/tracks and the segmentation overlay.
- Add Muse structured coaching with schema validation.

### Day 5

- Build the results and retry screens.
- Show before/after metrics for a selected segment.

### Day 6

- Test with at least five people or five recorded variations.
- Fix camera framing, mirroring, latency, and confusing hints.

### Day 7 — submission day

- Record a 60–90 second demo video.
- Prepare architecture and cost slides.
- Freeze the demo data and rehearse the failure fallback.

The official submission deadline is November 4, 2026 at 9:00 PM ET, which is November 5 at 6:00 AM in Tbilisi after the U.S. daylight-saving transition. Submit earlier than the converted deadline.

## 12. Demo script

1. Open the lesson and show the reference dancer.
2. Toggle the SAM mask overlay to prove dancer tracking.
3. Perform the choreography with one intentional right-arm mistake.
4. Show the deterministic pose/timing score and the 8.2–10.4 second error window.
5. Reveal Muse's grounded instruction.
6. Retry only that segment.
7. Show the right-arm metric and overall score improve.
8. End on the architecture slide: SAM 3.1 perception, motion engine measurement, Muse Spark 1.3 coaching.

## 13. Acceptance criteria

- The app records and analyzes a 15–20 second attempt on a phone browser.
- The dancer is tracked by SAM 3.1 and a visible overlay can be shown.
- Pose and timing scores are deterministic and reproducible.
- At least one correction contains a valid timestamp and measured joint difference.
- Muse output conforms to the JSON schema or the app uses a safe fallback.
- A retry can be compared with the first attempt.
- The Meta API key never appears in client code or network responses.
- The complete demo works even if the final live Meta request fails, using a clearly labeled cached result from the same recorded attempt.

## 14. Explicit non-goals

- arbitrary dance discovery from social media links;
- real-time cloud video streaming;
- multi-person choreography;
- 3D body reconstruction;
- artistic or attractiveness scoring;
- medical, injury, or fitness diagnosis;
- training a custom foundation model during the hackathon.
