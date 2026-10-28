# Let’s Dance

A mobile-first PWA that turns an authorized dance clip into a measured lesson:

> Analyze → identify one explainable mistake → build a micro-drill → retry → prove improvement.

The product and hackathon strategy are documented in [`HACKATHON_WIN_PLAN.md`](./HACKATHON_WIN_PLAN.md). `TECHNICAL_SPEC.md` is retained as the original background document.

## Run locally

Requirements: Node.js 22+ and FFmpeg/ffprobe.

```bash
npm install
cp .env.example apps/web/.env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The bundled judge demo is deterministic and does not require credentials.

To enable live Meta analysis, put the hackathon key in `apps/web/.env.local`:

```dotenv
MODEL_API_KEY=your_server_only_key
META_MODEL_API_BASE_URL=https://api.meta.ai/v1
```

Never expose this key through a `NEXT_PUBLIC_` variable. A video is sent to Meta only when the user checks **Enable Meta analysis**. Temporary local and Meta files are deleted after compilation.

## Commands

```bash
npm test          # deterministic scoring and segmentation fixtures
npm run typecheck # all workspaces
npm run build     # production PWA and API routes
npm start         # production server on $PORT or 3000
```

## Architecture

- `apps/web` — Next.js PWA, practice camera, MediaPipe worker, FFmpeg routes, Meta adapters.
- `packages/motion-core` — normalization, joint angles, constrained DTW, scoring and error evidence.
- `packages/contracts` — Zod contracts shared by browser and server.
- `Dockerfile` — single long-running Node container with FFmpeg, suitable for Railway.

MediaPipe landmarks and live hints stay in the browser. SAM 3.1 owns dancer tracking and visual evidence; Muse Spark 1.3 labels deterministic segments and rewrites measured errors into a schema-constrained drill. Neither model creates the numerical score.

## Demo path

1. Select **Try the judge demo**.
2. Study **Open the frame** with mirror, speed and loop controls.
3. Select **Practice this step**, then **Use scripted demo attempt** if no camera is available.
4. Review the exact error window and measured elbow delta.
5. Select **Start targeted retry** to reveal the verified before/after result.

The UI labels cloud state as `META LIVE` or `DEMO FALLBACK`; a Meta failure never disables local practice or deterministic scoring.
