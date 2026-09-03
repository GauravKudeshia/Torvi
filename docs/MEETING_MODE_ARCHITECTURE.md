# Meeting Mode architecture

## Scope

Meeting Mode is a focused personal copilot built on the same session, dual-channel audio, transcription, Ask AI, retention, report, document, privacy, and professional-memory infrastructure as Interview Mode. It is not an enterprise meeting bot, CRM, or organization-wide search product.

The global Interview/Meeting switch persists a device-local operating-mode preference and opens the appropriate setup mode. Meeting sessions do not require a resume, though users may attach verified professional context and supporting documents.

## Live behavior

The current web meeting surface provides:

- separate system/interviewer and microphone/candidate transcription;
- live transcript and Ask AI;
- suggested response and clarification behavior;
- explicit Note, Decision, Action item, and Bookmark capture;
- visible capture state;
- Save or Discard;
- session report and follow-up draft.

Captured conversation items are user-owned D1 records and are included in privacy export. Raw audio remains ephemeral.

## Meeting to career memory

On Save, a conservative first-person detector can surface candidate accomplishments as `potential_memory` session captures. They are not claims and are not retrievable by Interview Mode.

The report UI lets the user choose “Add to Career Memory.” That explicit action creates a claim with:

- source type `meeting_session`;
- source ID equal to the meeting session;
- source excerpt retained as provenance;
- verification status `proposed`;
- personal-use permission `false`.

The user must then confirm or correct the claim in Professional Memory. Only after that second explicit verification step can Interview Mode retrieve it autobiographically.

## Remaining focused-MVP work

- Structured meeting summary sections for decisions, my actions, others' actions, and open questions rather than deriving all sections from the generic report schema.
- Editing and ownership/deadline controls for captured action items.
- Desktop-native capture controls and mode switch without a web handoff.
- Higher-quality potential-memory extraction with a user-visible review step and recall/precision evaluation.
