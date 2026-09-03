# Reliability and preflight

## Current checks

The web setup readiness check reports each item as Ready, Warning, or Failed and distinguishes configured from actually tested:

- authenticated backend request;
- D1 account/session store response;
- server-side AI credential configuration;
- private document storage binding;
- client network state and measured backend latency;
- browser microphone permission state;
- browser laptop-audio state.

Browser microphone signal is not marked ready until a microphone is selected. Browser laptop audio is always marked untested during setup because the platform requires a user gesture, a source chooser, and “Share audio” after the live room opens.

The macOS overlay provides a deeper native system-audio preflight: TCC preflight, explicit permission request, required process relaunch, app signing identity diagnostics, helper availability, pipe/stream stages, first-chunk readiness, and a live energy meter. Microphone health is displayed separately.

## Graceful degradation

- System and microphone connections are independent; loss of one does not erase the other.
- Question turns and transcript fragments remain client-side during an ephemeral session.
- Suggestion requests are cancellable; a later detected question supersedes a stale request.
- Session-brain compilation is best effort. Failure does not prevent session creation.
- Missing or invalid session-brain cache falls back to canonical memory retrieval.
- Report generation falls back to deterministic notes and coaching when the model is unavailable.
- Save and Discard remain explicit terminal operations.

## Telemetry policy

The telemetry contract supports latency, failure, grounding, evidence-gap, progressive-answer, follow-up, preflight, memory, and completion events. Structured logs filter keys associated with audio, screenshots, transcript, answer, question, resume, email, and name. Suggestion instrumentation records timings, counts, boolean grounding state, evidence-gap state, and mode—not content.

Production aggregation should compute P50/P95/P99 for retrieval, generation, transcription, and first-useful-answer latency.

## Remaining release tests

- Temporary network and Realtime/WebRTC interruption with automatic reconnect.
- System and microphone device switching, AirPods transitions, default-device changes, and microphone disappearance.
- Sleep/wake, app background/foreground, and safe session restoration.
- True first-token suggestion streaming; the current route returns progressive structured layers after the provider response completes.
- Signed update failure/recovery, crash recovery, and version/update status.
- Zoom, Meet, Teams, Webex, Bluetooth, and headset matrix on supported OS versions.

No release should claim a subsystem passed when it was only configured or its permission was merely present.
