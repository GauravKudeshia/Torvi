# Torvi 0.8.0 — meeting workspace release report

## Architecture and retained systems

Torvi retains the React/Tauri macOS app, Rust desktop bridge, Swift ScreenCaptureKit helper, existing web/API service, Expo/React Native mobile app, shared contracts/SDK/design tokens, authentication, consent, quotas, AI providers and storage. No logo or proprietary Cluely artwork was copied. See `design/implementation-assessment.md` and `design/reference-manifest.md` for the audit and reference mapping.

## Implemented product changes

- Meeting-first desktop Home: primary Start, compact modes, audio readiness, existing upcoming rounds, chronological searchable activity.
- Compact floating assistant: first-class Assist, expandable response, Points/Paragraph/Adaptive, restrained dark surfaces, freeform composer, secondary actions and session controls. Response scrolling keeps the composer accessible.
- Full live transcript workspace: speaker/time labels, search, pause/resume, explicit follow-latest and End & save.
- One meeting-detail destination: title editing, summary, transcript, AI history, captures, actions and export. Unsupported calendar sync has an honest empty state.
- Mobile Notes home, focused foreground recording, Chat/Transcript, speech-activity indication, pause/resume, save/discard, history search, title editing and native sharing.
- Shared meeting adapters, recording state transitions, semantic dark/light tokens and bounded requests.

## Save-at-end AI history

Completed answers remain in client memory until the user chooses Save. Both native clients submit validated AI history to the existing save endpoint. The server authorizes the session first, stores session-scoped idempotent rows, and acknowledges the count. Clients retain their retry state if acknowledgement is absent. Discard does not upload these answers. This is a backward-compatible API extension without a database migration; old transcript-only clients still work. Client-restored answers are history, not newly verified evidence or approved career memory.

## macOS and Windows

The macOS app is version 0.8.0, build `20260927-meeting01`. The renderer and Rust app compile successfully. Signing uses the existing Torvi Local Development identity; this is a local test build, not an Apple-notarized public distribution. A rollback copy is preserved when replacing the installed app.

Windows shares the UI, meeting model and platform-aware shortcut labels. Windows system-audio support and hardware QA remain separate; no Windows installer was produced on this Mac.

## Mobile release boundary

The UI and recording logic are implemented, but an installable mobile release requires the owner's real Expo project and Auth0 native-client configuration. EAS profiles and environment-driven public config are included. Release profiles reject missing settings. See `docs/MOBILE_RELEASE.md`. No store submission, paid cloud build, or new account was created.

## Verification

- 106 automated tests passed, including new meeting states, chronology, components, contrast, exports, API adapters and saved-history validation/acknowledgement.
- Root, desktop and mobile TypeScript checks passed.
- Desktop production renderer and macOS native bundle built successfully.
- Signature verification confirms the same stable identity as the previous installed Torvi.
- Prior visual QA used actual desktop components in a clearly labeled development fixture: Home populated/empty/search/modes, compact/expanded assistant, loading/error/retry, answer formats, overflow menu, transcript pause/search, history rename/summary/transcript/chat, narrow and desktop layouts. The fixture is not in the production renderer bundle.
- Mobile release-config check deliberately fails on the existing missing account settings; this is a release guard, not a successful device test.

## Remaining acceptance work

- Real iOS/Android device recording, keyboard, sharing, accessibility and network-interruption QA.
- Live macOS microphone/system-audio, physical global shortcut, Spaces and multimonitor acceptance after install. Automated component checks are not substitutes for these.
- Apple Developer ID signing/notarization for public Mac distribution.
- Calendar integration and actual participant identities are not fabricated; existing interview-round metadata is reused.
- Failed mobile saves survive only while the app remains open; an encrypted offline outbox is not implemented.
- Existing notes are read-only where the API provides no note-edit endpoint. Mobile AI answers arrive after the streamed request completes, not token by token.
- The existing backend still requires a target context; generic mobile meetings create a Personal workspace context through the existing adapter.

## Main files

Desktop: `main.tsx`, `control-center.tsx`, `assistant-overlay.tsx`, `meeting-home.tsx`, `live-transcript.tsx`, `session-history.tsx` and related styles under `apps/desktop/src`; native finish bridge under `apps/desktop/src-tauri/src/desktop_api.rs`.

Mobile: `apps/mobile/App.tsx`, `src/{auth,notes-home,live-session,meeting-detail,use-meeting-session,ui}`, `app.config.ts`, `eas.json`.

Shared/service: `packages/{contracts,sdk,design-tokens}/src`, `app/api/v1/sessions/[id]/save/route.ts`; tests: `meeting-experience.test.ts`, `session-save-history.test.ts`, updated desktop experience checks.

This report distinguishes implemented source and successful local builds from external account setup and device acceptance. It does not certify all platform release criteria as complete.
