# Torvi architecture

## Chosen stack

| Option | Size/RAM | Native audio/window control | Delivery speed | Long-term fit | Decision |
| --- | --- | --- | --- | --- | --- |
| Tauri 2 + React + Rust/Swift | Small; uses OS webview | Strong through Rust commands and signed native helpers | Good | Strong shared UI with platform-specific capture | **Chosen** |
| Electron + React | Larger runtime and RAM | Mature, but native modules still required for robust dual-channel capture | Fastest initial UI | Acceptable, but heavier for an always-running overlay | Not chosen |
| Native Swift + C#/WinUI | Best platform fidelity | Best | Slowest; two presentation stacks | Highest duplicated product work | Not chosen for v1 |
| Flutter | Medium | Plugins/custom native channels still required | Good | Less leverage from existing TypeScript web/mobile contracts | Not chosen |

Tauri is not used as an excuse to wrap the dashboard. The desktop renderer is a dedicated compact product surface. Native capture remains behind explicit platform adapters.

## System diagram

```text
                         ┌──────────────────────────────┐
                         │ Web dashboard / setup        │
                         │ profile · jobs · documents   │
                         │ history · reports · billing  │
                         └──────────────┬───────────────┘
                                        │ HTTPS + OIDC/PKCE
┌──────────────────────────┐            │            ┌──────────────────────────┐
│ Tauri desktop            │            ▼            │ Expo mobile              │
│ native overlay UI        │◀───── Versioned API ───▶│ foreground companion     │
│ shortcuts · audio health │                         │ mock · reports · profile │
└────────────┬─────────────┘                         └──────────────────────────┘
             │
             │ typed Tauri commands/events
             ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│ Application core                                                            │
│ SessionManager · ConsentPolicy · AudioCoordinator · QuestionDetector          │
│ ContextManager · SuggestionCoordinator · RetentionManager · Metrics           │
└────────────┬──────────────────────────────┬──────────────────────────────────┘
             │                              │
             ▼                              ▼
┌──────────────────────────┐    ┌──────────────────────────────────────────────┐
│ Native capture adapters  │    │ Sites / Cloudflare-compatible API           │
│ macOS: ScreenCaptureKit  │    │ ownership · rate limit · quota · audit       │
│        + CoreAudio mic   │    │ provider registry · retrieval · reports      │
│ Windows: WASAPI render   │    │ D1: durable records · R2: user documents     │
│          + capture       │    └───────────────┬──────────────────────────────┘
└────────────┬─────────────┘                    │
             │ PCM frames                       │ server-minted ephemeral lease
             ▼                                  ▼
┌──────────────────────────┐    ┌──────────────────────────────────────────────┐
│ local audio processing   │───▶│ OpenAI Realtime (v1)                        │
│ resample · VAD · AEC     │    │ direct WebRTC audio · transcript events      │
│ bounded buffers · meter  │    └────────────────┬─────────────────────────────┘
└──────────────────────────┘                     │ finalized question
                                                 ▼
                                  ┌────────────────────────────────────────────┐
                                  │ Provider-neutral suggestion service        │
                                  │ retrieval + structured context + LLM       │
                                  │ OpenAI v1; Gemini/Anthropic/local later     │
                                  └────────────────────────────────────────────┘
```

## Layer boundaries

### Presentation

- Web: onboarding, opportunity setup, verification, history, reports, privacy, downloads, and billing.
- Desktop: session status, transcript, concise answer, audio health, shortcuts, and compact/docked/expanded layouts.
- Mobile: mock/room coaching in the foreground, profile/documents, reports, and store billing.

### Application core

The core owns session state transitions and provider-independent domain events. UI code does not call provider SDKs directly. Public clients never receive infrastructure credentials.

```text
draft → ready → live → ending → saved
                       └──────→ discarded
live  → reconnecting → live
live  → permission_lost → paused → live
```

Save and Discard are idempotent terminal operations. A session cannot re-enter `live` after either terminal state.

### Audio

`AudioCaptureAdapter` exposes device discovery, permissions, capture lifecycle, timestamped PCM frames, health events, and recovery. System and microphone streams are not mixed before transcription because their source labels are semantically important.

```ts
export interface AudioCaptureAdapter {
  capabilities(): Promise<AudioCapabilities>;
  listDevices(): Promise<AudioDevice[]>;
  start(config: CaptureConfig, sink: AudioFrameSink): Promise<void>;
  stop(): Promise<void>;
}
```

- macOS system channel: ScreenCaptureKit `SCStream` audio sample buffers.
- macOS candidate channel: CoreAudio/AVAudioEngine input device capture.
- Windows system channel: default render endpoint in WASAPI shared loopback mode.
- Windows candidate channel: default capture endpoint in WASAPI shared mode.
- Both: normalize to signed 16-bit mono PCM at 24 kHz for Realtime transcription, retain timestamps before resampling, use bounded queues, and drop oldest frames under backpressure rather than grow memory without limit.
- Device changes pause the affected channel, enumerate again, and resume only after a health check. Audio is never written to disk.

