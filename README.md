# Torvi

Torvi is a consent-first AI assistant for meetings, interviews, sales calls, presentations, study sessions, and general professional conversations. It combines a responsive web workspace with a native Tauri macOS overlay, streaming transcription, screen-aware assistance, private context packs, configurable point/paragraph/adaptive answers, saved session history, and explicit retention controls.

The product is original and uses the supplied Cluely references only for interaction and quality inspiration. It does not implement proctoring bypass, monitoring evasion, or universal “undetectability.” Private Overlay is a clearly labeled, best-effort display preference on supported macOS capture paths.

## Primary stack

- React 19 + TypeScript + vinext/Next-compatible routing for the web app and API routes
- Tauri 2 + Rust + a small Swift ScreenCaptureKit helper for the native macOS overlay and system audio
- Cloudflare Workers, D1, and R2 through the Sites runtime
- Drizzle ORM + Zod contracts shared by web and desktop
- OpenAI Responses API for streamed, structured assistance and OpenAI Realtime for live transcription
- Sites authentication in hosted builds, with Auth0 OIDC/PKCE support for standalone web and native clients
- Paddle for web billing and RevenueCat for mobile entitlement normalization

## Product areas

- `/dashboard` — useful start modes, recent sessions, context, and usage
- `/session/new` — purpose, response style/length, private sources, readiness, consent
- `/session/[id]` — live transcript, streamed AI answer, quick actions, capture, save/discard
- `/history` — searchable transcript, AI interactions, summary, actions, rename/delete/export/duplicate setup
- `/memory` — verified professional claims and evidence provenance
- `/settings` — response style, response length, tone, technical depth, voice, and privacy controls
- `apps/desktop` — standard, compact, minimal overlay, draggable/resizable live assistant, keyboard shortcuts, audio and screen context

## Local setup

Requirements: Node 22.13+, pnpm, Rust stable, and current macOS/Xcode command-line tools for native builds.

1. Copy `.env.example` to `.env.local`.
2. Add only the credentials for the features you intend to run. See `SETUP_REQUIRED.md`.
3. Run `pnpm install`.
4. Apply SQL files in `db/migrations` to the local D1 binding in filename order.
5. Run `pnpm dev` for web development.
6. Run `pnpm --filter @interview-copilot/desktop tauri dev` for the native app.
7. Run `pnpm check` before a release.

Local demo authentication is allowed only outside production. Production refuses unauthenticated API access. Secrets remain server-side and are never compiled into the desktop or browser bundle.

## Privacy boundary

Audio and screenshots are processed transiently and are not database or R2 fields. The interface always shows when listening is active and provides immediate pause, stop, save, and discard controls. Transcripts are retained only after an explicit save choice. Run `pnpm test:privacy` to verify this boundary.

For architecture, security, release, and decisions, see [ARCHITECTURE.md](./ARCHITECTURE.md), [DECISIONS.md](./DECISIONS.md), [SETUP.md](./SETUP.md), [TODO.md](./TODO.md), [docs/SECURITY.md](./docs/SECURITY.md), and [docs/REFERENCE_ANALYSIS.md](./docs/REFERENCE_ANALYSIS.md).
