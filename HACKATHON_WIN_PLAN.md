# Let’s Dance — Meta Hackathon Execution Plan

This document supersedes architecture and product decisions in `TECHNICAL_SPEC.md`. The older document remains as background research.

## Winning thesis

Let’s Dance turns an authorized dance video into an adaptive lesson and closes the learning loop:

> Analyze → identify one explainable mistake → generate a corrective micro-drill → retry → prove improvement.

The project targets the **Indie Developer / Push the Frontier** track. It avoids claiming to be the first dance scorer. Its differentiator is grounded correction with visible evidence and verified improvement.

## Competitive position

| Product | Existing strength | Let’s Dance response |
| --- | --- | --- |
| Cyber Dance | Video-to-lesson, skeleton, counts, scoring | Make correction and verified retry the hero |
| MotionMentor | Frame and joint comparison | Turn evidence into a focused micro-drill |
| STEEZY | Excellent mirror, loop and speed controls | Match these table stakes and add measured feedback |
| Just Dance Now | Catalog, social play and gamification | Focus on learning rather than entertainment scoring |
| Dancy | Beat scoring and on-device privacy | Add lesson compilation and explainable correction |
| TrainerAI / Atmi | Short real-time coaching cues | Show one prioritized cue, never a wall of warnings |

## Product flow

1. **Build:** upload an authorized MP4/MOV up to 60 seconds. Extract a pose timeline, track the dancer, and compile 4–8 lesson steps.
2. **Learn:** mirror, slow down and loop one segment while viewing its focus and key pose.
3. **Practice:** the user camera fills the screen and the reference plays in a draggable PIP. Local pose comparison shows one stable cue.
4. **Review:** constrained DTW produces deterministic pose, timing and completion scores plus a timestamped error.
5. **Correct:** Muse turns measured evidence into one micro-drill. A targeted retry proves improvement.

## Model responsibilities

- **SAM 3.1:** track and segment the dancer, produce a visible evidence overlay, and help auto-center the lesson. It does not provide skeletal joints.
- **Muse Spark 1.3:** label deterministic lesson segments and turn measured attempt errors into schema-constrained coaching. It never creates scores or timestamps.
- **MediaPipe Pose:** local 33-landmark extraction, skeletons, motion energy, live hints and deterministic scoring.
- **SAM 3D Body:** post-hackathon roadmap only; no GPU deployment is required for the MVP.

## Architecture

- `apps/web`: Next.js PWA, interface, API routes, Meta adapters and FFmpeg normalization.
- `packages/motion-core`: framework-independent normalization, joint angles, DTW, scoring and live correction.
- `packages/contracts`: Zod-backed contracts shared by browser and server.
- One Docker container with FFmpeg, deployable to Railway or any long-running Node host.
- Session data is memory-backed with a short TTL. Uploaded files live only in `/tmp` and are removed after processing.
- The application works in deterministic demo mode without a Meta key and labels that state clearly.

## Privacy and safety

- The Meta key stays server-side.
- No video leaves the device until the user explicitly consents.
- The consent notice states that promotional-credit content may be used by Meta for product improvement.
- Use only authorized footage of the builder or consenting adults; exclude minors and bystanders.
- Do not infer identity, health, injury, biometrics, attractiveness or artistic worth.
- Delete temporary local files and uploaded Meta files after processing.

## Demo story

1. Upload or open the bundled one-minute lesson.
2. Reveal the compiled steps and SAM tracking evidence.
3. Learn one step with mirror and slow motion.
4. Practice it with reference PIP and intentionally miss one arm movement.
5. Show the live correction and timestamped measured error.
6. Reveal the micro-drill, retry, and show the improvement delta.
7. End with the architecture: SAM perception, MediaPipe measurement, Muse reasoning.

## Acceptance gates

- Correct performance scores at least 15 points above an intentional-error take in golden fixtures.
- The known error is localized to the correct joint and within one second of the expected timestamp.
- A live hint appears after a 300–500 ms persistence window and does not flicker.
- Retry improves the targeted metric by at least 10 points in the scripted demo.
- Practice and deterministic review remain available when Meta is unavailable.
- Android Chrome, iPhone Safari and desktop Chrome support the core flow.
- The final submission is frozen and submitted by 18:00 Tbilisi time on November 4, 2026.

## Execution milestones

Milestones are intentionally small enough to complete and verify in roughly one to three hours. Do not mark a milestone complete until its completion gate passes.

