# Architecture decisions

## ADR-001: Tauri 2 desktop shell

**Status:** accepted

Use Tauri 2 with a dedicated React overlay and Rust/native capture adapters. This keeps the resident footprint below an Electron-bundled Chromium design while retaining a shared TypeScript product layer. Swift is used only where ScreenCaptureKit integration is clearer and safer; Windows capture remains Rust + `windows-rs`.

## ADR-002: No hidden or evasive behavior

**Status:** accepted

Implement a legitimate minimal mode: compact borderless panel, configurable opacity, click-through, always-on-top, global show/hide, and best-effort OS content protection. Do not promise invisibility; do not bypass proctoring, monitoring, administrators, recording indicators, or consent requirements.

## ADR-003: Dual audio channels

**Status:** accepted

Keep system/interviewer audio and microphone/candidate audio separate through capture and transcription. This provides deterministic speaker labels and enables per-channel noise/AEC settings. Mixing is allowed only for optional playback/monitoring, never as the canonical transcript input.

## ADR-004: Direct client-to-OpenAI Realtime media

**Status:** accepted

The API verifies identity, ownership, consent, quota, and rate limits, then mints an ephemeral client secret. Audio travels from the authenticated client to OpenAI over WebRTC. The hosted API remains outside the media hot path and no standard provider key ships in a client.

## ADR-005: OpenAI first, provider-neutral core

**Status:** accepted

OpenAI is the only enabled v1 provider. Selection occurs through a provider registry, not imports scattered through routes. Gemini, Anthropic, OpenAI-compatible, and local adapters can be added later without changing session, retrieval, retention, or UI contracts.

## ADR-006: Grounded personal claims

**Status:** accepted

Resume facts require explicit user verification. Retrieval selects the smallest relevant source set. The model may reorganize or explain verified facts but must not invent employment, skill, project, metric, responsibility, or accomplishment. Responses carry citations and a caution when support is weak.

## ADR-007: Explicit retention

**Status:** accepted

Raw audio and screenshots are always transient. Final transcript segments remain ephemeral unless the user selects Save. `ask-at-end` is the default. Discard removes transcript/suggestion context and is idempotent. Saved sessions may persist transcript, generated suggestions, and reports, never audio.

## ADR-008: Mobile is a companion

**Status:** accepted

iOS/Android support profile/documents, mock interviews, reports, billing, and visible foreground room-microphone coaching. The product does not claim PSTN call capture or arbitrary third-party app audio capture.

## ADR-009: Clean-room reference policy

**Status:** accepted

Commercial binaries are limited to static compatibility, packaging, and publicly observable UX analysis. MIT references may inform high-level patterns and compatible libraries; implementation is independently written. Natively's non-commercial source license makes its code, prompts, and internal architecture out of scope for this commercial product.

## ADR-010: Release truthfulness

**Status:** accepted

An unsigned local artifact is a developer build, not a release. Public macOS requires Developer ID signing, hardened runtime, notarization, and stapling. Public Windows requires Authenticode signing plus signed updater metadata. Store builds require user-owned Apple/Google accounts. Placeholder credentials and updater URLs are build blockers for release channels.

