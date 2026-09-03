# Security and privacy model

## Trust boundaries

- Public clients receive Auth0 authorization codes through PKCE; they never receive infrastructure secrets.
- The API verifies issuer, audience, ownership, consent, quota, rate limit, and request schema before creating an OpenAI realtime lease.
- OpenAI calls use a hashed safety identifier and response storage disabled.
- D1 stores only finalized transcript segments for an explicitly saved session.
- R2 stores user-uploaded documents and generated exports. Object keys are owner-scoped.
- Signed upload tickets expire after ten minutes and are single-use.
- Paddle and RevenueCat webhook signatures are verified before the normalized entitlement is changed.

## Forbidden data paths

Raw audio and transient screenshots may not be written to D1, R2, logs, analytics, Sentry, backups, test fixtures, or exports. Screen analysis accepts a single image in memory, sends it with response storage disabled, and discards it before returning. Logs filter sensitive field names.

## Abuse boundary

The product requires consent and prohibits covert recording, assessment circumvention, impersonation, process hiding, and claims of being undetectable. Desktop capture exclusion is a best-effort window privacy feature, not an evasion feature.

## Operational controls

Rotate service keys, use separate development and production OpenAI projects, scope Cloudflare bindings per environment, enforce least-privilege Auth0 clients, protect deletion cron credentials, redact provider errors, and alert on quota anomalies, webhook failures, repeated permission loss, and elevated AI error rates.
