# Delivery plan and release gates

Legend: `[x]` implemented and validated in the repository; `[~]` partial; `[ ]` not complete.

## Milestone 1 — Research and architecture

- [x] Clean-room artifact inventory and hashes
- [x] Public feature matrix for Verve, Final Round, Cluely, and compatible open-source references
- [x] License boundary; exclude Natively implementation from commercial work
- [x] Tauri/Electron/native/Flutter decision
- [x] System, audio, AI, persistence, privacy, and release architecture

## Milestone 2 — Grounded web vertical slice

- [x] Interview setup asks for resume, role, company, JD, round, interviewer, objective, prior-round notes, and supporting documents
- [x] Verified candidate facts and source-scoped retrieval
- [x] Browser microphone plus explicit tab/window/screen audio capture
- [x] Direct WebRTC Realtime transcription with ephemeral server-minted credentials
- [x] Multilingual transcript cleanup, turn coalescing, noise filtering, dedupe, and manual fallback
- [x] Grounded suggestions with citations, confidence, caution, and Save/Discard
- [x] Reports, career tools, job tracker, pricing, settings, support, privacy, and terms surfaces

## Milestone 3 — Provider boundary

- [x] Server-authoritative provider catalog endpoint
- [x] Provider-neutral suggestion adapter with OpenAI enabled
- [x] Provider capability and availability tests
- [ ] Move report, career, vision, and transcription behind the same boundary
- [ ] Add Gemini/Anthropic/local providers only in the next user-approved phase

## Milestone 4 — macOS desktop alpha

- [x] Tauri overlay layouts, always-on-top, content protection, hide/start/ask hotkeys
- [x] ScreenCaptureKit system-audio helper source
- [~] Native helper build passes with local Command Line Tools; full-Xcode and universal CI validation remain
- [x] Native system and microphone audio energy/health events in the overlay
- [x] WebView microphone adapter with its own speaker-labeled Realtime channel
- [x] Resample/interleave-safe PCM normalization and bounded system-audio queue
- [x] Native PCM → ephemeral Realtime WebRTC data-channel bridge
- [x] One-time, expiring, session-scoped web-to-desktop handoff with macOS Keychain storage
- [x] Live transcript, automatic question detection, and grounded answer rendering in native overlay
- [ ] Device hot-plug, AirPods, permission loss, sleep/resume, and reconnect tests
- [~] Developer diagnostics (system/mic meters and queue drops included; reconnect/device detail panel remains)
- [x] Ad-hoc signed Apple Silicon `.app` internal-alpha archive for end-to-end local testing
- [ ] Signed internal alpha, crash reporting, notarization

## Milestone 5 — Windows beta

- [ ] WASAPI default render endpoint loopback adapter
- [ ] WASAPI default microphone capture adapter
- [ ] Native chunk/health events matching macOS contracts
- [ ] Device enumeration/default-device change recovery
- [ ] Native Realtime bridge and grounded overlay flow
- [ ] Zoom/Meet/Teams/Webex/Bluetooth test matrix
- [ ] Signed NSIS/MSI beta and updater channel

## Milestone 6 — Meeting assistant

- [ ] Live topic, bookmarks, highlights, current-conversation Ask AI
- [ ] Decisions, owners, deadlines, risks, commitments, and open questions
- [ ] Concise/executive/engineering/sales/stand-up/client/interview report formats
- [ ] Searchable saved history and source-aware session Q&A
- [ ] Local-only/incognito session option

## Milestone 7 — Mobile closed beta

- [~] Expo app, Auth0 PKCE/SecureStore, RevenueCat, foreground room coaching, reports/profile
- [ ] Owner service values and native development builds
- [ ] Full mock interview flow and Save/Discard
- [ ] Accessibility, interruption, Bluetooth, background/foreground tests
- [ ] TestFlight and Play closed testing

## Milestone 8 — Production hardening

- [ ] Question-detection F1 ≥ 0.90 in all five launch languages
- [ ] p95 first transcript delta < 800 ms on supported broadband
- [ ] p95 question-to-first-suggestion token < 2 seconds
- [ ] Zero invented resume facts in the grounded regression suite
- [ ] Privacy scan: no audio/screenshots in storage, logs, crashes, analytics, fixtures, or backups
- [ ] 99.9% API availability and 99.5% crash-free live sessions
- [ ] Account export/deletion SLA drill, webhook replay/idempotency, load/security tests
- [ ] 5% → 25% → 100% staged desktop updater rollout

## External owner dependencies

- Apple Developer and macOS Developer ID identities
- Windows Authenticode signing certificate
- Auth0 tenant and four public PKCE clients
- Paddle Billing and RevenueCat production accounts/products/webhooks
- Expo/EAS, App Store Connect, and Google Play accounts
- Production OpenAI project/key and spend/rate-limit policy
- Production domain, support contact, privacy counsel, and final brand/trademark clearance