### Realtime transcription and question detection

The server authenticates the user, owns the session, verifies quota and consent, then mints a short-lived OpenAI Realtime client secret. The client forms the WebRTC connection directly with OpenAI. The standard API key never ships to web, desktop, or mobile.

OpenAI's current Realtime transcription guidance recommends `gpt-live-transcribe`, 24 kHz PCM, transcript delta/completed events, and reconciliation by `item_id`. It does not provide speaker labels or word timestamps, so our two capture channels provide the reliable speaker boundary and our app supplies timestamps.

```text
final transcript segment
  → normalize / reject known noise
  → merge growing fragments
  → classify intent and mode
  → wait for question completion or manual Ask AI
  → cancel stale request
  → retrieve relevant sources
  → stream concise suggestion
```

### Context and retrieval

The context manager assembles:

1. the current question and recent finalized turns;
2. structured session state (topic, mode, prior questions, constraints);
3. user-approved candidate facts and Story Bank entries;
4. the job/company target and prior-round notes;
5. top relevant chunks from selected documents;
6. a rolling summary of older turns.

Uploaded text is untrusted data, not system instructions. Retrieved chunks are labeled by source and never allowed to override system policy. Personal achievements can be stated only when supported by verified candidate facts.

### AI providers

Providers are selected through a server-authoritative catalog. OpenAI is enabled for v1. Future adapters implement the same streaming/structured-output interface; clients submit a provider ID, never provider secrets.

```ts
export interface LlmProvider {
  readonly id: AiProviderId;
  readonly capabilities: ProviderCapabilities;
  streamSuggestion(request: GroundedSuggestionRequest): AsyncIterable<SuggestionEvent>;
  createReport(request: ReportRequest): Promise<SessionReport>;
  analyzeScreen(request: TransientScreenRequest): Promise<ScreenAnalysis>;
}

export interface TranscriptionProvider {
  readonly id: TranscriptionProviderId;
  createLease(request: TranscriptionLeaseRequest): Promise<RealtimeLease>;
}
```

Provider-specific errors are normalized to stable public error codes. Model IDs remain environment configuration, with mode routing choosing a fast model for short behavioral/meeting turns and a stronger model for coding, system design, case, and vision.

### Persistence

- D1: users, profiles, job targets, documents metadata, sessions, attached documents, finalized transcript segments, suggestions for saved sessions, reports, consent receipts, entitlements, usage, devices, audit events, webhook idempotency, privacy exports, and deletion requests.
- R2: uploaded resumes/JDs/supporting documents and generated exports only.
- Device secure storage: OIDC refresh credentials, device ID, local preferences, and optionally encrypted local-only session data in a later milestone.
- Forbidden everywhere: raw audio and transient screenshots in D1, R2, logs, analytics, crash payloads, test fixtures, or backups.

### IPC and security

- Renderer → Rust commands: explicit allow-listed Tauri commands with validated payloads.
- Rust/native → renderer: typed audio-frame and health events; no filesystem paths or secrets.
- Renderer network policy: only the configured API origin and OpenAI Realtime endpoints.
- OAuth: Authorization Code + PKCE; refresh credentials in Keychain/Credential Manager/SecureStore.
- Logging: structured metadata with sensitive-key filtering; transcript text is off by default.

## Developer diagnostics

A development-only panel will expose device IDs, channel energy, buffer depth, dropped frames, transcription partial/final latency, classification latency, first-suggestion-token latency, current model/provider, current intent, context token estimate, and reconnect state. Production builds exclude raw transcript/audio logging.

## Current vertical-slice status

| Stage | Browser | macOS desktop | Windows desktop | Mobile |
| --- | --- | --- | --- | --- |
| Start grounded session | Working | Opens web setup; secure native handoff pending | Same | Working after Auth0 configuration |
| Capture system audio | Share-tab/window/screen audio working | Native PCM helper, explicit TCC/restart/capture states, first-chunk diagnostics, and bundle checks working; stable Developer ID release signing remains gated on owner credentials | Adapter placeholder only | Not supported by platform design |
| Capture microphone | Working | WebRTC/native coordinator pending | WebRTC/native coordinator pending | Foreground room mic working |
| Realtime transcription | Working | Native PCM-to-Realtime bridge pending | Pending capture + bridge | Working after Auth0 configuration |
| Question detection | Working | Shared detector available; integration pending | Pending | Working |
| Grounded answer | Working | Native session integration pending | Pending | Working |

This table is a release gate, not a marketing roadmap. A desktop installer must not be called production-ready until every cell in its platform column is working and tested.
