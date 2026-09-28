# Torvi meeting-first UI audit — September 26, 2026

Scope: incremental desktop/mobile product refactor. Preserve Torvi branding, account authorization, AI, capture helpers, consent, retention, and backend routes. No website deployment, credential changes, or replacement of the installed Mac app is implied by this source iteration.

## Current architecture

React 19/TypeScript desktop renderer in Tauri 2; Rust window management and Swift AVFoundation/ScreenCaptureKit capture. Web/API: vinext, Cloudflare D1/R2, Drizzle, Zod. Mobile: Expo/React Native, Auth0 PKCE/SecureStore, WebRTC and RevenueCat. Shared contracts, SDK and token packages already exist. State is React hooks plus native persisted window/preferences; audio/transcripts are transient until explicit Save. Lucide icons and system-font desktop typography are established.

| Area | Classification | Incremental treatment |
| --- | --- | --- |
| Native compact/expanded window, drag, bounds, tray, Spaces | Implemented; platform-specific acceptance pending | Retain native ownership; refine command surface, not window engine |
| AI streaming, format, retry/cancel, screen on Ask | Already implemented and suitable | Reuse; make Assist explicit and contextual |
| Workspace home | Implemented but should be redesigned | Extract meeting-first home with mode, readiness, upcoming rounds and chronological activity |
| History/detail | Partially implemented | Use actual session titles; group dates; include captures even without generated report; searchable transcript and exports |
| Rich live transcript | Implemented inside overlay menu | Move into dedicated workspace view with user-controlled follow-live |
| Modes | Backend supports modes, overlay selector missing | Shared mode catalogue; retain interview grounding restrictions |
| Pre-call | Existing interview rounds/targets/briefs | Derive upcoming from scheduled rounds; no pretend calendar sync |
| Calendar/participants | Missing or backend-dependent | Explain limitation; never invent attendees or meetings |
| Settings/shortcuts | Already implemented, OS-aware labels | Reuse; keep low-frequency controls here |
| Desktop theme | Dark tokens plus legacy hardcoded styles | Add semantic tokens; use them for new surfaces, retain compatibility aliases |
| Mobile | Partial practice shell, hardcoded quotas, no end/save flow | Replace presentation with Notes, live Chat/Transcript, explicit pause/save/discard, detail and sharing; retain auth/billing/context |
| Windows | Shared renderer/window shell; native audio incomplete | Preserve Ctrl labels; do not claim native capture tested |
| Accessibility | Partial: labels/focus/reduced motion exist | Semantic headings, readable text, 44pt mobile actions, real status, recoverable errors |
| Testing | Node test runner, SSR, TypeScript | Add domain/state/SDK/component tests; production builds and visual renderer QA |

## Files and reuse

Extend `packages/sdk` with meeting view models, grouping, actions and existing route adapters; extend `packages/design-tokens` with semantic dark/light themes. Extract desktop `MeetingHome` and `LiveTranscript` from the large orchestration components. Refine `session-history` and `assistant-overlay`; keep capture code and native signing unchanged. Split mobile auth, session controller, notes/live/detail views and tokens rather than growing the existing single component.

## Risks / guardrails

- Sessions require a job-target ID even for meetings: use the existing target API to create an honest dated meeting context after consent, not a new backend or fabricated calendar data.
- Native room audio cannot reliably identify people: label it “Room audio,” never assign a real participant identity.
- Async recording must release late microphone grants, stop on background/unmount, retain unsaved transcript on network/save errors, and prevent concurrent starts.
- Save/Discard remains explicit. No background recording, auto-save transcript, raw audio files, or new screenshot storage.
- Mobile provisioning, final macOS capture reliability, Windows capture and public signing remain distinct release gates. UI verification is not hardware acceptance.
- Existing web source and deployed website are not modified by this native/mobile iteration.
