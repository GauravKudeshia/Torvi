# Clean-room reference analysis

Updated: 2026-08-22

This document separates observed facts, public vendor claims, and engineering inferences. The supplied installers were not executed. No proprietary source, assets, prompts, private APIs, licensing checks, or credentials were extracted or reused.

## Supplied artifacts

| Artifact | Observable format | Size | SHA-256 | Inspection result |
| --- | --- | ---: | --- | --- |
| Verve AI 2.3.9 Windows | PE32 GUI, Intel 80386, NSIS self-extracting installer | 86,486,344 bytes | `bdf22a210c5851ec7f09a9f3cacd65a094e4dc82d90a7df176f62fd99f5827b1` | Static headers only. The PE security directory is present. This is consistent with an Authenticode signature, but signature-chain trust was not validated on Windows. |
| Verve AI 2.3.9 macOS | DMG, vendor filename says universal | 215,235,527 bytes | `2eea6c0984696eed08cbd247a96ac9b837e4594a5ca52bf1b0af68a783d68cc6` | The container reports Team ID `5LF77SHYZW` and a stapled notarization ticket. The internal app bundle could not be mounted in the sandbox. |
| Final Round Desktop 3.0.0 Windows | PE32 GUI, Intel 80386, NSIS self-extracting installer | 174,848,960 bytes | `8b916cddc36aeab53778f696040250c9decb1865987159b010adfe950e5ca93e` | Package listing shows an Electron distribution with `app.asar`, native audio/keyboard modules, ONNX Runtime, and `silero_vad.onnx`. This supports, but does not prove, an Electron + native audio + local-VAD architecture. No ASAR contents were inspected. |
| Final Round Desktop 3.0.0 macOS | DMG, vendor filename says arm64 | 162,533,012 bytes | `1e1eaaa91f92f04d6ee1b723ac72d98e8a6015b748a4a2dc476618be9593c410` | The DMG container itself is not signed. The internal app bundle could not be mounted, so app signing/notarization was not assessed. |

Both Windows installers request `asInvoker`, which is appropriate for a per-user desktop application. The DMG device layer returned `Device not configured` even after read permission was granted, so no claim is made about their internal bundle layout.

## Public product observations

- Verve's public setup flow asks for a profile, resume, role, seniority, company, language, model, and a scoped knowledge base. Its desktop product describes automatic question detection, interview-mode-specific responses, screen snapshots, global shortcuts, and desktop system-audio capture. Its browser flow requires the user to share a tab, window, or screen with audio.
- Final Round AI publicly positions its desktop client around resume/job context, live audio permissions, automatic question support, coding/screen context, and post-session reports.
- Cluely publicly emphasizes no meeting bot, real-time transcript/context, a floating answer UI, notes, and meeting follow-up. Claims that an overlay is universally “undetectable” are marketing claims and are not adopted here.
- OpenCluely is Apache-2.0-licensed. Its public macOS notes say capture may require permission and relaunch, but it does not provide a known-good native ScreenCaptureKit system-audio implementation. We use only general product patterns and independently written code.
- NexQ and Project Raven are MIT-licensed references that validate the feasibility of Tauri/Rust or Electron/native dual-channel architectures. Their public documentation highlights WASAPI loopback, ScreenCaptureKit/CoreAudio, provider factories, local storage, RAG, and explicit audio health.
- Project Raven separates passive permission status from the action that opens System Settings, shows a dedicated permission/restart gate, and records the first native audio chunk separately from stream startup. Those high-level lifecycle patterns informed the independently written state machine here.
- Vortechron Stealth is an MIT-licensed Swift reference that documents the exact local-development failure found in our package: ad-hoc signing changes the CDHash on every build, orphaning TCC grants. Its stable local-certificate/fixed-path approach is used as corroboration, not copied implementation.
- Natively is **source-available, not open source**. Its current license prohibits commercial use and use of its code, architecture, prompts, or workflows for a competing commercial product. Its repository implementation is therefore excluded from this project. Only independently observable product capabilities may be used for market comparison.
- The public Cluely GitHub organization is not a source release of the commercial desktop product. Its visible repositories include archived release/support material, a CLI, and an archived BlackHole fork. They do not provide a lawful shortcut to Cluely's proprietary implementation.

## Feature matrix