| # | Milestone | Completion gate | Estimate | Status |
| --- | --- | --- | ---: | --- |
| 1 | Project foundation | The PWA runs locally; tests, typecheck and production build pass | — | Done |
| 2 | Deterministic judge demo | Learn → Practice → Review → Retry works without cloud services | — | Done |
| 3 | Video upload pipeline | MP4/MOV is validated, transcoded and temporary files are deleted | — | Done |
| 4 | Meta API connection | `/api/health/meta` confirms the real hackathon key works | 30–60m | Next |
| 5 | Muse video spike | One 5–10 second clip produces a grounded description | 1–2h | Pending |
| 6 | Muse structured output | Lesson JSON passes the shared Zod schema without repair | 1–2h | Pending |
| 7 | SAM video spike | SAM tracks one dancer across a 5–10 second clip | 1–2h | Pending |
| 8 | SAM evidence rendering | A real SAM mask or tracked box is visible in the application | 2h | Pending |
| 9 | Authorized demo asset | The final licensed choreography and clean recording are selected | 1h | Pending |
| 10 | Reference pose extraction | MediaPipe produces stable 33-landmark frames at 10+ analyzed FPS | 2h | Implemented; real-clip QA pending |
| 11 | Lesson segmentation | Motion minima produce 4–8 useful steps with valid timestamps | 2h | Implemented; real-clip QA pending |
| 12 | Live camera validation | Pose overlay works on the actual demo phone | 2h | Pending |
| 13 | Reference synchronization | Camera recording and reference playback start within 100 ms | 2h | Implemented; device measurement pending |
| 14 | Stable live cue | One error must persist for 300–500 ms before appearing | 2h | Pending |
| 15 | Golden scoring fixtures | Correct take beats the intentional-error fixture by at least 15 points | — | Done in tests |
| 16 | Real attempt scoring | Correct, arm-error and delayed recordings produce expected results | 2–3h | Pending |
| 17 | Muse correction coach | A measured error becomes a valid micro-drill without changed metrics | 2h | Connected; live Meta validation pending |
| 18 | Targeted retry | The user retries only the bad interval and receives a before/after metric | 1–2h | Implemented; device QA pending |
| 19 | Failure handling | Meta outage, camera denial and invalid video retain usable fallbacks | 2h | Partial |
| 20 | Privacy and cleanup audit | Consent is explicit, no key leaks, and all raw files are deleted | 1–2h | Implemented; final audit pending |
| 21 | Docker deployment | Railway deployment passes health, upload and cleanup tests | 2h | Pending |
| 22 | Device and browser matrix | Android Chrome, iPhone Safari and desktop Chrome pass the core flow | 3h | Pending |
| 23 | Demo recording | A polished 90–120 second video tells the complete correction story | 3h | Pending |
| 24 | Submission package | Description, screenshots, links, credits and demo video are ready | 2h | Pending |
| 25 | Submission buffer | Submission is sent by November 4 at 18:00 Tbilisi and receipt is verified | — | Pending |

### Critical path

Complete these five gates before additional visual polish:

> Real Meta key → Muse spike → SAM spike → authorized clip → phone camera test

If either Meta spike fails, keep the deterministic demo intact, capture the failing request and response, and solve the integration before expanding the feature set.

### Daily milestone schedule

#### October 28 — Eliminate Meta risk

Complete milestones 4–8. Confirm real Muse and SAM responses and render visible SAM evidence.

#### October 29 — Compile the real lesson

Complete milestones 9–11. Freeze the authorized reference clip and generate its reusable lesson manifest.

#### October 30 — Validate the camera loop

Complete milestones 12–14 on the phone that will appear in the demo.

#### October 31 — Validate scoring

Complete milestone 16 using real golden recordings: correct, arm error and delayed performance.

#### November 1 — Close the correction loop

Complete milestones 17–18. The review must lead to a focused retry and verified improvement.

#### November 2 — Reliability and deployment

Complete milestones 19–21: failure states, privacy audit and Railway deployment.

#### November 3 — Device QA and recording

Complete milestones 22–23. Record the demo before attempting optional improvements.

#### November 4 — Submission only

Complete milestones 24–25. Avoid new features; fix only submission-blocking defects.

### Milestone operating rules

- Each milestone ends with a visible artifact, passing test or captured API response.
- Never label a cached or fallback result as live Meta output.
- Update the status column immediately after a gate passes.
- Preserve a working demo at the end of every day.
- Optional features cannot displace the critical path or demo recording.
- Stop feature development after the November 3 demo freeze.

## Non-goals

- Social-video downloading, multiple dancers, arbitrary moving cameras, medical advice, artistic scoring, accounts, payments, marketplace features, native mobile clients, or SAM 3D Body deployment.
