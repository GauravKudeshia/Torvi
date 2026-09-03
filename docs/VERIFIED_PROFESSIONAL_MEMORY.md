# Verified Professional Memory

## Product invariant

A model may phrase a claim as the user's personal history only when all three conditions are true:

1. `knowledge_class = VERIFIED_PERSONAL_FACT`;
2. `verification_status` is `verified` or `corrected`;
3. `allowed_as_personal_experience = true`.

Parsed documents, meeting candidates, mock-interview content, inferences, suggestions, job descriptions, and supporting documents do not satisfy this invariant by default.

## Data model

`professional_experiences` groups career context and reusable interview evidence. Structured list fields remain JSON where they are bounded attributes of one experience. Meaningful autobiographical statements are normalized into `professional_claims`. `claim_evidence` preserves source type, source record, excerpt/location, and confidence.

Claim states:

- `proposed`: extracted or suggested and awaiting the user.
- `verified`: confirmed without modification.
- `corrected`: edited and confirmed by the user.
- `rejected`: explicitly denied and never eligible for autobiographical retrieval.
- `unsupported`: plausible but currently lacking acceptable evidence.

Knowledge classes:

- `VERIFIED_PERSONAL_FACT`
- `CONTEXTUAL_FACT`
- `GENERAL_KNOWLEDGE`
- `INFERENCE`
- `SUGGESTION`

Source types retain the origin across resume, supporting document, user entry, mock interview, interview session, meeting session, and imported note workflows.

## Ingestion and verification

Resume extraction now returns an experience group, claim type, source evidence, technologies, competencies, and extraction confidence. Every new resume claim is persisted as proposed. The existing resume checkbox approval route also confirms the corresponding normalized claims for compatibility.

The Professional Memory page supports:

- Confirm
- Correct inline
- Reject
- Mark private
- Delete permanently
- Confirm high-confidence, low-risk claims in bulk
- Add a user-entered real experience
- Filter by verification state
- Inspect provenance excerpts

Metrics, outcomes, and leadership claims are excluded from bulk low-risk confirmation even when extraction confidence is high.

## Compatibility and migration

Migration `0005_verified_professional_memory.sql` is additive. Legacy JSON fields remain available to older clients. Each legacy resume receives one imported experience. A legacy document creates verified claims only when its prior `parse_status` was already `verified`; all other legacy claims are proposed. The migration does not infer truth.

## API surface

- `GET/POST /api/v1/memory`
- `PATCH/DELETE /api/v1/memory/claims/{id}`
- `POST /api/v1/memory/coverage`
- `GET/PATCH /api/v1/memory/communication-profile`
- `GET /api/v1/feature-flags`

Every route authenticates the actor and applies the user ID in the database predicate. Claim changes invalidate derived session brains. Account export includes experiences, claims, evidence, communication preferences, processes, rounds, concerns, and meeting captures. Account deletion cascades through user-owned D1 records.

## Retrieval

The ranker is a provider-independent domain function. It considers question token relevance, role/company context, competency match, evidence confidence, measurable outcomes, recency, user preference, current-session reuse, and prior-round reuse. Proposed, rejected, unsupported, inferred, contextual, and suggestion records are removed before scoring.

The current semantic layer is deterministic lexical/metadata ranking. The abstraction is intentionally separate so embeddings or learned reranking can be added later without changing grounding policy.

## Privacy

Private/sensitive claims remain inside the authenticated account and are included only in user-authorized session context. Raw audio and screenshots are not professional-memory evidence. Meeting-derived material is never promoted directly to verified personal history.