| Feature | Public references | Our implementation | Improvement / boundary |
| --- | --- | --- | --- |
| Pre-session grounding | Verve profile/knowledge base; Final Round resume/JD | Web setup requires a job target, verified resume, and selected supporting documents | Per-document verification, source citations, and a hard rule against invented experience |
| Browser audio | Verve share-audio flow | Selected tab/window/screen audio plus optional microphone over WebRTC | Explicit source-health diagnostics and honest browser limitations |
| Desktop system audio | Verve/Final Round desktop; MIT references | macOS ScreenCaptureKit helper emits live PCM; Windows adapter is not yet complete | Separate interviewer/candidate channels, hot-plug recovery, and measurable latency |
| Automatic question detection | Verve/Final Round | Multilingual turn coalescing, noise rejection, dedupe, automatic and manual triggers | F1 eval target, cancellation of stale requests, manual fallback always visible |
| Live answer suggestions | All commercial references | Working browser pipeline: audio → Realtime transcript → question detector → grounded Responses API suggestion | Concise-first structured answer, source citations, confidence, and caution |
| Coding/system design/case | Verve/Final Round | Mode-specific model routing and prompt structures | Progressive disclosure, complexity/tests/trade-offs, no proctor bypass |
| Meeting assistant | Cluely; MIT meeting references | Meeting mode is represented in shared contracts and session/report storage | Decisions, owners, due dates, risks, bookmarks, and Ask AI remain a later milestone |
| Floating overlay | All desktop references | Tauri transparent, always-on-top compact/docked/expanded UI | Native-size shell, keyboard-first, visible capture status, accessibility-first |
| Share-safe window | Commercial and MIT references | Best-effort Tauri content protection | Never marketed as undetectable; no anti-monitoring or administrator concealment |
| Screen context | Verve/Final Round/Cluely | Explicit transient image analysis endpoint; no retention | User action or visible opt-in only; no continuous covert capture |
| Provider selection | Natively marketing; NexQ/Raven | Provider-neutral contract is being introduced with OpenAI as the only enabled v1 provider | Server-authoritative catalog; Gemini/Anthropic/local adapters can be added without changing session logic |
| Session retention | Commercial histories | Save/Discard/ask-at-end; raw audio and screenshots are never persisted | Retention decision is explicit and idempotent |
| Mobile | Verve/competitor companions | Expo foreground microphone coaching, reports, profile access | No claim to capture PSTN calls or arbitrary third-party app audio |
| Distribution | Supplied signed/notarized installers | Tauri bundle configuration for app/DMG/MSI/NSIS; Expo EAS configuration | Public releases remain gated on owner signing, store, Auth0, billing, and updater credentials |

## macOS permission and capture comparison

| Lifecycle concern | Apple / compatible reference behavior | Previous app behavior | Version 0.2.6 behavior |
| --- | --- | --- | --- |
| Passive permission check | CoreGraphics preflight or framework status only | Start checked and immediately requested | `system_audio_status` calls preflight only |
| Permission request | Explicit user action | Every failed Start could call `CGRequestScreenCaptureAccess` | Only **Grant system audio** requests access |
| First grant | Relaunch is required before dependable capture | Relaunch instruction was returned as an undifferentiated error | Explicit `restartRequired` state and Quit action |
| Signing identity | Stable Apple Development/Developer ID, or stable local identity for one-machine testing | Ad-hoc; designated requirement was the current CDHash | Signing scripts reject ad-hoc permission-lifecycle verification |
| Capture startup | Shareable content → stream config → start → running | One generic readiness/error string | Each native stage, domain, and code is logged and surfaced |
| Audio verification | Stream running and first audio samples are different milestones | Meter was the only evidence | Separate `stream-running` and `first-audio-chunk` evidence |
| Error classification | Permission, entitlement, stream, and audio errors are distinct | All paths suggested checking permission | `permission`, `signing-or-entitlement`, `capture`, `audio-pipeline`, and Realtime failures remain distinct |

## Product decisions derived from research

1. The interview setup is part of **Start Interview**, not hidden only in Profile.
2. Audio health is a first-class screen: selected source, permission, energy, reconnect state, and a short sound check.
3. Suggestions lead with a direction and 2–4 talking points; long prose is expanded only on request.
4. Grounding sources are visible. Unsupported personal claims receive a caution instead of invented facts.
5. The overlay is unobtrusive but not deceptive. Consent and assessment-policy attestations are required.
6. Desktop and mobile are separate capture products sharing contracts, design tokens, auth, entitlements, and AI orchestration—not forks of one giant platform-specific codebase.

## Sources

- [Verve Quickstart](https://docs.vervecopilot.com/quickstart)
- [Verve Share Audio](https://docs.vervecopilot.com/guides/share-audio)
- [Verve desktop app](https://www.vervecopilot.com/app)
- [Final Round AI](https://www.finalroundai.com/)
- [Final Round AI FAQ](https://www.finalroundai.com/frequently-asked-questions)
- [Cluely](https://cluely.com/)
- [OpenCluely repository](https://github.com/TechyCSR/OpenCluely)
- [NexQ repository](https://github.com/naxhq/NexQ)
- [Project Raven repository](https://github.com/Laxcorp-Research/project-raven)
- [Vortechron Stealth repository](https://github.com/vortechron/stealth)
- [Apple ScreenCaptureKit](https://developer.apple.com/documentation/screencapturekit)
- [Apple ScreenCaptureKit sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)
- [Apple Developer Forums: ad-hoc signing and repeated screen-recording permission](https://developer.apple.com/forums/thread/819406)
- [Natively license](https://github.com/Natively-AI-assistant/natively-cluely-ai-assistant/blob/main/LICENSE)
