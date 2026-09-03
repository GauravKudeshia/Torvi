# AI grounding policy

## Context boundaries

The suggestion pipeline treats input as five separate knowledge classes rather than one prompt blob.

| Class | May be stated autobiographically? | Typical source |
| --- | --- | --- |
| Verified personal fact | Yes, when claim state and personal-use flag allow it | User-confirmed claim |
| Contextual fact | No | Job description, company material, interviewer note |
| General knowledge | No personal attribution | Technical/business knowledge |
| Inference | No | Derived but unconfirmed interpretation |
| Suggestion | No | Possible future action or answer structure |

Uploaded content is untrusted data. It cannot override policy or model instructions.

## Generation contract

The provider must return validated structured data containing:

- question type and whether personal experience is required;
- a 5-second direct answer;
- 20-second supporting points;
- an optional 60-second expanded answer;
- verified claim IDs, contextual source IDs, and unsupported elements;
- one to three categorized follow-ups;
- a recommendation (`answer`, `clarify_first`, `closest_verified_example`, or `general_answer`);
- an optional clarification;
- caution text.

The server—not the model—filters claim IDs against the allowed verified-memory set, filters contextual source IDs against retrieved sources, recomputes grounding and challengeability, and applies evidence-gap behavior. Malformed structured output fails closed.

## Evidence gaps

When personal experience is required and no sufficiently relevant verified claim exists, application logic replaces the personal answer path. The direct card says either “No verified personal example found” or identifies the closest verified experience. Any expanded content is labeled as a general approach, not past history. A clarification remains available for ambiguous questions.

## Challengeability

The internal score considers verified claim coverage, unsupported elements, and the answer recommendation. The UI presents an explained label:

- Strongly supported
- Partially supported
- General answer
- Needs verification

The numeric score is retained for evaluation and is not shown without reasons.

## Provider boundary

OpenAI is the only enabled model provider in this release. Provider-specific request code remains isolated. The grounding contract, ranking, validation, and post-generation enforcement are provider independent so future Gemini, Claude, compatible, or local adapters cannot weaken the factual policy.

## Known limitation

No deterministic text checker can prove that every generated sentence is semantically entailed by its evidence. The current defense combines a closed verified set, strict instructions, claim-ID validation, evidence-gap overrides, regression tests, and user-visible grounding. A dedicated entailment evaluation and larger grounded-fact suite remain release work.
