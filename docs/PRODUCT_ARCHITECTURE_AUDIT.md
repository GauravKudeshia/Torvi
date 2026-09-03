# Product architecture audit

Date: 2026-08-24

## Executive assessment

Torvi is an existing multi-surface product, not a prototype shell. The web vertical slice can create grounded sessions, upload and parse documents, verify resume facts, transcribe two browser audio sources through OpenAI Realtime, detect questions, generate source-aware suggestions, save or discard a session, and create reports. The macOS Tauri client now has working ScreenCaptureKit system-audio capture, a separate microphone channel, Realtime transcription, question detection, native window controls, and a secure one-time session handoff. Paddle, RevenueCat normalization, Auth0/Sites identity, D1, R2, privacy operations, and a provider boundary are present at varying levels of completeness.

The largest product limitation is the grounding model. Verified resume facts currently live as JSON arrays on documents and profiles. That representation has no durable experience hierarchy, claim lifecycle, provenance record, sensitivity state, correction history, retrieval score, or reuse history. The current retrieval path ranks document chunks, not verified professional experiences. The next safe architectural step is therefore an additive professional-memory layer, followed by a compatibility bridge that keeps current clients and sessions working.

## Current architecture

### Repository and product surfaces

- Vinext/React web application with Cloudflare-compatible route handlers.
- Tauri 2 desktop renderer in React, Rust commands, and a bundled Swift ScreenCaptureKit helper for macOS.
- Expo React Native companion application with partial Auth0, RevenueCat, foreground microphone, reports, and profile support.
- Shared TypeScript contracts for session, transcript, provider, suggestion, and career-tool schemas.
- D1 through Drizzle for structured state and R2 for user documents.
- OpenAI Responses for suggestions, reports, document extraction, career tools, and vision; OpenAI Realtime client secrets are minted server-side.

### Authentication and authorization

- Sites authenticated-user headers are accepted when present.
- Auth0 access tokens are verified with remote JWKS.
- Desktop uses a session-scoped credential created from the one-time handoff.
- Development-only demo identity is available outside production.
- Existing owned-session and owner-filtered route patterns are reusable. Every new professional-memory route must retain the owner predicate at the database boundary.

### Documents, storage, and grounding

- Upload URLs are HMAC-signed, expiring, single-use tickets.
- R2 stores PDF, DOCX, TXT, and Markdown-compatible text uploads; D1 stores metadata and extracted text.
- Resume extraction returns candidate claims with evidence. A user selects facts, and selected strings are copied into `profiles.verified_facts_json`.
- Supporting documents are retrieved as contextual chunks and cannot establish personal experience under the current prompt policy.
- Raw audio and transient screenshots are not persisted.

### Live session and AI path

1. The server validates identity, ownership, consent, and quota.
2. Two Realtime transcription leases keep interviewer/system and candidate/microphone speakers separate.
3. Finalized transcript turns feed shared question-detection helpers.
4. The suggestion route assembles verified strings, job context, recent turns, and ranked document chunks.
5. A provider-neutral facade selects the enabled OpenAI implementation.
6. Structured output is validated before the final SSE event is emitted.

### Desktop state

The macOS internal alpha has a working native capture path and should be preserved while product intelligence changes. It includes ScreenCaptureKit permission diagnostics and repair, system and microphone meters, WebRTC transcription, automatic question detection, grounded responses, Save/Discard, keyboard shortcuts, compact/docked/expanded layouts, Hide, and Quit. Remaining release work includes stable Developer ID signing, notarization, update delivery, crash reporting, and a repeatable device/reconnect/sleep-wake matrix. Windows native capture remains a placeholder.

### Billing and operations

- Paddle web checkout/portal/webhook flows exist.
- RevenueCat webhook normalization exists for mobile entitlements.
- A unified entitlement and usage ledger is present.
- Structured telemetry and Sentry transport exist, but product-quality and professional-memory metrics are incomplete.

## Reusable components

- `requireActor`, `ownedSession`, API error normalization, rate limits, audit events, and D1 access.
- Signed uploads and the current document extractor.
- Shared question/noise/transcript helpers.
- Source-chunk retrieval and provider registry.
- Strict OpenAI structured-output validation and safety identifiers.
- Session Save/Discard semantics and dual-channel audio infrastructure.
- Existing dashboard, setup wizard, live overlay, reports, and privacy controls.

## Constraints and technical debt

1. `profiles.verified_facts_json` and `documents.verified_facts_json` are denormalized compatibility fields. They cannot express correction, rejection, sensitivity, or per-claim provenance.
2. `job_targets.competencies_json` also stores interviewer and round notes. It is useful compatibility data but not a durable multi-round process model.
3. The suggestion route waits for a complete model response before emitting its single answer as a delta. Progressive cards improve reading order, but true first-token model streaming remains follow-up work.
4. Question detection is deterministic and fast but does not yet model incomplete multi-part turns or record corrections.
5. There is no canonical experience-use ledger, concern ledger, precompiled session brain, or cache invalidation marker.
6. Architecture/status documents contain older desktop status descriptions and need to be kept synchronized with releases.
7. Production signing, notarization, Windows capture, store distribution, and owner-controlled production credentials remain external release gates.

## Risk areas

- Accidentally treating parsed, meeting-derived, inferred, or contextual material as verified autobiography.
- Duplicating claims during retries or repeated document parsing.
- Adding latency by serially running classification, retrieval, and generation.
- Breaking desktop clients by replacing the existing suggestion contract instead of extending it.
- Storing sensitive content in telemetry, crash data, or derived caches.
- Backfilling legacy facts as verified without evidence that the user explicitly approved them.

## Schema migration strategy

Add normalized experience, claim, evidence, communication-profile, process, round, concern, experience-use, and session-brain tables. Keep the legacy JSON columns during migration. Backfill one imported experience per resume document; only documents already marked `verified` may produce verified claims. All other extracted claims remain proposed. New APIs use normalized records, while old routes continue populating compatibility fields until all clients migrate.

## Recommended implementation sequence

1. Add normalized professional-memory records, claim states, knowledge classes, provenance, feature flags, migration, owner-scoped APIs, and a verification control plane.
2. Extend resume extraction so every extracted personal claim is proposed first and carries an experience group and source evidence.
3. Add question classification and ranked verified-experience retrieval, then extend the existing suggestion contract with 5/20/60 output, grounding evidence, evidence-gap recommendations, clarification, follow-ups, and challengeability.
4. Add process/round/concern records and a derived precompiled interview brain with explicit invalidation.
5. Add measured preflight checks and privacy-minimized telemetry without replacing the working macOS capture path.
6. Expose the shared Interview/Meeting mode switch and focused meeting workflow. Meeting-derived memory always enters as proposed.
7. Complete Mac release hardening, then Windows capture and mobile distribution.

## Audit conclusion

The current platform can support the requested product without a rewrite or a new database. The production-oriented path is an additive migration: preserve live capture and session behavior, establish a verified professional-memory source of truth, then make retrieval and answer contracts consume it. This order improves factual safety and product differentiation while minimizing risk to the working macOS alpha.
