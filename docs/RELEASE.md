# Release runbook

## Quality gates

- Unit, contract, migration, mocked-provider, webhook, native integration, end-to-end, accessibility, load, and security suites are green.
- Multilingual evals meet question-detection F1 at least 0.90, p95 transcript delta under 800 ms, p95 question-to-first-suggestion token under 2 seconds, and zero invented facts in the grounded suite.
- macOS 13+ is checked on Intel and Apple Silicon; Windows 11 on x64; iOS 17+; Android 12+; current Safari, Chrome, and Edge.
- Zoom, Meet, Teams, Webex, browser interviews, Bluetooth switching, hot-plug, denial, sleep/resume, reconnect, echo, and quota exhaustion are exercised.
- Privacy scan confirms no audio or screenshots in persistence, logs, analytics, crashes, exports, or backups.

## Signing

Compile the macOS ScreenCaptureKit helper as a hardened child executable, embed it in the Tauri bundle, sign nested code first, sign the app with the same stable Developer ID identity used by every update, submit for notarization, and staple the ticket. The designated requirement must not be a build-specific `cdhash`; ad-hoc builds are invalid for TCC/Keychain persistence tests. Sign Windows MSI/NSIS artifacts and updater manifests with the owner's certificate. Never use placeholder updater keys in a release build.

## Staged rollout

1. Internal macOS alpha.
2. Mac/Windows beta.
3. TestFlight and Play closed beta.
4. Desktop updater at 5%; hold for crash-free and latency gates.
5. Increase to 25%, then 100%.
6. Public mobile stores after review.

Promote only while API availability is at least 99.9% and crash-free live sessions are at least 99.5%. Roll back updater manifests immediately on privacy, quota, auth, or capture regressions.
