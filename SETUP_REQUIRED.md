# External setup required

No credential is hard-coded. The hosted environment may already provide some of these values; local and standalone deployments must configure them explicitly.

| Service | Why | What to create | Environment variables | Tier | Status |
|---|---|---|---|---|---|
| OpenAI API | Streamed answers, structured summaries, screen analysis, document extraction, and realtime transcription | An API project and restricted server key | `OPENAI_API_KEY` plus optional model overrides | Usage-based; credits/billing required | Required for AI features |
| Cloudflare D1 | Users, sessions, preferences, transcripts selected for saving, reports, and audit records | A D1 database bound as `DB` | Binding in `.openai/hosting.json` or worker configuration | Free tier available | Required for the full app |
| Cloudflare R2 | Private uploaded resumes, briefs, and other context documents | An R2 bucket bound as `FILES` | Binding in `.openai/hosting.json` or worker configuration | Free allowance available | Required for document upload |
| Sites hosting/auth | Hosting, deployment revisions, and authenticated-user headers for the current hosted build | A Sites project | Managed by `.openai/hosting.json` | Platform-dependent | Required for the supplied hosted deployment |
| Auth0 | OIDC/PKCE authentication for standalone web, desktop, and mobile distributions | Tenant, API audience, and native/public clients | `AUTH0_ISSUER_BASE_URL`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID` | Free tier available | Optional on Sites; required standalone |
| Paddle Billing | Web subscriptions and webhook-based entitlements | Sandbox/production account, products, prices, webhook | `PADDLE_*` variables in `.env.example` | Sandbox free; production fees apply | Optional until paid plans launch |
| RevenueCat | Mobile entitlement normalization | Project, apps, entitlements, webhook secret | `REVENUECAT_WEBHOOK_AUTH` | Free tier available | Optional until mobile billing launches |
| Sentry / OpenTelemetry | Privacy-safe error and performance monitoring | Project/collector endpoint | `SENTRY_*`, `OTEL_EXPORTER_OTLP_ENDPOINT` | Free tiers available | Optional |
| Apple Developer | Signing, notarization, and distribution of the native macOS app | Apple Developer account, Developer ID certificate, notarization profile | Configured in the release environment, never in source | Paid annual account | Required only for public signed Mac release |

## Production secrets

Generate strong, independent random values for `UPLOAD_SIGNING_SECRET`, `DESKTOP_TOKEN_SIGNING_SECRET`, and `DELETION_CRON_SECRET`. Store them in the hosting secret manager. Do not place production values in `.env.local`, commit history, desktop resources, or client-visible variables.

## Local fallback behavior

- With `ALLOW_DEMO_AUTH=1`, non-production builds create a local demo actor.
- Missing OpenAI configuration returns a clear `ai_not_configured` error while navigation, settings, context management, and empty states remain usable.
- Billing providers are isolated behind API routes; free-plan behavior works without Paddle or RevenueCat.
- Browser microphone/system-audio availability is detected at runtime and the interface explains blocked, missing, silent, connecting, paused, and disconnected states.
