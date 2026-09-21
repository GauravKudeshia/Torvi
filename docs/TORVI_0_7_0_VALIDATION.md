# Torvi 0.7.0 — build 20260915-floating-04

Source handoff updated September 21, 2026. Native testing below was performed September 14–15.

**Status: compiled, locally signed, and installed for continued testing. Not a fully accepted or notarized public release.**

## Implemented

- Native launch opens a 460 × 58 floating assistant. Expanded sizes, settings, context, and history remain available.
- Real account/session setup, streamed AI responses, Points / Paragraph / Adaptive formatting, cancellation, copy, retry, and recoverable errors use the existing backend.
- Tauri owns window dragging, display bounds, position persistence, show/hide, all-Spaces configuration, and single-instance/menu-bar recovery.
- Configurable defaults: Cmd+Enter ask/open; Cmd+Shift+H hide/show; Cmd+Shift+I listen/stop; Cmd+Shift+Escape collapse. Registration updates are serialized.
- The macOS microphone uses a signed AVFoundation helper and in-memory PCM transport instead of WKWebView getUserMedia. The final helper uses AVCaptureSession for Bluetooth compatibility; initialization requires audio frames and has bounded failure/cleanup paths.
- Microphone, system audio, and combined audio are explicit choices. Native helper termination, stop, and quit release capture. Audio errors have a separate **Retry audio** action, not an AI-regeneration action.
- ScreenCaptureKit keeps a live main run loop. Screen permission checks do not repeatedly prompt or automatically reset permissions.
- On-demand screen snapshots select the display under the pointer, exclude Torvi, require a complete frame, and are not saved to disk. They are sent for analysis only on a screen-enabled Ask.
- Native content protection uses the window API with an explicit best-effort notice.
- Compact expanded windows keep recording state, collapse, and all three answer-format controls visible. Low opacity affects the surface, not text opacity.
- The installer checks the version, signs with the existing stable identity, preserves the previous installation, and does not automatically reset macOS permissions. Both the app and capture helper carry the audio-input entitlement.
- Web workspace/navigation and mobile consent changes already present in this worktree are included in the source handoff. They were not deployed during this desktop task.

## Validation

| Check | Result |
| --- | --- |
| Automated test suite | 93 passed, 0 failed; rerun during publication |
| Desktop TypeScript and Vite production build | Passed |
| Optimized Rust/Tauri application build | Passed |
| Swift AVFoundation / ScreenCaptureKit helper compilation | Passed |
| Signature verification | App and helper passed deep/strict validation with the existing stable local signing identity |
| Installed native compact launch, expand/collapse | Observed in the actual app |
| Final-build compact-size recording state and answer-format controls | Observed in the actual app |
| Real text request and AI response | Passed in the installed native app |
| Points / Paragraph / Adaptive response rendering | Observed in the installed native app |
| Screen Recording permission after signed replacement | Native diagnostics reported granted; no automatic TCC reset |
| Built-in microphone → transcription → AI | Observed on floating-03 using the intermediate AVAudioEngine helper; capture then stopped |
| Final AVCaptureSession microphone implementation | Compiled/signed; end-to-end native retest remains pending |
| Bluetooth microphone | Intermediate implementation received no frames from the selected headset. Final implementation replaces that capture path; headset retest remains pending |

The headset disappeared from macOS's input list during testing, and macOS selected its built-in microphone. No system input/output setting was changed by the agent. A synthetic speech playback test could not be completed because the automation player stalled. Do not treat that test as a pass.

Automated component/logic tests are not substitutes for native hardware acceptance.

## Remaining acceptance work

- Retest microphone transcription with the final AVCaptureSession helper, including Bluetooth reconnect and combined microphone/system audio.
- Verify real system-audio speech transcription and screen-context AI end to end on the final build.
- Physically confirm global shortcuts while another app is foreground, cursor drag, full-screen/Spaces, and multi-monitor changes. Prior automated checks and the user's uncertain keyboard result are insufficient to mark these passed.
- Check capture protection against the actual meeting/recording software in use. Modern macOS capture paths may still include protected windows; absolute invisibility is not promised. See the [upstream Tauri issue](https://github.com/tauri-apps/tauri/issues/14200).
- Public distribution needs an Apple Developer ID certificate and notarization. Local-development signing is not equivalent.

## Local artifacts

- Installed application: `/Applications/Torvi.app`
- Compiled signed bundle: `apps/desktop/src-tauri/target/release/bundle/macos/Torvi.app`
- Final local archive: `releases/0.7.0-20260915-floating-04/Torvi-0.7.0-arm64.zip`
- Archive SHA-256: `3b00dbe7edbf405019e5d62f1dee6ab741c1da8cb8cf5c3bc3db2490c90e518d`
- Previous local builds are preserved in `replaced-mac-apps/`.

These app bundles, archives, local credentials, recordings, and application-support data are excluded from Git. The GitHub handoff contains source, tests, configuration, and documentation; it does not deploy the website or publish a binary release.

## Main changed areas

- `apps/desktop/src/main.tsx`, `assistant-overlay.tsx`, `floating-assistant.css`: floating experience, capture lifecycle, and error handling.
- `apps/desktop/src/session-launcher.tsx`, `native-bridge.ts`, `microphone.ts`, `system-audio-bridge.ts`, `shortcuts.ts`, `window-state.ts`: real setup, explicit failures, bounded audio initialization, and window/shortcut management.
- `apps/desktop/src-tauri/src/lib.rs`, `microphone.rs`, `macos.rs`, `desktop_api.rs`: native commands, helper ownership, capture, and request handling.
- `apps/desktop/native/macos/ic-screencapturekit.swift`: native microphone/system capture and filtered one-shot screenshots.
- `apps/desktop/scripts/`, Tauri configuration/capabilities, and build metadata: native packaging and stable signing.
- `tests/desktop-floating-runtime.test.ts` and existing desktop tests: regression coverage.
- Web workspace files, `lib/client-api.ts`, authentication provisioning, and mobile consent: preserved product updates.
