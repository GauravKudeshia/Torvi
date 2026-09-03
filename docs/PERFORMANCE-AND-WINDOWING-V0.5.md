# Torvi 0.5 — realtime and windowing release notes

## Architecture

System audio remains on the native ScreenCaptureKit path and is converted to an ephemeral 24 kHz WebRTC track. The interviewer and candidate channels remain separate. Realtime transcription deltas enter a local question stabilizer; a likely question is dispatched after a 380 ms partial-transcript quiet window, while the completed transcript is accepted immediately and can correct the in-flight request.

The suggestion path is now streaming end to end:

1. The hosted API authenticates the user, enforces quota, retrieves verified evidence, and opens an OpenAI Responses stream.
2. The server incrementally extracts `directAnswer` from the structured JSON response and forwards real SSE deltas.
3. The Rust desktop bridge forwards response bytes as they arrive instead of calling `response.text()`.
4. React incrementally renders the direct answer. A later final event installs the fully validated, truth-locked suggestion with evidence and follow-ups.
5. A corrected final question cancels the older HTTP/AI stream before starting the replacement.

No OpenAI credential is present in the desktop bundle. Raw audio and transient screen images are not persisted.

## Confirmed root causes fixed

- The API previously awaited the entire model response and then emitted one synthetic “delta.”
- The Rust bridge then buffered that response a second time with `response.text()`.
- Automatic AI dispatch only ran after the completed transcription event, despite partial deltas already being available.
- Surface and density changes called `setSize()` with hard-coded presets, overriding user resizing.
- Focus Mode was implemented by switching to the compact preset. It did not own independent bounds.
- The Tauri window had `decorations: false`, so macOS could not provide its standard close, minimize, zoom, and edge-resize affordances.
- The window was always on top even outside Focus Mode.

## Performance evidence

A direct production-model benchmark from the development environment used the same structured-output shape and prompt class:

| Path | First useful answer | Complete |
| --- | ---: | ---: |
| Previous buffered request | 3,624 ms | 3,624 ms |
| Streaming request | 645 ms | 2,058 ms |

This is a measured 82% reduction in model-path time to the first useful answer for that sample. It is not a network-wide SLA. The desktop diagnostics panel now records the real session stages separately: audio-to-first-transcript, transcript-to-question, request-to-first-token, request-to-first-render, retrieval, and completion.

Question dispatch now occurs 380 ms after a stable likely partial question, or immediately on the final event. Total transcription latency still depends on the realtime provider, audio device, network, and utterance.

## Window and UI states

- **Normal Mode:** standard macOS controls, edge/corner resizing, custom drag region, and persisted Normal bounds.
- **Focus Mode:** the same resizable native window with a reduced coaching surface, always-on-top only while Focus is active, and separately persisted Focus bounds. The first Focus entry inherits the current Normal bounds.
- **Comfortable density:** full context, transcript, progressive answer controls, sources, and diagnostics.
- **Compact density:** the same information architecture with reduced spacing.
- **Minimal density:** hides secondary context and transcript panels without resizing the native window.
- **Minimum supported bounds:** 420 × 280. Short-window media rules preserve the question, streaming answer, live controls, and retention actions.

The release was visually exercised at 1180 × 820 (Comfortable), 620 × 480 (Focus), and 430 × 300 (minimum-height stress case). The minimum-height layout keeps the current question, streamed answer, pause/ask controls, and explicit Save action reachable while allowing the answer region to scroll.

Stored bounds are physical-pixel rectangles and are restored only when at least 80 pixels remain visible on an attached monitor. This prevents an old external-display position from stranding the window off-screen and avoids logical/physical scaling drift.

## Operational risks and follow-up validation

- The first-token benchmark must be repeated across regions, all five languages, and every production model configuration.
- Native controls and title-bar overlay placement need release-matrix checks on macOS 13 through the current release, Intel and Apple Silicon, and multiple display scale factors.
- The partial question detector is lexical and intentionally conservative. Multilingual scripted evals should track early false positives, corrections, and answer cancellation frequency.
- Windows needs the same bounds/focus validation with WASAPI and the Windows title-bar implementation before a signed Windows release.
- Screen-share exclusion remains best-effort platform behavior and must not be described as covert, undetectable, or guaranteed.
- The local Apple Silicon ZIP is ad-hoc signed for owner testing. Public delivery still requires the owner's Developer ID Application certificate, notarization, stapling, and updater signing credentials.
