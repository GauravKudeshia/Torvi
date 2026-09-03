# Mac developer build

Version 0.6.1 removes the repeated system-audio permission loop. **Grant system audio** now only requests access; it never resets TCC automatically because resetting by bundle identifier erases the grant for every installed Torvi/legacy build that shares `com.interviewcopilot.desktop`. **Reset permission record** remains an explicit advanced recovery action and should be used only once for a genuinely stale entry. The app also identifies builds launched outside `/Applications` and tells the tester to keep one unchanged copy at the fixed install path.

Version 0.2.9 introduced the historical permission-repair action. Its old description claimed the `tccutil reset ScreenCapture com.interviewcopilot.desktop` call affected only the current app. That was incorrect: macOS scopes this reset to the bundle identifier, so it can affect another installed build using the same identifier. SHA-256 for the historical 0.2.9 archive: `212013d1f16b684cf6ea589b7150c9c357f1f49a3ef55fc221ec8fb23400e015`.

Version 0.2.8 removes the stale-process permission loop. After one explicit Grant attempt, the app always transitions to **Restart Torvi**, because a process that was already open when the System Settings toggle changed cannot reliably verify the new TCC state. The restart action now performs a real Tauri process restart instead of only quitting. SHA-256 for the historical 0.2.8 archive: `eaa3387c3895ab5f02eccbfee13bc8cfebe19dcf75444e8caf553fc8db9c26a3`.

Version 0.2.7 fixes the frameless overlay controls. The non-interactive header starts native Tauri window dragging, interactive buttons are excluded from the drag hit area, and the capability manifest now permits `hide` and `start_dragging`. A hidden window is restored and focused when the user clicks the Dock icon. The existing native Quit path is unchanged.

The generated `Interview-Copilot-Mac-arm64-internal-alpha-v0.2.7.zip` is an earlier Apple Silicon diagnostic build. SHA-256: `c02c35e265b17b8cd44207cb47b91b864745bb424529dd00c1b6019f99a5ca91`.

Version 0.2.6 introduces an explicit macOS permission and capture state machine. A passive status check never opens a prompt. Only **Grant system audio** calls `CGRequestScreenCaptureAccess`; a successful first grant moves the UI to **Restart required**. After relaunch, the app checks `CGPreflightScreenCaptureAccess`, initializes `SCShareableContent`, creates and starts `SCStream`, then waits for a native `ready` event before showing capture as running.

The generated `Interview-Copilot-Mac-arm64-internal-alpha-v0.2.6.zip` is an Apple Silicon diagnostic build. SHA-256: `f52a1dc65cb82904b2c16f554d1a59b045bfa98324cf18a2c0e4a0c59183054a`. It is ad-hoc signed because no Apple or stable local signing identity is currently installed on the build Mac. A single unchanged copy can be granted access for testing, but permission persistence across the next build must not be claimed until the stable-signing steps below have been completed.

## Confirmed cause of repeated permission and Keychain prompts

Previous internal archives were ad-hoc signed. Their designated requirement was only a build-specific CDHash:

```text
Signature=adhoc
TeamIdentifier=not set
designated => cdhash H"…"
```

That identity changes whenever the binary is rebuilt. macOS TCC can therefore orphan the previous Screen & System Audio Recording grant, and Keychain can stop recognizing the rebuilt executable as the app that created the saved session item. A stable bundle identifier does not compensate for an unstable signing requirement.

Production builds must use the product owner's `Developer ID Application` certificate and notarization. Local permission-lifecycle testing can use the included stable self-signed identity on one Mac.

## One-time local signing setup

The setup changes the user's login Keychain and trust settings, so run it deliberately from a terminal:

```bash
cd apps/desktop
pnpm macos:signing:setup
```

Enter the normal Mac login password when the script asks. Do not give that password to the application. The script creates `Torvi Local Development`, restricts private-key access to codesigning tools, and never stores the password.

Build and sign the app:

```bash
pnpm native:prepare
pnpm tauri build --bundles app
pnpm macos:sign "src-tauri/target/release/bundle/macos/Torvi.app"
pnpm macos:signing:verify "src-tauri/target/release/bundle/macos/Torvi.app"
```

Copy the same signed app to a fixed path before granting access:

```bash
ditto "src-tauri/target/release/bundle/macos/Torvi.app" "/Applications/Torvi.app"
open "/Applications/Torvi.app"
```

Do not replace it with an ad-hoc build between permission tests.

## Correct first-run flow

1. Open the stably signed app from `/Applications`.
2. Connect or prepare the interview session.
3. The System audio card performs a silent permission check.
4. If it says **Permission required**, press **Grant system audio** once and approve the visible macOS dialog. Do not use **Reset permission record** during a normal first run.
5. When the card says **Restart required**, press **Restart Torvi**.
6. The card should now say **Ready**. Press **Start Torvi**.
7. The state moves through **Starting** to **Waiting for sound** only after ScreenCaptureKit reports its stream is running.
8. Play a spoken YouTube video in Chrome. The meter should move and the card should say **Sound detected** before transcription begins.

Returning from System Settings triggers another silent check. Pressing Start while access is missing will not request permission again.

## Diagnostic evidence

Expand **System audio diagnostics** in the overlay. It reports:

- bundle identifier, app/build version, executable path, and macOS build;
- CoreGraphics preflight result and whether this process initiated a request;
- signing identity, Team ID, CDHash, designated requirement, and whether the requirement is stable;
- the last completed stage: permission check, shareable-content retrieval, stream creation, stream start, or first audio chunk;
- the local structured-log path.

The local log stores no PCM, transcript, token, document, screenshot, or interview content. A `first-audio-chunk` record contains only sample rate, channel count, frame count, and `audioRetained: false`.

Failures remain separate:

| State/category | Meaning | Action |
| --- | --- | --- |
| `permissionRequired` | CoreGraphics preflight is false or ScreenCaptureKit returned user-declined (`-3801`) | Grant once, then relaunch |
| `restartRequired` | The current process initiated a successful grant | Quit completely and reopen the same signed app |
| `signing-or-entitlement` | ScreenCaptureKit returned missing entitlements (`-3803`) | Verify nested helper and app signatures |
| `audio-pipeline` | ScreenCaptureKit could not start audio (`-3818`) | Check output device, hot-plug state, and retry |
| `capture-timeout` / `capture` | Permission passed but content/stream startup failed | Inspect stage/domain/code in the log |
| Running with no `first-audio-chunk` | Stream started but macOS produced no samples | Confirm audible output and selected device |
| Audio detected but no transcript | Native capture works; Realtime/WebRTC failed later | Inspect network/API status, not TCC |

## Production boundary

The local self-signed identity is not distributable and will not satisfy Gatekeeper on another person's Mac. Public release remains gated on:

- `Developer ID Application` signing with a stable Team ID;
- nested helper signing before the outer app;
- hardened runtime and final entitlements;
- Apple notarization and ticket stapling;
- signing the final updater artifact with the same identity;
- two-build TCC and Keychain persistence testing on a clean Mac user account.

Raw audio remains ephemeral and is never written to storage.
