# Interview memory architecture

## Hierarchy

`InterviewProcess → InterviewRound → Session → Transcript/Suggestions → ExperienceUses → RoundConcerns`

An active process is reused for the same job target. Starting a session creates a round and links it to the session. The existing target metadata remains a compatibility source for interviewer, round name, objective, and prior notes.

## Experience-use memory

Every grounded suggestion records the verified claim and experience IDs it used, the session/round, and a non-content question fingerprint. Retrieval penalizes stories already used in the live session. The next-round brief uses the same ledger to distinguish discussed and unused experiences.

## Concern ledger

When an interview session is saved, deterministic debrief logic proposes concerns for explicit knowledge gaps, unclear ownership, weak metrics, and repeated probes. Concerns begin as `proposed`; users can confirm, edit, or dismiss them. They are not treated as facts merely because a detector emitted them.

## Next-round briefing

`GET /api/v1/interview-processes/{id}/brief` assembles:

- what prior round summaries say;
- experiences already discussed;
- active concerns;
- verified experiences to prioritize;
- stories not yet used;
- evidence coverage gaps;
- concern-driven preparation prompts.

The first version is deterministic and source-based. A future model-generated narrative may format the brief, but it must consume this structured record rather than raw transcript alone.

## Precompiled interview brain

Session creation compiles a 24-hour D1 cache containing target context, allowed verified-memory candidates, evidence coverage, open concerns, and likely questions. Retrieval reads this cache before canonical memory. The cache stores a source-version digest and is deleted when professional memory changes. Missing, expired, or malformed caches fall back to canonical D1 records and can be rebuilt.

## Remaining work

- Rich opportunity UI and explicit round scheduling.
- Model-assisted concern extraction with the same proposed-state boundary.
- Prior-round contradiction detection.
- User preference for story reuse and experience prioritization.
- Evaluation of brief usefulness and next-round return rate.
